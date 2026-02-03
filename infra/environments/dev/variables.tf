variable "aws_region" {
  description = "The AWS region to deploy to"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "photosden"
}

variable "environment" {
  description = "The deployment environment (dev/prod)"
  type        = string
  default     = "dev"
}

# variable "aws_profile" {
#   description = "The AWS SSO profile to use"
#   type        = string
#   default     = "photosden-dev"
# }
