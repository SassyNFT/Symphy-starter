# backend/auto_import_icd11.py
# Purpose: Fetch full ICD-11 hierarchy from WHO API and insert into PostgreSQL

import os
import time
import requests
from sqlalchemy import create_engine, text

# WHO API endpoints
WHO_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"
WHO_API_BASE = "https://id.who.int/icd/entity"
WHO_API_VERSION = "v2"  # required header per WHO ICD-11 API

def get_token():
    """Get a temporary access token from WHO using your environment credentials."""
    client_id = os.getenv("WHO_CLIENT_ID")
    client_secret = os.getenv("WHO_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise RuntimeError("❌ Missing WHO_CLIENT_ID or WHO_CLIENT_SECRET in environment")

    data = {
        "grant_type": "client_credentials",
        "scope": "icdapi_access"
    }

    print("🔑 Requesting WHO API token...")
    r = requests.post(WHO_TOKEN_URL, data=data, auth=(client_id, client_secret))
    if r.status_code != 200:
        raise RuntimeError(f"❌ Token request failed: {r.status_code} {r.text}")

    token = r.json().get("access_token")
    print("✅ WHO API token received.")
    return token


def fetch_icd_children(entity_id, token, depth=0, max_depth=2):
    """Recursively fetch ICD-11 child entities."""
    headers = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/json",
    "Accept-Language": "en",
    "API-Version": "v2"
}
    url = f"{WHO_API_BASE}/{entity_id}/children"
    r = requests.get(url, headers=headers)

    if r.status_code != 200:
        print(f"⚠️ Could not fetch {entity_id}: {r.status_code} {r.text}")
        return []

    data = r.json()
    entities = []

    for child in data.get("destinationEntities", []):
        icd_id = child.get("@id", "").split("/")[-1]
        title = child.get("title", {}).get("@value", "Unknown name")
        entities.append({"icd": icd_id, "name": title})

        # Recursively go deeper (but limited)
        if depth < max_depth:
            time.sleep(0.3)
            entities.extend(fetch_icd_children(icd_id, token, depth + 1, max_depth))

    return entities


def run_auto_import():
    print("🔗 Connecting to database...")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("❌ DATABASE_URL missing")

    engine = create_engine(db_url)

    # Create or reset table
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

    # Get token and fetch root data
    token = get_token()
    headers = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/json",
    "Accept-Language": "en",
    "API-Version": "v2"
}

    print("🌍 Fetching ICD-11 root entities...")
    r = requests.get(WHO_API_BASE, headers=headers)
    if r.status_code != 200:
        raise RuntimeError(f"❌ Failed to fetch root: {r.status_code} {r.text}")

    root_entities = r.json().get("child", [])
    print(f"✅ Found {len(root_entities)} top-level categories")

    all_items = []
    for root in root_entities:
        icd_id = root.get("@id", "").split("/")[-1]
        name = root.get("title", {}).get("@value", "Unknown")
        all_items.append({"icd": icd_id, "name": name})
        all_items.extend(fetch_icd_children(icd_id, token, max_depth=2))

    print(f"📦 Total ICD entities fetched: {len(all_items)}")

    # Insert into DB
    with engine.begin() as conn:
        for e in all_items:
            conn.execute(
                text("""
                    INSERT INTO diseases (icd, name, overview)
                    VALUES (:icd, :name, 'Imported from WHO ICD-11 API');
                """),
                {"icd": e["icd"], "name": e["name"]}
            )

    print("✅ Full ICD-11 import complete.")

if __name__ == "__main__":
    print("🚀 auto_import_icd11.py started...")
    run_auto_import()
