#!/usr/bin/env bash
# Deploy dev EWI di etavm1 dengan image GHCR. Dipanggil oleh .github/workflows/deploy-dev.yml (runner
# self-hosted), bisa juga manual oleh user ewi-deploy:
#   EWI_DEV_DIR=/srv/ewi-dev deploy/dev-public/deploy.sh <sha>
#
# Tahap: backup DB -> pull image -> migrasi -> ganti container -> health check -> seed -> mockup.
# Gagal setelah backup = rollback otomatis: image sebelumnya dipasang lagi, DB direstore dari backup
# bila migrasi sempat mengubah skema.
#
# Status di $EWI_DEV_DIR:
#   .env              secret (tidak di repo)
#   current.env       image yang sedang jalan (EWI_API_IMAGE, EWI_WEB_IMAGE, EWI_SHA)
#   previous.env      image sebelum deploy terakhir yang sukses
#   backups/*.dump    pg_dump format custom, disimpan $KEEP_BACKUPS terakhir
#   deploy.log        riwayat deploy
set -Eeuo pipefail

TAG="${1:?pakai: deploy.sh <sha image>}"
DIR="${EWI_DEV_DIR:-/srv/ewi-dev}"
PREFIX="${IMAGE_PREFIX:-ghcr.io/andrianm28/ewi}"
SEED="${SEED:-auto}"                       # auto = hanya bila tenant demo belum ada; force; skip
MOCKUP_SRC="${MOCKUP_SRC:-mockups/poc-elgos}"
MOCKUP_DST="${MOCKUP_DST:-/var/www/ewi-mockup}"
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:8080}"
PUBLIC_URL_CHECK="${PUBLIC_URL_CHECK-__env__}"   # default: PUBLIC_URL di .env; kosong = lewati
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/deploy/dev-public/docker-compose.yml"
export EWI_ENV_FILE="$DIR/.env"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$DIR/deploy.log" >&2; }
dc() { docker compose -f "$COMPOSE_FILE" --env-file "$EWI_ENV_FILE" "$@"; }
psql_db() { dc exec -T db psql -U ewi -d ewi_dev -v ON_ERROR_STOP=1 -tAc "$1"; }

[ -f "$EWI_ENV_FILE" ] || { echo "::error::$EWI_ENV_FILE tidak ada (lihat deploy/dev-public/README.md)"; exit 1; }
mkdir -p "$DIR/backups"
if [ "$PUBLIC_URL_CHECK" = __env__ ]; then
  PUBLIC_URL_CHECK="$(sed -n 's/^PUBLIC_URL=//p' "$EWI_ENV_FILE" | tail -1 | tr -d '"'"'"'\r')"
  PUBLIC_URL_CHECK="${PUBLIC_URL_CHECK%/}"
fi

NEW_API="$PREFIX-api:$TAG"
NEW_WEB="$PREFIX-web:$TAG"

# Image yang sedang jalan; deploy pertama dari setup manual memakai image build lokal.
if [ -f "$DIR/current.env" ]; then
  # shellcheck disable=SC1091
  . "$DIR/current.env"
fi
OLD_API="${EWI_API_IMAGE:-ewi-dev-api:latest}"
OLD_WEB="${EWI_WEB_IMAGE:-ewi-dev-web:latest}"
OLD_SHA="${EWI_SHA:-lokal}"

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
    log "Migrasi sudah jalan: kembalikan schema ewi ke kondisi sebelum deploy (${BACKUP:-kosong})"
    dc stop api web || true
    # Semua tabel EWI (termasuk SequelizeMeta) ada di schema ewi; backup hanya schema itu.
    dc exec -T db psql -U ewi -d ewi_dev -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS ewi CASCADE' >&2 || true
    if [ -n "$BACKUP" ]; then
      dc exec -T db pg_restore -U ewi -d ewi_dev --no-owner < "$BACKUP" >&2 || log "PERINGATAN: pg_restore melaporkan error, cek manual"
    fi
  fi
  if EWI_API_IMAGE="$OLD_API" EWI_WEB_IMAGE="$OLD_WEB" dc up -d --no-build --wait --wait-timeout 180 api web >&2 \
     && health "$LOCAL_URL" 15; then
    log "Rollback ke $OLD_SHA berhasil, dev tetap sehat."
  else
    log "Rollback juga GAGAL. Perlu penanganan manual di etavm1."
  fi
  echo "::error::Deploy $TAG gagal dan sudah di-rollback ke $OLD_SHA. Lihat log di atas."
  exit 1
}

