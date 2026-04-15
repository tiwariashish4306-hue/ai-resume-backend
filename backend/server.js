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
  matchedSkills: [String],
  improvementSuggestions: [String],
  createdAt: { type: Date, default: Date.now },
}));

// ======================
// AUTH
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
// ROUTES
// ======================
app.get("/", (req, res) => res.send("Server running"));
app.get("/ping", (req, res) => res.json({ status: "alive" }));

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "User exists" });

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ email, password: hashed });

    res.json({ message: "Signup success" });
  } catch {
    res.status(500).json({ error: "Signup failed" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// ======================
// ANALYZE (SAFE GROQ)
// ======================
app.post("/analyze", auth, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Resume required" });

    const jobDescription = req.body.jobDescription;
    if (!jobDescription) return res.status(400).json({ error: "JD required" });

    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text.slice(0, 3000);

    let aiResult = {
      matchScore: 60,
      reasoning: "Basic fallback analysis",
      strengths: [],
      missingSkills: [],
      improvementSuggestions: [],
    };

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `Return ONLY JSON:
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
            content: `Resume: ${resumeText}\nJob: ${jobDescription}`,
          },
        ],
      });

      const text = completion.choices[0].message.content;

      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");

      if (jsonStart !== -1 && jsonEnd !== -1) {
        const cleanJson = text.substring(jsonStart, jsonEnd + 1);
        aiResult = JSON.parse(cleanJson);
      }

    } catch (err) {
      console.log("AI fallback used");
    }

    await Analysis.create({
      userId: req.user.id,
      resumeText,
      jobDescription,
      ...aiResult,
    });

    res.json(aiResult);

  } catch (err) {
    console.log("SERVER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// HISTORY
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