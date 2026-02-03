output "api_url" {
  value = module.api_gateway.base_url
}

output "user_pool_id" {
  value = module.cognito.user_pool_id
}

output "user_pool_client_id" {
  value = module.cognito.client_id
}
