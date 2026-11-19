#!/usr/bin/env bash
# Persiapan sekali di etavm2 untuk staging + prod ELGOS (jalankan dari checkout repo, user dengan sudo):
#   RUNNER_TOKEN=<token registrasi> ACME_EMAIL=<email> deploy/vps/setup-etavm2.sh
# Keduanya opsional: tanpa ACME_EMAIL Caddy belum dijalankan, tanpa RUNNER_TOKEN runner belum dipasang.
# Token registrasi: GitHub repo > Settings > Actions > Runners > New self-hosted runner (berlaku 1 jam).
#
# Hasil:
#   - Docker Engine + compose plugin, rotasi log Docker (N-3), AWS CLI v2
#   - pengerasan dasar (N-6): SSH hanya kunci, root tidak bisa login, pembaruan keamanan otomatis,
#     fail2ban untuk SSH, ufw hanya 22/80/443
#   - user sistem elgos-deploy (grup docker, tanpa sudo)
#   - /srv/elgos-staging dan /srv/elgos-prod (750): .env (aplikasi) dan db.env (pemilik DB), 600,
#     dengan secret acak bila belum ada
#   - /etc/elgos/ops.env (640): kredensial user ops (backup ke S3 + peringatan SNS), isi manual
#   - Caddy (deploy/vps/proxy) di /opt/elgos-proxy, TLS otomatis
#   - timer systemd: backup prod tiap jam kerja + malam, backup staging malam, pemantau tiap 5 menit,
#     laporan biaya AWS tiap Senin (PO-10 C)
#   - GitHub Actions runner /opt/actions-runner-elgos, label etavm2,elgos
#   - dev per worktree (keputusan 17 Nov "dev di sini"): user elgos-dev dengan Docker rootless sendiri,
#     terpisah dari daemon staging/prod, dibatasi slice systemd (SETUP_DEV=0 untuk melewati)
# Idempoten: aman dijalankan ulang. Daftar pemegang akses: docs/infra/akses-etavm2.md.
set -euo pipefail

REPO="${REPO:-andrianm28/EWI}"
DEPLOY_USER="${DEPLOY_USER:-elgos-deploy}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner-elgos}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_USER="${SUDO_USER:-$(id -un)}"

# 0. Jangan mengunci diri sendiri: SSH hanya-kunci butuh authorized_keys untuk admin yang menjalankan.
ADMIN_HOME="$(getent passwd "$ADMIN_USER" | cut -d: -f6)"
if ! sudo test -s "$ADMIN_HOME/.ssh/authorized_keys"; then
  echo "Berhenti: $ADMIN_HOME/.ssh/authorized_keys kosong. Pasang kunci SSH dulu sebelum login password dimatikan."
  exit 1
fi

# 1. Paket dasar, Docker, AWS CLI.
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl jq ufw unzip fail2ban unattended-upgrades >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
if ! command -v aws >/dev/null; then
  # /tmp di etavm2 di-mount noexec, jadi installer diekstrak di $HOME. Gagal = skrip berhenti.
  tmp="$(mktemp -d -p "$HOME")"
  curl -fsSL -o "$tmp/awscliv2.zip" "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip"
  unzip -q "$tmp/awscliv2.zip" -d "$tmp"
  sudo "$tmp/aws/install"
  rm -rf "$tmp"
  aws --version
fi

# 2. Rotasi log Docker untuk semua container (compose ELGOS juga mengaturnya per service).
if ! sudo test -f /etc/docker/daemon.json; then
  echo '{"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"5"},"live-restore":true}' \
    | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl restart docker
fi

# 3. Pengerasan dasar (N-6).
sudo tee /etc/ssh/sshd_config.d/10-elgos.conf >/dev/null <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
CONF
sudo sshd -t
sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd
sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
sudo tee /etc/fail2ban/jail.d/elgos.local >/dev/null <<'CONF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
CONF
sudo systemctl enable --now unattended-upgrades fail2ban >/dev/null
sudo ufw default deny incoming >/dev/null
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow 80/tcp >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw --force enable >/dev/null
# Port yang dipublikasikan Docker melewati ufw; compose ELGOS hanya bind 127.0.0.1, jadi aman.

# 4. User deploy. Grup docker setara root di host ini: hanya runner deploy yang memakai user ini.
id "$DEPLOY_USER" >/dev/null 2>&1 || sudo useradd --system --create-home --shell /bin/bash "$DEPLOY_USER"
sudo usermod -aG docker "$DEPLOY_USER"

