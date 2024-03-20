#!/bin/bash
# init.sh
# This script is used to initialize the MovieMind app on a fresh Ubuntu server.

# Ensure the script is run as root
if [ "$(id -u)" != "0" ]; then
   echo "[init.sh] This script must be run as root" 1>&2
   exit 1
fi

# Source environment variables
if [ -f "/tmp/env_vars.sh" ]; then
  source /tmp/env_vars.sh
fi

# Create user "moviemind" and switch to their home folder
useradd -m $USERNAME
USER_HOME="/home/$USERNAME"

# Check if DOMAIN_NAME is set and CERTBOT_EMAIL is not set
if [ -n "$DOMAIN_NAME" ] && [ -z "$CERTBOT_EMAIL" ]; then
  echo "[init.sh] Error: DOMAIN_NAME is set but CERTBOT_EMAIL is not set. Please provide an email for Certbot SSL certificate registration."
  exit 1
fi

# Obtain SSL cerfiticate if DOMAIN_NAME is set
if [ -n "$DOMAIN_NAME" ]; then
  if [ -z "$CERTBOT_EMAIL" ]; then
    echo "[init.sh] Error: CERTBOT_EMAIL is not set."
    exit 1
  fi

  echo "[init.sh] Domain name is set to $DOMAIN_NAME. Proceeding with Certbot SSL certificate setup."
  if ! command -v certbot &> /dev/null; then
      echo "[init.sh] Certbot not installed. Installing Certbot..."
      apt-get update
      apt-get install -y certbot python3-certbot-nginx
  else
      echo "[init.sh] Certbot is already installed."
  fi
  certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
else
  echo "[init.sh] DOMAIN_NAME is not set. Skipping SSL certificate setup."
fi

# Create "moviemind-app" work folder in home folder
WORK_DIR="$USER_HOME/$APP_DIR"
mkdir -p $WORK_DIR

# Copy all project files into the work folder
# TMP_DIR=/tmp/project
# cp -r $TMP_DIR/. $WORK_DIR/
cd $WORK_DIR

# Create a folder for the models
mkdir -p $WORK_DIR/models

# Install Docker and Docker Compose
if ! command -v docker &> /dev/null; then
    echo "[init.sh] Docker not installed. Installing Docker..."
    apt-get update
    apt-get install -y docker.io
else
    echo "[init.sh] Docker is already installed."
fi

DOCKER_COMPOSE_VERSION="1.29.2"
DOCKER_COMPOSE_BIN="/usr/local/bin/docker-compose"
DOCKER_COMPOSE_URL="https://github.com/docker/compose/releases/download/$DOCKER_COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)"

if [ ! -f "$DOCKER_COMPOSE_BIN" ]; then
    echo "[init.sh] Docker Compose not installed. Installing Docker Compose version $DOCKER_COMPOSE_VERSION..."
    curl -L "$DOCKER_COMPOSE_URL" -o "$DOCKER_COMPOSE_BIN"
    chmod +x "$DOCKER_COMPOSE_BIN"
else
    echo "[init.sh] Docker Compose is already installed."
fi

# Allow "moviemind" user to run Docker commands
usermod -aG docker $USERNAME

# Adjust file permissions and ownership
chown -R $USERNAME:$USERNAME $WORK_DIR

# Create a docker-compose.yml file from the template
chmod +x "$WORK_DIR/docker-compose.sh"
su -l $USERNAME -c "cd $WORK_DIR && ./docker-compose.sh"

# Dangerous! Forcely kill Nginx if it's running due to we use containerized Nginx copy
killall nginx

# Switch to moviemind user for app building and startup
su $USERNAME -c "cd $WORK_DIR && docker-compose down && docker-compose up -d --build"