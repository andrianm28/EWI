# ELGOS staging: aplikasi berjalan di VPS etavm2 (keputusan 17 Nov 2026). AWS hanya untuk kunci KMS per
# tenant (R2-3) dan email SES.
#   terraform init -backend-config=../backend.hcl && terraform apply
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    key          = "staging/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags { tags = { Project = "ELGOS", Environment = "staging", ManagedBy = "terraform" } }
}

module "crypto" {
  source = "../../modules/app-crypto"
  env    = "staging"
  # R2-5r (domain email) belum diputuskan: ganti bila sudah final.
  mail_from  = "noreply@eliteacademy.id"
  tenant_ids = [] # isi id tenant (req.tenantId) saat tenant diaktifkan, lalu apply
}

output "app_user_name" { value = module.crypto.app_user_name }
output "kms_key_alias_prefix" { value = module.crypto.kms_key_alias_prefix }
output "tenant_key_aliases" { value = module.crypto.tenant_key_aliases }
