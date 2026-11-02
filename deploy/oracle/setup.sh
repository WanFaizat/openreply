#!/usr/bin/env bash
# Pasang OpenReply pada pelayan Ubuntu baharu (Oracle Cloud Always Free atau mana-mana VPS).
#
# Jalankan sebagai pengguna biasa (ubuntu), bukan root:
#
#   curl -fsSL https://raw.githubusercontent.com/WanFaizat/openreply/main/deploy/oracle/setup.sh -o setup.sh
#   bash setup.sh
#
# Pilihan: letak salinan fail .env dari Codespace di ~/openreply.env sebelum menjalankan,
# supaya kunci Meta, emel dan token webhook yang sama digunakan semula. Kalau tiada,
# skrip ini bertanya hanya apa yang perlu. Rahsia yang ditaip tidak dipaparkan di skrin.
#
# Skrip ini selamat dijalankan berulang kali.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/WanFaizat/openreply.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-$HOME/openreply}"
SEED_ENV="${SEED_ENV:-$HOME/openreply.env}"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\nRALAT: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Jalankan sebagai pengguna biasa (contoh: ubuntu), bukan root."
[ -r /dev/tty ] || die "Skrip ini perlu terminal interaktif untuk bertanya soalan."

# --------------------------------------------------------------------------
step "1/7 Pakej asas"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
sudo apt-get install -y ca-certificates curl git openssl iptables-persistent

# --------------------------------------------------------------------------
step "2/7 Ruang swap 2 GB (supaya binaan tidak kehabisan memori)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "Swap sudah ada."
fi

# --------------------------------------------------------------------------
step "3/7 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker >/dev/null 2>&1 || true
sudo usermod -aG docker "$USER" || true

# --------------------------------------------------------------------------
step "4/7 Buka port 80 dan 443 pada firewall pelayan"
# Imej Ubuntu Oracle menyekat semua port kecuali SSH. Peraturan ini dimasukkan di
# atas senarai dan disimpan supaya kekal selepas pelayan dihidupkan semula.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
sudo netfilter-persistent save >/dev/null
echo "Port 80 dan 443 dibuka. Ingat: port yang sama juga mesti dibuka dalam Security List Oracle."

# --------------------------------------------------------------------------
step "5/7 Muat turun kod"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR/deploy/oracle"

# --------------------------------------------------------------------------
step "6/7 Tetapan (.env)"
ENV_FILE=".env"

get_kv() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true
}

set_kv() {
  local tmp
  tmp="$(mktemp)"
  { [ -f "$ENV_FILE" ] && grep -v -E "^$1=" "$ENV_FILE"; } >"$tmp" || true
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

# Nilai contoh daripada .env.example yang mesti diganti.
is_placeholder() {
  case "$1" in
    ""|replace-with-*|your-*|re_...|0123456789abcdef*|*"@example.com"*|*"you@example"*) return 0 ;;
    *) return 1 ;;
  esac
}

ask() { # kunci "soalan" [secret]
  local cur answer
  cur="$(get_kv "$1")"
  if ! is_placeholder "$cur"; then return 0; fi
  if [ "${3:-}" = "secret" ]; then
    read -r -s -p "$2: " answer </dev/tty
    echo
  else
    read -r -p "$2: " answer </dev/tty
  fi
  [ -n "$answer" ] || die "Nilai untuk $1 diperlukan."
  set_kv "$1" "$answer"
}

