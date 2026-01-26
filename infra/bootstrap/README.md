# PhotosDen Infrastructure Bootstrap

This directory contains the Terraform configuration needed to bootstrap the **Remote State** (S3) and **State Locking** (DynamoDB) for PhotosDen. 

> [!IMPORTANT]
> This is a one-time bootstrap. Once these resources are created, all other environment configurations (`dev`, `prod`) will reference them in their `backend.tf`.

## Usage
1. `cd infra/bootstrap`
2. `terraform init`
3. `terraform apply`

## Resources Created
- **S3 Bucket**: Versioned and encrypted for `.tfstate` files.
- **DynamoDB Table**: For state locking (LockID).
