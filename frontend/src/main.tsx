import React, { useState } from "react";
import ReactDOM from "react-dom/client";

const API_URL = "https://symphy-api.onrender.com/analyze"; // ✅ Correct backend link (no port!)

function App() {
  const [symptoms, setSymptoms] = useState("");
  const [crp, setCrp] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    setError("");
    setResult("");
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms_free_text: symptoms,
          labs: crp
            ? [{ name: "CRP", value: parseFloat(crp), unit: "mg/L" }]
            : [],
          include_natural_remedies: true,
          max_candidates: 5,
          language: "en",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("Error:", err);
      setError("Error: Unable to connect to API or invalid response.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px" }}>
      <h1>
        <strong>Symphy • Medical Search</strong>
      </h1>

      <input
        type="text"
        value={symptoms}
        onChange={(e) => setSymptoms(e.target.value)}
        placeholder="Enter symptoms here"
        style={{ width: "100%", padding: "10px", fontSize: "16px" }}
      />
      <br />
      <label style={{ marginTop: "10px", display: "block" }}>
        CRP:{" "}
        <input
          type="text"
          value={crp}
          onChange={(e) => setCrp(e.target.value)}
          placeholder="e.g. 6.8"
          style={{ padding: "5px" }}
        />{" "}
        mg/L
      </label>
      <br />
      <button
        onClick={handleAnalyze}
        disabled={loading}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          backgroundColor: "#0078ff",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        {loading ? "Analyzing..." : "Analyze"}
      </button>

      {error && (
        <p style={{ color: "red", marginTop: "20px" }}>{error}</p>
      )}

      {result && (
        <pre
          style={{
            background: "#f4f4f4",
            padding: "15px",
            borderRadius: "5px",
            marginTop: "20px",
            overflowX: "auto",
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
