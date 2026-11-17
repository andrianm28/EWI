#!/usr/bin/env bash
# Deploy ELGOS staging/prod di etavm2 dengan image GHCR. Dipanggil oleh .github/workflows/deploy.yml
# (runner self-hosted etavm2), bisa juga manual oleh user elgos-deploy:
#   ELGOS_ENV=staging deploy/vps/deploy.sh <sha>
#
# Tahap: pull image -> backup DB -> cek konfigurasi -> migrasi -> ganti container -> health check.
# Gagal setelah backup = rollback otomatis: image sebelumnya dipasang lagi, schema ewi direstore dari
# backup bila migrasi sempat mengubah skema. Diadaptasi dari deploy/dev-public/deploy.sh (PR #5).
#
# Status di /srv/elgos-<env>:
#   .env              secret + konfigurasi lingkungan (tidak di repo)
#   current.env       image yang sedang jalan; previous.env = sebelum deploy sukses terakhir
#   backups/*.dump    pg_dump format custom (deploy + harian, lihat backup.sh)
#   deploy.log        riwayat deploy
set -Eeuo pipefail

TAG="${1:?pakai: ELGOS_ENV=<staging|prod> deploy.sh <sha image>}"
ENV="${ELGOS_ENV:?ELGOS_ENV wajib staging atau prod}"
case "$ENV" in staging | prod) ;; *) echo "ELGOS_ENV harus staging atau prod"; exit 1 ;; esac
DIR="${ELGOS_DIR:-/srv/elgos-$ENV}"
PREFIX="${IMAGE_PREFIX:-ghcr.io/andrianm28/ewi}"
SEED="${SEED:-skip}"                 # hanya staging: auto = bila tenant demo belum ada; force; skip
KEEP_BACKUPS="${KEEP_BACKUPS:-20}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/deploy/vps/docker-compose.yml"
export ELGOS_ENV="$ENV" ELGOS_ENV_FILE="$DIR/.env"

log() { printf '[%s] [%s] %s\n' "$(date -u +%FT%TZ)" "$ENV" "$*" | tee -a "$DIR/deploy.log" >&2; }
dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ELGOS_ENV_FILE" "$@"; }
psql_db() { dc exec -T db psql -U elgos -d elgos -v ON_ERROR_STOP=1 -tAc "$1"; }
envval() { sed -n "s/^$1=//p" "$ELGOS_ENV_FILE" | tail -1 | sed 's/[[:space:]]*#.*$//' | tr -d '"'"'"'\r'; }

[ -f "$ELGOS_ENV_FILE" ] || { echo "::error::$ELGOS_ENV_FILE tidak ada (lihat deploy/vps/README.md)"; exit 1; }
mkdir -p "$DIR/backups"

# Konfigurasi wajib. API di produksi menolak boot tanpa KMS/SES; gagal di sini lebih jelas.
missing=()
for v in PUBLIC_URL WEB_PORT POSTGRES_PASSWORD EWI_JWT_SECRET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY KMS_KEY_ALIAS_PREFIX MAIL_FROM; do
  [ -n "$(envval "$v")" ] || missing+=("$v")
done
[ "${#missing[@]}" = 0 ] || { echo "::error::Kosong di $ELGOS_ENV_FILE: ${missing[*]}"; exit 1; }
PUBLIC_URL="$(envval PUBLIC_URL)"; PUBLIC_URL="${PUBLIC_URL%/}"
LOCAL_URL="http://127.0.0.1:$(envval WEB_PORT)"
[[ "$(envval KMS_KEY_ALIAS_PREFIX)" == "elgos-$ENV-tenant" ]] || log "PERINGATAN: KMS_KEY_ALIAS_PREFIX bukan elgos-$ENV-tenant"

NEW_API="$PREFIX-api:$TAG"
NEW_WEB="$PREFIX-web:$TAG"
if [ -f "$DIR/current.env" ]; then
  # shellcheck disable=SC1091
  . "$DIR/current.env"
fi
OLD_API="${ELGOS_API_IMAGE:-}"
OLD_WEB="${ELGOS_WEB_IMAGE:-}"
OLD_SHA="${ELGOS_SHA:-tidak ada}"

BACKUP=""
MIGRATED=0
ROLLING_BACK=0

health() {
  local url="$1" tries="${2:-30}"
  for _ in $(seq "$tries"); do
    if [[ "$(curl -fsS --max-time 5 "$url/api/health" 2>/dev/null)" == *'"ok"'* ]]; then return 0; fi
    sleep 2
  done
  return 1
}

