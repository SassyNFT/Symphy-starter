import os
import psycopg2

def init_database():
    """Initialize or reset the database schema for ICD-11 import."""
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("❌ DATABASE_URL environment variable not set")

    print("🔗 Connecting to database...")
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    print("🧹 Dropping and recreating 'diseases' table...")
    cur.execute("""
        DROP TABLE IF EXISTS diseases;
        CREATE TABLE diseases (
            id SERIAL PRIMARY KEY,
            icd TEXT UNIQUE,
            name TEXT,
            slug TEXT,
            overview TEXT,
            category TEXT,
            data JSONB
        );
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Database initialization complete — table 'diseases' ready for ICD-11 import.")

if __name__ == "__main__":
    init_database()
