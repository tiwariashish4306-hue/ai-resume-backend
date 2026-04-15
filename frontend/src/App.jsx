import { useState, useEffect } from "react";
import "./App.css";

const API_URL = "https://ai-resume-backend-ro92.onrender.com";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // LOAD HISTORY
  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/history`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => setHistory(data))
      .catch(() => {});
  }, [token]);

  // AUTH
  const handleSignup = async () => {
    try {
      const res = await fetch(`${API_URL}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("Signup successful ✅");
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem("token", data.token);
      setToken(data.token);

      alert("Login successful 🚀");
    } catch (err) {
      alert(err.message);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setHistory([]);
    setResult(null);
  };

  // ANALYZE
  const handleSubmit = async () => {
    if (!file || !jobDescription) {
      alert("Upload resume and paste job description");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("resume", file);
    formData.append("jobDescription", jobDescription);

    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResult(data);

      const historyRes = await fetch(`${API_URL}/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const historyData = await historyRes.json();
      setHistory(historyData);

    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  };

  // LOGIN UI
  if (!token) {
    return (
      <div className="app">
        <div className="card login-card">
          <h1>🚀 Welcome</h1>

          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="primary-btn" onClick={handleLogin}>
            Login
          </button>

          <button className="secondary-btn" onClick={handleSignup}>
            Create Account
          </button>
        </div>
      </div>
    );
  }

  // MAIN APP
  return (
    <div className="app">
      <div className="card">

        {/* ✅ TITLE TOP */}
        <h1 style={{ textAlign: "center", marginBottom: "20px" }}>
          🚀 AI Resume Analyzer
        </h1>

        <label className="file-label">
          {file ? file.name : "Upload Resume"}
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            hidden
          />
        </label>

        <textarea
          placeholder="Paste Job Description..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />

        <button className="primary-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze Resume"}
        </button>

        {error && <p className="error">{error}</p>}

        {result && (
          <div className="result-card">
            <h2>{result.matchScore}% Match</h2>
            <p>{result.reasoning}</p>
          </div>
        )}

        <div className="history-card">
          <h3>📜 History</h3>

          {history.length === 0 && <p>No history yet</p>}

          {history.map((item, i) => (
            <div key={i} className="history-item">
              <strong>{item.matchScore}%</strong> —{" "}
              {item.jobDescription.slice(0, 60)}...
            </div>
          ))}
        </div>

        {/* ✅ LOGOUT BOTTOM */}
        <button
          className="logout-btn"
          onClick={logout}
          style={{ marginTop: "30px", width: "100%" }}
        >
          Logout
        </button>

      </div>
    </div>
  );
}

export default App;