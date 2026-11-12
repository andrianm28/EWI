#!/usr/bin/env bash
# Persiapan sekali di etavm1 untuk pipeline deploy dev (jalankan sebagai ubuntu, butuh sudo):
#   RUNNER_TOKEN=<token registrasi> deploy/dev-public/setup-etavm1.sh
# Token registrasi: GitHub repo > Settings > Actions > Runners > New self-hosted runner (berlaku 1 jam),
# atau otomatis lewat `gh api` bila gh di VM login dengan akses admin repo.
#
# Hasil:
#   - user sistem ewi-deploy (grup docker, tanpa sudo, tanpa login password)
#   - /srv/ewi-dev milik ewi-deploy: .env (disalin dari deploy manual lama), backups/, deploy.log
#   - /var/www/ewi-mockup bisa ditulis ewi-deploy (mockup ikut pipeline)
#   - GitHub Actions runner di /opt/actions-runner-ewi, label etavm1,ewi-dev, service systemd
# Idempoten: aman dijalankan ulang (runner yang sudah terpasang dilewati).
set -euo pipefail

REPO="${REPO:-andrianm28/EWI}"
DEPLOY_USER="${DEPLOY_USER:-ewi-deploy}"
DIR="${EWI_DEV_DIR:-/srv/ewi-dev}"
OLD_ENV="${OLD_ENV:-$HOME/ewi/deploy/dev-public/.env}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner-ewi}"
MOCKUP_DST="${MOCKUP_DST:-/var/www/ewi-mockup}"

sudo apt-get install -y -qq curl jq >/dev/null

# 1. User deploy. Anggota grup docker setara root di host ini; terima untuk VM dev, jangan dipakai
#    untuk prod. Tidak diberi sudo.
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  sudo useradd --system --create-home --shell /bin/bash "$DEPLOY_USER"
fi
sudo usermod -aG docker "$DEPLOY_USER"

# 2. Direktori status + secret.
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$DIR" "$DIR/backups"
if ! sudo test -f "$DIR/.env"; then
  [ -f "$OLD_ENV" ] || { echo "Tidak ada $OLD_ENV; buat $DIR/.env dari .env.example dulu"; exit 1; }
  sudo install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 600 "$OLD_ENV" "$DIR/.env"
  # Tunnel tidak dipakai lagi; URL publik tetap lewat nginx host.
  sudo sed -i -e '/^COMPOSE_PROFILES=/d' -e '/^CLOUDFLARE_TUNNEL_TOKEN=/d' "$DIR/.env"
  echo ".env disalin ke $DIR/.env"
fi

# 3. Mockup statis: tetap dilayani nginx host di /mockup/, isinya kini ditulis pipeline.
sudo install -d -m 755 "$MOCKUP_DST"
sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$MOCKUP_DST"

# 4. Runner GitHub Actions (koneksi keluar saja; tidak ada port masuk yang dibuka).
if [ ! -f "$RUNNER_DIR/.runner" ]; then
  TOKEN="${RUNNER_TOKEN:-}"
  if [ -z "$TOKEN" ] && command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    TOKEN="$(gh api -X POST "repos/$REPO/actions/runners/registration-token" -q .token)"
  fi
  [ -n "$TOKEN" ] || { echo "Set RUNNER_TOKEN (lihat komentar di atas)"; exit 1; }
  RUNNER_VERSION="${RUNNER_VERSION:-$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')}"
  sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$RUNNER_DIR"
  sudo -u "$DEPLOY_USER" bash -c "cd '$RUNNER_DIR' && curl -fsSL -o runner.tgz \
    https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz \
    && tar xzf runner.tgz && rm runner.tgz"
  sudo -u "$DEPLOY_USER" "$RUNNER_DIR/config.sh" --unattended --replace \
    --url "https://github.com/$REPO" --token "$TOKEN" \
    --name etavm1-ewi-dev --labels etavm1,ewi-dev --work _work
  (cd "$RUNNER_DIR" && sudo ./svc.sh install "$DEPLOY_USER" && sudo ./svc.sh start)
fi

sudo -u "$DEPLOY_USER" docker ps >/dev/null && echo "OK: $DEPLOY_USER bisa menjalankan docker"
systemctl list-units 'actions.runner.*' --no-pager --no-legend
echo "Selesai. Deploy pertama: push/merge ke branch dev, atau Actions > Deploy dev > Run workflow."
