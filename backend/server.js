require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Groq = require("groq-sdk");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;

// ======================
// Middleware
// ======================
app.use(cors({ origin: "*" }));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ======================
// USER MODEL
// ======================
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
});

const User = mongoose.model("User", userSchema);

// ======================
// ANALYSIS MODEL
// ======================
const analysisSchema = new mongoose.Schema({
  userId: String, // 🔥 IMPORTANT
  resumeText: String,
  jobDescription: String,
  matchScore: Number,
  reasoning: String,
  strengths: [String],
  missingSkills: [String],
  matchedSkills: [String],
  improvementSuggestions: [String],
  createdAt: { type: Date, default: Date.now },
});

const Analysis = mongoose.model("Analysis", analysisSchema);

// ======================
// AUTH MIDDLEWARE
// ======================
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token" });

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
// GROQ
// ======================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ======================
// AUTH ROUTES
// ======================
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "User exists" });

  const hashed = await bcrypt.hash(password, 10);
  await User.create({ email, password: hashed });

  res.json({ message: "Signup success" });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

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
});

// ======================
// HEALTH
// ======================
app.get("/", (req, res) => res.send("Server running"));
app.get("/ping", (req, res) => res.json({ status: "alive" }));

// ======================
// HELPER
// ======================
function extractSkills(text) {
  const skills = [
    "javascript", "react", "node", "express", "mongodb",
    "python", "java", "mysql", "html", "css",
    "data structures", "algorithms", "api",
    "backend", "frontend"
  ];

  const lower = text.toLowerCase();
  return skills.filter(skill => lower.includes(skill));
}

// ======================
// ANALYZE (PROTECTED)
// ======================
app.post("/analyze", auth, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Resume required" });

    let jobDescription = req.body.jobDescription;
    if (!jobDescription) return res.status(400).json({ error: "JD required" });

    let resumeText = "";

    try {
      const pdfData = await pdfParse(req.file.buffer);
      resumeText = pdfData.text.trim();
    } catch {
      return res.status(400).json({
        error: "Use proper PDF (not scanned)",
      });
    }

    if (!resumeText || resumeText.length < 50) {
      return res.status(400).json({
        error: "Resume not readable",
      });
    }

    const resumeSkills = extractSkills(resumeText);
    const jdSkills = extractSkills(jobDescription);

    const matchedSkills = resumeSkills.filter(s =>
      jdSkills.includes(s)
    );

    const skillScore = Math.round(
      (matchedSkills.length / (jdSkills.length || 1)) * 40
    );

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `Return JSON:
{
"matchScore": number,
"reasoning": "",
"strengths": [],
"missingSkills": [],
"improvementSuggestions": []
}`,
        },
        {
          role: "user",
          content: `Resume: ${resumeText}
Job: ${jobDescription}`,
        },
      ],
    });

    const text = completion.choices[0].message.content;
    const parsed = JSON.parse(
      text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)
    );

    let finalScore = Math.round(
      (parsed.matchScore * 0.6) + skillScore
    );

    finalScore = Math.min(100, Math.max(10, finalScore));

    parsed.matchScore = finalScore;
    parsed.matchedSkills = matchedSkills;

    await Analysis.create({
      userId: req.user.id, // 🔥 USER LINKED
      resumeText,
      jobDescription,
      ...parsed,
    });

    res.json(parsed);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ======================
// HISTORY (PROTECTED)
// ======================
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");

// ======================
// AUTH ROUTES
// ======================

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashed,
    });

    res.json({ message: "Signup successful" });

  } catch (err) {
    res.status(500).json({ error: "Signup failed" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Wrong password" });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});
app.get("/history", auth, async (req, res) => {
  const data = await Analysis.find({ userId: req.user.id })
    .select("-resumeText")
    .sort({ createdAt: -1 });

  res.json(data);
});

// ======================
// START
// ======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, "0.0.0.0", () =>
      console.log("Server running on", PORT)
    );
  })
  .catch(console.log);
  // --- IGNORE ---