import { useEffect, useRef, useState, useCallback } from "react";
import { mixStreams } from "./callRecorder";
import { ICE_SERVERS } from "./iceConfig";

/**
 * useCallEngine
 * ----------------------------------------------------------------
 * One hook, two roles ('customer' | 'executive'). Handles:
 *  - socket registration
 *  - getUserMedia (real mic)
 *  - RTCPeerConnection lifecycle (create / renegotiate / close)
 *  - offer/answer/ICE exchange
 *  - transfer (tear down + rebuild peer connection with new party)
 *
 * Requires `socket.io-client`.
 * Usage:
 *   const engine = useCallEngine({ socket, role: "executive", name: "Agent Priya" });
 * ---------------------------------------------------------------- */



export function useCallEngine({ socket, role, name }) {
  const [status, setStatus] = useState("idle"); // idle | ringing-out | ringing-in | connected | ended
  const [callId, setCallId] = useState(null);
  const [peerName, setPeerName] = useState(null); // who we're talking to
  const [incoming, setIncoming] = useState(null); // { callId, customerName, ... } for executive
  const [callContext, setCallContext] = useState(null); // { topic, pnr, transcript, aiIntent, aiConfidence }
  const [roster, setRoster] = useState([]); // executive list (for transfer target picking)
  const [queueInfo, setQueueInfo] = useState(null); // { position, estimatedWaitSec, exhausted, lastTriedExecutiveName, lastOutcome } while waiting for a free executive
  const [retryInfo, setRetryInfo] = useState(null); // { previousExecutiveName, previousOutcome, attempt, executivesOnline } — live "X was busy, trying Y" status
  const [endInfo, setEndInfo] = useState(null); // { endedBy: "customer" | "executive" } for the call that just ended
  const [muted, setMuted] = useState(false);
  const [peerMuted, setPeerMuted] = useState(false);
  const [error, setError] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null); // raw MediaStream, used for call recording
  const remoteAudioRef = useRef(null); // attach to an <audio autoPlay> element
  const internalAudioRef = useRef(null); // persistent audio player immune to React view re-renders
  const pendingCandidatesRef = useRef(new Map());
  const activePeerKeyRef = useRef(null);
  const targetIdRef = useRef(null); // socket id of current call partner
  const callIdRef = useRef(null);
  const monitorPcRef = useRef(null); // separate connection feeding a supervisor's "listen in"

  useEffect(() => { callIdRef.current = callId; }, [callId]);

  // Create persistent Audio object on mount so voice playback is independent of component DOM mounting
  useEffect(() => {
    if (typeof window !== "undefined") {
      const el = new Audio();
      el.autoplay = true;
      el.playsInline = true;
      internalAudioRef.current = el;
      return () => {
        el.pause();
        el.srcObject = null;
      };
    }
  }, []);

  // Keep remote audio element synced whenever the DOM element or stream changes
  useEffect(() => {
    if (remoteAudioRef.current && remoteStreamRef.current && remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.play?.().catch(() => {});
    }
  });

  // ---- register on mount ---------------------------------------------
  useEffect(() => {
    if (!socket) return;
    if (role === "executive") socket.emit("executive:register", { name });
    else socket.emit("customer:register", { name });
  }, [socket, role, name]);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current && localStreamRef.current.active && localStreamRef.current.getAudioTracks().length > 0) {
      return localStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    localStreamRef.current = stream;
    console.log(`[webrtc:${role}] local microphone captured:`, stream.getAudioTracks().map((t) => t.label).join(", "));
    return stream;
  }, [role]);

  function closePeer(preservePendingKey = null) {
    if (activePeerKeyRef.current && activePeerKeyRef.current !== preservePendingKey) {
      pendingCandidatesRef.current.delete(activePeerKeyRef.current);
    }
    activePeerKeyRef.current = null;
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (internalAudioRef.current) {
      internalAudioRef.current.pause();
      internalAudioRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }

  const addCandidate = useCallback(async (candidate, callId, fromId) => {
    if (!candidate || !callId || !fromId) return;
    const key = `${callId}:${fromId}`;
    const pc = pcRef.current;
    if (pc && activePeerKeyRef.current === key && pc.remoteDescription?.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("[webrtc] addIceCandidate error:", err);
      }
    } else {
      const candidates = pendingCandidatesRef.current.get(key) || [];
      candidates.push(candidate);
      pendingCandidatesRef.current.set(key, candidates);
    }
  }, []);

  const flushPendingCandidates = useCallback(async (key) => {
    const pc = pcRef.current;
    if (!pc || activePeerKeyRef.current !== key || !pc.remoteDescription) return;
    while (pendingCandidatesRef.current.has(key)) {
      const candidates = pendingCandidatesRef.current.get(key);
      pendingCandidatesRef.current.delete(key);
      for (const candidate of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn("[webrtc] error applying buffered candidate:", err);
        }
      }
    }
  }, []);

  const unlockAudio = useCallback(() => {
    if (internalAudioRef.current) internalAudioRef.current.play?.().catch(() => {});
    if (remoteAudioRef.current) remoteAudioRef.current.play?.().catch(() => {});
  }, []);

  async function buildPeerConnection(targetId, isOfferer, peerCallId) {
    const key = `${peerCallId}:${targetId}`;
    closePeer(key);
    const stream = await ensureLocalStream();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    activePeerKeyRef.current = key;
    targetIdRef.current = targetId;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      console.log(`[webrtc:${role}] remote audio track received:`, event.track);
      const stream = event.streams[0] || new MediaStream([event.track]);
      remoteStreamRef.current = stream;

      // 1. Play through persistent internal audio element
      if (internalAudioRef.current) {
        internalAudioRef.current.srcObject = stream;
        internalAudioRef.current.play?.().catch((err) => {
          console.warn(`[webrtc:${role}] internalAudio play rejected (autoplay):`, err);
        });
      }

      // 2. Play through React DOM audio element
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play?.().catch((err) => {
          console.warn(`[webrtc:${role}] DOM audio play() rejected (autoplay):`, err);
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[webrtc:${role}] iceConnectionState:`, pc.iceConnectionState);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:ice-candidate", {
          callId: peerCallId,
          targetId,
          candidate: event.candidate,
        });
      }
    };

    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { callId: peerCallId, targetId, sdp: offer });
    }
    return pc;
  }

  // ---- socket event wiring --------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const onRoster = (list) => setRoster(list.filter((e) => e.name !== name));

    // customer side
    const onRinging = ({ callId, executiveName, previousExecutiveName, previousOutcome, attempt, executivesOnline }) => {
      setCallId(callId);
      setStatus("ringing-out");
      setPeerName(executiveName);
      setQueueInfo(null);
      setError(null);
      // previousExecutiveName is only present from the 2nd attempt onward —
      // that's what drives the "Priya was busy, trying Raj…" live status
      // instead of the ringing name just silently changing.
      setRetryInfo(previousExecutiveName ? { previousExecutiveName, previousOutcome, attempt, executivesOnline } : null);
    };
    const onNoExecutive = () => {
      setStatus("idle");
      setError("No executive available right now. Please try again shortly.");
    };
    const onQueued = (info) => {
      setStatus("queued");
      setQueueInfo(info);
      setError(null);
    };
    const onQueueUpdate = (info) => setQueueInfo(info);
    const onQueueCancelled = () => {
      setStatus("idle");
      setQueueInfo(null);
    };
    const onAccepted = async ({ callId: cid, executiveId }) => {
      callIdRef.current = cid;
      setCallId(cid);
      setStatus("connected");
      await buildPeerConnection(executiveId, true, cid);
    };
    const onRejected = () => {
      callIdRef.current = null;
      pendingCandidatesRef.current.clear();
      setStatus("idle");
      setCallId(null);
      setError("Call was declined.");
    };

    // executive side
    const onIncoming = ({ callId, customerName, context, urgency }) => {
      setIncoming({ callId, customerName, kind: "new", context, urgency });
      setStatus("ringing-in");
    };
    const onIncomingTransfer = ({ callId, customerName, fromExecutiveName, context }) => {
      setIncoming({ callId, customerName, fromExecutiveName, kind: "transfer", context });
      setStatus("ringing-in");
    };
    const onTransferredOut = () => {
      // this executive no longer owns the call
      closePeer();
      setStatus("idle");
      setCallId(null);
      setPeerName(null);
    };

    // shared
    const onOffer = async ({ callId: cid, fromId, sdp }) => {
      callIdRef.current = cid;
      setCallId(cid);
      const pc = await buildPeerConnection(fromId, false, cid);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushPendingCandidates(`${cid}:${fromId}`);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { callId: cid, targetId: fromId, sdp: answer });
      setStatus("connected");
    };
    const onAnswer = async ({ callId: cid, fromId, sdp }) => {
      const pc = pcRef.current;
      const key = `${cid}:${fromId}`;
      if (pc && activePeerKeyRef.current === key) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushPendingCandidates(key);
      }
    };
    const onIceCandidate = async ({ callId: cid, fromId, candidate }) => {
      await addCandidate(candidate, cid, fromId);
    };
    const onTransferring = ({ newExecutiveName }) => {
      setStatus("transferring");
      setPeerName(newExecutiveName);
      closePeer(); // old peer connection torn down; new offer/answer follows shortly
    };
    const onEnded = ({ endedBy } = {}) => {
      closePeer();
      pendingCandidatesRef.current.clear();
      callIdRef.current = null;
      setStatus("ended");
      setEndInfo(role === "customer" ? { endedBy: endedBy || null } : null);
      setTimeout(() => setStatus("idle"), 1200);
      setCallId(null);
      setPeerName(null);
      setIncoming(null);
      setCallContext(null);
    };
    const onPeerMute = ({ muted }) => setPeerMuted(muted);

    // --- supervisor "listen in" support (executive side only) ---
    const closeMonitorPeer = () => {
      if (monitorPcRef.current) {
        monitorPcRef.current.close();
        monitorPcRef.current = null;
      }
    };
    const onMonitorRequested = async ({ supervisorId }) => {
      if (role !== "executive") return;
      closeMonitorPeer();
      const { stream: mixed } = mixStreams(localStreamRef.current, remoteStreamRef.current);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      monitorPcRef.current = pc;
      mixed.getTracks().forEach((track) => pc.addTrack(track, mixed));
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("monitor:ice-candidate", { targetId: supervisorId, candidate: event.candidate });
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("monitor:offer", { targetId: supervisorId, sdp: offer });
    };
    const onMonitorStop = () => closeMonitorPeer();
    const onMonitorAnswer = async ({ sdp }) => {
      if (monitorPcRef.current) await monitorPcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    };
    const onMonitorIce = async ({ candidate }) => {
      if (monitorPcRef.current && candidate) {
        try { await monitorPcRef.current.addIceCandidate(candidate); } catch { /* ignore */ }
      }
    };

    socket.on("executives:roster", onRoster);
    socket.on("call:ringing", onRinging);
    socket.on("call:no-executive-available", onNoExecutive);
    socket.on("call:queued", onQueued);
    socket.on("call:queue-update", onQueueUpdate);
    socket.on("call:queue-cancelled", onQueueCancelled);
    socket.on("call:accepted", onAccepted);
    socket.on("call:rejected", onRejected);
    socket.on("call:incoming", onIncoming);
    socket.on("call:incoming-transfer", onIncomingTransfer);
    socket.on("call:transferred-out", onTransferredOut);
    socket.on("call:transferring", onTransferring);
    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice-candidate", onIceCandidate);
    socket.on("call:ended", onEnded);
    socket.on("call:peer-mute-state", onPeerMute);
    socket.on("monitor:requested", onMonitorRequested);
    socket.on("monitor:stop", onMonitorStop);
    socket.on("monitor:answer", onMonitorAnswer);
    socket.on("monitor:ice-candidate", onMonitorIce);

    return () => {
      socket.off("executives:roster", onRoster);
      socket.off("call:ringing", onRinging);
      socket.off("call:no-executive-available", onNoExecutive);
      socket.off("call:queued", onQueued);
      socket.off("call:queue-update", onQueueUpdate);
      socket.off("call:queue-cancelled", onQueueCancelled);
      socket.off("call:accepted", onAccepted);
      socket.off("call:rejected", onRejected);
      socket.off("call:incoming", onIncoming);
      socket.off("call:incoming-transfer", onIncomingTransfer);
      socket.off("call:transferred-out", onTransferredOut);
      socket.off("call:transferring", onTransferring);
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice-candidate", onIceCandidate);
      socket.off("call:ended", onEnded);
      socket.off("call:peer-mute-state", onPeerMute);
      socket.off("monitor:requested", onMonitorRequested);
      socket.off("monitor:stop", onMonitorStop);
      socket.off("monitor:answer", onMonitorAnswer);
      socket.off("monitor:ice-candidate", onMonitorIce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, name]);

  // ---- public actions --------------------------------------------------
  const placeCall = useCallback((context) => {
    unlockAudio();
    setError(null);
    setRetryInfo(null);
    setEndInfo(null);
    setCallContext(context || null); // so the caller's own UI can read back topic/pnr/isEmergency etc. immediately
    socket.emit("customer:call", { context });
  }, [socket, unlockAudio]);

  const acceptCall = useCallback(() => {
    if (!incoming) return;
    unlockAudio();
    const isTransfer = incoming.kind === "transfer";
    socket.emit(isTransfer ? "call:accept-transfer" : "call:accept", { callId: incoming.callId });
    setCallId(incoming.callId);
    setPeerName(isTransfer ? incoming.fromExecutiveName : incoming.customerName);
    setCallContext(incoming.context || null);
    setIncoming(null);
  }, [socket, incoming, unlockAudio]);

  const rejectCall = useCallback(() => {
    if (!incoming) return;
    socket.emit("call:reject", { callId: incoming.callId });
    setIncoming(null);
    setStatus("idle");
  }, [socket, incoming]);

  const endCall = useCallback(() => {
    if (callIdRef.current) socket.emit("call:end", { callId: callIdRef.current });
    closePeer();
    pendingCandidatesRef.current.clear();
    callIdRef.current = null;
    setStatus("idle");
    setCallId(null);
    setPeerName(null);
  }, [socket]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    if (callIdRef.current) socket.emit("call:mute-state", { callId: callIdRef.current, muted: next });
  }, [muted, socket]);

  /** executive-only: hand the active call to another online executive */
  const transferCall = useCallback((targetExecutiveId) => {
    if (!callIdRef.current) return;
    socket.emit("call:transfer", { callId: callIdRef.current, targetExecutiveId });
  }, [socket]);

  /** customer-only: leave the wait queue before an executive picks up */
  const cancelQueue = useCallback(() => {
    socket.emit("call:cancel-queue");
  }, [socket]);

  const setSpeaker = useCallback((on) => {
    if (internalAudioRef.current) internalAudioRef.current.muted = !on;
    if (remoteAudioRef.current) remoteAudioRef.current.muted = !on;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    status, callId, peerName, incoming, roster, muted, peerMuted, error, callContext, queueInfo, retryInfo, endInfo,
    remoteAudioRef, localStreamRef, remoteStreamRef,
    placeCall, startCall: placeCall, acceptCall, rejectCall, endCall, toggleMute, transferCall, cancelQueue, clearError,
    setSpeaker, unlockAudio,
  };
}
