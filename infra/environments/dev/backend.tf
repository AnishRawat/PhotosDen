terraform {
  backend "s3" {
    bucket         = "photosden-terraform-state-infra" # Referencing the bootstrap bucket
    key            = "photosden/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "photosden-terraform-locks-infra" # Referencing the bootstrap table
    encrypt        = true
  }
}
