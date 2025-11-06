# backend/database_init.py
import os, json, time, requests, psycopg2
from urllib.parse import urlparse

PG_DSN = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URL_INTERNAL")
LOCAL_PATH = os.environ.get("ICD_LOCAL_JSON", os.path.join(os.path.dirname(__file__), "data", "icd10_min.json"))

REMOTE_SOURCES = [
    # keep a few mirrors, but we'll only try them if LOCAL_PATH is missing
    "https://raw.githubusercontent.com/ozlerhakan/mongodb-json-files/master/datasets/icd10.json",
    "https://raw.githubusercontent.com/dominicegginton/openicd-backup/main/icd10.json",
]

def slugify(s: str) -> str:
    return "-".join("".join(ch.lower() if ch.isalnum() else "-" for ch in s).split("-")).strip("-")

def connect():
    if not PG_DSN:
        raise RuntimeError("DATABASE_URL / DATABASE_URL_INTERNAL is not set")
    # Render adds ?sslmode=require on external; psycopg2 handles it.
    return psycopg2.connect(PG_DSN)

def ensure_table(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS diseases (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          icd TEXT,
          overview TEXT,
          symptoms_common JSONB,
          labs_key JSONB,
          red_flags JSONB,
          references JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

def load_local():
    if os.path.exists(LOCAL_PATH):
        with open(LOCAL_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

def load_remote(max_attempts=3, timeout=15):
    session = requests.Session()
    for url in REMOTE_SOURCES:
        for attempt in range(1, max_attempts + 1):
            print(f"⬇️  Downloading disease dataset (attempt {attempt}) from: {url}")
            try:
                r = session.get(url, timeout=timeout)
                if r.status_code == 200:
                    return r.json()
                else:
                    print(f"⚠️  Attempt {attempt} failed with status {r.status_code}")
            except Exception as e:
                print(f"⚠️  Attempt {attempt} error: {e}")
            time.sleep(1.2)
    raise RuntimeError("Failed to download ICD data from all sources.")

def normalize(records):
    """
    Accepts either our local schema (already normalized) or a bare list of ICD
    {code, description}. Returns list of unified dicts matching DB columns.
    """
    norm = []
    for rec in records:
        # local schema already has fields
        if "name" in rec:
            name = rec["name"]
            norm.append({
                "name": name,
                "slug": rec.get("slug") or slugify(name),
                "icd": rec.get("icd"),
                "overview": rec.get("overview", ""),
                "symptoms_common": rec.get("symptoms_common", []),
                "labs_key": rec.get("labs_key", []),
                "red_flags": rec.get("red_flags", []),
                "references": rec.get("references", []),
            })
        # generic fallback schema
        elif "code" in rec and ("description" in rec or "desc" in rec):
            code = rec["code"]
            desc = rec.get("description") or rec.get("desc") or code
            name = desc.split("—")[0].strip()
            norm.append({
                "name": name,
                "slug": slugify(f"{name}-{code}"),
                "icd": code,
                "overview": desc,
                "symptoms_common": [],
                "labs_key": [],
                "red_flags": [],
                "references": [],
            })
    # de-dupe by slug
    seen, out = set(), []
    for r in norm:
        if r["slug"] in seen: 
            continue
        seen.add(r["slug"])
        out.append(r)
    return out

def upsert(cur, rows):
    sql = """
    INSERT INTO diseases (name, slug, icd, overview, symptoms_common, labs_key, red_flags, references)
    VALUES (%(name)s, %(slug)s, %(icd)s, %(overview)s,
            %(symptoms_common)s::jsonb, %(labs_key)s::jsonb, %(red_flags)s::jsonb, %(references)s::jsonb)
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      icd = EXCLUDED.icd,
      overview = EXCLUDED.overview,
      symptoms_common = EXCLUDED.symptoms_common,
      labs_key = EXCLUDED.labs_key,
      red_flags = EXCLUDED.red_flags,
      references = EXCLUDED.references;
    """
    for r in rows:
        cur.execute(sql, {
            "name": r["name"],
            "slug": r["slug"],
            "icd": r.get("icd"),
            "overview": r.get("overview", ""),
            "symptoms_common": json.dumps(r.get("symptoms_common", [])),
            "labs_key": json.dumps(r.get("labs_key", [])),
            "red_flags": json.dumps(r.get("red_flags", [])),
            "references": json.dumps(r.get("references", [])),
        })

def main():
    with connect() as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            ensure_table(cur)
            conn.commit()
            print("✅ Table created or already exists.")

            data = load_local()
            if data is None:
                print("ℹ️  Local ICD JSON not found, trying remote mirrors...")
                data = load_remote()
            else:
                print(f"📄 Loaded local ICD JSON: {LOCAL_PATH}")

            rows = normalize(data)
            print(f"📦 Normalized {len(rows)} disease rows.")
            upsert(cur, rows)
            conn.commit()
            print("🎉 Seed complete.")

if __name__ == "__main__":
    main()
