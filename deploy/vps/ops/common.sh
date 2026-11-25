#!/usr/bin/env bash
# Dipakai skrip ops lain (source). Variabel ops host di /etc/elgos/ops.env (dibuat setup-etavm2.sh):
#   ALERT_TOPIC_ARN, BACKUP_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (IAM user
#   elgos-ops-etavm2: hanya PutObject backup + Publish SNS), PROD_URL, STAGING_URL.
OPS_ENV="${OPS_ENV:-/etc/elgos/ops.env}"
# shellcheck disable=SC1090
if [ -r "$OPS_ENV" ]; then set -a; . "$OPS_ENV"; set +a; fi

# Kirim peringatan: selalu ke journal; ke SNS (email) bila ALERT_TOPIC_ARN diisi. Peringatan dengan
# kunci yang sama paling sering sekali per ALERT_DEDUP_MIN menit.
alert() {
  local level="$1" key="$2" msg="$3" stamp now pri=warning
  local dir="${ALERT_STATE_DIR:-/var/tmp/elgos-alert}"
  [ "$level" = kritis ] && pri=crit
  logger -t elgos-alert -p "user.$pri" "[$level] $key: $msg" 2>/dev/null || true
  echo "[$level] $key: $msg" >&2
  mkdir -p "$dir" 2>/dev/null || true
  stamp="$dir/$(printf '%s' "$key" | tr -c 'A-Za-z0-9_-' '_')"
  now="$(date +%s)"
  if [ -f "$stamp" ] && [ $((now - $(cat "$stamp"))) -lt $((${ALERT_DEDUP_MIN:-60} * 60)) ]; then return 0; fi
  echo "$now" > "$stamp" 2>/dev/null || true
  if [ -n "${ALERT_TOPIC_ARN:-}" ] && command -v aws >/dev/null; then
    aws sns publish --topic-arn "$ALERT_TOPIC_ARN" \
      --subject "[ELGOS $level] $(hostname -s): $key" --message "$msg" >/dev/null \
      || logger -t elgos-alert "gagal kirim SNS untuk $key" 2>/dev/null || true
  fi
}

# Pulihkan status "ok" sebuah kunci peringatan (agar peringatan berikutnya langsung terkirim).
alert_clear() {
  rm -f "${ALERT_STATE_DIR:-/var/tmp/elgos-alert}/$(printf '%s' "$1" | tr -c 'A-Za-z0-9_-' '_')" 2>/dev/null || true
}

# Compose untuk satu lingkungan, dari salinan yang dipasang deploy.sh di /srv/elgos-<env>.
env_compose() {
  local env="$1" dir="/srv/elgos-$1"
  [ -n "${ELGOS_DIR:-}" ] && dir="$ELGOS_DIR"
  # shellcheck disable=SC1091
  [ -f "$dir/current.env" ] && . "$dir/current.env"
  ELGOS_ENV="$env" ELGOS_ENV_FILE="$dir/.env" ELGOS_DB_ENV_FILE="$dir/db.env" ELGOS_SECRETS_DIR="$dir/secrets" \
  ELGOS_API_IMAGE="${ELGOS_API_IMAGE:-none}" ELGOS_WEB_IMAGE="${ELGOS_WEB_IMAGE:-none}" \
    docker compose -f "$dir/docker-compose.yml" --env-file "$dir/.env" "${@:2}"
}
