const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const Passenger = require("../models/Passenger");
const Complaint = require("../models/Complaint");
const Fine = require("../models/Fine");
const KbIntent = require("../models/KbIntent");
const KbCategory = require("../models/KbCategory");
const Call = require("../models/Call"); // was missing — /ai-session/close referenced Call.create() and crashed with "Call is not defined"
const UnansweredQuery = require("../models/UnansweredQuery");
const ClassifierConfig = require("../models/ClassifierConfig");
const { classify } = require("../utils/classifier");
const { sendWhatsAppMessage } = require("../utils/whatsapp");
const { sendEmail } = require("../utils/email");
const { validateBody } = require("../middleware/validate");
const { z } = require("zod");

const router = express.Router();

/**
 * WhatsApp sandbox info for the client's "message us first" banner.
 *
 * Twilio's sandbox rule (not something we can code around): a number can
 * only RECEIVE WhatsApp messages from us after it has SENT the join code
 * to our sandbox number first. So the client needs to show that number +
 * code somewhere so passengers actually do it — this endpoint is how the
 * client learns what to display without hardcoding it.
 *
 * TWILIO_WHATSAPP_JOIN_CODE has no safe default (it's random per Twilio
 * account, shown on your Console's WhatsApp Sandbox page) — set it in
 * .env once and the banner picks it up automatically.
 */
router.get("/whatsapp-info", (req, res) => {
  const from = process.env.TWILIO_WHATSAPP_FROM || "";
  const number = from.replace(/^whatsapp:/, "");
  const joinCode = process.env.TWILIO_WHATSAPP_JOIN_CODE || "";
  res.json({
    configured: Boolean(number && joinCode),
    number,
    joinCode,
  });
});

/**
 * FAQ list for the customer call page — click a topic instead of typing,
 * which both speeds up the caller and gives the classifier a clean,
 * unambiguous starting point.
 */
router.get("/faq", async (req, res) => {
  const intents = await KbIntent.find().populate("categoryId", "name").sort({ name: 1 });
  res.json(
    intents.map((i) => ({
      id: i._id,
      name: i.name,
      category: i.categoryId?.name || "General",
      categoryId: i.categoryId?._id || null,
      questions: i.questions || [],
    }))
  );
});

/**
 * The actual AI conversation turn — same classifier the phone flow and the
 * admin "Try it" tester use. Public because the customer only has an
 * anonymous session, not a staff JWT.
 */
const aiQuerySchema = z.object({
  utterance: z.string().min(1).max(1000),
  // ids the caller has already said "no" to this turn — classifier skips these
  // and offers the next-best ranked match instead (or transfers if none left)
  rejectedIntentIds: z.array(z.string()).optional(),
  pnr: z.string().optional(), // only used to tag unanswered-query logs, not required for classification
});

/** Replaces {placeholder} tokens in an expectedAnswer with real passenger data, falling back to generic text for anything unknown. */
function fillTemplate(text, passenger) {
  return (text || "")
    .replace(/{passenger_name}/g, passenger?.name || "there")
    .replace(/{pnr}/g, passenger?.pnr || "your PNR")
    .replace(/{coach}/g, passenger?.coach || "your coach")
    .replace(/{berth}/g, passenger?.berth || "your berth")
    .replace(/{train_number}/g, passenger?.trainNumber || "your train")
    .replace(/{stage}/g, "in transit");
}

const aiSessionCloseSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pnr: z.string().optional(),
  transcript: z.array(z.object({ speaker: z.string(), text: z.string() })).default([]),
  intent: z.string().optional(),
  confidence: z.number().optional(),
  resolved: z.boolean().default(true), // true = AI answered it; false = customer ended without a resolution
  rating: z.number().min(1).max(5).optional(),
});

/**
 * Persist an AI-only conversation once the customer is done with it —
 * either because the AI resolved it, or because they chose "End chat"
 * instead of being transferred. This is what makes closed AI chats show
 * up in the Passenger Portal's past-queries history, with their rating.
 */
