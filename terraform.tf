# terraform.tf
terraform {

  required_providers {
      linode = {
      source  = "linode/linode"
      version = "~> 1.0"
    }
  }

  required_version = ">= 1.2.0"
}