variable "project_name" { type = string }
variable "environment" { type = string }

resource "aws_dynamodb_table" "main" {
  name         = "${var.project_name}-store-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "CapturedAt"
    type = "S"
  }

  # LSI1: Chronological view for Assets
  local_secondary_index {
    name            = "LSI1"
    range_key       = "CapturedAt"
    projection_type = "ALL"
  }

  # GSI1: Reverse lookup for Asset-Album links
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "SK"
    range_key       = "PK"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "PhotosDenStore"
    Environment = var.environment
  }
}
