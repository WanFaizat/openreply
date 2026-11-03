#!/usr/bin/env bash
# Start (or restart) OpenReply inside a GitHub Codespace: the databases, the web
# app and the worker that sends the DMs.
#
#   bash scripts/codespace-start.sh          # start or restart everything
#   bash scripts/codespace-start.sh --build  # rebuild the web app first
#
# A Codespace stops when it has been idle, and nothing starts by itself when it
# wakes up. Run this again after every wake-up. For always-on use, move OpenReply
# to a host that does not sleep (see docs/setup.md).
set -u
cd "$(dirname "$0")/.."

LOG_DIR="${TMPDIR:-/tmp}"

echo "1/4 Pangkalan data dan Redis"
if ! docker start openreply-postgres-1 openreply-redis-1 >/dev/null 2>&1; then
  docker compose up -d postgres redis
fi
docker start openreply-mailpit >/dev/null 2>&1 || true

# Wait until Postgres accepts connections.
for _ in $(seq 1 20); do
  if docker exec openreply-postgres-1 pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [ "${1:-}" = "--build" ] || [ ! -d .next ]; then
  echo "2/4 Binaan web app (beberapa minit)"
  npm run build >"$LOG_DIR/openreply-build.log" 2>&1 || {
    echo "Binaan gagal. Lihat $LOG_DIR/openreply-build.log"
    tail -20 "$LOG_DIR/openreply-build.log"
    exit 1
  }
else
  echo "2/4 Binaan sedia ada digunakan (guna --build untuk bina semula)"
fi

echo "3/4 Hentikan proses lama"
pkill -f "next-server" 2>/dev/null || true
pkill -f "worker/dm-worker.ts" 2>/dev/null || true
sleep 2

echo "4/4 Hidupkan web app dan worker"
setsid nohup npm start >"$LOG_DIR/openreply-web.log" 2>&1 </dev/null &
setsid nohup npx tsx --env-file=.env worker/dm-worker.ts \
  >"$LOG_DIR/openreply-worker.log" 2>&1 </dev/null &
sleep 12

echo
echo "--- web:";    tail -3 "$LOG_DIR/openreply-web.log"
echo "--- worker:"; tail -3 "$LOG_DIR/openreply-worker.log" | cut -c1-160
if ss -ltn 2>/dev/null | grep -q ':3000 '; then
  echo "Port 3000 hidup."
else
  echo "Port 3000 belum hidup. Semak $LOG_DIR/openreply-web.log"
fi
echo "Ingat: port 3000 mesti Public dalam tab Ports supaya Meta boleh menghubungi webhook."
