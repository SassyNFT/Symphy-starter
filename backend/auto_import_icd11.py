import os
import requests
import psycopg2
import time
from psycopg2.extras import Json

def run_auto_import():
    print("🔄 Starting ICD-11 auto import...")
    client_id = os.getenv("WHO_CLIENT_ID")
    client_secret = os.getenv("WHO_CLIENT_SECRET")
    db_url = os.getenv("DATABASE_URL")

    if not all([client_id, client_secret, db_url]):
        raise RuntimeError("❌ Missing WHO or Database credentials.")

    # 1. Authenticate with WHO API
    token_resp = requests.post(
        "https://icdaccessmanagement.who.int/connect/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "icdapi_access",
            "grant_type": "client_credentials"
        }
    )
    token_resp.raise_for_status()
    token = token_resp.json()["access_token"]
    print("✅ Authenticated with WHO API")

    # 2. Connect to database
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Ensure diseases table exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS diseases (
            id SERIAL PRIMARY KEY,
            icd TEXT UNIQUE,
            name TEXT,
            slug TEXT,
            overview TEXT,
            category TEXT,
            data JSONB
        )
    """)
    conn.commit()

    # 3. Fetch ICD-11 data (paged)
    base_url = "https://id.who.int/icd/release/11/mms"
    url = f"{base_url}/?flat=true&limit=100"
    headers = {"Authorization": f"Bearer {token}"}

    total = 0
    while url:
        print(f"📥 Fetching page: {url}")
        resp = requests.get(url, headers=headers)
        data = resp.json()
        diseases = data.get("destinationEntities", [])
        for d in diseases:
            icd_id = d.get("code", "")
            title = d.get("title", {}).get("@value", "")
            slug = icd_id.lower().replace(".", "-")
            overview = d.get("definition", {}).get("@value", "")
            category = d.get("parent", "")
            try:
                cur.execute("""
                    INSERT INTO diseases (icd, name, slug, overview, category, data)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (icd) DO NOTHING
                """, (icd_id, title, slug, overview, category, Json(d)))
                total += 1
            except Exception as e:
                print(f"⚠️ Skipped record {icd_id}: {e}")
                conn.rollback()
            else:
                conn.commit()
        url = data.get("nextPage")
        time.sleep(0.3)  # respect rate limits

    print(f"🎉 Import complete — inserted or verified {total} ICD-11 records.")
    cur.close()
    conn.close()

if __name__ == "__main__":
    run_auto_import()
