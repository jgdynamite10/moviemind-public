# Moviemind AI advisor: how to set up

You can use this guide for quick Moviemind app deployment into your Linode account. It will automatically create a Linode instance, install all required software and deploy the app. Don't have an account? Try our cloud computing services for [free with a $100 credit](https://www.linode.com/lp/free-credit-100/?promo=sitelin100-02162023&promo_value=100&promo_length=60&utm_source=google&utm_medium=cpc&utm_campaign=11178784975_109179237083&utm_term=g_kwd-967903494911_e_linode%20free%20%24100&utm_content=466889956471&locationid=9027296&device=c_c&gad_source=1&gclid=CjwKCAjwkuqvBhAQEiwA65XxQMbIBaPEBdaciW7s4Z2quM830DVTReco9ivnVcd677iEz6VXkXiHzRoCFvwQAvD_BwE)

**Note** - Due to security reasons, your account may have a soft limit in place that prevents the launch of the minimum instance type required for this project (dedicated 16 GB or g6-dedicated-8). Please open a [support ticket](https://cloud.linode.com/support/tickets) to request the removal of this limit.  

## 1. Prepare Your Environment

### Install Terraform

First, ensure you have Terraform installed. If not, download and install Terraform CLI from [https://terraform.io](terraform.io).

Follow [Terraform's guides](https://developer.hashicorp.com/terraform/install?ajs_aid=7f515b44-1db4-49a2-9dc3-ab2aa8466b80&product_intent=terraform) for installation on different platforms.

Installing Terraform on Mac M1, check out this known issue: [issue solved](https://discuss.hashicorp.com/t/template-v2-2-0-does-not-have-a-package-available-mac-m1/35099/6)

### Generate a Linode API Token

You need an API token for Terraform to interact with Linode's API.

Generate this token through the Linode Cloud Manager under "My Profile" -> ["API Tokens"](https://cloud.linode.com/profile/tokens) -> "Create a Personal Access Token" with scopes for reading and writing (Read/Write) Linodes, IPs and Domains. Write down this token in a secure place; it grants access to your Linode account.

### Use an SSH Agent

For added security, use password-protected SSH key and manage it with an SSH agent and passphrases in order to make Terraform pipeline to work.

#### To create an SSH Key

```bash
ssh-keygen -t ed25519 -C "your email"
```

#### Verify Key Permissions

```bash
chmod 600 /path/to/private_key
```
#### Start the SSH Agent

```bash
eval "$(ssh-agent -s)"
```
#### Add Your SSH Key to the SSH Agent

Use ssh-add to add your private SSH key to the SSH agent. When adding, you'll be prompted to enter the passphrase for your key.

```bash
ssh-add /path/to/your/private/key
```

## 2. Prepare project files

Clone this repository to your local machine.

## 3. Initialize and Apply Terraform Configuration

### To enter your credentials, follow these steps:

Copy the file `example.secrets.tfvars` into `secrets.tfvars` and fill in your credentials.

### (Optional) Adjust Terraform configuration

You can tweak some Linode instance settings by updating [variables.tf](variables.tf) file:

- label
- region
- instance_type.

**Note** - During testing, g6-dedicated-8, g6-standard-8 or higher (cpu + mem) worked best however, default is g6-dedicated-8. 

**Important!** Don't set domain during initial set up. You need your server up and running before setting domain (see below, domain is optional).

Sensitive variables are set in the `secrets.tfvars` config.

### Initialize Terraform

Run `terraform init` in the project directory. This command initializes Terraform, downloads the Linode provider, and prepares project for deployment.

```bash
terraform init
```

### Apply Terraform Configuration

Execute `terraform apply -var-file="secrets.tfvars"` to create the resources defined in the Terraform configuration. Terraform will prompt you to review the proposed changes and ask for confirmation before proceeding.

```bash
terraform apply -var-file="secrets.tfvars"
```

The process takes around 5-10 min.

## 4. Once the Terraform process is complete, you can access your application as follows:

After Terraform successfully applies the changes, it will output the IP address of the Linode instance and PORT. Wait for 1 min and you can use this address to access Moviemind application deployed in Docker containers on the Linode virtual machine.

### Optional - Accessing Application from Your Domain

Once you have your app `IP address`, you can set up a custom domain for your app.

To do so:

- Create A-record pointing to your Linode instance's IP in your domain DNS settings.
- Wait for a few hours for DNS to be updated. You can [check status here](https://simpledns.plus/lookup-dg).
- Set up domain name and email in the [variables.tf](variables.tf)
- Run `terraform apply -var-file="secrets.tfvars"` again.

After these steps server should obtain SSL certificate and start the nginx instance for domain.

## 5. Clean Up

Once you are done using the application, you can delete your Linode instance (VM) to minimize costs. This action will remove the resources that were allocated for your application, thereby stopping any ongoing charges associated with them. You can always repeat step 3 above to deploy moviemind as needed. 

## 6. Troubleshooting

### Server creation is stuck or server is created but offline

Sometimes the process gets stuck for more than 3 min with no obvious progress or server seems being created but remains offline. In this case the best option is to delete this server and run `terraform apply -var-file="secrets.tfvars"` again.

### Terraform can't establish SSH connection with a server

Ensure you have SSH agent running and your SSH key is aaded. See [more info about SSH agent](https://smallstep.com/blog/ssh-agent-explained/).

### The process is stuck on any stage

If deployment process gets stuck for more than 3 min with no obvious progress press `Ctrl+C` to break and run `terraform apply -var-file="secrets.tfvars"` to restart the process. In the most cases this should help.

### You can't access the app via domain and SSL certificate for domain can't be obtained

If you've set up domain but server can't obtain SSL certificate (you can see this during deployment output) — check your DNS records and ensure your have A record pointing to Linode instance IP.

If your domain is delegated properly and pointing to the server IP, check Nginx status to investigate the issue (see below).

### Further troubleshooting

Should any unexpected issue arise, connect to your server via SSH and check Docker containers with command `docker ps -a`.

You should have two containers up and running:

- moviemind-app
- nginx (if you set up domain)

For further investigation check container logs with command `docker logs CONTAINER_ID`.