log "Mulai deploy $TAG (sebelumnya $OLD_SHA)"

# 1. Pull image dulu: bila gagal, belum ada yang berubah.
docker pull -q "$NEW_API" >/dev/null
docker pull -q "$NEW_WEB" >/dev/null

# 2. Pastikan DB jalan, lalu backup.
dc up -d --no-build --wait db
if [ "$(psql_db "SELECT count(*) FROM pg_namespace WHERE nspname = 'ewi'")" = 1 ]; then
  BACKUP="$DIR/backups/ewi_dev-$(date -u +%Y%m%dT%H%M%SZ)-before-${TAG:0:12}.dump"
  dc exec -T db pg_dump -U ewi -d ewi_dev -n ewi -Fc > "$BACKUP"
  log "Backup DB: $BACKUP ($(du -h "$BACKUP" | cut -f1))"
else
  log "DB masih kosong (schema ewi belum ada), backup dilewati"
fi
find "$DIR/backups" -name '*.dump' -printf '%T@ %p\n' | sort -rn | tail -n +"$((KEEP_BACKUPS + 1))" | cut -d' ' -f2- | xargs -r rm -f

trap rollback ERR

# 3. Migrasi dengan image baru, sebelum container lama diganti.
export EWI_API_IMAGE="$NEW_API" EWI_WEB_IMAGE="$NEW_WEB"
MIG_OUT="$(dc run --rm --no-deps -T -e RUN_MIGRATIONS=false api npm run migrate 2>&1)" || { echo "$MIG_OUT" >&2; false; }
echo "$MIG_OUT" >&2
if grep -q ': migrated' <<<"$MIG_OUT"; then MIGRATED=1; log "Migrasi baru diterapkan"; else log "Tidak ada migrasi baru"; fi

# 4. Ganti container, tunggu healthcheck compose, lalu cek lewat nginx web dan URL publik.
dc up -d --no-build --wait --wait-timeout 180 api web
health "$LOCAL_URL"
log "Health lokal OK ($LOCAL_URL)"
if [ -n "$PUBLIC_URL_CHECK" ]; then
  health "$PUBLIC_URL_CHECK" 15
  log "Health publik OK ($PUBLIC_URL_CHECK)"
fi

# 5. Seed data demo. Idempoten, tapi mereset pengaturan demo, jadi default hanya untuk DB kosong.
if [ "$SEED" != skip ]; then
  HAS_DEMO="$(psql_db "SELECT count(*) FROM ewi.tenants WHERE slug = 'demo'" 2>/dev/null || echo 0)"
  if [ "$SEED" = force ] || [ "$HAS_DEMO" = 0 ]; then
    if grep -qE '^DEV_SEED_PASSWORD=.+' "$EWI_ENV_FILE"; then
      dc exec -T api docker-entrypoint.sh npm run --silent seed:dev
      log "Seed data demo dijalankan (SEED=$SEED)"
    else
      log "PERINGATAN: DEV_SEED_PASSWORD kosong di $EWI_ENV_FILE, seed dilewati"
    fi
  fi
fi

trap - ERR

# 6. Mockup statis (/mockup/ di nginx host). Hanya bila commit ini membawa foldernya; bila tidak,
#    isi yang ada dibiarkan.
if [ -d "$REPO_ROOT/$MOCKUP_SRC" ]; then
  if [ -w "$MOCKUP_DST" ]; then
    if find "$MOCKUP_DST" -mindepth 1 -delete && cp -a "$REPO_ROOT/$MOCKUP_SRC/." "$MOCKUP_DST/"; then
      log "Mockup disinkron ke $MOCKUP_DST"
    else
      log "PERINGATAN: sinkron mockup ke $MOCKUP_DST gagal (aplikasi sudah terdeploy)"
    fi
  else
    log "PERINGATAN: $MOCKUP_DST tidak bisa ditulis user $(id -un), mockup tidak disinkron"
  fi
fi

# 7. Catat versi. previous.env dipakai untuk rollback manual.
[ -f "$DIR/current.env" ] && cp "$DIR/current.env" "$DIR/previous.env"
printf 'EWI_API_IMAGE=%s\nEWI_WEB_IMAGE=%s\nEWI_SHA=%s\n' "$NEW_API" "$NEW_WEB" "$TAG" > "$DIR/current.env"
docker image prune -f --filter "until=168h" >/dev/null || true
log "Deploy $TAG selesai"
