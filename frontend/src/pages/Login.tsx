import { useState } from "react";
import axios from "axios";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const API = import.meta.env.VITE_API_BASE;

  async function handleSubmit() {
    setError("");
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";

      const res = await axios.post(API + endpoint, {
        email,
        password,
      });

      localStorage.setItem("token", res.data.token);
      window.location.href = "/app";
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error");
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "100px auto", textAlign: "center" }}>
      <h1>{mode === "login" ? "Symphy Login" : "Create Account"}</h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 20 }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 20 }}
      />

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button
        onClick={handleSubmit}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          width: "100%",
          background: "#007bff",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        {mode === "login" ? "Log in" : "Sign up"}
      </button>

      <p
        style={{ marginTop: 20, cursor: "pointer", color: "blue" }}
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login"
          ? "Need an account? Sign up"
          : "Already have an account? Log in"}
      </p>
    </div>
  );
}
