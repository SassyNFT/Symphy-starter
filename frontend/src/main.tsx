import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

/** -------------------------------------------
 *  Types
 *  -----------------------------------------*/
type SexKey = "male" | "female" | "intersex";
type AgeBand = "child" | "teen" | "adult" | "senior";

interface RefBand {
  low: number;
  high: number;
}

interface RefSpec {
  unit: string;
  // Optional bands for age/sex
  default?: RefBand;
  child?: RefBand;
  teen?: RefBand;
  adult?: RefBand; // use when sex-neutral adult band makes sense
  senior?: RefBand;
  male?: RefBand; // adult male
  female?: RefBand; // adult female
  seniorMale?: RefBand;
  seniorFemale?: RefBand;
}

type RefTable = Record<string, RefSpec>;

interface VitalInput {
  name: string;
  value: number;
  unit: string;
}

/** -------------------------------------------
 *  Helpers: choose band & color
 *  -----------------------------------------*/
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
  if (!spec) return undefined;
  if (age == null || sex == null) return undefined;

  const band = getAgeBand(age);

  // Pediatric & senior bands (sex-neutral unless specified)
  if (band === "child" && spec.child) return spec.child;
  if (band === "teen" && spec.teen) return spec.teen;

  if (band === "senior") {
    if (sex === "male" && spec.seniorMale) return spec.seniorMale;
    if (sex === "female" && spec.seniorFemale) return spec.seniorFemale;
    if (spec.senior) return spec.senior;
  }

  // Adult bands
  if (band === "adult") {
    if (sex === "male" && spec.male) return spec.male;
    if (sex === "female" && spec.female) return spec.female;
    if (spec.adult) return spec.adult;
  }

  // Fallbacks
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
  if (num < rng.low) return "#0B6FE3"; // low: blue
  if (num > rng.high) return "#D90429"; // high: red
  return "#198754"; // normal: green
}

/** -------------------------------------------
 *  Canadian reference ranges (concise but broad)
 *  NOTE: Ranges vary by lab — these are typical.
 *  -----------------------------------------*/
