const mongoose = require("mongoose");

const interestListSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("InterestList", interestListSchema);
