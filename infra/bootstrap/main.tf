terraform {
  required_version = "1.14.3"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.34.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

module "remote_state" {
  source       = "./modules/remote_state"
  project_name = var.project_name
  environment  = var.environment
}

variable "aws_region" { default = "ap-south-1" }
variable "aws_profile" { default = "default" }
variable "project_name" { default = "photosden" }
variable "environment" { default = "infra" } # Global infra env
