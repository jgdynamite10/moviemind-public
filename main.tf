# main.tf
resource "linode_instance" "moviemind_app" {
  image = "linode/ubuntu23.10"
  label = var.label
  region = var.region
  type = var.instance_type
  root_pass = var.root_pass
  authorized_keys = [
    var.ssh_public_key // Add the public key to the Linode instance for authentication
  ]
}

// Create nginx.conf file from a template if domain name is provided
data "template_file" "nginx_conf" {
  template = file("${path.module}/project/nginx.conf.tpl")

  vars = {
    domain_name = var.domain_name
  }
}

resource "local_file" "nginx_conf_file" {
  count    = var.domain_name != "" ? 1 : 0
  content  = data.template_file.nginx_conf.rendered
  filename = "${path.module}/project/nginx.conf"
}

resource "null_resource" "app_init" {
  // Triggers to rerun the initialization script if any of these values change
  // This is useful if you want to rerun the initialization script after changing the Linode instance
  triggers = {
    always_run = "${timestamp()}"
  }

  // Ensures this runs after the Linode instance is available
  depends_on = [linode_instance.moviemind_app]

  // Delete old app dir before copying files
  provisioner "remote-exec" {
    inline = [
      "rm -rf /home/${var.username}/${var.app_dir} || true",
      "mkdir -p /home/${var.username}/${var.app_dir}"
    ]

    connection {
      type        = "ssh"
      user        = "root"
      host        = linode_instance.moviemind_app.ip_address
      agent       = true
    }
  }

  // Use the file provisioner to copy project files to an app dir
  provisioner "file" {
    source      = "./project/"
    destination = "/home/${var.username}/${var.app_dir}"

    connection {
      type        = "ssh"
      user        = "root"
      host        = linode_instance.moviemind_app.ip_address
      agent       = true // Use the local SSH agent instead of SSH-key for authentication
    }
  }

  // Use the remote-exec provisioner to execute the initialization script
  provisioner "file" {
    source      = "init.sh"
    destination = "/tmp/init.sh"

    connection {
      type        = "ssh"
      user        = "root"
      host        = linode_instance.moviemind_app.ip_address
      agent       = true 
    }
  }

  provisioner "remote-exec" {
    inline = [
      "echo USERNAME='${var.username}' > /tmp/env_vars.sh;",
      "echo APP_DIR='${var.app_dir}' >> /tmp/env_vars.sh;",
      "if [ -n '${var.domain_name}' ]; then echo DOMAIN_NAME='${var.domain_name}' >> /tmp/env_vars.sh; fi",
      "if [ -n '${var.domain_name}' ]; then echo CERTBOT_EMAIL='${var.certbot_email}' >> /tmp/env_vars.sh; fi",
      "chmod +x /tmp/init.sh",
      "/tmp/init.sh",
    ]

    connection {
      type        = "ssh"
      user        = "root"
      host        = linode_instance.moviemind_app.ip_address
      agent       = true
    }
  }
}