router.post("/ai-session/close", validateBody(aiSessionCloseSchema), async (req, res) => {
  const call = await Call.create({
    callId: `ai-${crypto.randomUUID()}`,
    customerName: req.body.name || "Passenger",
    customerPnr: req.body.pnr || undefined,
    aiIntent: req.body.intent,
    aiConfidence: req.body.confidence,
    aiTranscript: req.body.transcript,
    status: req.body.resolved ? "ai_resolved" : "ai_ended",
    source: "ai_chat",
    rating: req.body.rating,
  });
  res.status(201).json({ callId: call.callId });
});

/**
 * Rate a completed real (WebRTC) call with an executive — this is the
 * feedback that was previously only ever captured for AI-only chats.
 * Feeds the "Executive Performance" panel on the Analytics Dashboard.
 */
router.post(
  "/calls/:callId/rating",
  validateBody(z.object({ rating: z.number().min(1).max(5) })),
  async (req, res) => {
    const call = await Call.findOne({ callId: req.params.callId });
    if (!call) return res.status(404).json({ error: "Call not found" });
    call.rating = req.body.rating;
    await call.save();
    res.json({ callId: call.callId, rating: call.rating });
  }
);

/** siblings in the same KB category, used as "related questions" suggestions */
async function relatedIntents(intent, limit = 4) {
  if (!intent?.categoryId) return [];
  const siblings = await KbIntent.find({ categoryId: intent.categoryId, _id: { $ne: intent._id } })
    .select("name questions")
    .limit(limit);
  return siblings.map((s) => ({ id: s._id, name: s.name, sampleQuestion: s.questions?.[0] || s.name }));
}

/**
 * Confirm-first AI turn ("Customer's Choice" flow):
 *  1. Classify the utterance.
 *  2. If a confident match is found, DON'T answer yet — ask the caller to
 *     confirm ("Are you asking about X?"). This avoids the AI confidently
 *     answering the wrong question.
 *  3. Caller confirms -> POST again with confirmedIntentId to get the real
 *     answer plus a handful of related follow-up questions from the same
 *     category.
 *  4. Caller rejects -> POST again with rejectedIntentIds including the
 *     wrong guess; the classifier offers the next-best candidate, or, if
 *     nothing else clears the threshold, signals a transfer to a human.
 */
/**
 * Logs a query the AI couldn't confidently answer, so gaps in the knowledge
 * base show up as reviewable data on the Admin Training Dashboard instead of
 * silently vanishing into a "transferred to executive" outcome. Near-exact
 * repeats bump a counter rather than piling up duplicate rows.
 */
async function logUnanswered(utterance, confidence, source, pnr) {
  try {
    const existing = await UnansweredQuery.findOne({ utterance: utterance.trim().toLowerCase(), reviewed: false });
    if (existing) {
      existing.occurrences += 1;
      existing.bestConfidence = Math.max(existing.bestConfidence, confidence || 0);
      await existing.save();
    } else {
      await UnansweredQuery.create({
        utterance: utterance.trim().toLowerCase(),
        bestConfidence: confidence || 0,
        source,
        pnr,
      });
    }
  } catch (err) {
    console.error("[unanswered] failed to log:", err.message); // never let logging break the actual AI response
  }
}

