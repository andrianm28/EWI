# ELGOS prod: aplikasi berjalan di VPS etavm2 (keputusan 17 Nov 2026). AWS hanya untuk kunci KMS per
# tenant (R2-3), email SES, dan model Bedrock (PD-1).
#   terraform init -backend-config=../backend.hcl && terraform apply
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    key          = "prod/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-southeast-1"
  default_tags { tags = { Project = "ELGOS", Environment = "prod", ManagedBy = "terraform" } }
}

variable "etavm2_ip" {
  type        = string
  description = "IP publik etavm2 (mis. 203.0.113.10). Diisi lewat TF_VAR_etavm2_ip (variabel repo ETAVM2_IP)."
}

module "crypto" {
  source = "../../modules/app-crypto"
  env    = "prod"
  # R2-5r (domain email) belum diputuskan: ganti bila sudah final.
  mail_from          = "noreply@eliteacademy.id"
  allowed_source_ips = ["${var.etavm2_ip}/32"]
  tenant_ids         = [] # id tenant ELGOS ditambahkan saat pilot diaktifkan (R2-4)
}

output "app_user_name" { value = module.crypto.app_user_name }
output "kms_key_alias_prefix" { value = module.crypto.kms_key_alias_prefix }
output "tenant_key_aliases" { value = module.crypto.tenant_key_aliases }
