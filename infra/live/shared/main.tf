# Sumber daya bersama (ECR + role deploy GitHub OIDC). Di-apply oleh admin, bukan oleh CI.
#   terraform init -backend-config=../backend.hcl && terraform apply
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

variable "create_github_oidc_provider" {
  type    = bool
  default = true
}

module "shared" {
  source                      = "../../modules/shared"
  github_repo                 = "andrianm28/EWI"
  create_github_oidc_provider = var.create_github_oidc_provider
}

output "ecr_repository_url" { value = module.shared.ecr_repository_url }
output "deploy_role_arn" { value = module.shared.deploy_role_arn }
