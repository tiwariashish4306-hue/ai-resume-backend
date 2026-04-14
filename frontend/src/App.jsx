import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const API_URL = "https://ai-resume-backend-ro92.onrender.com";

  // 🔥 Load history on start
  useEffect(() => {
    fetch(`${API_URL}/history`)
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
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResult(data);

      // 🔥 Refresh history
      const historyRes = await fetch(`${API_URL}/history`);
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
          <div className="result-card">

            {/* MATCH SCORE */}
            <div className="score-box">
              <div
                className="score"
                style={{
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
              <p>Match Score</p>
            </div>

            {/* Reasoning */}
            <div>
              <h3>🧠 Reasoning</h3>
              <p>{result.reasoning}</p>
            </div>

            {/* Strengths */}
            <div>
              <h3>✅ Strengths</h3>
              <ul>
                {result.strengths?.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            {/* Missing Skills */}
            <div>
              <h3>❌ Missing Skills</h3>
              <ul>
                {result.missingSkills?.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>

            {/* Improvements */}
            <div>
              <h3>🚀 Improvement Suggestions</h3>
              <ul>
                {result.improvementSuggestions?.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

          </div>
        )}

        {/* HISTORY */}
        {history.length > 0 && (
          <div className="history-card">
            <h3>📜 Previous Analyses</h3>

            {history.map((item, i) => (
              <div key={i} className="history-item">
                <p><strong>Score:</strong> {item.matchScore}%</p>
                <p>
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