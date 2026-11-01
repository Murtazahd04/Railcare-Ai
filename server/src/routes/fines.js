const express = require("express");
const crypto = require("crypto");
const QRCode = require("qrcode");
const Razorpay = require("razorpay");
const Fine = require("../models/Fine");
const Passenger = require("../models/Passenger");
const { listWithQuery } = require("../utils/listQuery");
const { requireAuth } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const { fineCreateSchema, fineEmailSchema } = require("../utils/schemas");
const { sendWhatsAppMessage } = require("../utils/whatsapp");
const { sendEmail } = require("../utils/email");

const router = express.Router();

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

router.get("/", requireAuth, async (req, res) => {
  const result = await listWithQuery(Fine, req, ["passengerName", "pnr", "reason"]);
  res.json(result);
});

router.get("/:id", requireAuth, async (req, res) => {
  const f = await Fine.findById(req.params.id);
  if (!f) return res.status(404).json({ error: "Not found" });
  res.json(f);
});

router.post("/", requireAuth, validateBody(fineCreateSchema), async (req, res) => {
  const { overrideEmail, ...rest } = req.body;
  const f = await Fine.create(overrideEmail ? { ...rest, overrideEmail } : rest);

  // Same "you've been notified" pattern as complaints/tickets — WhatsApp for
  // the quick heads-up, email for anything with a link/detail worth keeping
  // (WhatsApp's sandbox has the join-code hassle; email doesn't).
  const passenger = await Passenger.findOne({ pnr: f.pnr });
  if (passenger?.mobile) {
    sendWhatsAppMessage(
      passenger.mobile,
      `Hi ${passenger.name}, a fine of ₹${f.amount} has been recorded for "${f.reason}" (PNR ${f.pnr}). — Indian Railways`
    ).catch(() => {});
  }
  const notifyEmail = passenger?.email || f.overrideEmail;
  const emailResult = notifyEmail
    ? await sendEmail(
      notifyEmail,
      `A fine has been recorded — PNR ${f.pnr}`,
      `Hi ${passenger?.name || f.passengerName},\n\nA fine of ₹${f.amount} has been recorded for "${f.reason}" (PNR ${f.pnr}). Please check the app to view and pay it.\n\n— Indian Railways`
    ).catch((err) => ({ sent: false, reason: err.message }))
    : { sent: false, reason: "No passenger email address is available." };

  res.status(201).json({
    ...f.toObject(),
    passengerEmailOnFile: Boolean(passenger?.email),
    email: emailResult,
  });
});

// Executive-entered fallback email, for when the passenger has none on file.
// Set once here, then used automatically by generate-qr below.
router.patch("/:id/email", requireAuth, validateBody(fineEmailSchema), async (req, res) => {
  const f = await Fine.findByIdAndUpdate(req.params.id, { overrideEmail: req.body.overrideEmail }, { new: true });
  if (!f) return res.status(404).json({ error: "Not found" });
  res.json(f);
});

/**
 * Real Razorpay QR: creates an actual Razorpay Payment Link (test mode —
 * works with your rzp_test_ keys, no KYC needed), turns its short_url into
 * a scannable QR code, and emails both the QR image and the link to the
 * passenger. Scanning it (or clicking the link) opens Razorpay's real
 * hosted checkout page where a test card actually works.
 *
 * Note: Razorpay's UPI-specific Payment Links (upi_link:true) are LIVE-MODE
 * ONLY — so this deliberately does NOT set that flag. A standard Payment
 * Link still accepts UPI as one of several payment methods on the checkout
 * page itself, it's just not a raw UPI-intent QR. That's the correct
 * trade-off for test mode.
 *
 * Target email is passenger.email if the passenger record has one,
 * otherwise fine.overrideEmail (set via PATCH /:id/email by the
 * executive when the passenger has no email on file).
 */
