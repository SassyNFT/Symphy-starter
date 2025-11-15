import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

/* ──────────────────────────────────────────────────────────────
   CONFIG
────────────────────────────────────────────────────────────── */

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "https://symphy-api.onrender.com";

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

// NOTE: Many DB fields are still plain TEXT, so we accept string | string[]
interface Disease {
  name: string;
  slug: string;
  icd?: string;
  overview?: string | null;
  symptoms_common?: string[] | string | null;
  labs_key?: string[] | string | null;
  red_flags?: string[] | string | null;
  references?: { title: string; url: string }[] | string | null;
  notes_from_doctors?: string[]; // For future backend integration
}

/* ──────────────────────────────────────────────────────────────
   UTILITY FUNCTIONS
────────────────────────────────────────────────────────────── */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

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
): string {
  const num = parseFloat(v);
  if (!spec || isNaN(num)) return "inherit";
  const rng = pickRange(spec, age, sex);
  if (!rng) return "inherit";
  if (num < rng.low) return "#0B6FE3"; // low = blue
  if (num > rng.high) return "#D90429"; // high = red
  return "#198754"; // normal = green
}

// Safely normalize DB string vs array fields
function normalizeList(field: string[] | string | null | undefined): string[] {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  const trimmed = field.trim();
  if (!trimmed) return [];
  // Split on newline or semicolon
  return trimmed.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
}

/* ──────────────────────────────────────────────────────────────
   CANADIAN REFERENCE RANGES
────────────────────────────────────────────────────────────── */

const REF: RefTable = {
  WBC: {
    unit: "×10⁹/L",
    child: { low: 5, high: 15 },
    teen: { low: 4.5, high: 13 },
    adult: { low: 4, high: 11 },
    senior: { low: 3.5, high: 11 },
  },
  RBC: {
    unit: "×10¹²/L",
    child: { low: 3.9, high: 5.3 },
    teen: { low: 4.1, high: 5.7 },
    male: { low: 4.5, high: 6.0 },
    female: { low: 4.0, high: 5.2 },
    seniorMale: { low: 4.3, high: 5.8 },
    seniorFemale: { low: 3.8, high: 5.1 },
  },
  Hemoglobin: {
    unit: "g/L",
    child: { low: 110, high: 140 },
    teen: { low: 115, high: 160 },
    male: { low: 130, high: 170 },
    female: { low: 120, high: 150 },
    seniorMale: { low: 125, high: 170 },
    seniorFemale: { low: 115, high: 150 },
  },
  Hematocrit: {
    unit: "L/L",
    male: { low: 0.4, high: 0.5 },
    female: { low: 0.36, high: 0.46 },
    child: { low: 0.34, high: 0.42 },
  },
  MCV: { unit: "fL", default: { low: 80, high: 100 } },
  MCH: { unit: "pg", default: { low: 27, high: 34 } },
  MCHC: { unit: "g/L", default: { low: 320, high: 360 } },
  RDW: { unit: "%", default: { low: 11.5, high: 14.5 } },
  Platelets: { unit: "×10⁹/L", default: { low: 150, high: 400 } },
  CRP: { unit: "mg/L", default: { low: 0, high: 5 } },
  ESR: { unit: "mm/h", male: { low: 0, high: 15 }, female: { low: 0, high: 20 } },
  Glucose: { unit: "mmol/L", default: { low: 3.9, high: 7.8 } },
  Urea: { unit: "mmol/L", adult: { low: 2.5, high: 7.5 } },
  Creatinine: {
    unit: "µmol/L",
    male: { low: 60, high: 115 },
    female: { low: 45, high: 90 },
  },
  Sodium: { unit: "mmol/L", default: { low: 135, high: 145 } },
  Potassium: { unit: "mmol/L", default: { low: 3.5, high: 5.0 } },
  Chloride: { unit: "mmol/L", default: { low: 98, high: 107 } },
  Bicarbonate: { unit: "mmol/L", default: { low: 22, high: 29 } },
  Calcium: { unit: "mmol/L", default: { low: 2.1, high: 2.6 } },
  Magnesium: { unit: "mmol/L", default: { low: 0.7, high: 1.05 } },
  Phosphate: { unit: "mmol/L", adult: { low: 0.8, high: 1.5 } },
  ALT: { unit: "U/L", male: { low: 0, high: 55 }, female: { low: 0, high: 45 } },
  AST: { unit: "U/L", default: { low: 0, high: 45 } },
  ALP: { unit: "U/L", adult: { low: 30, high: 120 } },
  Bilirubin: { unit: "µmol/L", default: { low: 3, high: 20 } },
  Albumin: { unit: "g/L", adult: { low: 35, high: 50 } },
  TotalProtein: { unit: "g/L", default: { low: 60, high: 80 } },
  CholesterolTotal: { unit: "mmol/L", adult: { low: 3.5, high: 5.2 } },
  HDL: {
    unit: "mmol/L",
    male: { low: 1.0, high: 2.4 },
    female: { low: 1.3, high: 2.4 },
  },
  LDL: { unit: "mmol/L", adult: { low: 0, high: 3.5 } },
  Triglycerides: { unit: "mmol/L", adult: { low: 0, high: 1.7 } },
  TSH: { unit: "mIU/L", default: { low: 0.4, high: 4.5 } },
  FreeT4: { unit: "pmol/L", default: { low: 10, high: 22 } },
  Ferritin: {
    unit: "µg/L",
    male: { low: 30, high: 400 },
    female: { low: 15, high: 150 },
  },
  PSA: { unit: "µg/L", male: { low: 0, high: 4 } },
};

