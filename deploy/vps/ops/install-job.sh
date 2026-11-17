#!/usr/bin/env bash
# Pasang job terjadwal aplikasi sebagai timer systemd (PD-15 opsi A). Jalankan dengan sudo di etavm2:
#   sudo deploy/vps/ops/install-job.sh <env> <nama-job> '<OnCalendar>'
#   sudo deploy/vps/ops/install-job.sh prod interview-reminders '*-*-* 01:00:00 UTC'
#   sudo deploy/vps/ops/install-job.sh prod interview-reminders --hapus
# Membuat elgos-job-<env>-<nama>.{service,timer}; job berjalan sebagai elgos-deploy lewat
# /srv/elgos-<env>/ops/run-job.sh (container sekali jalan, image yang sedang aktif).
set -euo pipefail
ENV="${1:?env}"; JOB="${2:?nama-job}"; WHEN="${3:?OnCalendar atau --hapus}"
case "$ENV" in staging | prod) ;; *) echo "env harus staging atau prod"; exit 1 ;; esac
[[ "$JOB" =~ ^[a-z0-9:_-]+$ ]] || { echo "Nama job tidak valid"; exit 1; }
UNIT="elgos-job-$ENV-${JOB//:/-}"
if [ "$WHEN" = --hapus ]; then
  systemctl disable --now "$UNIT.timer" 2>/dev/null || true
  rm -f "/etc/systemd/system/$UNIT.service" "/etc/systemd/system/$UNIT.timer"
  systemctl daemon-reload; echo "$UNIT dihapus"; exit 0
fi
systemd-analyze calendar "$WHEN" >/dev/null
cat > "/etc/systemd/system/$UNIT.service" <<UNITEOF
[Unit]
Description=ELGOS job $JOB ($ENV)
After=docker.service
[Service]
Type=oneshot
User=${DEPLOY_USER:-elgos-deploy}
Environment=ELGOS_ENV=$ENV
ExecStart=/srv/elgos-$ENV/ops/run-job.sh $JOB
TimeoutStartSec=2h
UNITEOF
cat > "/etc/systemd/system/$UNIT.timer" <<UNITEOF
[Unit]
Description=Jadwal ELGOS job $JOB ($ENV)
[Timer]
OnCalendar=$WHEN
Persistent=true
RandomizedDelaySec=30
[Install]
WantedBy=timers.target
UNITEOF
systemctl daemon-reload
systemctl enable --now "$UNIT.timer"
systemctl list-timers "$UNIT.timer" --no-pager
