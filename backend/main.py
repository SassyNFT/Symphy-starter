from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Symphy API")

# --- CORS: allow your web app to call this API ---
# For now we allow all; you can restrict to your exact domain later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # change to ["https://symphy-web.onrender.com"] later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LabItem(BaseModel):
    name: str
    value: float
    unit: str

class AnalyzeInput(BaseModel):
    patient: Optional[dict] = None
    symptoms_free_text: Optional[str] = None
    labs: Optional[List[LabItem]] = []
    vitals: Optional[List[dict]] = []
    context: Optional[dict] = None
    include_natural_remedies: Optional[bool] = True
    max_candidates: Optional[int] = 5
    language: Optional[str] = "en"

@app.post("/analyze")
def analyze(data: AnalyzeInput):
    """Mock analyzer returning demo disease candidates"""
    return {
        "needs_more_data": False,
        "error": None,
        "normalized": {"symptoms": data.symptoms_free_text, "labs": [l.dict() for l in data.labs]},
        "candidates": [
            {
                "disease": {"name": "Chronic periodontal infection", "icd": "K05.3"},
                "score": 0.82,
                "overview_summary": "Periodontal infections can drive low-grade systemic inflammation.",
                "why_matched": ["Tooth root pain", "Elevated CRP"],
                "treatments": [
                    {"class": "Dental intervention", "mechanism": "source control", "examples": ["deep cleaning", "extraction"]},
                    {"class": "Antibiotics (adjunct)", "mechanism": "reduce bacterial load", "examples": ["amoxicillin", "metronidazole"]}
                ],
                "side_effects": [
                    {"treatment": "amoxicillin", "effect": "rash/anaphylaxis", "severity": "serious"},
                    {"treatment": "metronidazole", "effect": "GI upset, metallic taste", "severity": "common"}
                ],
                "natural_remedies": [
                    {"intervention": "oral hygiene improvement", "evidence_level": "guideline"}
                ],
                "links": {
                    "research": ["https://pubmed.ncbi.nlm.nih.gov/123456/"],
                    "clinician_notes": "https://symphy.health/insights?d=001"
                }
            }
        ],
        "global_references": [
            {"type": "guideline", "title": "Periodontal Disease Management", "url": "https://example.com/guideline"}
        ],
        "disclaimer": "This output is educational decision-support only and is not medical advice."
    }

@app.get("/")
def root():
    return {"status": "Symphy API running successfully"}

@app.head("/")
def head_root():
    return Response(status_code=200)
