resource "aws_ssm_parameter" "config" {
  for_each = var.parameters

  name  = "/photosden/${var.environment}/app/${each.key}"
  type  = "String"
  value = each.value

  # Standard parameters are free; advanced have a cost. 
  # We use standard tier to maintain low baseline monthly cost.
  tier = "Standard"

  tags = {
    Environment = var.environment
  }
}

variable "environment" { type = string }
variable "parameters" {
  description = "Map of configuration parameters to store in SSM"
  type        = map(string)
}
