import os
import requests
import psycopg2
import time

def run_auto_import():
    client_id = os.getenv("WHO_CLIENT_ID")
    client_secret = os.getenv("WHO_CLIENT_SECRET")
    db_url = os.getenv("DATABASE_URL")

    if not client_id or not client_secret:
        print("❌ WHO_CLIENT_ID or WHO_CLIENT_SECRET missing from environment.")
        return
    if not db_url:
        print("❌ DATABASE_URL missing — cannot connect to DB.")
        return

    print("✅ Environment variables detected. Starting WHO ICD-11 import...")

    try:
        # Authenticate
        response = requests.post(
            "https://icdaccessmanagement.who.int/connect/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "icdapi_access",
                "grant_type": "client_credentials",
            },
        )
        if response.status_code != 200:
            print(f"❌ WHO API auth failed: {response.text}")
            return

        token = response.json().get("access_token")
        print("🔑 WHO API authentication succeeded.")

        # Begin fetch loop
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        url = "https://id.who.int/icd/release/11/mms?flat=true&releaseId=2024-01&offset=0&limit=100"
        print(f"📥 Fetching first batch: {url}")
        res = requests.get(url, headers=headers)
        print(f"HTTP {res.status_code}")
        if res.status_code != 200:
            print("❌ Fetch failed:", res.text)
            return

        data = res.json()
        total = len(data.get("destinationEntities", []))
        print(f"✅ Retrieved {total} records in first batch.")
        print("🎉 ICD-11 import test successful (initial fetch confirmed).")

    except Exception as e:
        print(f"❌ Fatal error in auto_import_icd11: {e}")

if __name__ == "__main__":
    run_auto_import()
