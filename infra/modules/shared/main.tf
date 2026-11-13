# Sumber daya bersama staging + prod: repo image API (image yang sama dipromosikan dari staging ke
# prod lewat tag commit) dan role deploy GitHub Actions lewat OIDC (tanpa access key).

variable "github_repo" {
  type        = string
  description = "owner/nama repo GitHub yang boleh deploy"
}

variable "create_github_oidc_provider" {
  type        = bool
  default     = true
  description = "false bila akun sudah punya OIDC provider token.actions.githubusercontent.com"
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account = data.aws_caller_identity.current.account_id
  arn     = "arn:${data.aws_partition.current.partition}"
}

resource "aws_ecr_repository" "api" {
  name                 = "elgos-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Simpan 50 image terakhir"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 50 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "${local.arn}:iam::${local.account}:oidc-provider/token.actions.githubusercontent.com"
}

# Hanya job GitHub Actions di repo ini yang memakai environment staging/prod yang boleh deploy.
# Reviewer wajib untuk prod diatur di Settings > Environments GitHub.
resource "aws_iam_role" "deploy" {
  name                 = "elgos-github-deploy"
  description          = "Deploy ELGOS dari GitHub Actions (OIDC)"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [
            "repo:${var.github_repo}:environment:staging",
            "repo:${var.github_repo}:environment:prod",
          ]
        }
      }
    }]
  })
}

# terraform apply butuh hak luas di akun khusus ELGOS: PowerUser (semua layanan kecuali IAM/Organizations)
# + IAM terbatas pada role/policy berawalan elgos-.
resource "aws_iam_role_policy_attachment" "deploy_poweruser" {
  role       = aws_iam_role.deploy.name
  policy_arn = "${local.arn}:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy" "deploy_iam" {
  name = "elgos-deploy-iam-terbatas"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KelolaRoleElgos"
        Effect = "Allow"
        Action = ["iam:*"]
        Resource = [
          "${local.arn}:iam::${local.account}:role/elgos-*",
          "${local.arn}:iam::${local.account}:policy/elgos-*",
        ]
      },
      {
        Sid      = "BacaIam"
        Effect   = "Allow"
        Action   = ["iam:Get*", "iam:List*"]
        Resource = "*"
      },
      {
        Sid      = "ServiceLinkedRole"
        Effect   = "Allow"
        Action   = ["iam:CreateServiceLinkedRole"]
        Resource = "${local.arn}:iam::${local.account}:role/aws-service-role/*"
      },
      {
        # Role deploy tidak bisa menaikkan haknya sendiri; live/shared di-apply oleh admin.
        Sid       = "LarangUbahRoleDeploySendiri"
        Effect    = "Deny"
        NotAction = ["iam:Get*", "iam:List*"]
        Resource  = "${local.arn}:iam::${local.account}:role/elgos-github-deploy"
      },
    ]
  })
}

output "ecr_repository_url" { value = aws_ecr_repository.api.repository_url }
output "ecr_repository_name" { value = aws_ecr_repository.api.name }
output "deploy_role_arn" { value = aws_iam_role.deploy.arn }
