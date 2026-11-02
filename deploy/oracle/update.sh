#!/usr/bin/env bash
# Kemas kini OpenReply pada pelayan kepada kod terbaru dan hidupkan semula.
#   bash ~/openreply/deploy/oracle/update.sh
set -euo pipefail
cd "$(dirname "$0")"
git -C ../.. pull --ff-only
sudo docker compose up -d --build
sudo docker image prune -f >/dev/null
sudo docker compose ps
