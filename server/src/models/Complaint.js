const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    passengerName: { type: String, required: true },
    pnr: { type: String, required: true, index: true },
    trainNumber: { type: String },
    coach: { type: String },
    berth: { type: Number },
    intent: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ["open", "in_progress", "resolved", "rejected"], default: "open" },
    staffReply: { type: String, trim: true, maxlength: 2000 },
    respondedBy: { type: String },
    respondedByRole: { type: String },
    respondedAt: { type: Date },
    source: { type: String, enum: ["ai_call", "executive_call", "manual"], default: "manual" },
    callId: { type: String },
    executiveName: { type: String },
    // --- CPGRAMS-style escalation ladder ---
    // 0 = with the agent/executive, 1 = escalated to supervisor,
    // 2 = escalated to divisional officer (the top rung before CPGRAMS itself).
    escalationLevel: { type: Number, min: 0, max: 2, default: 0 },
    escalatedAt: { type: Date },
    escalationHistory: [
      {
        level: Number,
        reason: { type: String, enum: ["auto_timeout", "manual"], default: "auto_timeout" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);

/**
 * Finds a still-open complaint for the same PNR + intent filed recently —
 * used to warn "this looks like it was already reported" instead of
 * silently creating a duplicate that just adds noise to the queue.
 */
module.exports.findRecentDuplicate = async function findRecentDuplicate(pnr, intent, withinHours = 24) {
  const Complaint = mongoose.model("Complaint");
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  return Complaint.findOne({
    pnr,
    intent,
    status: { $in: ["open", "in_progress"] },
    createdAt: { $gte: since },
  }).sort({ createdAt: -1 });
};
