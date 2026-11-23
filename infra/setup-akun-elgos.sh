#!/usr/bin/env bash
# Wizard akun AWS ELGOS + Bedrock untuk QA malam (B18). Jalankan dari laptop admin (BUKAN etavm1),
# di root repo:  bash infra/setup-akun-elgos.sh
# Nilai non-rahasia disimpan di infra/.akun-elgos.env (diabaikan git). Tidak ada secret yang diminta.
# Everything above the "STAGES" marker is the wizard library: do not hand-edit
# it. Author the per-step stages below the marker.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library: delightful, consistent UX, identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()    # KEYs written to ENV_FILE this run
WRITTEN_SECRET=() # secret NAMEs set this run
SKIPPED=()        # things we couldn't do (e.g. gh missing)

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

# banner "Title" shows the opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later, since it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
# Clearing keeps only the current step on screen.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." prints a plain instruction line.
say()  { printf '  %s\n' "$1"; }
# step "..." is a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser; visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# pause "msg" waits for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" is a y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY: current value of KEY in ENV_FILE, if any.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

# ask KEY "Prompt" reads a value into $KEY. Offers the existing .env value as
# a default on re-runs (Enter keeps it). Visible input (non-secret).
ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# ask_secret KEY "Prompt" is like ask, but input is hidden.
ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# write_env KEY VALUE upserts KEY=VALUE into ENV_FILE (creates it; replaces
# any existing line). Idempotent.
write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

# set_secret NAME VALUE sets a GitHub Actions repo secret via gh. Falls back
# to a warning (and records it) if gh is unavailable or unauthenticated.
set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name: gh not ready; set it later"
}

# set_var NAME VALUE sets a GitHub Actions repo variable (non-secret).
set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name, gh not ready; set it later"
}

# finish clears, then shows a closing summary of everything configured.
finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES
# ──────────────────────────────────────────────────────────────────────────

TOTAL_STAGES=8
ENV_FILE="infra/.akun-elgos.env"
REPO="andrianm28/EWI"
ETAVM2_IP_DEFAULT="103.92.214.141"

[[ -d infra/bootstrap ]] || { echo "Jalankan dari root repo EWI."; exit 1; }

banner "Akun AWS ELGOS + Bedrock untuk QA malam"

# ── 1 ─────────────────────────────────────────────────────────────────────
stage "Prasyarat dan login akun management"
say "Butuh: aws CLI v2, terraform >= 1.10, gh (login ke $REPO), jq."
for c in aws terraform gh jq; do command -v "$c" >/dev/null || warn "belum terpasang: $c"; done
step "Login SSO admin ke akun management Elitery, mis.: aws sso login --profile eta-andrian"
ask MGMT_PROFILE "Nama profil AWS akun management:"
write_env MGMT_PROFILE "$MGMT_PROFILE"
aws sts get-caller-identity --profile "$MGMT_PROFILE" --query Account --output text \
  || { warn "profil belum login"; exit 1; }
pause

# ── 2 ─────────────────────────────────────────────────────────────────────
stage "Akun AWS ELGOS"
say "Akun anggota organisasi khusus ELGOS. Bila sudah ada, isi ID-nya; bila belum, wizard membuatnya."
ask ELGOS_ACCOUNT_ID "ID akun ELGOS (kosongkan bila belum ada):"
if [[ -z "$ELGOS_ACCOUNT_ID" ]]; then
  ask ROOT_EMAIL "Email root akun ELGOS (belum dipakai akun AWS lain):"
  write_env ROOT_EMAIL "$ROOT_EMAIL"
  warn "Membuat akun AWS tidak bisa dibatalkan cepat (penutupan akun butuh 90 hari)."
  if confirm "Buat akun 'ELGOS' dengan email root $ROOT_EMAIL?"; then
    REQ=$(aws organizations create-account --profile "$MGMT_PROFILE" --email "$ROOT_EMAIL" \
      --account-name ELGOS --query CreateAccountStatus.Id --output text)
    for _ in $(seq 1 60); do
      read -r STATE ELGOS_ACCOUNT_ID < <(aws organizations describe-create-account-status --profile "$MGMT_PROFILE" \
        --create-account-request-id "$REQ" --query 'CreateAccountStatus.[State,AccountId]' --output text)
      [[ "$STATE" != IN_PROGRESS ]] && break; sleep 10
    done
    [[ "$STATE" == SUCCEEDED ]] || { warn "pembuatan akun: $STATE"; exit 1; }
  else
    warn "dibatalkan"; exit 1
  fi
fi
write_env ELGOS_ACCOUNT_ID "$ELGOS_ACCOUNT_ID"
pause

