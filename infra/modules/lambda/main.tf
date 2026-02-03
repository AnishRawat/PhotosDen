resource "aws_lambda_function" "api_handler" {
  function_name = "${var.project_name}-api-${var.environment}"
  role          = var.lambda_role_arn
  handler       = "index.handler" # This assumes the packaged artifact has an index.js/handler
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 1024

  # Point to the real zip file produced by Phase 2.
  filename         = "${path.module}/../../../backend/function.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../backend/function.zip")

  environment {
    variables = {
      PROJECT_NAME         = var.project_name
      ENVIRONMENT          = var.environment
      S3_BUCKET_NAME       = var.s3_bucket_name
      DYNAMODB_TABLE_NAME  = var.dynamodb_table_name
      COGNITO_USER_POOL_ID = var.user_pool_id
      COGNITO_CLIENT_ID    = var.client_id
      USERS_TABLE_NAME     = var.users_table_name
      APP_ENV              = var.AppEnv
    }
  }

}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.api_handler.function_name}"
  retention_in_days = 7
}
