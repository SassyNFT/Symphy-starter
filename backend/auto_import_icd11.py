import os
import requests
import psycopg2
import time

WHO_API_BASE = "https://id.who.int/icd/release/11/mms"
CLIENT_ID = os.getenv("WHO_CLIENT_ID")
CLIENT_SECRET = os.getenv("WHO_CLIENT_SECRET")
DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def get_access_token():
    print("🔑 Requesting WHO API token...")
    response = requests.post(
        "https://icdaccessmanagement.who.int/connect/token",
        data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "scope": "icdapi_access",
            "grant_type": "client_credentials",
        },
    )
    if response.status_code != 200:
        raise Exception(f"WHO API Auth failed: {response.text}")
    token = response.json()["access_token"]
    print("✅ Authenticated with WHO API.")
    return token

def fetch_icd11_data(token):
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    limit = 100
    offset = 0
    all_diseases = []

    print("📥 Starting ICD-11 data import from WHO API...")

    while True:
        url = f"{WHO_API_BASE}?flat=true&releaseId=2024-01&offset={offset}&limit={limit}"
        r = requests.get(url, headers=headers)
        if r.status_code != 200:
            print(f"⚠️ Failed page {offset}: {r.text}")
            break

        data = r.json()
        entities = data.get("destinationEntities", [])
        if not entities:
            break

        all_diseases.extend(entities)
        print(f"✅ Imported {len(all_diseases)} records so far...")

        offset += limit
        time.sleep(0.2)  # respect WHO API rate limits

    print(f"🎉 Completed WHO ICD-11 import: {len(all_diseases)} total records.")
    return all_diseases

def save_to_database(records):
    conn = get_db_connection()
    cur = conn.cursor()
    inserted = 0

    for rec in records:
        icd = rec.get("code", "")
        name = rec.get("title", {}).get("@value", "")
        slug = icd.lower().replace(".", "-")
        overview = rec.get("definition", {}).get("@value", "")
        category = rec.get("parent", "")
        data_json = str(rec)

        cur.execute("""
            INSERT INTO diseases (icd, name, slug, overview, category, data)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (icd) DO NOTHING;
        """, (icd, name, slug, overview, category, data_json))

        inserted += 1
        if inserted % 500 == 0:
            conn.commit()
            print(f"💾 {inserted} records committed...")

    conn.commit()
    cur.close()
    conn.close()
    print(f"🎯 Saved {inserted} records to database.")

def run_auto_import():
    try:
        token = get_access_token()
        records = fetch_icd11_data(token)
        save_to_database(records)
    except Exception as e:
        print(f"❌ ICD-11 import failed: {e}")

if __name__ == "__main__":
    run_auto_import()
