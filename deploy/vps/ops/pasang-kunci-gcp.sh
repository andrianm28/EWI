#!/usr/bin/env bash
# Pasang kunci service account GCP suara (B19) untuk container API satu lingkungan.
#   sudo /srv/elgos-<env>/ops/pasang-kunci-gcp.sh <staging|prod> [/etc/elgos/gcp-voice.json]
# Sumber tetap di /etc/elgos (root, 0600). Salinan untuk container: /srv/elgos-<env>/secrets/
# gcp-voice.json, milik uid 1000 (user node di image API), mode 0400; user elgos-deploy dan elgos-dev
# tidak bisa membacanya. Isi kunci tidak pernah dicetak.
set -euo pipefail
ENV="${1:?pakai: pasang-kunci-gcp.sh <staging|prod> [sumber]}"
SUMBER="${2:-/etc/elgos/gcp-voice.json}"
case "$ENV" in staging|prod) ;; *) echo "lingkungan tidak dikenal: $ENV" >&2; exit 2 ;; esac
[ "$(id -u)" = 0 ] || { echo "jalankan dengan sudo" >&2; exit 1; }
[ -s "$SUMBER" ] || { echo "sumber kunci tidak ada/kosong: $SUMBER" >&2; exit 1; }
jq -e '.type == "service_account" and (.client_email | length > 0)' "$SUMBER" >/dev/null \
  || { echo "sumber bukan kunci service account" >&2; exit 1; }
DIR="${ELGOS_DIR:-/srv/elgos-$ENV}"
APP_UID="${APP_UID:-1000}"
install -d -m 750 -o elgos-deploy -g elgos-deploy "$DIR/secrets"
install -m 400 -o "$APP_UID" -g "$APP_UID" "$SUMBER" "$DIR/secrets/gcp-voice.json"
echo "Kunci GCP ($(jq -r .client_email "$SUMBER")) terpasang untuk $ENV."
echo "Aktifkan di $DIR/.env: GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcp-voice.json, lalu deploy ulang."
