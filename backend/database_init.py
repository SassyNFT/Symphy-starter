import os
import json
import psycopg2

# === Database Connection ===
def connect():
    db_url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_INTERNAL")
    if not db_url:
        raise RuntimeError("DATABASE_URL / DATABASE_URL_INTERNAL is not set")
    return psycopg2.connect(db_url, sslmode="require")

# === Ensure Table Exists ===
def ensure_table(cur):
    cur.execute("""
    CREATE TABLE IF NOT EXISTS diseases (
        id SERIAL PRIMARY KEY,
        code TEXT,
        name TEXT,
        category TEXT,
        description TEXT,
        references_data JSONB,
        symptoms JSONB
    );
    """)
    print("✅ Table created or already exists.")

# === Load ICD Data (local fallback) ===
def load_icd_data():
    local_path = "backend/data/icd10_min.json"
    if os.path.exists(local_path):
        print(f"📄 Loading local ICD dataset from: {local_path}")
        with open(local_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"📦 Loaded {len(data)} ICD records from local dataset.")
        return data
    else:
        print("⚠️ Local ICD dataset not found.")
        return []

# === Insert Data ===
def insert_data(cur, data):
    if not data:
        print("⚠️ No ICD data to insert.")
        return

    inserted = 0
    for entry in data:
        try:
            cur.execute("""
                INSERT INTO diseases (code, name, category, description, references_data, symptoms)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (code) DO NOTHING;
            """, (
                entry.get("code"),
                entry.get("name"),
                entry.get("category"),
                entry.get("description"),
                json.dumps(entry.get("references", {})),
                json.dumps(entry.get("symptoms", []))
            ))
            inserted += 1
        except Exception as e:
            print(f"⚠️ Skipping record {entry.get('code')}: {e}")

    print(f"✅ Inserted or verified {inserted} ICD records.")

# === Main Routine ===
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
