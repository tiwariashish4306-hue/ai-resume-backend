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
// ✅ MongoDB Connect
// ======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err.message));

// 🔎 DEBUG
console.log("GROQ KEY LOADED:", process.env.GROQ_API_KEY ? "YES" : "NO");

// ======================
// ✅ Schema & Model
// ======================
const analysisSchema = new mongoose.Schema({
  resumeText: String,
  jobDescription: String,
  matchScore: Number,
  reasoning: String,
  strengths: [String],
  missingSkills: [String],
  improvementSuggestions: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Analysis = mongoose.model("Analysis", analysisSchema);

// ======================
// ✅ Groq Setup
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

    const jobDescription = req.body.jobDescription;
    if (!jobDescription) {
      return res.status(400).json({ error: "Job description required" });
    }

    // ✅ PDF Parse
    let resumeText = "";
    try {
      const pdfData = await pdfParse(req.file.buffer);
      resumeText = pdfData.text;
    } catch {
      return res.status(400).json({ error: "Invalid PDF file" });
    }

    // 🔥 AI Call
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
You are an ATS resume analyzer.

Return ONLY valid JSON:

{
  "matchScore": percentage from 0 to 100,
  "reasoning": "Detailed explanation",
  "strengths": [],
  "missingSkills": [],
  "improvementSuggestions": []
}

Scoring rules:
- 90-100 = excellent match
- 70-89 = strong match
- 50-69 = average match
- below 50 = poor match
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

    // ✅ Safe JSON parse
    let parsed;
    try {
      const jsonStart = aiText.indexOf("{");
      const jsonEnd = aiText.lastIndexOf("}");
      const cleanJson = aiText.substring(jsonStart, jsonEnd + 1);
      parsed = JSON.parse(cleanJson);
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    // ✅ Normalize score (fix 0.7 → 70)
    if (parsed.matchScore <= 1) {
      parsed.matchScore = Math.round(parsed.matchScore * 100);
    }

    parsed.matchScore = Math.min(100, Math.max(0, parsed.matchScore));

    // ======================
    // ✅ SAVE
    // ======================
    await Analysis.create({
      resumeText,
      jobDescription,
      ...parsed,
    });

    // ✅ Response
    res.json(parsed);

  } catch (error) {
    console.error("ERROR:", error.message);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// 🔥 History Route (CLEAN)
app.get("/history", async (req, res) => {
  try {
    const data = await Analysis.find()
      .select("-resumeText") // remove heavy text
      .sort({ createdAt: -1 });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ======================
// Start Server
// ======================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});