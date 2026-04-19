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

// PUBLIC PING
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

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ token });

  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// ======================
// ANALYZE (FINAL)
// ======================
app.post("/analyze", auth, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Resume required" });
    if (!req.body.jobDescription)
      return res.status(400).json({ error: "JD required" });

    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text.slice(0, 4000);
    const jobDescription = req.body.jobDescription;

    // ======================
    // CLEAN TEXT
    // ======================
    const clean = (txt) =>
      txt.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ");

    const resume = clean(resumeText);
    const jd = clean(jobDescription);

    // ======================
    // SKILLS
    // ======================
    const SKILLS = [
      "javascript","typescript","node","express","react","next","redux",
      "mongodb","mysql","postgres","sql","nosql",
      "html","css","tailwind","bootstrap",
      "api","rest","graphql","jwt","authentication",
      "aws","docker","kubernetes","ci","cd",
      "python","java","c++","golang","rust",
      "machine","learning","ai","nlp","data","analysis",
      "git","github","oop","dsa","algorithms"
    ];

    const extract = (text) =>
      SKILLS.filter(skill => text.includes(skill));

    const resumeSkills = extract(resume);
    const jdSkills = extract(jd);

    const matched = jdSkills.filter(s => resumeSkills.includes(s));
    const missing = jdSkills.filter(s => !resumeSkills.includes(s));

    // ======================
    // ATS SCORE (DETERMINISTIC)
    // ======================
    let score = 0;
    if (jdSkills.length > 0) {
      score = Math.round((matched.length / jdSkills.length) * 100);
    }

    if (score < 15) score = 15;
    if (score > 92) score = 92;

    // ======================
    // AI ANALYSIS
    // ======================
    let ai = null;

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content: `
You are a professional ATS analyzer.

DO NOT change score.

Return ONLY JSON.
`
          },
          {
            role: "user",
            content: `
Score: ${score}

Matched Skills:
${matched.join(", ")}

Missing Skills:
${missing.join(", ")}

Resume:
${resumeText}

Job:
${jobDescription}

FORMAT:
{
  "reasoning": "",
  "strengths": [],
  "missingSkills": [],
  "improvementSuggestions": [],
  "finalSummary": ""
}
`
          }
        ]
      });

      let raw = completion.choices[0].message.content;
      raw = raw.replace(/```json|```/g, "").trim();

      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");

      if (start !== -1 && end !== -1) {
        ai = JSON.parse(raw.substring(start, end + 1));
      }

    } catch (err) {
      console.log("AI ERROR:", err.message);
    }

    const result = {
      matchScore: score,
      reasoning:
        ai?.reasoning ||
        "Score based on skill alignment between resume and job description.",
      strengths: ai?.strengths || matched,
      missingSkills: ai?.missingSkills || missing,
      improvementSuggestions:
        ai?.improvementSuggestions || ["Improve skill alignment"],
      finalSummary:
        ai?.finalSummary || "Enhance resume based on job description."
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