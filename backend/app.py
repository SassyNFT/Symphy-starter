# --- ICD-11 Auto Import Section ---
import os
import threading
import psycopg2
from flask import Flask, jsonify, request

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

app = Flask(__name__)

# --- Database Connection ---
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

def get_db_connection():
    """Create and return a PostgreSQL connection."""
    return psycopg2.connect(DATABASE_URL)

# --- Root Endpoint ---
@app.route('/')
def home():
    return jsonify({"status": "Symphy API running successfully"})

# --- Get All Diseases ---
@app.route('/diseases', methods=['GET'])
def get_diseases():
    """Fetch up to 100 diseases from the database."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT icd, name, slug, overview, symptoms_common, labs_key, red_flags, references
            FROM diseases
            LIMIT 100
        """)
        rows = cur.fetchall()
        diseases = [
            {
                "icd": row[0],
                "name": row[1],
                "slug": row[2],
                "overview": row[3],
                "symptoms_common": row[4],
                "labs_key": row[5],
                "red_flags": row[6],
                "references": row[7],
            }
            for row in rows
        ]
        return jsonify({"count": len(diseases), "data": diseases})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

# --- Search Diseases by Keyword ---
@app.route('/search', methods=['GET'])
def search_diseases():
    """Search diseases by name or keyword."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Missing search query parameter ?q="}), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT icd, name, slug, overview, symptoms_common, labs_key, red_flags, references
            FROM diseases
            WHERE name ILIKE %s
            LIMIT 25
        """, (f"%{query}%",))
        rows = cur.fetchall()
        results = [
            {
                "icd": row[0],
                "name": row[1],
                "slug": row[2],
                "overview": row[3],
                "symptoms_common": row[4],
                "labs_key": row[5],
                "red_flags": row[6],
                "references": row[7],
            }
            for row in rows
        ]
        return jsonify({"count": len(results), "data": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

# --- Trigger ICD Import on Startup ---
@app.before_first_request
def trigger_icd_import():
    if os.getenv("RUN_AUTO_IMPORT", "true").lower() == "true":
        threading.Thread(target=start_icd_import, daemon=True).start()

# --- Main Entrypoint ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
