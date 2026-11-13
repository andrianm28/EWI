variable "env" {
  type        = string
  description = "Nama lingkungan: staging atau prod"
  validation {
    condition     = contains(["staging", "prod"], var.env)
    error_message = "env harus staging atau prod (dev di luar AWS, R2-9)."
  }
}

variable "vpc_cidr" { type = string }

variable "image_tag" {
  type        = string
  description = "Tag image API di ECR (SHA commit), diisi workflow deploy"
}

variable "ecr_repository_url" { type = string }

variable "api_cpu" {
  type    = number
  default = 256
}

variable "api_memory" {
  type    = number
  default = 512
}

variable "api_desired_count" {
  type    = number
  default = 1
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_max_allocated_storage" {
  type    = number
  default = 100
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "db_multi_az" {
  type    = bool
  default = false # T8: Single-AZ saat pilot; RG-11 bukan HA
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "elitementor_api_url" {
  type    = string
  default = ""
}

variable "elitementor_token_url" {
  type    = string
  default = ""
}
