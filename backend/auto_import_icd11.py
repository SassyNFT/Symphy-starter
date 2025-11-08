# backend/auto_import_icd11.py
"""
ICD-11 importer (safe/idempotent).
- Logs clearly at each step
- Seeds a minimal dataset if no external source is configured
- Works with the existing 'diseases' table created by database_init.py
"""

import os
import json
from sqlalchemy import create_engine, text

def _get_engine():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")
    return create_engine(db_url)

def _load_source():
    """
    Try to load ICD data from one of:
      1) ENV: ICD_DATA_JSON (full JSON string)
      2) File: ./icd_seed.json (committed with repo)
      3) Built-in minimal seed (fallback)
    Must return a list[dict] with keys:
      icd, name, slug, overview, symptoms_common, labs_key, red_flags, references
    """
    # 1) env override
    env_json = os.getenv("ICD_DATA_JSON")
    if env_json:
        try:
            data = json.loads(env_json)
            if isinstance(data, list) and data:
                print("🌐 Using ICD data from ICD_DATA_JSON env var.")
                return data
        except Exception as e:
            print(f"⚠️ Failed to parse ICD_DATA_JSON: {e}")

    # 2) repo file
    try:
        with open("icd_seed.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list) and data:
                print("📄 Using ICD data from icd_seed.json.")
                return data
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"⚠️ Could not read icd_seed.json: {e}")

    # 3) minimal built-in fallback
    print("🟨 No external ICD data found. Seeding MINIMAL demo dataset.")
    return [
        {
            "icd": "KB62.20",
            "name": "Chronic periodontitis",
            "slug": "chronic-periodontitis",
            "overview": "Bacterial inflammation of periodontal tissues causing attachment loss.",
            "symptoms_common": "Bleeding gums; tooth mobility; gum recession; halitosis",
            "labs_key": "CRP may be normal; focus is clinical exam and imaging",
            "red_flags": "Rapidly progressive attachment loss; systemic signs",
            "references": "ICD-11 Dentistry; AAP 2018 classification"
        },
        {
            "icd": "8A61",
            "name": "Migraine",
            "slug": "migraine",
            "overview": "Recurrent headache disorder with attacks of moderate to severe head pain.",
            "symptoms_common": "Throbbing unilateral pain; photophobia; phonophobia; nausea",
            "labs_key": "No specific lab; rule out secondary causes as indicated",
            "red_flags": "Neurologic deficit; sudden 'worst headache'; fever; neck stiffness",
            "references": "ICHD-3; ICD-11 8A61"
        },
        {
            "icd": "5A11",
            "name": "Type 2 diabetes mellitus",
            "slug": "type-2-diabetes",
            "overview": "Hyperglycaemia due to insulin resistance and relative insulin deficiency.",
            "symptoms_common": "Polyuria; polydipsia; fatigue; recurrent infections",
            "labs_key": "FPG ≥7.0 mmol/L; HbA1c ≥6.5%; OGTT 2-h ≥11.1 mmol/L",
            "red_flags": "DKA symptoms; HHS; severe dehydration",
            "references": "WHO 2022; ADA Standards of Care"
        }
    ]

def run_auto_import():
    print("🧠 ICD importer starting...")
    engine = _get_engine()
    data = _load_source()
    if not data:
        print("🛑 No data to import. Exiting importer.")
        return

    rows = 0
    with engine.begin() as conn:  # transaction
        # Upsert-like behavior: delete existing rows for same ICD, then insert
        for item in data:
            icd = item.get("icd")
            if not icd:
                continue

            conn.execute(text("DELETE FROM diseases WHERE icd = :icd"), {"icd": icd})
            conn.execute(
                text("""
                    INSERT INTO diseases
                    INSERT INTO diseases
(icd, name, slug, overview, symptoms_common, labs_key, red_flags, "references")
                    VALUES
                    (:icd, :name, :slug, :overview, :symptoms_common, :labs_key, :red_flags, :references)
                """),
                {
                    "icd": icd,
                    "name": item.get("name", ""),
                    "slug": item.get("slug", icd.lower().replace(" ", "-")),
                    "overview": item.get("overview", ""),
                    "symptoms_common": item.get("symptoms_common", ""),
                    "labs_key": item.get("labs_key", ""),
                    "red_flags": item.get("red_flags", ""),
                    "references": item.get("references", "")
                },
            )
            rows += 1

    print(f"✅ ICD importer finished. Inserted/updated {rows} rows.")