router.post("/ai-query", validateBody(aiQuerySchema), async (req, res) => {
  const intents = await KbIntent.find();
  const rejected = new Set(req.body.rejectedIntentIds || []);
  const candidatePool = intents.filter((i) => !rejected.has(String(i._id)));

  const classifierConfig = await ClassifierConfig.findOne({ key: "passenger" }).lean();
  const mode = classifierConfig?.passengerMode || "auto";
  let result;
  try {
    result = await classify(req.body.utterance, candidatePool, {
      mode,
      timeoutMs: mode === "python" || mode === "dual" ? 90000 : undefined,
    });
  } catch (err) {
    return res.status(503).json({ error: err.message, source: "python-unavailable" });
  }
  const belowThreshold = !result.intent || result.confidence < (result.intent?.confidenceThreshold ?? 0.7);

  if (belowThreshold) {
    // Don't jump straight to "transfer to executive" — first see if any
    // reasonably-close candidates exist (confidence >= 0.2) and let the
    // caller pick from a short clarifying list, Swiggy/Zomato-support style.
    // Only fall back to a human when nothing plausible is left to offer.
    const CLARIFY_FLOOR = 0.2;
    const seen = new Set();
    const clarifyOptions = (result.ranked || [])
      .filter((r) => r.confidence >= CLARIFY_FLOOR)
      .slice(0, 3)
      .map((r) => candidatePool.find((i) => i.name === r.name))
      .filter((intent) => intent && !seen.has(String(intent._id)) && seen.add(String(intent._id)));

    if (clarifyOptions.length > 0) {
      return res.json({
        status: "clarify",
        utterance: req.body.utterance,
        options: clarifyOptions.map((c) => ({
          id: c._id,
          name: c.name,
          sampleQuestion: c.questions?.[0] || c.name,
        })),
        confidence: result.confidence,
        thresholdMet: false,
        source: result.source,
      });
    }

    await logUnanswered(req.body.utterance, result.confidence, result.source, req.body.pnr);
    return res.json({
      status: "transfer",
      utterance: req.body.utterance,
      matchedIntent: null,
      confidence: result.confidence,
      thresholdMet: false,
      reply: null,
      source: result.source,
    });
  }

  res.json({
    status: "confirm",
    utterance: req.body.utterance,
    candidateIntentId: result.intent._id,
    candidateIntentName: result.intent.name,
    confirmPrompt: `Are you asking about "${result.intent.name}"?`,
    confidence: result.confidence,
    thresholdMet: true,
    source: result.source,
  });
});

/** Step 2 of the confirm-first flow: caller said "yes" to a candidate intent. */
router.post(
  "/ai-query/confirm",
  validateBody(z.object({ intentId: z.string().min(1), pnr: z.string().optional() })),
  async (req, res) => {
    const intent = await KbIntent.findById(req.body.intentId).catch(() => null);
    if (!intent) return res.status(404).json({ error: "Unknown intent" });
    const passenger = req.body.pnr ? await Passenger.findOne({ pnr: req.body.pnr }) : null;
    const related = await relatedIntents(intent);
    res.json({
      status: "answered",
      matchedIntent: intent.name,
      reply: fillTemplate(intent.expectedAnswer, passenger),
      relatedQuestions: related,
    });
  }
);

const lookupSchema = z.object({
  pnr: z.string().min(1).max(20),
  mobile: z.string().min(1).max(20),
});

/**
 * "Auth" for the passenger portal — no account/password, just prove you
 * know the PNR + the mobile number on file for it. This is the same
 * ownership model IRCTC's own "PNR status" pages use; it's intentionally
 * lightweight for a demo, not bank-grade security.
 */
async function verifyOwnership(pnr, mobile) {
  const passenger = await Passenger.findOne({ pnr });
  if (!passenger) return null;
  // loose match: compare digits only, so "+91 98765 43210" matches "9876543210"
  const normalize = (s) => (s || "").replace(/\D/g, "").slice(-10);
  if (normalize(passenger.mobile) !== normalize(mobile)) return null;
  return passenger;
}

router.post("/passenger-lookup", validateBody(lookupSchema), async (req, res) => {
  const passenger = await verifyOwnership(req.body.pnr, req.body.mobile);
  if (!passenger) return res.status(404).json({ error: "No booking found matching that PNR and mobile number" });
  res.json(passenger);
});

