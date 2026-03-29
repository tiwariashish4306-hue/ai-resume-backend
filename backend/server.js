require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Groq = require("groq-sdk");
const mongoose = require("mongoose");

const app = express();
const PORT = 5000;

// ======================
// MongoDB Connect
// ======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err.message));

// ======================
// Schema
// ======================
const analysisSchema = new mongoose.Schema({
  resumeText: String,
  jobDescription: String,
  matchScore: Number,
  reasoning: String,
  strengths: [String],
  missingSkills: [String],
  matchedSkills: [String],
  improvementSuggestions: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Analysis = mongoose.model("Analysis", analysisSchema);

// ======================
// Groq Setup
// ======================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ======================
// Middleware
// ======================
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// ======================
// Routes
// ======================

app.get("/", (req, res) => {
  res.send("Server running...");
});

// 🔥 Analyze Route
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Resume required" });
    }

    let jobDescription = req.body.jobDescription;
    if (!jobDescription) {
      return res.status(400).json({ error: "Job description required" });
    }

    // ✅ Clean JD
    jobDescription = jobDescription
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);

    // ======================
    // PDF Parse + Clean
    // ======================
    let resumeText = "";
    try {
      const pdfData = await pdfParse(req.file.buffer);

      resumeText = pdfData.text
        .replace(/\s+/g, " ")
        .replace(/[^a-zA-Z0-9.,\n ]/g, "")
        .trim()
        .slice(0, 3000);
    } catch {
      return res.status(400).json({ error: "Invalid PDF file" });
    }

    // ======================
    // 🔥 SKILL MATCH LOGIC
    // ======================
    const skillKeywords = [
      "javascript", "react", "node", "express", "mongodb",
      "java", "spring", "mysql", "api", "backend"
    ];

    const resumeLower = resumeText.toLowerCase();
    const jdLower = jobDescription.toLowerCase();

    const matchedSkills = skillKeywords.filter(skill =>
      resumeLower.includes(skill) && jdLower.includes(skill)
    );

    const skillScore = (matchedSkills.length / skillKeywords.length) * 50;

    // ======================
    // 🔥 AI CALL
    // ======================
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `
You are a strict ATS recruiter.

Rules:
- NEVER guess
- ONLY use actual resume content
- Penalize missing skills

Return ONLY JSON:

{
  "matchScore": number,
  "reasoning": "Resume Skills = X, Job Needs = Y → explain match",
  "strengths": [],
  "missingSkills": [],
  "improvementSuggestions": []
}
          `,
        },
        {
          role: "user",
          content: `
Compare strictly:

Resume:
${resumeText}

Job Description:
${jobDescription}
          `,
        },
      ],
    });

    const aiText = completion.choices[0].message.content;

    // ======================
    // SAFE JSON PARSE
    // ======================
    let parsed;
    try {
      const jsonStart = aiText.indexOf("{");
      const jsonEnd = aiText.lastIndexOf("}");
      const cleanJson = aiText.substring(jsonStart, jsonEnd + 1);
      parsed = JSON.parse(cleanJson);
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    // ======================
    // 🔥 HYBRID SCORING
    // ======================
    let finalScore = Math.round((parsed.matchScore * 0.5) + skillScore);

    // Prevent over-scoring
    if (matchedSkills.length <= 2) {
      finalScore = Math.min(finalScore, 50);
    }

    finalScore = Math.min(100, Math.max(0, finalScore));

    parsed.matchScore = finalScore;
    parsed.matchedSkills = matchedSkills;

    // ======================
    // SAVE
    // ======================
    await Analysis.create({
      resumeText,
      jobDescription,
      ...parsed,
    });

    res.json(parsed);

  } catch (error) {
    console.error("ERROR:", error.message);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// ======================
// HISTORY
// ======================
app.get("/history", async (req, res) => {
  try {
    const data = await Analysis.find()
      .select("-resumeText")
      .sort({ createdAt: -1 });

    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ======================
// START SERVER
// ======================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});