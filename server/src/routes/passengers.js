const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Passenger = require("../models/Passenger");
const Complaint = require("../models/Complaint");
const Fine = require("../models/Fine");
const Call = require("../models/Call");
const Booking = require("../models/Booking");
const Ticket = require("../models/Ticket");
const { listWithQuery } = require("../utils/listQuery");
const { validateBody } = require("../middleware/validate");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendWhatsAppMessage } = require("../utils/whatsapp");
const { sendEmail } = require("../utils/email");

const router = express.Router();
const supportStaff = ["executive", "supervisor", "admin", "super_admin"];
const supportResponseSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "rejected"]),
  staffReply: z.string().trim().min(1).max(2000),
});

/**
 * Passenger Portal self-service routes — the logged-in passenger's own
 * data only (never someone else's), scoped by the passengerId/pnr baked
 * into their JWT at /auth/passenger-login. Must come before "/:id" below
 * or "me" would be parsed as an id.
 */
router.get("/me", requireAuth, requireRole("passenger"), async (req, res) => {
  const passenger = await Passenger.findById(req.user.passengerId);
  if (!passenger) return res.status(404).json({ error: "Not found" });
  res.json(passenger);
});

router.get("/me/bookings", requireAuth, requireRole("passenger"), async (req, res) => {
  const bookings = await Booking.find({ passengerId: req.user.passengerId }).sort({ journeyDate: 1 });
  res.json(bookings);
});

router.get("/me/history", requireAuth, requireRole("passenger"), async (req, res) => {
  const calls = await Call.find({ customerPnr: req.user.pnr }).sort({ createdAt: -1 }).limit(20);
  res.json(calls);
});

router.get("/me/complaints", requireAuth, requireRole("passenger"), async (req, res) => {
  const passenger = await Passenger.findById(req.user.passengerId);
  const bookings = await Booking.find({ passengerId: req.user.passengerId }).select("pnr");
  const pnrs = [passenger?.pnr, ...bookings.map((b) => b.pnr)].filter(Boolean);
  const complaints = await Complaint.find({ pnr: { $in: pnrs } }).sort({ createdAt: -1 });
  res.json(complaints);
});

router.get("/me/tickets", requireAuth, requireRole("passenger"), async (req, res) => {
  const tickets = await Ticket.find({ passengerId: req.user.passengerId }).sort({ createdAt: -1 });
  res.json(tickets);
});

router.get("/support-tickets", requireAuth, requireRole(...supportStaff), async (_req, res) => {
  const tickets = await Ticket.find({ status: { $in: ["open", "in_progress"] } })
    .sort({ createdAt: 1 })
    .limit(100);
  res.json(tickets);
});

router.patch(
  "/support-tickets/:id",
  requireAuth,
  requireRole(...supportStaff),
  validateBody(supportResponseSchema),
  async (req, res) => {
    const ticket = await Ticket.findByIdAndUpdate(req.params.id, {
      status: req.body.status,
      staffReply: req.body.staffReply,
      respondedBy: req.user.name,
      respondedByRole: req.user.role,
      respondedAt: new Date(),
    }, { new: true, runValidators: true });
    if (!ticket) return res.status(404).json({ error: "Not found" });
    res.json(ticket);
  }
);

router.post(
  "/me/tickets",
  requireAuth,
  requireRole("passenger"),
  validateBody(z.object({ category: z.string().min(1).max(100), subCategory: z.string().min(1).max(100), description: z.string().max(2000).optional() })),
  async (req, res) => {
    const passenger = await Passenger.findById(req.user.passengerId);
    const concernId = `CNC${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    const ticket = await Ticket.create({
      concernId,
      passengerId: req.user.passengerId,
      passengerName: passenger.name,
      category: req.body.category,
      subCategory: req.body.subCategory,
      description: req.body.description,
    });

    if (passenger?.mobile) {
      sendWhatsAppMessage(
        passenger.mobile,
        `Hi ${passenger.name}, we've registered your ticket "${req.body.category} — ${req.body.subCategory}" — reference #${concernId}. We'll update you on progress. — Indian Railways`
      ).catch(() => {});
    }
    if (passenger?.email) {
      sendEmail(
        passenger.email,
        `We've registered your query — #${concernId}`,
        `Hi ${passenger.name},\n\nWe've registered your query "${req.body.category} — ${req.body.subCategory}" — reference #${concernId}. We'll update you on progress.\n\n— Indian Railways`
      ).catch(() => {});
    }

    res.status(201).json(ticket);
  }
);

