import psycopg2
import requests
import json
import os

# ✅ Database connection from Render environment variables
DB_HOST = os.getenv("PGHOST")
DB_NAME = os.getenv("PGDATABASE")
DB_USER = os.getenv("PGUSER")
DB_PASS = os.getenv("PGPASSWORD")
DB_PORT = os.getenv("PGPORT", "5432")

# ✅ Verified live ICD-10 dataset source
ICD_URL = "https://raw.githubusercontent.com/open-data-icd/ICD-10-CM/main/icd10cm.json"

# ✅ Connect to Postgres
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

# ✅ Create table for ICD data
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

# ✅ Download ICD-10 dataset
print("⬇️ Downloading disease dataset from:", ICD_URL)
resp = requests.get(ICD_URL)

if resp.status_code != 200:
    raise RuntimeError(f"Failed to download ICD data: {resp.status_code}")

try:
    data = resp.json()
except json.JSONDecodeError:
    raise RuntimeError("❌ Invalid JSON data received from ICD source.")

# ✅ Insert ICD-10 codes into database
inserted = 0
for item in data:
    code = item.get("code")
    desc = item.get("description") or item.get("desc") or "No description"
    category = item.get("chapter") or item.get("category") or "General"
    try:
        cur.execute(
            """
            INSERT INTO diseases (code, description, category, full_data)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (code) DO NOTHING;
            """,
            (code, desc, category, json.dumps(item))
        )
        inserted += 1
    except Exception as e:
        print(f"⚠️ Skipped entry {code}: {e}")

conn.commit()
print(f"✅ Disease data inserted successfully ({inserted} entries).")

cur.close()
conn.close()
print("✅ Database initialization complete.")