router.post("/:id/generate-qr", requireAuth, async (req, res) => {
  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(400).json({
      error: "Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env (free test keys from https://dashboard.razorpay.com).",
    });
  }

  const f = await Fine.findById(req.params.id);
  if (!f) return res.status(404).json({ error: "Not found" });

  const passenger = await Passenger.findOne({ pnr: f.pnr }).catch(() => null);
  const targetEmail = passenger?.email || f.overrideEmail || null;

  if (!targetEmail) {
    return res.status(400).json({
      error: "No email on file for this passenger and no override email set. Call PATCH /fines/:id/email first with an executive-entered email.",
      code: "NO_EMAIL",
    });
  }

  const paymentLink = await razorpay.paymentLink.create({
    amount: Math.round(f.amount * 100), // paise
    currency: "INR",
    description: `Fine — ${f.reason} (PNR ${f.pnr})`,
    customer: {
      name: passenger?.name || f.passengerName,
      email: targetEmail,
      contact: passenger?.mobile ? `+91${passenger.mobile}`.replace(/^\+91\+91/, "+91") : undefined,
    },
    notify: { sms: false, email: false }, // we send our own email below, don't double-send
    reference_id: `${f._id}-${Date.now()}`, // must be unique per Payment Link — timestamped so regenerating a QR for the same fine doesn't collide with the previous link
    notes: { fineId: String(f._id), pnr: f.pnr },
  });

  const qrDataUrl = await QRCode.toDataURL(paymentLink.short_url);
  f.qrDataUrl = qrDataUrl;
  f.razorpayPaymentLinkId = paymentLink.id;
  f.razorpayPaymentLinkUrl = paymentLink.short_url;
  await f.save();

  const base64 = qrDataUrl.split(",")[1];
  const emailResult = await sendEmail(
    targetEmail,
    `Fine payment — ₹${f.amount} (PNR ${f.pnr})`,
    `Hi ${passenger?.name || f.passengerName},\n\nA fine of ₹${f.amount} has been raised against your journey (PNR ${f.pnr}).\nReason: ${f.reason}\n\nPay securely via Razorpay — scan the attached QR code, or use this link:\n${paymentLink.short_url}\n\n(This is a Razorpay TEST MODE link — no real money will be charged.)\n\n— Indian Railways SRLMS`,
    [{ filename: `fine-${f._id}-qr.png`, content: base64, encoding: "base64" }]
  ).catch((err) => ({ sent: false, reason: err.message }));

  res.json({ fine: f, qrDataUrl, paymentLinkUrl: paymentLink.short_url, email: emailResult });
});

// demo payment confirmation webhook — for when you don't want to wire up Razorpay Checkout yet
router.post("/:id/confirm-payment", requireAuth, async (req, res) => {
  const f = await Fine.findById(req.params.id);
  if (!f) return res.status(404).json({ error: "Not found" });
  f.status = "paid";
  f.paidAt = new Date();
  await f.save();
  res.json(f);
});

/**
 * Real Razorpay integration — test mode.
 * Test mode is free forever: no KYC, no business registration, no real
 * money moves. Get test keys at https://dashboard.razorpay.com (Settings →
 * API Keys → "Test Mode" toggle on) and put them in server/.env:
 *   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
 *   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
 * Going live (real payments) requires Razorpay business KYC — that's a
 * paperwork/verification step, not a software cost.
 */
router.post("/:id/create-razorpay-order", requireAuth, async (req, res) => {
  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(400).json({
      error: "Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env (free test keys from https://dashboard.razorpay.com).",
    });
  }
  const f = await Fine.findById(req.params.id);
  if (!f) return res.status(404).json({ error: "Not found" });

  const order = await razorpay.orders.create({
    amount: Math.round(f.amount * 100), // paise
    currency: "INR",
    receipt: `fine-${f._id}`,
    notes: { passengerName: f.passengerName, pnr: f.pnr, reason: f.reason },
  });

  f.razorpayOrderId = order.id;
  await f.save();

  res.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID, // safe to expose — this is the public key, not the secret
  });
});

// call this after Razorpay Checkout completes on the frontend, with the
// three values it returns (razorpay_order_id, razorpay_payment_id, razorpay_signature)
router.post("/:id/verify-razorpay-payment", requireAuth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(400).json({ error: "Razorpay keys not configured" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Payment signature verification failed" });
  }

  const f = await Fine.findById(req.params.id);
  if (!f) return res.status(404).json({ error: "Not found" });

  f.status = "paid";
  f.paidAt = new Date();
  f.razorpayPaymentId = razorpay_payment_id;
  await f.save();

  res.json({ verified: true, fine: f });
});

// Payment Links don't push status back to us automatically without a
// webhook (same ngrok-tunnel requirement as the WhatsApp inbound webhook —
// not worth the setup for test-mode QA). This polls Razorpay directly
// instead: click "Check payment status" in the dashboard after the
// passenger says they've paid, and this syncs it.
router.post("/:id/razorpay-status", requireAuth, async (req, res) => {
  const razorpay = getRazorpay();
  if (!razorpay) return res.status(400).json({ error: "Razorpay keys not configured" });

  const f = await Fine.findById(req.params.id);
  if (!f) return res.status(404).json({ error: "Not found" });
  if (!f.razorpayPaymentLinkId) return res.status(400).json({ error: "No payment link generated yet for this fine" });

  const link = await razorpay.paymentLink.fetch(f.razorpayPaymentLinkId);

  if (link.status === "paid" && f.status !== "paid") {
    f.status = "paid";
    f.paidAt = new Date();
    const lastPayment = Array.isArray(link.payments) ? link.payments[link.payments.length - 1] : null;
    if (lastPayment?.payment_id) f.razorpayPaymentId = lastPayment.payment_id;
    await f.save();
  }

  res.json({ fine: f, razorpayStatus: link.status });
});

module.exports = router;
