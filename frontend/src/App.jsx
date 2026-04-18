import { useState, useEffect } from "react";
import "./App.css";

const API_URL = "https://ai-resume-backend-ro92.onrender.com";

function App() {
  const [token, setToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // ======================
  // VERIFY TOKEN (FIXED 🔥)
  // ======================
  useEffect(() => {
    const storedToken = localStorage.getItem("token");

    if (!storedToken) {
      setAuthLoading(false);
      return;
    }

    fetch(`${API_URL}/ping`, {
      headers: {
        Authorization: `Bearer ${storedToken}`,
      },
    })
      .then((res) => {
        if (res.ok) {
          setToken(storedToken);
        } else {
          localStorage.removeItem("token");
        }
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  // ======================
  // SIGNUP
  // ======================
  const handleSignup = async () => {
    if (!email || !password) {
      return alert("Enter email & password");
    }

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

  // ======================
  // LOGIN
  // ======================
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      return alert("Enter email & password");
    }

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return alert(data.error || "Login failed");
      }

      if (!data.token) {
        return alert("Invalid server response");
      }

      localStorage.setItem("token", data.token);
      setToken(data.token);

    } catch {
      alert("Server error");
    }
  };

  // ======================
  // LOGOUT
  // ======================
  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
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

    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        return alert(data.error || "Analyze failed");
      }

      setResult(data);

    } catch {
      alert("Server error");
    }

    setLoading(false);
  };

  // ======================
  // LOADING SCREEN
  // ======================
  if (authLoading) {
    return <h2 style={{ textAlign: "center" }}>Checking session...</h2>;
  }

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
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />

        <button className="primary-btn" onClick={handleSubmit}>
          {loading ? "Analyzing..." : "Analyze Resume"}
        </button>

        {result && (
          <div className="result-card">

            <h2>{result.matchScore}% Match</h2>

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