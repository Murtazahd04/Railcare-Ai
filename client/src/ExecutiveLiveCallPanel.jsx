import React, { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, PhoneForwarded, Mic, MicOff, PhoneIncoming, Disc, Bot, Tag, Ticket, Gauge, AlertTriangle, Repeat } from "lucide-react";
import { startCallRecording, uploadRecording } from "./callRecorder";
import { API_BASE } from "./config";

/**
 * Drop this into ExecutiveDashboard.jsx:
 *
 *   import { io } from "socket.io-client";
 *   import { useCallEngine } from "./useCallEngine";
 *   import ExecutiveLiveCallPanel from "./ExecutiveLiveCallPanel";
 *
 *   const socket = useMemo(() => io("http://localhost:4000", { auth: { token } }), [token]);
 *   const engine = useCallEngine({ socket, role: "executive", name: "Agent Priya" });
 *
 *   <ExecutiveLiveCallPanel engine={engine} token={token} />
 *
 * This panel is intentionally separate from the mock "Block Signal Board"
 * queue — real calls ring in via engine.incoming regardless of what the
 * simulated AI queue is doing, exactly like a real softphone widget would
 * sit alongside a CRM.
 *
 * It also records every connected call (local mic + remote peer mixed) and
 * uploads it to MongoDB (via GridFS on the backend) once the call ends.
 */
