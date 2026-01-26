variable "aws_region" {
  description = "The AWS region to deploy to"
  type        = string
  default     = "us-east-1"
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
