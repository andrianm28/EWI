# Bagian AWS yang tersisa setelah staging + prod pindah ke VPS etavm2 (17 Nov 2026):
#   - R2-3: satu customer managed key KMS per tenant (alias kontrak API: alias/<prefix>-<tenantId>)
#   - IAM user per lingkungan untuk API di etavm2: hanya GenerateDataKey/Decrypt dengan encryption
#     context {tenant} dan kirim email SES dari alamat mail_from.
# Access key IAM user TIDAK dibuat di Terraform (agar tidak masuk state); buat lewat CLI, simpan di
# /srv/elgos-<env>/.env di etavm2. Lihat docs/infra/vps-etavm2.md.
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

data "aws_caller_identity" "this" {}
data "aws_region" "this" {}
data "aws_partition" "this" {}

locals {
  tenant_key_prefix = "elgos-${var.env}-tenant"
  key_arn_pattern   = "arn:${data.aws_partition.this.partition}:kms:${data.aws_region.this.region}:${data.aws_caller_identity.this.account_id}:key/*"
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
    Statement = [
      {
        Sid      = "EnvelopeKunciTenant"
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = local.key_arn_pattern
        Condition = {
          StringEquals = { "aws:ResourceTag/elgos:env" = var.env }
          Null         = { "aws:ResourceTag/elgos:tenant" = "false", "kms:EncryptionContext:tenant" = "false" }
        }
      },
      {
        Sid       = "KirimEmail"
        Effect    = "Allow"
        Action    = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource  = "*"
        Condition = { StringEquals = { "ses:FromAddress" = var.mail_from } }
      },
    ]
  })
}

output "app_user_name" { value = aws_iam_user.app.name }
output "kms_key_alias_prefix" { value = local.tenant_key_prefix }
output "region" { value = data.aws_region.this.region }
output "tenant_key_aliases" { value = { for k, a in aws_kms_alias.tenant : k => a.name } }
