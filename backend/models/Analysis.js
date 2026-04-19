const mongoose = require("mongoose");

const analysisSchema = new mongoose.Schema(
  {
    resumeText: String,
    jobDescription: String,
    matchScore: Number,
    reasoning: String,
    strengths: [String],
    missingSkills: [String],
    improvementSuggestions: [String],
    finalSummary: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Analysis", analysisSchema);