#!/usr/bin/env bash
# Pemantau di etavm2 (timer tiap 5 menit, PK-21, menutup N-3 + sebagian P1-13). Memeriksa:
#   - disk / dan data Docker (peringatan >= 80%, kritis >= 90%)
#   - container db/api/web tiap lingkungan berjalan dan sehat, Caddy berjalan
#   - kesiapan aplikasi lokal (/api/ready, jatuh ke /api/health bila belum ada)
#   - umur backup terakhir (prod: 2 jam di jam kerja, 26 jam di luar; staging: 26 jam)
# Pemantau dari luar (uptime HTTPS) ada di Terraform (Route 53 health check) dan tidak bergantung
# pada server ini.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/ops/common.sh
. "$HERE/common.sh"
ENVS="${ELGOS_ENVS:-prod staging}"
NOW="$(date -u +%s)"
problems=0

check_disk() {
  local path="$1" pct
  [ -e "$path" ] || return 0
  pct="$(df -P "$path" | awk 'NR==2 {gsub("%","",$5); print $5}')"
  if [ "$pct" -ge 90 ]; then alert kritis "disk-$path" "Disk $path terpakai $pct%"; problems=1
  elif [ "$pct" -ge 80 ]; then alert peringatan "disk-$path" "Disk $path terpakai $pct%"; problems=1
  else alert_clear "disk-$path"; fi
}
check_disk /
check_disk /var/lib/docker

if ! docker ps --format '{{.Names}}' | grep -q '^elgos-proxy-caddy-1$'; then
  alert kritis caddy "Container Caddy (reverse proxy TLS) tidak berjalan"; problems=1
fi

work_hours() {   # Senin-Jumat 08.00-18.59 WIB = 01.00-11.59 UTC
  local d h; d="$(date -u +%u)"; h="$(date -u +%H)"
  [ "$d" -le 5 ] && [ "${h#0}" -ge 1 ] && [ "${h#0}" -le 11 ]
}

for env in $ENVS; do
  dir="/srv/elgos-$env"
  [ -f "$dir/current.env" ] || continue          # belum pernah dideploy
  for svc in db api web; do
    state="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "elgos-$env-$svc-1" 2>/dev/null || echo 'hilang -')"
    case "$state" in
      "running healthy" | "running -") alert_clear "container-$env-$svc" ;;
      *) alert kritis "container-$env-$svc" "Container $svc ($env) tidak sehat: $state"; problems=1 ;;
    esac
  done
  port="$(sed -n 's/^WEB_PORT=//p' "$dir/.env" | tail -1 | tr -d '"'"'"' \r')"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/api/ready" || true)"
  if [[ "$code" =~ ^40[0-9]$ ]]; then code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/api/health" || true)"; fi
  if [ "$code" = 200 ]; then alert_clear "ready-$env"; else alert kritis "ready-$env" "Aplikasi $env tidak siap (HTTP $code)"; problems=1; fi

  last="$(cat "$dir/backups/last-success" 2>/dev/null || echo 0)"
  max=$((26 * 3600))
  if [ "$env" = prod ] && work_hours; then max=$((2 * 3600)); fi
  if [ $((NOW - last)) -gt "$max" ]; then
    alert kritis "backup-umur-$env" "Backup $env terakhir sukses $(( (NOW - last) / 3600 )) jam lalu"; problems=1
  else alert_clear "backup-umur-$env"; fi
done

exit "$problems"
