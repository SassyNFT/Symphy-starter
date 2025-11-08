# backend/auto_import_icd11.py
import os
import psycopg2
import requests
from psycopg2.extras import execute_batch

def run_auto_import():
    db_url = os.getenv("DATABASE_URL")
    who_key = os.getenv("WHO_API_KEY")

    if not db_url:
        print("❌ DATABASE_URL not set"); return
    if not who_key:
        print("❌ WHO_API_KEY not set"); return

    # Mask DB URL for logs (show first 20 chars + last 10)
    masked_db = db_url[:20] + "..." + db_url[-10:] if db_url else "None"
    print(f"🔌 DB URL (masked): {masked_db}")

    print("🌍 Connecting to WHO ICD-11 API...")
    headers = {
        "Authorization": f"Bearer {who_key}",
        "Accept": "application/json",
        "Accept-Language": "en",
        "API-Version": "v2"
    }

    # Fetch root entity
    url = "https://id.who.int/icd/entity"
    r = requests.get(url, headers=headers, timeout=20)
    print("WHO root status:", r.status_code)

    if r.status_code != 200:
        print("❌ WHO API error:", r.text[:300]); return

    data = r.json()
    children_uris = data.get("child", [])
    print("Root children found:", len(children_uris))

    if not children_uris:
        print("⚠️ No children. Key/permissions may be wrong."); return

    # Fetch details for first 20 children
    entities = []
    for uri in children_uris[:20]:
        r_child = requests.get(uri, headers=headers, timeout=20)
        if r_child.status_code == 200:
            e_data = r_child.json()
            entities.append(e_data)
        else:
            print(f"⚠️ Failed to fetch {uri}: {r_child.status_code}")

    print("Entities fetched:", len(entities))

    rows = []
    for e in entities:
        icd = e.get("@id", "").split('/')[-1]  # Entity ID number
        name = e.get("title", {}).get("@value", "Unknown")
        slug = name.lower().replace(" ", "-") if name else "unknown"
        overview = e.get("definition", {}).get("@value", "") if e.get("definition") else ""
        rows.append((icd, name, slug, overview, "N/A", "N/A", "N/A", "WHO"))

    print("Preparing to insert:", len(rows))
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    try:
        execute_batch(cur, """
            INSERT INTO diseases (icd, name, slug, overview, symptoms_common, labs_key, red_flags, "references")
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (icd) DO NOTHING;
        """, rows)
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM diseases;")
        count = cur.fetchone()[0]
        print("📊 Diseases in DB now:", count)
    except Exception as e:
        print("❌ Insert failed:", e)
    finally:
        cur.close()
        conn.close()
        print("🏁 Import done.")

if __name__ == "__main__":
    run_auto_import()
