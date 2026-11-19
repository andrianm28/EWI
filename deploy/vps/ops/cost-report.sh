#!/usr/bin/env bash
# Laporan biaya AWS mingguan (PO-10 opsi C: tanpa plafon, laporan biaya tiap minggu di cadence).
# Dijalankan elgos-cost-report.timer tiap Senin 08.00 WIB; dikirim ke topik SNS peringatan (email)
# dan dicatat di journal. Biaya 7 hari terakhir per layanan + total bulan berjalan.
# Di luar laporan ini: sewa VPS etavm2 (tetap) dan penyedia suara di luar AWS; biaya token AI per
# tenant ada di analitik admin aplikasi (D13).
#   /srv/elgos-prod/ops/cost-report.sh            kirim laporan
#   CETAK=1 /srv/elgos-prod/ops/cost-report.sh    hanya cetak
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/ops/common.sh
. "$HERE/common.sh"

END="$(date -u +%F)"
START="$(date -u -d '7 days ago' +%F)"
MONTH_START="$(date -u +%Y-%m-01)"
ce() { aws ce get-cost-and-usage --region us-east-1 --granularity DAILY --metrics UnblendedCost "$@"; }

if ! WEEK="$(ce --time-period "Start=$START,End=$END" --group-by Type=DIMENSION,Key=SERVICE --output json 2>&1)"; then
  alert peringatan cost-report "Laporan biaya mingguan gagal diambil: ${WEEK:0:300}"
  exit 1
fi
if [ "$MONTH_START" = "$END" ]; then MONTH='{"ResultsByTime":[]}'; else
  MONTH="$(ce --time-period "Start=$MONTH_START,End=$END" --output json)"
fi

BODY="$(jq -r --arg s "$START" --arg e "$END" --argjson m "$MONTH" '
  [.ResultsByTime[].Groups[] | {svc: .Keys[0], usd: (.Metrics.UnblendedCost.Amount | tonumber)}]
  | group_by(.svc) | map({svc: .[0].svc, usd: (map(.usd) | add)}) | sort_by(-.usd) as $rows
  | ($rows | map(.usd) | add // 0) as $total
  | ([$m.ResultsByTime[].Total.UnblendedCost.Amount | tonumber] | add // 0) as $mtd
  | "Laporan biaya AWS ELGOS \($s) s.d. \($e) (UTC)\n"
    + "Total 7 hari: US$\($total * 100 | round / 100)\n"
    + "Bulan berjalan: US$\($mtd * 100 | round / 100)\n\nPer layanan:\n"
    + ($rows | map(select(.usd >= 0.005)) | map("  \(.svc): US$\(.usd * 100 | round / 100)") | join("\n"))
    + "\n\nTidak termasuk: sewa VPS etavm2, penyedia suara di luar AWS. Token AI per tenant: analitik admin."
' <<<"$WEEK")"

echo "$BODY"
[ "${CETAK:-0}" = 1 ] && exit 0
logger -t elgos-cost-report -- "$(head -3 <<<"$BODY" | tr '\n' ' ')"
if [ -n "${ALERT_TOPIC_ARN:-}" ]; then
  aws sns publish --region "${AWS_REGION:-ap-southeast-1}" --topic-arn "$ALERT_TOPIC_ARN" \
    --subject "[ELGOS] Laporan biaya mingguan $END" --message "$BODY" >/dev/null
fi
