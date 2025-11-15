import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

/* ──────────────────────────────────────────────────────────────
   API BASE URL
────────────────────────────────────────────────────────────── */
const API = "https://symphy-api.onrender.com";

/* ──────────────────────────────────────────────────────────────
   TYPES
────────────────────────────────────────────────────────────── */

type SexKey = "male" | "female" | "intersex";
type AgeBand = "child" | "teen" | "adult" | "senior";

interface RefBand {
  low: number;
  high: number;
}

interface RefSpec {
  unit: string;
  default?: RefBand;
  child?: RefBand;
  teen?: RefBand;
  adult?: RefBand;
  senior?: RefBand;
  male?: RefBand;
  female?: RefBand;
  seniorMale?: RefBand;
  seniorFemale?: RefBand;
}

type RefTable = Record<string, RefSpec>;

interface Disease {
  name: string;
  slug: string;
  icd?: string;
  overview?: string;
  symptoms_common?: string | null;
  labs_key?: string | null;
  red_flags?: string | null;
  references?: string | null;
}

/* ──────────────────────────────────────────────────────────────
   UTILITIES
────────────────────────────────────────────────────────────── */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function splitTextField(t: string | null | undefined): string[] {
  if (!t) return [];
  return t
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function getAgeBand(age: number): AgeBand {
  if (age < 13) return "child";
  if (age < 18) return "teen";
  if (age >= 65) return "senior";
  return "adult";
}

function pickRange(
  spec: RefSpec | undefined,
  age: number | null,
  sex: SexKey | null
): RefBand | undefined {
  if (!spec || age == null || sex == null) return undefined;
  const band = getAgeBand(age);

  if (band === "child" && spec.child) return spec.child;
  if (band === "teen" && spec.teen) return spec.teen;

  if (band === "senior") {
    if (sex === "male" && spec.seniorMale) return spec.seniorMale;
    if (sex === "female" && spec.seniorFemale) return spec.seniorFemale;
    if (spec.senior) return spec.senior;
  }

  if (band === "adult") {
    if (sex === "male" && spec.male) return spec.male;
    if (sex === "female" && spec.female) return spec.female;
    if (spec.adult) return spec.adult;
  }

  return spec.default;
}

function valueColor(
  v: string,
  spec: RefSpec | undefined,
  age: number | null,
  sex: SexKey | null
) {
  const num = parseFloat(v);
  if (!spec || isNaN(num)) return "inherit";

  const rng = pickRange(spec, age, sex);
  if (!rng) return "inherit";

  if (num < rng.low) return "#0B6FE3";
  if (num > rng.high) return "#D90429";
  return "#198754";
}

/* ──────────────────────────────────────────────────────────────
   CANADIAN LAB REFERENCE RANGES
────────────────────────────────────────────────────────────── */
const REF: RefTable = {
  WBC: { unit: "×10⁹/L", child: { low: 5, high: 15 }, teen: { low: 4.5, high: 13 }, adult: { low: 4, high: 11 }, senior: { low: 3.5, high: 11 } },
  RBC: { unit: "×10¹²/L", child: { low: 3.9, high: 5.3 }, teen: { low: 4.1, high: 5.7 }, male: { low: 4.5, high: 6.0 }, female: { low: 4.0, high: 5.2 }, seniorMale: { low: 4.3, high: 5.8 }, seniorFemale: { low: 3.8, high: 5.1 } },
  Hemoglobin: { unit: "g/L", child: { low: 110, high: 140 }, teen: { low: 115, high: 160 }, male: { low: 130, high: 170 }, female: { low: 120, high: 150 }, seniorMale: { low: 125, high: 170 }, seniorFemale: { low: 115, high: 150 } },
  Hematocrit: { unit: "L/L", male: { low: 0.40, high: 0.50 }, female: { low: 0.36, high: 0.46 }, child: { low: 0.34, high: 0.42 } },
  MCV: { unit: "fL", default: { low: 80, high: 100 } },
  MCH: { unit: "pg", default: { low: 27, high: 34 } },
  MCHC: { unit: "g/L", default: { low: 320, high: 360 } },
  RDW: { unit: "%", default: { low: 11.5, high: 14.5 } },
  Platelets: { unit: "×10⁹/L", default: { low: 150, high: 400 } },
  CRP: { unit: "mg/L", default: { low: 0, high: 5 } },
  ESR: { unit: "mm/h", male: { low: 0, high: 15 }, female: { low: 0, high: 20 } },
  Glucose: { unit: "mmol/L", default: { low: 3.9, high: 7.8 } },
  Urea: { unit: "mmol/L", adult: { low: 2.5, high: 7.5 } },
  Creatinine: { unit: "µmol/L", male: { low: 60, high: 115 }, female: { low: 45, high: 90 } },
  Sodium: { unit: "mmol/L", default: { low: 135, high: 145 } },
  Potassium: { unit: "mmol/L", default: { low: 3.5, high: 5.0 } },
  Chloride: { unit: "mmol/L", default: { low: 98, high: 107 } },
  Bicarbonate: { unit: "mmol/L", default: { low: 22, high: 29 } },
  Calcium: { unit: "mmol/L", default: { low: 2.10, high: 2.60 } },
  Magnesium: { unit: "mmol/L", default: { low: 0.70, high: 1.05 } },
  Phosphate: { unit: "mmol/L", adult: { low: 0.80, high: 1.50 } },
  ALT: { unit: "U/L", male: { low: 0, high: 55 }, female: { low: 0, high: 45 } },
  AST: { unit: "U/L", default: { low: 0, high: 45 } },
  ALP: { unit: "U/L", adult: { low: 30, high: 120 } },
  Bilirubin: { unit: "µmol/L", default: { low: 3, high: 20 } },
  Albumin: { unit: "g/L", adult: { low: 35, high: 50 } },
  TotalProtein: { unit: "g/L", default: { low: 60, high: 80 } },
  CholesterolTotal: { unit: "mmol/L", adult: { low: 3.5, high: 5.2 } },
  HDL: { unit: "mmol/L", male: { low: 1.0, high: 2.4 }, female: { low: 1.3, high: 2.4 } },
  LDL: { unit: "mmol/L", adult: { low: 0, high: 3.5 } },
  Triglycerides: { unit: "mmol/L", adult: { low: 0, high: 1.7 } },
  TSH: { unit: "mIU/L", default: { low: 0.4, high: 4.5 } },
  FreeT4: { unit: "pmol/L", default: { low: 10, high: 22 } },
  Ferritin: { unit: "µg/L", male: { low: 30, high: 400 }, female: { low: 15, high: 150 } },
  PSA: { unit: "µg/L", male: { low: 0, high: 4 } },
};

/* ──────────────────────────────────────────────────────────────
   MAIN APP
────────────────────────────────────────────────────────────── */

function App() {
  /* Tabs */
  const [activeTab, setActiveTab] = useState<
    "symptoms" | "labs" | "vitals" | "library"
  >("symptoms");

  /* Demographics */
  const [age, setAge] = useState<number | null>(null);
  const [sex, setSex] = useState<SexKey | null>(null);
  const demographicsSet = useMemo(() => age !== null && sex !== null, [age, sex]);

  /* Input state */
  const [symptoms, setSymptoms] = useState("");
  const [labTests, setLabTests] = useState<Record<string, string>>({});
  const [vitals, setVitals] = useState({ Temp: "", HR: "", BP: "", O2: "" });

  /* Backend Disease Library */
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [diseasesLoading, setDiseasesLoading] = useState(true);
  const [diseasesError, setDiseasesError] = useState("");

  /* Disease modal */
  const [selectedDisease, setSelectedDisease] = useState<Disease | null>(null);

  /* AI Output */
  const [result, setResult] = useState("");
  const [candidates, setCandidates] = useState<
    { name: string; slug: string; icd?: string; score?: number }[]
  >([]);
  const [error, setError] = useState("");

  /* ───────────────────────────────
     Load Diseases from Backend API
  ─────────────────────────────── */
  useEffect(() => {
    setDiseasesLoading(true);
    fetch(`${API}/diseases?limit=500`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.data) setDiseases(data.data);
        else setDiseases([]);
      })
      .catch(() => setDiseasesError("Could not load disease list."))
      .finally(() => setDiseasesLoading(false));
  }, []);

  /* ───────────────────────────────
     ANALYZE
  ─────────────────────────────── */
  const handleAnalyze = async () => {
    setError("");
    setResult("");
    setCandidates([]);

    const labs = Object.entries(labTests)
      .filter(([, v]) => v !== "")
      .map(([name, v]) => ({
        name,
        value: parseFloat(v),
        unit: REF[name]?.unit || "",
      }));

    const payload = {
      patient: { age, sex },
      symptoms_free_text: symptoms,
      labs,
      include_natural_remedies: true,
      max_candidates: 5,
    };

    try {
      const r = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error("API error");

      const data = await r.json();
      setResult(JSON.stringify(data, null, 2));

      const list = (data.candidates || []).map((c: any) => {
        const n = c?.disease?.name || "Unknown";
        const icd = c?.disease?.icd;
        const slug = slugify(n);

        const match = diseases.find((d) => d.slug === slug);

        return {
          name: n,
          slug: match?.slug || slug,
          icd,
          score: c.score,
        };
      });

      setCandidates(list);
    } catch (err: any) {
      setError(err.message);
    }
  };

  /* ───────────────────────────────
     Render
  ─────────────────────────────── */

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 30 }}>
      <h1>Symphy · Clinical Analyzer</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {["symptoms", "labs", "vitals", "library"].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t as any)}
            style={{
              flex: 1,
              padding: 10,
              fontWeight: "bold",
              cursor: "pointer",
              background: activeTab === t ? "#0B6FE3" : "#eee",
              color: activeTab === t ? "white" : "black",
              border: "none",
              borderRadius: 6,
            }}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Symptoms */}
      {activeTab === "symptoms" && (
        <div>
          <h3>Symptoms</h3>
          <textarea
            rows={6}
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            style={{ width: "100%", padding: 10 }}
          />
        </div>
      )}

      {/* Labs */}
      {activeTab === "labs" && (
        <div>
          <h3>Labs</h3>
          {Object.keys(REF).map((test) => (
            <div key={test} style={{ marginBottom: 10 }}>
              <label>{test}</label>
              <input
                value={labTests[test] || ""}
                onChange={(e) =>
                  setLabTests((x) => ({ ...x, [test]: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: 6,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Vitals */}
      {activeTab === "vitals" && (
        <div>
          <h3>Vitals</h3>
          <input
            placeholder="Temperature (°C)"
            value={vitals.Temp}
            onChange={(e) => setVitals({ ...vitals, Temp: e.target.value })}
          />
        </div>
      )}

      {/* Library */}
      {activeTab === "library" && (
        <div>
          <h3>Disease Library</h3>

          {diseasesLoading && <p>⏳ Loading diseases…</p>}
          {diseasesError && <p style={{ color: "red" }}>{diseasesError}</p>}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            {diseases.map((d) => (
              <div
                key={d.slug}
                style={{
                  border: "1px solid #ccc",
                  padding: 10,
                  borderRadius: 6,
                }}
              >
                <strong>{d.name}</strong>
                <p style={{ color: "#555" }}>ICD: {d.icd}</p>
                <button
                  style={{
                    marginTop: 6,
                    padding: "6px 8px",
                    background: "#0B6FE3",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                  }}
                  onClick={() => setSelectedDisease(d)}
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disease Modal */}
      {selectedDisease && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "white",
              maxWidth: 800,
              width: "100%",
              padding: 20,
              borderRadius: 8,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2>{selectedDisease.name}</h2>
            <p style={{ color: "#555" }}>ICD: {selectedDisease.icd}</p>
            <p>{selectedDisease.overview}</p>

            {splitTextField(selectedDisease.symptoms_common).length > 0 && (
              <>
                <h3>Common Symptoms</h3>
                <ul>
                  {splitTextField(selectedDisease.symptoms_common).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {splitTextField(selectedDisease.labs_key).length > 0 && (
              <>
                <h3>Key Lab Findings</h3>
                <ul>
                  {splitTextField(selectedDisease.labs_key).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {splitTextField(selectedDisease.red_flags).length > 0 && (
              <>
                <h3>Red Flags</h3>
                <ul>
                  {splitTextField(selectedDisease.red_flags).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            <button
              onClick={() => setSelectedDisease(null)}
              style={{
                marginTop: 20,
                background: "#D90429",
                color: "white",
                border: "none",
                padding: "8px 12px",
                borderRadius: 4,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* AI Analyze Button */}
      <button
        onClick={handleAnalyze}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          background: "#0B6FE3",
          color: "white",
          borderRadius: 6,
        }}
      >
        Analyze Patient
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && (
        <pre
          style={{
            background: "#eee",
            padding: 10,
            borderRadius: 4,
            marginTop: 10,
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
