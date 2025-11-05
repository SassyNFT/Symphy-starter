import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://symphy-api.onrender.com'

function App() {
  const [symptoms, setSymptoms] = useState('fatigue, tooth root pain top left')
  const [crp, setCrp] = useState(6.8)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function analyze() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: { age: 24, sex: 'M' },
          symptoms_free_text: symptoms,
          labs: [{ name: 'CRP', value: String(crp), unit: 'mg/L' }],
          include_natural_remedies: true,
          max_candidates: 5,
          language: 'en'
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', fontFamily: 'system-ui' }}>
      <h2>Symphy • Medical Search</h2>
      <textarea
        rows={3}
        style={{ width: '100%' }}
        value={symptoms}
        onChange={e => setSymptoms(e.target.value)}
      />
      <div style={{ marginTop: 8 }}>
        CRP:{' '}
        <input
          type="number"
          value={crp}
          onChange={e => setCrp(Number(e.target.value))}
        />{' '}
        mg/L
      </div>
      <button onClick={analyze} disabled={loading}>
        {loading ? 'Analyzing…' : 'Analyze'}
      </button>

      {error && <div style={{ color: 'red', marginTop: 12 }}>Error: {error}</div>}
      {result && (
        <div style={{ marginTop: 16 }}>
          {result.candidates?.map((c: any, i: number) => (
            <div
              key={i}
              style={{
                border: '1px solid #ccc',
                padding: 10,
                borderRadius: 6,
                marginBottom: 10
              }}
            >
              <b>{c.disease.name}</b>
              <div>{c.overview_summary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
