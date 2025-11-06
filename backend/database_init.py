import psycopg2
import requests
import json
import os
import time

# === Database connection from Render environment variables ===
DB_HOST = os.getenv("PGHOST")
DB_NAME = os.getenv("PGDATABASE")
DB_USER = os.getenv("PGUSER")
DB_PASS = os.getenv("PGPASSWORD")
DB_PORT = os.getenv("PGPORT", "5432")

# === Stable ICD-10 dataset mirrors ===
PRIMARY_URL = "https://raw.githubusercontent.com/ozlerhakan/mongodb-json-files/master/datasets/icd10.json"
BACKUP_URL = "https://raw.githubusercontent.com/dominicegginton/openicd-backup/main/icd10.json"

# === Connect to Postgres ===
try:
    conn = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        port=DB_PORT
    )
    cur = conn.cursor()
    print("✅ Connected to database.")
except Exception as e:
    raise RuntimeError(f"❌ Database connection failed: {e}")

# === Create table for ICD data ===
cur.execute("""
CREATE TABLE IF NOT EXISTS diseases (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE,
    description TEXT,
    category TEXT,
    full_data JSONB
);
""")
conn.commit()
print("✅ Table created or already exists.")

# === Function to download dataset with retries ===
def download_icd_data(url):
    for attempt in range(3):
        try:
            print(f"⬇️ Downloading disease dataset (attempt {attempt+1}) from: {url}")
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200:
                return resp.json()
            else:
                print(f"⚠️ Attempt {attempt+1} failed with status {resp.status_code}")
        except Exception as e:
            print(f"⚠️ Attempt {attempt+1} error: {e}")
        time.sleep(2)
    return None

# === Try primary, then fallback ===
data = download_icd_data(PRIMARY_URL)
if not data:
    print("⚠️ Primary source failed, trying backup...")
    data = download_icd_data(BACKUP_URL)
if not data:
    raise RuntimeError("❌ Failed to download ICD data from all sources.")

# === Insert ICD data into Postgres ===
inserted = 0
for item in data:
    code = item.get("code") or item.get("id") or "N/A"
    desc = item.get("description") or item.get("desc") or "No description"
    category = item.get("chapter") or "General"
    try:
        cur.execute("""
            INSERT INTO diseases (code, description, category, full_data)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (code) DO NOTHING;
        """, (code, desc, category, json.dumps(item)))
        inserted += 1
    except Exception as e:
        print(f"⚠️ Skipped {code}: {e}")

conn.commit()
cur.close()
conn.close()
print(f"✅ Inserted {inserted} ICD entries successfully.")
print("✅ Database initialization complete.")
