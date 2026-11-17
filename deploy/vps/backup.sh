#!/usr/bin/env bash
# Backup harian schema ewi (timer systemd elgos-backup@<env>.timer dari setup-etavm2.sh):
#   ELGOS_ENV=prod /srv/elgos-prod/backup.sh
# Simpan KEEP_DAILY backup terakhir di /srv/elgos-<env>/backups/daily. Salinan di luar etavm2
# (R2-10r, selaras RG-11) belum diputuskan: bila diisi, OFFSITE_CMD dipanggil dengan path file dump.
set -Eeuo pipefail
ENV="${ELGOS_ENV:?ELGOS_ENV wajib staging atau prod}"
DIR="${ELGOS_DIR:-/srv/elgos-$ENV}"
KEEP_DAILY="${KEEP_DAILY:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-$DIR/docker-compose.yml}"   # disalin deploy.sh tiap deploy sukses
export ELGOS_ENV="$ENV" ELGOS_ENV_FILE="$DIR/.env"
# Image tidak dipakai untuk exec, tapi compose memvalidasi variabelnya.
# shellcheck disable=SC1091
[ -f "$DIR/current.env" ] && . "$DIR/current.env"
export ELGOS_API_IMAGE="${ELGOS_API_IMAGE:-none}" ELGOS_WEB_IMAGE="${ELGOS_WEB_IMAGE:-none}"

mkdir -p "$DIR/backups/daily"
OUT="$DIR/backups/daily/elgos-$ENV-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose -f "$COMPOSE_FILE" --env-file "$ELGOS_ENV_FILE" \
  exec -T db pg_dump -U elgos -d elgos -n ewi -Fc > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
chmod 600 "$OUT"
find "$DIR/backups/daily" -name '*.dump' -printf '%T@ %p\n' | sort -rn | tail -n +"$((KEEP_DAILY + 1))" | cut -d' ' -f2- | xargs -r rm -f
if [ -n "${OFFSITE_CMD:-}" ]; then $OFFSITE_CMD "$OUT"; fi
echo "Backup $ENV: $OUT ($(du -h "$OUT" | cut -f1))"
