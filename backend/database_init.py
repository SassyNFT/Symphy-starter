import os
import json
import psycopg2

def connect():
    db_url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_INTERNAL")
    if not db_url:
        raise RuntimeError("DATABASE_URL / DATABASE_URL_INTERNAL is not set")
    return psycopg2.connect(db_url, sslmode="require")

def ensure_table(cur):
    cur.execute("""
    CREATE TABLE IF NOT EXISTS diseases (
        id SERIAL PRIMARY KEY,
        icd TEXT,
        name TEXT,
        slug TEXT,
        overview TEXT,
        category TEXT,
        references_data JSONB,
        symptoms_common JSONB,
        labs_key JSONB,
        red_flags JSONB
    );
    """)
    print("✅ Table created or already exists.")

def load_icd_data():
    local_path = os.path.join(os.path.dirname(__file__), "data", "icd10_min.json")
    if os.path.exists(local_path):
        print(f"📄 Loading local ICD dataset from: {local_path}")
        with open(local_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"📦 Loaded {len(data)} ICD records from local dataset.")
        return data
    else:
        print("⚠️ Local ICD dataset not found.")
        return []

def insert_data(cur, data):
    if not data:
        print("⚠️ No ICD data to insert.")
        return

    inserted = 0
    for entry in data:
        try:
            cur.execute("""
                INSERT INTO diseases (
                    icd, name, slug, overview, category, 
                    references_data, symptoms_common, labs_key, red_flags
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (icd) DO NOTHING;
            """, (
                entry.get("icd"),
                entry.get("name"),
                entry.get("slug"),
                entry.get("overview"),
                entry.get("category"),
                json.dumps(entry.get("references", {})),
                json.dumps(entry.get("symptoms_common", [])),
                json.dumps(entry.get("labs_key", [])),
                json.dumps(entry.get("red_flags", []))
            ))
            inserted += 1
        except Exception as e:
            print(f"⚠️ Skipping record {entry.get('icd')}: {e}")

    print(f"✅ Inserted or verified {inserted} ICD records.")

def main():
    try:
        conn = connect()
        cur = conn.cursor()
        print("✅ Connected to database.")

        ensure_table(cur)
        data = load_icd_data()
        insert_data(cur, data)

        conn.commit()
        cur.close()
        conn.close()
        print("🎉 Database initialization complete.")

    except Exception as e:
        print(f"❌ Error: {e}")
        raise

if __name__ == "__main__":
    main()
