import os
import json
import psycopg2
import requests

# ─────────────────────────────────────────────
# Connect to your Render Postgres database
# ─────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL not found in environment variables.")

conn = psycopg2.connect(DATABASE_URL, sslmode="require")
cur = conn.cursor()

# ─────────────────────────────────────────────
# Create tables
# ─────────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS diseases (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    icd TEXT,
    overview TEXT,
    symptoms_common JSONB,
    labs_key JSONB,
    red_flags JSONB,
    reference_data JSONB
);
""")

conn.commit()
print("✅ Table created or already exists.")

# ─────────────────────────────────────────────
# Download and load WHO / ICD disease list
# (small sample for testing first)
# ─────────────────────────────────────────────
ICD_URL = "https://raw.githubusercontent.com/datasets/infectious-diseases/main/data/diseases.json"
print("⬇️ Downloading disease dataset from:", url)

resp = requests.get(url)
if resp.status_code != 200:
    raise RuntimeError(f"Failed to download ICD data: {resp.status_code}")
data = resp.json()

# ─────────────────────────────────────────────
# Normalize and insert diseases
# ─────────────────────────────────────────────
inserted = 0
for item in data[:2000]:  # limit for now; expand later
    name = item.get("desc") or item.get("title") or "Unknown"
    icd = item.get("code")
    slug = name.lower().replace(" ", "-")
    overview = f"ICD code {icd}: {name}"

    cur.execute("""
        INSERT INTO diseases (name, slug, icd, overview)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (slug) DO NOTHING;
    """, (name, slug, icd, overview))
    inserted += 1

conn.commit()
cur.close()
conn.close()

print(f"✅ Imported {inserted} disease records successfully.")
