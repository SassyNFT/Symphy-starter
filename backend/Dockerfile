FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy dependency file
COPY requirements.txt .

# ✅ Fix SSL certificate issues by installing CA certificates
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . .

# Expose port (if you need it for FastAPI, Flask, etc.)
EXPOSE 8000

# Default command
CMD ["python", "backend/main.py"]
