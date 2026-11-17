# Sumber daya AWS bersama ELGOS (akun ELGOS, ap-southeast-1):
#   - identitas domain SES (email dari staging + prod di etavm2)
#   - PK-12 / PD-20 opsi A: bucket backup terenkripsi (kunci KMS sendiri, versioning, lifecycle
#     per jam 7 hari, malam 30 hari), user ops etavm2 (hanya unggah backup + kirim peringatan),
#     user restore (baca backup; access key hanya dibuat saat pemulihan)
#   - PK-21: topik peringatan SNS + email, uptime dari luar (Route 53 health check /api/ready),
#     alarm anggaran AWS (PO-10 opsi A: US$150 per bulan)
#   terraform init -backend-config=../backend.hcl && terraform apply
# Setelah apply: tambahkan 3 CNAME DKIM (output dkim_cname_records) di Cloudflare, konfirmasi email
# langganan SNS, dan ajukan keluar dari SES sandbox.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    key          = "shared/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags { tags = { Project = "ELGOS", ManagedBy = "terraform" } }
}

# Metrik Route 53 health check hanya ada di us-east-1, jadi alarmnya juga di sana.
provider "aws" {
  alias  = "use1"
  region = "us-east-1"
  default_tags { tags = { Project = "ELGOS", ManagedBy = "terraform" } }
}

variable "mail_domain" {
  type        = string
  default     = "eliteacademy.id" # PD-3 opsi A
  description = "Domain pengirim email ELGOS."
}

variable "etavm2_ip" {
  type        = string
  description = "IP publik etavm2. Diisi lewat TF_VAR_etavm2_ip (variabel repo ETAVM2_IP)."
}

variable "alert_emails" {
  type        = list(string)
  default     = []
  description = "Penerima peringatan (SNS email). Diisi lewat TF_VAR_alert_emails, bukan di repo."
}

variable "monthly_budget_usd" {
  type    = number
  default = 150 # PO-10 opsi A, dipakai sebagai ambang peringatan
}

variable "health_check_hosts" {
  type    = map(string)
  default = { prod = "elgos.eliteacademy.id", staging = "stg-elgos.eliteacademy.id" }
}

data "aws_caller_identity" "this" {}
data "aws_partition" "this" {}

locals {
  account     = data.aws_caller_identity.this.account_id
  dari_etavm2 = { IpAddress = { "aws:SourceIp" = ["${var.etavm2_ip}/32"] } }
}

# ---------------------------------------------------------------- SES
resource "aws_sesv2_email_identity" "mail" {
  email_identity = var.mail_domain
}

# ---------------------------------------------------------------- Backup (PK-12)
resource "aws_kms_key" "backup" {
  description             = "ELGOS: enkripsi backup database di S3"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}

resource "aws_kms_alias" "backup" {
  name          = "alias/elgos-backup"
  target_key_id = aws_kms_key.backup.key_id
}

resource "aws_s3_bucket" "backup" {
  bucket = "elgos-backup-${local.account}"
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.backup.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

# Retensi (masukan PK-17): per jam 7 hari, malam dan manual 30 hari. Versi lama (tertimpa/terhapus)
# dibuang 7 hari kemudian.
resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket     = aws_s3_bucket.backup.id
  depends_on = [aws_s3_bucket_versioning.backup]
  dynamic "rule" {
    for_each = { for p in setproduct(["prod", "staging"], ["hourly", "nightly", "manual"]) : "${p[0]}-${p[1]}" => p }
    content {
      id     = rule.key
      status = "Enabled"
      filter { prefix = "${rule.value[0]}/${rule.value[1]}/" }
      expiration { days = rule.value[1] == "hourly" ? 7 : 30 }
      noncurrent_version_expiration { noncurrent_days = 7 }
      abort_incomplete_multipart_upload { days_after_initiation = 1 }
    }
  }
}

