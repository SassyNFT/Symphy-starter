// src/main.tsx
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const API_BASE = "https://symphy-api.onrender.com"; // ← your real API

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

const REF: Record<string, RefSpec> = {
  WBC: { unit: "×10⁹/L", child: { low: 5, high: 15 }, teen: { low: 4.5, high: 13 }, adult: { low: 4, high: 11 }, senior: { low: 3.5, high: 11 } },
  RBC: { unit: "×10¹²/L", child: { low: 3.9, high: 5.3 }, teen: { low: 4.1, high: 5.7 }, male: { low: 4.5, high: 6.0 }, female: { low: 4.0, high: 5.2 } },
  Hemoglobin: { unit: "g/L", child: { low: 110, high: 140 }, teen: { low: 115, high: 160 }, male: { low: 130, high: 170 }, female: { low: 120, high: 150 } },
  Hematocrit: { unit: "L/L", male: { low: 0.40, high: 0.50 }, female: { low: 0.36, high: 0.46 } },
  MCV: { unit: "fL", default: { low: 80, high: 100 } },
  Platelets: { unit: "×10⁹/L", default: { low: 150, high: 400 } },
  CRP: { unit: "mg/L", default: { low: 0, high: 5 } },
  ESR: { unit: "mm/h", male: { low: 0, high: 15 }, female: { low: 0, high: 20 } },
  Glucose: { unit: "mmol/L", default: { low: 3.9, high: 7.8 } },
  Creatinine: { unit: "µmol/L", male: { low: 60, high: 115 }, female: { low: 45, high: 90 } },
  Sodium: { unit: "mmol/L", default: { low: 135, high: 145 } },
  Potassium: { unit: "mmol/L", default: { low: 3.5, high: 5.0 } },
  ALT: { unit: "U/L", default: { low: 0, high: 55 } },
  Ferritin: { unit: "µg/L", male: { low: 30, high: 400 }, female: { low: 15, high: 150 } },
  TSH: { unit: "mIU/L", default: { low: 0.4, high: 4.5 } },
  // Add more as needed — this is already Canadian ranges
};

const getAgeBand = (age: number): AgeBand => {
  if (age < 13) return "child";
  if (age < 18) return "teen";
  if (age >= 65) return "senior";
  return "adult";
};

const getRange = (spec: RefSpec | undefined, age: number, sex: SexKey): RefBand | undefined => {
  if (!spec) return undefined;
  const band = getAgeBand(age);
  if (band === "child" && spec.child) return spec.child;
  if (band === "teen" && spec.teen) return spec.teen;
  if (band === "senior" && sex === "male" && spec.seniorMale) return spec.seniorMale;
  if (band === "senior" && sex === "female" && spec.seniorFemale) return spec.seniorFemale;
  if (sex === "male" && spec.male) return spec.male;
  if (sex === "female" && spec.female) return spec.female;
  return spec.default;
};

const valueColor = (value: string, spec: RefSpec | undefined, age: number, sex: SexKey): string => {
  const num = parseFloat(value);
  if (!spec || isNaN(num) || age === null || sex === null) return "#000";
  const range = getRange(spec, age, sex);
  if (!range) return "#000";
  if (num < range.low) return "#0B6FE3";   // low = blue
  if (num > range.high) return "#D90429";  // high = red
  return "#198754";                        // normal = green
};

interface Disease {
  icd: string;
  name: string;
  overview?: string;
  symptoms_common?: string[];
  labs_key?: string[];
  red_flags?: string[];
  references?: { title: string; url: string }[];
  notes_from_doctors?: string[];
}

