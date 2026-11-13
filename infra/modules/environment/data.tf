# ---------- Database (T8) ----------
resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_db_parameter_group" "this" {
  name   = local.name
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier                      = local.name
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = var.db_instance_class
  db_name                         = "elgos"
  username                        = "elgos_admin"
  manage_master_user_password     = true # password di Secrets Manager, dirotasi RDS
  allocated_storage               = var.db_allocated_storage
  max_allocated_storage           = var.db_max_allocated_storage
  storage_type                    = "gp3"
  storage_encrypted               = true
  multi_az                        = var.db_multi_az
  db_subnet_group_name            = aws_db_subnet_group.this.name
  parameter_group_name            = aws_db_parameter_group.this.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  publicly_accessible             = false
  backup_retention_period         = var.db_backup_retention_days # PITR
  backup_window                   = "18:00-19:00"                # 01:00-02:00 WIB
  maintenance_window              = "sat:19:00-sat:20:00"        # Minggu 02:00-03:00 WIB
  auto_minor_version_upgrade      = true
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.name}-final"
  copy_tags_to_snapshot           = true
  enabled_cloudwatch_logs_exports = ["postgresql"]
  performance_insights_enabled    = true
}

# ---------- Secret aplikasi ----------
# EWI_JWT_SECRET dibangkitkan sekali (B22: secret sendiri, tanpa fallback). Nilainya tersimpan juga di
# state Terraform (bucket state terenkripsi KMS, akses terbatas).
resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name        = "${local.name}/app"
  description = "ELGOS ${var.env}: secret JWT"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({ EWI_JWT_SECRET = random_password.jwt.result })
}

# Kredensial integrasi EliteMentor (T2, T6). client_id/secret diisi manual setelah EM menerbitkannya
# (perubahan manual tidak ditimpa Terraform); secret webhook HMAC dibangkitkan dan diserahkan ke tim EM.
resource "random_password" "webhook" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "elitementor" {
  name        = "${local.name}/elitementor"
  description = "ELGOS ${var.env}: kredensial OAuth2 + secret webhook EliteMentor"
}

resource "aws_secretsmanager_secret_version" "elitementor" {
  secret_id = aws_secretsmanager_secret.elitementor.id
  secret_string = jsonencode({
    ELITEMENTOR_CLIENT_ID      = ""
    ELITEMENTOR_CLIENT_SECRET  = ""
    ELITEMENTOR_WEBHOOK_SECRET = random_password.webhook.result
  })
  lifecycle { ignore_changes = [secret_string] }
}

# ---------- Data tenant (unggahan, transkrip, ekspor) ----------
# R2-3 (13 Nov 2026): kunci KMS per tenant. Default bucket SSE-KMS; setiap PutObject wajib aws:kms,
# aplikasi memilih kunci tenant per objek.
resource "aws_s3_bucket" "data" {
  bucket = "elgos-data-${var.env}-${local.account}"
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "data" {
  bucket = aws_s3_bucket.data.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "WajibTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "WajibSseKms"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.data.arn}/*"
        Condition = { StringNotEquals = { "s3:x-amz-server-side-encryption" = "aws:kms" } }
      },
    ]
  })
}
