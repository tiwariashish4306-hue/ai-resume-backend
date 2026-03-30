require("dotenv").config();


console.log("DEPLOY CHECK 🔥");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Groq = require("groq-sdk");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 5000;

// ======================
// Middleware
// ======================
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

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
// Routes
// ======================

app.get("/", (req, res) => {
  res.send("✅ Server running...");
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

    jobDescription = jobDescription
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);

    // ======================
    // PDF Parse
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
    // Skill Matching
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
    // AI CALL
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

Return ONLY JSON:
{
  "matchScore": number,
  "reasoning": "",
  "strengths": [],
  "missingSkills": [],
  "improvementSuggestions": []
}
          `,
        },
        {
          role: "user",
          content: `
Resume:
${resumeText}

Job Description:
${jobDescription}
          `,
        },
      ],
    });

    const aiText = completion.choices[0].message.content;

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
    // Final Score
    // ======================
    let finalScore = Math.round((parsed.matchScore * 0.5) + skillScore);

    if (matchedSkills.length <= 2) {
      finalScore = Math.min(finalScore, 50);
    }

    finalScore = Math.min(100, Math.max(0, finalScore));

    parsed.matchScore = finalScore;
    parsed.matchedSkills = matchedSkills;

    // ======================
    // Save to DB
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
// History
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
// START SERVER (IMPORTANT FIX)
// ======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("❌ MongoDB Error:", err.message);
  });