export default function ExecutiveLiveCallPanel({ engine, token }) {
  const {
    status, callId, peerName, incoming, roster, muted, peerMuted, error, callContext,
    remoteAudioRef, localStreamRef, remoteStreamRef,
    acceptCall, rejectCall, endCall, toggleMute, transferCall,
  } = engine;

  const [recordingState, setRecordingState] = useState("idle"); // idle | recording | uploading | saved | failed
  const [profile, setProfile] = useState(null); // { passenger, complaints, fines } fetched by PNR
  const [profileError, setProfileError] = useState(null);
  const recorderRef = useRef(null);
  const lastCallIdRef = useRef(null);

  // whenever the caller's PNR becomes known (incoming card or active call), pull their full record
  const activePnr = incoming?.context?.pnr || callContext?.pnr || null;
  useEffect(() => {
    if (!activePnr) { setProfile(null); setProfileError(null); return; }
    let cancelled = false;
    setProfile(null);
    setProfileError(null);
    fetch(`${API_BASE}/passengers/by-pnr/${encodeURIComponent(activePnr)}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No passenger record for this PNR"))))
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((err) => { if (!cancelled) setProfileError(err.message); });
    return () => { cancelled = true; };
  }, [activePnr, token]);

  // start recording the moment a call connects
  useEffect(() => {
    if (status === "connected" && !recorderRef.current) {
      lastCallIdRef.current = callId;
      recorderRef.current = startCallRecording(localStreamRef.current, remoteStreamRef.current);
      setRecordingState("recording");
    }
  }, [status, callId, localStreamRef, remoteStreamRef]);

  // when the call ends, stop the recorder and upload what we captured
  useEffect(() => {
    if ((status === "idle" || status === "ended") && recorderRef.current) {
      const recorder = recorderRef.current;
      const finishedCallId = lastCallIdRef.current;
      recorderRef.current = null;
      setRecordingState("uploading");

      recorder.stop().then(async (blob) => {
        try {
          await uploadRecording(finishedCallId, blob, token);
          setRecordingState("saved");
        } catch (err) {
          console.error("[recording] upload failed:", err.message);
          setRecordingState("failed");
        }
      });
    }
  }, [status, token]);

  return (
    <div className="rounded-lg border border-[#BBF7D0] bg-gradient-to-br from-white via-[#F0FDF4] to-[#DCFCE7] p-4 space-y-3">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#64748B]">Real Call Line</span>
        <span className="font-mono text-[11px] text-[#64748B]">{status}</span>
      </div>

      {error && (
        <div className="text-xs text-[#E5484D] bg-[#E5484D]/10 border border-[#E5484D]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* incoming ring */}
      {incoming && (
        <div className="rounded-md border border-[#F5A623]/40 bg-[#F5A623]/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[#F5A623] text-sm animate-pulse">
            <PhoneIncoming size={15} />
            {incoming.kind === "transfer"
              ? `Incoming transfer from ${incoming.fromExecutiveName}`
              : "Incoming call"}
          </div>
          <div className="text-sm">{incoming.customerName}</div>
          {incoming.urgency && incoming.urgency.tier !== "normal" && (
            <div className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md w-fit ${
              incoming.urgency.tier === "emergency" ? "bg-[#E5484D]/15 text-[#E5484D] border border-[#E5484D]/40"
              : incoming.urgency.tier === "high" ? "bg-[#F5A623]/15 text-[#F5A623] border border-[#F5A623]/40"
              : "bg-[#F5A623]/10 text-[#F5A623]/80 border border-[#F5A623]/20"
            }`}>
              <AlertTriangle size={12} />
              {incoming.urgency.tier === "emergency" ? "Possible emergency" : incoming.urgency.tier === "high" ? "Sounds frustrated" : "Slightly elevated tone"}
              {incoming.urgency.reasons?.length > 0 && (
                <span className="opacity-70">— {incoming.urgency.reasons[0]}</span>
              )}
            </div>
          )}
          {incoming.context && (
            <div className="rounded-md bg-[#FFFFFF] border border-[#E2E8F0] p-2 space-y-1.5">
              {incoming.context.topic && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Tag size={11} className="text-[#64748B]" /> Topic: <span className="text-[#0F172A]">{incoming.context.topic}</span>
                </div>
              )}
              {incoming.context.pnr && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Ticket size={11} className="text-[#64748B]" /> PNR: <span className="font-mono text-[#0F172A]">{incoming.context.pnr}</span>
                </div>
              )}
              {incoming.context.aiIntent && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Gauge size={11} className="text-[#64748B]" /> AI guessed: <span className="text-[#0F172A]">{incoming.context.aiIntent}</span>
                  {typeof incoming.context.aiConfidence === "number" && (
                    <span className="text-[#64748B]">({Math.round(incoming.context.aiConfidence * 100)}% confidence — below threshold)</span>
                  )}
                </div>
              )}
              {incoming.context.transcript?.length > 0 && (
                <div className="pt-1 border-t border-[#E2E8F0] space-y-1 max-h-24 overflow-y-auto">
                  <div className="flex items-center gap-1 text-[10px] text-[#64748B]"><Bot size={10} /> AI conversation so far:</div>
                  {incoming.context.transcript.map((t, i) => (
                    <div key={i} className="text-[11px]">
                      <span className={t.speaker === "ai" ? "text-[#0284C7]" : "text-[#475569]"}>
                        {t.speaker === "ai" ? "AI: " : "Customer: "}{t.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <CustomerProfileCard profile={profile} error={profileError} pnr={incoming.context?.pnr} />
          <div className="flex gap-2">
            <button
              onClick={acceptCall}
              className="flex-1 py-2 rounded-md bg-[#2FBF71]/15 border border-[#2FBF71]/40 text-[#2FBF71] text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <Phone size={13} /> Accept
            </button>
            <button
              onClick={rejectCall}
              className="flex-1 py-2 rounded-md bg-[#E5484D]/10 border border-[#E5484D]/30 text-[#E5484D] text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <PhoneOff size={13} /> Decline
            </button>
          </div>
        </div>
      )}

      {/* connected controls */}
      {status === "connected" && (
        <div className="space-y-2.5">
          <div className="text-sm">
            On call with <span className="text-[#0284C7]">{peerName}</span>
            {recordingState === "recording" && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-[#E5484D]">
                <Disc size={11} className="animate-pulse" /> recording
              </span>
            )}
            {peerMuted && <span className="text-[11px] text-[#64748B]"> · they're muted</span>}
          </div>

          {callContext && (callContext.topic || callContext.pnr) && (
            <div className="flex flex-wrap gap-3 text-[11px] text-[#64748B]">
              {callContext.topic && <span className="flex items-center gap-1"><Tag size={11} /> {callContext.topic}</span>}
              {callContext.pnr && <span className="flex items-center gap-1 font-mono"><Ticket size={11} /> {callContext.pnr}</span>}
            </div>
          )}
          <CustomerProfileCard profile={profile} error={profileError} pnr={callContext?.pnr} />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={toggleMute}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs bg-[#FFFFFF] hover:bg-[#FFFFFF] text-[#475569] border-[#E2E8F0]"
            >
              {muted ? <MicOff size={14} /> : <Mic size={14} />} {muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={endCall}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs bg-[#E5484D]/10 hover:bg-[#E5484D]/20 text-[#E5484D] border-[#E5484D]/30"
            >
              <PhoneOff size={14} /> End Call
            </button>
          </div>

          <div className="pt-1">
            <div className="text-[11px] uppercase tracking-wider text-[#64748B] mb-1.5">Transfer to</div>
            {roster.filter((r) => r.status === "available").length === 0 ? (
              <div className="text-[11px] text-[#64748B]">No other executives online right now.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {roster.filter((r) => r.status === "available").map((r) => (
                  <button
                    key={r.id}
                    onClick={() => transferCall(r.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] bg-[#3B82C4]/10 hover:bg-[#3B82C4]/20 text-[#0284C7] border-[#3B82C4]/30"
                  >
                    <PhoneForwarded size={12} /> {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {status === "idle" && !incoming && (
        <div className="text-xs text-[#64748B]">Waiting for an incoming call…</div>
      )}
    </div>
  );
}

/** Full customer record pulled by PNR — name, mobile, train/coach/berth, and recent complaint/fine history. */
function CustomerProfileCard({ profile, error, pnr }) {
  if (!pnr) return null;
  if (error) {
    return (
      <div className="rounded-md bg-[#FFFFFF] border border-[#E2E8F0] p-2 text-[11px] text-[#64748B]">
        {error} (PNR {pnr})
      </div>
    );
  }
  if (!profile) {
    return <div className="rounded-md bg-[#FFFFFF] border border-[#E2E8F0] p-2 text-[11px] text-[#64748B]">Looking up customer record…</div>;
  }
  const { passenger, complaints = [], fines = [] } = profile;
  const openFines = fines.filter((f) => f.status !== "paid");
  const isRepeatContact = complaints.length >= 3;
  return (
    <div className="rounded-md bg-[#FFFFFF] border border-[#E2E8F0] p-2.5 space-y-1.5 text-[11px]">
      <div className="text-[#0F172A] font-medium">{passenger.name} <span className="text-[#64748B] font-mono">· {passenger.mobile}</span></div>
      <div className="text-[#64748B]">
        Train {passenger.trainNumber} · Coach {passenger.coach} · Berth {passenger.berth}
      </div>
      <div className="text-[#64748B]">
        {complaints.length} prior complaint{complaints.length === 1 ? "" : "s"}
        {openFines.length > 0 && <span className="text-[#F5A623]"> · {openFines.length} unpaid fine{openFines.length === 1 ? "" : "s"}</span>}
      </div>
      {isRepeatContact && (
        <div className="flex items-center gap-1.5 text-[#F5A623] bg-[#F5A623]/10 border border-[#F5A623]/30 rounded-md px-2 py-1 w-fit">
          <Repeat size={11} /> Repeat contact — {complaints.length} complaints on file, give this one extra care
        </div>
      )}
    </div>
  );
}
