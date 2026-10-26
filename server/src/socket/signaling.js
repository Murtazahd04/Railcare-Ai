/**
 * WebRTC signaling + call routing, now integrated into the main server,
 * persisting finished calls into MongoDB, and supporting a Supervisor role
 * that can see the live roster, force-transfer a call, and "join" (listen
 * in on) any live call.
 */
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../utils/config");
const Call = require("../models/Call");
const { scoreUrgency, scoreTranscript, TIER_RANK } = require("../utils/sentiment");
const { sendEmail } = require("../utils/email");

// Who gets the SOS email. Falls back to EMAIL_USER (i.e. the same Gmail
// account sends the alert to itself) so this works with zero extra config —
// set SOS_ALERT_EMAIL in .env to point it at a real ops inbox instead.
// Comma-separated list supported (nodemailer accepts a comma-joined `to`).
const SOS_ALERT_EMAIL = process.env.SOS_ALERT_EMAIL || process.env.EMAIL_USER || null;

function attachSignaling(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.data.verified = false;
      return next();
    }
    try {
      const payload = jwt.verify(token, getJwtSecret());
      socket.data.verified = true;
      socket.data.tokenPayload = payload;
      next();
    } catch (err) {
      next(new Error("Invalid or expired token"));
    }
  });

  const executives = new Map(); // socketId -> { name, status, currentCallId }
  const supervisors = new Set(); // socketIds of connected supervisors
  const calls = new Map(); // callId -> { customerId, customerName, executiveId, status, startedAt }
  const waitQueue = []; // [{ socketId, customerName, context, joinedAt }] — FIFO, oldest first

  const AVG_HANDLE_SEC = 150; // ~2.5 min per call ahead of you — used only to estimate wait time
  const RING_TIMEOUT_MS = 25000; // if an executive doesn't accept/decline within this, treat it like a decline

  function clearRingTimer(call) {
    if (call?.ringTimer) {
      clearTimeout(call.ringTimer);
      call.ringTimer = null;
    }
  }

  /** Starts (or restarts) the "nobody answered" timeout for a call that's currently ringing/being transferred. */
  function startRingTimer(call, callId) {
    clearRingTimer(call);
    call.ringTimer = setTimeout(() => {
      const current = calls.get(callId);
      if (current && (current.status === "ringing" || current.status === "transferring")) {
        handleUnansweredOrDeclined(callId, "timeout");
      }
    }, RING_TIMEOUT_MS);
  }

  function queuePayloadFor(socketId) {
    const position = waitQueue.findIndex((q) => q.socketId === socketId);
    if (position === -1) return null;
    return { position: position + 1, estimatedWaitSec: (position + 1) * AVG_HANDLE_SEC };
  }
  function broadcastQueuePositions() {
    waitQueue.forEach((q, idx) => {
      io.to(q.socketId).emit("call:queue-update", { position: idx + 1, estimatedWaitSec: (idx + 1) * AVG_HANDLE_SEC });
    });
  }

  function rosterPayload() {
    return [...executives.entries()].map(([id, e]) => {
      const call = e.currentCallId ? calls.get(e.currentCallId) : null;
      return {
        id,
        name: e.name,
        status: e.status,
        currentCallId: e.currentCallId || null,
        peerName: call ? call.customerName : null,
        callStartedAt: call ? call.startedAt : null,
      };
    });
  }
  function broadcastRoster() {
    io.emit("executives:roster", rosterPayload());
  }
  function newCallId() {
    return "CALL-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  // excludeIds: array of executive socket ids to skip — used to walk the
  // roster one-by-one per customer without re-ringing someone already tried
  // for this same call chain (avoids ping-ponging between two executives).
  function pickAvailableExecutive(excludeIds = []) {
    const exclude = new Set(excludeIds);
    for (const [id, e] of executives.entries()) {
      if (e.status === "available" && !exclude.has(id)) return id;
    }
    return null;
  }

  /**
   * Rings a specific executive for a specific waiting customer socket.
   * `attemptedIds` carries forward every executive already tried in this
   * call chain (so the next retry, if any, skips them) and `previousExecutiveName`
   * / `previousOutcome` let the customer's UI say *why* it moved on — "Priya
   * was busy, trying Raj…" instead of just silently changing the ringing name.
   */
  function ringExecutive(executiveId, customerSocketId, customerName, context, urgency, attemptedIds = [], previousExecutiveName = null, previousOutcome = null) {
    const executive = executives.get(executiveId);
    const callId = newCallId();
    executive.status = "busy";
    executive.currentCallId = callId;
    const allAttempted = [...attemptedIds, executiveId];
    const call = {
      customerId: customerSocketId,
      customerName: customerName || "Passenger",
      verifiedCustomerId: null,
      executiveId,
      status: "ringing",
      startedAt: Date.now(),
      context,
      urgency,
      attemptedIds: allAttempted,
    };
    calls.set(callId, call);
    broadcastRoster();
    io.to(customerSocketId).emit("call:ringing", {
      callId,
      executiveName: executive.name,
      previousExecutiveName,
      previousOutcome, // "busy" | "declined" | "no-answer" | null (first attempt)
      attempt: allAttempted.length,
      executivesOnline: executives.size,
    });
    io.to(executiveId).emit("call:incoming", { callId, customerId: customerSocketId, customerName, context, urgency });

    // If nobody at the console taps Accept/Decline within this window, don't
    // leave the customer hanging on "Ringing..." forever — treat it exactly
    // like a decline so it automatically tries the next free executive.
    startRingTimer(call, callId);
  }

  /**
   * Shared by an explicit Decline and a ring timeout. Frees the executive,
   * persists the outcome, and — this is the actual fix for "one executive
   * busy/declining shouldn't strand the customer" — immediately tries the
   * next available executive (excluding whoever just declined/ignored it).
   * If truly nobody is free, the customer is put back in the wait queue
   * with the same "you're #N in line" experience as a first-time queue,
   * rather than just being dropped.
   */
  async function handleUnansweredOrDeclined(callId, reason) {
    const call = calls.get(callId);
    if (!call) return;
    clearRingTimer(call);

    const decliningExecutiveId = call.executiveId;
    const executive = executives.get(decliningExecutiveId);
    const decliningName = executive?.name || "the executive";
    if (executive && executive.currentCallId === callId) {
      executive.status = "available";
      executive.currentCallId = null;
    }

    await persistCall(callId, "missed");
    calls.delete(callId);
    broadcastRoster();

    // call.attemptedIds is only populated by ringExecutive() at the moment a
    // call first starts ringing — a transfer changes call.executiveId without
    // touching that list, so on its own it can be stale and NOT contain the
    // executive who just declined/timed-out a transfer. Union it in here so
    // we never re-ring the same person who just turned this call down.
    const attemptedIds = (call.attemptedIds || []).includes(decliningExecutiveId)
      ? call.attemptedIds
      : [...(call.attemptedIds || []), decliningExecutiveId];
    const outcome = reason === "declined" ? "declined" : reason === "timeout" ? "no-answer" : "unavailable";
    const nextExecutiveId = pickAvailableExecutive(attemptedIds);
    if (nextExecutiveId) {
      // ringExecutive immediately emits a fresh "call:ringing" to the customer
      // naming who was just tried and why we moved on — "Priya didn't answer,
      // trying Raj…" — so the customer sees it cycling in real time, not a
      // silent name-swap.
      ringExecutive(nextExecutiveId, call.customerId, call.customerName, call.context, call.urgency, attemptedIds, decliningName, outcome);
    } else {
      // Nobody free at all, and every executive who *was* free has now been
      // tried and either declined or didn't pick up — a full cycle with no
      // luck. Put the customer in the wait queue (so they still get called
      // back automatically) AND tell them plainly it may take a while, with
      // `exhausted: true` so the UI can offer "submit a query instead" right
      // alongside the queue position, rather than leaving them staring at a
      // spinner.
      const entry = {
        socketId: call.customerId,
        customerName: call.customerName,
        context: call.context,
        joinedAt: Date.now(),
        urgency: call.urgency || { tier: "normal", score: 0, reasons: [] },
      };
      const insertAt = waitQueue.findIndex((q) => TIER_RANK[q.urgency.tier] < TIER_RANK[entry.urgency.tier]);
      if (insertAt === -1) waitQueue.push(entry); else waitQueue.splice(insertAt, 0, entry);
      broadcastQueuePositions();
      const q = queuePayloadFor(call.customerId);
      io.to(call.customerId).emit("call:queued", { ...q, exhausted: true, lastTriedExecutiveName: decliningName, lastOutcome: outcome });
    }

    // the executive who just declined/timed-out is free again — let them
    // pick up whoever's been waiting longest, if anyone
    tryDequeue();
  }

  /** Whenever an executive frees up, pull the highest-urgency, longest-waiting customer off the queue. */
  function tryDequeue() {
    if (waitQueue.length === 0) return;
    const executiveId = pickAvailableExecutive();
    if (!executiveId) return;
    const next = waitQueue.shift();
    broadcastQueuePositions();
    ringExecutive(executiveId, next.socketId, next.customerName, next.context, next.urgency);
  }

  async function persistCall(callId, status, extra = {}) {
    const call = calls.get(callId);
    if (!call) return;
    const durationSec = call.startedAt ? Math.round((Date.now() - call.startedAt) / 1000) : 0;
    try {
      await Call.create({
        callId,
        customerName: call.customerName,
        customerId: call.verifiedCustomerId,
        executiveName: (executives.get(call.executiveId) || {}).name || call.lastExecutiveName,
        status,
        source: "webrtc",
        durationSec,
        topic: call.context?.topic,
        customerPnr: call.context?.pnr,
        aiIntent: call.context?.aiIntent,
        aiConfidence: call.context?.aiConfidence,
        aiTranscript: call.context?.transcript || [],
        urgencyTier: call.urgency?.tier || "normal",
        urgencyReasons: call.urgency?.reasons || [],
        ...extra,
      });
    } catch (err) {
      console.error("[signaling] failed to persist call", callId, err.message);
    }
  }

  /** shared by both executive-initiated transfer and supervisor force-transfer */
  function performTransfer(callId, targetExecutiveId, requestingSocket) {
    const call = calls.get(callId);
    if (!call) return { ok: false, reason: "Call not found" };
    const target = executives.get(targetExecutiveId);
    if (!target || target.status !== "available") {
      return { ok: false, reason: "Target executive unavailable" };
    }

    const oldExecutiveId = call.executiveId;
    const oldExecutive = executives.get(oldExecutiveId);
    if (oldExecutive) {
      oldExecutive.status = "available";
      oldExecutive.currentCallId = null;
    }
    target.status = "busy";
    target.currentCallId = callId;

    call.transferredFrom = oldExecutive ? oldExecutive.name : "Unknown";
    call.executiveId = targetExecutiveId;
    call.status = "transferring";
    broadcastRoster();

    io.to(call.customerId).emit("call:transferring", { callId, newExecutiveName: target.name });
    io.to(oldExecutiveId).emit("call:transferred-out", { callId });
    io.to(targetExecutiveId).emit("call:incoming-transfer", {
      callId,
      customerId: call.customerId,
      customerName: call.customerName,
      fromExecutiveName: oldExecutive ? oldExecutive.name : "Unknown",
      forcedBySupervisor: requestingSocket?.data?.role === "supervisor",
      context: call.context || null,
    });
    startRingTimer(call, callId); // if the transfer target also doesn't respond, don't strand the customer
    tryDequeue();
    return { ok: true };
  }

  io.on("connection", (socket) => {
    socket.data.role = null;

    socket.on("executive:register", ({ name }) => {
      socket.data.role = "executive";
      socket.data.name = name;
      executives.set(socket.id, { name, status: "available", currentCallId: null });
      socket.emit("executives:roster", rosterPayload());
      broadcastRoster();
    });

    // supervisors don't take calls themselves — they watch the roster and
    // can intervene (force-transfer, monitor/join a live call)
    socket.on("supervisor:register", ({ name }) => {
      socket.data.role = "supervisor";
      socket.data.name = name;
      supervisors.add(socket.id);
      socket.emit("executives:roster", rosterPayload());
    });

    socket.on("customer:register", ({ name }) => {
      socket.data.role = "customer";
      const verifiedName = socket.data.tokenPayload?.name;
      socket.data.name = verifiedName || name || "Passenger";
      socket.data.verifiedCustomerId = socket.data.verified ? socket.data.tokenPayload?.customerId : null;
    });

    socket.on("customer:call", (payload = {}) => {
      const context = payload.context || null; // { topic, pnr, transcript, aiIntent, aiConfidence, isEmergency }
      // Sentiment/urgency-based priority: an emergency or clearly frustrated
      // caller shouldn't sit behind routine queries just because they
      // called a minute later. Computed from whatever transcript/topic the
      // AI step already gathered — no extra step for the caller.
      // An explicit SOS button press always wins over keyword-based scoring —
      // don't make a passenger's actual safety depend on their transcript
      // happening to contain a word the sentiment scorer recognizes.
      const urgency = context?.isEmergency
        ? { tier: "emergency", score: 999, reasons: ["Passenger pressed the SOS button"] }
        : scoreUrgency([context?.topic, ...(context?.transcript || []).map((t) => t.text)].filter(Boolean).join(". "));

      if (context?.isEmergency) {
        // Every connected executive AND supervisor gets an alert immediately,
        // independent of who ends up actually ringing — so someone can jump
        // in manually (force-transfer, or just physically respond) even
        // before the normal one-at-a-time ring cycle would reach them.
        const alert = {
          customerName: socket.data.name || "Passenger",
          pnr: context?.pnr || null,
          at: Date.now(),
        };
        for (const execId of executives.keys()) io.to(execId).emit("sos:alert", alert);
        for (const supId of supervisors.keys()) io.to(supId).emit("sos:alert", alert);

        // Trial Twilio accounts can't place real outbound calls to
        // unverified numbers, so SOS notifies ops by email instead of
        // trying (and failing) to place a phone call. Fire-and-forget —
        // an email failure must never block the actual emergency routing
        // below, same "never break the call" philosophy as elsewhere here.
        if (SOS_ALERT_EMAIL) {
          sendEmail(
            SOS_ALERT_EMAIL,
            `🚨 SOS pressed — ${alert.customerName}${alert.pnr ? ` (PNR ${alert.pnr})` : ""}`,
            `Emergency SOS button was pressed.\n\nPassenger: ${alert.customerName}\nPNR: ${alert.pnr || "not provided"}\nTime: ${new Date(alert.at).toLocaleString("en-IN")}\n\nThe passenger is being connected to the next available executive in-app now. This email is a backup alert in case no executive is online to see the dashboard banner.\n\n— Indian Railways SRLMS`
          ).catch(() => {});
        } else {
          console.log("[sos] SOS_ALERT_EMAIL/EMAIL_USER not set — skipping SOS email alert");
        }
      }

      const executiveId = pickAvailableExecutive();
      if (!executiveId) {
        // every executive is busy — queue the customer instead of dropping the call.
        // Insert ahead of anyone with a strictly lower urgency tier (stable
        // within the same tier, so it's still first-come-first-served among equals).
        const entry = { socketId: socket.id, customerName: socket.data.name || "Passenger", context, joinedAt: Date.now(), urgency };
        const insertAt = waitQueue.findIndex((q) => TIER_RANK[q.urgency.tier] < TIER_RANK[urgency.tier]);
        if (insertAt === -1) waitQueue.push(entry); else waitQueue.splice(insertAt, 0, entry);
        broadcastQueuePositions();
        const q = queuePayloadFor(socket.id);
        socket.emit("call:queued", q);
        return;
      }
      ringExecutive(executiveId, socket.id, socket.data.name || "Passenger", context, urgency);
    });

    socket.on("call:cancel-queue", () => {
      const idx = waitQueue.findIndex((q) => q.socketId === socket.id);
      if (idx !== -1) {
        waitQueue.splice(idx, 1);
        broadcastQueuePositions();
        socket.emit("call:queue-cancelled");
      }
    });

    socket.on("call:accept", ({ callId }) => {
      const call = calls.get(callId);
      if (!call) return;
      clearRingTimer(call);
      call.status = "connected";
      io.to(call.customerId).emit("call:accepted", { callId, executiveId: socket.id });
    });

    socket.on("call:reject", async ({ callId }) => {
      await handleUnansweredOrDeclined(callId, "declined");
    });

    // generic WebRTC relay — used for customer<->executive AND
    // executive<->supervisor (monitor) connections; both just need a
    // callId + targetId + sdp/candidate, so one relay path serves both.
    socket.on("webrtc:offer", ({ callId, targetId, sdp }) => {
      io.to(targetId).emit("webrtc:offer", { callId, fromId: socket.id, sdp });
    });
    socket.on("webrtc:answer", ({ callId, targetId, sdp }) => {
      io.to(targetId).emit("webrtc:answer", { callId, fromId: socket.id, sdp });
    });
    socket.on("webrtc:ice-candidate", ({ callId, targetId, candidate }) => {
      io.to(targetId).emit("webrtc:ice-candidate", { callId, fromId: socket.id, candidate });
    });

    // dedicated relay for supervisor monitor connections — kept separate
    // from the main webrtc:* relay above so an executive's "listen-in"
    // connection to a supervisor never collides with their primary call
    // connection to the customer.
    socket.on("monitor:offer", ({ targetId, sdp }) => {
      io.to(targetId).emit("monitor:offer", { fromId: socket.id, sdp });
    });
    socket.on("monitor:answer", ({ targetId, sdp }) => {
      io.to(targetId).emit("monitor:answer", { fromId: socket.id, sdp });
    });
    socket.on("monitor:ice-candidate", ({ targetId, candidate }) => {
      io.to(targetId).emit("monitor:ice-candidate", { fromId: socket.id, candidate });
    });

    socket.on("call:transfer", ({ callId, targetExecutiveId }) => {
      const result = performTransfer(callId, targetExecutiveId, socket);
      if (!result.ok) socket.emit("call:transfer-failed", { callId, reason: result.reason });
    });

    // supervisor-only: force-transfer someone else's active call
    socket.on("supervisor:force-transfer", ({ executiveSocketId, targetExecutiveId }) => {
      if (socket.data.role !== "supervisor") return;
      const executive = executives.get(executiveSocketId);
      if (!executive || !executive.currentCallId) {
        socket.emit("supervisor:action-failed", { reason: "That executive has no active call" });
        return;
      }
      const result = performTransfer(executive.currentCallId, targetExecutiveId, socket);
      if (!result.ok) socket.emit("supervisor:action-failed", { reason: result.reason });
    });

    // supervisor-only: request to listen in on a live call. The target
    // executive's browser builds a *second*, separate RTCPeerConnection
    // carrying its mixed local+remote audio (same mixing trick used for
    // call recording) and offers it to the supervisor — customer and the
    // primary executive are completely unaffected.
    socket.on("supervisor:monitor", ({ executiveSocketId }) => {
      if (socket.data.role !== "supervisor") return;
      const executive = executives.get(executiveSocketId);
      if (!executive || !executive.currentCallId) {
        socket.emit("supervisor:action-failed", { reason: "That executive has no active call to monitor" });
        return;
      }
      io.to(executiveSocketId).emit("monitor:requested", {
        supervisorId: socket.id,
        supervisorName: socket.data.name,
        callId: executive.currentCallId,
      });
    });

    socket.on("monitor:stop", ({ executiveSocketId }) => {
      io.to(executiveSocketId).emit("monitor:stop");
    });

    socket.on("call:accept-transfer", ({ callId }) => {
      const call = calls.get(callId);
      if (!call) return;
      clearRingTimer(call);
      call.status = "connected";
      const executive = executives.get(socket.id);
      if (executive) executive.currentCallId = callId;
      io.to(call.customerId).emit("call:accepted", { callId, executiveId: socket.id });
    });

    socket.on("call:end", async ({ callId }) => {
      const call = calls.get(callId);
      if (!call) return;
      clearRingTimer(call);
      const executive = executives.get(call.executiveId);
      if (executive) { executive.status = "available"; executive.currentCallId = null; }
      const otherId = socket.id === call.customerId ? call.executiveId : call.customerId;
      // who hung up matters to the customer's UI: if the executive cut the
      // call, the client shows "try again later / submit a query" instead of
      // the normal end-of-call rating prompt.
      const endedBy = socket.id === call.customerId ? "customer" : "executive";
      io.to(otherId).emit("call:ended", { callId, endedBy });
      io.to(call.executiveId).emit("monitor:stop"); // kick any supervisor listening in too
      await persistCall(callId, call.transferredFrom ? "transferred" : "completed", {
        transferredFrom: call.transferredFrom,
      });
      calls.delete(callId);
      broadcastRoster();
      tryDequeue();
    });

    socket.on("call:mute-state", ({ callId, muted }) => {
      const call = calls.get(callId);
      if (!call) return;
      const otherId = socket.id === call.customerId ? call.executiveId : call.customerId;
      io.to(otherId).emit("call:peer-mute-state", { callId, muted });
    });

    socket.on("disconnect", async () => {
      supervisors.delete(socket.id);
      const queuedIdx = waitQueue.findIndex((q) => q.socketId === socket.id);
      if (queuedIdx !== -1) {
        waitQueue.splice(queuedIdx, 1);
        broadcastQueuePositions();
      }
      let freedAnExecutive = false;
      if (executives.has(socket.id)) {
        executives.delete(socket.id);
        broadcastRoster();
      }
      for (const [callId, call] of calls.entries()) {
        if (call.customerId === socket.id) {
          // the customer hung up / closed their tab — just end it for whoever they were with
          clearRingTimer(call);
          io.to(call.executiveId).emit("call:ended", { callId, reason: "peer-disconnected" });
          const executive = executives.get(call.executiveId);
          if (executive) { executive.status = "available"; executive.currentCallId = null; freedAnExecutive = true; }
          await persistCall(callId, "missed");
          calls.delete(callId);
        } else if (call.executiveId === socket.id) {
          if (call.status === "ringing" || call.status === "transferring") {
            // the executive vanished before ever picking up — same fix as an
            // explicit decline or a ring timeout: try someone else instead
            // of just dropping the customer's call.
            await handleUnansweredOrDeclined(callId, "executive-disconnected");
          } else {
            // call was already connected and the executive dropped mid-conversation
            clearRingTimer(call);
            io.to(call.customerId).emit("call:ended", { callId, reason: "peer-disconnected", endedBy: "executive" });
            await persistCall(callId, "missed");
            calls.delete(callId);
            freedAnExecutive = true; // the executive slot itself was already removed above, but say so for the dequeue check below
          }
        }
      }
      broadcastRoster();
      if (freedAnExecutive) tryDequeue();
    });
  });
}

module.exports = { attachSignaling };
