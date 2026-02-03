output "bucket_name" {
  value       = aws_s3_bucket.assets.id
  description = "The name of the assets bucket"
}

output "bucket_arn" {
  value       = aws_s3_bucket.assets.arn
  description = "The ARN of the assets bucket"
}
