variable "project_name" {
  description = "Name prefix for AWS resources (cluster, ALB, tables, etc.)."
  type        = string
  default     = "socialapp"
}

variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "image_tag" {
  description = "Container image tag to deploy (CI sets this to the commit SHA)."
  type        = string
  default     = "bootstrap"
}

variable "container_port" {
  description = "Container port exposed by the app and targeted by the ALB."
  type        = number
  default     = 8000

  validation {
    condition     = var.container_port > 0 && var.container_port < 65536
    error_message = "container_port must be between 1 and 65535."
  }
}

variable "desired_count" {
  description = "Number of ECS tasks to run."
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 1
    error_message = "desired_count must be at least 1."
  }
}

variable "cpu" {
  description = "Fargate vCPU units for the task (e.g., 256, 512, 1024...)."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate memory (MB) for the task (e.g., 512, 1024, 2048...)."
  type        = number
  default     = 512
}

variable "ecr_repo_name" {
  description = "ECR repository name for the application image."
  type        = string
  default     = "socialapp"
}

variable "session_secret" {
  description = "Secret used to sign sessions in the app"
  type        = string
  default     = "change-me-in-prod" # overridden by SOCIAlAPP_SESSION_SECRET in CI
}

