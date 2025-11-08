import os
import psycopg2
import requests
from psycopg2.extras import execute_batch

def run_auto_import():
    db_url = os.getenv("DATABASE_URL")
    who_key = os.getenv("WHO_API_KEY")

    if not db_url:
        print("❌ DATABASE_URL not set")
        return
    if not who_key:
        print("❌ WHO_API_KEY not set")
        return

    print("🌍 Connecting to ICD-11 API with WHO key...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    headers = {
        "Authorization": f"Bearer {who_key}",
        "Accept": "application/json"
    }

    # Try a simple public call that always returns data
    url = "https://id.who.int/icd/entity"
    print(f"🔗 Fetching from: {url}")
    r = requests.get(url, headers=headers, timeout=20)
    print(f"Status code: {r.status_code}")

    if r.status_code != 200:
        print(f"❌ WHO API error: {r.text[:200]}")
        return

    data = r.json()
    entities = data.get("entity", [])
    print(f"✅ Found {len(entities)} ICD entities")

    if not entities:
        print("⚠️ No entities returned — check WHO key permissions")
        return

    rows = []
    for e in entities[:20]:  # just 20 for testing
        icd = e.get("id", "")
        name = e.get("title", {}).get("@value", "Unknown")
        slug = name.lower().replace(" ", "-")
        overview = e.get("definition", {}).get("@value", "")
        rows.append((icd, name, slug, overview, "N/A", "N/A", "N/A", "WHO"))

    print(f"💾 Attempting to insert {len(rows)} rows...")
    try:
        execute_batch(cur, """
            INSERT INTO diseases (icd, name, slug, overview, symptoms_common, labs_key, red_flags, "references")
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (icd) DO NOTHING;
        """, rows)
        conn.commit()
        print("✅ Insert complete, verifying count...")

        cur.execute("SELECT COUNT(*) FROM diseases;")
        count = cur.fetchone()[0]
        print(f"📊 Diseases in DB now: {count}")

    except Exception as e:
        print(f"❌ Database insert failed: {e}")
    finally:
        cur.close()
        conn.close()
        print("🏁 Import done.")
