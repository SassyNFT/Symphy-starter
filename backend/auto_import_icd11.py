# backend/auto_import_icd11.py
# Purpose: Traverse ICD-11 Foundation via WHO API and insert into PostgreSQL

import os
import time
import requests
from sqlalchemy import create_engine, text

# ---- WHO API endpoints ----
# WHO ICD-11 constants (Nov 2025)
WHO_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"
WHO_API_VERSION = "v2"
WHO_FOUNDATION_ROOT = "https://id.who.int/icd/release/11/foundation"
WHO_ENTITY_BASE = "https://id.who.int/icd/entity"

# ---- HTTP helpers ----
def _headers(token: str) -> dict:
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
        raise RuntimeError("❌ Missing WHO_CLIENT_ID or WHO_CLIENT_SECRET in environment")
    data = {"grant_type": "client_credentials", "scope": "icdapi_access"}
    print("🔑 Requesting WHO API token...")
    r = requests.post(WHO_TOKEN_URL, data=data, auth=(client_id, client_secret))
    if r.status_code != 200:
        raise RuntimeError(f"❌ Token request failed: {r.status_code} {r.text}")
    print("✅ WHO API token received.")
    return r.json()["access_token"]

def normalize_entity_id(child_entry) -> str | None:
    """
    The API returns child entries either as URIs (strings) or objects.
    This returns the trailing numeric ID as a string.
    """
    if isinstance(child_entry, str):
        # e.g., "http://id.who.int/icd/entity/1405434703"
        return child_entry.rstrip("/").split("/")[-1]
    if isinstance(child_entry, dict):
        uri = child_entry.get("@id") or child_entry.get("id")
        if uri:
            return uri.rstrip("/").split("/")[-1]
    return None

def get_entity(entity_id: str, token: str) -> dict | None:
    url = f"{WHO_ENTITY_BASE}/{entity_id}"
    r = requests.get(url, headers=_headers(token))
    print(f"Requesting: {r.url}")
    if r.status_code == 200:
        return r.json()
    # It’s common for a few IDs to be non-browseable in some releases
    print(f"⚠️ Could not GET entity {entity_id}: {r.status_code} {r.text[:200]}")
    return None

def traverse_children(entity_id: str, token: str, depth: int, max_depth: int) -> list[dict]:
    """
    Recursively fetch entity -> child list -> recurse.
    We don't use '/children' endpoint; we read 'child' from the entity itself.
    """
    if depth > max_depth:
        return []

    ent = get_entity(entity_id, token)
    if not ent:
        return []

    out = []
    title = (ent.get("title") or {}).get("@value") or ent.get("title", "Unknown")
    out.append({"icd": entity_id, "name": title})

    children = ent.get("child", []) or []
    for child in children:
        cid = normalize_entity_id(child)
        if not cid:
            continue
        # brief backoff to be gentle with the API
        time.sleep(0.15)
        out.extend(traverse_children(cid, token, depth + 1, max_depth))
    return out

def run_auto_import():
    print("🔗 Connecting to database...")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("❌ DATABASE_URL missing")

    engine = create_engine(db_url)

    # Recreate table
    with engine.begin() as conn:
        conn.execute(text("""
            DROP TABLE IF EXISTS diseases;
            CREATE TABLE diseases (
                id SERIAL PRIMARY KEY,
                icd TEXT,
                name TEXT,
                overview TEXT,
                symptoms_common TEXT,
                labs_key TEXT,
                red_flags TEXT,
                "references" TEXT
            );
        """))
    print("✅ Table 'diseases' ready.")

    token = get_token()

    # 1) Get Foundation root and its top-level 'child' list
    print("🌍 Fetching ICD-11 Foundation root...")
    r = requests.get(WHO_FOUNDATION_ROOT, headers=_headers(token))
    if r.status_code != 200:
        raise RuntimeError(f"❌ Failed to fetch Foundation root: {r.status_code} {r.text[:200]}")

    root = r.json()
    roots = root.get("child", []) or []
    print(f"✅ Found {len(roots)} top-level entities")

    # 2) Walk N levels down from each top-level entity
    all_items: list[dict] = []
    MAX_DEPTH = int(os.getenv("ICD_DEPTH", "2"))  # allow override

    for entry in roots:
        rid = normalize_entity_id(entry)
        if not rid:
            continue
        # small delay between top-level traversals
        time.sleep(0.2)
        all_items.extend(traverse_children(rid, token, depth=0, max_depth=MAX_DEPTH))

    print(f"📦 Total ICD entities collected: {len(all_items)}")

    # 3) Insert
    with engine.begin() as conn:
        for e in all_items:
            conn.execute(
                text("""
                    INSERT INTO diseases (icd, name, overview)
                    VALUES (:icd, :name, 'Imported from WHO ICD-11 (Foundation)');
                """),
                {"icd": e["icd"], "name": e["name"]},
            )

    print("✅ Full ICD-11 import complete.")

if __name__ == "__main__":
    print("🚀 auto_import_icd11.py started...")
    run_auto_import()
