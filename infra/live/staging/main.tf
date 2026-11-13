# Lingkungan staging ELGOS di AWS (R2-9: AWS hanya staging + prod; dev di etavm1).
#   terraform init -backend-config=../backend.hcl
#   terraform apply -var image_tag=<sha>
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {
    key          = "staging/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-southeast-1" # T8
  default_tags { tags = { Project = "ELGOS", Environment = "staging", ManagedBy = "terraform" } }
}

variable "image_tag" {
  type        = string
  description = "SHA commit yang image-nya ada di ECR elgos-api"
}

variable "elitementor_api_url" {
  type    = string
  default = ""
}

variable "elitementor_token_url" {
  type    = string
  default = ""
}

data "aws_ecr_repository" "api" { name = "elgos-api" }

module "env" {
  source             = "../../modules/environment"
  env                = "staging"
  vpc_cidr           = "10.41.0.0/16"
  image_tag          = var.image_tag
  ecr_repository_url = data.aws_ecr_repository.api.repository_url

  api_cpu                  = 256
  api_memory               = 512
  db_instance_class        = "db.t4g.micro"
  db_max_allocated_storage = 100
  db_backup_retention_days = 7 # PITR 7 hari
  log_retention_days       = 30

  elitementor_api_url   = var.elitementor_api_url
  elitementor_token_url = var.elitementor_token_url
}

output "web_url" { value = module.env.web_url }
output "web_bucket" { value = module.env.web_bucket }
output "data_bucket" { value = module.env.data_bucket }
output "distribution_id" { value = module.env.distribution_id }
output "cluster_name" { value = module.env.cluster_name }
output "db_endpoint" { value = module.env.db_endpoint }
output "elitementor_secret_arn" { value = module.env.elitementor_secret_arn }