# 5. Direktori per lingkungan + secret acak (sisanya isi manual).
write_secret_file() {   # write_secret_file <path> < isi
  sudo install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 600 /dev/null "$1"
  sudo tee "$1" >/dev/null
}
for ENV in staging prod; do
  DIR="/srv/elgos-$ENV"
  sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$DIR" "$DIR/backups"
  if ! sudo test -f "$DIR/db.env"; then
    sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
        -e "s|^DB_MIGRATION_PASSWORD=.*|DB_MIGRATION_PASSWORD=$(openssl rand -hex 24)|" \
        "$SRC/db.env.example" | write_secret_file "$DIR/db.env"
  fi
  if ! sudo test -f "$DIR/.env"; then
    if [ "$ENV" = prod ]; then URL=https://elgos.eliteacademy.id PORT=8180; else URL=https://stg-elgos.eliteacademy.id PORT=8181; fi
    sed -e "s|^PUBLIC_URL=.*|PUBLIC_URL=$URL|" -e "s|^WEB_PORT=.*|WEB_PORT=$PORT|" \
        -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" \
        -e "s|^EWI_JWT_SECRET=.*|EWI_JWT_SECRET=$(openssl rand -hex 48)|" \
        -e "s|^KMS_KEY_ALIAS_PREFIX=.*|KMS_KEY_ALIAS_PREFIX=elgos-$ENV-tenant|" \
        "$SRC/.env.example" \
      | if [ "$ENV" = staging ]; then
          # Staging lebih kecil agar prod + staging + dev per worktree muat di 8 vCPU / 32 GB.
          sed -e 's|^# DB_CPUS=.*|DB_CPUS=1|' -e 's|^# DB_MEMORY=.*|DB_MEMORY=2g|' \
              -e 's|^# PG_SHARED_BUFFERS=.*|PG_SHARED_BUFFERS=256MB|' -e 's|^# PG_EFFECTIVE_CACHE=.*|PG_EFFECTIVE_CACHE=1GB|' \
              -e 's|^# API_CPUS=.*|API_CPUS=1|' -e 's|^# API_MEMORY=.*|API_MEMORY=1g|'
        else cat; fi \
      | write_secret_file "$DIR/.env"
    echo "$DIR/.env dibuat: isi AWS_ACCESS_KEY_ID/SECRET, ELITEMENTOR_* dan ETA_ADMIN_EMAILS (wajib di prod) sebelum deploy pertama."
  fi
done

# 6. Kredensial ops host (backup S3 + peringatan SNS). Dibaca elgos-deploy, bukan container.
sudo install -d -m 750 -o root -g "$DEPLOY_USER" /etc/elgos
if ! sudo test -f /etc/elgos/ops.env; then
  sudo install -m 640 -o root -g "$DEPLOY_USER" /dev/null /etc/elgos/ops.env
  sudo tee /etc/elgos/ops.env >/dev/null <<'CONF'
# Output Terraform live/shared: backup_bucket, alert_topic_arn. Access key user elgos-ops-etavm2
# dibuat lewat CLI (docs/infra/vps-etavm2.md). Kosong = backup hanya lokal (prod menolak) dan
# peringatan hanya ke journal.
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
BACKUP_BUCKET=
ALERT_TOPIC_ARN=
CONF
  echo "/etc/elgos/ops.env dibuat: isi setelah Terraform live/shared di-apply."
fi

# 7. Reverse proxy TLS.
sudo install -d -m 755 /opt/elgos-proxy
sudo install -m 644 "$SRC/proxy/Caddyfile" "$SRC/proxy/docker-compose.yml" /opt/elgos-proxy/
# Dilewati bila ACME_EMAIL kosong (misalnya DNS belum diarahkan); jalankan ulang skrip setelah DNS siap.
if [ -n "${ACME_EMAIL:-}" ]; then
  (cd /opt/elgos-proxy && sudo ACME_EMAIL="$ACME_EMAIL" docker compose up -d)
else
  echo "Caddy dilewati: ACME_EMAIL kosong. Jalankan ulang dengan ACME_EMAIL=<email> setelah DNS elgos/stg-elgos mengarah ke server ini."
fi

