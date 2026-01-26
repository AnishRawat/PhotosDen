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
