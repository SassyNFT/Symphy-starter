# backend/auto_import_icd11.py
# Purpose: Safe ICD-11 import without deleting table on each worker restart

import os
import time
import requests
import certifi
import urllib3
from sqlalchemy import create_engine, text

# Disable SSL warnings (WHO API uses custom cert chain)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Ensure SSL paths
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# WHO ICD-11 constants
WHO_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"
WHO_ENTITY_BASE = "https://id.who.int/icd/entity"
WHO_FOUNDATION_ROOT = "https://id.who.int/icd/release/11/mms"


# --------------------------------------------------------------------------
# AUTH HELPERS
# --------------------------------------------------------------------------

def _headers(token: str):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Accept-Language": "en",
        "API-Version": "v2"
    }


def get_token():
    client_id = os.getenv("WHO_CLIENT_ID")
    client_secret = os.getenv("WHO_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise RuntimeError("❌ Missing WHO_CLIENT_ID or WHO_CLIENT_SECRET")

    print("🔑 Requesting WHO API token...")

    resp = requests.post(
        WHO_TOKEN_URL,
        data={"grant_type": "client_credentials", "scope": "icdapi_access"},
        auth=(client_id, client_secret),
        verify=False
    )

    if resp.status_code != 200:
        raise RuntimeError(f"❌ WHO token error: {resp.status_code} {resp.text}")

    print("✅ WHO token OK")
    return resp.json()["access_token"]


# --------------------------------------------------------------------------
# ENTITY HELPERS
# --------------------------------------------------------------------------

def normalize_entity_id(entity):
    if isinstance(entity, str):
        return entity.rstrip("/").split("/")[-1]
    if isinstance(entity, dict):
        uri = entity.get("@id") or entity.get("id")
        if uri:
            return uri.rstrip("/").split("/")[-1]
    return None


def get_entity(entity_id, token):
    url = f"{WHO_ENTITY_BASE}/{entity_id}"
    r = requests.get(url, headers=_headers(token), verify=False)

    if r.status_code == 200:
        return r.json()

    print(f"⚠️ Failed entity {entity_id}: {r.status_code}")
    return None


def traverse_children(entity_id, token, depth, max_depth):
    if depth > max_depth:
        return []

    ent = get_entity(entity_id, token)
    if not ent:
        return []

    title = (ent.get("title") or {}).get("@value") or ent.get("title", "Unknown")
    definition = (ent.get("definition") or {}).get("@value") or ""

    collected = [{
        "icd": entity_id,
        "name": title,
        "overview": definition
    }]

    for child in ent.get("child", []) or []:
        cid = normalize_entity_id(child)
        if not cid:
            continue
        time.sleep(0.12)
        collected.extend(traverse_children(cid, token, depth + 1, max_depth))

    return collected


# --------------------------------------------------------------------------
# IMPORT PIPELINE
# --------------------------------------------------------------------------

def run_auto_import():
    print("🔗 Connecting to database...")

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("❌ DATABASE_URL missing")

    # Force public schema (this is safe)
    engine = create_engine(
        db_url,
        connect_args={"options": "-c search_path=public"}
    )

    print(f"🧠 Using DB: {db_url[:25]}...{db_url[-10:]}")

    # ----------------------------------------------------------------------
    # SAFE TABLE HANDLING — never drop
    # ----------------------------------------------------------------------
    print("🧪 Checking if diseases table exists...")

    with engine.begin() as conn:
        exists = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema='public'
                AND table_name='diseases'
            )
        """)).scalar()

        if not exists:
            print("📘 Table not found — creating...")
            conn.execute(text("""
                CREATE TABLE diseases (
                    id SERIAL PRIMARY KEY,
                    icd TEXT UNIQUE,
                    name TEXT,
                    name TEXT,
                    overview TEXT,
                    symptoms_common TEXT,
                    labs_key TEXT,
                    red_flags TEXT,
                    "references" TEXT
                );
            """))
            print("✅ Table created.")
        else:
            print("📗 Table exists — preserving data (no DROP).")

    # ----------------------------------------------------------------------
    # GET WHO TOKEN
    # ----------------------------------------------------------------------
    token = get_token()

    print("🌍 Fetching ICD-11 MMS root...")
    root_resp = requests.get(WHO_FOUNDATION_ROOT, headers=_headers(token), verify=False)

    if root_resp.status_code != 200:
        raise RuntimeError("❌ Failed to fetch MMS root")

    multi = root_resp.json()
    latest_url = multi.get("latestVersion") or multi.get("latestRelease")

    if not latest_url:
        raise RuntimeError("❌ No latest release found")

    print(f"📌 Using ICD version: {latest_url}")

    version_resp = requests.get(latest_url, headers=_headers(token), verify=False)
    version_root = version_resp.json()

    roots = version_root.get("child", []) or []
    print(f"📁 Top-level sections: {len(roots)}")

    # ----------------------------------------------------------------------
    # RECURSIVE DOWNLOAD
    # ----------------------------------------------------------------------
    MAX_DEPTH = int(os.getenv("ICD_DEPTH", "2"))
    all_items = []

    for entry in roots:
        rid = normalize_entity_id(entry)
        if not rid:
            continue
        time.sleep(0.15)
        all_items.extend(traverse_children(rid, token, 0, MAX_DEPTH))

    print(f"📦 Total collected: {len(all_items)}")

    # ----------------------------------------------------------------------
    # BULK INSERT / UPSERT (NO SLUG = NO UNIQUE VIOLATION)
    # ----------------------------------------------------------------------
    if all_items:
        batch_size = 500

        with engine.connect() as conn:
            for i in range(0, len(all_items), batch_size):
                batch = all_items[i:i + batch_size]

                try:
                    conn.execute(
                        text("""
                            INSERT INTO diseases
                            (icd, name, overview, symptoms_common, labs_key, red_flags, "references")
                            VALUES (:icd, :name, :overview, NULL, NULL, NULL, 'Imported from WHO ICD-11')
                            ON CONFLICT (icd) DO UPDATE SET
                                name = EXCLUDED.name,
                                overview = EXCLUDED.overview;
                        """),
                        batch
                    )
                    conn.commit()
                    print(f"✅ Batch {i//batch_size + 1} committed ({len(batch)} rows)")

                except Exception as e:
                    print(f"⚠️ Batch failed: {e}")
                    conn.rollback()

            final = conn.execute(text("SELECT COUNT(*) FROM diseases")).scalar()
            print(f"🎉 Final total rows in DB: {final}")

    print("🎯 ICD-11 import COMPLETED successfully.")


if __name__ == "__main__":
    print("🚀 Worker started — running auto import")
    run_auto_import()
