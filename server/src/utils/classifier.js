/**
 * Lightweight local intent classifier — no paid API, no external service.
 *
 * This is intentionally simple (token-overlap + keyword/synonym scoring)
 * so the whole project runs on localhost with zero extra infrastructure.
 * It is a drop-in replacement point: swap `scoreIntent` for a call to a
 * Python FastAPI service running multilingual ONNX embeddings, with the
 * local lexical scorer retained as a fallback — `classify()` is the only
 * entry point routes depend on.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "my", "i", "to", "of", "in", "on", "for",
  "hai", "ka", "ki", "ke", "mera", "meri", "mujhe", "kya", "aur", "please",
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/** score a single intent document against the input utterance */
function scoreIntent(inputTokens, intent) {
  const inputSet = new Set(inputTokens);
  let best = 0;

  for (const q of intent.questions || []) {
    const qSet = new Set(tokenize(q));
    best = Math.max(best, jaccard(inputSet, qSet));
  }

  // synonym / keyword hits give a direct confidence bump —
  // these represent exact-concept matches even with few overlapping tokens
  const bagTerms = [...(intent.synonyms || []), ...(intent.keywords || [])].map((s) => s.toLowerCase());
  let hits = 0;
  let strongestTermCoverage = 0;
  for (const term of bagTerms) {
    const termTokens = tokenize(term);
    if (termTokens.every((t) => inputSet.has(t))) {
      hits++;
      strongestTermCoverage = Math.max(strongestTermCoverage, termTokens.length / Math.max(1, inputSet.size));
    }
  }
  const bagScore = bagTerms.length ? Math.min(1, hits / Math.max(1, bagTerms.length) + hits * 0.15) : 0;

  const score = best * 0.65 + bagScore * 0.35 + (hits > 0 ? 0.1 : 0);
  return Math.min(1, Math.max(score, best * 0.75, strongestTermCoverage * 0.75));
}

/**
 * classifyLocal(utterance, intents) -> { intent, confidence, ranked }
 * The lightweight, dependency-free scorer — always available, always works.
 */
function classifyLocal(utterance, intents) {
  const inputTokens = tokenize(utterance);
  const ranked = intents
    .map((intent) => ({ intent, confidence: scoreIntent(inputTokens, intent) }))
    .sort((a, b) => b.confidence - a.confidence);

  const top = ranked[0];
  return {
    intent: top ? top.intent : null,
    confidence: top ? +top.confidence.toFixed(3) : 0,
    ranked: ranked.slice(0, 5).map((r) => ({ name: r.intent.name, confidence: +r.confidence.toFixed(3) })),
    source: "local-lexical",
  };
}

/**
 * Tries the optional Python AI microservice (FastEmbed multilingual
 * embeddings) at AI_SERVICE_URL (default http://localhost:8001). Returns
 * null on any failure (service not running, timeout, bad response) so the
 * caller can fall back — this never throws.
 */
async function tryRemoteClassify(utterance, intents, { strict = false, timeoutOverrideMs } = {}) {
  const baseUrl = process.env.AI_SERVICE_URL || "http://localhost:8001";
  const controller = new AbortController();
  const configuredTimeout = Number(process.env.AI_CLASSIFY_TIMEOUT_MS);
  const timeoutMs = timeoutOverrideMs || (
    Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 && configuredTimeout <= 30000
      ? configuredTimeout
      : 8000
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { "Content-Type": "application/json" };
    if (process.env.AI_SERVICE_TOKEN) {
      headers.Authorization = `Bearer ${process.env.AI_SERVICE_TOKEN}`;
    }
    const res = await fetch(`${baseUrl}/classify`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        utterance,
        intents: intents.map((i) => ({
          name: i.name,
          questions: i.questions || [],
          synonyms: i.synonyms || [],
          keywords: i.keywords || [],
          confidenceThreshold: i.confidenceThreshold ?? 0.7,
        })),
      }),
    });
    if (!res.ok) {
      if (strict) {
        throw new Error(`Python AI service returned HTTP ${res.status}. Check its deployment and AI_SERVICE_TOKEN configuration.`);
      }
      console.warn(`[classifier] Python AI service returned HTTP ${res.status}; using local classifier.`);
      return null;
    }
    const data = await res.json();

    const matchedDoc = data.matchedIntent ? intents.find((i) => i.name === data.matchedIntent) || null : null;
    return {
      intent: matchedDoc,
      confidence: data.confidence ?? 0,
      ranked: data.ranked || [],
      source: "fastembed-multilingual",
    };
  } catch (err) {
    if (err.name === "AbortError") {
      if (strict) {
        throw new Error(`Python AI service timed out after ${timeoutMs}ms. It may be waking from sleep; retry after opening its /health URL.`);
      }
      console.warn(`[classifier] Python AI service timed out after ${timeoutMs}ms; using local classifier.`);
    } else {
      if (strict) {
        throw new Error(`Python AI service request failed: ${err.message}`);
      }
      console.warn("[classifier] Python AI service unavailable; using local classifier:", err.message);
    }
    return null; silently
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * classify(utterance, intents) -> { intent, confidence, ranked, source }
 * Public entry point every route calls. Tries the real embeddings-based
 * Python service first; if that's not running (or too slow), falls back to
 * the local lexical scorer automatically. Nothing calling this needs to
 * know or care which one actually answered.
 */
async function classify(utterance, intents, { mode = "auto", timeoutMs } = {}) {
  if (mode === "node") return classifyLocal(utterance, intents);

  if (mode === "python") {
    const remote = await tryRemoteClassify(utterance, intents, { strict: true, timeoutOverrideMs: timeoutMs });
    return remote;
  }

  const remote = await tryRemoteClassify(utterance, intents);
  if (remote) return remote;
  return classifyLocal(utterance, intents);
}

module.exports = { classify, classifyLocal, tokenize };
