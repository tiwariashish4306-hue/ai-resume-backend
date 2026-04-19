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

    if (!decoded?.id) {
      return res.status(401).json({ error: "Invalid token" });
    }

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

// PUBLIC PING (IMPORTANT FIX)
app.get("/ping", (req, res) => {
  res.json({ status: "alive" });
});

// ======================
// SIGNUP
// ======================
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email & password required" });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "User exists" });

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

    if (!email || !password) {
      return res.status(400).json({ error: "Email & password required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid credentials" });

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
// ANALYZE (FINAL FIX)
// ======================
app.post("/analyze", auth, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Resume required" });

    const jobDescription = req.body.jobDescription;
    if (!jobDescription) return res.status(400).json({ error: "JD required" });

    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text.slice(0, 5000);

    let aiResult = null;

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content: `
You are a strict ATS system used by recruiters.

Rules:
- Do NOT inflate scores
- Penalize missing key skills heavily
- Evaluate relevance of experience, not just keywords
- Compare resume vs job description deeply

Return ONLY JSON:
{
 "matchScore": number,
 "analysis": "detailed comparison",
 "strengths": ["points"],
 "missingSkills": ["points"],
 "improvementSuggestions": ["points"],
 "finalSummary": "summary"
}
`
          },
          {
            role: "user",
            content: `
Resume:
${resumeText}

Job Description:
${jobDescription}
`
          }
        ],
      });

      let raw = completion.choices[0].message.content;

      raw = raw.replace(/```json|```/g, "").trim();

      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        aiResult = JSON.parse(match[0]);
      }

    } catch (err) {
      console.log("AI ERROR:", err.message);
    }

    const result = {
      matchScore: aiResult?.matchScore || 40,
      reasoning: aiResult?.analysis || "Analysis not available",
      strengths: aiResult?.strengths || [],
      missingSkills: aiResult?.missingSkills || [],
      improvementSuggestions: aiResult?.improvementSuggestions || [],
      finalSummary: aiResult?.finalSummary || "",
    };

    await Analysis.create({
      userId: req.user.id,
      resumeText,
      jobDescription,
      ...result,
    });

    res.json(result);

  } catch (err) {
    console.log("SERVER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================
// START
// ======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () =>
      console.log("Server running on", PORT)
    );
  })
  .catch(console.log);