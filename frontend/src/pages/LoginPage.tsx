import { useState } from "react";

export default function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();

    // temporary fake auth — replace later
    if (email && password) {
      onLogin("fake-token-123");
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", textAlign: "center" }}>
      <h2>Symphy Login</h2>
      <p>Enter your account to access the platform</p>

      <form onSubmit={submit} style={{ marginTop: 20 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 12, marginBottom: 12 }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 12, marginBottom: 12 }}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: 12,
            background: "#0B6FE3",
            color: "white",
            borderRadius: 6,
          }}
        >
          Login
        </button>
      </form>
    </div>
  );
}
