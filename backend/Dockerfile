FROM python:3.11-slim

WORKDIR /app

# Copy dependency file
COPY requirements.txt .

# ✅ Install and refresh SSL certificate authorities
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl openssl && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ✅ Ensure Python’s certifi store is updated
RUN python -m pip install --upgrade pip certifi && \
    python -m certifi > /etc/ssl/certs/ca-certificates.crt

# Install project dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . .

# Expose port (if your app uses one)
EXPOSE 8000

# Start the app
CMD ["python", "backend/main.py"]
