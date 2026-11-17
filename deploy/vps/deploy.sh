#!/usr/bin/env bash
# Deploy ELGOS staging/prod di etavm2 dengan image GHCR. Dipanggil oleh .github/workflows/deploy.yml
# (runner self-hosted etavm2), bisa juga manual oleh user elgos-deploy:
#   ELGOS_ENV=staging deploy/vps/deploy.sh <sha>
#
# Tahap: cek konfigurasi -> pull image -> backup DB (+ verifikasi) -> migrasi (pemilik skema) ->
# role aplikasi -> ganti container -> kesiapan (/api/ready) lokal + publik.
# Gagal setelah backup = rollback otomatis: image sebelumnya dipasang lagi; schema ewi dipulihkan
# dari backup HANYA bila migrasi sempat jalan dan backup sudah terverifikasi terbaca (N-5).
# Aturan migrasi (I-1): tambah dulu, hapus di rilis berikutnya, supaya image lama tetap jalan
# di atas skema baru. Lihat docs/infra/alur-rilis.md.
#
# Status di /srv/elgos-<env>:
#   .env              konfigurasi + secret aplikasi (masuk ke container API)
#   db.env            POSTGRES_PASSWORD pemilik skema (hanya container db dan migrasi)
#   current.env       image yang sedang jalan; previous.env = sebelum deploy sukses terakhir
#   backups/*.dump    pg_dump format custom (deploy + terjadwal, lihat backup.sh)
#   deploy.log        riwayat deploy
set -Eeuo pipefail

TAG="${1:?pakai: ELGOS_ENV=<staging|prod> deploy.sh <sha image>}"
ENV="${ELGOS_ENV:?ELGOS_ENV wajib staging atau prod}"
case "$ENV" in staging | prod) ;; *) echo "ELGOS_ENV harus staging atau prod"; exit 1 ;; esac
DIR="${ELGOS_DIR:-/srv/elgos-$ENV}"
PREFIX="${IMAGE_PREFIX:-ghcr.io/andrianm28/ewi}"
SEED="${SEED:-skip}"                 # hanya staging: auto = bila tenant demo belum ada; force; skip
KEEP_DAYS="${KEEP_DAYS:-30}"         # retensi backup sebelum-deploy berdasarkan umur (PK-17)
APP_DB_USER=elgos_app
OWNER_DB_USER=elgos

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/deploy/vps/docker-compose.yml"
export ELGOS_ENV="$ENV" ELGOS_ENV_FILE="$DIR/.env" ELGOS_DB_ENV_FILE="$DIR/db.env"

log() { printf '[%s] [%s] %s\n' "$(date -u +%FT%TZ)" "$ENV" "$*" | tee -a "$DIR/deploy.log" >&2; }
dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ELGOS_ENV_FILE" "$@"; }
psql_db() { dc exec -T db psql -U "$OWNER_DB_USER" -d elgos -v ON_ERROR_STOP=1 -tAc "$1"; }
fileval() { sed -n "s/^$2=//p" "$1" | tail -1 | sed 's/[[:space:]]*#.*$//' | tr -d '"'"'"'\r'; }
envval() { fileval "$ELGOS_ENV_FILE" "$1"; }

for f in "$ELGOS_ENV_FILE" "$ELGOS_DB_ENV_FILE"; do
  [ -f "$f" ] || { echo "::error::$f tidak ada (lihat docs/infra/vps-etavm2.md)"; exit 1; }
done
mkdir -p "$DIR/backups"

# Konfigurasi wajib. API di produksi menolak boot tanpa KMS/SES; gagal di sini lebih jelas.
missing=()
for v in PUBLIC_URL WEB_PORT DB_PASSWORD EWI_JWT_SECRET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY KMS_KEY_ALIAS_PREFIX MAIL_FROM; do
  [ -n "$(envval "$v")" ] || missing+=("$v")
