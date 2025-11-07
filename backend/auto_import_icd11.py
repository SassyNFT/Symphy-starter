import os
import requests
import psycopg2
from psycopg2.extras import execute_batch

def run_auto_import():
    print("🌍 Starting ICD-11 import...")

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("❌ DATABASE_URL not set")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Recreate table
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
    print("🧱 Table 'diseases' recreated successfully")

    # Pull simplified ICD-11 foundation entities
    url = "https://id.who.int/icd/release/11/2024/foundation"
    print(f"📡 Fetching data from {url}")
    response = requests.get(url, headers={"Accept": "application/json"})

    if response.status_code != 200:
        print(f"❌ Failed to fetch WHO ICD data — HTTP {response.status_code}")
        cur.close(); conn.close()
        return

    data = response.json()
    items = data.get("child", [])

    if not items:
        print("⚠️ No ICD entries returned from WHO API.")
        cur.close(); conn.close()
        return

    # Insert rows
    rows = []
    for item in items:
        icd = item.get("code", "N/A")
        title = item.get("title", {}).get("@value", "Unnamed")
        slug = title.lower().replace(" ", "-")
        rows.append((icd, title, slug, None, None, None, None, None))

    execute_batch(cur, """
        INSERT INTO diseases (icd, name, slug, overview, symptoms_common, labs_key, red_flags, references)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
    """, rows)
    conn.commit()
    print(f"✅ Inserted {len(rows)} ICD-11 records successfully")

    cur.close()
    conn.close()
    print("🎉 ICD-11 import completed.")
