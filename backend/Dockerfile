FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

# ✅ Install system dependencies & force CA refresh
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates curl openssl gnupg && \
    update-ca-certificates --fresh && \
    rm -rf /var/lib/apt/lists/*

# ✅ Upgrade pip + certifi + explicitly point OpenSSL to Python’s CA
RUN python -m pip install --upgrade pip certifi && \
    ln -sf $(python -m certifi) /etc/ssl/certs/ca-certificates.crt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# ✅ Healthcheck (optional)
HEALTHCHECK CMD python -c "import requests, certifi; print(requests.get('https://icd.who.int/ct/icd11_mms/en/release', verify=certifi.where()).status_code)" || exit 1

CMD ["uvicorn", "backend.api_server:app", "--host", "0.0.0.0", "--port", "8000"]