# 8. Timer systemd. Skrip ops disalin ke /srv/elgos-<env>/ops oleh deploy.sh; sebelum deploy pertama
#    timer gagal tanpa efek (dan pemantau melewati lingkungan yang belum pernah dideploy).
sudo tee /etc/systemd/system/elgos-alert@.service >/dev/null <<UNIT
[Unit]
Description=Peringatan unit ELGOS gagal: %i
[Service]
Type=oneshot
User=$DEPLOY_USER
ExecStart=/bin/bash -c '. /srv/elgos-prod/ops/common.sh 2>/dev/null || . /srv/elgos-staging/ops/common.sh; alert kritis "unit-%i" "Unit systemd %i gagal di \$(hostname -s). Cek: journalctl -u %i"'
UNIT
sudo tee /etc/systemd/system/elgos-backup@.service >/dev/null <<UNIT
[Unit]
Description=Backup DB ELGOS %I
OnFailure=elgos-alert@%n.service
[Service]
Type=oneshot
User=$DEPLOY_USER
UNIT
# Instance: <env>-<jenis>, mis. prod-hourly. ELGOS_ENV dan perintah diisi drop-in per instance.
timer() {   # timer <nama-instance> <OnCalendar>
  local inst="$1" when="$2" env="${1%%-*}"
  sudo install -d "/etc/systemd/system/elgos-backup@$inst.service.d"
  printf '[Service]\nEnvironment=ELGOS_ENV=%s\nExecStart=/srv/elgos-%s/ops/backup.sh %s\n' \
    "$env" "$env" "${inst#*-}" | sudo tee "/etc/systemd/system/elgos-backup@$inst.service.d/env.conf" >/dev/null
  printf '[Unit]\nDescription=Jadwal backup ELGOS %s\n[Timer]\nOnCalendar=%s\nPersistent=true\n[Install]\nWantedBy=timers.target\n' \
    "$inst" "$when" | sudo tee "/etc/systemd/system/elgos-backup@$inst.timer" >/dev/null
}
timer prod-hourly  "Mon..Fri *-*-* 01..11:05:00 UTC"   # 08.05-18.05 WIB (PD-20 opsi A)
timer prod-nightly "*-*-* 19:15:00 UTC"                # 02.15 WIB
timer staging-nightly "*-*-* 19:45:00 UTC"             # 02.45 WIB
sudo tee /etc/systemd/system/elgos-monitor.service >/dev/null <<UNIT
[Unit]
Description=Pemantau ELGOS (disk, container, kesiapan, umur backup)
[Service]
Type=oneshot
User=$DEPLOY_USER
ExecStart=/bin/bash -c 'for d in /srv/elgos-prod /srv/elgos-staging; do [ -x \$d/ops/monitor.sh ] && exec \$d/ops/monitor.sh; done; exit 0'
SuccessExitStatus=1
UNIT
printf '[Unit]\nDescription=Pemantau ELGOS tiap 5 menit\n[Timer]\nOnCalendar=*:0/5\n[Install]\nWantedBy=timers.target\n' \
  | sudo tee /etc/systemd/system/elgos-monitor.timer >/dev/null
# Laporan biaya AWS mingguan (PO-10 C), Senin 08.00 WIB.
sudo tee /etc/systemd/system/elgos-cost-report.service >/dev/null <<UNIT
[Unit]
Description=Laporan biaya AWS ELGOS mingguan
[Service]
Type=oneshot
User=$DEPLOY_USER
ExecStart=/bin/bash -c '[ -x /srv/elgos-prod/ops/cost-report.sh ] && exec /srv/elgos-prod/ops/cost-report.sh; exit 0'
UNIT
printf '[Unit]\nDescription=Laporan biaya ELGOS tiap Senin\n[Timer]\nOnCalendar=Mon *-*-* 01:00:00 UTC\nPersistent=true\n[Install]\nWantedBy=timers.target\n' \
  | sudo tee /etc/systemd/system/elgos-cost-report.timer >/dev/null
sudo rm -f /etc/systemd/system/elgos-backup@prod.timer /etc/systemd/system/elgos-backup@staging.timer
sudo systemctl daemon-reload
sudo systemctl enable --now elgos-backup@prod-hourly.timer elgos-backup@prod-nightly.timer \
  elgos-backup@staging-nightly.timer elgos-monitor.timer elgos-cost-report.timer

# Job aplikasi harian (PD-15 A), staging + prod: node scripts/run-job.js <nama> di image API aktif.
#   interview-reminders     08.00 WIB (PK-23, PR #12)
#   import-batches-cleanup  03.30 WIB, setelah backup malam (PK-15, PR #11; IMPORT_BATCH_TTL_DAYS bawaan 7)
for ENV in staging prod; do
  sudo "$SRC/ops/install-job.sh" "$ENV" interview-reminders '*-*-* 01:00:00 UTC' >/dev/null
  sudo "$SRC/ops/install-job.sh" "$ENV" import-batches-cleanup '*-*-* 20:30:00 UTC' >/dev/null
done

