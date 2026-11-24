#!/usr/bin/env bash
# Lingkungan dev ELGOS per git worktree. Jalankan dari dalam worktree mana pun:
#   deploy/dev-worktree/dev.sh up [--local]   build + jalankan; tanpa --local juga membuka URL publik
#   deploy/dev-worktree/dev.sh url            cetak URL lokal + publik
#   deploy/dev-worktree/dev.sh logs [svc]     ikuti log
#   deploy/dev-worktree/dev.sh down [--purge] hentikan (--purge = hapus DB + state worktree ini)
#   deploy/dev-worktree/dev.sh ls             daftar semua dev worktree di host ini
# State per worktree di <worktree>/.elgos-dev/ (diabaikan git): .env berisi secret acak + port.
# Slug dari nama branch, jadi tiap thread (branch/worktree sendiri) dapat stack terpisah.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE="$(git -C "$HERE" rev-parse --show-toplevel)"
BRANCH="$(git -C "$WORKTREE" rev-parse --abbrev-ref HEAD)"
SLUG="$(printf '%s' "${DEV_SLUG:-$BRANCH}" | tr '[:upper:]' '[:lower:]' | sed -E 's#^(claude|feat|fix)/##; s/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-40)"
PROJECT="elgos-dev-${SLUG:-main}"
STATE="$WORKTREE/.elgos-dev"
export WORKTREE DEV_ENV_FILE="$STATE/.env"

# Di host staging/prod (etavm2) dev wajib memakai Docker rootless milik elgos-dev, bukan daemon utama,
# agar container dev tidak bisa menjangkau container dan data produksi.
if [ -d /srv/elgos-prod ] && [ "${DEV_ALLOW_ROOTFUL:-0}" != 1 ] \
   && ! docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q rootless; then
  echo "Di etavm2 jalankan dev sebagai user elgos-dev (Docker rootless): sudo -iu elgos-dev" >&2
  exit 1
fi

dc() { docker compose -p "$PROJECT" -f "$HERE/docker-compose.yml" --env-file "$DEV_ENV_FILE" "$@"; }
envval() { sed -n "s/^$1=//p" "$DEV_ENV_FILE" | tail -1; }

free_port() {
  local p
  for p in $(seq 8200 8399); do
    if ! (ss -Htln 2>/dev/null || netstat -tln 2>/dev/null) | grep -qE "[:.]$p\b"; then
      # hindari port yang sudah dipesan worktree lain yang sedang mati
      if ! docker ps -a --format '{{.Ports}}' | grep -q "127.0.0.1:$p->"; then echo "$p"; return; fi
    fi
  done
  echo "Tidak ada port bebas di 8200-8399" >&2; return 1
}

# EM-LTI: kunci RSA platform (PEM PKCS#8, base64 satu baris). Tetap per worktree: tool LTI meng-cache JWKS.
lti_key() { openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null | base64 | tr -d '\n'; }

init_state() {
  mkdir -p "$STATE"
  if [ ! -f "$DEV_ENV_FILE" ]; then
    umask 077
    cat > "$DEV_ENV_FILE" <<ENV
# Dibuat dev.sh untuk $PROJECT ($(date -u +%F)). Data sintetis saja.
WEB_PORT=$(free_port)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
EWI_JWT_SECRET=$(openssl rand -hex 48)
EWI_LOCAL_MASTER_KEY=$(openssl rand -hex 32)
TENANT_KEY_LOCAL_MASTER=$(openssl rand -base64 32)
DEV_SEED_PASSWORD=$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | cut -c1-14)Aa1
ELGOS_LTI_PRIVATE_KEY=$(lti_key)
PUBLIC_URL=
APP_BASE_URL=
CORS_ORIGIN=
ENV
  fi
  # state lama (sebelum EM-LTI): tambahkan kunci LTI sekali
  if ! grep -q '^ELGOS_LTI_PRIVATE_KEY=.' "$DEV_ENV_FILE"; then
    sed -i '/^ELGOS_LTI_PRIVATE_KEY=/d' "$DEV_ENV_FILE"
    echo "ELGOS_LTI_PRIVATE_KEY=$(lti_key)" >> "$DEV_ENV_FILE"
  fi
}

public_url() {
  # || true: grep tanpa hasil (tunnel belum siap) tidak boleh menghentikan skrip di bawah set -euo pipefail
  dc logs tunnel 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true
}

set_url() {
  local url="$1"
  sed -i -e "s#^PUBLIC_URL=.*#PUBLIC_URL=$url#" -e "s#^APP_BASE_URL=.*#APP_BASE_URL=$url#" \
         -e "s#^CORS_ORIGIN=.*#CORS_ORIGIN=$url#" "$DEV_ENV_FILE"
}

cmd_up() {
  init_state
  local public=1
  [ "${1:-}" = --local ] && public=0
  echo "== $PROJECT (branch $BRANCH, worktree $WORKTREE)"
  dc build --pull api web em-sim
  dc up -d --wait --wait-timeout 300 db api em-sim web
  if [ "$(dc exec -T db psql -U elgos -d elgos_dev -tAc "SELECT to_regclass('ewi.tenants') IS NOT NULL AND EXISTS (SELECT 1 FROM ewi.tenants WHERE slug='demo')" 2>/dev/null)" != t ]; then
    dc exec -T api docker-entrypoint.sh npm run --silent seed:dev && echo "Seed demo selesai"
  fi
  # EM-LTI: EliteMentor (simulasi) + flag em.lti; idempoten, jadi dijalankan setiap up (juga pada DB lama)
  dc exec -T api docker-entrypoint.sh npm run --silent seed:lti-demo
  if [ "$public" = 1 ]; then
    dc --profile public up -d tunnel
    local url=""
    for _ in $(seq 30); do url="$(public_url)"; [ -n "$url" ] && break; sleep 2; done
    if [ -n "$url" ]; then
      if [ "$(envval PUBLIC_URL)" != "$url" ]; then set_url "$url"; dc up -d --wait api >/dev/null; fi
    else
      echo "PERINGATAN: URL tunnel belum muncul (cek: dev.sh logs tunnel)" >&2
    fi
  fi
  cmd_url
}

cmd_url() {
  echo "Lokal : http://127.0.0.1:$(envval WEB_PORT)"
  local url; url="$(public_url || true)"
  [ -n "$url" ] && echo "Publik: $url"
  echo "Login : hr@demo.test / learner@demo.test, tenant demo, password DEV_SEED_PASSWORD di $DEV_ENV_FILE"
}

cmd_down() {
  if [ "${1:-}" = --purge ]; then dc --profile public down -v; rm -rf "$STATE"; else dc --profile public down; fi
}

cmd_ls() {
  docker ps -a --filter 'label=com.docker.compose.service=web' \
    --format '{{.Label "com.docker.compose.project"}}\t{{.Status}}\t{{.Ports}}' | grep '^elgos-dev-' || echo "(tidak ada)"
}

case "${1:-}" in
  up) shift; cmd_up "$@" ;;
  url) cmd_url ;;
  logs) shift; dc --profile public logs -f "$@" ;;
  down) shift; cmd_down "$@" ;;
  ls) cmd_ls ;;
  *) sed -n '2,9p' "$0"; exit 1 ;;
esac
