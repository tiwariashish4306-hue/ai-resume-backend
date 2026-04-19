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
// AUTH (STRICT)
// ======================
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token" });
  }

  try {
    const token = header.split(" ")[1];

    if (!token || token === "undefined" || token === "null") {
      return res.status(401).json({ error: "Invalid token" });
    }

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

// 🔐 TOKEN VERIFY
app.get("/ping", auth, (req, res) => {
  res.json({ status: "valid" });
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
// LOGIN (NO BYPASS)
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
// ANALYZE (PROTECTED)
// ======================
app.post("/analyze", auth, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Resume required" });

    const jobDescription = req.body.jobDescription;
    if (!jobDescription) return res.status(400).json({ error: "JD required" });

    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text.slice(0, 4000);

    // ======================
    // 1. BASIC NLP HELPERS
    // ======================
    const STOPWORDS = new Set([
      "the","and","for","with","that","this","have","has","you","your","from","are","was","were","will","can","all","any","our","their","they","them","use","using","used","into","over","more","than","such","etc","via","per","based"
    ]);

    const normalize = (txt) =>
      txt
        .toLowerCase()
        .replace(/[^a-z0-9+.#\s]/g, " ")
        .split(/\s+/)
        .filter(w => w && w.length > 2 && !STOPWORDS.has(w));

    // Common tech keywords (extend anytime)
    const TECH = [
      "javascript","typescript","node","express","react","next","redux",
      "mongodb","mysql","postgres","sql","nosql",
      "html","css","tailwind","bootstrap",
      "api","rest","graphql","jwt","auth","authentication",
      "aws","docker","kubernetes","ci","cd",
      "python","java","c++","golang","rust",
      "machine","learning","ai","nlp","data","analysis",
      "git","github","oop","dsa","algorithms"
    ];

    const extractSkills = (words) => {
      const set = new Set();
      words.forEach(w => {
        if (TECH.includes(w)) set.add(w);
      });
      return Array.from(set);
    };

    const resumeWords = normalize(resumeText);
    const jdWords = normalize(jobDescription);

    const resumeSkills = extractSkills(resumeWords);
    const jdSkills = extractSkills(jdWords);

    // ======================
    // 2. DETERMINISTIC SCORING
    // ======================
    const intersection = jdSkills.filter(s => resumeSkills.includes(s));
    const missing = jdSkills.filter(s => !resumeSkills.includes(s));

    // Coverage score
    const coverage = jdSkills.length
      ? intersection.length / jdSkills.length
      : 0.3;

    // Keyword density (rough signal)
    const keywordHits = resumeWords.filter(w => jdWords.includes(w)).length;
    const density = Math.min(1, keywordHits / (jdWords.length || 50));

    // Final score (weighted)
    let score =
      Math.round((coverage * 0.7 + density * 0.3) * 100);

    // Clamp realistic band
    if (score < 20) score = 20;
    if (score > 95) score = 95;

    // ======================
    // 3. LLM FOR EXPLANATION ONLY
    // ======================
    let aiText = null;

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: `
You are an ATS expert.

Do NOT change the score.
Write clear analysis based on:
- matched skills
- missing skills
- resume vs JD alignment

Return ONLY JSON.
`
          },
          {
            role: "user",
            content: `
Score: ${score}

Matched Skills:
${intersection.join(", ")}

Missing Skills:
${missing.join(", ")}

Resume:
${resumeText}

Job Description:
${jobDescription}

FORMAT:
{
 "reasoning": "4-5 lines",
 "strengths": ["3-5 points"],
 "missingSkills": ["3-5 points"],
 "improvementSuggestions": ["3-5 points"],
 "finalSummary": "improved summary"
}
`
          }
        ]
      });

      let raw = completion.choices[0].message.content;
      raw = raw.replace(/```json|```/g, "").trim();

      aiText = JSON.parse(raw);

    } catch (err) {
      console.log("AI ERROR:", err.message);
    }

    // ======================
    // 4. FINAL RESPONSE
    // ======================
    const finalResult = {
      matchScore: score,
      reasoning: aiText?.reasoning || "Based on skill overlap and keyword matching.",
      strengths: aiText?.strengths || intersection.slice(0, 5),
      missingSkills: aiText?.missingSkills || missing.slice(0, 5),
      improvementSuggestions:
        aiText?.improvementSuggestions || [
          "Add missing skills from job description",
          "Improve project descriptions",
          "Use ATS-friendly keywords"
        ],
      finalSummary:
        aiText?.finalSummary || "Resume can be improved by aligning with JD."
    };

    await Analysis.create({
      userId: req.user.id,
      resumeText,
      jobDescription,
      ...finalResult,
    });

    res.json(finalResult);

  } catch (err) {
    console.log("SERVER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log("Server running"));
  })
  .catch(console.log);