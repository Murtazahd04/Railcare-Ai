const mongoose = require("mongoose");

const classifierConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "passenger" },
    passengerMode: {
      type: String,
      enum: ["auto", "python", "node", "dual"],
      default: "auto",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClassifierConfig", classifierConfigSchema);