# ── 3 ─────────────────────────────────────────────────────────────────────
stage "Profil admin akun ELGOS"
say "Profil elgos-admin memakai role OrganizationAccountAccessRole dari profil management."
aws configure set profile.elgos-admin.role_arn "arn:aws:iam::${ELGOS_ACCOUNT_ID}:role/OrganizationAccountAccessRole"
aws configure set profile.elgos-admin.source_profile "$MGMT_PROFILE"
aws configure set profile.elgos-admin.region ap-southeast-1
aws sts get-caller-identity --profile elgos-admin --query Arn --output text \
  || { warn "gagal masuk akun ELGOS; tunggu beberapa menit setelah akun dibuat lalu jalankan ulang"; exit 1; }
note "Aktifkan juga Cost Explorer: Billing > Cost Explorer (untuk laporan biaya mingguan)."
pause

# ── 4 ─────────────────────────────────────────────────────────────────────
stage "Region Jakarta (PD-2b)"
say "ap-southeast-3 adalah region opt-in; diaktifkan dulu agar Bedrock Jakarta bisa dicek."
ST=$(aws account get-region-opt-status --profile elgos-admin --region-name ap-southeast-3 --query RegionOptStatus --output text || echo UNKNOWN)
if [[ "$ST" != ENABLED && "$ST" != ENABLED_BY_DEFAULT ]]; then
  aws account enable-region --profile elgos-admin --region-name ap-southeast-3 || warn "enable-region gagal"
  say "Mengaktifkan region bisa butuh beberapa menit sampai jam."
  for _ in $(seq 1 30); do
    ST=$(aws account get-region-opt-status --profile elgos-admin --region-name ap-southeast-3 --query RegionOptStatus --output text)
    [[ "$ST" == ENABLED ]] && break; sleep 20
  done
fi
note "Status ap-southeast-3: $ST"
pause

# ── 5 ─────────────────────────────────────────────────────────────────────
stage "Bootstrap Terraform (state + OIDC GitHub)"
say "Membuat bucket state elgos-tfstate-$ELGOS_ACCOUNT_ID, provider OIDC GitHub, role plan/apply."
if confirm "Jalankan terraform apply di infra/bootstrap dengan profil elgos-admin?"; then
  ( cd infra/bootstrap && AWS_PROFILE=elgos-admin terraform init -input=false \
    && AWS_PROFILE=elgos-admin terraform apply -var "github_repo=$REPO" )
  printf 'bucket = "elgos-tfstate-%s"\n' "$ELGOS_ACCOUNT_ID" > infra/live/backend.hcl
  note "infra/live/backend.hcl ditulis. State lokal infra/bootstrap/terraform.tfstate: simpan di brankas tim."
fi
pause

# ── 6 ─────────────────────────────────────────────────────────────────────
stage "Akses model Claude di Bedrock"
ask QA_BEDROCK_REGION "Region QA (ap-southeast-3 Jakarta; ap-southeast-1 bila Claude tidak ada di Jakarta):"
open_url "https://${QA_BEDROCK_REGION}.console.aws.amazon.com/bedrock/home?region=${QA_BEDROCK_REGION}#/model-catalog"
step "Masuk konsol sebagai akun ELGOS (switch role ke OrganizationAccountAccessRole, akun $ELGOS_ACCOUNT_ID)."
step "Buka model Claude yang dipakai aplikasi; bila diminta, isi formulir use case Anthropic (sekali per akun)."
pause "Sudah? Enter untuk melihat model dan profil yang tersedia"
aws bedrock list-foundation-models --profile elgos-admin --region "$QA_BEDROCK_REGION" --by-provider anthropic \
  --query 'modelSummaries[].[modelId,join(`,`,inferenceTypesSupported)]' --output table || true
aws bedrock list-inference-profiles --profile elgos-admin --region "$QA_BEDROCK_REGION" \
  --query "inferenceProfileSummaries[?contains(inferenceProfileId,'anthropic')].inferenceProfileId" --output table || true
note "ON_DEMAND = bisa dipanggil langsung. Bila hanya INFERENCE_PROFILE, isi juga ID profil (mis. apac.anthropic...)."
note "Profil apac. memproses data di region APAC lain: catat untuk keputusan residensi data (PD-2)."
ask QA_BEDROCK_MODEL_ID "ID model dasar (anthropic....):"
ask QA_INFERENCE_PROFILE_ID "ID inference profile (kosong bila ON_DEMAND):"
write_env QA_BEDROCK_REGION "$QA_BEDROCK_REGION"
write_env QA_BEDROCK_MODEL_ID "$QA_BEDROCK_MODEL_ID"
write_env QA_INFERENCE_PROFILE_ID "$QA_INFERENCE_PROFILE_ID"
if confirm "Uji satu panggilan kecil (biaya < US\$0,01)?"; then
  aws bedrock-runtime converse --profile elgos-admin --region "$QA_BEDROCK_REGION" \
    --model-id "${QA_INFERENCE_PROFILE_ID:-$QA_BEDROCK_MODEL_ID}" \
    --messages '[{"role":"user","content":[{"text":"Jawab satu kata: siap"}]}]' \
    --query 'output.message.content[0].text' --output text || warn "panggilan gagal; cek akses model/region"
