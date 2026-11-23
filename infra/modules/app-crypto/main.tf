# Bagian AWS yang tersisa setelah staging + prod pindah ke VPS etavm2 (17 Nov 2026):
#   - R2-3: satu customer managed key KMS per tenant (alias kontrak API: alias/<prefix>-<tenantId>)
#   - IAM user per lingkungan untuk API di etavm2: hanya GenerateDataKey/Decrypt dengan encryption
#     context {tenant} dan kirim email SES dari alamat mail_from.
#   - PD-1 opsi A: InvokeModel Amazon Bedrock (Claude) dari region Singapura; sejak 23 Nov lewat profil
#     global.* (Sonnet 5.5, keputusan user), jadi model dasar boleh di region lain hanya lewat profil.
#   - N-4: semua izin hanya berlaku dari alamat IP etavm2 (allowed_source_ips).
# Access key IAM user TIDAK dibuat di Terraform (agar tidak masuk state); buat lewat CLI, simpan di
# /srv/elgos-<env>/.env di etavm2, rotasi tiap 90 hari (docs/infra/rotasi-kunci.md).
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

variable "env" {
  type = string
  validation {
    condition     = contains(["staging", "prod"], var.env)
    error_message = "env harus staging atau prod."
  }
}

variable "tenant_ids" {
  type        = set(string)
  default     = []
  description = "Id tenant (req.tenantId) yang aktif; masing-masing mendapat satu kunci KMS + alias."
}

variable "mail_from" {
  type        = string
  description = "Alamat pengirim (MAIL_FROM); domainnya harus terverifikasi di SES (live/shared)."
}

variable "allowed_source_ips" {
  type        = list(string)
  description = "CIDR IP publik etavm2 (mis. [\"203.0.113.10/32\"]). Kunci aplikasi ditolak dari alamat lain (N-4)."
  validation {
    condition     = length(var.allowed_source_ips) > 0
    error_message = "allowed_source_ips wajib diisi IP publik etavm2."
  }
}

variable "bedrock_enabled" {
  type        = bool
  default     = true
  description = "PD-1 opsi A: izinkan InvokeModel Bedrock (model Anthropic) di region ini."
}

data "aws_caller_identity" "this" {}
data "aws_region" "this" {}
data "aws_partition" "this" {}

locals {
  tenant_key_prefix = "elgos-${var.env}-tenant"
  arn_prefix        = "arn:${data.aws_partition.this.partition}"
  key_arn_pattern   = "${local.arn_prefix}:kms:${data.aws_region.this.region}:${data.aws_caller_identity.this.account_id}:key/*"
  dari_etavm2       = { IpAddress = { "aws:SourceIp" = var.allowed_source_ips } }
  bedrock_statement = var.bedrock_enabled ? [{
    Sid    = "ModelBedrock"
    Effect = "Allow"
    Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    Resource = [
      "${local.arn_prefix}:bedrock:${data.aws_region.this.region}::foundation-model/anthropic.*",
      "${local.arn_prefix}:bedrock:${data.aws_region.this.region}:${data.aws_caller_identity.this.account_id}:inference-profile/*",
    ]
    Condition = local.dari_etavm2
  }] : []
  bedrock_profil_statement = var.bedrock_enabled ? [{
    # Keputusan user 23 Nov: Sonnet 5.5 lewat profil global.* dari Singapura. Profil meneruskan panggilan
    # ke model dasar di region mana pun (global = ARN tanpa region), jadi model dasar Anthropic hanya
    # diizinkan bila dipanggil lewat profil di akun ini.
    Sid      = "ModelLewatProfil"
    Effect   = "Allow"
    Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    Resource = ["${local.arn_prefix}:bedrock:*::foundation-model/anthropic.*"]
    Condition = {
      StringLike = {
        "bedrock:InferenceProfileArn" = "${local.arn_prefix}:bedrock:${data.aws_region.this.region}:${data.aws_caller_identity.this.account_id}:inference-profile/*"
      }
    }
  }] : []
}

resource "aws_kms_key" "tenant" {
  for_each                = var.tenant_ids
  description             = "ELGOS ${var.env}: kunci data tenant ${each.key}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags = {
    "elgos:env"    = var.env
    "elgos:tenant" = each.key
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "tenant" {
  for_each      = var.tenant_ids
  name          = "alias/${local.tenant_key_prefix}-${each.key}"
  target_key_id = aws_kms_key.tenant[each.key].key_id
}

resource "aws_iam_user" "app" {
  name = "elgos-${var.env}-app"
  tags = { "elgos:env" = var.env }
}

resource "aws_iam_user_policy" "app" {
  name = "elgos-${var.env}-app"
  user = aws_iam_user.app.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid      = "EnvelopeKunciTenant"
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = local.key_arn_pattern
        Condition = {
          StringEquals = { "aws:ResourceTag/elgos:env" = var.env }
          Null         = { "aws:ResourceTag/elgos:tenant" = "false", "kms:EncryptionContext:tenant" = "false" }
          IpAddress    = { "aws:SourceIp" = var.allowed_source_ips }
        }
      },
      {
        Sid      = "KirimEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
        Condition = {
          StringEquals = { "ses:FromAddress" = var.mail_from }
          IpAddress    = { "aws:SourceIp" = var.allowed_source_ips }
        }
      },
    ], local.bedrock_statement, local.bedrock_profil_statement)
  })
}

output "app_user_name" { value = aws_iam_user.app.name }
output "kms_key_alias_prefix" { value = local.tenant_key_prefix }
output "region" { value = data.aws_region.this.region }
output "tenant_key_aliases" { value = { for k, a in aws_kms_alias.tenant : k => a.name } }