random_if_placeholder() { # kunci bait
  if is_placeholder "$(get_kv "$1")"; then
    set_kv "$1" "$(openssl rand -hex "$2")"
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$SEED_ENV" ]; then
    cp "$SEED_ENV" "$ENV_FILE"
    echo "Menggunakan tetapan daripada $SEED_ENV"
  else
    cp ../../.env.example "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
fi

# Alamat laman. Tanpa domain sendiri, sslip.io memberi nama percuma berdasarkan IP
# dan Caddy mendapatkan sijil HTTPS secara automatik.
PUBLIC_IP="$(curl -fsS https://api.ipify.org || true)"
DEFAULT_HOST=""
[ -z "$PUBLIC_IP" ] || DEFAULT_HOST="${PUBLIC_IP//./-}.sslip.io"
HOST="$(get_kv SITE_ADDRESS)"
if [ -z "$HOST" ]; then
  read -r -p "Alamat laman [${DEFAULT_HOST}] (Enter untuk guna alamat ini, atau taip domain anda): " HOST </dev/tty
  HOST="${HOST:-$DEFAULT_HOST}"
fi
[ -n "$HOST" ] || die "Alamat laman diperlukan."
set_kv SITE_ADDRESS "$HOST"
set_kv NEXTAUTH_URL "https://$HOST"

# Pangkalan data dan Redis berada dalam pelayan yang sama, tidak dibuka ke internet.
PGPASS="$(get_kv POSTGRES_PASSWORD)"
if [ -z "$PGPASS" ]; then
  PGPASS="$(openssl rand -hex 24)"
  set_kv POSTGRES_PASSWORD "$PGPASS"
fi
set_kv DATABASE_URL "postgresql://openreply:${PGPASS}@postgres:5432/openreply"
set_kv REDIS_URL "redis://redis:6379"

random_if_placeholder NEXTAUTH_SECRET 32
random_if_placeholder CRON_SECRET 32
random_if_placeholder ENCRYPTION_KEY 32   # 64 aksara heks

ask FACEBOOK_APP_SECRET "Meta App Secret (App settings > Basic)" secret
if [ -z "$(get_kv EMAIL_SERVER)" ]; then
  ask RESEND_API_KEY "Kunci Resend untuk emel log masuk" secret
  ask EMAIL_FROM "Emel penghantar log masuk (contoh: WanFaizat <login@domain-anda.com>)"
fi
ask ALLOWED_EMAILS "Emel anda yang dibenarkan log masuk ke dashboard"

if is_placeholder "$(get_kv WEBHOOK_VERIFY_TOKEN)"; then
  set_kv WEBHOOK_VERIFY_TOKEN "$(openssl rand -hex 16)"
  echo "Token webhook baharu dijana. Anda perlu memasukkannya dalam tetapan webhook Meta."
fi

# --------------------------------------------------------------------------
step "7/7 Bina dan hidupkan (kali pertama ambil 10 hingga 20 minit)"
sudo docker compose up -d --build

# Sandaran pangkalan data setiap malam, simpan 14 hari.
cat >"$HOME/openreply-backup.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/backups"
cd "$APP_DIR/deploy/oracle"
sudo docker compose exec -T postgres pg_dump -U openreply openreply | gzip > "$HOME/backups/openreply-\$(date +%F).sql.gz"
find "$HOME/backups" -name 'openreply-*.sql.gz' -mtime +14 -delete
EOF
chmod +x "$HOME/openreply-backup.sh"
{ crontab -l 2>/dev/null | grep -v 'openreply-backup.sh' || true; echo "0 3 * * * $HOME/openreply-backup.sh"; } | crontab -

echo
echo "Menunggu laman hidup (sijil HTTPS mengambil seminit dua)..."
ok=""
for _ in $(seq 1 40); do
  if curl -fsS -m 10 -o /dev/null "https://$HOST/"; then ok=1; break; fi
  sleep 10
done

echo
if [ -n "$ok" ]; then
  echo "SIAP. OpenReply hidup di: https://$HOST"
else
  echo "Laman belum menjawab. Semak: sudo docker compose -f $APP_DIR/deploy/oracle/docker-compose.yml logs --tail 50"
  echo "Pastikan port 80 dan 443 dibuka dalam Security List Oracle."
fi
echo
echo "Masukkan alamat ini dalam Meta (Use cases > Instagram API):"
echo "  Callback URL webhook : https://$HOST/api/webhook"
echo "  Redirect URL log masuk: https://$HOST/api/instagram/callback"
echo "Sandaran harian: $HOME/backups. Kemas kini kemudian: bash $APP_DIR/deploy/oracle/update.sh"