rollback() {
  local code=$?
  [ "$ROLLING_BACK" = 1 ] && exit "$code"
  ROLLING_BACK=1
  set +e
  trap - ERR
  log "GAGAL (exit $code) saat deploy $TAG. Rollback ke $OLD_SHA."
  dc logs --no-color --tail 80 api web >&2 || true
  if [ "$MIGRATED" = 1 ]; then
    log "Migrasi sudah jalan: kembalikan schema ewi dari ${BACKUP:-<tidak ada backup>}"
    dc stop api web || true
    if [ -n "$BACKUP" ]; then
      dc exec -T db psql -U elgos -d elgos -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS ewi CASCADE' >&2 || true
      dc exec -T db pg_restore -U elgos -d elgos --no-owner < "$BACKUP" >&2 || log "PERINGATAN: pg_restore melaporkan error, cek manual"
    fi
  fi
  if [ -z "$OLD_API" ]; then
    log "Tidak ada versi sebelumnya untuk rollback (deploy pertama). Container dihentikan."
    dc stop api web || true
  elif ELGOS_API_IMAGE="$OLD_API" ELGOS_WEB_IMAGE="$OLD_WEB" dc up -d --wait --wait-timeout 180 api web >&2 \
     && health "$LOCAL_URL" 15; then
    log "Rollback ke $OLD_SHA berhasil."
  else
    log "Rollback juga GAGAL. Perlu penanganan manual di etavm2."
  fi
  echo "::error::Deploy $TAG ke $ENV gagal dan sudah di-rollback ke $OLD_SHA. Lihat log di atas."
  exit 1
}

log "Mulai deploy $TAG (sebelumnya $OLD_SHA)"

# 1. Pull image dulu: bila gagal, belum ada yang berubah.
docker pull -q "$NEW_API" >/dev/null
docker pull -q "$NEW_WEB" >/dev/null
export ELGOS_API_IMAGE="$NEW_API" ELGOS_WEB_IMAGE="$NEW_WEB"

# 2. Pastikan DB jalan, lalu backup schema ewi.
dc up -d --wait db
if [ "$(psql_db "SELECT count(*) FROM pg_namespace WHERE nspname = 'ewi'")" = 1 ]; then
  BACKUP="$DIR/backups/elgos-$ENV-$(date -u +%Y%m%dT%H%M%SZ)-before-${TAG:0:12}.dump"
  dc exec -T db pg_dump -U elgos -d elgos -n ewi -Fc > "$BACKUP"
  log "Backup DB: $BACKUP ($(du -h "$BACKUP" | cut -f1))"
else
  log "DB masih kosong (schema ewi belum ada), backup dilewati"
fi
find "$DIR/backups" -name '*-before-*.dump' -printf '%T@ %p\n' | sort -rn | tail -n +"$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f

trap rollback ERR

# 3. Migrasi dengan image baru, sebelum container lama diganti.
MIG_OUT="$(dc run --rm --no-deps -T api npm run migrate 2>&1)" || { echo "$MIG_OUT" >&2; false; }
echo "$MIG_OUT" >&2
if grep -q ': migrated' <<<"$MIG_OUT"; then MIGRATED=1; log "Migrasi baru diterapkan"; else log "Tidak ada migrasi baru"; fi

# 4. Ganti container, tunggu healthcheck compose, lalu cek lewat web lokal dan URL publik.
dc up -d --wait --wait-timeout 180 api web
health "$LOCAL_URL"
log "Health lokal OK ($LOCAL_URL)"
if [ "${SKIP_PUBLIC_CHECK:-0}" != 1 ]; then
  health "$PUBLIC_URL" 15
  log "Health publik OK ($PUBLIC_URL)"
fi

trap - ERR

# 5. Seed data demo hanya di staging, setelah deploy dinyatakan sukses (gagal seed = peringatan). Prod tidak pernah di-seed (data nyata, R2-4).
if [ "$ENV" = staging ] && [ "$SEED" != skip ]; then
  HAS_DEMO="$(psql_db "SELECT count(*) FROM ewi.tenants WHERE slug = 'demo'" 2>/dev/null || echo 0)"
  if [ "$SEED" = force ] || [ "$HAS_DEMO" = 0 ]; then
    if [ -n "$(envval DEV_SEED_PASSWORD)" ]; then
      # seed-dev menolak NODE_ENV=production (penjaga data nyata); staging hanya berisi data uji.
      if dc exec -T -e NODE_ENV=development api docker-entrypoint.sh npm run --silent seed:dev; then
        log "Seed data demo dijalankan (SEED=$SEED)"
      else
        log "PERINGATAN: seed gagal (aplikasi tetap terdeploy)"
      fi
    else
      log "PERINGATAN: DEV_SEED_PASSWORD kosong, seed dilewati"
    fi
  fi
fi


# 6. Catat versi. previous.env dipakai untuk rollback manual.
[ -f "$DIR/current.env" ] && cp "$DIR/current.env" "$DIR/previous.env"
install -m 644 "$COMPOSE_FILE" "$DIR/docker-compose.yml"
install -m 755 "$REPO_ROOT/deploy/vps/backup.sh" "$DIR/backup.sh"
printf 'ELGOS_API_IMAGE=%s\nELGOS_WEB_IMAGE=%s\nELGOS_SHA=%s\n' "$NEW_API" "$NEW_WEB" "$TAG" > "$DIR/current.env"
docker image prune -f --filter "until=336h" >/dev/null || true
log "Deploy $TAG selesai"
