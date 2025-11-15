# backend/api_server.py
# Purpose: Main Symphy API that connects to ICD-11 data and analysis routes

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import create_engine, text
import os

app = FastAPI(title="Symphy API", version="1.2.0")

# -----------------------------
# CORS
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://symphy-web.onrender.com"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# -----------------------------
# Database Connection (FIXED)
# -----------------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL environment variable not set")

# Force all connections to use the public schema
engine = create_engine(
    DATABASE_URL,
    connect_args={"options": "-c search_path=public"}
)

masked_db = DATABASE_URL[:25] + "..." + DATABASE_URL[-10:]
print(f"🧠 API started - Using DB: {masked_db}")

# -----------------------------
# Models
# -----------------------------
class LabItem(BaseModel):
    name: str
    value: float
    unit: str

class AnalyzeInput(BaseModel):
    patient: Optional[dict] = None
    symptoms_free_text: str
    labs: Optional[List[LabItem]] = []
    context: Optional[dict] = None
    include_natural_remedies: bool = True
    max_candidates: int = 5
    language: str = "en"

# -----------------------------
# Routes
# -----------------------------
@app.get("/")
def root():
    return {"status": "✅ Symphy API is live", "docs": "/docs"}


# -----------------------------
# Demo Analyze Endpoint
# -----------------------------
@app.post("/analyze")
def analyze(input_data: AnalyzeInput):
    text_lower = input_data.symptoms_free_text.lower()

    # Hardcoded demo detection
    if "tooth" in text_lower or "gum" in text_lower:
        return {
            "needs_more_data": False,
            "error": None,
            "normalized": {
                "symptoms": input_data.symptoms_free_text,
                "labs": [lab.dict() for lab in input_data.labs],
            },
            "candidates": [
                {
                    "disease": {"name": "Chronic periodontitis", "icd": "KB62.20"},
                    "score": 0.87,
                    "overview_summary": "Bacterial inflammation of periodontal tissues causing attachment loss.",
                }
            ],
            "disclaimer": "This is a demonstration response — not medical advice.",
        }

    return {
        "needs_more_data": False,
        "error": None,
        "normalized": {
            "symptoms": input_data.symptoms_free_text,
            "labs": [lab.dict() for lab in input_data.labs],
        },
        "candidates": [
            {
                "disease": {"name": "Unknown condition (demo)", "icd": "R99"},
                "score": 0.3,
                "overview_summary": "No strong match found in the demo dataset.",
            }
        ],
        "disclaimer": "This is a demonstration response — not medical advice.",
    }


# -----------------------------
# Get diseases
# -----------------------------
@app.get("/diseases")
def get_diseases(limit: int = Query(5000, ge=1, le=10000)):
    """
    Return diseases from the database.
    Increased default + max limit so the full 3300+ ICD-11 entries load.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT icd, name, overview, symptoms_common, labs_key, red_flags, "references"
                FROM diseases
                LIMIT :limit
            """), {"limit": limit})

            diseases = [dict(row._mapping) for row in result]

        return {"count": len(diseases), "data": diseases}

    except Exception as e:
        print(f"❌ /diseases error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------
# Search
# -----------------------------
@app.get("/search")
def search_diseases(q: str = Query(..., description="Search by disease name or keyword")):
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT icd, name, overview, symptoms_common, labs_key, red_flags, "references"
                FROM diseases
                WHERE name ILIKE :term
                LIMIT 25
            """), {"term": f"%{q}%"})

            diseases = [dict(row._mapping) for row in result]

        return {"count": len(diseases), "data": diseases}

    except Exception as e:
        print(f"❌ /search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------
# Count
# -----------------------------
@app.get("/diseases/count")
def get_diseases_count():
    try:
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM diseases")).scalar() or 0

        return {"icd_diseases_loaded": count}

    except Exception as e:
        print(f"❌ /diseases/count error: {str(e)}")
        return {"icd_diseases_loaded": 0, "error": str(e)}


# -----------------------------
# Status (debugging)
# -----------------------------
@app.get("/status")
def get_status():
    try:
        with engine.connect() as conn:
            search_path = conn.execute(text("SHOW search_path")).scalar()
            print("🔍 search_path =", search_path)

            table_exists = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'diseases'
                )
            """)).scalar()

            print("📦 Table exists:", table_exists)

            count = conn.execute(text("SELECT COUNT(*) FROM diseases")).scalar() or 0

        return {
            "status": "ok",
            "icd_diseases_loaded": count,
            "database_url": "connected",
            "search_path": search_path,
            "version": "1.2.0"
        }

    except Exception as e:
        print(f"❌ /status DB check failed: {str(e)}")
        return {
            "status": "error",
            "icd_diseases_loaded": 0,
            "database_url": "connected",
            "error": str(e),
            "version": "1.2.0"
        }

@app.get("/debug/rows")
def debug_rows():
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT * FROM diseases LIMIT 5")).fetchall()
        return {"sample_rows": [dict(r._mapping) for r in rows]}
    except Exception as e:
        return {"error": str(e)}
