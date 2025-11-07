import os
import requests
import psycopg2
import json

def run_auto_import():
    print("🌍 Starting ICD-11 auto import from WHO API...")

    who_client_id = os.getenv("WHO_CLIENT_ID")
    who_client_secret = os.getenv("WHO_CLIENT_SECRET")
    db_url = os.getenv("DATABASE_URL")
    print(f"🧪 DATABASE_URL = {db_url}")

    if not who_client_id or not who_client_secret:
        print("❌ WHO API credentials not found. Check environment variables.")
        return

    if not db_url:
        print("❌ DATABASE_URL missing.")
        return

    # Get access token from WHO
    token_url = "https://icdaccessmanagement.who.int/connect/token"
    token_data = {
        "client_id": who_client_id,
        "client_secret": who_client_secret,
        "scope": "icdapi_access",
        "grant_type": "client_credentials"
    }

    print("🔑 Requesting WHO API token...")
    token_response = requests.post(token_url, data=token_data)
    if token_response.status_code != 200:
        print("❌ Failed to get token:", token_response.text)
        return

    access_token = token_response.json().get("access_token")
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}

    # Fetch ICD-11 foundation entities (limited for now)
    icd_url = "https://id.who.int/icd/release/11/mms/foundation"
    print("📡 Fetching ICD-11 data...")
    response = requests.get(icd_url, headers=headers)

    if response.status_code != 200:
        print("❌ Failed to fetch ICD-11 data:", response.text)
        return

    data = response.json()
    print(f"✅ Retrieved {len(data) if isinstance(data, list) else 1} ICD-11 entries (sample).")

    # Connect to database
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS diseases (
            id SERIAL PRIMARY KEY,
            icd TEXT,
            name TEXT,
            slug TEXT,
            overview TEXT,
            symptoms_common TEXT,
            labs_key TEXT,
            red_flags TEXT,
            references TEXT
        )
    """)

    # Insert example entries from ICD-11 data
    if isinstance(data, list):
        for item in data[:25]:
            icd_code = item.get("id", "N/A")
            name = item.get("title", {}).get("@value", "Unknown")
            overview = json.dumps(item)
            cur.execute("""
                INSERT INTO diseases (icd, name, slug, overview)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (icd_code, name, name.lower().replace(" ", "-"), overview))
    else:
        print("⚠️ WHO API response format not list — storing single record.")
        cur.execute("""
            INSERT INTO diseases (icd, name, slug, overview)
            VALUES (%s, %s, %s, %s)
        """, ("ICD11", "WHO Root", "who-root", json.dumps(data)))

    conn.commit()
    cur.close()
    conn.close()

    print("🎉 ICD-11 import completed successfully.")