done
[ -n "$(fileval "$ELGOS_DB_ENV_FILE" POSTGRES_PASSWORD)" ] || missing+=("POSTGRES_PASSWORD (db.env)")
[ "${#missing[@]}" = 0 ] || { echo "::error::Kosong: ${missing[*]}"; exit 1; }
if grep -q '^POSTGRES_PASSWORD=' "$ELGOS_ENV_FILE"; then
  echo "::error::POSTGRES_PASSWORD harus di db.env, bukan .env (password pemilik tidak boleh masuk container API)"
  exit 1
fi
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
BACKUP_OK=0
MIGRATED=0
ROLLING_BACK=0

# Kesiapan: /api/ready (DB terjangkau, migrasi lengkap, KMS/SES siap; dibangun thread B2). Image
# lama tanpa /api/ready (404, atau 401 karena rute tak dikenal ada di balik auth) jatuh ke /api/health.
ready() {
  local url="$1" tries="${2:-30}" code
  for _ in $(seq "$tries"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url/api/ready" || true)"
    [ "$code" = 200 ] && return 0
    if [[ "$code" =~ ^40[0-9]$ ]] && [[ "$(curl -fsS --max-time 5 "$url/api/health" 2>/dev/null)" == *'"ok"'* ]]; then
      return 0
    fi
    sleep 2
  done
  echo "Tidak siap: $url (HTTP terakhir ${code:-?})" >&2
  return 1
}

# Backup yang tidak bisa dibaca pg_restore tidak boleh dipakai untuk menghapus skema (N-5).
verify_backup() {
  [ -s "$1" ] && dc exec -T db pg_restore --list < "$1" | grep -q 'TABLE ewi '
}

# Buat/perbarui role aplikasi dan haknya. Dijalankan sebagai pemilik setelah migrasi.
apply_app_role() {
  local out
  out="$({ printf '\\set app_user %s\n\\set app_password %s\n\\set db_name elgos\n' \
             "$APP_DB_USER" "$(envval DB_PASSWORD)"
           cat "$REPO_ROOT/deploy/vps/ops/app-role.sql"; } \
         | dc exec -T db psql -U "$OWNER_DB_USER" -d elgos -q -tA -v ON_ERROR_STOP=1)"
  # Baris terakhir: bisa_ddl|bisa_ubah_audit|bisa_hapus_audit, semuanya harus f.
  [ "$(tail -1 <<<"$out")" = "f|f|f" ] || { echo "::error::Hak role $APP_DB_USER tidak sesuai: $out"; return 1; }
  log "Role $APP_DB_USER diperbarui (tanpa DDL, audit_logs hanya INSERT/SELECT)"
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
    if [ "$BACKUP_OK" = 1 ] && verify_backup "$BACKUP"; then
      log "Migrasi sudah jalan: pulihkan schema ewi dari $BACKUP"
      dc stop api web || true
      dc exec -T db psql -U "$OWNER_DB_USER" -d elgos -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS ewi CASCADE' >&2 || true
      dc exec -T db pg_restore -U "$OWNER_DB_USER" -d elgos --no-owner --no-privileges < "$BACKUP" >&2 \
        || log "PERINGATAN: pg_restore melaporkan error, cek manual"
      apply_app_role || log "PERINGATAN: role aplikasi gagal diperbarui setelah restore"
    else
      log "Migrasi sudah jalan tetapi backup tidak ada/tidak terbaca: skema TIDAK dihapus. Image lama dipasang di atas skema baru (aturan migrasi tambah-dulu)."
    fi
  fi
  if [ -z "$OLD_API" ]; then
    log "Tidak ada versi sebelumnya untuk rollback (deploy pertama). Container dihentikan."
    dc stop api web || true
  elif ELGOS_API_IMAGE="$OLD_API" ELGOS_WEB_IMAGE="$OLD_WEB" dc up -d --wait --wait-timeout 180 api web >&2 \
     && ready "$LOCAL_URL" 15; then
    log "Rollback ke $OLD_SHA berhasil."
  else
    log "Rollback juga GAGAL. Perlu penanganan manual di etavm2 (runbook: docs/infra/runbook-insiden.md)."
  fi
  echo "::error::Deploy $TAG ke $ENV gagal dan sudah di-rollback ke $OLD_SHA. Lihat log di atas."
  exit 1
}

log "Mulai deploy $TAG (sebelumnya $OLD_SHA)"

