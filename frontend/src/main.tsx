import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

interface Range {
  low: number;
  high: number;
  unit: string;
}

function App() {
  const [activeTab, setActiveTab] = useState("symptoms");
  const [symptoms, setSymptoms] = useState("");
  const [labTests, setLabTests] = useState<Record<string, string>>({});
  const [vitals, setVitals] = useState({
    Temp: "",
    HR: "",
    BP: "",
    O2: ""
  });
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [ranges, setRanges] = useState<Record<string, Range>>({});

  // ✅ Load Lab Test Categories
  useEffect(() => {
    fetch("/labTests.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load lab tests");
        return res.json();
      })
      .then((data) => {
        setCategories(data);
        const initial = Object.values(data)
          .flat()
          .reduce((acc, key) => ({ ...acc, [key]: "" }), {});
        setLabTests(initial);
      })
      .catch(() => setError("Could not load lab test definitions."));
  }, []);

  // ✅ Define Reference Ranges
  useEffect(() => {
    setRanges({
      WBC: { low: 4, high: 11, unit: "×10⁹/L" },
      RBC: { low: 4.2, high: 6.1, unit: "×10¹²/L" },
      Hemoglobin: { low: 120, high: 170, unit: "g/L" },
      Hematocrit: { low: 0.37, high: 0.50, unit: "L/L" },
      Platelets: { low: 150, high: 400, unit: "×10⁹/L" },
      CRP: { low: 0, high: 5, unit: "mg/L" },
      Glucose: { low: 3.9, high: 7.8, unit: "mmol/L" },
      Urea: { low: 2.5, high: 7.5, unit: "mmol/L" },
      Creatinine: { low: 60, high: 110, unit: "µmol/L" },
      Sodium: { low: 135, high: 145, unit: "mmol/L" },
      Potassium: { low: 3.5, high: 5.0, unit: "mmol/L" },
      Chloride: { low: 98, high: 107, unit: "mmol/L" },
      Calcium: { low: 2.1, high: 2.6, unit: "mmol/L" },
      ALT: { low: 0, high: 55, unit: "U/L" },
      AST: { low: 0, high: 45, unit: "U/L" },
      ALP: { low: 30, high: 120, unit: "U/L" },
      Bilirubin: { low: 3, high: 20, unit: "µmol/L" }
    });
  }, []);

  // ✅ Determine color based on range
  const getColor = (test: string, value: string) => {
    const range = ranges[test];
    const num = parseFloat(value);
    if (!range || isNaN(num)) return "black";
    if (num < range.low) return "#007BFF"; // blue = low
    if (num > range.high) return "#D90429"; // red = high
    return "#009E60"; // green = normal
  };

  // ✅ Analyze via API
  const handleAnalyze = async () => {
    setError("");
    setResult("");

    const labs = Object.entries(labTests)
      .filter(([_, v]) => v !== "")
      .map(([name, value]) => ({
        name,
        value: parseFloat(value),
        unit: ranges[name]?.unit || "unit"
      }));

    const vitalsArray = Object.entries(vitals)
      .filter(([_, v]) => v !== "")
      .map(([name, value]) => ({
        name,
        value: parseFloat(value),
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
    } catch (err) {
      setError("Error: " + (err as Error).message);
    }
  };

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        padding: "40px",
        maxWidth: "1100px",
        margin: "0 auto"
      }}
    >
      <h1>Symphy • Clinical Analyzer</h1>

      {/* Tabs */}
      <div style={{ display: "flex", marginBottom: "20px" }}>
        {["symptoms", "labs", "vitals"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "10px",
              cursor: "pointer",
              background: activeTab === tab ? "#007BFF" : "#f1f1f1",
              color: activeTab === tab ? "white" : "black",
              border: "1px solid #ddd",
              fontWeight: "bold"
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Symptoms */}
      {activeTab === "symptoms" && (
        <div>
          <h3>Patient Symptoms</h3>
          <textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            rows={6}
            placeholder="Describe symptoms here..."
            style={{
              width: "100%",
              padding: "10px",
              fontSize: "16px",
              borderRadius: "5px",
              border: "1px solid #ccc"
            }}
          />
        </div>
      )}

      {/* Labs */}
      {activeTab === "labs" && (
        <div>
          <h3>Laboratory Tests</h3>
          <input
            type="text"
            placeholder="Search lab test..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginBottom: "10px",
              fontSize: "15px",
              borderRadius: "5px",
              border: "1px solid #ccc"
            }}
          />

          {Object.entries(categories).map(([category, tests]) => {
            const visible = tests.filter((t) =>
              t.toLowerCase().includes(searchTerm.toLowerCase())
            );
            if (visible.length === 0) return null;

            return (
              <div key={category} style={{ marginBottom: "15px" }}>
                <h4
                  style={{
                    borderBottom: "1px solid #ccc",
                    background: "#fafafa",
                    padding: "5px 0"
                  }}
                >
                  {category}
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "8px"
                  }}
                >
                  {visible.map((test) => {
                    const range = ranges[test];
                    const color = getColor(test, labTests[test]);
                    return (
                      <div key={test}>
                        <label>{test}</label>
                        <input
                          type="number"
                          step="any"
                          value={labTests[test] || ""}
                          onChange={(e) =>
                            setLabTests({
                              ...labTests,
                              [test]: e.target.value
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "4px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                            color
                          }}
                        />
                        {range && (
                          <small style={{ color: "#666" }}>
                            Normal: {range.low}–{range.high} {range.unit}
                          </small>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vitals */}
      {activeTab === "vitals" && (
        <div>
          <h3>Vital Signs</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "10px"
            }}
          >
            {Object.keys(vitals).map((key) => (
              <div key={key}>
                <label>{key}</label>
                <input
                  type="number"
                  step="any"
                  value={vitals[key as keyof typeof vitals]}
                  onChange={(e) =>
                    setVitals({ ...vitals, [key]: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "5px",
                    borderRadius: "4px",
                    border: "1px solid #ccc"
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyze */}
      <button
        onClick={handleAnalyze}
        style={{
          marginTop: "25px",
          padding: "10px 25px",
          background: "#007BFF",
          color: "white",
          border: "none",
          cursor: "pointer",
          borderRadius: "6px",
          fontSize: "16px"
        }}
      >
        Analyze
      </button>

      {error && (
        <p style={{ color: "red", marginTop: "20px", fontWeight: "bold" }}>
          {error}
        </p>
      )}

      {result && (
        <pre
          style={{
            background: "#f8f8f8",
            padding: "15px",
            borderRadius: "5px",
            marginTop: "20px",
            fontSize: "14px",
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