resource "aws_s3_bucket_policy" "backup" {
  bucket = aws_s3_bucket.backup.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "WajibTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.backup.arn, "${aws_s3_bucket.backup.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "WajibKunciBackup"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.backup.arn}/*"
        Condition = { StringNotEqualsIfExists = { "s3:x-amz-server-side-encryption-aws-kms-key-id" = aws_kms_key.backup.arn } }
      },
    ]
  })
}

# User host etavm2: unggah backup (tanpa baca/hapus) + kirim peringatan. Hanya dari IP etavm2.
resource "aws_iam_user" "ops" {
  name = "elgos-ops-etavm2"
}

resource "aws_iam_user_policy" "ops" {
  name = "elgos-ops-etavm2"
  user = aws_iam_user.ops.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "UnggahBackup"
        Effect    = "Allow"
        Action    = ["s3:PutObject"]
        Resource  = ["${aws_s3_bucket.backup.arn}/prod/*", "${aws_s3_bucket.backup.arn}/staging/*"]
        Condition = local.dari_etavm2
      },
      {
        Sid       = "EnkripsiBackup"
        Effect    = "Allow"
        Action    = ["kms:GenerateDataKey"]
        Resource  = aws_kms_key.backup.arn
        Condition = local.dari_etavm2
      },
      {
        Sid       = "KirimPeringatan"
        Effect    = "Allow"
        Action    = ["sns:Publish"]
        Resource  = aws_sns_topic.alerts.arn
        Condition = local.dari_etavm2
      },
    ]
  })
}

# User pemulihan: baca backup. Access key dibuat hanya saat uji/pemulihan lalu dihapus (runbook).
resource "aws_iam_user" "restore" {
  name = "elgos-restore"
}

resource "aws_iam_user_policy" "restore" {
  name = "elgos-restore"
  user = aws_iam_user.restore.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "BacaBackup"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion", "s3:ListBucket", "s3:ListBucketVersions"]
        Resource = [aws_s3_bucket.backup.arn, "${aws_s3_bucket.backup.arn}/*"]
      },
      {
        Sid      = "DekripsiBackup"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = aws_kms_key.backup.arn
      },
    ]
  })
}

# ---------------------------------------------------------------- Peringatan (PK-21)
resource "aws_sns_topic" "alerts" {
  name = "elgos-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_sns_topic" "alerts_use1" {
  provider = aws.use1
  name     = "elgos-alerts-uptime"
}

resource "aws_sns_topic_subscription" "alerts_use1_email" {
  provider  = aws.use1
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts_use1.arn
  protocol  = "email"
  endpoint  = each.value
}

# Uptime dari luar: HTTPS /api/ready tiap 30 detik dari beberapa region AWS.
resource "aws_route53_health_check" "app" {
  for_each          = var.health_check_hosts
  fqdn              = each.value
  type              = "HTTPS"
  port              = 443
  resource_path     = "/api/ready"
  request_interval  = 30
  failure_threshold = 3
  measure_latency   = false
  tags              = { Name = "elgos-${each.key}" }
}

resource "aws_cloudwatch_metric_alarm" "uptime" {
  provider            = aws.use1
  for_each            = var.health_check_hosts
  alarm_name          = "elgos-${each.key}-down"
  alarm_description   = "ELGOS ${each.key} (${each.value}) tidak menjawab /api/ready dari luar."
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.app[each.key].id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts_use1.arn]
  ok_actions          = [aws_sns_topic.alerts_use1.arn]
}

resource "aws_budgets_budget" "monthly" {
  name         = "elgos-bulanan"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = length(var.alert_emails) > 0 ? [
      { type = "ACTUAL", threshold = 80 },
      { type = "ACTUAL", threshold = 100 },
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

# ---------------------------------------------------------------- Output
output "dkim_cname_records" {
  value = [for t in aws_sesv2_email_identity.mail.dkim_signing_attributes[0].tokens : {
    name  = "${t}._domainkey.${var.mail_domain}"
    value = "${t}.dkim.amazonses.com"
  }]
}

output "backup_bucket" { value = aws_s3_bucket.backup.bucket }
output "alert_topic_arn" { value = aws_sns_topic.alerts.arn }
output "ops_user_name" { value = aws_iam_user.ops.name }
output "restore_user_name" { value = aws_iam_user.restore.name }
