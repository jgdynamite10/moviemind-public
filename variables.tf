# variables.tf
variable "label" {
  description = "Set the name for your instance."
  type        = string
  default     = "moviemind"
}

variable "region" {
  description = "The geographic region where the Linode instance will be deployed. Choose a region closest to your users for better performance."
  type        = string
  default     = "us-west" # see available regions in the Linode Cloud Manager
}

variable "instance_type" {
  description = "The type of Linode instance to deploy. This determines the hardware specifications of your server. Adjust based on your application's resource needs."
  type        = string
  default     = "g6-dedicated-8" # or "standard", set higher number for more CPUs and memory
}

# Set the domain name and email for obtaining an SSL certificate
# Important! This must be done after initial server set up
# Refer to README.md for more information.
variable "domain_name" {
  description = "The domain name for the application. After the server created, create A dns-record for this domain pointing to the server IP."
  type        = string
  default     = "moviemind.info"
}

variable "certbot_email" {
  description = "The email address to use for Let's Encrypt SSL certificate registration. This is used to manage the SSL certificate for the domain."
  type        = string
  default     = "examaple@akamai.com" # mandatory for SSL certificate if your domain is set
}

variable "username" {
  description = "The username for the Linode instance."
  type        = string
  default     = "moviemind"
}

variable "app_dir" {
  description = "The name of app directory created in the home directory of the Linode instance. This is where the application code will be deployed."
  type        = string
  default     = "moviemind-app"
}

variable "linode_token" {
  description = "The API token for Linode to authenticate and manage resources. Ensure this token has appropriate permissions for the operations you intend to perform."
  type        = string
  sensitive   = true
}

variable "root_pass" {
  description = "The root password for the Linode instance. It's recommended to use a strong, randomly generated password here for security."
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "Your SSH public key that will be added to the Linode instance. This allows secure SSH access to the server without password authentication."
  type        = string
  sensitive   = true
}

variable "private_key_path" {
  description = "The local path to your private SSH key, corresponding to the public key provided. This is used by Terraform to connect to and provision the Linode instance."
  type        = string
  sensitive   = true
}