const REF: RefTable = {
  // ===== CBC =====
  WBC: { unit: "×10⁹/L", child: { low: 5, high: 15 }, teen: { low: 4.5, high: 13 }, adult: { low: 4, high: 11 }, senior: { low: 3.5, high: 11 } },
  RBC: {
    unit: "×10¹²/L",
    child: { low: 3.9, high: 5.3 },
    teen: { low: 4.1, high: 5.7 },
    male: { low: 4.5, high: 6.0 },
    female: { low: 4.0, high: 5.2 },
    seniorMale: { low: 4.3, high: 5.8 },
    seniorFemale: { low: 3.8, high: 5.1 }
  },
  Hemoglobin: {
    unit: "g/L",
    child: { low: 110, high: 140 },
    teen: { low: 115, high: 160 },
    male: { low: 130, high: 170 },
    female: { low: 120, high: 150 },
    seniorMale: { low: 125, high: 170 },
    seniorFemale: { low: 115, high: 150 }
  },
  Hematocrit: {
    unit: "L/L",
    child: { low: 0.34, high: 0.42 },
    teen: { low: 0.36, high: 0.48 },
    male: { low: 0.40, high: 0.50 },
    female: { low: 0.36, high: 0.46 },
    seniorMale: { low: 0.38, high: 0.49 },
    seniorFemale: { low: 0.35, high: 0.47 }
  },
  MCV: { unit: "fL", default: { low: 80, high: 100 } },
  MCH: { unit: "pg", default: { low: 27, high: 34 } },
  MCHC: { unit: "g/L", default: { low: 320, high: 360 } },
  RDW: { unit: "%", default: { low: 11.5, high: 14.5 } },
  Platelets: { unit: "×10⁹/L", default: { low: 150, high: 400 } },

  // ===== Inflammatory =====
  CRP: { unit: "mg/L", default: { low: 0, high: 5 } },
  ESR: {
    unit: "mm/h",
    child: { low: 0, high: 10 },
    teen: { low: 0, high: 12 },
    male: { low: 0, high: 15 },
    female: { low: 0, high: 20 },
    seniorMale: { low: 0, high: 20 },
    seniorFemale: { low: 0, high: 30 }
  },

  // ===== Metabolic / Renal & Electrolytes =====
  Glucose: { unit: "mmol/L", default: { low: 3.9, high: 7.8 } }, // non-fasting general range
  Urea: { unit: "mmol/L", adult: { low: 2.5, high: 7.5 }, senior: { low: 3.0, high: 8.5 } },
  Creatinine: {
    unit: "µmol/L",
    child: { low: 20, high: 60 },
    teen: { low: 40, high: 90 },
    male: { low: 60, high: 115 },
    female: { low: 45, high: 90 },
    seniorMale: { low: 60, high: 125 },
    seniorFemale: { low: 45, high: 100 }
  },
  Sodium: { unit: "mmol/L", default: { low: 135, high: 145 } },
  Potassium: { unit: "mmol/L", default: { low: 3.5, high: 5.0 } },
  Chloride: { unit: "mmol/L", default: { low: 98, high: 107 } },
  Bicarbonate: { unit: "mmol/L", default: { low: 22, high: 29 } },
  Calcium: { unit: "mmol/L", default: { low: 2.10, high: 2.60 } },
  Magnesium: { unit: "mmol/L", default: { low: 0.70, high: 1.05 } },
  Phosphate: {
    unit: "mmol/L",
    child: { low: 1.30, high: 2.10 },
    teen: { low: 1.10, high: 1.80 },
    adult: { low: 0.80, high: 1.50 },
    senior: { low: 0.80, high: 1.50 }
  },
  UricAcid: {
    unit: "µmol/L",
    male: { low: 140, high: 420 },
    female: { low: 120, high: 360 },
    adult: { low: 120, high: 420 }
  },

  // ===== Liver / Protein =====
  ALT: { unit: "U/L", male: { low: 0, high: 55 }, female: { low: 0, high: 45 }, child: { low: 0, high: 40 } },
  AST: { unit: "U/L", default: { low: 0, high: 45 } },
  ALP: {
    unit: "U/L",
    child: { low: 150, high: 420 }, // growth
    teen: { low: 100, high: 340 },
    adult: { low: 30, high: 120 },
    senior: { low: 30, high: 120 }
  },
  GGT: { unit: "U/L", male: { low: 10, high: 70 }, female: { low: 6, high: 45 }, adult: { low: 6, high: 70 } },
  Bilirubin: { unit: "µmol/L", default: { low: 3, high: 20 } },
  Albumin: { unit: "g/L", adult: { low: 35, high: 50 }, senior: { low: 34, high: 48 } },
  TotalProtein: { unit: "g/L", default: { low: 60, high: 80 } },
  LDH: { unit: "U/L", default: { low: 125, high: 220 } },

  // ===== Lipids =====
  CholesterolTotal: { unit: "mmol/L", adult: { low: 3.5, high: 5.2 } },
  HDL: {
    unit: "mmol/L",
    male: { low: 1.0, high: 2.4 },
    female: { low: 1.3, high: 2.4 },
    adult: { low: 1.0, high: 2.4 }
  },
  LDL: { unit: "mmol/L", adult: { low: 0, high: 3.5 } },
  Triglycerides: { unit: "mmol/L", adult: { low: 0, high: 1.7 } },

  // ===== Thyroid =====
  TSH: { unit: "mIU/L", default: { low: 0.4, high: 4.5 } },
  FreeT4: { unit: "pmol/L", default: { low: 10, high: 22 } },
  FreeT3: { unit: "pmol/L", default: { low: 3.1, high: 6.8 } },

  // ===== Iron studies =====
  Ferritin: {
    unit: "µg/L",
    child: { low: 10, high: 140 },
    teen: { low: 15, high: 200 },
    male: { low: 30, high: 400 },
    female: { low: 15, high: 150 }
  },
  SerumIron: { unit: "µmol/L", default: { low: 10, high: 30 } },
  Transferrin: { unit: "g/L", default: { low: 2.0, high: 3.6 } },
  TIBC: { unit: "µmol/L", default: { low: 45, high: 72 } },
  TransferrinSat: { unit: "%", default: { low: 20, high: 50 } },

  // ===== Other sex-specific (example) =====
  PSA: { unit: "µg/L", male: { low: 0, high: 4 } } // adult screening reference
};