fi
pause

# ── 7 ─────────────────────────────────────────────────────────────────────
stage "Variabel repo dan environment GitHub"
ask ETAVM2_IP "IP publik etavm2 [${ETAVM2_IP_DEFAULT}]:"; ETAVM2_IP="${ETAVM2_IP:-$ETAVM2_IP_DEFAULT}"
ask ALERT_EMAILS "Penerima peringatan, format JSON, mis. [\"a@contoh.id\",\"b@contoh.id\"]:"
write_env ETAVM2_IP "$ETAVM2_IP"
write_env ALERT_EMAILS "$ALERT_EMAILS"
set_var AWS_ACCOUNT_ID "$ELGOS_ACCOUNT_ID"
set_var ETAVM2_IP "$ETAVM2_IP"
set_var ALERT_EMAILS "$ALERT_EMAILS"
for envn in qa-malam infra staging prod; do
  if gh api -X PUT "repos/$REPO/environments/$envn" --input - >/dev/null 2>&1 <<<'{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'; then
    gh api -X POST "repos/$REPO/environments/$envn/deployment-branch-policies" -f name=main -f type=branch >/dev/null 2>&1 || true
    printf '  %s✓%s environment %s (hanya main)\n' "$GREEN" "$RESET" "$envn"
  else
    SKIPPED+=("environment $envn (Settings > Environments, Deployment branches = main)")
  fi
done
note "Penyetuju environment prod/infra diatur manual (lihat docs/infra/alur-rilis.md)."
pause

# ── 8 ─────────────────────────────────────────────────────────────────────
stage "Apply stack shared (role elgos-qa-malam + alarm anggaran)"
say "Jalur normal: Actions > Terraform > Run workflow (stack shared) setelah PR infra masuk main."
say "Bila belum masuk main sebelum 24 Nov, apply sekali dari sini dengan profil elgos-admin."
if confirm "Apply infra/live/shared sekarang dari laptop ini?"; then
  ( cd infra/live/shared && AWS_PROFILE=elgos-admin terraform init -input=false -backend-config=../backend.hcl \
    && AWS_PROFILE=elgos-admin terraform apply \
      -var "etavm2_ip=$ETAVM2_IP" -var "alert_emails=$ALERT_EMAILS" \
      -var "qa_bedrock_region=$QA_BEDROCK_REGION" -var "qa_bedrock_model_id=$QA_BEDROCK_MODEL_ID" \
      -var "qa_inference_profile_id=$QA_INFERENCE_PROFILE_ID" )
  QA_MALAM_ROLE_ARN=$(cd infra/live/shared && AWS_PROFILE=elgos-admin terraform output -raw qa_malam_role_arn)
  write_env QA_MALAM_ROLE_ARN "$QA_MALAM_ROLE_ARN"
  set_var QA_MALAM_ROLE_ARN "$QA_MALAM_ROLE_ARN"
fi
set_var QA_MALAM_BEDROCK_REGION "$QA_BEDROCK_REGION"
set_var QA_MALAM_BEDROCK_MODEL_ID "${QA_INFERENCE_PROFILE_ID:-$QA_BEDROCK_MODEL_ID}"
open_url "https://aws.amazon.com/bedrock/pricing/"
step "Cari harga model QA di region $QA_BEDROCK_REGION (USD per 1 juta token, input dan output)."
ask QA_MALAM_AI_PRICE_INPUT_PER_MTOK "Harga input per 1 juta token (USD, mis. 3):"
ask QA_MALAM_AI_PRICE_OUTPUT_PER_MTOK "Harga output per 1 juta token (USD, mis. 15):"
ask QA_MALAM_MAX_TOKENS "Batas token per run (opsional, kosong = bawaan workflow):"
write_env QA_MALAM_AI_PRICE_INPUT_PER_MTOK "$QA_MALAM_AI_PRICE_INPUT_PER_MTOK"
write_env QA_MALAM_AI_PRICE_OUTPUT_PER_MTOK "$QA_MALAM_AI_PRICE_OUTPUT_PER_MTOK"
set_var QA_MALAM_AI_PRICE_INPUT_PER_MTOK "$QA_MALAM_AI_PRICE_INPUT_PER_MTOK"
set_var QA_MALAM_AI_PRICE_OUTPUT_PER_MTOK "$QA_MALAM_AI_PRICE_OUTPUT_PER_MTOK"
if [[ -n "$QA_MALAM_MAX_TOKENS" ]]; then
  write_env QA_MALAM_MAX_TOKENS "$QA_MALAM_MAX_TOKENS"
  set_var QA_MALAM_MAX_TOKENS "$QA_MALAM_MAX_TOKENS"
fi
step "Konfirmasi email langganan SNS dan AWS Budgets yang masuk ke penerima peringatan."
pause

finish
