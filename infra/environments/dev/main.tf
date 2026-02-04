module "s3" {
  source       = "../../modules/s3"
  project_name = var.project_name
  environment  = var.environment
}

module "dynamodb" {
  source       = "../../modules/dynamodb"
  project_name = var.project_name
  environment  = var.environment
}

module "cognito" {
  source       = "../../modules/cognito"
  project_name = var.project_name
  environment  = var.environment
}

module "iam" {
  source           = "../../modules/iam"
  project_name     = var.project_name
  environment      = var.environment
  aws_region       = var.aws_region
  lambda_role_name = "" # This will be unused inside the module itself for its own role creation
}

module "ssm" {
  source      = "../../modules/ssm"
  environment = var.environment
  parameters = {
    usdToInrRate            = "85.0"
    cognitoUserPoolId       = module.cognito.user_pool_id
    cognitoUserPoolClientId = module.cognito.client_id
    enableCostDashboard     = "true"
  }
}

module "lambda" {
  source              = "../../modules/lambda"
  project_name        = var.project_name
  environment         = var.environment
  aws_region          = var.aws_region
  lambda_role_arn     = module.iam.lambda_role_arn
  s3_bucket_name      = module.s3.bucket_name
  dynamodb_table_name = module.dynamodb.table_name
  user_pool_id        = module.cognito.user_pool_id
  client_id           = module.cognito.client_id
  users_table_name    = module.dynamodb.table_name
}

module "api_gateway" {
  source               = "../../modules/api_gateway"
  project_name         = var.project_name
  environment          = var.environment
  lambda_invoke_arn    = module.lambda.lambda_invoke_arn
  lambda_function_name = module.lambda.lambda_function_name
  # cognito_user_pool_id  = module.cognito.user_pool_id
  # cognito_client_id     = module.cognito.client_id
  # aws_region            = var.aws_region
  cognito_user_pool_arn = module.cognito.user_pool_arn # I need to check if cognito module has this output
}
