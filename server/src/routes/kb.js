const express = require("express");
const KbCategory = require("../models/KbCategory");
const KbIntent = require("../models/KbIntent");
const UnansweredQuery = require("../models/UnansweredQuery");
const ClassifierConfig = require("../models/ClassifierConfig");
const { requireAuth, requireRole } = require("../middleware/auth");
const { classify } = require("../utils/classifier");
const { validateBody } = require("../middleware/validate");
const { kbIntentCreateSchema } = require("../utils/schemas");
const { z } = require("zod");

const router = express.Router();

router.get("/classifier-mode", requireAuth, requireRole("admin", "super_admin"), async (_req, res) => {
  const config = await ClassifierConfig.findOne({ key: "passenger" }).lean();
  res.json({ mode: config?.passengerMode || "auto" });
});

router.put(
  "/classifier-mode",
  requireAuth,
  requireRole("admin", "super_admin"),
  validateBody(z.object({ mode: z.enum(["auto", "python", "node", "dual"]) })),
  async (req, res) => {
    const config = await ClassifierConfig.findOneAndUpdate(
      { key: "passenger" },
      { $set: { passengerMode: req.body.mode } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ mode: config.passengerMode });
  }
);

// ---- Unanswered queries — the AI's real "I don't know" list ----
// Unreviewed first, most-repeated first, so the training team sees the
// highest-value gaps (things many people asked) before one-off phrasings.
router.get("/unanswered", requireAuth, async (req, res) => {
  const filter = req.query.includeReviewed === "true" ? {} : { reviewed: false };
  const rows = await UnansweredQuery.find(filter).sort({ reviewed: 1, occurrences: -1, updatedAt: -1 }).limit(200);
  res.json(rows);
});

router.patch("/unanswered/:id", requireAuth, async (req, res) => {
  const row = await UnansweredQuery.findByIdAndUpdate(req.params.id, { reviewed: !!req.body.reviewed }, { new: true });
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// One-click "this should have matched an existing intent" — adds the
// phrasing as a new training question on that intent, and marks reviewed.
router.post("/unanswered/:id/add-to-intent", requireAuth, validateBody(z.object({ intentId: z.string() })), async (req, res) => {
  const row = await UnansweredQuery.findById(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const intent = await KbIntent.findByIdAndUpdate(req.body.intentId, { $addToSet: { questions: row.utterance } }, { new: true });
  if (!intent) return res.status(404).json({ error: "Intent not found" });
  row.reviewed = true;
  row.addedAsIntentId = intent._id;
  await row.save();
  res.json({ row, intent });
});

// ---- Categories ----
router.get("/categories", requireAuth, async (req, res) => {
  res.json(await KbCategory.find().sort({ name: 1 }));
});
router.post("/categories", requireAuth, async (req, res) => {
  const c = await KbCategory.create(req.body);
  res.status(201).json(c);
});

// ---- Intents ----
router.get("/intents", requireAuth, async (req, res) => {
  const filter = req.query.categoryId ? { categoryId: req.query.categoryId } : {};
  res.json(await KbIntent.find(filter).populate("categoryId", "name"));
});
router.get("/intents/:id", requireAuth, async (req, res) => {
  const intent = await KbIntent.findById(req.params.id);
  if (!intent) return res.status(404).json({ error: "Not found" });
  res.json(intent);
});
router.post("/intents", requireAuth, validateBody(kbIntentCreateSchema), async (req, res) => {
  const intent = await KbIntent.create(req.body);
  res.status(201).json(intent);
});
router.patch("/intents/:id", requireAuth, async (req, res) => {
  const intent = await KbIntent.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!intent) return res.status(404).json({ error: "Not found" });
  res.json(intent);
});

// step-by-step wizard sub-additions (append instead of replacing full doc)
router.post("/intents/:id/questions", requireAuth, async (req, res) => {
  const intent = await KbIntent.findByIdAndUpdate(
    req.params.id,
    { $push: { questions: { $each: req.body.questions || [req.body.question] } } },
    { new: true }
  );
  if (!intent) return res.status(404).json({ error: "Not found" });
  res.json(intent);
});
router.post("/intents/:id/synonyms", requireAuth, async (req, res) => {
  const intent = await KbIntent.findByIdAndUpdate(
    req.params.id,
    { $push: { synonyms: { $each: req.body.synonyms || [req.body.synonym] } } },
    { new: true }
  );
  if (!intent) return res.status(404).json({ error: "Not found" });
  res.json(intent);
});
router.post("/intents/:id/keywords", requireAuth, async (req, res) => {
  const intent = await KbIntent.findByIdAndUpdate(
    req.params.id,
    { $push: { keywords: { $each: req.body.keywords || [req.body.keyword] } } },
    { new: true }
  );
  if (!intent) return res.status(404).json({ error: "Not found" });
  res.json(intent);
});

// ---- the "Try it" tester — same code path the live AI would use ----
router.post(
  "/test",
  requireAuth,
  requireRole("admin", "super_admin"),
  validateBody(z.object({
    utterance: z.string().trim().min(1).max(2000),
    mode: z.enum(["auto", "node", "python", "dual"]).default("auto"),
  })),
  async (req, res) => {
    const { utterance, mode } = req.body;
    const intents = await KbIntent.find();
    let result;
    try {
      result = await classify(utterance, intents, {
        mode,
        timeoutMs: mode === "python" || mode === "dual" ? 90000 : undefined,
      });
    } catch (err) {
      return res.status(503).json({ error: err.message, source: "python-unavailable" });
    }

    const belowThreshold = !result.intent || result.confidence < (result.intent?.confidenceThreshold ?? 0.7);

    res.json({
      utterance,
      matchedIntent: result.intent ? result.intent.name : null,
      confidence: result.confidence,
      action: belowThreshold ? "transfer_to_executive" : result.intent?.expectedAction,
      reply: belowThreshold ? null : result.intent?.expectedAnswer,
      thresholdMet: !belowThreshold,
      ranked: result.ranked,
      source: result.source,
      comparison: result.comparison,
    });
  }
);

// public (no-auth) version for the customer-facing AI simulator, if you build one
router.post("/test-public", async (req, res) => {
  const { utterance } = req.body;
  if (!utterance) return res.status(400).json({ error: "utterance is required" });
  const intents = await KbIntent.find();
  const result = await classify(utterance, intents);
  const belowThreshold = !result.intent || result.confidence < (result.intent?.confidenceThreshold ?? 0.7);
  res.json({
    matchedIntent: result.intent ? result.intent.name : null,
    confidence: result.confidence,
    thresholdMet: !belowThreshold,
    reply: belowThreshold ? null : result.intent?.expectedAnswer,
    source: result.source,
  });
});

module.exports = router;
