output "alb_dns_name"       { value = aws_lb.app.dns_name }
output "ecr_repository_url" { value = aws_ecr_repository.app.repository_url }
output "users_table"        { value = aws_dynamodb_table.users.name }
output "posts_table"        { value = aws_dynamodb_table.posts.name }
output "likes_table"        { value = aws_dynamodb_table.likes.name }
