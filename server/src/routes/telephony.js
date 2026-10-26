const express = require("express");
const twilio = require("twilio");
const { classify } = require("../utils/classifier");
const KbIntent = require("../models/KbIntent");
const Call = require("../models/Call");
const Passenger = require("../models/Passenger");
const { placeCallback } = require("../utils/twilioCall");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;

// in-memory per-call scratch state (call SID -> { startedAt })
const activeTwilioCalls = new Map();

/**
 * Twilio hits this URL the moment someone dials your trial number.
 * Configure it in Twilio Console → Phone Numbers → your number →
 * "A call comes in" → Webhook → POST → https://<your-ngrok-url>/api/v1/telephony/voice/incoming
 */
router.post("/voice/incoming", (req, res) => {
  const callSid = req.body.CallSid;
  activeTwilioCalls.set(callSid, { startedAt: Date.now() });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    action: "/api/v1/telephony/voice/handle-speech",
    method: "POST",
    speechTimeout: "auto",
    language: "en-IN", // also handles Hindi reasonably; switch to "hi-IN" if you want Hindi-first recognition
  });
  gather.say(
    { voice: "Polly.Aditi" }, // Indian-accented voice included free in trial minutes
    "Welcome to Indian Railways linen support. Please tell me your problem after the beep."
  );

  // if they say nothing, loop back
  twiml.redirect("/api/v1/telephony/voice/incoming");

  res.type("text/xml").send(twiml.toString());
});

/**
 * Twilio calls this with whatever it heard, already transcribed
 * (req.body.SpeechResult) — this is Twilio's built-in, free-during-trial
 * speech recognition, no separate STT needed for this flow.
 */
router.post("/voice/handle-speech", async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult || "";
  const twiml = new VoiceResponse();

  const intents = await KbIntent.find();
  const result = await classify(speechResult, intents);
  const belowThreshold = !result.intent || result.confidence < (result.intent?.confidenceThreshold ?? 0.7);

  if (belowThreshold) {
    twiml.say(
      { voice: "Polly.Aditi" },
      "I'm not fully confident I understood that. Connecting you to an executive now."
    );
    // dial your own verified number (set in .env) as the "human executive" —
    // this is the real telephony equivalent of the WebRTC transfer feature
    const fallback = process.env.TWILIO_EXECUTIVE_FALLBACK_NUMBER;
    if (fallback) {
      twiml.dial(fallback);
    } else {
      twiml.say("No executive number is configured yet. Goodbye.");
      twiml.hangup();
    }
    await persistTwilioCall(callSid, req.body, { status: "transferred", intent: result.intent?.name, confidence: result.confidence });
  } else {
    const reply = (result.intent.expectedAnswer || "Thank you, we've logged your request.")
      .replace("{passenger_name}", "there")
      .replace("{coach}", "your coach")
      .replace("{berth}", "your berth")
      .replace("{pnr}", "your PNR")
      .replace("{train_number}", "your train")
      .replace("{stage}", "in transit");
    twiml.say({ voice: "Polly.Aditi" }, reply);
    twiml.say("Is there anything else I can help with? Please speak after the beep, or stay silent to end the call.");
    twiml.gather({
      input: "speech",
      action: "/api/v1/telephony/voice/handle-speech",
      method: "POST",
      speechTimeout: "auto",
      language: "en-IN",
    });
    twiml.say("Thank you for calling Indian Railways. Goodbye.");
    twiml.hangup();

    await persistTwilioCall(callSid, req.body, { status: "completed", intent: result.intent.name, confidence: result.confidence });
  }

  res.type("text/xml").send(twiml.toString());
});

async function persistTwilioCall(callSid, body, extra) {
  const meta = activeTwilioCalls.get(callSid);
  const durationSec = meta ? Math.round((Date.now() - meta.startedAt) / 1000) : 0;
  try {
    await Call.findOneAndUpdate(
      { callId: callSid },
      {
        callId: callSid,
        customerName: body.From || "Unknown caller",
        source: "phone",
        durationSec,
        ...extra,
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error("[telephony] failed to persist phone call", callSid, err.message);
  }
  activeTwilioCalls.delete(callSid);
}

/**
 * Twilio hits this the moment someone sends ANY WhatsApp message to your
 * sandbox number — including their first "join <code>" message that
 * activates the sandbox for them. This is the "start chatting with us"
 * piece: instead of Twilio's generic default auto-reply, we send our own
 * welcome message so the join step visibly leads somewhere instead of
 * feeling like it went nowhere.
 *
 * Configure in Twilio Console -> Messaging -> Try it out -> WhatsApp
 * Sandbox Settings -> "WHEN A MESSAGE COMES IN" -> POST ->
 * https://<your-public-url>/api/v1/telephony/whatsapp/incoming
 * (needs a public URL — ngrok/deployed server; Twilio can't reach
 * localhost directly).
 */
router.post("/whatsapp/incoming", async (req, res) => {
  const from = (req.body.From || "").replace(/^whatsapp:/, ""); // e.g. +91XXXXXXXXXX
  const body = (req.body.Body || "").trim();

  const twiml = new MessagingResponse();
  const isJoinMessage = /^join\b/i.test(body);
  const passenger = await Passenger.findOne({ mobile: from.replace(/^\+91/, "") }).catch(() => null);
  const name = passenger?.name;

  if (isJoinMessage) {
    twiml.message(
      `${name ? `Welcome, ${name}` : "Welcome"}! ✅ You're now subscribed to Indian Railways SRLMS updates on WhatsApp — complaint status changes and escalations will land right here. You can also just reply here anytime with your PNR or issue and we'll pick it up.`
    );
  } else {
    // Any other inbound message — acknowledge so it's clear a human/system
    // saw it, without pretending this is a full AI chat channel (that's
    // the in-app AI portal's job) — keep it short.
    twiml.message(
      "Thanks for your message — for the fastest help, please use the SRLMS app to chat or raise a complaint. We'll still notify you here on any updates to existing complaints."
    );
  }

  res.type("text/xml").send(twiml.toString());
});

/**
 * Executive-initiated real phone call to a passenger's actual mobile
 * (separate from the in-app WebRTC call, and separate from the
 * passenger-initiated /voice/callback-request — this one only staff can
 * trigger, since it costs real Twilio minutes).
 *
 * Flow: Twilio calls the passenger's mobile number FROM your Twilio number,
 * plays a short announcement, then bridges the call to
 * TWILIO_EXECUTIVE_FALLBACK_NUMBER (set in your .env) — that's the
 * "one number" that actually rings on your end once the passenger picks up.
 *
 * Trial-account reality (same as everywhere else Twilio calling is used):
 * this only succeeds if the PASSENGER's number is also in your Verified
 * Caller IDs list — a Twilio trial account can't call arbitrary unverified
 * numbers, only your own verified test numbers. So on trial, this will
 * only actually work when testing with a passenger record whose mobile is
 * your own verified number. Upgrading the Twilio account removes this
 * limit entirely for real passengers.
 */
router.post("/call-passenger", requireAuth, async (req, res) => {
  const pnr = (req.body?.pnr || "").trim();
  if (!pnr) return res.status(400).json({ ok: false, reason: "No PNR provided" });

  const passenger = await Passenger.findOne({ pnr }).catch(() => null);
  if (!passenger?.mobile) {
    return res.status(404).json({ ok: false, reason: "No mobile number on file for this passenger" });
  }

  const result = await placeCallback(passenger.mobile, {
    announcement: `Hi ${passenger.name}, this is Indian Railways passenger support calling regarding your complaint. Connecting you to an executive now.`,
  });
  res.json(result);
});

module.exports = router;