# 1. Pull image dulu: bila gagal, belum ada yang berubah.
docker pull -q "$NEW_API" >/dev/null
docker pull -q "$NEW_WEB" >/dev/null
export ELGOS_API_IMAGE="$NEW_API" ELGOS_WEB_IMAGE="$NEW_WEB"

# 2. Pastikan DB jalan, lalu backup schema ewi dan pastikan backup terbaca.
dc up -d --wait db
if [ "$(psql_db "SELECT count(*) FROM pg_namespace WHERE nspname = 'ewi'")" = 1 ]; then
  BACKUP="$DIR/backups/elgos-$ENV-$(date -u +%Y%m%dT%H%M%SZ)-before-${TAG:0:12}.dump"
  (umask 077 && dc exec -T db pg_dump -U "$OWNER_DB_USER" -d elgos -n ewi -Fc > "$BACKUP")
  verify_backup "$BACKUP" || { echo "::error::Backup $BACKUP tidak terbaca; deploy dibatalkan sebelum ada perubahan"; exit 1; }
  BACKUP_OK=1
  log "Backup DB terverifikasi: $BACKUP ($(du -h "$BACKUP" | cut -f1))"
else
  log "DB masih kosong (schema ewi belum ada), backup dilewati"
fi
find "$DIR/backups" -maxdepth 1 -name '*-before-*.dump' -mtime +"$KEEP_DAYS" -delete

trap rollback ERR

# 3. Migrasi dengan image baru sebagai pemilik skema, sebelum container lama diganti (P1-7).
#    DB_MIGRATION_* untuk API baru (PD-8), DB_USER/DB_PASSWORD untuk image lama.
DB_PASSWORD="$(fileval "$ELGOS_DB_ENV_FILE" POSTGRES_PASSWORD)"
export DB_PASSWORD DB_MIGRATION_PASSWORD="$DB_PASSWORD"
MIG_OUT="$(dc run --rm --no-deps -T \
  -e DB_USER="$OWNER_DB_USER" -e DB_PASSWORD -e DB_MIGRATION_USER="$OWNER_DB_USER" -e DB_MIGRATION_PASSWORD \
  api npm run migrate 2>&1)" || { echo "$MIG_OUT" >&2; false; }
unset DB_PASSWORD DB_MIGRATION_PASSWORD
echo "$MIG_OUT" >&2
if grep -q ': migrated' <<<"$MIG_OUT"; then MIGRATED=1; log "Migrasi baru diterapkan"; else log "Tidak ada migrasi baru"; fi

# 4. Role aplikasi + hak untuk tabel baru.
apply_app_role

# 5. Ganti container, tunggu healthcheck compose, lalu cek kesiapan lokal dan publik.
dc up -d --wait --wait-timeout 180 api web
ready "$LOCAL_URL"
log "Siap lokal ($LOCAL_URL)"
if [ "${SKIP_PUBLIC_CHECK:-0}" != 1 ]; then
  ready "$PUBLIC_URL" 15
  log "Siap publik ($PUBLIC_URL)"
fi

trap - ERR

# 6. Seed data demo hanya di staging, setelah deploy dinyatakan sukses (gagal seed = peringatan).
#    Prod tidak pernah di-seed (data nyata, R2-4).
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

# 7. Salin berkas operasional (dipakai timer systemd) dan catat versi.
install -d -m 750 "$DIR/ops"
install -m 644 "$COMPOSE_FILE" "$DIR/docker-compose.yml"
install -m 755 "$REPO_ROOT"/deploy/vps/ops/*.sh "$DIR/ops/"
install -m 644 "$REPO_ROOT/deploy/vps/ops/app-role.sql" "$DIR/ops/"
[ -f "$DIR/current.env" ] && cp "$DIR/current.env" "$DIR/previous.env"
printf 'ELGOS_API_IMAGE=%s\nELGOS_WEB_IMAGE=%s\nELGOS_SHA=%s\n' "$NEW_API" "$NEW_WEB" "$TAG" > "$DIR/current.env"
docker image prune -f --filter "until=336h" >/dev/null || true
log "Deploy $TAG selesai"
