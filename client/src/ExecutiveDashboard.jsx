import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { io } from "socket.io-client";
import {
  Phone, TrendingUp, AlertCircle, FileText, QrCode, StickyNote, Train,
  CheckCircle2, XCircle, Search, LogOut, Tag, Ticket, Trash2, PhoneCall, Siren,
  MessageCircle, RefreshCw,
} from "lucide-react";
import { useCallEngine } from "./useCallEngine";
import ExecutiveLiveCallPanel from "./ExecutiveLiveCallPanel";

import { SIGNALING_URL, API_BASE } from "./config";

const SUPPORT_STATUSES = [
  { value: "open", label: "Open", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { value: "in_progress", label: "In Progress", tone: "border-blue-200 bg-blue-50 text-blue-700" },
  { value: "resolved", label: "Resolved", tone: "border-green-200 bg-green-50 text-green-700" },
  { value: "rejected", label: "Rejected", tone: "border-red-200 bg-red-50 text-red-700" },
];

const LOGO_DATA_URI = "data:image/png;base64,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";

function fmtDuration(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const STATUS_META = {
  completed: { label: "Completed", text: "text-[#64748B]" },
  missed: { label: "Missed", text: "text-[#E5484D]" },
  transferred: { label: "Transferred", text: "text-[#F5A623]" },
  rejected: { label: "Declined", text: "text-[#E5484D]" },
};

function KpiCard({ icon: Icon, label, value, sub }) {
  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: "0 8px 20px -6px rgba(0,61,165,0.15)" }}
      transition={{ duration: 0.18 }}
      className="flex-1 min-w-[150px] rounded-lg bg-gradient-to-br from-white via-[#F0FDF4] to-[#DCFCE7] border border-[#BBF7D0] p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-[#64748B] font-medium">{label}</span>
        <Icon size={15} className="text-[#3B82C4]" />
      </div>
      <div className="font-mono text-2xl text-[#0F172A] font-semibold leading-none">{value}</div>
      {sub && <div className="text-[11px] text-[#64748B] mt-1.5">{sub}</div>}
    </motion.div>
  );
}

