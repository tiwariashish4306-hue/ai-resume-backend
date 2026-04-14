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

  // ======================
  // LOAD HISTORY (WITH TOKEN)
  // ======================
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

  // ======================
  // AUTH
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
    alert(data.message || data.error);
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

    if (data.token) {
      localStorage.setItem("token", data.token);
      setToken(data.token);
    } else {
      alert(data.error);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
  };

  // ======================
  // ANALYZE
  // ======================
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
          Authorization: `Bearer ${token}`, // 🔥 IMPORTANT
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResult(data);

      // refresh history
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

  // ======================
  // UI
  // ======================

  // 🔥 LOGIN SCREEN
  if (!token) {
    return (
      <div className="app">
        <div className="card">
          <h2>Login / Signup</h2>

          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button onClick={handleLogin}>Login</button>
          <button onClick={handleSignup}>Signup</button>
        </div>
      </div>
    );
  }

  // 🔥 MAIN APP
  return (
    <div className="app">
      <div className="card">

        <button onClick={logout}>Logout</button>

        <h1>AI Resume Analyzer</h1>

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

        <button onClick={handleSubmit} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>

        {error && <p className="error">{error}</p>}

        {result && (
          <div>
            <h2>{result.matchScore}% Match</h2>
            <p>{result.reasoning}</p>
          </div>
        )}

        <h3>History</h3>
        {history.map((item, i) => (
          <div key={i}>
            {item.matchScore}% - {item.jobDescription.slice(0, 50)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;