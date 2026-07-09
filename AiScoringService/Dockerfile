# Use Miniconda base image to support Montreal Forced Aligner (MFA) installation
FROM continuumio/miniconda3:latest

WORKDIR /code

# Downgrade Python in the base environment to 3.10 for compatibility with older libraries like allosaurus
RUN conda install -y python=3.10 && conda clean --all -y

# Install system dependencies (ffmpeg, libsndfile1 for audio, git, build-essential for C++ compilation)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Montreal Forced Aligner (MFA) via Conda
RUN conda clean --all -y && conda install --solver=classic -y -c conda-forge montreal-forced-aligner

# Pre-download English acoustic model and dictionary for MFA
ENV MFA_ROOT_DIR=/code/mfa_models
RUN mfa model download acoustic english_mfa
RUN mfa model download dictionary english_mfa

# Install pip requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Allosaurus English model to prevent timeouts on first request
RUN python -m allosaurus.bin.download_model -m eng2102

# Copy the application source code
COPY . .

# Hugging Face Spaces runs on port 7860 by default
EXPOSE 7860

# Command to run uvicorn on port 7860 (required by Hugging Face)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
