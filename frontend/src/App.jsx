import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 🔥 Load history on start
  useEffect(() => {
    fetch("http://localhost:5000/history")
      .then((res) => res.json())
      .then((data) => setHistory(data))
      .catch(() => {});
  }, []);

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
      const response = await fetch("http://localhost:5000/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResult(data);

      // 🔥 Refresh history after new analysis
      const historyRes = await fetch("http://localhost:5000/history");
      const historyData = await historyRes.json();
      setHistory(historyData);

    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  };

  return (
    <div className="app">
      <div className="card">

        <h1 style={{ fontSize: "28px", fontWeight: "bold" }}>
          AI Resume Analyzer
        </h1>

        <h2 style={{ marginTop: "10px", color: "#555" }}>
          AI Resume Analysis Report
        </h2>

        {/* Upload */}
        <label className="file-label">
          {file ? file.name : "Click to Upload Resume"}
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            hidden
          />
        </label>

        {/* Job Description */}
        <textarea
          placeholder="Paste Job Description..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />

        {/* Button */}
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze Resume"}
        </button>

        {error && <p className="error">{error}</p>}

        {/* RESULT */}
        {result && (
          <div
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "15px",
              marginTop: "20px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.1)"
            }}
          >

            {/* 🔥 MATCH SCORE */}
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div
                style={{
                  fontSize: "48px",
                  fontWeight: "bold",
                  color:
                    result.matchScore > 70
                      ? "green"
                      : result.matchScore > 40
                      ? "orange"
                      : "red",
                }}
              >
                {result.matchScore}%
              </div>
              <p style={{ fontSize: "18px" }}>Match Score</p>
            </div>

            {/* 🧠 Reasoning */}
            <div style={{ marginTop: "20px" }}>
              <h3>🧠 Reasoning</h3>
              <p>{result.reasoning}</p>
            </div>

            {/* ✅ Strengths */}
            <div style={{ marginTop: "20px" }}>
              <h3>✅ Strengths</h3>
              <ul>
                {result.strengths?.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            {/* ❌ Missing Skills */}
            <div style={{ marginTop: "20px" }}>
              <h3>❌ Missing Skills</h3>
              <ul>
                {result.missingSkills?.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>

            {/* 🚀 Improvements */}
            <div style={{ marginTop: "20px" }}>
              <h3>🚀 Improvement Suggestions</h3>
              <ul>
                {result.improvementSuggestions?.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

          </div>
        )}

        {/* 📜 HISTORY */}
        {history.length > 0 && (
          <div
            style={{
              marginTop: "30px",
              background: "white",
              padding: "20px",
              borderRadius: "15px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.1)"
            }}
          >
            <h3>📜 Previous Analyses</h3>

            {history.map((item, i) => (
              <div
                key={i}
                style={{
                  borderBottom: "1px solid #ddd",
                  padding: "10px 0"
                }}
              >
                <p><strong>Score:</strong> {item.matchScore}%</p>
                <p style={{ fontSize: "14px", color: "#555" }}>
                  {item.jobDescription?.slice(0, 80)}...
                </p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;