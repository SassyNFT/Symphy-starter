import psycopg2
import requests
import json
import os
import time

# ✅ Database connection from Render environment variables
DB_HOST = os.getenv("PGHOST")
DB_NAME = os.getenv("PGDATABASE")
DB_USER = os.getenv("PGUSER")
DB_PASS = os.getenv("PGPASSWORD")
DB_PORT = os.getenv("PGPORT", "5432")

# ✅ Stable ICD-10 dataset mirror (working source)
ICD_URL = "https://raw.githubusercontent.com/dominicegginton/openicd/main/icd10.json"

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

# ✅ Download ICD-10 dataset with retry logic
for attempt in range(3):
    try:
        print(f"⬇️ Downloading disease dataset (attempt {attempt + 1}) from:", ICD_URL)
        resp = requests.get(ICD_URL, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            break
        else:
            print(f"⚠️ Attempt {attempt + 1} failed with status {resp.status_code}")
            time.sleep(2)
    except Exception as e:
        print(f"⚠️ Attempt {attempt + 1} error: {e}")
        time.sleep(2)
else:
    raise RuntimeError("❌ Failed to download ICD data after 3 attempts.")

# ✅ Insert ICD-10 codes into database
inserted = 0
for item in data:
    code = item.get("code")
    desc = item.get("description") or "No description"
    category = item.get("chapter") or "General"
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