# 9. Dev per worktree. Daemon Docker rootless milik elgos-dev: container dev tidak bisa melihat atau
#    menyentuh container, volume, dan secret staging/prod (grup docker utama setara root, jadi user
#    dev sengaja TIDAK masuk grup itu). Seluruh dev dibatasi slice: maksimal 4 vCPU dan 10 GB RAM.
if [ "${SETUP_DEV:-1}" = 1 ]; then
  DEV_USER="${DEV_USER:-elgos-dev}"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq uidmap dbus-user-session docker-ce-rootless-extras >/dev/null
  id "$DEV_USER" >/dev/null 2>&1 || sudo useradd --create-home --shell /bin/bash "$DEV_USER"
  sudo gpasswd -d "$DEV_USER" docker >/dev/null 2>&1 || true
  DEV_UID="$(id -u "$DEV_USER")"
  # cgroup v2: izinkan batas cpu/memori per container di daemon rootless.
  sudo install -d /etc/systemd/system/user@.service.d
  printf '[Service]\nDelegate=cpu cpuset io memory pids\n' | sudo tee /etc/systemd/system/user@.service.d/delegate.conf >/dev/null
  sudo install -d "/etc/systemd/system/user-$DEV_UID.slice.d"
  printf '[Slice]\nCPUQuota=400%%\nMemoryMax=10G\nTasksMax=4096\n' | sudo tee "/etc/systemd/system/user-$DEV_UID.slice.d/50-elgos-dev.conf" >/dev/null
  sudo systemctl daemon-reload
  sudo loginctl enable-linger "$DEV_USER"
  for _ in $(seq 1 20); do sudo test -S "/run/user/$DEV_UID/bus" && break; sleep 1; done
  # Skrip lewat stdin: `sudo -i ... bash -c '<multi-baris>'` meng-escape newline sehingga blok tidak jalan.
  sudo -u "$DEV_USER" -H env XDG_RUNTIME_DIR="/run/user/$DEV_UID" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$DEV_UID/bus" PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
    bash -s <<'DEVEOF'
set -euo pipefail
cd "$HOME"
mkdir -p ~/.config/docker
[ -f ~/.config/docker/daemon.json ] || echo '{"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"3"}}' > ~/.config/docker/daemon.json
systemctl --user is-active -q docker 2>/dev/null || dockerd-rootless-setuptool.sh install >/dev/null
systemctl --user enable -q docker
grep -q DOCKER_HOST ~/.profile || echo 'export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock' >> ~/.profile
grep -q DOCKER_HOST ~/.bashrc || sed -i '1i export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock' ~/.bashrc
DOCKER_HOST="unix://$XDG_RUNTIME_DIR/docker.sock" docker info --format 'Docker rootless elgos-dev: {{.ServerVersion}}, rootless={{range .SecurityOptions}}{{.}} {{end}}'
DEVEOF
  sudo install -d -o "$DEV_USER" -g "$DEV_USER" -m 700 "/home/$DEV_USER/.ssh"
  echo "Dev: user $DEV_USER (Docker rootless). Tambahkan kunci SSH pengembang ke /home/$DEV_USER/.ssh/authorized_keys."
fi

# 10. Runner GitHub Actions (koneksi keluar saja).
if [ ! -f "$RUNNER_DIR/.runner" ] && [ -z "${RUNNER_TOKEN:-}" ]; then
  echo "Runner dilewati: RUNNER_TOKEN kosong. Jalankan ulang dengan RUNNER_TOKEN=<token> untuk memasangnya."
elif [ ! -f "$RUNNER_DIR/.runner" ]; then
  TOKEN="$RUNNER_TOKEN"
  RUNNER_VERSION="${RUNNER_VERSION:-$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')}"
  sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$RUNNER_DIR"
  sudo -u "$DEPLOY_USER" bash -c "cd '$RUNNER_DIR' && curl -fsSL -o runner.tgz \
    https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz \
    && tar xzf runner.tgz && rm runner.tgz"
  sudo -u "$DEPLOY_USER" "$RUNNER_DIR/config.sh" --unattended --replace \
    --url "https://github.com/$REPO" --token "$TOKEN" \
    --name etavm2-elgos --labels etavm2,elgos --work _work
  (cd "$RUNNER_DIR" && sudo ./svc.sh install "$DEPLOY_USER" && sudo ./svc.sh start)
fi

sudo -u "$DEPLOY_USER" docker ps >/dev/null && echo "OK: $DEPLOY_USER bisa menjalankan docker"
systemctl list-timers 'elgos-*' --no-pager --no-legend
echo "Selesai. Lanjut: isi .env dan /etc/elgos/ops.env, arahkan DNS ke etavm2, catat akses di"
echo "docs/infra/akses-etavm2.md, lalu jalankan workflow Deploy."
