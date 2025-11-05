import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

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

  // ✅ Load Lab Test Categories Safely
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
      .catch((err) => {
        console.error("Error loading lab tests:", err);
        setError("Could not load lab test definitions.");
      });
  }, []);

  // ✅ Handle Analyze API Call
  const handleAnalyze = async () => {
    setError("");
    setResult("");

    const labs = Object.entries(labTests)
      .filter(([_, value]) => value !== "")
      .map(([name, value]) => ({
        name,
        value: parseFloat(value),
        unit: "unit"
      }));

    const vitalsArray = Object.entries(vitals)
      .filter(([_, value]) => value !== "")
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
            : name === "O2"
            ? "%"
            : ""
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
      const response = await fetch("https://symphy-api.onrender.com/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("API request failed");
      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("Analysis error:", err);
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

      {/* Tab Navigation */}
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

      {/* Symptoms Tab */}
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

      {/* Labs Tab */}
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
            const visibleTests = tests.filter((t) =>
              t.toLowerCase().includes(searchTerm.toLowerCase())
            );
            if (visibleTests.length === 0) return null;

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
                  {visibleTests.map((test) => (
                    <div key={test}>
                      <label>{test}</label>
                      <input
                        type="number"
                        step="any"
                        value={labTests[test] || ""}
                        onChange={(e) =>
                          setLabTests({ ...labTests, [test]: e.target.value })
                        }
                        style={{
                          width: "100%",
                          padding: "4px",
                          borderRadius: "4px",
                          border: "1px solid #ccc"
                        }}
                      />
                    </div>
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

      {/* Analyze Button */}
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

      {/* Error Display */}
      {error && (
        <p style={{ color: "red", marginTop: "20px", fontWeight: "bold" }}>
          {error}
        </p>
      )}

      {/* API Result */}
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