/* ──────────────────────────────────────────────────────────────
   MAIN APP COMPONENT
────────────────────────────────────────────────────────────── */

function App() {
  const [activeTab, setActiveTab] = useState<
    "symptoms" | "labs" | "vitals" | "library"
  >("symptoms");

  const [age, setAge] = useState<number | null>(null);
  const [sex, setSex] = useState<SexKey | null>(null);
  const demographicsSet = useMemo(
    () => age !== null && sex !== null,
    [age, sex]
  );

  const [symptoms, setSymptoms] = useState("");
  const [vitals, setVitals] = useState({
    Temp: "",
    HR: "",
    BP: "",
    O2: "",
  });
  const [labTests, setLabTests] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");

  const [error, setError] = useState("");
  const [result, setResult] = useState(""); // raw JSON string (debug)
  const [candidates, setCandidates] = useState<
    { name: string; slug: string; icd?: string; score?: number }[]
  >([]);

  const [loadingAnalyze, setLoadingAnalyze] = useState(false);

  // Disease Library
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [letter, setLetter] = useState("All");
  const [selectedDisease, setSelectedDisease] = useState<Disease | null>(null);
  const [loadingDiseases, setLoadingDiseases] = useState(false);

  // Clinician notes
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");

  /* ───────────────────────────────
     Load Lab Tests
  ─────────────────────────────── */
  useEffect(() => {
    fetch("/labTests.json")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data);
        const seed = Object.values(data)
          .flat()
          .reduce((acc, k) => ({ ...acc, [k]: "" }), {});
        setLabTests(seed);
      })
      .catch(() => setError("Could not load lab test definitions."));
  }, []);

  /* ───────────────────────────────
     Load Diseases from API (DB)
  ─────────────────────────────── */
  useEffect(() => {
    setLoadingDiseases(true);
    setError("");

    fetch(`${API_BASE}/diseases?limit=500`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data?.data) {
          setDiseases(data.data);
        } else {
          setError("API returned no disease data.");
        }
      })
      .catch((err: any) => {
        setError("Could not load disease library: " + err.message);
      })
      .finally(() => setLoadingDiseases(false));
  }, []);

  /* ───────────────────────────────
     Handle Analyze Button
  ─────────────────────────────── */
  const handleAnalyze = async () => {
    setError("");
    setResult("");
    setCandidates([]);
    setLoadingAnalyze(true);

    const labs = Object.entries(labTests)
      .filter(([, v]) => v !== "")
      .map(([name, v]) => {
        const spec = REF[name];
        const band = pickRange(spec, age, sex);
        return {
          name,
          value: parseFloat(v),
          unit: spec?.unit || "unit",
          ref_low: band?.low ?? null,
          ref_high: band?.high ?? null,
        };
      });

    const vitalsArray = Object.entries(vitals)
      .filter(([, v]) => v !== "")
      .map(([name, v]) => ({
        name,
        value: parseFloat(v),
        unit:
          name === "Temp"
            ? "°C"
            : name === "HR"
            ? "bpm"
            : name === "BP"
            ? "mmHg"
            : "%",
      }));

    const payload = {
      patient: { age, sex },
      symptoms_free_text: symptoms,
      labs,
      vitals: vitalsArray,
      include_natural_remedies: true,
      max_candidates: 5,
      language: "en",
    };

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("API request failed");

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));

      const list =
        (data?.candidates || []).map((c: any) => {
          const n = c?.disease?.name || "Unknown condition";
          const icd = c?.disease?.icd;
          const s = slugify(n);
          const found =
            diseases.find((d) => d.slug === s) ||
            diseases.find(
              (d) => d.name.toLowerCase() === n.toLowerCase()
            ) ||
            null;
          return { name: n, slug: found?.slug || s, icd, score: c?.score };
        }) || [];

      setCandidates(list);
    } catch (e: any) {
      setError(`Error: ${e.message}`);
    } finally {
      setLoadingAnalyze(false);
    }
  };

  /* ───────────────────────────────
     Clinician Note Submit
  ─────────────────────────────── */
  const handleAddNote = async () => {
    if (!selectedDisease || !newNote.trim()) return;
    setNoteError("");
    setSavingNote(true);

    // Choose identifier: prefer ICD, then slug
    const identifier = selectedDisease.icd || selectedDisease.slug;
    try {
      // Backend endpoint you can implement later:
      // POST /diseases/{id}/notes  { note: string }
      await fetch(`${API_BASE}/diseases/${encodeURIComponent(identifier)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote.trim() }),
      }).catch(() => {
        // If backend not ready yet, silently fail and just update UI locally
        console.warn("Note API not implemented yet; storing locally only.");
      });

      // Update local state so user sees the note immediately
      const updated: Disease = {
        ...selectedDisease,
        notes_from_doctors: [
          ...(selectedDisease.notes_from_doctors || []),
          newNote.trim(),
        ],
      };
      setSelectedDisease(updated);
      setNewNote("");
    } catch (e: any) {
      setNoteError("Could not save note: " + e.message);
    } finally {
      setSavingNote(false);
    }
  };

  /* ───────────────────────────────
     Small Components
  ─────────────────────────────── */

  const LabInput: React.FC<{ test: string }> = ({ test }) => {
    const spec = REF[test];
    const color = valueColor(labTests[test] || "", spec, age, sex);
    const band = demographicsSet ? pickRange(spec, age, sex) : undefined;

    return (
      <div>
        <label>{test}</label>
        <input
          type="number"
          step="any"
          value={labTests[test] || ""}
          onChange={(e) =>
            setLabTests((s) => ({ ...s, [test]: e.target.value }))
          }
          style={{
            width: "100%",
            padding: 6,
            borderRadius: 4,
            border: "1px solid #ccc",
            color,
          }}
        />
        <small style={{ color: "#666" }}>
          {demographicsSet ? (
            spec ? (
              <>
                Normal: {band?.low}–{band?.high} {spec.unit}
              </>
            ) : (
              <>No reference defined</>
            )
          ) : (
            <>Enter age &amp; gender to view range</>
          )}
        </small>
      </div>
    );
  };

  const letters = ["All", ...Array.from({ length: 26 }, (_, i) =>
    String.fromCharCode(65 + i)
  )];

  const filteredDiseases = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return diseases.filter((d) => {
      const startLetter = (d.name || "").charAt(0).toUpperCase();
      const okLetter = letter === "All" || startLetter === letter;
      const overview = (d.overview || "").toString().toLowerCase();
      const okQuery =
        !q ||
        d.name.toLowerCase().includes(q) ||
        (d.icd || "").toLowerCase().includes(q) ||
        overview.includes(q);
      return okLetter && okQuery;
    });
  }, [diseases, librarySearch, letter]);

  /* ───────────────────────────────
     MAIN LAYOUT / TABS
  ─────────────────────────────── */

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
      <h1>Symphy · Clinical Analyzer</h1>
      <p style={{ color: "#555", marginBottom: 20, fontSize: 14 }}>
        Experimental clinical decision support. Not a substitute for clinical
        judgment. For licensed clinicians only.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["symptoms", "labs", "vitals", "library"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              flex: 1,
              padding: 10,
              cursor: "pointer",
              border: "1px solid #ddd",
              background: activeTab === t ? "#0B6FE3" : "#f3f3f3",
              color: activeTab === t ? "white" : "black",
              fontWeight: 700,
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Demographics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 220px 1fr",
          gap: 12,
          alignItems: "end",
          marginBottom: 16,
        }}
      >
        <div>
          <label>Age (years)</label>
          <input
            type="number"
            min={0}
            step="1"
            value={age ?? ""}
            placeholder="e.g., 24"
            onChange={(e) =>
              setAge(e.target.value === "" ? null : parseInt(e.target.value))
            }
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
        </div>

        <div>
          <label>Gender</label>
          <select
            value={sex ?? ""}
            onChange={(e) => setSex((e.target.value || null) as SexKey | null)}
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="intersex">Intersex</option>
          </select>
        </div>

        {sex === "intersex" && (
          <div style={{ color: "#C07A00", fontSize: 13 }}>
            Note: Reference ranges for intersex individuals vary by phenotype
            and clinical context. Use clinical judgment.
          </div>
        )}
      </div>

      {/* Symptoms Tab */}
      {activeTab === "symptoms" && (
        <div>
          <h3>Patient Symptoms</h3>
          <textarea
            rows={6}
            placeholder="Describe symptoms here…"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
        </div>
      )}

      {/* Labs Tab */}
      {activeTab === "labs" && (
        <div>
          <h3>Laboratory Tests</h3>
          <input
            type="text"
            placeholder="Search lab test…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 6,
              border: "1px solid #ccc",
              marginBottom: 10,
            }}
          />
          {Object.entries(categories).map(([cat, tests]) => {
            const visible = tests.filter((t) =>
              t.toLowerCase().includes(search.toLowerCase())
            );
            if (!visible.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 18 }}>
                <h4
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid #ddd",
                    background: "#fafafa",
                  }}
                >
                  {cat}
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 10,
                  }}
                >
                  {visible.map((test) => (
                    <LabInput key={test} test={test} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vitals Tab */}
      {activeTab === "vitals" && (
        <div>
          <h3>Vital Signs</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
            }}
          >
            <input
              placeholder="Temperature (°C)"
              value={vitals.Temp}
              onChange={(e) =>
                setVitals({ ...vitals, Temp: e.target.value })
              }
            />
            <input
              placeholder="Heart Rate (bpm)"
              value={vitals.HR}
              onChange={(e) => setVitals({ ...vitals, HR: e.target.value })}
            />
            <input
              placeholder="Blood Pressure (mmHg)"
              value={vitals.BP}
              onChange={(e) => setVitals({ ...vitals, BP: e.target.value })}
            />
            <input
              placeholder="Oxygen Saturation (%)"
              value={vitals.O2}
              onChange={(e) => setVitals({ ...vitals, O2: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Library Tab */}
      {activeTab === "library" && (
        <div>
          <h3>Disease Library</h3>

          {/* Letter filter */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 10,
            }}
          >
            {letters.map((L) => (
              <button
                key={L}
                onClick={() => setLetter(L)}
                style={{
                  padding: "4px 8px",
                  background: letter === L ? "#0B6FE3" : "white",
                  color: letter === L ? "white" : "black",
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {L}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            placeholder="Search by name, ICD, or keyword…"
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 6,
              marginBottom: 14,
            }}
          />

          {/* Loading skeletons */}
          {loadingDiseases && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: 8,
                    padding: 10,
                    background: "#f0f0f0",
                    height: 110,
                    animation: "pulse 1.4s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          )}

          {/* Disease cards */}
          {!loadingDiseases && (
            <>
              {filteredDiseases.length === 0 ? (
                <p style={{ color: "#666" }}>No diseases match your filters.</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                  }}
                >
                  {filteredDiseases.map((d) => (
                    <div
                      key={d.slug || d.icd || d.name}
                      style={{
                        border: "1px solid #ccc",
                        borderRadius: 8,
                        padding: 10,
                        background: "#fafafa",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <strong>{d.name}</strong>
                        {d.icd && (
                          <p style={{ fontSize: 12, color: "#555" }}>
                            ICD: {d.icd}
                          </p>
                        )}
                        <p style={{ fontSize: 13, color: "#444" }}>
                          {((d.overview || "") as string).slice(0, 120)}...
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedDisease(d);
                          setNewNote("");
                          setNoteError("");
                        }}
                        style={{
                          marginTop: 8,
                          background: "#0B6FE3",
                          color: "white",
                          border: "none",
                          padding: "4px 8px",
                          borderRadius: 4,
                          cursor: "pointer",
                          alignSelf: "flex-start",
                        }}
                      >
                        View Details
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Detailed disease drawer */}
          {selectedDisease && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                border: "2px solid #0B6FE3",
                borderRadius: 8,
                background: "white",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <h3 style={{ margin: 0 }}>{selectedDisease.name}</h3>
                <button
                  onClick={() => setSelectedDisease(null)}
                  style={{
                    background: "#D90429",
                    color: "white",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>

              {selectedDisease.icd && (
                <p style={{ color: "#666", marginTop: 0 }}>
                  ICD Code: {selectedDisease.icd}
                </p>
              )}

              {selectedDisease.overview && (
                <>
                  <h4>Overview</h4>
                  <p>{selectedDisease.overview}</p>
                </>
              )}

              {/* Symptoms */}
              {normalizeList(selectedDisease.symptoms_common).length > 0 && (
                <>
                  <h4>Common Symptoms</h4>
                  <ul>
                    {normalizeList(selectedDisease.symptoms_common).map(
                      (s, i) => (
                        <li key={i}>{s}</li>
                      )
                    )}
                  </ul>
                </>
              )}

              {/* Labs */}
              {normalizeList(selectedDisease.labs_key).length > 0 && (
                <>
                  <h4>Key Laboratory Findings</h4>
                  <ul>
                    {normalizeList(selectedDisease.labs_key).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}

              {/* Red flags */}
              {normalizeList(selectedDisease.red_flags).length > 0 && (
                <>
                  <h4>Red Flags</h4>
                  <ul>
                    {normalizeList(selectedDisease.red_flags).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}

              {/* References */}
              {selectedDisease.references && (
                <>
                  <h4>References</h4>
                  {Array.isArray(selectedDisease.references) ? (
                    <ul>
                      {selectedDisease.references.map((r, i) => (
                        <li key={i}>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#0B6FE3" }}
                          >
                            {r.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{selectedDisease.references}</p>
                  )}
                </>
              )}

              {/* Clinician Notes */}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: "1px solid #ddd",
                }}
              >
                <h4>Clinician Notes</h4>

                {(selectedDisease.notes_from_doctors || []).length === 0 ? (
                  <p style={{ color: "#666", fontSize: 13 }}>
                    No notes have been added yet for this condition.
                  </p>
                ) : (
                  <ul>
                    {selectedDisease.notes_from_doctors!.map((note, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {note}
                      </li>
                    ))}
                  </ul>
                )}

                <textarea
                  rows={3}
                  placeholder="Add a brief note on what helped your patient (tests, treatments, red flags)..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    fontSize: 13,
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={handleAddNote}
                    disabled={savingNote || !newNote.trim()}
                    style={{
                      marginTop: 8,
                      background: savingNote ? "#888" : "#0B6FE3",
                      color: "white",
                      border: "none",
                      padding: "6px 10px",
                      borderRadius: 4,
                      cursor: savingNote ? "default" : "pointer",
                    }}
                  >
                    {savingNote ? "Saving…" : "Save Note (doctor only)"}
                  </button>
                  {noteError && (
                    <span
                      style={{
                        marginTop: 8,
                        color: "red",
                        fontSize: 12,
                      }}
                    >
                      {noteError}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analyze Button */}
      <div style={{ marginTop: 24 }}>
        <button
          onClick={handleAnalyze}
          disabled={loadingAnalyze}
          style={{
            padding: "10px 20px",
            background: loadingAnalyze ? "#888" : "#0B6FE3",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            cursor: loadingAnalyze ? "default" : "pointer",
          }}
        >
          {loadingAnalyze ? "Analyzing…" : "Analyze Patient Data"}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <p style={{ color: "red", marginTop: 10, whiteSpace: "pre-wrap" }}>
          {error}
        </p>
      )}

      {/* AI Matches - card layout */}
      {candidates.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>Top AI Matches</h3>
          <p style={{ color: "#666", fontSize: 13 }}>
            Ranked suggestions only. Always confirm with clinical reasoning and
            appropriate testing.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {candidates.map((c, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #ccc",
                  padding: 10,
                  borderRadius: 6,
                  background: "#fafafa",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <strong>{c.name}</strong>
                  {c.icd && (
                    <span style={{ marginLeft: 6, color: "#555" }}>
                      (ICD: {c.icd})
                    </span>
                  )}
                  {typeof c.score === "number" && (
                    <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>
                      Confidence: {(c.score * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    const hit =
                      diseases.find((d) => d.slug === c.slug) ||
                      diseases.find(
                        (d) =>
                          d.name.toLowerCase() === c.name.toLowerCase()
                      ) ||
                      null;
                    if (hit) {
                      setActiveTab("library");
                      setSelectedDisease(hit);
                    }
                  }}
                  style={{
                    padding: "6px 10px",
                    background: "#0B6FE3",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  View Disease Info
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON result (debug) */}
      {result && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>
            Debug: Raw API response
          </summary>
          <pre
            style={{
              background: "#f3f3f3",
              padding: 10,
              borderRadius: 6,
              marginTop: 8,
              overflowX: "auto",
              fontSize: 13,
            }}
          >
            {result}
          </pre>
        </details>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   RENDER ROOT
────────────────────────────────────────────────────────────── */

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

/* Optional simple skeleton animation */
const style = document.createElement("style");
style.innerHTML = `
@keyframes pulse {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}
`;
document.head.appendChild(style);
