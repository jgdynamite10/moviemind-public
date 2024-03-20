# outputs.tf

output "App_Address" {
  description   = "Use this URL to access the app in a web browser"
  value = "http://${linode_instance.moviemind_app.ip_address}:8123"
}
