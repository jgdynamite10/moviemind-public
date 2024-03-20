FROM python:3.10

WORKDIR /llama

# Copy only the requirements file, to cache the pip install step
COPY ./requirements.txt /llama/requirements.txt

# Upgrade pip and install required Python packages
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --upgrade -r /llama/requirements.txt

# Download the LLM
WORKDIR /llama/models
RUN huggingface-cli download TheBloke/Mistral-7B-OpenOrca-GGUF mistral-7b-openorca.Q4_K_M.gguf --local-dir . --local-dir-use-symlinks False

# Set the working directory to where the app will be mounted
WORKDIR /llama/app
