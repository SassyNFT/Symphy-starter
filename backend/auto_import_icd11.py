# backend/auto_import_icd11.py
# Purpose: Fetch ICD-11 data and insert into the "public.diseases" table

import os
import time
import requests
from sqlalchemy import create_engine, text
import certifi
import urllib3

# Optional slug helper
try:
    from slugify import slugify
except ImportError:
    slugify = lambda x: ""

# Disable warnings for WHO API SSL (trusted)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Ensure SSL paths are correct
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# WHO ICD-11 API constants
WHO_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"
WHO_ENTITY_BASE = "https://id.who.int/icd/entity"
WHO_FOUNDATION_ROOT = "https://id.who.int/icd/release/11/mms"  # Multi-version root


# --------------------------------------------------------------------
# AUTH HELPERS
# --------------------------------------------------------------------

def _headers(token: str):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Accept-Language": "en",
        "API-Version": "v2"
    }


def get_token() -> str:
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
        raise RuntimeError(f"❌ WHO token failed: {resp.status_code} {resp.text}")

    print("✅ WHO token OK")
    return resp.json()["access_token"]


# --------------------------------------------------------------------
# ICD ENTITY HELPERS
# --------------------------------------------------------------------

def normalize_entity_id(entity) -> str | None:
    if isinstance(entity, str):
        return entity.rstrip("/").split("/")[-1]
    if isinstance(entity, dict):
        uri = entity.get("@id") or entity.get("id")
        if uri:
            return uri.rstrip("/").split("/")[-1]
    return None


def get_entity(entity_id: str, token: str) -> dict | None:
    url = f"{WHO_ENTITY_BASE}/{entity_id}"
    r = requests.get(url, headers=_headers(token), verify=False)

    if r.status_code == 200:
        return r.json()

    print(f"⚠️ Could not fetch {entity_id}: {r.status_code}")
    return None


def traverse_children(entity_id: str, token: str, depth: int, max_depth: int):
    if depth > max_depth:
        return []

    ent = get_entity(entity_id, token)
    if not ent:
        return []

    title = (ent.get("title") or {}).get("@value") or ent.get("title", "Unknown")
    definition = (ent.get("definition") or {}).get("@value") or ""

    slug = slugify(title)

    collected = [{
        "icd": entity_id,
        "name": title,
        "slug": slug,
        "overview": definition
    }]

    for child in ent.get("child", []) or []:
        cid = normalize_entity_id(child)
        if not cid:
            continue

        time.sleep(0.12)  # Avoid hitting WHO too fast
        collected.extend(traverse_children(cid, token, depth + 1, max_depth))

    return collected


# --------------------------------------------------------------------
# MAIN AUTO IMPORT FUNCTION
# --------------------------------------------------------------------

def run_auto_import():
    print("🔗 Connecting to DB...")

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("❌ DATABASE_URL missing")

    # Force public schema for worker
    engine = create_engine(
        db_url,
        connect_args={"options": "-c search_path=public"}
    )

    print(f"🧠 Using DB: {db_url[:25]}...{db_url[-10:]}")

    # ----------------------------------------------------------------
    # RESET TABLE
    # ----------------------------------------------------------------
    print("🧹 Resetting diseases table...")

    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS diseases;"))

        conn.execute(text("""
            CREATE TABLE diseases (
                id SERIAL PRIMARY KEY,
                icd TEXT UNIQUE,
                name TEXT,
                slug TEXT,               -- ❗ FIXED: no UNIQUE constraint
                overview TEXT,
                symptoms_common TEXT,
                labs_key TEXT,
                red_flags TEXT,
                "references" TEXT
            );
        """))

    print("✅ Table recreated clean.")

    # ----------------------------------------------------------------
    # FETCH TOKEN + ROOT
    # ----------------------------------------------------------------

    token = get_token()

    print("🌍 Fetching MMS multi-version root...")
    r0 = requests.get(WHO_FOUNDATION_ROOT, headers=_headers(token), verify=False)
    if r0.status_code != 200:
        raise RuntimeError(f"❌ MMS root fetch failed: {r0.status_code}")

    multi = r0.json()
    latest_url = multi.get("latestVersion") or multi.get("latestRelease")

    if not latest_url:
        raise RuntimeError("❌ No latest version found")

    print(f"📌 Latest ICD version: {latest_url}")

    r1 = requests.get(latest_url, headers=_headers(token), verify=False)
    if r1.status_code != 200:
        raise RuntimeError("❌ Failed to fetch version root")

    version_root = r1.json()
    roots = version_root.get("child", []) or []

    print(f"📁 Top-level entities: {len(roots)}")

    # ----------------------------------------------------------------
    # RECURSIVE DOWNLOAD
    # ----------------------------------------------------------------

    MAX_DEPTH = int(os.getenv("ICD_DEPTH", "2"))
    all_items = []

    for entry in roots:
        rid = normalize_entity_id(entry)
        if not rid:
            continue

        time.sleep(0.15)
        all_items.extend(traverse_children(rid, token, 0, MAX_DEPTH))

    print(f"📦 Total collected ICD items: {len(all_items)}")

    # ----------------------------------------------------------------
    # BULK INSERT
    # ----------------------------------------------------------------

    if all_items:
        batch_size = 400

        with engine.connect() as conn:
            for i in range(0, len(all_items), batch_size):
                batch = all_items[i:i + batch_size]

                try:
                    conn.execute(
                        text("""
                            INSERT INTO diseases
                            (icd, name, slug, overview, symptoms_common, labs_key, red_flags, "references")
                            VALUES (:icd, :name, :slug, :overview, NULL, NULL, NULL, 'Imported from WHO ICD-11')
                            ON CONFLICT (icd) DO UPDATE SET
                                name = EXCLUDED.name,
                                slug = EXCLUDED.slug,
                                overview = EXCLUDED.overview;
                        """),
                        batch
                    )
                    conn.commit()

                    print(f"✅ Inserted batch {i//batch_size+1}")

                except Exception as e:
                    print(f"⚠️ Batch failed: {e}")
                    conn.rollback()

            # Final count
            final_count = conn.execute(text("SELECT COUNT(*) FROM diseases")).scalar()
            print(f"🎉 Final row count: {final_count}")

    print("🎯 ICD-11 import finished successfully.")


if __name__ == "__main__":
    print("🚀 auto_import_icd11.py running...")
    run_auto_import()