router.post(
  "/me/complaints",
  requireAuth,
  requireRole("passenger"),
  validateBody(z.object({ bookingId: z.string().min(1), intent: z.string().min(1).max(100), description: z.string().max(2000).optional(), force: z.boolean().optional() })),
  async (req, res) => {
    const booking = await Booking.findOne({ _id: req.body.bookingId, passengerId: req.user.passengerId });
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const passenger = await Passenger.findById(req.user.passengerId);

    if (!req.body.force) {
      const dup = await Complaint.findRecentDuplicate(booking.pnr, req.body.intent);
      if (dup) {
        return res.status(409).json({
          duplicate: true,
          message: `You already have an open complaint for "${dup.intent}" filed ${Math.round((Date.now() - new Date(dup.createdAt).getTime()) / 60000)} min ago — no need to file it twice unless it's a new occurrence.`,
          existing: dup,
        });
      }
    }

    const complaint = await Complaint.create({
      passengerName: passenger.name,
      pnr: booking.pnr,
      trainNumber: booking.trainNumber,
      coach: booking.coach,
      berth: booking.berth,
      intent: req.body.intent,
      description: req.body.description,
      source: "manual",
    });

    if (passenger?.mobile) {
      sendWhatsAppMessage(
        passenger.mobile,
        `Hi ${passenger.name}, we've registered your complaint "${complaint.intent}" — reference #${complaint._id.toString().slice(-6).toUpperCase()} (PNR ${complaint.pnr}). We'll keep you posted. — Indian Railways`
      ).catch(() => {});
    }
    if (passenger?.email) {
      sendEmail(
        passenger.email,
        `We've registered your complaint — PNR ${complaint.pnr}`,
        `Hi ${passenger.name},\n\nWe've registered your complaint "${complaint.intent}" — reference #${complaint._id.toString().slice(-6).toUpperCase()} (PNR ${complaint.pnr}). We'll keep you posted.\n\n— Indian Railways`
      ).catch(() => {});
    }

    res.status(201).json(complaint);
  }
);

router.get("/", requireAuth, async (req, res) => {
  const result = await listWithQuery(Passenger, req, ["name", "pnr", "mobile"]);
  res.json(result);
});

router.get("/:id", requireAuth, async (req, res) => {
  const p = await Passenger.findById(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

router.get("/by-pnr/:pnr", requireAuth, async (req, res) => {
  const p = await Passenger.findOne({ pnr: req.params.pnr });
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

/**
 * Full customer profile in one call — used by the Executive Dashboard the
 * moment a call context includes a PNR, so the agent sees the passenger's
 * name/mobile/train/coach/berth plus their complaint and fine history
 * without three round trips.
 */
router.get("/by-pnr/:pnr/profile", requireAuth, async (req, res) => {
  const passenger = await Passenger.findOne({ pnr: req.params.pnr });
  if (!passenger) return res.status(404).json({ error: "Not found" });
  const [complaints, fines, calls] = await Promise.all([
    Complaint.find({ pnr: passenger.pnr }).sort({ createdAt: -1 }).limit(10),
    Fine.find({ pnr: passenger.pnr }).sort({ createdAt: -1 }).limit(10),
    // AI chat transcripts + call history — so an executive picking up a
    // transferred/escalated conversation can see what the passenger already
    // asked the AI, instead of making them repeat themselves.
    Call.find({ customerPnr: passenger.pnr }).sort({ createdAt: -1 }).limit(10)
      .select("callId status source durationSec topic aiIntent aiConfidence aiTranscript transcript rating createdAt"),
  ]);
  res.json({ passenger, complaints, fines, calls });
});

/**
 * DELETE /api/v1/passengers/by-pnr/:pnr/data
 * Storage-management tool for the free-tier Mongo Atlas cluster this app
 * runs on (512MB cap). Wipes everything that actually accumulates size for
 * a passenger — call recordings (the real space hog, stored as raw audio
 * blobs in GridFS), call/chat transcripts, complaints, and tickets — while
 * KEEPING the Passenger record itself (so PNR lookups, login, and future
 * bookings still work) and KEEPING Fine records (financial/audit history —
 * not something to casually delete alongside chat logs).
 * Pass ?includeFines=true to also wipe fines if you really want a full reset.
 */
router.delete("/by-pnr/:pnr/data", requireAuth, async (req, res) => {
  const passenger = await Passenger.findOne({ pnr: req.params.pnr });
  if (!passenger) return res.status(404).json({ error: "Not found" });

  const calls = await Call.find({ customerPnr: passenger.pnr }).select("_id recordingFileId");
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "recordings" });
  let recordingsDeleted = 0;
  for (const call of calls) {
    if (!call.recordingFileId) continue;
    try {
      await bucket.delete(call.recordingFileId);
      recordingsDeleted++;
    } catch (err) {
      // file already gone / never fully uploaded — not fatal, keep going
      console.error("[passengers] failed to delete recording", call.recordingFileId, err.message);
    }
  }

  const [callsResult, complaintsResult, ticketsResult] = await Promise.all([
    Call.deleteMany({ customerPnr: passenger.pnr }),
    Complaint.deleteMany({ pnr: passenger.pnr }),
    Ticket.deleteMany({ passengerId: passenger._id }),
  ]);

  let finesResult = { deletedCount: 0 };
  if (req.query.includeFines === "true") {
    finesResult = await Fine.deleteMany({ pnr: passenger.pnr });
  }

  res.json({
    pnr: passenger.pnr,
    deleted: {
      calls: callsResult.deletedCount,
      recordings: recordingsDeleted,
      complaints: complaintsResult.deletedCount,
      tickets: ticketsResult.deletedCount,
      fines: finesResult.deletedCount,
    },
    kept: { passengerProfile: true, fines: req.query.includeFines !== "true" },
  });
});

router.post("/", requireAuth, async (req, res) => {
  const p = await Passenger.create(req.body);
  res.status(201).json(p);
});

router.patch("/:id", requireAuth, async (req, res) => {
  const p = await Passenger.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

module.exports = router;
