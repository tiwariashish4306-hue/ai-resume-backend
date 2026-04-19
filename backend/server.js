require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// ======================
// MODELS
// ======================
const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
}));

const Analysis = mongoose.model("Analysis", new mongoose.Schema({
  userId: String,
  resumeText: String,
  jobDescription: String,
  matchScore: Number,
  reasoning: String,
  strengths: [String],
  missingSkills: [String],
  improvementSuggestions: [String],
  finalSummary: String,
  createdAt: { type: Date, default: Date.now },
}));

// ======================
// AUTH
// ======================
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token" });
  }

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ======================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ======================
// ROUTES
// ======================
app.get("/", (req, res) => res.send("Server running"));

// TOKEN VERIFY
app.get("/ping", auth, (req, res) => {
  res.json({ status: "valid" });
});

// ======================
// SIGNUP
// ======================
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email & password required" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ error: "User exists" });

    const hashed = await bcrypt.hash(password, 10);

    await User.create({ email, password: hashed });

    res.json({ message: "Signup success" });
  } catch {
    res.status(500).json({ error: "Signup failed" });
  }
});

// ======================
// LOGIN
// ======================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email & password required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// ======================
// ANALYZE (FINAL CLEAN)
// ======================
app.post("/analyze", auth, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Resume required" });

    const jobDescription = req.body.jobDescription;
    if (!jobDescription)
      return res.status(400).json({ error: "JD required" });

    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text.slice(0, 4000);

    // ======================
    // ATS SCORE LOGIC
    // ======================
    const clean = (t) =>
      t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/);

    const resumeWords = clean(resumeText);
    const jdWords = clean(jobDescription);

    const jdUnique = [...new Set(jdWords)];
    const matchWords = jdUnique.filter(w => resumeWords.includes(w));

    const coverage = matchWords.length / (jdUnique.length || 1);

    const freq = resumeWords.filter(w => jdWords.includes(w)).length;
    const density = Math.min(1, freq / 100);

    let score = Math.round((coverage * 0.7 + density * 0.3) * 100);

    if (score < 30) score = 30;
    if (score > 85) score = 85;

    // ======================
    // AI ANALYSIS
    // ======================
    let ai = null;

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content: `
Return ONLY valid JSON.

{
 "reasoning": "",
 "strengths": [],
 "missingSkills": [],
 "improvementSuggestions": [],
 "finalSummary": ""
}`
          },
          {
            role: "user",
            content: `
Job Description:
${jobDescription}

Resume:
${resumeText}

Give deep ATS analysis.
`
          }
        ]
      });

      let raw = completion.choices[0].message.content;
      raw = raw.replace(/```json|```/g, "").trim();

      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        ai = JSON.parse(match[0]);
      }

    } catch (err) {
      console.log("AI FAIL:", err.message);
    }

    const result = {
      matchScore: score,
      reasoning: ai?.reasoning || "Based on resume vs JD alignment.",
      strengths: ai?.strengths || matchWords.slice(0, 5),
      missingSkills: ai?.missingSkills || jdUnique.slice(0, 5),
      improvementSuggestions:
        ai?.improvementSuggestions || [
          "Add missing skills",
          "Improve projects",
          "Use better keywords"
        ],
      finalSummary:
        ai?.finalSummary || "Improve alignment with job role"
    };

    await Analysis.create({
      userId: req.user.id,
      resumeText,
      jobDescription,
      ...result
    });

    res.json(result);

  } catch (err) {
    console.log("SERVER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log("Server running"));
  })
  .catch(console.log);