function ActionButton({ icon: Icon, label, onClick, tone = "default", disabled }) {
  const tones = {
    default: "bg-[#FFFFFF] hover:bg-[#FFFFFF] text-[#475569] border-[#E2E8F0]",
    primary: "bg-[#3B82C4]/15 hover:bg-[#3B82C4]/25 text-[#0284C7] border-[#3B82C4]/40",
    warn: "bg-[#F5A623]/10 hover:bg-[#F5A623]/20 text-[#F5A623] border-[#F5A623]/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

export default function ExecutiveDashboard({ user, token, onLogout }) {
  const socket = useMemo(() => io(SIGNALING_URL, { auth: { token } }), [token]);
  const engine = useCallEngine({ socket, role: "executive", name: user?.name || "Agent" });

  const passengerName = engine.peerName || engine.incoming?.customerName || "Unknown caller";
  const topic = engine.callContext?.topic || engine.callContext?.aiIntent
    || engine.incoming?.context?.topic || engine.incoming?.context?.aiIntent || null;
  const pnr = engine.callContext?.pnr || engine.incoming?.context?.pnr || null;
  const canAct = engine.status === "connected";
  const hasCall = canAct || Boolean(engine.incoming);

  const apiPost = useCallback(async (path, body) => {
    if (!token) throw new Error("Your staff login is missing. Sign in again.");
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || `Request failed: ${path}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }, [token]);

  const apiDelete = useCallback(async (path) => {
    if (!token) throw new Error("Your staff login is missing. Sign in again.");
    const res = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || `Request failed: ${path}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }, [token]);

  const apiPatch = useCallback(async (path, body) => {
    if (!token) throw new Error("Your staff login is missing. Sign in again.");
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || `Request failed: ${path}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }, [token]);

  const [kpis, setKpis] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState("");
  const [toasts, setToasts] = useState([]);
  const [qrModal, setQrModal] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [playingCallId, setPlayingCallId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [complaintId, setComplaintId] = useState(null);
  const [fineId, setFineId] = useState(null);
  const [fineAmount, setFineAmount] = useState(null);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [detailModal, setDetailModal] = useState(null); // the full Call record being inspected
  const [detailProfile, setDetailProfile] = useState(null);
  const [sosAlerts, setSosAlerts] = useState([]); // recent SOS presses — stays on screen until dismissed
  const [supportCases, setSupportCases] = useState([]);
  const [supportReplies, setSupportReplies] = useState({});
  const [supportQueueLoading, setSupportQueueLoading] = useState(false);
  const [supportQueueError, setSupportQueueError] = useState(null);
  const [savingSupportCase, setSavingSupportCase] = useState(null);
  const [draggingSupportCase, setDraggingSupportCase] = useState(null);
  const [dragOverSupportStatus, setDragOverSupportStatus] = useState(null);
  const [activeSection, setActiveSection] = useState("calls");
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [fineForm, setFineForm] = useState({ reason: "", amount: "500", email: "" });
  const [fineSaving, setFineSaving] = useState(false);
  const [qrEmailModalOpen, setQrEmailModalOpen] = useState(false);
  const [qrEmailDraft, setQrEmailDraft] = useState("");
  const [qrEmailSaving, setQrEmailSaving] = useState(false);
  const toastIdRef = useRef(0);
  const lastStatusRef = useRef("idle");

  useEffect(() => {
    if (engine.incoming) setActiveSection("calls");
  }, [engine.incoming?.callId]);

  useEffect(() => {
    if (!detailModal?.customerPnr) { setDetailProfile(null); return; }
    let cancelled = false;
    setDetailProfile(null);
    fetch(`${API_BASE}/passengers/by-pnr/${encodeURIComponent(detailModal.customerPnr)}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setDetailProfile(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [detailModal, token]);

  // Active-call passenger email — shown in the call panel so the executive
  // can see up front whether one's on file, instead of only finding out
  // indirectly when Generate Fine prompts for it.
  const [activePassengerEmail, setActivePassengerEmail] = useState(undefined); // undefined = loading, null = confirmed none on file
  useEffect(() => {
    if (!pnr) { setActivePassengerEmail(undefined); return; }
    let cancelled = false;
    setActivePassengerEmail(undefined);
    fetch(`${API_BASE}/passengers/by-pnr/${encodeURIComponent(pnr)}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setActivePassengerEmail(data?.passenger?.email || null); })
      .catch(() => { if (!cancelled) setActivePassengerEmail(null); });
    return () => { cancelled = true; };
  }, [pnr, token]);

  const runLookup = useCallback(async (e) => {
    e?.preventDefault?.();
    if (!lookupQuery.trim()) { setLookupResults([]); return; }
    setLookupLoading(true);
    try {
      const res = await fetch(`${API_BASE}/passengers?search=${encodeURIComponent(lookupQuery.trim())}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLookupResults(data.items || []);
    } catch {
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  }, [lookupQuery, token]);

  const pushToast = useCallback((msg, tone = "default") => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  const refreshSupportQueue = useCallback(async () => {
    setSupportQueueLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [complaintRes, ticketRes] = await Promise.all([
        fetch(`${API_BASE}/complaints/queue`, { headers }),
        fetch(`${API_BASE}/passengers/support-tickets`, { headers }),
      ]);
      const [complaints, tickets] = await Promise.all([
        complaintRes.json().catch(() => ({})),
        ticketRes.json().catch(() => ({})),
      ]);
      if (!complaintRes.ok) throw new Error(complaints.error || "Could not load journey issues");
      if (!ticketRes.ok) throw new Error(tickets.error || "Could not load general support queries");
      setSupportCases([
        ...complaints.map((record) => ({ kind: "journey", record })),
        ...tickets.map((record) => ({ kind: "general", record })),
      ].sort((a, b) => new Date(a.record.createdAt) - new Date(b.record.createdAt)));
      setSupportQueueError(null);
    } catch (err) {
      setSupportQueueError(err.message);
    } finally {
      setSupportQueueLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshSupportQueue();
    const interval = setInterval(refreshSupportQueue, 15000);
    return () => clearInterval(interval);
  }, [refreshSupportQueue]);

  async function handleSupportReply(kind, record) {
    const key = `${kind}-${record._id}`;
    const staffReply = (supportReplies[key] || "").trim();
    if (!staffReply) return;
    setSavingSupportCase(key);
    setSupportQueueError(null);
    try {
      const path = kind === "journey"
        ? `/complaints/${record._id}`
        : `/passengers/support-tickets/${record._id}`;
      await apiPatch(path, { status: "in_progress", staffReply });
      setSupportReplies((replies) => ({ ...replies, [key]: "" }));
      pushToast("Reply sent to passenger");
      await refreshSupportQueue();
    } catch (err) {
      setSupportQueueError(`Could not send reply: ${err.message}`);
    } finally {
      setSavingSupportCase(null);
    }
  }

  async function handleResolveSupportCase(kind, record) {
    const key = `${kind}-${record._id}`;
    const staffReply = (supportReplies[key] || "").trim();
    if (!staffReply) return;
    setSavingSupportCase(key);
    setSupportQueueError(null);
    try {
      const path = kind === "journey"
        ? `/complaints/${record._id}`
        : `/passengers/support-tickets/${record._id}`;
      await apiPatch(path, { status: "resolved", staffReply });
      setSupportReplies((replies) => ({ ...replies, [key]: "" }));
      pushToast("Query resolved and reply sent");
      await refreshSupportQueue();
    } catch (err) {
      setSupportQueueError(`Could not resolve query: ${err.message}`);
    } finally {
      setSavingSupportCase(null);
    }
  }

  async function handleSupportStatusChange(kind, record, status) {
    if (record.status === status) return;
    const key = `${kind}-${record._id}`;
    const previousStatus = record.status;
    const path = kind === "journey"
      ? `/complaints/${record._id}`
      : `/passengers/support-tickets/${record._id}`;
    setSupportCases((cases) => cases.map((item) => (
      item.kind === kind && item.record._id === record._id
        ? { ...item, record: { ...item.record, status } }
        : item
    )));
    setSavingSupportCase(key);
    setSupportQueueError(null);
    try {
      await apiPatch(path, { status });
      pushToast(`Moved to ${SUPPORT_STATUSES.find((item) => item.value === status)?.label || status}`);
      await refreshSupportQueue();
    } catch (err) {
      setSupportCases((cases) => cases.map((item) => (
        item.kind === kind && item.record._id === record._id
          ? { ...item, record: { ...item.record, status: previousStatus } }
          : item
      )));
      setSupportQueueError(`Could not change status: ${err.message}`);
    } finally {
      setSavingSupportCase(null);
    }
  }

  function handleSupportDragStart(event, key) {
    if (event.target.closest("textarea, button, select, input")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
    setDraggingSupportCase(key);
  }

  function handleSupportDrop(event, status) {
    event.preventDefault();
    const key = event.dataTransfer.getData("text/plain");
    const item = supportCases.find(({ kind, record }) => `${kind}-${record._id}` === key);
    if (item) handleSupportStatusChange(item.kind, item.record, status);
    setDraggingSupportCase(null);
    setDragOverSupportStatus(null);
  }

  useEffect(() => {
    const onSos = (alert) => {
      setSosAlerts((prev) => [{ ...alert, id: `${alert.at}-${alert.customerName}` }, ...prev]);
      pushToast(`SOS from ${alert.customerName}${alert.pnr ? ` (PNR ${alert.pnr})` : ""}`, "danger");
    };
    socket.on("sos:alert", onSos);
    return () => socket.off("sos:alert", onSos);
  }, [socket, pushToast]);

  const refreshData = useCallback(() => {
    fetch(`${API_BASE}/calls/analytics`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null)).then(setKpis).catch(() => {});
    fetch(`${API_BASE}/calls?limit=20`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.items) setHistory(data.items); })
      .catch(() => {});
  }, [token]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // keep this dashboard in sync with what's happening elsewhere — a complaint
  // filed from the Passenger Portal, an escalation from Analytics, a rating
  // just submitted after a call — without requiring a manual page reload.
  useEffect(() => {
    const AUTO_REFRESH_MS = 15000;
    const id = setInterval(refreshData, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshData]);

  // whenever a call finishes (connected -> idle/ended), pull fresh real data
  useEffect(() => {
    const wasActive = ["connected", "ringing-in", "ringing-out", "transferring"].includes(lastStatusRef.current);
    const isNowInactive = ["idle", "ended"].includes(engine.status);
    if (wasActive && isNowInactive) {
      pushToast("Call ended — conversation closed", "default");
      setTimeout(refreshData, 1200); // small delay so the backend has finished persisting the call
      setComplaintId(null);
      setFineId(null);
      setFineAmount(null);
    }
    lastStatusRef.current = engine.status;
  }, [engine.status, refreshData, pushToast]);

  async function playRecording(callId) {
    if (playingCallId === callId) {
      setPlayingCallId(null);
      setRecordingUrl(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/calls/${callId}/recording`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("No recording found for this call");
      const blob = await res.blob();
      setRecordingUrl(URL.createObjectURL(blob));
      setPlayingCallId(callId);
    } catch (err) {
      pushToast(err.message, "warn");
    }
  }

  async function handleComplaint() {
    try {
      const complaint = await apiPost("/complaints", {
        passengerName,
        pnr: pnr || "UNKNOWN",
        intent: topic || "General Query",
        source: "executive_call",
      });
      setComplaintId(complaint._id);
      pushToast(`Complaint filed (#${complaint._id.slice(-6)}) for ${passengerName}`, "primary");
    } catch (err) {
      if (err.status === 409 && err.data?.duplicate) {
        // Not a hard failure — the same passenger already has an open
        // complaint for the same thing. Let the executive decide: this is
        // a real recurrence (file anyway) or the caller's just following up
        // on the existing one (no need to double up).
        const proceed = window.confirm(`${err.data.message}\n\nFile a new complaint anyway?`);
        if (proceed) {
          try {
            const complaint = await apiPost("/complaints", {
              passengerName, pnr: pnr || "UNKNOWN", intent: topic || "General Query", source: "executive_call", force: true,
            });
            setComplaintId(complaint._id);
            pushToast(`Complaint filed (#${complaint._id.slice(-6)}) for ${passengerName}`, "primary");
          } catch (err2) {
            pushToast(`Failed to file complaint: ${err2.message}`, "warn");
          }
        } else {
          setComplaintId(err.data.existing._id);
          pushToast("Using the existing open complaint instead", "default");
        }
        return;
      }
      pushToast(`Failed to file complaint: ${err.message}`, "warn");
    }
  }

  function handleFine() {
    setFineForm({ reason: topic || "Linen not returned", amount: "500", email: "" });
    setFineModalOpen(true);
  }

  async function handleCreateFine(event) {
    event.preventDefault();
    const reason = fineForm.reason.trim();
    const amount = Number(fineForm.amount);
    const overrideEmail = fineForm.email.trim();
    if (!reason || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      pushToast("Enter a reason and a fine amount between ₹0.01 and ₹10,00,000.", "warn");
      return;
    }
    if (!token) {
      pushToast("Your staff login is missing. Sign in again before creating a fine.", "warn");
      return;
    }
    if (overrideEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideEmail)) {
      pushToast("Enter a valid passenger email address.", "warn");
      return;
    }
    setFineSaving(true);
    try {
      const fine = await apiPost("/fines", {
        passengerName,
        pnr: pnr || "UNKNOWN",
        reason,
        amount,
        ...(overrideEmail ? { overrideEmail } : {}),
      });
      setFineId(fine._id);
      setFineAmount(fine.amount);
      setFineModalOpen(false);
      if (fine.email?.sent) {
        pushToast(`Fine recorded and notice emailed — ₹${fine.amount} (#${fine._id.slice(-6)})`, "primary");
      } else if (fine.email?.reason === "No passenger email address is available.") {
        pushToast(`Fine recorded — ₹${fine.amount}. Add an email when generating its payment QR.`, "warn");
      } else {
        pushToast(`Fine recorded — email failed: ${fine.email?.reason || "unknown email error"}`, "warn");
      }
    } catch (err) {
      pushToast(`Failed to create fine: ${err.message}`, "warn");
    } finally {
      setFineSaving(false);
    }
  }

  async function handleQR() {
    if (!fineId) {
      pushToast("Generate a fine first, then generate its QR.", "warn");
      return;
    }
    try {
      const data = await apiPost(`/fines/${fineId}/generate-qr`, {});
      setQrModal({ url: data.qrDataUrl, pnr: pnr || "—", amount: fineAmount, paymentLinkUrl: data.paymentLinkUrl });
      if (data.email?.sent) {
        pushToast("Razorpay payment QR generated and emailed to passenger", "primary");
      } else if (data.email?.reason === "not_configured") {
        pushToast("Payment QR generated (email not configured — see server/.env)", "warn");
      } else {
        pushToast(`Payment QR generated, but email failed: ${data.email?.reason || "unknown email error"}`, "warn");
      }
    } catch (err) {
      if (err.data?.code === "NO_EMAIL" || err.message?.includes("No email on file")) {
        setQrEmailDraft("");
        setQrEmailModalOpen(true);
        return;
      }
      pushToast(`Failed to generate QR: ${err.message}`, "warn");
    }
  }

  async function handleSaveQrEmail(event) {
    event.preventDefault();
    const overrideEmail = qrEmailDraft.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideEmail)) {
      pushToast("Enter a valid passenger email address.", "warn");
      return;
    }
    setQrEmailSaving(true);
    try {
      await apiPatch(`/fines/${fineId}/email`, { overrideEmail });
      setQrEmailModalOpen(false);
      await handleQR();
    } catch (err) {
      pushToast(`Failed to save email: ${err.message}`, "warn");
    } finally {
      setQrEmailSaving(false);
    }
  }

  async function handleCheckPaymentStatus() {
    if (!fineId) return;
    try {
      const data = await apiPost(`/fines/${fineId}/razorpay-status`, {});
      if (data.razorpayStatus === "paid") {
        pushToast("Payment confirmed — fine marked as paid", "primary");
      } else {
        pushToast(`Not paid yet (Razorpay status: ${data.razorpayStatus})`, "warn");
      }
    } catch (err) {
      pushToast(`Couldn't check payment status: ${err.message}`, "warn");
    }
  }

  // Real Twilio phone call to the passenger's actual mobile, bridged to
  // TWILIO_EXECUTIVE_FALLBACK_NUMBER once they answer —
  // separate from the in-app WebRTC call. Trial-account limit: only works
  // if the passenger's number is itself a Verified Caller ID.
  async function handleCallPassenger() {
    if (!pnr) {
      pushToast("No PNR for this call — can't look up a mobile number to dial.", "warn");
      return;
    }
    pushToast("Placing call…", "primary");
    try {
      const data = await apiPost("/telephony/call-passenger", { pnr });
      if (data.ok) {
        pushToast("Call placed — it'll ring the executive fallback number once the passenger answers.", "primary");
      } else {
        pushToast(`Call failed: ${data.reason}`, "warn");
      }
    } catch (err) {
      pushToast(`Call failed: ${err.message}`, "warn");
    }
  }

  /** Storage cleanup for the free-tier Mongo cluster — wipes this passenger's
   *  call recordings/transcripts/complaints/tickets. Keeps their profile and
   *  fine records. Destructive, so it always confirms first. */
  async function handleDeletePassengerData(targetPnr, targetName) {
    const confirmed = window.confirm(
      `Delete all chat/call/complaint data for ${targetName} (PNR ${targetPnr})?\n\nThis removes call recordings, AI chat transcripts, and complaint/ticket history to free up storage. Their passenger profile and fine records are kept. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const result = await apiDelete(`/passengers/by-pnr/${targetPnr}/data`);
      pushToast(
        `Deleted for ${targetName}: ${result.deleted.calls} call(s), ${result.deleted.recordings} recording(s), ${result.deleted.complaints} complaint(s), ${result.deleted.tickets} ticket(s)`,
        "primary"
      );
      setDetailModal(null);
      setDetailProfile(null);
      refreshData();
    } catch (err) {
      pushToast(`Failed to delete passenger data: ${err.message}`, "warn");
    }
  }

  async function handleAddNote() {
    if (!noteDraft.trim() || !engine.callId) return;
    try {
      await apiPost(`/calls/${engine.callId}/notes`, { text: noteDraft.trim() });
      pushToast("Note added");
      setNoteDraft("");
    } catch (err) {
      pushToast(`Failed to add note: ${err.message}`, "warn");
    }
  }

  const filteredHistory = history.filter((c) =>
    (c.customerName + c.callId + (c.intent || "") + (c.topic || "")).toLowerCase().includes(historyFilter.toLowerCase())
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 min-h-screen w-full bg-[#F4F6FA] text-[#0F172A]" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="border-b border-[#E2E8F0] px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img src={LOGO_DATA_URI} alt="SRLMS" className="h-10 w-10 rounded-md object-contain bg-white/95 p-1 border border-[#3B82C4]/40" />
          <div>
            <div className="text-sm font-semibold tracking-tight">SRLMS Contact Center</div>
            <div className="text-[11px] text-[#64748B] font-mono">Executive Console</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#64748B]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#2FBF71] opacity-70 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2FBF71]" />
          </span>
          Live · real data only · auto-syncing every 15s
          {user?.name && <span className="text-[#64748B]">· {user.name}</span>}
          {onLogout && (
            <button onClick={onLogout} className="ml-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E2E8F0] bg-[#FFFFFF] hover:bg-[#FFFFFF] text-[#475569]">
              <LogOut size={12} /> Log out
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-73px)]">
        <aside className="sticky top-0 h-[calc(100vh-73px)] w-56 shrink-0 overflow-y-auto border-r border-[#E2E8F0] bg-white p-3 max-md:w-16 max-md:px-2">
          <div className="mb-3 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] max-md:hidden">
            Workspace
          </div>
          <nav className="space-y-1">
            {[
              { id: "calls", label: "Real Call Line", icon: Phone },
              { id: "support", label: "Passenger Support Queue", icon: MessageCircle },
              { id: "customers", label: "Customer Lookup", icon: Search },
              { id: "history", label: "Call History", icon: FileText },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                aria-current={activeSection === id ? "page" : undefined}
                title={label}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs transition-colors max-md:justify-center max-md:px-2 ${
                  activeSection === id
                    ? "bg-[#EBF3FC] font-semibold text-[#004B87]"
                    : "text-[#475569] hover:bg-[#F8FAFC]"
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="max-md:hidden">{label}</span>
                {id === "calls" && engine.incoming && (
                  <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-[#E5484D] max-md:hidden" />
                )}
              </button>
            ))}
          </nav>
          {engine.incoming && (
            <div className="mt-4 rounded-md border border-[#F5A623]/30 bg-[#FFF7E8] p-2.5 text-[11px] text-[#92400E] max-md:hidden">
              <div className="font-semibold">Incoming call</div>
              <div className="mt-1 truncate">{engine.incoming.customerName}</div>
              <button onClick={() => setActiveSection("calls")} className="mt-2 font-semibold underline">
                Open call
              </button>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1">
          {engine.incoming && activeSection !== "calls" && (
            <button
              onClick={() => setActiveSection("calls")}
              className="m-4 flex w-[calc(100%-2rem)] items-center justify-between gap-3 rounded-md border border-[#E5484D]/40 bg-[#FEF3F2] px-4 py-3 text-left text-xs text-[#B42318]"
            >
              <span className="font-semibold animate-pulse">Incoming call from {engine.incoming.customerName}</span>
              <span className="font-semibold">Open call →</span>
            </button>
          )}

          {sosAlerts.length > 0 && (
            <div className="px-4 sm:px-6 pt-4 space-y-2">
              {sosAlerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-md bg-[#E5484D]/15 border border-[#E5484D]/50 text-[#E5484D] text-xs animate-pulse">
                  <div className="flex items-center gap-2 font-semibold">
                    <Siren className="w-4 h-4 shrink-0" /> SOS — {a.customerName}{a.pnr ? ` (PNR ${a.pnr})` : ""} · {new Date(a.at).toLocaleTimeString()}
                  </div>
                  <button onClick={() => setSosAlerts((prev) => prev.filter((x) => x.id !== a.id))} className="text-[#E5484D] underline underline-offset-2 shrink-0">
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeSection === "calls" && !hasCall && (
            <div className="px-4 sm:px-6 pt-5 flex gap-3 flex-wrap">
        <KpiCard icon={Phone} label="Total Calls" value={kpis?.total ?? "—"} />
        <KpiCard icon={CheckCircle2} label="AI Resolution" value={kpis ? `${kpis.aiResolutionPct}%` : "—"} sub="resolved without transfer" />
        <KpiCard icon={TrendingUp} label="Transfer Rate" value={kpis ? `${kpis.transferPct}%` : "—"} />
        <KpiCard icon={XCircle} label="Missed" value={kpis?.missed ?? "—"} />
        <KpiCard icon={Phone} label="Avg Handle Time" value={kpis ? fmtDuration(kpis.avgHandleTimeSec) : "—"} />
      </div>
          )}

      <div className="px-4 sm:px-6 py-5 space-y-5">
        {activeSection === "support" && (
        <section className="rounded-lg border border-[#BBF7D0] bg-gradient-to-br from-white via-[#F0FDF4] to-[#DCFCE7] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-[#0F172A]">Passenger Support Queue</div>
              <div className="text-[11px] text-[#64748B] mt-1">Drag a card between statuses or use its Move to menu. Executives handle journey issues and general support queries.</div>
            </div>
            <button
              onClick={refreshSupportQueue}
              disabled={supportQueueLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#E2E8F0] text-[11px] text-[#475569] disabled:opacity-50"
            >
              <RefreshCw size={12} className={supportQueueLoading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          {supportQueueError && (
            <div className="px-4 py-2 text-xs text-[#B42318] bg-[#FEF3F2]">{supportQueueError}</div>
          )}
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            {SUPPORT_STATUSES.map((statusColumn) => {
              const columnCases = supportCases.filter(({ record }) => record.status === statusColumn.value);
              return (
                <section
                  key={statusColumn.value}
                  onDragOver={(event) => { event.preventDefault(); setDragOverSupportStatus(statusColumn.value); }}
                  onDragLeave={() => setDragOverSupportStatus((current) => current === statusColumn.value ? null : current)}
                  onDrop={(event) => handleSupportDrop(event, statusColumn.value)}
                  className={`min-h-56 rounded-md border p-2 transition-colors ${
                    dragOverSupportStatus === statusColumn.value
                      ? "border-[#0284C7] bg-[#EFF6FF]"
                      : "border-[#BBF7D0] bg-gradient-to-br from-white via-[#F0FDF4] to-[#DCFCE7]"
                  }`}
                >
                  <header className="mb-2 flex items-center justify-between px-1 py-1">
                    <h3 className={`rounded border px-2 py-1 text-[11px] font-semibold ${statusColumn.tone}`}>
                      {statusColumn.label}
                    </h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
                      {columnCases.length}
                    </span>
                  </header>
                  <div className="space-y-2">
                    {columnCases.map(({ kind, record }) => {
                      const key = `${kind}-${record._id}`;
                      const reply = supportReplies[key] || "";
                      const saving = savingSupportCase === key;
                      return (
                        <article
                          key={key}
                          draggable={!saving}
                          onDragStart={(event) => handleSupportDragStart(event, key)}
                          onDragEnd={() => { setDraggingSupportCase(null); setDragOverSupportStatus(null); }}
                          className={`rounded-md border border-[#BBF7D0] bg-gradient-to-br from-white via-[#F0FDF4] to-[#DCFCE7] p-3 space-y-2.5 shadow-sm ${
                            saving ? "opacity-60" : "cursor-grab active:cursor-grabbing"
                          } ${draggingSupportCase === key ? "opacity-40" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]">
                                <MessageCircle size={13} className="text-[#0284C7]" />
                                {kind === "journey" ? "Journey issue" : "General support"}
                              </div>
                              <div className="mt-1 text-[11px] text-[#64748B]">
                                {record.passengerName}{record.pnr && ` · PNR ${record.pnr}`}
                              </div>
                            </div>
                            {kind === "general" && (
                              <span className="font-mono text-[10px] text-[#64748B]">#{record.concernId}</span>
                            )}
                          </div>
                          <div className="text-xs font-medium text-[#334155]">
                            {kind === "journey" ? record.intent : `${record.category} — ${record.subCategory}`}
                          </div>
                          {record.description && <p className="text-xs text-[#475569] whitespace-pre-wrap">{record.description}</p>}
                          {record.staffReply && (
                            <div className="rounded bg-[#F8FAFC] p-2 text-[11px] text-[#475569]">
                              Previous reply ({record.respondedByRole || "staff"}): {record.staffReply}
                            </div>
                          )}
                          <label className="block text-[10px] font-medium text-[#64748B]">
                            Move to
                            <select
                              value={record.status}
                              disabled={saving}
                              onChange={(event) => handleSupportStatusChange(kind, record, event.target.value)}
                              className="mt-1 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1.5 text-xs text-[#334155] disabled:opacity-50"
                            >
                              {SUPPORT_STATUSES.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <textarea
                            value={reply}
                            onChange={(event) => setSupportReplies((replies) => ({ ...replies, [key]: event.target.value }))}
                            maxLength={2000}
                            rows={2}
                            placeholder="Write a reply for the passenger…"
                            className="w-full resize-y rounded-md border border-[#CBD5E1] bg-white px-2.5 py-2 text-xs focus:outline-none focus:border-[#0284C7]"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleSupportReply(kind, record)}
                              disabled={!reply.trim() || saving}
                              className="rounded-md bg-[#004B87] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                            >
                              {saving ? "Saving…" : "Reply / Keep Open"}
                            </button>
                            <button
                              onClick={() => handleResolveSupportCase(kind, record)}
                              disabled={!reply.trim() || saving}
                              className="rounded-md bg-[#16803C] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                            >
                              Resolve with reply
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {columnCases.length === 0 && (
                      <div className="rounded-md border border-dashed border-[#CBD5E1] p-4 text-center text-[11px] text-[#94A3B8]">
                        {supportQueueLoading ? "Loading…" : "No queries"}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
        )}

        {activeSection === "calls" && !hasCall && (
          <ExecutiveLiveCallPanel engine={engine} token={token} />
        )}

        {activeSection === "customers" && (
        <div className="rounded-lg border border-[#BBF7D0] bg-gradient-to-br from-white via-[#F0FDF4] to-[#DCFCE7] p-4 space-y-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[#64748B]">Customer Lookup</div>
          <form onSubmit={runLookup} className="flex gap-2">
            <input
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="Search by name, PNR, or mobile number…"
              className="flex-1 bg-[#FFFFFF] border border-[#E2E8F0] rounded-md px-3 py-2 text-xs placeholder:text-[#64748B] focus:outline-none"
            />
            <ActionButton icon={Search} label={lookupLoading ? "Searching…" : "Search"} onClick={runLookup} disabled={lookupLoading} />
          </form>
          {lookupResults.length > 0 && (
            <div className="space-y-1.5">
              {lookupResults.map((p) => (
                <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#FFFFFF] border border-[#E2E8F0] px-3 py-2 text-[11px]">
                  <div>
                    <span className="text-[#0F172A] font-medium">{p.name}</span>{" "}
                    <span className="text-[#64748B] font-mono">· {p.mobile}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[#64748B]">
                    <span className="flex items-center gap-1 font-mono"><Ticket size={11} /> {p.pnr}</span>
                    <span className="flex items-center gap-1"><Train size={11} /> {p.trainNumber} · {p.coach} · Berth {p.berth}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {lookupResults.length === 0 && lookupQuery && !lookupLoading && (
            <div className="text-[11px] text-[#64748B]">No matching customer found.</div>
          )}
        </div>
        )}

        {activeSection === "calls" && hasCall && (
          <div className="grid min-h-[calc(100vh-115px)] grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="flex min-h-[420px] flex-col gap-4 rounded-lg border border-[#BBF7D0] bg-gradient-to-br from-white via-[#F0FDF4] to-[#DCFCE7] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Passenger actions
                  </div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">
                    {canAct ? "On call with" : "Incoming call from"} <span className="text-[#0284C7]">{passengerName}</span>
                  </div>
                </div>
                {engine.incoming && (
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#F5A623]/40 bg-[#FFF7E8] px-3 py-1.5 text-[10px] font-semibold uppercase text-[#92400E]">
                    <span className="h-2 w-2 animate-ping rounded-full bg-[#E5484D]" />
                    {engine.incoming.kind === "transfer" ? "Transferred call" : "Ringing"}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-[#64748B]">
                {topic && <span className="flex items-center gap-1"><Tag size={11} /> {topic}</span>}
                {pnr && <span className="flex items-center gap-1 font-mono"><Ticket size={11} /> {pnr}</span>}
              </div>
              <div className="text-[11px] text-[#64748B]">
              {activePassengerEmail === undefined && pnr && "Checking passenger email…"}
              {activePassengerEmail && <>Email on file: <span className="font-mono text-[#64748B]">{activePassengerEmail}</span></>}
              {activePassengerEmail === null && pnr && "No email on file — enter one in the fine or payment QR form."}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ActionButton icon={AlertCircle} label={complaintId ? "Complaint Filed" : "Create Complaint"} onClick={handleComplaint} disabled={!!complaintId} />
                <ActionButton icon={FileText} label={fineId ? `Fine Created — ₹${fineAmount}` : "Create Fine"} onClick={handleFine} disabled={!!fineId} tone="warn" />
                <ActionButton icon={QrCode} label="Generate Payment QR" onClick={handleQR} disabled={!fineId} />
                <ActionButton icon={CheckCircle2} label="Check Payment Status" onClick={handleCheckPaymentStatus} disabled={!fineId} />
                <ActionButton icon={PhoneCall} label="Call Passenger" onClick={handleCallPassenger} disabled={!pnr} />
              </div>
              <div className="mt-auto border-t border-[#BBF7D0] pt-4">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#64748B]">Call notes</div>
                <div className="flex gap-2">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add a note to this call…"
                    className="min-w-0 flex-1 rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-xs placeholder:text-[#64748B] focus:outline-none"
                  />
                  <ActionButton icon={StickyNote} label="Add" onClick={handleAddNote} disabled={!canAct} />
                </div>
              </div>
            </section>
            <div className="min-h-[65vh] xl:min-h-0">
              <ExecutiveLiveCallPanel engine={engine} token={token} />
            </div>
          </div>
        )}

        {activeSection === "history" && (
        <div className="rounded-lg border border-[#BBF7D0] bg-gradient-to-br from-white via-[#F0FDF4] to-[#DCFCE7] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-[#64748B]">Call History (real data)</span>
            <div className="flex items-center gap-2 bg-[#FFFFFF] border border-[#E2E8F0] rounded-md px-2 py-1.5">
              <Search size={13} className="text-[#64748B]" />
              <input
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                placeholder="Search passenger, call ID, topic…"
                className="bg-transparent text-xs focus:outline-none placeholder:text-[#64748B] w-56"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#64748B] border-b border-[#E2E8F0]">
                  <th className="text-left font-medium px-4 py-2">Call ID</th>
                  <th className="text-left font-medium px-4 py-2">Passenger</th>
                  <th className="text-left font-medium px-4 py-2">Topic / Intent</th>
                  <th className="text-left font-medium px-4 py-2">Source</th>
                  <th className="text-left font-medium px-4 py-2">Duration</th>
                  <th className="text-left font-medium px-4 py-2">Outcome</th>
                  <th className="text-left font-medium px-4 py-2">Recording</th>
                  <th className="text-left font-medium px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((c) => {
                  const meta = STATUS_META[c.status] || { label: c.status, text: "text-[#64748B]" };
                  return (
                    <tr key={c.callId} className="border-b border-[#E2E8F0] hover:bg-[#FFFFFF] cursor-pointer" onClick={() => setDetailModal(c)}>
                      <td className="px-4 py-2 font-mono text-[#64748B]">{c.callId}</td>
                      <td className="px-4 py-2">{c.customerName}</td>
                      <td className="px-4 py-2 text-[#64748B]">{c.topic || c.aiIntent || c.intent || "—"}</td>
                      <td className="px-4 py-2 text-[#64748B] capitalize">{c.source || "webrtc"}</td>
                      <td className="px-4 py-2 font-mono">{fmtDuration(c.durationSec || 0)}</td>
                      <td className="px-4 py-2">
                        <span className={meta.text}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={(e) => { e.stopPropagation(); playRecording(c.callId); }} className="text-[11px] text-[#0284C7] hover:text-[#0369A1] underline underline-offset-2">
                          {playingCallId === c.callId ? "Stop" : "Play"}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-[#64748B] text-[11px]">View details →</td>
                    </tr>
                  );
                })}
                {filteredHistory.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-[#64748B]">No calls yet — real calls will appear here once placed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {playingCallId && recordingUrl && (
            <div className="px-4 py-3 border-t border-[#E2E8F0] flex items-center gap-3">
              <span className="text-[11px] text-[#64748B] font-mono">Playing {playingCallId}</span>
              <audio controls autoPlay src={recordingUrl} className="h-8 flex-1" />
            </div>
          )}
        </div>
        )}
      </div>
        </main>
      </div>

      {detailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDetailModal(null)}>
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg p-5 max-w-lg w-full max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Call {detailModal.callId}</div>
              <button onClick={() => setDetailModal(null)} className="text-[#64748B] hover:text-[#64748B] text-xs">Close</button>
            </div>

            {/* Passenger profile */}
            {detailModal.customerPnr && (
              detailProfile ? (
                <div className="rounded-md bg-[#FFFFFF] border border-[#E2E8F0] p-3 space-y-2 text-xs">
                  <div className="text-[#0F172A] font-medium">{detailProfile.passenger.name} <span className="text-[#64748B] font-mono">· {detailProfile.passenger.mobile}</span></div>
                  <div className="text-[#64748B]">
                    PNR {detailProfile.passenger.pnr} · Train {detailProfile.passenger.trainNumber} · Coach {detailProfile.passenger.coach} · Berth {detailProfile.passenger.berth}
                  </div>
                  <div className="text-[#64748B]">
                    {detailProfile.complaints.length} prior complaint(s) · {detailProfile.fines.filter((f) => f.status !== "paid").length} unpaid fine(s)
                  </div>

                  {/* All past AI chats/calls for this passenger — not just the one being viewed,
                      so an executive picking up a transfer can see the passenger's full history
                      without them repeating themselves. */}
                  {detailProfile.calls?.length > 0 && (
                    <div className="pt-1">
                      <div className="text-[11px] text-[#64748B] mb-1">Past AI chats & calls ({detailProfile.calls.length})</div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {detailProfile.calls.map((c) => (
                          <div key={c.callId} className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-md px-2.5 py-1.5">
                            <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                              <span>{new Date(c.createdAt).toLocaleString()}</span>
                              <span className="capitalize">{c.status}</span>
                            </div>
                            <div className="text-[#475569]">{c.topic || c.aiIntent || "General query"}</div>
                            {c.aiTranscript?.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {c.aiTranscript.slice(0, 4).map((t, i) => (
                                  <div key={i} className="text-[10px] text-[#64748B] truncate">
                                    <span className={t.speaker === "customer" ? "text-[#0284C7]" : "text-[#64748B]"}>{t.speaker === "customer" ? "Passenger" : "AI"}:</span> {t.text}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Storage cleanup — free-tier Mongo has a hard size cap, so this
                      wipes call recordings/transcripts/complaints/tickets for this
                      passenger. Keeps their profile + fine records (financial history). */}
                  <button
                    onClick={() => handleDeletePassengerData(detailProfile.passenger.pnr, detailProfile.passenger.name)}
                    className="w-full mt-1 py-1.5 rounded-md bg-[#E5484D]/10 border border-[#E5484D]/30 text-[#E5484D] text-[11px] flex items-center justify-center gap-1"
                  >
                    <Trash2 size={12} /> Delete this passenger's chat/call/complaint data
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-[#64748B]">Looking up passenger for PNR {detailModal.customerPnr}…</div>
              )
            )}

            {/* Recording */}
            {detailModal.recordingFileId && (
              <div>
                <div className="text-[11px] text-[#64748B] mb-1">Recording</div>
                <audio controls src={`${API_BASE}/calls/${detailModal.callId}/recording`} className="w-full h-8" />
              </div>
            )}

            {/* Written AI conversation before transfer/resolution */}
            {detailModal.aiTranscript?.length > 0 && (
              <div>
                <div className="text-[11px] text-[#64748B] mb-1.5">AI conversation (written)</div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {detailModal.aiTranscript.map((t, i) => (
                    <div key={i} className={`text-[11px] px-2.5 py-1.5 rounded-md max-w-[85%] ${t.speaker === "customer" ? "bg-[#3B82C4]/15 text-[#0284C7] ml-auto" : "bg-[#FFFFFF] text-[#475569]"}`}>
                      {t.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Executive notes */}
            {detailModal.notes?.length > 0 && (
              <div>
                <div className="text-[11px] text-[#64748B] mb-1.5">Executive notes</div>
                <div className="space-y-1">
                  {detailModal.notes.map((n, i) => (
                    <div key={i} className="text-[11px] text-[#475569] bg-[#FFFFFF] border border-[#E2E8F0] rounded-md px-2.5 py-1.5">{n.text}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {fineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setFineModalOpen(false)}>
          <form
            onSubmit={handleCreateFine}
            className="w-full max-w-md space-y-4 rounded-xl border border-[#BBF7D0] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">Create passenger fine</h2>
              <p className="mt-1 text-xs text-[#64748B]">
                {passengerName}{pnr ? ` · PNR ${pnr}` : ""}
              </p>
            </div>
            <label className="block text-xs font-medium text-[#334155]">
              Fine reason
              <input
                autoFocus
                required
                maxLength={300}
                value={fineForm.reason}
                onChange={(event) => setFineForm((form) => ({ ...form, reason: event.target.value }))}
                placeholder="e.g. Linen not returned"
                className="mt-1.5 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm focus:border-[#16803C] focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-[#334155]">
              Amount (INR)
              <div className="mt-1.5 flex items-center rounded-md border border-[#CBD5E1] bg-white px-3 focus-within:border-[#16803C]">
                <span className="text-sm text-[#64748B]">₹</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={fineForm.amount}
                  onChange={(event) => setFineForm((form) => ({ ...form, amount: event.target.value }))}
                  className="w-full border-0 bg-transparent px-2 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </label>
            <label className="block text-xs font-medium text-[#334155]">
              Passenger email {activePassengerEmail ? "(already on file)" : "(optional; needed to email the payment QR)"}
              {activePassengerEmail && (
                <div className="mt-1.5 rounded-md bg-[#F0FDF4] px-3 py-2 text-xs font-normal text-[#166534]">{activePassengerEmail}</div>
              )}
              {!activePassengerEmail && (
                <input
                  type="email"
                  maxLength={200}
                  value={fineForm.email}
                  onChange={(event) => setFineForm((form) => ({ ...form, email: event.target.value }))}
                  placeholder="passenger@example.com"
                  className="mt-1.5 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm focus:border-[#16803C] focus:outline-none"
                />
              )}
            </label>
            <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-3">
              <button type="button" onClick={() => setFineModalOpen(false)} className="rounded-md border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569]">
                Cancel
              </button>
              <button type="submit" disabled={fineSaving} className="rounded-md bg-[#16803C] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {fineSaving ? "Saving fine…" : "Create fine"}
              </button>
            </div>
          </form>
        </div>
      )}

      {qrEmailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setQrEmailModalOpen(false)}>
          <form
            onSubmit={handleSaveQrEmail}
            className="w-full max-w-sm space-y-4 rounded-xl border border-[#BBF7D0] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">Email payment QR</h2>
              <p className="mt-1 text-xs text-[#64748B]">No email is saved for this passenger. Enter an address to send the payment link and QR.</p>
            </div>
            <label className="block text-xs font-medium text-[#334155]">
              Passenger email
              <input
                autoFocus
                required
                type="email"
                maxLength={200}
                value={qrEmailDraft}
                onChange={(event) => setQrEmailDraft(event.target.value)}
                placeholder="passenger@example.com"
                className="mt-1.5 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm focus:border-[#16803C] focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-3">
              <button type="button" onClick={() => setQrEmailModalOpen(false)} className="rounded-md border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569]">
                Cancel
              </button>
              <button type="submit" disabled={qrEmailSaving} className="rounded-md bg-[#16803C] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {qrEmailSaving ? "Saving and generating…" : "Save email & generate QR"}
              </button>
            </div>
          </form>
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setQrModal(null)}>
          <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg p-6 max-w-xs w-full text-center space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold">Razorpay Fine Payment QR (test mode)</div>
            <div className="text-[11px] text-[#64748B] font-mono">PNR {qrModal.pnr} · ₹{qrModal.amount}</div>
            <img src={qrModal.url} alt="Razorpay Payment QR" className="mx-auto rounded-md bg-white p-2" />
            {qrModal.paymentLinkUrl && (
              <a href={qrModal.paymentLinkUrl} target="_blank" rel="noreferrer" className="block text-[10px] text-[#0284C7] break-all hover:underline">
                {qrModal.paymentLinkUrl}
              </a>
            )}
            <button onClick={() => setQrModal(null)} className="w-full py-2 rounded-md bg-[#FFFFFF] border border-[#E2E8F0] text-xs text-[#475569]">Close</button>
          </div>
        </div>
      )}

      <div className="fixed bottom-5 right-5 space-y-2 z-50">
        {toasts.map((t) => {
          const toneClass = {
            danger: "border-[#E5484D]/40 text-[#E5484D]",
            warn: "border-[#F5A623]/40 text-[#F5A623]",
            primary: "border-[#3B82C4]/40 text-[#0284C7]",
            default: "border-[#E2E8F0] text-[#0F172A]",
          }[t.tone || "default"];
          return (
            <div key={t.id} className={`px-4 py-2.5 rounded-md border bg-[#FFFFFF] text-xs shadow-lg ${toneClass}`}>
              {t.msg}
            </div>
          );
        })}
      </div>
    </div>
  );
}
