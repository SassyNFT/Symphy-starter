# backend/api_server.py
# Purpose: Main Symphy API that connects to ICD-11 data and analysis routes

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import create_engine, text
import os

# ---------------------------
# 🔹 APP SETUP
# ---------------------------
app = FastAPI(title="Symphy API", version="1.2.0")

# ✅ Allow your live frontend domain to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://symphy-web.onrender.com"],  # your exact frontend URL
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# ---------------------------
# 🔹 DATABASE CONNECTION
# ---------------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("❌ DATABASE_URL environment variable not set")

engine = create_engine(DATABASE_URL)

# ---------------------------
# 🔹 DATA MODELS
# ---------------------------
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

# ---------------------------
# 🔹 ROOT CHECK
# ---------------------------
@app.get("/")
def root():
    return {"status": "✅ Symphy API is live", "docs": "/docs"}

# ---------------------------
# 🔹 ANALYZE ENDPOINT
# ---------------------------
@app.post("/analyze")
def analyze(input_data: AnalyzeInput):
    """
    Basic mock analyzer. You can later connect this to your AI logic.
    """
    text = input_data.symptoms_free_text.lower()

    # Example rule: tooth pain
    if "tooth" in text or "gum" in text:
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

    # Default
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

# ---------------------------
# 🔹 ICD-11 DATABASE ENDPOINTS
# ---------------------------

@app.get("/diseases")
def get_diseases(limit: int = Query(50, ge=1, le=500)):
    """
    Return a list of ICD-11 diseases (limit 50 by default)
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
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search")
def search_diseases(q: str = Query(..., description="Search by disease name or keyword")):
    """
    Search for ICD-11 diseases by name or keyword (case-insensitive)
    """
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
        raise HTTPException(status_code=500, detail=str(e))
