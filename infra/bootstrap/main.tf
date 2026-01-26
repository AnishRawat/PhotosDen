terraform {
  required_version = "1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.34.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "remote_state" {
  source       = "./modules/remote_state"
  project_name = var.project_name
  environment  = var.environment
}

variable "aws_region" { default = "us-east-1" }
variable "project_name" { default = "photosden" }
variable "environment" { default = "infra" } # Global infra env
