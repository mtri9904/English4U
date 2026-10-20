# Use Miniforge base image with preconfigured conda-forge and fast Mamba solver
FROM condaforge/miniforge3:latest

WORKDIR /code
ENV PYTHONPATH=/code
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for audio processing and compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create a clean Python 3.10 environment with Montreal Forced Aligner (MFA)
RUN mamba create -n app_env -y -c conda-forge python=3.10 montreal-forced-aligner && \
    mamba clean --all -y

# Make app_env the default active Python environment
ENV PATH="/opt/conda/envs/app_env/bin:${PATH}"

# Pre-download English acoustic model and dictionary for MFA
ENV MFA_ROOT_DIR=/code/mfa_models
RUN mkdir -p /code/mfa_models && \
    mfa model download acoustic english_mfa && \
    mfa model download dictionary english_mfa && \
    chmod -R 777 /code/mfa_models

# Install pip requirements inside app_env
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Allosaurus English model
RUN python -m allosaurus.bin.download_model -m eng2102

# Copy the application source code
COPY . .
RUN chmod -R 777 /code

# Hugging Face Spaces runs on port 7860
EXPOSE 7860

# Run uvicorn on port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
