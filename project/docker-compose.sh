#!/bin/bash
# docker-compose.sh
# This script is used to generate the docker-compose.yml file based on the environment variables

# Source environment variables
if [ -f "/tmp/env_vars.sh" ]; then
  source /tmp/env_vars.sh
fi

# Start with the base docker-compose configuration
echo "[docker-compose.sh] Generating docker-compose.yml file..."
cat > docker-compose.yml << EOF
version: '3.8'
services:
  app:
    image: llamaweb
    build: .
    ports:
      - "8123:8123"
    volumes:
      - ./app:/llama/app
      - ./vectorstore:/llama/vectorstore
    command: uvicorn main:app --reload --host 0.0.0.0 --port 8123
EOF

# Conditionally append the nginx service configuration if DOMAIN_NAME is set
if [[ -n "$DOMAIN_NAME" ]]; then
    echo "[docker-compose.sh] Adding nginx configuration..."
    cat >> docker-compose.yml << EOF

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem:/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem
      - /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem:/etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem
EOF
fi
