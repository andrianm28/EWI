#!/usr/bin/env bash
# Persiapan sekali di etavm2 untuk staging + prod ELGOS (jalankan dari checkout repo, user dengan sudo):
#   RUNNER_TOKEN=<token registrasi> ACME_EMAIL=<email> deploy/vps/setup-etavm2.sh
# Token registrasi: GitHub repo > Settings > Actions > Runners > New self-hosted runner (berlaku 1 jam).
#
# Hasil:
#   - Docker Engine + compose plugin, firewall ufw (22, 80, 443 saja)
#   - user sistem elgos-deploy (grup docker, tanpa sudo)
#   - /srv/elgos-staging dan /srv/elgos-prod (mode 750) dengan .env dari .env.example (mode 600) bila belum ada
#   - Caddy (deploy/vps/proxy) di /opt/elgos-proxy, TLS otomatis
#   - timer systemd backup harian per lingkungan (02:15 prod, 02:45 staging, WIB = UTC+7)
#   - GitHub Actions runner /opt/actions-runner-elgos, label etavm2,elgos (service systemd)
# Idempoten: aman dijalankan ulang.
set -euo pipefail

REPO="${REPO:-andrianm28/EWI}"
DEPLOY_USER="${DEPLOY_USER:-elgos-deploy}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner-elgos}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Docker + firewall.
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo apt-get install -y -qq curl jq ufw >/dev/null
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow 80/tcp >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw --force enable >/dev/null
# Port yang dipublikasikan Docker melewati ufw; compose ELGOS hanya bind 127.0.0.1, jadi aman.

# 2. User deploy. Grup docker setara root di host ini: hanya runner deploy yang memakai user ini.
id "$DEPLOY_USER" >/dev/null 2>&1 || sudo useradd --system --create-home --shell /bin/bash "$DEPLOY_USER"
sudo usermod -aG docker "$DEPLOY_USER"

# 3. Direktori per lingkungan + .env awal (secret acak dibuat di sini; sisanya isi manual).
for ENV in staging prod; do
  DIR="/srv/elgos-$ENV"
  sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$DIR" "$DIR/backups"
  if ! sudo test -f "$DIR/.env"; then
    if [ "$ENV" = prod ]; then URL=https://elgos.eliteacademy.id PORT=8180; else URL=https://stg-elgos.eliteacademy.id PORT=8181; fi
    sed -e "s|^PUBLIC_URL=.*|PUBLIC_URL=$URL|" -e "s|^WEB_PORT=.*|WEB_PORT=$PORT|" \
        -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
        -e "s|^EWI_JWT_SECRET=.*|EWI_JWT_SECRET=$(openssl rand -hex 48)|" \
        -e "s|^KMS_KEY_ALIAS_PREFIX=.*|KMS_KEY_ALIAS_PREFIX=elgos-$ENV-tenant|" \
        "$SRC/.env.example" | (umask 077 && sudo tee "$DIR/.env" >/dev/null)
    sudo chmod 600 "$DIR/.env" && sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$DIR/.env"
    echo "$DIR/.env dibuat: isi AWS_ACCESS_KEY_ID/SECRET dan ELITEMENTOR_* sebelum deploy pertama."
  fi
done

# 4. Reverse proxy TLS.
sudo install -d -m 755 /opt/elgos-proxy
sudo install -m 644 "$SRC/proxy/Caddyfile" "$SRC/proxy/docker-compose.yml" /opt/elgos-proxy/
(cd /opt/elgos-proxy && sudo ACME_EMAIL="${ACME_EMAIL:?ACME_EMAIL wajib}" docker compose up -d)

# 5. Backup harian (backup.sh disalin ke /srv/elgos-<env> oleh deploy.sh; sebelum deploy pertama
#    timer gagal tanpa efek).
sudo tee /etc/systemd/system/elgos-backup@.service >/dev/null <<UNIT
[Unit]
Description=Backup DB ELGOS %i
[Service]
Type=oneshot
User=$DEPLOY_USER
Environment=ELGOS_ENV=%i
ExecStart=/srv/elgos-%i/backup.sh
UNIT
for ENV in prod staging; do
  if [ "$ENV" = prod ]; then AT="19:15"; else AT="19:45"; fi   # UTC
  sudo tee "/etc/systemd/system/elgos-backup@$ENV.timer" >/dev/null <<UNIT
[Unit]
Description=Backup harian DB ELGOS $ENV
[Timer]
OnCalendar=*-*-* $AT:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
UNIT
done
sudo systemctl daemon-reload
sudo systemctl enable --now elgos-backup@prod.timer elgos-backup@staging.timer

# 6. Runner GitHub Actions (koneksi keluar saja).
if [ ! -f "$RUNNER_DIR/.runner" ]; then
  TOKEN="${RUNNER_TOKEN:?RUNNER_TOKEN wajib (lihat komentar di atas)}"
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
systemctl list-timers 'elgos-backup@*' --no-pager --no-legend
echo "Selesai. Lanjut: isi .env, arahkan DNS ke etavm2, lalu jalankan workflow Deploy."
