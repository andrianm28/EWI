# Sumber daya AWS bersama ELGOS: identitas domain SES (email dari staging + prod di etavm2).
#   terraform init -backend-config=../backend.hcl && terraform apply
# Setelah apply, tambahkan 3 CNAME DKIM (output dkim_cname_records) di Cloudflare, lalu ajukan keluar
# dari SES sandbox agar bisa kirim ke penerima mana pun.
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

variable "mail_domain" {
  type        = string
  default     = "eliteacademy.id" # R2-5r belum diputuskan
  description = "Domain pengirim email ELGOS."
}

resource "aws_sesv2_email_identity" "mail" {
  email_identity = var.mail_domain
}

output "dkim_cname_records" {
  value = [for t in aws_sesv2_email_identity.mail.dkim_signing_attributes[0].tokens : {
    name  = "${t}._domainkey.${var.mail_domain}"
    value = "${t}.dkim.amazonses.com"
  }]
}
