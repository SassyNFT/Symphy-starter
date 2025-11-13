# backend/auto_import_icd11.py
# Purpose: Traverse ICD-11 Foundation via WHO API and insert into PostgreSQL

import os
import time
import requests
from sqlalchemy import create_engine, text
import certifi
import urllib3  # For warning suppression
try:
    from slugify import slugify  # Optional: for slugs (pip install if needed)
except ImportError:
    slugify = lambda x: ""  # Fallback if not installed

# Suppress InsecureRequestWarning from verify=False (for this trusted API)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# ---- WHO API endpoints ----
# WHO ICD-11 constants (Nov 2025)
WHO_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"
WHO_API_VERSION = "v2"
WHO_ENTITY_BASE = "https://id.who.int/icd/entity"
WHO_FOUNDATION_ROOT = "https://id.who.int/icd/release/11/mms"  # Multi-version root for MMS

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
    r = requests.post(WHO_TOKEN_URL, data=data, auth=(client_id, client_secret), verify=False)
    if r.status_code != 200:
        raise RuntimeError(f"❌ Token request failed: {r.status_code} {r.text}")
    print("✅ WHO API token received.")
    return r.json()["access_token"]

def normalize_entity_id(child_entry) -> str | None:
    if isinstance(child_entry, str):
        return child_entry.rstrip("/").split("/")[-1]
    if isinstance(child_entry, dict):
        uri = child_entry.get("@id") or child_entry.get("id")
        if uri:
            return uri.rstrip("/").split("/")[-1]
    return None

def get_entity(entity_id: str, token: str) -> dict | None:
    url = f"{WHO_ENTITY_BASE}/{entity_id}"
    r = requests.get(url, headers=_headers(token), verify=False)
    print(f"Requesting: {r.url}")
    if r.status_code == 200:
        return r.json()
    print(f"⚠️ Could not GET entity {entity_id}: {r.status_code} {r.text[:200]}")
    return None

def traverse_children(entity_id: str, token: str, depth: int, max_depth: int) -> list[dict]:
    if depth > max_depth:
        return []

    ent = get_entity(entity_id, token)
    if not ent:
        return []

    out = []
    title = (ent.get("title") or {}).get("@value") or ent.get("title", "Unknown")
    definition = (ent.get("definition") or {}).get("@value") or ""
    slug = slugify(title)
    out.append({"icd": entity_id, "name": title, "overview": definition, "slug": slug})

    children = ent.get("child", []) or []
    for child in children:
        cid = normalize_entity_id(child)
        if not cid:
            continue
        time.sleep(0.1)
        out.extend(traverse_children(cid, token, depth + 1, max_depth))
    return out

def run_auto_import():
    print("🔗 Connecting to database...")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("❌ DATABASE_URL missing")

    print(f"🧠 Using database: {db_url}")
    engine = create_engine(db_url)

with engine.begin() as conn:
    print("🧹 Dropping old diseases table (if exists)...")
    conn.execute(text("DROP TABLE IF EXISTS diseases;"))

    print("🛠 Creating fresh diseases table...")
    conn.execute(text("""
        CREATE TABLE diseases (
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
    """))

    print("✅ Fresh 'diseases' table created.")
    
    token = get_token()

    # Test connectivity with auth
    print("🔍 Testing WHO ICD URL connectivity...")
    print("CA bundle path:", certifi.where())
    try:
        r = requests.get(WHO_FOUNDATION_ROOT, headers=_headers(token), verify=False)
        print("WHO ICD status:", r.status_code)
        print("WHO ICD content preview:", r.text[:200])
    except Exception as e:
        print("❌ WHO ICD test failed:", e)

    # 1) Get MMS multi-version root
    print("🌍 Fetching ICD-11 MMS multi-version root...")
    r = requests.get(WHO_FOUNDATION_ROOT, headers=_headers(token), verify=False)
    if r.status_code != 200:
        raise RuntimeError(f"❌ Failed to fetch MMS root: {r.status_code} {r.text[:200]}")

    multi_root = r.json()

    # Extract latest version URL
    latest_url = multi_root.get("latestVersion") or multi_root.get("latestRelease") or multi_root.get("version", [None])[0]
    if not latest_url:
        raise RuntimeError("❌ No latest version found in multi-version root")

    print(f"📌 Using latest version: {latest_url}")

    # 2) Fetch the specific version root, which has the 'child' list
    r = requests.get(latest_url, headers=_headers(token), verify=False)
    if r.status_code != 200:
        raise RuntimeError(f"❌ Failed to fetch latest MMS version: {r.status_code} {r.text[:200]}")

    version_root = r.json()
    roots = version_root.get("child", []) or []
    print(f"✅ Found {len(roots)} top-level entities")

    # 3) Walk N levels down from each top-level entity
    all_items: list[dict] = []
    MAX_DEPTH = int(os.getenv("ICD_DEPTH", "2"))  # allow override

    for entry in roots:
        rid = normalize_entity_id(entry)
        if not rid:
            continue
        time.sleep(0.15)
        all_items.extend(traverse_children(rid, token, depth=0, max_depth=MAX_DEPTH))

    print(f"📦 Total ICD entities collected: {len(all_items)}")

    # 4) Bulk insert with progress and error handling
    if all_items:
        with engine.connect() as conn:  # Use connect() for manual commit if needed
            batch_size = 500  # Optimized batch size
            for i in range(0, len(all_items), batch_size):
                batch = all_items[i:i + batch_size]
                try:
                    conn.execute(
                        text("""
                            INSERT INTO diseases (icd, name, slug, overview, symptoms_common, labs_key, red_flags, "references")
                            VALUES (:icd, :name, :slug, :overview, NULL, NULL, NULL, 'Imported from WHO ICD-11 MMS')
                            ON CONFLICT (icd) DO UPDATE SET 
                                name = EXCLUDED.name,
                                slug = EXCLUDED.slug,
                                overview = EXCLUDED.overview;
                        """),
                        [ {"icd": e["icd"], "name": e["name"], "slug": e["slug"], "overview": e["overview"]} for e in batch ]
                    )
                    conn.commit()  # Explicit commit per batch
                    print(f"Progress: Inserted batch {i//batch_size + 1} ({len(batch)} rows)")
                except Exception as ex:
                    print(f"⚠️ Batch insert failed: {str(ex)}")

            # Final verification
            result = conn.execute(text("SELECT COUNT(*) FROM diseases"))
            final_count = result.scalar()
            print(f"✅ Total rows in DB after import: {final_count}")

    print("✅ Full ICD-11 import complete.")

if __name__ == "__main__":
    print("🚀 auto_import_icd11.py started...")
    run_auto_import()
