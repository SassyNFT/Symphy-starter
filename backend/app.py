# --- ICD-11 Auto Import Section ---
import os
import threading

def start_icd_import():
    try:
        try:
            from auto_import_icd11 import run_auto_import
            print("📦 auto_import_icd11 module found, preparing to run...")
        except ModuleNotFoundError:
            print("❌ auto_import_icd11.py not found — please add it to /backend/")
            return

        print("🚀 Starting ICD-11 import thread...")
        run_auto_import()
        print("✅ ICD-11 import executed successfully.")
    except Exception as e:
        print(f"⚠️ ICD-11 import skipped or failed: {e}")

# Only run importer if flag is enabled
if os.getenv("RUN_AUTO_IMPORT", "true").lower() == "true":
    threading.Thread(target=start_icd_import, daemon=True).start()
# --- End ICD-11 Auto Import Section ---

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


@app.before_first_request
def trigger_icd_import():
    if os.getenv("RUN_AUTO_IMPORT", "true").lower() == "true":
        threading.Thread(target=start_icd_import, daemon=True).start()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
