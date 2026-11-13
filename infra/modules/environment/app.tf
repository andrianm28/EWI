# ---------- API di ECS Fargate (T7) ----------
locals {
  web_origin = "https://${aws_cloudfront_distribution.web.domain_name}"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/elgos/${var.env}/api"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "this" {
  name = local.name
}

resource "aws_lb" "api" {
  name                       = "${local.name}-api"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  idle_timeout               = 120 # ruang untuk WebSocket voice gateway nanti
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "api" {
  name                 = "${local.name}-api"
  port                 = 4100
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.this.id
  deregistration_delay = 30
  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Role eksekusi: tarik image + baca secret untuk disuntikkan ke container.
resource "aws_iam_role" "exec" {
  name               = "${local.name}-api-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "exec" {
  role       = aws_iam_role.exec.name
  policy_arn = "${local.arn}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "exec_secrets" {
  name = "${local.name}-baca-secret"
  role = aws_iam_role.exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_db_instance.this.master_user_secret[0].secret_arn,
        aws_secretsmanager_secret.app.arn,
        aws_secretsmanager_secret.elitementor.arn,
      ]
    }]
  })
}

# Role task: hak aplikasi saat berjalan.
resource "aws_iam_role" "task" {
  name               = "${local.name}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# R2-3: API membuat satu customer managed key per tenant saat onboarding (tag elgos:env + elgos:tenant)
# lalu memakainya untuk envelope encryption kolom transkrip/hasil dan SSE-KMS objek di bucket data.
# Hanya kunci bertag lingkungan ini dan bertag tenant yang bisa dibuat/dipakai. Tidak ada izin
# menghapus/menonaktifkan kunci atau mengubah key policy (itu tugas admin).
resource "aws_iam_role_policy" "task" {
  name = "${local.name}-api-task"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DataTenant"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"]
      },
      {
        Sid      = "BuatKunciTenant"
        Effect   = "Allow"
        Action   = ["kms:CreateKey", "kms:TagResource"]
        Resource = "*"
        Condition = {
          StringEquals                = { "aws:RequestTag/elgos:env" = var.env }
          "ForAllValues:StringEquals" = { "aws:TagKeys" = ["elgos:env", "elgos:tenant"] }
          Null                        = { "aws:RequestTag/elgos:tenant" = "false" }
        }
      },
      {
        Sid    = "PakaiKunciTenant"
        Effect = "Allow"
        Action = [
          "kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:GenerateDataKeyWithoutPlaintext",
          "kms:ReEncryptFrom", "kms:ReEncryptTo", "kms:DescribeKey", "kms:EnableKeyRotation", "kms:CreateAlias",
        ]
        Resource = "${local.arn}:kms:${local.region}:${local.account}:key/*"
        Condition = {
          StringEquals = { "aws:ResourceTag/elgos:env" = var.env }
          Null         = { "aws:ResourceTag/elgos:tenant" = "false" }
        }
      },
      {
        Sid      = "AliasKunciTenant"
        Effect   = "Allow"
        Action   = ["kms:CreateAlias"]
        Resource = "${local.arn}:kms:${local.region}:${local.account}:alias/elgos/${var.env}/tenant/*"
      },
      {
        Sid      = "DaftarAliasKunci"
        Effect   = "Allow"
        Action   = ["kms:ListAliases"]
        Resource = "*"
      },
      {
        Sid      = "EcsExec"
        Effect   = "Allow"
        Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.exec.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = "${var.ecr_repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = 4100, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "EWI_ENV", value = var.env },
      { name = "PORT", value = "4100" },
      { name = "DB_HOST", value = aws_db_instance.this.address },
      { name = "DB_PORT", value = tostring(aws_db_instance.this.port) },
      { name = "DB_NAME", value = aws_db_instance.this.db_name },
      { name = "DB_USER", value = aws_db_instance.this.username },
      { name = "DB_SCHEMA", value = "ewi" },
      { name = "RUN_MIGRATIONS", value = "true" },
      { name = "EWI_JWT_AUDIENCE", value = "ewi" },
      { name = "EWI_JWT_ISSUER", value = "elgos-api-${var.env}" },
      { name = "EWI_JWT_TTL", value = "8h" },
      { name = "CORS_ORIGIN", value = local.web_origin },
      { name = "ELITEMENTOR_API_URL", value = var.elitementor_api_url },
      { name = "ELITEMENTOR_TOKEN_URL", value = var.elitementor_token_url },
      # R2-3: kunci per tenant di AWS KMS; dev di luar AWS memakai provider `local`.
      { name = "TENANT_KEY_PROVIDER", value = "aws-kms" },
      { name = "TENANT_KEY_ALIAS_PREFIX", value = "alias/elgos/${var.env}/tenant/" },
      { name = "DATA_BUCKET", value = aws_s3_bucket.data.bucket },
      { name = "AWS_REGION", value = local.region },
    ]
    secrets = [
      { name = "DB_PASSWORD", valueFrom = "${aws_db_instance.this.master_user_secret[0].secret_arn}:password::" },
      { name = "EWI_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:EWI_JWT_SECRET::" },
      { name = "ELITEMENTOR_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.elitementor.arn}:ELITEMENTOR_CLIENT_ID::" },
      { name = "ELITEMENTOR_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.elitementor.arn}:ELITEMENTOR_CLIENT_SECRET::" },
      { name = "ELITEMENTOR_WEBHOOK_SECRET", valueFrom = "${aws_secretsmanager_secret.elitementor.arn}:ELITEMENTOR_WEBHOOK_SECRET::" },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:4100/api/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 90
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name                               = "api"
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.api.arn
  desired_count                      = var.api_desired_count
  launch_type                        = "FARGATE"
  enable_execute_command             = true
  health_check_grace_period_seconds  = 120
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  wait_for_steady_state              = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4100
  }

  depends_on = [aws_lb_listener.http]
}
