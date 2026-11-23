# QA malam dengan AI sungguhan (B18, docs/designs/b18-e2e-qa-malam.md bagian 5.5; Go/No-Go 27 Nov,
# keputusan user 19 Nov: akun Bedrock siap 24 Nov, QA malam 24–26 Nov).
#   - Role elgos-qa-malam: hanya dari GitHub Actions environment `qa-malam` (OIDC, tanpa kunci
#     statis), izin hanya bedrock:InvokeModel pada model QA. Terpisah dari user aplikasi (KMS/SES).
#   - Alarm anggaran selama QA (bukan plafon; PO-10 C tetap tanpa plafon).
# Model dan region diisi saat apply (TF_VAR_qa_bedrock_*), setelah ketersediaan dicek di akun ELGOS:
#   aws bedrock list-foundation-models --by-provider anthropic --region <region>
#   aws bedrock list-inference-profiles --region <region>
# Role tidak dibuat selama qa_bedrock_model_id kosong.

variable "github_repo" {
  type    = string
  default = "andrianm28/EWI" # PD-4: ganti saat repo pindah ke organisasi Elitery
}

variable "qa_bedrock_region" {
  type        = string
  default     = "ap-southeast-1"
  description = "Region endpoint Bedrock: Singapura (ap-southeast-1). Keputusan user 23 Nov: Sonnet 5.5 lewat profil global.* dari Singapura."
}

variable "qa_bedrock_model_id" {
  type        = string
  default     = ""
  description = "ID model dasar Claude (keputusan user 23 Nov: anthropic.claude-sonnet-5-5). Kosong = role QA malam tidak dibuat."
}

variable "qa_inference_profile_id" {
  type        = string
  default     = ""
  description = "ID inference profile bila model hanya tersedia lewat profil (keputusan user 23 Nov: global.anthropic.claude-sonnet-5-5)."
}

variable "qa_budget_usd" {
  type        = number
  default     = 100
  description = "Peringatan anggaran bulanan akun ELGOS selama QA malam (★ asumsi US$100). 0 = mati."
}

locals {
  qa_aktif   = var.qa_bedrock_model_id != ""
  qa_profil  = var.qa_inference_profile_id != ""
  oidc_arn   = "arn:${data.aws_partition.this.partition}:iam::${local.account}:oidc-provider/token.actions.githubusercontent.com"
  qa_model   = "arn:${data.aws_partition.this.partition}:bedrock:${var.qa_bedrock_region}::foundation-model/${var.qa_bedrock_model_id}"
  qa_profile = "arn:${data.aws_partition.this.partition}:bedrock:${var.qa_bedrock_region}:${local.account}:inference-profile/${var.qa_inference_profile_id}"
  # Profil lintas region meneruskan panggilan ke model dasar di region tujuan, jadi model dasar di
  # region mana pun diizinkan hanya bila dipanggil lewat profil itu.
  qa_model_semua_region = "arn:${data.aws_partition.this.partition}:bedrock:*::foundation-model/${var.qa_bedrock_model_id}"
}

data "aws_iam_policy_document" "qa_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:qa-malam"]
    }
  }
}

resource "aws_iam_role" "qa_malam" {
  count                = local.qa_aktif ? 1 : 0
  name                 = "elgos-qa-malam"
  assume_role_policy   = data.aws_iam_policy_document.qa_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "qa_bedrock" {
  dynamic "statement" {
    for_each = local.qa_profil ? [] : [1]
    content {
      sid       = "ModelQa"
      actions   = ["bedrock:InvokeModel"]
      resources = [local.qa_model]
    }
  }
  dynamic "statement" {
    for_each = local.qa_profil ? [1] : []
    content {
      sid       = "ProfilInferensi"
      actions   = ["bedrock:InvokeModel"]
      resources = [local.qa_profile]
    }
  }
  dynamic "statement" {
    for_each = local.qa_profil ? [1] : []
    content {
      sid       = "ModelLewatProfil"
      actions   = ["bedrock:InvokeModel"]
      resources = [local.qa_model_semua_region]
      condition {
        test     = "StringEquals"
        variable = "bedrock:InferenceProfileArn"
        values   = [local.qa_profile]
      }
    }
  }
}

resource "aws_iam_role_policy" "qa_malam" {
  count  = local.qa_aktif ? 1 : 0
  name   = "elgos-qa-malam-bedrock"
  role   = aws_iam_role.qa_malam[0].id
  policy = data.aws_iam_policy_document.qa_bedrock.json
}

resource "aws_budgets_budget" "qa_malam" {
  count        = var.qa_budget_usd > 0 ? 1 : 0
  name         = "elgos-qa-malam"
  budget_type  = "COST"
  limit_amount = tostring(var.qa_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Seluruh akun ELGOS, bukan filter layanan: tagihan Claude di Bedrock bisa tercatat sebagai
  # layanan Marketplace per model, sehingga filter "Amazon Bedrock" saja bisa melewatkannya.
  dynamic "notification" {
    for_each = length(var.alert_emails) > 0 ? [
      { type = "ACTUAL", threshold = 50 },
      { type = "ACTUAL", threshold = 80 },
      { type = "FORECASTED", threshold = 100 },
    ] : []
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_email_addresses = var.alert_emails
    }
  }
}

output "qa_malam_role_arn" {
  value       = local.qa_aktif ? aws_iam_role.qa_malam[0].arn : ""
  description = "Isi ke variabel repo QA_MALAM_ROLE_ARN."
}
