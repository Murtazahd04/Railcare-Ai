/**
 * Central runtime configuration + production safety checks.
 *
 * In production (NODE_ENV=production) the server refuses to boot with an
 * unsafe configuration instead of silently falling back to dev defaults.
 */
const DEV_JWT_FALLBACK = "srlms_dev_secret_change_me";

const isProd = process.env.NODE_ENV === "production";

function getJwtSecret() {
  return process.env.JWT_SECRET || DEV_JWT_FALLBACK;
}

/** Throws (in production) / warns (in dev) about unsafe configuration. */
function validateEnv() {
  const problems = [];

  if (isProd) {
    if (!process.env.MONGO_URI) problems.push("MONGO_URI is not set.");
    if (!process.env.JWT_SECRET) problems.push("JWT_SECRET is not set.");
    else if (process.env.JWT_SECRET.length < 32) problems.push("JWT_SECRET must be at least 32 characters.");
    else if (process.env.JWT_SECRET === DEV_JWT_FALLBACK) problems.push("JWT_SECRET must not be the dev default.");
    if ((process.env.JWT_EXPIRES_IN || "8h") === "none") {
      problems.push('JWT_EXPIRES_IN="none" (tokens that never expire) is not allowed in production. Use e.g. 8h.');
    }
    if (!process.env.CORS_ORIGINS) {
      console.warn("[config] CORS_ORIGINS is not set — the API will accept requests from ANY origin. Set it to your frontend URL.");
    }
  } else if (!process.env.JWT_SECRET) {
    console.warn("[config] JWT_SECRET not set — using an insecure dev default. Fine locally, never in production.");
  }

  if (problems.length) {
    throw new Error("Unsafe production configuration:\n  - " + problems.join("\n  - "));
  }
}

/**
 * CORS_ORIGINS="https://app.vercel.app,https://other.example.com"
 * Returns `true`/"*" (allow all) when unset, otherwise an array of origins.
 */
function getAllowedOrigins() {
  const raw = (process.env.CORS_ORIGINS || "").trim();
  if (!raw || raw === "*") return null; // null => allow any origin
  return raw.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}

module.exports = { isProd, getJwtSecret, validateEnv, getAllowedOrigins };
