require("dotenv").config();
const express = require("express");
require("express-async-errors"); // patches Express so a rejected promise in any async route handler
// reaches the error-handling middleware below instead of crashing the whole
// process — without this, ANY database hiccup (a dropped Atlas connection,
// a slow failover) in even one request takes down the WebRTC signaling for
// every passenger/executive currently on a call, not just that one request.
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const { Server } = require("socket.io");

const { connectDB } = require("./db");
const { attachSignaling } = require("./socket/signaling");
const { generalLimiter, authLimiter } = require("./middleware/rateLimit");
const { runEscalationSweep } = require("./utils/escalation");
const { validateEnv, getAllowedOrigins } = require("./utils/config");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const passengerRoutes = require("./routes/passengers");
const trainRoutes = require("./routes/trains");
const rfidRoutes = require("./routes/rfid");
const complaintRoutes = require("./routes/complaints");
const fineRoutes = require("./routes/fines");
const callRoutes = require("./routes/calls");
const kbRoutes = require("./routes/kb");
const telephonyRoutes = require("./routes/telephony");
const publicRoutes = require("./routes/public");
const voiceRoutes = require("./routes/voice");

const PORT = process.env.PORT || 4000;

// Last-resort safety net for anything express-async-errors can't reach —
// socket.io event handlers and the setInterval escalation sweep aren't
// Express requests, so a rejected promise there isn't "one request failing,"
// it's the whole process by default. Log it and keep the server up rather
// than dropping every active call because one socket handler hit a hiccup.
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

async function main() {
  validateEnv(); // throws on unsafe production config (missing/weak JWT_SECRET, etc.)
  await connectDB();

  const app = express();

  // Render / Railway / Fly / Koyeb etc. all sit behind a reverse proxy. Without this,
  // express-rate-limit sees every user as the proxy's IP (one shared bucket) and
  // logs a validation error. "1" = trust exactly one proxy hop.
  app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

  // This service is a pure JSON API + WebSocket server (the UI is a separate static
  // site), so a CSP header adds nothing here; the other Helmet headers stay on.
  app.use(helmet({ contentSecurityPolicy: false }));

  const allowedOrigins = getAllowedOrigins(); // null => allow all (local dev)
  app.use(cors(allowedOrigins ? { origin: allowedOrigins } : {}));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // Twilio webhooks are form-encoded, not JSON
  app.use(mongoSanitize()); // strips $/. operators from req.body/query/params — blocks NoSQL injection attempts
  // Health check for the hosting platform + uptime pingers. 503 if MongoDB is down so the
  // platform can restart us, 200 otherwise.
  app.get("/health", (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ ok: dbUp, db: dbUp ? "up" : "down", uptimeSec: Math.round(process.uptime()), ts: Date.now() });
  });
  app.get("/", (_req, res) => res.json({ service: "srlms-server", status: "running" }));

  app.use(generalLimiter);

  app.use("/api/v1/auth", authLimiter, authRoutes); // stricter limit specifically on login/session endpoints
  app.use("/api/v1/passengers", passengerRoutes);
  app.use("/api/v1/trains", trainRoutes);
  app.use("/api/v1/rfid", rfidRoutes);
  app.use("/api/v1/complaints", complaintRoutes);
  app.use("/api/v1/fines", fineRoutes);
  app.use("/api/v1/calls", callRoutes);
  app.use("/api/v1/kb", kbRoutes);
  app.use("/api/v1/telephony", telephonyRoutes);
  app.use("/api/v1/public", publicRoutes); // passenger self-service — verified by PNR+mobile, not JWT
  app.use("/api/v1/voice", voiceRoutes); // STT/TTS proxy to the optional Python ai-service

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: allowedOrigins || "*" } });
  attachSignaling(io);

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`SRLMS server (REST API + WebRTC signaling) listening on port ${PORT}`);
    console.log(`REST base: /api/v1  |  health: /health  |  env: ${process.env.NODE_ENV || "development"}`);
  });

  // Graceful shutdown: hosting platforms send SIGTERM on every deploy/restart.
  const shutdown = (signal) => {
    console.log(`[shutdown] ${signal} received, closing...`);
    io.close();
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref(); // don't hang forever
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // CPGRAMS-style auto-escalation: check every 10 minutes for complaints
  // that have sat too long at their current level. See utils/escalation.js
  // for the thresholds (ESCALATION_LEVEL1_HOURS / ESCALATION_LEVEL2_HOURS).
  const ESCALATION_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
  setInterval(() => {
    runEscalationSweep().catch((err) => console.error("[escalation] sweep failed:", err.message));
  }, ESCALATION_SWEEP_INTERVAL_MS);
  runEscalationSweep().catch((err) => console.error("[escalation] initial sweep failed:", err.message)); // also run once at boot
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
