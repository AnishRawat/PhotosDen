variable "project_name" { type = string }
variable "environment" { type = string }
variable "aws_region" { type = string }

data "aws_caller_identity" "current" {}

# 1) Trust policy: allows AWS Lambda service to assume this role
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

# 2) Lambda execution role
resource "aws_iam_role" "lambda_exec" {
  name               = "${var.project_name}-${var.environment}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

# 3) Basic logging (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# 4) Least-privilege SSM read policy (PhotosDen-only, environment-scoped)
data "aws_iam_policy_document" "lambda_ssm_read" {
  statement {
    sid    = "AllowReadPhotosDenParametersByPath"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath"
    ]

    # Only allow reading parameters under:
    # /photosden/<env>/app/*
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/photosden/${var.environment}/app/*"
    ]
  }
}

resource "aws_iam_policy" "lambda_ssm_read" {
  name        = "${var.project_name}-${var.environment}-lambda-ssm-read"
  description = "Allow Lambda to read PhotosDen SSM parameters for ${var.environment}"
  policy      = data.aws_iam_policy_document.lambda_ssm_read.json
}

resource "aws_iam_role_policy_attachment" "lambda_ssm_read_attach" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_ssm_read.arn
}
