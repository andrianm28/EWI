#!/usr/bin/env bash
# Menjalankan job terjadwal aplikasi sebagai container sekali jalan (PD-15 opsi A):
#   ELGOS_ENV=prod /srv/elgos-prod/ops/run-job.sh <npm-script> [argumen...]
# Contoh: run-job.sh job:analisis-wawancara. Dipanggil unit elgos-job-<env>-<nama>.service yang
# dipasang install-job.sh. Satu job yang sama tidak berjalan ganda (flock). Gagal = peringatan.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/ops/common.sh
. "$HERE/common.sh"
ENV="${ELGOS_ENV:?ELGOS_ENV wajib staging atau prod}"
JOB="${1:?pakai: run-job.sh <npm-script> [argumen...]}"
shift
[[ "$JOB" =~ ^[a-z0-9:_-]+$ ]] || { echo "Nama job tidak valid: $JOB"; exit 1; }
LOCK="/tmp/elgos-job-$ENV-${JOB//:/_}.lock"
exec 9>"$LOCK"
flock -n 9 || { echo "Job $JOB ($ENV) masih berjalan, dilewati"; exit 0; }
start="$(date +%s)"
if env_compose "$ENV" run --rm --no-deps -T api docker-entrypoint.sh npm run --silent "$JOB" -- "$@"; then
  alert_clear "job-$ENV-$JOB"
  echo "Job $JOB ($ENV) selesai dalam $(( $(date +%s) - start )) detik"
else
  code=$?
  alert kritis "job-$ENV-$JOB" "Job $JOB ($ENV) gagal (exit $code) setelah $(( $(date +%s) - start )) detik"
  exit "$code"
fi
