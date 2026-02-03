terraform {
  backend "s3" {
    bucket         = "photosden-terraform-state-infra" # Referencing the bootstrap bucket
    key            = "photosden/dev/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "photosden-terraform-locks-infra"
    encrypt        = true
    # profile        = "default" # Can be overridden by -backend-config="profile=..."
  }
}
