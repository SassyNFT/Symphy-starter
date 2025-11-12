# database.py
# Purpose: Safely initialize database schema for ICD-11 import (non-destructive)

import os
import psycopg2

def init_database():
    """Safely initialize the database schema for ICD-11 import without dropping data."""
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("❌ DATABASE_URL environment variable not set")

    print("🔗 Connecting to database...")
    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        # Create table if not exists (non-destructive)
        print("🛠️ Creating 'diseases' table if not exists...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS diseases (
                id SERIAL PRIMARY KEY,
                icd TEXT UNIQUE,
                name TEXT,
                slug TEXT UNIQUE,
                overview TEXT,
                symptoms_common TEXT,
                labs_key TEXT,
                red_flags TEXT,
                "references" TEXT
            );
        """)

        # Optionally add missing columns (safe ALTER)
        # Example: If adding a new column later, uncomment and adapt
        # cur.execute("ALTER TABLE diseases ADD COLUMN IF NOT EXISTS new_column TEXT;")

        conn.commit()
        print("✅ Database initialization complete — table 'diseases' ready (data preserved).")

    except Exception as e:
        print(f"❌ Database init failed: {str(e)}")
        raise
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    init_database()
