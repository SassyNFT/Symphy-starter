import os
import requests
import psycopg2
from psycopg2.extras import execute_batch

WHO_API_BASE = "https://id.who.int/icd/release/11/2024"

def run_auto_import():
    print("🌐 Starting ICD-11 data import...")

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("❌ DATABASE_URL not set")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Drop and recreate the diseases table
    cur.execute("""
        DROP TABLE IF EXISTS diseases;
        CREATE TABLE diseases (
            icd TEXT PRIMARY KEY,
            name TEXT,
            slug TEXT,
            overview TEXT,
            symptoms_common TEXT,
            labs_key TEXT,
            red_flags TEXT,
            references TEXT
        );
    """)
    conn.commit()

    # Fetch ICD data (this is a simple sample)
    url = f"{WHO_API_BASE}/foundation/"
    print(f"📡 Fetching data from: {url}")
    response = requests.get(url)

    if response.status_code != 200:
        print(f"❌ Failed to fetch ICD data: {response.status_code}")
        return

    data = response.json()
    items = data.get("child", [])

    rows = []
    for item in items:
        icd = item.get("code", "N/A")
        title = item.get("title", {}).get("@value", "Unnamed condition")
        slug = title.lower().replace(" ", "-")
        rows.append((icd, title, slug, None, None, None, None, None))

    if rows:
        execute_batch(cur, """
            INSERT INTO diseases (icd, name, slug, overview, symptoms_common, labs_key, red_flags, references)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """, rows)
        conn.commit()
        print(f"✅ Inserted {len(rows)} ICD diseases into the database.")
    else:
        print("⚠️ No ICD entries found — check WHO API response.")

    cur.close()
    conn.close()
    print("🎉 ICD-11 import completed successfully.")
