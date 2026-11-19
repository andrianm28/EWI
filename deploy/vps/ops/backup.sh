#!/usr/bin/env bash
# Backup schema ewi satu lingkungan (PD-20 opsi A, menutup N-1):
#   ELGOS_ENV=prod  /srv/elgos-prod/ops/backup.sh hourly    # timer: tiap jam, jam kerja (prod)
#   ELGOS_ENV=prod  /srv/elgos-prod/ops/backup.sh nightly   # timer: tiap malam
# Dump diverifikasi (pg_restore --list), disimpan lokal, lalu diunggah ke
# s3://$BACKUP_BUCKET/<env>/<jenis>/ dengan SSE-KMS (kunci backup akun ELGOS). Bucket versioned,
# user ops hanya bisa PutObject (tidak bisa menghapus/menimpa versi lama). Gagal = peringatan.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/ops/common.sh
. "$HERE/common.sh"
ENV="${ELGOS_ENV:?ELGOS_ENV wajib staging atau prod}"
KIND="${1:-manual}"
case "$KIND" in hourly | nightly | manual) ;; *) echo "jenis: hourly | nightly | manual"; exit 1 ;; esac
DIR="${ELGOS_DIR:-/srv/elgos-$ENV}"
# Retensi lokal berdasarkan umur (masukan PK-17): per jam 7 hari, malam dan manual 30 hari.
# Di S3 aturan yang sama dijalankan lifecycle bucket (infra/live/shared).
case "$KIND" in hourly) KEEP_DAYS="${KEEP_DAYS:-7}" ;; *) KEEP_DAYS="${KEEP_DAYS:-30}" ;; esac

fail() { alert kritis "backup-$ENV" "Backup $KIND $ENV gagal: $1"; exit 1; }
trap 'fail "baris $LINENO"' ERR

mkdir -p "$DIR/backups/$KIND"
NAME="elgos-$ENV-$(date -u +%Y%m%dT%H%M%SZ).dump"
OUT="$DIR/backups/$KIND/$NAME"
(umask 077 && env_compose "$ENV" exec -T db pg_dump -U elgos -d elgos -n ewi -Fc > "$OUT.tmp")
env_compose "$ENV" exec -T db pg_restore --list < "$OUT.tmp" | grep -q 'TABLE ewi ' || fail "dump tidak terbaca"
mv "$OUT.tmp" "$OUT"
SHA="$(sha256sum "$OUT" | cut -d' ' -f1)"

if [ -n "${BACKUP_BUCKET:-}" ]; then
  aws s3api put-object --bucket "$BACKUP_BUCKET" --key "$ENV/$KIND/$NAME" --body "$OUT" \
    --server-side-encryption aws:kms --checksum-algorithm SHA256 \
    --metadata "sha256=$SHA,host=$(hostname -s)" >/dev/null || fail "unggah S3 gagal"
  WHERE="s3://$BACKUP_BUCKET/$ENV/$KIND/$NAME"
else
  [ "$ENV" = prod ] && fail "BACKUP_BUCKET kosong: backup prod hanya lokal"
  WHERE="lokal saja (BACKUP_BUCKET kosong)"
fi

find "$DIR/backups/$KIND" -maxdepth 1 -name '*.dump' -mtime +"$KEEP_DAYS" -delete
date -u +%s > "$DIR/backups/last-success"
alert_clear "backup-$ENV"
echo "Backup $KIND $ENV OK: $OUT ($(du -h "$OUT" | cut -f1)) -> $WHERE"
