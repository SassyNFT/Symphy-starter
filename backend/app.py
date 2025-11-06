from flask import Flask, jsonify
import os
import psycopg2
import json

app = Flask(__name__)

def connect():
    db_url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_INTERNAL")
    if not db_url:
        raise RuntimeError("DATABASE_URL / DATABASE_URL_INTERNAL is not set")
    return psycopg2.connect(db_url, sslmode="require")

@app.route("/")
def home():
    return jsonify({"message": "✅ Symphy API is live!"})

@app.route("/diseases", methods=["GET"])
def get_diseases():
    try:
        conn = connect()
        cur = conn.cursor()
        cur.execute("SELECT icd, name, slug, overview, symptoms_common, labs_key, red_flags FROM diseases LIMIT 50;")
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        data = [dict(zip(columns, row)) for row in rows]
        cur.close()
        conn.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
