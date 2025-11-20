import React, { useState } from "react";

const API_BASE = "https://symphy-api.onrender.com";

export default function LoginPage({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");

    const payload =
      mode === "signup"
        ? { email, password, fullName, credentials }
        : { email, password };

    const endpoint = mode === "signup" ? "signup" : "login";

    try {
      const res = await fetch(`${API_BASE}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");

      // Save token locally
      localStorage.setItem("token", data.token);

      onAuth();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div
      style={{
        maxWidth: 400,
        margin: "100px auto",
        padding: 24,
        border: "1px solid #ccc",
        borderRadius: 8,
      }}
    >
      <h2>{mode === "login" ? "Login" : "Create Account"}</h2>

      {mode === "signup" && (
        <>
          <label>Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ width: "100%", padding: 8, marginBottom: 10 }}
          />

          <label>Medical Credentials</label>
          <input
            type="text"
            placeholder="MD, DO, RN, NP, PhD, PA..."
            value={credentials}
            onChange={(e) => setCredentials(e.target.value)}
            style={{ width: "100%", padding: 8, marginBottom: 10 }}
          />
        </>
      )}

      <label>Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 10 }}
      />

      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 10 }}
      />

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button
        onClick={handleSubmit}
        style={{
          width: "100%",
          padding: 10,
          background: "#0B6FE3",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          marginBottom: 10,
        }}
      >
        {mode === "login" ? "Login" : "Sign Up"}
      </button>

      <div style={{ textAlign: "center" }}>
        {mode === "login" ? (
          <p>
            No account?{" "}
            <span
              style={{ color: "#0B6FE3", cursor: "pointer" }}
              onClick={() => setMode("signup")}
            >
              Sign up
            </span>
          </p>
        ) : (
          <p>
            Already registered?{" "}
            <span
              style={{ color: "#0B6FE3", cursor: "pointer" }}
              onClick={() => setMode("login")}
            >
              Login
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
