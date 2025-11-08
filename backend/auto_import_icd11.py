import os
import requests
import psycopg2
from psycopg2.extras import execute_batch

WHO_API_URL = "https://id.who.int/icd/entity"
LIMIT = 50  # number of ICD-11 entities to import (increase later)

def run_auto_import():
    """Fetch ICD-11 entities from WHO API and store them in the database."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("❌ DATABASE_URL not set")

    print("🧠 ICD importer starting...")
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    imported = 0

    try:
        for offset in range(0, LIMIT, 10):  # fetch in pages
            url = f"{WHO_API_URL}?offset={offset}&limit=10"
            response = requests.get(url, headers={"Accept": "application/json"})
            if response.status_code != 200:
                print(f"⚠️ WHO API request failed: {response.status_code}")
                break

            data = response.json()
            entities = data.get("entity", [])
            rows = []

            for entity in entities:
                icd = entity.get("id", "")
                name = entity.get("title", {}).get("@value", "Unknown Disease")
                slug = name.lower().replace(" ", "-")
                overview = entity.get("definition", {}).get("@value", "")
                symptoms_common = "N/A"
                labs_key = "N/A"
                red_flags = "N/A"
                references = "WHO ICD-11"

                rows.append((icd, name, slug, overview, symptoms_common, labs_key, red_flags, references))

            execute_batch(cur, """
                INSERT INTO diseases (icd, name, slug, overview, symptoms_common, labs_key, red_flags, "references")
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (icd) DO NOTHING;
            """, rows)

            imported += len(rows)
            conn.commit()
            print(f"✅ Imported {imported} ICD-11 entities so far...")

    except Exception as e:
        print(f"❌ Import failed: {e}")
    finally:
        cur.close()
        conn.close()
        print(f"✅ ICD-11 import finished. Inserted/updated {imported} rows.")
