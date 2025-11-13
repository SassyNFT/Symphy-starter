# database.py
# FIXED: safe init, correct schema, no UNIQUE slug, uses public schema

import os
import psycopg2

def init_database():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("❌ DATABASE_URL not set")

    print("🔗 Connecting to database...")

    conn = psycopg2.connect(database_url, options="-c search_path=public")
    cur = conn.cursor()

    print("🛠️ Creating 'diseases' table if not exists...")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS diseases (
            id SERIAL PRIMARY KEY,
            icd TEXT UNIQUE,
            name TEXT,
            slug TEXT,
            overview TEXT,
            symptoms_common TEXT,
            labs_key TEXT,
            red_flags TEXT,
            "references" TEXT
        );
    """)

    conn.commit()
    cur.close()
    conn.close()

    print("✅ Database initialized (public.diseases)")

if __name__ == "__main__":
    init_database()
