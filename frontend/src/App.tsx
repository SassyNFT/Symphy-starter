import { useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";

export default function App() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("symphy_token");
    if (saved) setToken(saved);
  }, []);

  if (!token) {
    return <LoginPage onLogin={(t) => {
      localStorage.setItem("symphy_token", t);
      setToken(t);
    }} />;
  }

  return <HomePage />;
}
