const express = require("express");
const { z } = require("zod");
const Complaint = require("../models/Complaint");
const Passenger = require("../models/Passenger");
const { listWithQuery } = require("../utils/listQuery");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const { complaintCreateSchema } = require("../utils/schemas");
const { sendWhatsAppMessage } = require("../utils/whatsapp");
const { sendEmail } = require("../utils/email");
const { escalateComplaint, LEVEL_LABELS } = require("../utils/escalation");

const router = express.Router();
const supportStaff = ["executive", "supervisor", "admin", "super_admin"];
const supportResponseSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "rejected"]),
  staffReply: z.string().trim().min(1).max(2000),
});

function timeAgo(date) {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

router.get("/", requireAuth, async (req, res) => {
  const result = await listWithQuery(Complaint, req, ["passengerName", "pnr", "intent"]);
  res.json(result);
});

router.get("/queue", requireAuth, requireRole(...supportStaff), async (_req, res) => {
  const complaints = await Complaint.find({ status: { $in: ["open", "in_progress"] } })
    .sort({ createdAt: 1 })
    .limit(100);
  res.json(complaints);
});

/**
 * Escalation ladder summary for the Analytics Dashboard — counts per level
 * plus the actual list of currently-open complaints sitting at level 1/2,
 * so a supervisor can see what needs attention without paging through everything.
 */
router.get("/escalations/summary", requireAuth, async (req, res) => {
  const openFilter = { status: { $in: ["open", "in_progress"] } };
  const [level0, level1, level2, escalated, withAgent] = await Promise.all([
    Complaint.countDocuments({ ...openFilter, escalationLevel: 0 }),
    Complaint.countDocuments({ ...openFilter, escalationLevel: 1 }),
    Complaint.countDocuments({ ...openFilter, escalationLevel: 2 }),
    Complaint.find({ ...openFilter, escalationLevel: { $gt: 0 } }).sort({ escalationLevel: -1, escalatedAt: 1 }).limit(20),
    Complaint.find({ ...openFilter, escalationLevel: 0 }).sort({ createdAt: 1 }).limit(10),
  ]);
  res.json({ level0, level1, level2, escalated, withAgent });
});

router.get("/:id", requireAuth, async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
});

router.post("/", requireAuth, validateBody(complaintCreateSchema), async (req, res) => {
  if (!req.body.force) {
    const dup = await Complaint.findRecentDuplicate(req.body.pnr, req.body.intent);
    if (dup) {
      return res.status(409).json({
        duplicate: true,
        message: `${dup.passengerName} already has an open complaint for "${dup.intent}" filed ${timeAgo(dup.createdAt)}.`,
        existing: dup,
      });
    }
  }

  const c = await Complaint.create(req.body);

  // confirm the reference number over WhatsApp the moment it's filed —
  // separate from the "resolved" notification below, this is the
  // "yes, we got it" receipt passengers expect immediately.
  const passenger = await Passenger.findOne({ pnr: c.pnr });
  if (passenger?.mobile) {
    sendWhatsAppMessage(
      passenger.mobile,
      `Hi ${passenger.name}, we've registered your complaint "${c.intent}" — reference #${c._id.toString().slice(-6).toUpperCase()} (PNR ${c.pnr}). We'll keep you posted. — Indian Railways`
    ).catch(() => {});
  }
  if (passenger?.email) {
    sendEmail(
      passenger.email,
      `We've registered your complaint — PNR ${c.pnr}`,
      `Hi ${passenger.name},\n\nWe've registered your complaint "${c.intent}" — reference #${c._id.toString().slice(-6).toUpperCase()} (PNR ${c.pnr}). We'll keep you posted.\n\n— Indian Railways`
    ).catch(() => {});
  }

  res.status(201).json(c);
});

router.patch("/:id", requireAuth, requireRole(...supportStaff), validateBody(supportResponseSchema), async (req, res) => {
  const previous = await Complaint.findById(req.params.id);
  if (!previous) return res.status(404).json({ error: "Not found" });

  const c = await Complaint.findByIdAndUpdate(req.params.id, {
    status: req.body.status,
    staffReply: req.body.staffReply,
    respondedBy: req.user.name,
    respondedByRole: req.user.role,
    respondedAt: new Date(),
  }, { new: true, runValidators: true });

  // notify the passenger over WhatsApp the moment their complaint flips to resolved
  // (no-ops gracefully if Twilio isn't configured — see utils/whatsapp.js)
  if (previous.status !== "resolved" && c.status === "resolved") {
    const passenger = await Passenger.findOne({ pnr: c.pnr });
    if (passenger?.mobile) {
      sendWhatsAppMessage(
        passenger.mobile,
        `Hi ${passenger.name}, your complaint "${c.intent}" (PNR ${c.pnr}) has been resolved. Thank you for your patience. — Indian Railways`
      ).catch(() => {}); // fire-and-forget; a failed notification shouldn't fail the status update
    }
    if (passenger?.email) {
      sendEmail(
        passenger.email,
        `Your complaint has been resolved — PNR ${c.pnr}`,
        `Hi ${passenger.name},\n\nYour complaint "${c.intent}" (PNR ${c.pnr}) has been resolved. Thank you for your patience.\n\n— Indian Railways`
      ).catch(() => {});
    }
  }

  res.json(c);
});

/**
 * Manual "escalate now" — for genuinely urgent complaints that shouldn't
 * wait for the automatic timeout sweep (utils/escalation.js), and handy for
 * demoing the escalation ladder without waiting real hours.
 */
router.post("/:id/escalate", requireAuth, async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) return res.status(404).json({ error: "Not found" });
  if (complaint.escalationLevel >= 2) {
    return res.status(400).json({ error: `Already at the highest level (${LEVEL_LABELS[2]})` });
  }
  const updated = await escalateComplaint(complaint, "manual");
  res.json(updated);
});

module.exports = router;
