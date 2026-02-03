# S3 Access (Least-Privilege)
data "aws_iam_policy_document" "lambda_s3_access" {
  statement {
    sid    = "AllowLambdaS3Actions"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      "arn:aws:s3:::${var.project_name}-assets-${var.environment}-8860758571",
      "arn:aws:s3:::${var.project_name}-assets-${var.environment}-8860758571/*"
    ]
  }
}

resource "aws_iam_policy" "lambda_s3" {
  name        = "${var.project_name}-${var.environment}-lambda-s3"
  description = "Allow Lambda to access PhotosDen assets for ${var.environment}"
  policy      = data.aws_iam_policy_document.lambda_s3_access.json
}

resource "aws_iam_role_policy_attachment" "lambda_s3_attach" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_s3.arn
}

# DynamoDB Access (Least-Privilege)
data "aws_iam_policy_document" "lambda_dynamodb_access" {
  statement {
    sid    = "AllowLambdaDynamoDBActions"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem",
      "dynamodb:BatchGetItem"
    ]
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.project_name}-store-${var.environment}",
      "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.project_name}-store-${var.environment}/index/*"
    ]
  }
}

resource "aws_iam_policy" "lambda_dynamodb" {
  name        = "${var.project_name}-${var.environment}-lambda-dynamodb"
  description = "Allow Lambda to access PhotosDen store for ${var.environment}"
  policy      = data.aws_iam_policy_document.lambda_dynamodb_access.json
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb_attach" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_dynamodb.arn
}

variable "lambda_role_name" {
  type    = string
  default = ""
}
