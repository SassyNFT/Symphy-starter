// src/main.tsx
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const API_BASE = "https://symphy-api.onrender.com"; // ← your real API

type SexKey = "male" | "female" | "intersex";

interface Disease {
  icd: string;
  name: string;
  slug?: string;
  overview?: string;
  symptoms_common?: string[];
  labs_key?: string[];
  red_flags?: string[];
  references?: { title: string; url: string }[];
  notes_from_doctors?: string[];
}

function App() {
  const [activeTab, setActiveTab] = useState<"input" | "results" | "library">("input");
  const [age, setAge] = useState<number | null>(null);
  const [sex, setSex] = useState<SexKey | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedDisease, setSelectedDisease] = useState<Disease | null>(null);
  const [libraryDiseases, setLibraryDiseases] = useState<Disease[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");

  // Load full disease library once
  useEffect(() => {
    fetch(`${API_BASE}/diseases?limit=5000`)
      .then(r => r.json())
      .then(data => setLibraryDiseases(data.data || []));
  }, []);

  const handleAnalyze = async () => {
    if (!age || !sex || !symptoms.trim()) {
      setError("Please enter age, sex, and symptoms");
      return;
    }

    setLoading(true);
    setError("");
    setCandidates([]);

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: { age, sex },
          symptoms_free_text: symptoms,
          include_natural_remedies: true,
          max_candidates: 5,
        }),
      });

      const data = await res.json();
      setCandidates(data.candidates || []);
      setActiveTab("results");
    } catch (err: any) {
      setError("API error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredLibrary = libraryDiseases.filter(d =>
    d.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
    (d.icd || "").toLowerCase().includes(librarySearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 42, textAlign: "center", color: "#0B6FE3" }}>
        Symphy · Clinical Intelligence
      </h1>
      <p style={{ textAlign: "center", color: "#555", marginBottom: 30 }}>
        The Identifix for human health.
      </p>

      {activeTab === "input" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div>
              <label>Age</label>
              <input
                type="number"
                value={age ?? ""}
                onChange={e => setAge(e.target.value ? Number(e.target.value) : null)}
                style={{ width: "100%", padding: 10 }}
              />
            </div>
            <div>
              <label>Sex</label>
              <select value={sex ?? ""} onChange={e => setSex(e.target.value as SexKey)}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="intersex">Intersex</option>
              </select>
            </div>
          </div>

          <textarea
            placeholder="Describe all symptoms, duration, severity, timing, triggers..."
            rows={8}
            value={symptoms}
            onChange={e => setSymptoms(e.target.value)}
            style={{ width: "100%", padding: 15, fontSize: 16 }}
          />

          <button
            onClick={handleAnalyze}
            disabled={loading}
            style={{
              marginTop: 20,
              padding: "16px 40px",
              fontSize: 20,
              background: "#0B6FE3",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer"
            }}
          >
            {loading ? "Analyzing..." : "Find Most Likely Diagnoses"}
          </button>

          {error && <p style={{ color: "red", marginTop: 10 }}>{error}</p>}
        </>
      )}

      {activeTab === "results" && candidates.length > 0 && (
        <div>
          <h2>Top 5 Most Likely Conditions</h2>
          {candidates.map((c, i) => (
            <div
              key={i}
              style={{
                border: "2px solid #0B6FE3",
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
                background: i === 0 ? "#f0f8ff" : "#fff"
              }}
            >
              <h3>
                #{i + 1} {c.disease.name} {c.disease.icd && `(${c.disease.icd})`}
                <span style={{ float: "right", color: "#0B6FE3" }}>
                  Confidence: {(c.score * 100).toFixed(1)}%
                </span>
              </h3>
              <p>{c.overview_summary}</p>
              <button
                onClick={async () => {
                  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(c.disease.name)}`);
                  const data = await res.json();
                  if (data.data?.[0]) {
                    setSelectedDisease(data.data[0]);
                    setActiveTab("library");
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

      {activeTab === "library" && (
        <div>
          <button onClick={() => setActiveTab("input")} style={{ marginBottom: 20 }}>
            ← Back to Symptom Input
          </button>

          <input
            placeholder="Search all 17,000+ ICD-11 conditions..."
            value={librarySearch}
            onChange={e => setLibrarySearch(e.target.value)}
            style={{ width: "100%", padding: 15, fontSize: 18, marginBottom: 20 }}
          />

          {selectedDisease ? (
            <div style={{ border: "2px solid #0B6FE3", padding: 30, borderRadius: 12 }}>
              <h2>{selectedDisease.name} {selectedDisease.icd && `(${selectedDisease.icd})`}</h2>
              <p><strong>Overview:</strong> {selectedDisease.overview || "No overview available"}</p>

              {selectedDisease.symptoms_common && (
                <>
                  <h3>Common Symptoms</h3>
                  <ul>{selectedDisease.symptoms_common.map(s => <li key={s}>{s}</li>)}</ul>
                </>
              )}

              {selectedDisease.labs_key && (
                <>
                  <h3>Key Lab Findings</h3>
                  <ul>{selectedDisease.labs_key.map(s => <li key={s}>{s}</li>)}</ul>
                </>
              )}

              <h3>Doctor Insights (verified only)</h3>
              <p style={{ color: "#666", fontStyle: "italic" }}>
                {selectedDisease.notes_from_doctors?.length 
                  ? selectedDisease.notes_from_doctors.join("\n\n")
                  : "No verified insights yet — be the first!"}
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {filteredLibrary.slice(0, 30).map(d => (
                <div
                  key={d.icd}
                  onClick={() => setSelectedDisease(d)}
                  style={{
                    padding: 15,
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: "#fafafa"
                  }}
                >
                  <strong>{d.name}</strong>
                  {d.icd && <div style={{ fontSize: 12, color: "#666" }}>{d.icd}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 50, color: "#666" }}>
        <p>Symphy · Reducing deaths from misdiagnosis · 2025</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
