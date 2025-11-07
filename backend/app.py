# --- Auto-import ICD-11 data on startup ---
import os

if os.getenv("RUN_AUTO_IMPORT", "true").lower() == "true":
    try:
        from auto_import_icd11 import run_auto_import
        run_auto_import()
        print("✅ ICD-11 import executed successfully.")
    except Exception as e:
        print(f"⚠️ ICD-11 import skipped or failed: {e}")
# --- End auto-import section ---

from flask import Flask, jsonify
import psycopg2
import os

app = Flask(__name__)

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

@app.route('/')
def home():
    return jsonify({"message": "✅ Symphy API is live!"})

@app.route('/diseases', methods=['GET'])
def get_diseases():
    """Fetch all diseases from the database"""
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT icd, name, slug, overview, symptoms_common, labs_key, red_flags, references
            FROM diseases
        """)
        rows = cur.fetchall()

        # Convert to JSON
        diseases = []
        for row in rows:
            diseases.append({
                "icd": row[0],
                "name": row[1],
                "slug": row[2],
                "overview": row[3],
                "symptoms_common": row[4],
                "labs_key": row[5],
                "red_flags": row[6],
                "references": row[7]
            })

        return jsonify(diseases)

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