function App() {
  const [tab, setTab] = useState<"symptoms" | "labs" | "vitals" | "library" | "results">("symptoms");
  const [age, setAge] = useState<number | null>(null);
  const [sex, setSex] = useState<SexKey | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [labValues, setLabValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedDisease, setSelectedDisease] = useState<Disease | null>(null);
  const [allDiseases, setAllDiseases] = useState<Disease[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");

  // Load all diseases once
  useEffect(() => {
    fetch(`${API_BASE}/diseases?limit=5000`)
      .then(r => r.json())
      .then(d => setAllDiseases(d.data || []));
  }, []);

  const handleAnalyze = async () => {
    if (!age || !sex || !symptoms.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: { age, sex },
          symptoms_free_text: symptoms,
          max_candidates: 5,
        }),
      });
      const data = await res.json();
      setCandidates(data.candidates || []);
      setTab("results");
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const filteredLibrary = allDiseases.filter(d =>
    d.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
    d.icd.toLowerCase().includes(librarySearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 40, textAlign: "center", marginBottom: 10 }}>
        Symphy · Clinical Analyzer
      </h1>

      {/* Demographics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 30 }}>
        <div>
          <label>Age (years)</label>
          <input
            type="number"
            value={age ?? ""}
            onChange={e => setAge(e.target.value ? Number(e.target.value) : null)}
            style={{ width: "100%", padding: 12, fontSize: 16 }}
          />
        </div>
        <div>
          <label>Gender</label>
          <select
            value={sex ?? ""}
            onChange={e => setSex((e.target.value as SexKey) || null)}
            style={{ width: "100%", padding: 12, fontSize: 16 }}
          >
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="intersex">Intersex</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 30, borderBottom: "2px solid #ddd" }}>
        {(["symptoms", "labs", "vitals", "library"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "12px 24px",
              background: tab === t ? "#0B6FE3" : "transparent",
              color: tab === t ? "white" : "#333",
              border: "none",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Symptoms Tab */}
      {tab === "symptoms" && (
        <div>
          <h3>Describe Symptoms</h3>
          <textarea
            rows={10}
            placeholder="Enter all symptoms, duration, severity, timing, triggers, relieving factors..."
            value={symptoms}
            onChange={e => setSymptoms(e.target.value)}
            style={{ width: "100%", padding: 16, fontSize: 17 }}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || !age || !sex}
            style={{
              marginTop: 20,
              padding: "16px 40px",
              background: "#0B6FE3",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 20,
              cursor: "pointer"
            }}
          >
            {loading ? "Analyzing..." : "Find Most Likely Diagnoses"}
          </button>
        </div>
      )}

      {/* Labs Tab */}
      {tab === "labs" && (
        <div>
          <h3>Laboratory Results</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {Object.keys(REF).map(test => (
              <div key={test}>
                <label style={{ fontWeight: 500 }}>{test} ({REF[test].unit})</label>
                <input
                  type="number"
                  step="any"
                  value={labValues[test] || ""}
                  onChange={e => setLabValues({ ...labValues, [test]: e.target.value })}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "2px solid #ddd",
                    borderRadius: 6,
                    color: valueColor(labValues[test] || "", REF[test], age!, sex!),
                    fontWeight: "bold"
                  }}
                />
                {age && sex && (
                  <small style={{ color: "#666" }}>
                    Normal: {getRange(REF[test], age, sex)?.low}–{getRange(REF[test], age, sex)?.high}
                  </small>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vitals Tab */}
      {tab === "vitals" && (
        <div>
          <h3>Vital Signs</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {["Temp (°C)", "HR (bpm)", "BP (mmHg)", "SpO2 (%)"].map(v => (
              <div key={v}>
                <label>{v}</label>
                <input style={{ width: "100%", padding: 10 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Library Tab */}
      {tab === "library" && (
        <div>
          <h3>Disease Library ({allDiseases.length} conditions)</h3>
          <input
            placeholder="Search by name, ICD, or keyword..."
            value={librarySearch}
            onChange={e => setLibrarySearch(e.target.value)}
            style={{ width: "100%", padding: 14, fontSize: 16, marginBottom: 20 }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {filteredLibrary.slice(0, 40).map(d => (
              <div
                key={d.icd}
                onClick={() => {
                  setSelectedDisease(d);
                  setTab("library");
                }}
                style={{
                  padding: 16,
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  background: "#fafafa",
                  cursor: "pointer"
                }}
              >
                <strong>{d.name}</strong>
                <div style={{ fontSize: 13, color: "#666" }}>{d.icd}</div>
              </div>
            ))}
          </div>

          {selectedDisease && (
            <div style={{ marginTop: 40, padding: 30, border: "2px solid #0B6FE3", borderRadius: 12 }}>
              <h2>{selectedDisease.name} ({selectedDisease.icd})</h2>
              <p><strong>Overview:</strong> {selectedDisease.overview || "No overview available"}</p>

              {selectedDisease.symptoms_common && (
                <>
                  <h3>Common Symptoms</h3>
                  <ul>{selectedDisease.symptoms_common.map(s => <li key={s}>{s}</li>)}</ul>
                </>
              )}

              <h3>Doctor Insights (verified clinicians only)</h3>
              <p style={{ fontStyle: "italic", color: "#666" }}>
                {selectedDisease.notes_from_doctors?.length 
                  ? selectedDisease.notes_from_doctors.join("\n\n")
                  : "No verified insights yet — be the first!"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Results Tab */}
      {tab === "results" && candidates.length > 0 && (
        <div>
          <button onClick={() => setTab("symptoms")} style={{ marginBottom: 20 }}>
            ← New Analysis
          </button>
          <h2>Top Ranked Diagnoses</h2>
          {candidates.map((c, i) => (
            <div
              key={i}
              style={{
                padding: 24,
                marginBottom: 20,
                borderRadius: 12,
                background: i === 0 ? "#f0f8ff" : "#fff",
                border: "2px solid #0B6FE3"
              }}
            >
              <h3>
                #{i + 1} {c.disease.name} ({c.disease.icd})
                <span style={{ float: "right", color: "#0B6FE3", fontWeight: "bold" }}>
                  {(c.score * 100).toFixed(1)}% match
                </span>
              </h3>
              <p>{c.overview_summary}</p>
              <button
                onClick={async () => {
                  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(c.disease.name)}`);
                  const data = await res.json();
                  if (data.data?.[0]) {
                    setSelectedDisease(data.data[0]);
                    setTab("library");
                  }
                }}
                style={{ background: "#0B6FE3", color: "white", padding: "10px 20px", border: "none", borderRadius: 6 }}
              >
                View Full Profile + Doctor Insights
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
