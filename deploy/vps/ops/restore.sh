#!/usr/bin/env bash
# Pemulihan backup ELGOS (PK-12, menutup I-8 + bagian P1-13). Dua mode:
#
#   restore.sh uji <sumber>            Uji pemulihan: pulihkan ke DB sementara yang terisolasi
#                                      (project compose elgos-restore-uji, tanpa API, tanpa port),
#                                      hitung baris tiap tabel, catat lamanya, lalu hapus. Data
#                                      produksi tidak pernah masuk staging (R2-4).
#   restore.sh pulihkan <env> <sumber> Pemulihan sungguhan ke staging/prod (insiden). Prod butuh
#                                      KONFIRMASI=prod. Membuat backup pengaman dulu.
#
# <sumber>: path berkas .dump lokal, atau s3://bucket/key. Unduh dari S3 butuh kredensial baca
# (IAM user elgos-restore; access key dibuat saat dibutuhkan lalu dihapus, lihat runbook) lewat
# AWS_PROFILE atau AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY di environment pemanggil.
# Hasil uji dicatat di /srv/elgos-restore-uji.log (dipakai sebagai bukti RTO).
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:?mode: uji | pulihkan}"
START="$(date +%s)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
elapsed() { echo $(( $(date +%s) - START )); }

fetch() {
  local src="$1" out="$TMP/backup.dump"
  if [[ "$src" == s3://* ]]; then
    aws s3 cp --only-show-errors "$src" "$out"
  else
    cp "$src" "$out"
  fi
  [ -s "$out" ] || { echo "Backup kosong: $src" >&2; exit 1; }
  echo "$out"
}

case "$MODE" in
  uji)
    SRC="${2:?sumber backup wajib}"
    FILE="$(fetch "$SRC")"
    T_FETCH="$(elapsed)"
    P=elgos-restore-uji
    PW="$(openssl rand -hex 16)"
    docker rm -f "$P-db" >/dev/null 2>&1 || true
    docker run -d --name "$P-db" --network none -e POSTGRES_USER=elgos -e POSTGRES_DB=elgos \
      -e POSTGRES_PASSWORD="$PW" pgvector/pgvector:pg16 >/dev/null
    trap 'docker rm -f "$P-db" >/dev/null 2>&1; rm -rf "$TMP"' EXIT
    for _ in $(seq 60); do docker exec "$P-db" pg_isready -U elgos -d elgos >/dev/null 2>&1 && break; sleep 1; done
    sleep 2
    docker exec -i "$P-db" pg_restore -U elgos -d elgos --no-owner --no-privileges --exit-on-error < "$FILE"
    COUNTS="$(docker exec "$P-db" psql -U elgos -d elgos -tA -c \
      "SELECT string_agg(format('%s=%s', relname, n_live_tup), ' ' ORDER BY relname)
         FROM (SELECT c.relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM ewi.%I', c.relname), false, true, '')))[1]::text::bigint AS n_live_tup
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'ewi' AND c.relkind = 'r') t")"
    TABLES="$(docker exec "$P-db" psql -U elgos -d elgos -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='ewi'")"
    [ "$TABLES" -gt 0 ] || { echo "Tidak ada tabel ewi setelah restore" >&2; exit 1; }
    LINE="$(date -u +%FT%TZ) uji-pemulihan sumber=$SRC unduh=${T_FETCH}s total=$(elapsed)s tabel=$TABLES $COUNTS"
    echo "$LINE" | tee -a "${RESTORE_LOG:-/srv/elgos-restore-uji.log}"
    echo "Uji pemulihan OK dalam $(elapsed) detik (target RTO 4 jam)."
    ;;
  pulihkan)
    ENV="${2:?env wajib staging atau prod}"
    SRC="${3:?sumber backup wajib}"
    case "$ENV" in staging | prod) ;; *) echo "env harus staging atau prod"; exit 1 ;; esac
    if [ "$ENV" = prod ] && [ "${KONFIRMASI:-}" != prod ]; then
      echo "Pemulihan prod menimpa data produksi. Ulangi dengan KONFIRMASI=prod bila yakin."; exit 1
    fi
    # shellcheck source=deploy/vps/ops/common.sh
    . "$HERE/common.sh"
    DIR="/srv/elgos-$ENV"
    FILE="$(fetch "$SRC")"
    env_compose "$ENV" exec -T db pg_restore --list < "$FILE" | grep -q 'TABLE ewi ' || { echo "Backup tidak terbaca" >&2; exit 1; }
    SAFETY="$DIR/backups/elgos-$ENV-$(date -u +%Y%m%dT%H%M%SZ)-sebelum-pemulihan.dump"
    (umask 077 && env_compose "$ENV" exec -T db pg_dump -U elgos -d elgos -n ewi -Fc > "$SAFETY")
    echo "Backup pengaman: $SAFETY"
    env_compose "$ENV" stop api web
    env_compose "$ENV" exec -T db psql -U elgos -d elgos -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS ewi CASCADE'
    env_compose "$ENV" exec -T db pg_restore -U elgos -d elgos --no-owner --no-privileges --exit-on-error < "$FILE"
    APP_PW="$(sed -n 's/^DB_PASSWORD=//p' "$DIR/.env" | tail -1)"
    { printf '\\set app_user elgos_app\n\\set app_password %s\n\\set db_name elgos\n' "$APP_PW"; cat "$HERE/app-role.sql"; } \
      | env_compose "$ENV" exec -T db psql -U elgos -d elgos -q -tA -v ON_ERROR_STOP=1 >/dev/null
    env_compose "$ENV" up -d --wait --wait-timeout 180 api web
    echo "$(date -u +%FT%TZ) pemulihan env=$ENV sumber=$SRC total=$(elapsed)s" | tee -a "$DIR/deploy.log"
    ;;
  *) sed -n '2,16p' "$0"; exit 1 ;;
esac
