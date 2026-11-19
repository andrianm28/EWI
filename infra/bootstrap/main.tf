# Backend state Terraform ELGOS: satu bucket S3 terenkripsi + versioning, lock memakai file lock
# native S3 (use_lockfile, Terraform >= 1.10; tidak perlu tabel DynamoDB).
# Dijalankan SEKALI per akun dengan state lokal:
#   cd infra/bootstrap && terraform init && terraform apply
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags { tags = { Project = "ELGOS", ManagedBy = "terraform" } }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "state" {
  bucket = "elgos-tfstate-${data.aws_caller_identity.current.account_id}"
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "WajibTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

# ---------------------------------------------------------------- Role Terraform (PK-08, N-8)
# Terraform tidak lagi dijalankan dengan profil admin akun management. GitHub Actions memakai OIDC:
#   - elgos-terraform-plan: hanya baca (ReadOnlyAccess) + lock state; dipakai di PR (plan di PR).
#   - elgos-terraform-apply: hanya jenis sumber daya ELGOS; hanya dari environment `infra` (penyetuju).
variable "github_repo" {
  type    = string
  default = "andrianm28/EWI" # PD-4: ganti saat repo pindah ke organisasi Elitery
}

variable "create_github_oidc_provider" {
  type    = bool
  default = true
}

locals {
  account    = data.aws_caller_identity.current.account_id
  arn_prefix = "arn:aws"
  oidc_arn   = "${local.arn_prefix}:iam::${local.account}:oidc-provider/token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_github_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "trust_plan" {
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
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:pull_request", "repo:${var.github_repo}:environment:infra"]
    }
  }
}

data "aws_iam_policy_document" "trust_apply" {
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
      values   = ["repo:${var.github_repo}:environment:infra"]
    }
  }
}

resource "aws_iam_role" "tf_plan" {
  name                 = "elgos-terraform-plan"
  assume_role_policy   = data.aws_iam_policy_document.trust_plan.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "tf_plan_ro" {
  role       = aws_iam_role.tf_plan.name
  policy_arn = "${local.arn_prefix}:iam::aws:policy/ReadOnlyAccess"
}

# Lock file state (use_lockfile) butuh tulis/hapus berkas .tflock saja.
resource "aws_iam_role_policy" "tf_plan_lock" {
  name = "lock-state"
  role = aws_iam_role.tf_plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.state.arn}/*.tflock"
    }]
  })
}

resource "aws_iam_role" "tf_apply" {
  name                 = "elgos-terraform-apply"
  assume_role_policy   = data.aws_iam_policy_document.trust_apply.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "tf_apply" {
  name = "elgos-resources"
  role = aws_iam_role.tf_apply.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "State"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      },
      {
        Sid      = "Baca"
        Effect   = "Allow"
        Action   = ["iam:Get*", "iam:List*", "kms:Describe*", "kms:Get*", "kms:List*", "s3:Get*", "s3:List*", "sns:Get*", "sns:List*", "ses:Get*", "ses:List*", "route53:Get*", "route53:List*", "cloudwatch:Describe*", "cloudwatch:List*", "budgets:View*", "sts:GetCallerIdentity"]
        Resource = "*"
      },
      {
        Sid      = "KmsBaru"
        Effect   = "Allow"
        Action   = ["kms:CreateKey", "kms:TagResource", "kms:CreateAlias", "kms:UpdateAlias", "kms:DeleteAlias", "kms:EnableKeyRotation", "kms:PutKeyPolicy", "kms:UpdateKeyDescription", "kms:ScheduleKeyDeletion"]
        Resource = "*"
      },
      {
        Sid      = "IamElgos"
        Effect   = "Allow"
        Action   = ["iam:CreateUser", "iam:DeleteUser", "iam:TagUser", "iam:UntagUser", "iam:PutUserPolicy", "iam:DeleteUserPolicy"]
        Resource = "${local.arn_prefix}:iam::${local.account}:user/elgos-*"
      },
      {
        # QA malam (B18): role OIDC elgos-qa-malam di stack shared (infra/live/shared/qa-malam.tf).
        Sid      = "IamRoleQaMalam"
        Effect   = "Allow"
        Action   = ["iam:CreateRole", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy"]
        Resource = "${local.arn_prefix}:iam::${local.account}:role/elgos-qa-malam"
      },
      {
        Sid      = "S3Elgos"
        Effect   = "Allow"
        Action   = ["s3:CreateBucket", "s3:Put*", "s3:DeleteBucketPolicy"]
        Resource = ["${local.arn_prefix}:s3:::elgos-*"]
      },
      {
        Sid      = "SnsElgos"
        Effect   = "Allow"
        Action   = ["sns:CreateTopic", "sns:DeleteTopic", "sns:SetTopicAttributes", "sns:Subscribe", "sns:Unsubscribe", "sns:TagResource"]
        Resource = ["${local.arn_prefix}:sns:*:${local.account}:elgos-*"]
      },
      {
        Sid      = "PemantauanEmailAnggaran"
        Effect   = "Allow"
        Action   = ["ses:CreateEmailIdentity", "ses:DeleteEmailIdentity", "ses:TagResource", "ses:PutEmailIdentityDkimAttributes", "route53:CreateHealthCheck", "route53:UpdateHealthCheck", "route53:DeleteHealthCheck", "route53:ChangeTagsForResource", "cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:TagResource", "budgets:ModifyBudget", "budgets:CreateBudgetAction", "budgets:TagResource"]
        Resource = "*"
      },
    ]
  })
}

output "terraform_plan_role_arn" { value = aws_iam_role.tf_plan.arn }
output "terraform_apply_role_arn" { value = aws_iam_role.tf_apply.arn }
