output "lambda_function_name" {
  value = aws_lambda_function.api_handler.function_name
}

output "lambda_invoke_arn" {
  value = aws_lambda_function.api_handler.invoke_arn
}

output "lambda_arn" {
  value = aws_lambda_function.api_handler.arn
}
 output "AppEnv" {
   value = "dev"
 }