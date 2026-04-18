import { useState, useEffect } from "react";
import "./App.css";

const API_URL = "https://ai-resume-backend-ro92.onrender.com";

function App() {
  const [token, setToken] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // ======================
  // LOGIN / SIGNUP
  // ======================
  const handleSignup = async () => {
    const res = await fetch(`${API_URL}/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) return alert(data.error);

    alert("Signup successful ✅");
  };

  const handleLogin = async () => {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) return alert(data.error);

    setToken(data.token);
    localStorage.setItem("token", data.token);
  };

  const logout = () => {
    setToken(null);
    localStorage.clear();
    setResult(null);
  };

  // ======================
  // ANALYZE
  // ======================
  const handleSubmit = async () => {
    if (!file || !jobDescription) {
      return alert("Upload resume + job description");
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("resume", file);
    formData.append("jobDescription", jobDescription);

    const res = await fetch(`${API_URL}/analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  // ======================
  // LOGIN UI
  // ======================
  if (!token) {
    return (
      <div className="app">
        <div className="card login-card">
          <h1>🚀 Login</h1>

          <input
            className="input"
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="input"
            type="password"
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="primary-btn" onClick={handleLogin}>
            Login
          </button>

          <button className="secondary-btn" onClick={handleSignup}>
            Signup
          </button>
        </div>
      </div>
    );
  }

  // ======================
  // MAIN UI
  // ======================
  return (
    <div className="app">
      <div className="card">

        <h1>🚀 AI Resume Analyzer</h1>

        <label className="file-label">
          {file ? file.name : "Upload Resume"}
          <input
            type="file"
            hidden
            onChange={(e) => setFile(e.target.files[0])}
          />
        </label>

        <textarea
          placeholder="Paste Job Description..."
          onChange={(e) => setJobDescription(e.target.value)}
        />

        <button className="primary-btn" onClick={handleSubmit}>
          {loading ? "Analyzing..." : "Analyze Resume"}
        </button>

        {/* ================= RESULT ================= */}
        {result && (
          <div className="result-card">

            <h2>Match Score: {result.matchScore}%</h2>

            <p><b>Analysis:</b> {result.reasoning}</p>

            <h3>💪 Strengths</h3>
            <ul>
              {result.strengths?.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>

            <h3>⚠️ Missing Skills</h3>
            <ul>
              {result.missingSkills?.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>

            <h3>🚀 Suggestions</h3>
            <ul>
              {result.improvementSuggestions?.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>

            <h3>📄 Improved Summary</h3>
            <p>{result.finalSummary}</p>

          </div>
        )}

        <button className="logout-btn" onClick={logout}>
          Logout
        </button>

      </div>
    </div>
  );
}

export default App;