/** -------------------------------------------
 *  UI
 *  -----------------------------------------*/
function App() {
  const [activeTab, setActiveTab] = useState<"symptoms" | "labs" | "vitals">(
    "symptoms"
  );

  // Demographics
  const [age, setAge] = useState<number | null>(null);
  const [sex, setSex] = useState<SexKey | null>(null);

  // Inputs
  const [symptoms, setSymptoms] = useState("");
  const [vitals, setVitals] = useState({ Temp: "", HR: "", BP: "", O2: "" });
  const [labTests, setLabTests] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");

  // Output
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  // Load visible test list (from public/labTests.json)
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

  const demographicsSet = useMemo(
    () => age !== null && sex !== null,
    [age, sex]
  );

  const intersexNote =
    sex === "intersex"
      ? "Note: Reference ranges for intersex individuals vary by phenotype and clinical context. Use clinical judgment."
      : "";

  // Build payload & call API
  const handleAnalyze = async () => {
    setError("");
    setResult("");

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
          ref_high: band?.high ?? null
        };
      });

    const vitalsArray: VitalInput[] = Object.entries(vitals)
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
            : "%"
      }));

    const payload = {
      patient: { age, sex },
      symptoms_free_text: symptoms,
      labs,
      vitals: vitalsArray,
      include_natural_remedies: true,
      max_candidates: 5,
      language: "en"
    };

    try {
      const res = await fetch("https://symphy-api.onrender.com/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("API request failed");
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setError(`Error: ${e.message}`);
    }
  };

  // Render one input with dynamic range
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
            color
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
            <>Enter age & gender to view range</>
          )}
        </small>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
      <h1>Symphy · Clinical Analyzer</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["symptoms", "labs", "vitals"] as const).map((t) => (
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
              fontWeight: 700
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Demographics header (shown on all tabs) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 220px 1fr",
          gap: 12,
          alignItems: "end",
          marginBottom: 16
        }}
      >
        <div>
          <label>Age (years)</label>
          <input
            type="number"
            min={0}
            step="1"
            value={age ?? ""}
            onChange={(e) =>
              setAge(e.target.value === "" ? null : parseInt(e.target.value))
            }
            placeholder="e.g., 24"
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
          />
        </div>
        <div>
          <label>Gender</label>
          <select
            value={sex ?? ""}
            onChange={(e) =>
              setSex((e.target.value || "") as SexKey | "")
                ? (e.target.value as SexKey)
                : null
            }
            style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 4 }}
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="intersex">Intersex</option>
          </select>
        </div>
        {sex === "intersex" && (
          <div style={{ color: "#C07A00", fontSize: 13 }}>
            {intersexNote}
          </div>
        )}
      </div>

      {/* Body */}
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
              borderRadius: 6
            }}
          />
        </div>
      )}

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
              marginBottom: 10
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
                    background: "#fafafa"
                  }}
                >
                  {cat}
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 10
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

      {activeTab === "vitals" && (
        <div>
          <h3>Vital Signs</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12
            }}
          >
            {Object.keys(vitals).map((k) => (
              <div key={k}>
                <label>{k}</label>
                <input
                  type="number"
                  step="any"
                  value={(vitals as any)[k]}
                  onChange={(e) =>
                    setVitals((s) => ({ ...s, [k]: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 4,
                    border: "1px solid #ccc"
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleAnalyze}
        style={{
          marginTop: 24,
          padding: "10px 24px",
          background: "#0B6FE3",
          color: "white",
          border: 0,
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 700
        }}
      >
        Analyze
      </button>

      {error && (
        <p style={{ color: "#D90429", marginTop: 16, fontWeight: 700 }}>
          {error}
        </p>
      )}

      {result && (
        <pre
          style={{
            marginTop: 16,
            background: "#f6f7f9",
            padding: 14,
            borderRadius: 6,
            overflowX: "auto"
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