router.post("/complaints", validateBody(lookupSchema.extend({
  intent: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  force: z.boolean().optional(),
})), async (req, res) => {
  const passenger = await verifyOwnership(req.body.pnr, req.body.mobile);
  if (!passenger) return res.status(404).json({ error: "No booking found matching that PNR and mobile number" });

  if (!req.body.force) {
    const dup = await Complaint.findRecentDuplicate(passenger.pnr, req.body.intent);
    if (dup) {
      return res.status(409).json({
        duplicate: true,
        message: `An open complaint for "${dup.intent}" was already filed ${Math.round((Date.now() - new Date(dup.createdAt).getTime()) / 60000)} min ago on this PNR.`,
        existing: dup,
      });
    }
  }

  const complaint = await Complaint.create({
    passengerName: passenger.name,
    pnr: passenger.pnr,
    trainNumber: passenger.trainNumber,
    coach: passenger.coach,
    berth: passenger.berth,
    intent: req.body.intent,
    description: req.body.description,
    source: "manual",
  });

  if (passenger.mobile) {
    sendWhatsAppMessage(
      passenger.mobile,
      `Hi ${passenger.name}, we've registered your complaint "${complaint.intent}" — reference #${complaint._id.toString().slice(-6).toUpperCase()} (PNR ${complaint.pnr}). We'll keep you posted. — Indian Railways`
    ).catch(() => {});
  }
  if (passenger.email) {
    sendEmail(
      passenger.email,
      `We've registered your complaint — PNR ${complaint.pnr}`,
      `Hi ${passenger.name},\n\nWe've registered your complaint "${complaint.intent}" — reference #${complaint._id.toString().slice(-6).toUpperCase()} (PNR ${complaint.pnr}). We'll keep you posted.\n\n— Indian Railways`
    ).catch(() => {});
  }

  res.status(201).json(complaint);
});

router.post("/complaints/list", validateBody(lookupSchema), async (req, res) => {
  const passenger = await verifyOwnership(req.body.pnr, req.body.mobile);
  if (!passenger) return res.status(404).json({ error: "No booking found matching that PNR and mobile number" });
  const complaints = await Complaint.find({ pnr: passenger.pnr }).sort({ createdAt: -1 });
  res.json(complaints);
});

router.post("/fines/list", validateBody(lookupSchema), async (req, res) => {
  const passenger = await verifyOwnership(req.body.pnr, req.body.mobile);
  if (!passenger) return res.status(404).json({ error: "No booking found matching that PNR and mobile number" });
  const fines = await Fine.find({ pnr: passenger.pnr }).sort({ createdAt: -1 });
  res.json(fines);
});

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

router.post("/fines/:id/pay", validateBody(lookupSchema), async (req, res) => {
  const passenger = await verifyOwnership(req.body.pnr, req.body.mobile);
  if (!passenger) return res.status(404).json({ error: "No booking found matching that PNR and mobile number" });

  const fine = await Fine.findOne({ _id: req.params.id, pnr: passenger.pnr });
  if (!fine) return res.status(404).json({ error: "Fine not found for this passenger" });

  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(400).json({ error: "Razorpay not configured on the server yet (see server/.env)" });
  }

  const order = await razorpay.orders.create({
    amount: Math.round(fine.amount * 100),
    currency: "INR",
    receipt: `fine-${fine._id}`,
  });
  fine.razorpayOrderId = order.id;
  await fine.save();

  res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
});

router.post("/fines/:id/verify-payment", validateBody(lookupSchema.extend({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
})), async (req, res) => {
  const passenger = await verifyOwnership(req.body.pnr, req.body.mobile);
  if (!passenger) return res.status(404).json({ error: "No booking found matching that PNR and mobile number" });

  const fine = await Fine.findOne({ _id: req.params.id, pnr: passenger.pnr });
  if (!fine) return res.status(404).json({ error: "Fine not found for this passenger" });

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${req.body.razorpay_order_id}|${req.body.razorpay_payment_id}`)
    .digest("hex");
  if (expectedSignature !== req.body.razorpay_signature) {
    return res.status(400).json({ error: "Payment signature verification failed" });
  }

  fine.status = "paid";
  fine.paidAt = new Date();
  fine.razorpayPaymentId = req.body.razorpay_payment_id;
  await fine.save();

  res.json({ verified: true, fine });
});

module.exports = router;
