import os
import requests
import psycopg2
from psycopg2.extras import execute_batch

def run_auto_import():
    """Import ICD-11 entities from WHO using API key."""
    database_url = os.getenv("DATABASE_URL")
    who_api_key = os.getenv("WHO_API_KEY")

    if not database_url:
        raise RuntimeError("❌ DATABASE_URL not set")
    if not who_api_key:
        raise RuntimeError("❌ WHO_API_KEY not set in Render environment")

    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    base_url = "https://id.who.int/icd/release/11/mms"
    imported = 0
    headers = {
        "Authorization": f"Bearer {who_api_key}",
        "Accept": "application/json"
    }

    print("🌍 Starting ICD-11 import from WHO...")

    try:
        # WHO structure is hierarchical, but we'll just take top-level entities first
        response = requests.get(f"{base_url}/root", headers=headers, timeout=20)
        if response.status_code != 200:
            print(f"❌ WHO API error {response.status_code}: {response.text}")
            return

        root = response.json()
        entities = root.get("child", [])

        if not entities:
            print("⚠️ No entities found in root level — check API key permissions.")
            return

        rows = []
        for ent in entities:
            uri = ent.get("id")
            title = ent.get("title", {}).get("@value", "Unknown Disease")
            slug = title.lower().replace(" ", "-")
            overview = ent.get("definition", {}).get("@value", "")
            rows.append((uri, title, slug, overview, "N/A", "N/A", "N/A", "WHO ICD-11"))
            imported += 1

        execute_batch(cur, """
            INSERT INTO diseases (icd, name, slug, overview, symptoms_common, labs_key, red_flags, "references")
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (icd) DO NOTHING;
        """, rows)

        conn.commit()
        print(f"✅ Successfully imported {imported} diseases from WHO.")
    except Exception as e:
        print(f"❌ Import failed: {e}")
    finally:
        cur.close()
        conn.close()
        print("🏁 Import process completed.")
