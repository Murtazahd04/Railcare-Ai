import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io } from "socket.io-client";
import { useCallEngine } from "./useCallEngine";
import { speak, listen as listenOnce, speechRecognitionSupported } from "./voice";
import { useLanguage, LANGUAGES } from "./i18n";
import {
  Train, LogOut, MessageCircle, AlertCircle, Star, Mic, Phone, PhoneOff,
  Bot, User, Loader2, Clock, ArrowRight, ArrowLeft, CheckCircle2, X, MicOff,
  HelpCircle, PhoneForwarded, AlertTriangle, Menu, Palette, Sun, Moon,
  Sparkles, Shield, Send, Eye, EyeOff, ChevronRight, RefreshCw, Volume2,
  Calendar, MapPin, Ticket, Compass, Layers, Lock, ChevronDown,
  Bed, Map, CreditCard, UtensilsCrossed, ClipboardList, Siren, Zap
} from "lucide-react";

import { SIGNALING_URL, API_BASE } from "./config";

const INTENT_OPTIONS = [
  "Missing Blanket", "Dirty Bedsheet", "Missing Pillow", "Linen Return Confusion",
  "Coach Attendant Complaint", "RFID Tracking Query", "Other",
];

// Theme configurations
const THEMES = {
  daylight: {
    id: "daylight",
    name: "IRCTC Daylight",
    subtitle: "Official light mode with IRCTC Blue & Saffron",
    icon: Sun,
    bg: "bg-[#F3F6FA]",
    textPrimary: "text-[#0F1D36]",
    textSecondary: "text-[#475569]",
    textMuted: "text-[#94A3B8]",
    sidebarBg: "bg-white border-r border-[#E2E8F0]",
    sidebarActive: "bg-[#EBF3FC] text-[#004B87] font-semibold border-r-4 border-[#004B87]",
    sidebarHover: "hover:bg-[#F8FAFC] text-[#334155]",
    cardBg: "bg-white",
    cardHover: "hover:border-[#CBD5E1] hover:shadow-md",
    cardBorder: "border-[#E2E8F0]",
    innerBg: "bg-[#F8FAFC]",
    inputBg: "bg-[#FFFFFF] border-[#CBD5E1] text-[#0F1D36] focus:border-[#004B87]",
    primaryButton: "bg-[#004B87] hover:bg-[#003B6D] text-white shadow-sm",
    accentBadge: "bg-[#F47920]/15 text-[#D95F10] border-[#F47920]/30",
    headerBg: "bg-white/95 border-b border-[#E2E8F0]",
    taglineTone: "text-[#004B87]",
    heroGradient: "from-[#004B87] to-[#0A2540]",
    accentSaffron: "text-[#F47920]",
  },
  midnight: {
    id: "midnight",
    name: "Midnight Express",
    subtitle: "High-contrast dark mode for night travel",
    icon: Moon,
    bg: "bg-[#0B1120]",
    textPrimary: "text-[#E7ECF6]",
    textSecondary: "text-[#94A3B8]",
    textMuted: "text-[#64748B]",
    sidebarBg: "bg-[#0F172A] border-r border-[#1E293B]",
    sidebarActive: "bg-[#1E293B] text-[#38BDF8] font-semibold border-r-4 border-[#38BDF8]",
    sidebarHover: "hover:bg-[#1E293B]/60 text-[#CBD5E1]",
    cardBg: "bg-[#0F1728]",
    cardHover: "hover:border-[#334155] hover:shadow-lg hover:shadow-black/20",
    cardBorder: "border-[#1E293B]",
    innerBg: "bg-[#131D32]",
    inputBg: "bg-[#131D32] border-[#24314D] text-[#E7ECF6] focus:border-[#38BDF8]",
    primaryButton: "bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-sm shadow-blue-500/20",
    accentBadge: "bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/30",
    headerBg: "bg-[#0F172A]/90 border-b border-[#1E293B]",
    taglineTone: "text-[#38BDF8]",
    heroGradient: "from-[#0F172A] to-[#0B1120]",
    accentSaffron: "text-[#F59E0B]",
  },
  vandebharat: {
    id: "vandebharat",
    name: "Vande Bharat Royal",
    subtitle: "Executive Navy & Electric Saffron theme",
    icon: Sparkles,
    bg: "bg-[#060D1E]",
    textPrimary: "text-[#FFFFFF]",
    textSecondary: "text-[#94A3B8]",
    textMuted: "text-[#64748B]",
    sidebarBg: "bg-[#0A1633] border-r border-[#1A2C5B]",
    sidebarActive: "bg-[#13275A] text-[#FF8A00] font-semibold border-r-4 border-[#FF8A00]",
    sidebarHover: "hover:bg-[#13275A]/60 text-[#E2E8F0]",
    cardBg: "bg-[#0D1C42]",
    cardHover: "hover:border-[#FF8A00]/40 hover:shadow-lg hover:shadow-orange-500/10",
    cardBorder: "border-[#1A2E63]",
    innerBg: "bg-[#0A1636]",
    inputBg: "bg-[#0A1636] border-[#1E3675] text-[#FFFFFF] focus:border-[#FF8A00]",
    primaryButton: "bg-gradient-to-r from-[#FF8A00] to-[#E65100] hover:brightness-110 text-white shadow-md shadow-orange-500/25",
    accentBadge: "bg-[#FF8A00]/15 text-[#FFA033] border-[#FF8A00]/30",
    headerBg: "bg-[#0A1633]/95 border-b border-[#1A2C5B]",
    taglineTone: "text-[#FF8A00]",
    heroGradient: "from-[#0A1633] to-[#060D1E]",
    accentSaffron: "text-[#FF8A00]",
  },
  emerald: {
    id: "emerald",
    name: "Emerald Rail",
    subtitle: "Eco-green & deep jade railway palette",
    icon: Compass,
    bg: "bg-[#061814]",
    textPrimary: "text-[#ECFDF5]",
    textSecondary: "text-[#99F6E4]",
    textMuted: "text-[#4D7C72]",
    sidebarBg: "bg-[#0A261F] border-r border-[#134438]",
    sidebarActive: "bg-[#113B30] text-[#34D399] font-semibold border-r-4 border-[#34D399]",
    sidebarHover: "hover:bg-[#113B30]/60 text-[#D1FAE5]",
    cardBg: "bg-[#0D2F27]",
    cardHover: "hover:border-[#059669]/40 hover:shadow-lg",
    cardBorder: "border-[#144A3D]",
    innerBg: "bg-[#08201B]",
    inputBg: "bg-[#08201B] border-[#195647] text-[#ECFDF5] focus:border-[#34D399]",
    primaryButton: "bg-[#059669] hover:bg-[#047857] text-white shadow-sm",
    accentBadge: "bg-[#10B981]/15 text-[#34D399] border-[#10B981]/30",
    headerBg: "bg-[#0A261F]/95 border-b border-[#134438]",
    taglineTone: "text-[#34D399]",
    heroGradient: "from-[#0A261F] to-[#061814]",
    accentSaffron: "text-[#FBBF24]",
  },
};

async function aiQuery(utterance, rejectedIntentIds = []) {
  const res = await fetch(`${API_BASE}/public/ai-query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ utterance, rejectedIntentIds }),
  });
  return res.json();
}

async function aiQueryConfirm(intentId, pnr) {
  const res = await fetch(`${API_BASE}/public/ai-query/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intentId, pnr: pnr || undefined }),
  });
  return res.json();
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_META = {
  completed: { label: "Past Journey", tone: "text-[#64748B] bg-[#64748B]/10 border border-[#64748B]/20" },
  ongoing: { label: "Active Train", tone: "text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/30" },
  upcoming: { label: "Upcoming", tone: "text-[#0284C7] bg-[#0284C7]/10 border border-[#0284C7]/30" },
};

const TICKET_CATEGORIES = {
  "Refund": ["Fine Payment Deducted, Not Reflected", "Fine Refund Request", "Long-pending Refund", "TDR Refund", "Payment Failed Status"],
  "Profile related issue": ["Forgot Username", "Forgot Password", "Account Deactivated / Suspended", "OTP Issue with Mobile", "OTP Issue with Email"],
  "Website/Mobile App related Issues": ["Website Login Issues", "Website Not Working", "Mobile App Login Issues", "Mobile App Not Working"],
  "Any Other Issue": ["Linen / Journey Related Query", "Executive / Agent Related Query", "Loyalty Program Query", "Other Miscellaneous Query"],
};

export default function PassengerPortal() {
  const { lang, setLang, t, tCat } = useLanguage();
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem("srlms_passenger_theme") || "daylight");
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Active view in portal: 'dashboard' (Help & Support Hero), 'journeys', 'complaints', 'history', 'chat', 'raise-issue', 'raise-ticket', 'ticket-status'
  const [view, setView] = useState(() => {
    return localStorage.getItem("srlms_passenger_view") || "dashboard";
  });

  const theme = THEMES[currentTheme] || THEMES.daylight;

  useEffect(() => {
    localStorage.setItem("srlms_passenger_theme", currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    localStorage.setItem("srlms_passenger_view", view);
  }, [view]);

  // Session persisted in localStorage (JWT token & user)
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem("srlms_passenger_session");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // signup state
  const [signupName, setSignupName] = useState("");
  const [signupMobile, setSignupMobile] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState(null);
  const [signupLoading, setSignupLoading] = useState(false);

  // WhatsApp Sandbox opt-in
  const [whatsappInfo, setWhatsappInfo] = useState(null);
  const [waBannerDismissed, setWaBannerDismissed] = useState(
    () => localStorage.getItem("wa_banner_dismissed") === "1"
  );

  const [bookings, setBookings] = useState([]);
  const [history, setHistory] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [tickets, setTickets] = useState([]);

  // general support ticket state (IRCTC eQuery style)
  const [ticketCategory, setTicketCategory] = useState("");
  const [ticketSubCategory, setTicketSubCategory] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [filingTicket, setFilingTicket] = useState(false);
  const [ticketError, setTicketError] = useState(null);
  const [ticketSuccess, setTicketSuccess] = useState(null);

  // raise-issue state
  const [issueBookingId, setIssueBookingId] = useState("");
  const [issueIntent, setIssueIntent] = useState(INTENT_OPTIONS[0]);
  const [issueDescription, setIssueDescription] = useState("");
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [fileSuccess, setFileSuccess] = useState(null);

  // chat state
  const socket = useMemo(() => (session ? io(SIGNALING_URL, { auth: { token: session.token } }) : null), [session]);
  const engine = useCallEngine({ socket, role: "customer", name: session?.user?.name });
  const [aiPhase, setAiPhase] = useState("idle"); // idle|greeting|listening|thinking|confirming|clarifying|unresolved-choice|resolved|rating|closed|transferring|speaking
  const [transcript, setTranscript] = useState([]);
  const transcriptRef = useRef([]);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [clarifyOptions, setClarifyOptions] = useState(null);
  const [relatedQuestions, setRelatedQuestions] = useState([]);
  const [starterSuggestions, setStarterSuggestions] = useState([]);
  const [textInput, setTextInput] = useState("");
  const [voiceError, setVoiceError] = useState(null);
  const [callRating, setCallRating] = useState(null);
  const [callRatingSubmitting, setCallRatingSubmitting] = useState(false);
  const [callbackState, setCallbackState] = useState("idle"); // idle|requesting|requested|failed
  const [callSeconds, setCallSeconds] = useState(0);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [callMinimized, setCallMinimized] = useState(false);
  // Tracks whether a call is truly "in progress" including while minimized.
  // Separate from engine.status so the bar survives transient idle transitions.
  const [callIsActive, setCallIsActive] = useState(false);
  const lastResultRef = useRef(null);

  // Sync speaker toggle with remote audio element
  useEffect(() => {
    engine.setSpeaker?.(speakerOn);
    if (engine.remoteAudioRef?.current) {
      engine.remoteAudioRef.current.muted = !speakerOn;
    }
  }, [speakerOn, engine.setSpeaker, engine.remoteAudioRef]);

  // Live call timer + active tracking
  useEffect(() => {
    let interval = null;
    const nonIdleStatuses = ["connecting", "ringing-out", "queued", "connected", "transferring", "ended", "ringing-in"];
    if (engine.status === "connected") {
      setCallIsActive(true);
      interval = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    } else if (nonIdleStatuses.includes(engine.status)) {
      setCallIsActive(true);
    } else if (engine.status === "idle") {
      // Only clear active state when not minimized OR when engine says truly idle
      // Give a small grace period to allow UI to catch up
      const t = setTimeout(() => {
        setCallIsActive(false);
        setCallMinimized(false);
        setCallSeconds(0);
      }, 400);
      return () => clearTimeout(t);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [engine.status]);

  function formatCallTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // Categorized FAQ state
  const [faqList, setFaqList] = useState([]); // all intents from /public/faq
  const [activeFaqCategory, setActiveFaqCategory] = useState(null);
  // chatPhase controls what the chat area shows: 'welcome' | 'browsing' | 'chatting'
  const [chatPhase, setChatPhase] = useState("welcome");
  const chatScrollRef = useRef(null);

  // Derived: group faqList by category
  const faqCategories = useMemo(() => {
    const map = {};
    faqList.forEach((item) => {
      const cat = item.category || "General";
      if (!map[cat]) map[cat] = { name: cat, intents: [] };
      map[cat].intents.push(item);
    });
    return Object.values(map);
  }, [faqList]);

  const activeIntents = useMemo(() => {
    if (!activeFaqCategory) return [];
    const cat = faqCategories.find((c) => c.name === activeFaqCategory);
    return cat ? cat.intents : [];
  }, [activeFaqCategory, faqCategories]);

  // Scroll chat to bottom on new messages / phase changes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [transcript, aiPhase, chatPhase, activeFaqCategory]);

  async function fetchAll(token) {
    const headers = { Authorization: `Bearer ${token}` };
    const [b, h, c, t] = await Promise.all([
      fetch(`${API_BASE}/passengers/me/bookings`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/passengers/me/history`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/passengers/me/complaints`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/passengers/me/tickets`, { headers }).then((r) => r.json()),
    ]);
    setBookings(Array.isArray(b) ? b : []);
    setHistory(Array.isArray(h) ? h : []);
    setComplaints(Array.isArray(c) ? c : []);
    setTickets(Array.isArray(t) ? t : []);
  }

  useEffect(() => {
    if (session) fetchAll(session.token);
  }, [session]);

  useEffect(() => {
    if (!session || (view !== "ticket-status" && view !== "complaints")) return undefined;
    const refresh = () => fetchAll(session.token);
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [session, view]);

  useEffect(() => {
    fetch(`${API_BASE}/public/whatsapp-info`)
      .then((r) => r.json())
      .then(setWhatsappInfo)
      .catch(() => setWhatsappInfo(null));
  }, []);

  function dismissWaBanner() {
    localStorage.setItem("wa_banner_dismissed", "1");
    setWaBannerDismissed(true);
  }

  // If user refreshed directly on chat view, ensure faqList is loaded
  useEffect(() => {
    if (view === "chat" && faqList.length === 0) {
      fetch(`${API_BASE}/public/faq`)
        .then((r) => r.json())
        .then((data) => setFaqList(Array.isArray(data) ? data : []))
        .catch(() => setFaqList([]));
    }
  }, [view, faqList.length]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/passenger-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed. Check credentials.");
      setSession(data);
      try {
        localStorage.setItem("srlms_passenger_session", JSON.stringify(data));
      } catch {}
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setSignupError(null);
    setSignupLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/passenger-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: signupName.trim(), mobile: signupMobile.trim(), email: signupEmail.trim() || undefined,
          username: signupUsername.trim(), password: signupPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create account");
      setSession(data);
      try {
        localStorage.setItem("srlms_passenger_session", JSON.stringify(data));
      } catch {}
    } catch (err) {
      setSignupError(err.message);
    } finally {
      setSignupLoading(false);
    }
  }

  function handleLogout() {
    try {
      localStorage.removeItem("srlms_passenger_session");
      localStorage.removeItem("srlms_passenger_view");
    } catch {}
    setSession(null);
    setBookings([]); setHistory([]); setComplaints([]); setTickets([]);
    setView("dashboard");
    resetChat();
  }

  function pushTranscript(speaker, text) {
    transcriptRef.current = [...transcriptRef.current, { speaker, text }];
    setTranscript(transcriptRef.current);
  }

  function resetChat() {
    transcriptRef.current = [];
    setTranscript([]);
    setPendingConfirm(null);
    setClarifyOptions(null);
    setRelatedQuestions([]);
    setStarterSuggestions([]);
    setVoiceError(null);
    setCallRating(null);
    lastResultRef.current = null;
    setAiPhase("idle");
  }

  async function openChat() {
    resetChat();
    setActiveFaqCategory(null);
    setChatPhase("welcome");
    setView("chat");
    setAiPhase("idle");
    try {
      const r = await fetch(`${API_BASE}/public/faq`);
      const data = await r.json();
      const list = Array.isArray(data) ? data : [];
      setFaqList(list);
    } catch {
      setFaqList([]);
    }
  }

  // Called when passenger clicks a category in sidebar or mobile bar
  function handleChatCategoryClick(catName) {
    if (activeFaqCategory === catName && chatPhase === "browsing") {
      // Toggle off if clicking the already active one
      setActiveFaqCategory(null);
      if (transcript.length === 0) setChatPhase("welcome");
      return;
    }
    setActiveFaqCategory(catName);
    if (transcript.length === 0) {
      setChatPhase("browsing");
    }
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
      }
    }, 60);
  }

  async function handleStarterPick(intent) {
    setStarterSuggestions([]);
    setActiveFaqCategory(null);
    const question = intent.questions?.[0] || intent.name;
    pushTranscript("customer", question);
    setChatPhase("chatting");
    setAiPhase("thinking");
    const data = await aiQueryConfirm(intent.id, session?.user?.pnr);
    lastResultRef.current = { matchedIntent: data.matchedIntent, confidence: 1, thresholdMet: true };
    pushTranscript("ai", data.reply);
    setRelatedQuestions(data.relatedQuestions || []);
    setAiPhase("speaking");
    await speak(data.reply);
    setAiPhase("resolved");
  }

  // Handler for clicking a related question chip
  async function handleRelatedIntentClick(rel) {
    setRelatedQuestions([]);
    const question = rel.sampleQuestion || rel.name;
    pushTranscript("customer", question);
    setChatPhase("chatting");
    setAiPhase("thinking");
    const data = await aiQueryConfirm(rel.id, session?.user?.pnr);
    lastResultRef.current = { matchedIntent: data.matchedIntent, confidence: 1, thresholdMet: true };
    pushTranscript("ai", data.reply);
    setRelatedQuestions(data.relatedQuestions || []);
    setAiPhase("speaking");
    await speak(data.reply);
    setAiPhase("resolved");
  }

  function handleBackToMenu() {
    resetChat();
    setChatPhase("welcome");
    setActiveFaqCategory(null);
    setAiPhase("idle");
  }

  // Category icons map
  const CAT_ICONS = {
    "Linen Issues": Bed,
    "Customer's Choice": Star,
    "Coach & Safety": Train,
    "Journey Info": Map,
    "Fines & Payments": CreditCard,
    "E-Catering & Station Assistance": UtensilsCrossed,
    "Policy & General FAQ": ClipboardList,
    "General": MessageCircle,
  };
  function getCatIcon(name) {
    return CAT_ICONS[name] || MessageCircle;
  }
  function CatIcon({ name, className = "w-5 h-5" }) {
    const Icon = getCatIcon(name);
    return <Icon className={className} />;
  }

  async function processQuery(text, rejectedIntentIds = []) {
    setStarterSuggestions([]);
    setAiPhase("thinking");
    setRelatedQuestions([]);
    setClarifyOptions(null);
    const result = await aiQuery(text, rejectedIntentIds);
    lastResultRef.current = result;

    if (result.status === "confirm") {
      setPendingConfirm({ id: result.candidateIntentId, name: result.candidateIntentName, utterance: text, rejected: rejectedIntentIds });
      pushTranscript("ai", result.confirmPrompt);
      setAiPhase("confirming");
      await speak(result.confirmPrompt);
    } else if (result.status === "clarify") {
      setClarifyOptions({ options: result.options, utterance: text, rejected: rejectedIntentIds });
      const prompt = "I'm not fully sure, but did you mean one of these?";
      pushTranscript("ai", prompt);
      setAiPhase("clarifying");
      await speak(prompt);
    } else {
      const msg = "I couldn't find an exact match in our knowledge base.";
      pushTranscript("ai", msg);
      setAiPhase("unresolved-choice");
      await speak(msg + " Would you like to end the chat, or talk to an executive?");
    }
  }

  async function handleClarifyPick(option) {
    setClarifyOptions(null);
    pushTranscript("customer", option.sampleQuestion || option.name);
    setAiPhase("thinking");
    const data = await aiQueryConfirm(option.id, session?.user?.pnr);
    lastResultRef.current = { matchedIntent: data.matchedIntent, confidence: 1, thresholdMet: true };
    pushTranscript("ai", data.reply);
    setRelatedQuestions(data.relatedQuestions || []);
    setAiPhase("speaking");
    await speak(data.reply);
    setAiPhase("resolved");
  }

  async function handleClarifyNone() {
    const current = clarifyOptions;
    setClarifyOptions(null);
    pushTranscript("customer", "None of these");
    if (current) {
      const rejectedIds = [...current.rejected, ...current.options.map((o) => o.id)];
      await processQuery(current.utterance, rejectedIds);
    } else {
      setAiPhase("unresolved-choice");
    }
  }

  async function handleConfirmYes() {
    const candidate = pendingConfirm;
    if (!candidate) return;
    setPendingConfirm(null);
    setAiPhase("thinking");
    const data = await aiQueryConfirm(candidate.id, session?.user?.pnr);
    lastResultRef.current = { matchedIntent: data.matchedIntent, confidence: 1, thresholdMet: true };
    pushTranscript("ai", data.reply);
    setRelatedQuestions(data.relatedQuestions || []);
    setAiPhase("speaking");
    await speak(data.reply);
    setAiPhase("resolved");
  }

  async function handleConfirmNo() {
    const candidate = pendingConfirm;
    if (!candidate) return;
    setPendingConfirm(null);
    pushTranscript("customer", "No, that's not it");
    await processQuery(candidate.utterance, [...candidate.rejected, candidate.id]);
  }

  async function handleSendText(e) {
    e.preventDefault();
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput("");
    pushTranscript("customer", text);
    setChatPhase("chatting");
    await processQuery(text);
  }

  async function handleSpeak() {
    if (aiPhase === "listening") {
      setAiPhase("idle");
      return;
    }
    setAiPhase("listening");
    setVoiceError(null);
    const recognitionLang = lang === "hi" ? "hi-IN" : "en-IN";
    try {
      const text = await listenOnce(recognitionLang);
      if (text && text.trim()) {
        pushTranscript("customer", text.trim());
        setChatPhase("chatting");
        await processQuery(text.trim());
      } else {
        setAiPhase("idle");
      }
    } catch (err) {
      console.warn("[voice] speech recognition error:", err);
      const errMsg = (err === "not-allowed" || err === "permission-denied")
        ? "Microphone access blocked. Please allow microphone permissions in your browser."
        : err === "not-supported"
        ? "Voice recognition is not supported in this browser."
        : "Could not hear audio clearly. Please try speaking into the mic or typing below.";
      setVoiceError(errMsg);
      setAiPhase("idle");
    }
  }

  async function handleRelatedQuestion(question) {
    pushTranscript("customer", question);
    await processQuery(question);
  }

  function handleTalkToExecutive() {
    setAiPhase("transferring");
    const last = lastResultRef.current;
    const pnr = session?.user?.pnr || bookings[0]?.pnr || "—";
    engine.placeCall({
      topic: last?.matchedIntent || "Railway Support Assistance",
      pnr,
      transcript: transcriptRef.current,
      aiIntent: last?.matchedIntent,
      aiConfidence: last?.confidence,
    });
  }

  async function handleSOS() {
    setAiPhase("transferring");
    const pnr = session?.user?.pnr || bookings[0]?.pnr || "—";
    pushTranscript("customer", "EMERGENCY SOS PRESSED");
    pushTranscript("ai", "Emergency alert received. Ringing all available support executives and operations staff immediately.");
    engine.placeCall({
      topic: "EMERGENCY SOS",
      pnr,
      transcript: transcriptRef.current,
      isEmergency: true,
    });
  }

  async function submitRating(stars) {
    setAiPhase("closed");
    try {
      await fetch(`${API_BASE}/public/ai-session/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: session?.user?.name,
          pnr: session?.user?.pnr,
          transcript: transcriptRef.current,
          intent: lastResultRef.current?.matchedIntent,
          confidence: lastResultRef.current?.confidence,
          resolved: stars > 0,
          rating: stars || undefined,
        }),
      });
      if (session) fetchAll(session.token);
    } catch {
      // ignore
    }
  }

  async function handleRateCall(stars) {
    if (!engine.callId || callRatingSubmitting) return;
    setCallRatingSubmitting(true);
    setCallRating(stars);
    try {
      await fetch(`${API_BASE}/public/calls/${engine.callId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: stars }),
      });
      if (session) fetchAll(session.token);
    } catch {
      // ignore
    } finally {
      setCallRatingSubmitting(false);
    }
  }

  async function requestRealCallback() {
    if (!session?.user?.mobile || callbackState === "requesting") return;
    setCallbackState("requesting");
    try {
      const res = await fetch(`${API_BASE}/voice/callback-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: session.user.mobile, passengerName: session.user.name }),
      });
      const data = await res.json();
      setCallbackState(data.ok ? "requested" : "failed");
    } catch {
      setCallbackState("failed");
    }
  }

  function goToQueryPage() {
    engine.cancelQueue();
    resetChat();
    setView("raise-ticket");
  }

  async function handleFileTicket(e) {
    e.preventDefault();
    if (!ticketCategory || !ticketSubCategory) {
      setTicketError("Please select both category and sub-category.");
      return;
    }
    setTicketError(null);
    setTicketSuccess(null);
    setFilingTicket(true);
    try {
      const res = await fetch(`${API_BASE}/passengers/me/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ category: ticketCategory, subCategory: ticketSubCategory, description: ticketDescription.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit query");
      setTicketSuccess(`Query registered — Concern ID #${data.concernId}`);
      setTicketDescription("");
      fetchAll(session.token);
    } catch (err) {
      setTicketError(err.message);
    } finally {
      setFilingTicket(false);
    }
  }

  async function handleFileIssue(e) {
    e.preventDefault();
    if (!issueBookingId) {
      setFileError("Please select a journey.");
      return;
    }
    setFileError(null);
    setFileSuccess(null);
    setFiling(true);
    try {
      const b = bookings.find((x) => x._id === issueBookingId);
      const res = await fetch(`${API_BASE}/passengers/me/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ bookingId: issueBookingId, intent: issueIntent, description: issueDescription.trim() || undefined }),
      });
      const data = await res.json();
      if (res.status === 409 && data.duplicate) {
        setFileSuccess("Using your existing open complaint — no new one filed.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not file the issue");
      setFileSuccess(`Issue filed — reference #${data._id.slice(-6).toUpperCase()}`);
      setIssueDescription("");
      fetchAll(session.token);
    } catch (err) {
      setFileError(err.message);
    } finally {
      setFiling(false);
    }
  }

  const inRealCall = engine.status !== "idle";

  // Quick autofill for login demo
  function autofillUser(u) {
    setUsername(u);
    setPassword("password123");
  }

  // =========================================================================
  // 1. IRCTC-STYLE LOGIN / SIGN UP SCREEN
  // =========================================================================
  if (!session) {
    return (
      <div className={`min-h-screen ${theme.bg} ${theme.textPrimary} flex flex-col`} style={{ fontFamily: "Inter, sans-serif" }}>
        {/* Top Navbar with Official Branding & Prominent Back Button */}
        <header className="w-full bg-[#003B73] text-white border-b-4 border-[#F47920] px-4 py-3 sm:px-8 shadow-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* Left: Prominent Back to Home Button */}
            <a
              href="#/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-semibold tracking-wide transition-all border border-white/25 shadow-sm active:scale-95"
              title="Return to System Portal"
            >
              <ArrowLeft size={16} className="text-[#F47920]" />
              <span>Back to Home</span>
            </a>

            {/* Center / Brand Header */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white p-1 shadow-sm flex items-center justify-center">
                <Train size={24} className="text-[#003B73]" />
              </div>
              <div className="text-left">
                <div className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                  <span>IRCTC</span>
                  <span className="text-[#F47920]">SRLMS</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/20 text-white font-normal hidden sm:inline-block">Govt of India</span>
                </div>
                <div className="text-[10px] text-white/80 tracking-tight hidden sm:block">
                  Smart Railway Linen Management & Grievance Portal
                </div>
              </div>
            </div>

            {/* Right: Theme Toggle */}
            <button
              onClick={() => setThemeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/20 transition-all"
            >
              <Palette size={14} className="text-[#F47920]" />
              <span className="hidden sm:inline">Theme</span>
            </button>
          </div>
        </header>

        {/* Main Split Layout: Left Vande Bharat Hero Banner | Right IRCTC Auth Card */}
        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
          <div className="w-full max-w-5xl rounded-2xl border border-[#CBD5E1] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
            
            {/* Left Hero Graphic Section (Vande Bharat & Rail Heritage) */}
            <div className="lg:col-span-5 bg-gradient-to-br from-[#003366] via-[#004B87] to-[#0A2540] text-white p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
              {/* Decorative rail stripes */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-[#F47920]/20 rounded-full blur-2xl pointer-events-none" />

              <div className="relative z-10 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs font-medium backdrop-blur-sm">
                  <Sparkles size={13} className="text-[#F47920]" />
                  <span>Integrated Indian Railways Service</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                  Seamless Passenger Care & Linen Redressal
                </h1>
                <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                  Direct grievance logging for Vande Bharat, Rajdhani, and Express trains with instant AI assistance and real-time supervisor escalation.
                </p>
              </div>

              {/* Vande Bharat Stylized Train Card */}
              <div className="relative z-10 my-6 rounded-xl bg-white/10 border border-white/20 p-4 backdrop-blur-md space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#F47920] uppercase tracking-wider flex items-center gap-1">
                    <Train size={14} /> Vande Bharat Express Care
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#10B981]/20 text-[#10B981] font-mono font-medium">Active</span>
                </div>
                <div className="text-xs text-white/90 font-medium">
                  24x7 Multi-lingual AI Helpline · Instant Coach Attendant Ping · Clean Linen Assurance
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
                  <div>
                    <div className="text-sm font-bold text-white">2.5 min</div>
                    <div className="text-[9px] text-white/70 uppercase">Avg Response</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">99.4%</div>
                    <div className="text-[9px] text-white/70 uppercase">Resolution</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Level 2</div>
                    <div className="text-[9px] text-white/70 uppercase">CPGRAMS</div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 text-[11px] text-white/60 flex items-center justify-between">
                <span>Centre for Railway Information Systems (CRIS)</span>
                <span>IRCTC Certified</span>
              </div>
            </div>

            {/* Right Authentication Form (IRCTC e-Ticketing Style) */}
            <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-white dark:bg-[#0F172A]">
              <div className="max-w-md mx-auto w-full space-y-6">
                
                {/* Form Header */}
                <div className="space-y-1 text-left">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#003366] dark:text-[#38BDF8]">
                    {authMode === "login" ? "Passenger Sign In" : "New Passenger Registration"}
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    Access your active journeys, raise linen complaints, and talk to support.
                  </p>
                </div>

                {/* Login / Signup Tabs */}
                <div className="flex rounded-xl bg-[#F1F5F9] dark:bg-[#1E293B] p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`flex-1 py-2 rounded-lg transition-all ${
                      authMode === "login"
                        ? "bg-white dark:bg-[#003B73] text-[#003366] dark:text-white shadow-sm font-bold"
                        : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]"
                    }`}
                  >
                    IRCTC Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    className={`flex-1 py-2 rounded-lg transition-all ${
                      authMode === "signup"
                        ? "bg-white dark:bg-[#003B73] text-[#003366] dark:text-white shadow-sm font-bold"
                        : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]"
                    }`}
                  >
                    Register New Account
                  </button>
                </div>

                {/* Login Form */}
                {authMode === "login" ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Username / IRCTC ID
                      </label>
                      <div className="relative">
                        <input
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g. passenger1"
                          required
                          autoFocus
                          className="w-full rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3.5 py-2.5 text-sm text-[#0F172A] dark:text-white placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#003B73] dark:focus:ring-[#38BDF8]"
                        />
                        <User size={16} className="absolute right-3 top-3 text-[#94A3B8]" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-[#334155] dark:text-[#CBD5E1]">
                          Password
                        </label>
                        <span className="text-[11px] text-[#004B87] dark:text-[#38BDF8] hover:underline cursor-pointer">
                          Forgot password?
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="w-full rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3.5 py-2.5 text-sm text-[#0F172A] dark:text-white placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#003B73] dark:focus:ring-[#38BDF8]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-[#94A3B8] hover:text-[#334155]"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {loginError && (
                      <div className="p-2.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#DC2626] text-xs flex items-center gap-1.5">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{loginError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loginLoading}
                      className="w-full py-3 rounded-lg bg-[#F47920] hover:bg-[#E06810] text-white text-sm font-bold shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-70"
                    >
                      {loginLoading ? (
                        <><Loader2 size={16} className="animate-spin" /> Verifying IRCTC account…</>
                      ) : (
                        <>Sign In to Passenger Portal <ArrowRight size={16} /></>
                      )}
                    </button>

                    {/* Quick Demo Autofill Helper */}
                    <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2">
                      <div className="text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] text-center flex items-center justify-center gap-1">
                        <Zap className="w-3 h-3" /> Quick Demo Accounts (Click to Fill):
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {["passenger1", "passenger2", "passenger3", "passenger4"].map((demo) => (
                          <button
                            key={demo}
                            type="button"
                            onClick={() => autofillUser(demo)}
                            className="px-2.5 py-1 rounded-md bg-[#F1F5F9] dark:bg-[#1E293B] text-[#003B73] dark:text-[#38BDF8] border border-[#CBD5E1] dark:border-[#334155] text-[11px] font-mono hover:bg-[#E2E8F0]"
                          >
                            {demo}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>
                ) : (
                  /* Registration Form */
                  <form onSubmit={handleSignup} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                        Full Name
                      </label>
                      <input
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        placeholder="e.g. Murtaza Ali"
                        required
                        className="w-full rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3.5 py-2 text-sm text-[#0F172A] dark:text-white focus:ring-2 focus:ring-[#003B73]"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Mobile Number
                        </label>
                        <input
                          value={signupMobile}
                          onChange={(e) => setSignupMobile(e.target.value)}
                          placeholder="e.g. 9876543210"
                          required
                          className="w-full rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3.5 py-2 text-sm text-[#0F172A] dark:text-white focus:ring-2 focus:ring-[#003B73]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Email (Optional)
                        </label>
                        <input
                          type="email"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          placeholder="passenger@railway.in"
                          className="w-full rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3.5 py-2 text-sm text-[#0F172A] dark:text-white focus:ring-2 focus:ring-[#003B73]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Choose Username
                        </label>
                        <input
                          value={signupUsername}
                          onChange={(e) => setSignupUsername(e.target.value)}
                          placeholder="murtaza_rail"
                          required
                          className="w-full rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3.5 py-2 text-sm text-[#0F172A] dark:text-white focus:ring-2 focus:ring-[#003B73]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                          Choose Password
                        </label>
                        <input
                          type="password"
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="w-full rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] px-3.5 py-2 text-sm text-[#0F172A] dark:text-white focus:ring-2 focus:ring-[#003B73]"
                        />
                      </div>
                    </div>

                    {signupError && (
                      <div className="p-2.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#DC2626] text-xs">
                        {signupError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={signupLoading}
                      className="w-full py-2.5 rounded-lg bg-[#004B87] hover:bg-[#003B6D] text-white text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                      {signupLoading ? "Creating account…" : "Register IRCTC Passenger Account"}
                    </button>
                  </form>
                )}

                {/* Back to Home Action Button */}
                <div className="pt-2 text-center">
                  <a
                    href="#/"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-[#004B87] dark:text-[#38BDF8] hover:underline"
                  >
                    <ArrowLeft size={14} /> Back to Indian Railways Home
                  </a>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Theme Selector Modal */}
        {renderThemeModal()}
      </div>
    );
  }

  // =========================================================================
  // 2. EXPANSIVE "TALK TO AI" INTERFACE VIEW
  // =========================================================================
  if (view === "chat") {
    // Pick the passenger's most recent/active booking for the welcome card
    const activeBooking = bookings.find((b) => b.status === "ongoing") || bookings[0] || null;

    return (
      <div className={`h-screen h-[100dvh] max-h-[100dvh] ${theme.bg} ${theme.textPrimary} flex flex-col overflow-hidden ${callIsActive && callMinimized ? "pb-16" : ""}`} style={{ fontFamily: "Inter, sans-serif" }}>
        {/* ── Top Chat Header ── */}
        <header className={`w-full ${theme.headerBg} px-2.5 sm:px-6 py-2.5 border-b ${theme.cardBorder} shadow-sm shrink-0`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
            {/* Back Button */}
            <button
              onClick={() => { resetChat(); setView("dashboard"); }}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${theme.cardBorder} ${theme.innerBg} hover:opacity-80 active:scale-95 shrink-0`}
            >
              <ArrowLeft size={15} />
              <span className="hidden sm:inline">{t("backToHelp")}</span>
              <span className="sm:hidden">{t("back")}</span>
            </button>

            {/* Centre brand */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-[#0284C7] to-[#38BDF8] text-white flex items-center justify-center shadow shrink-0">
                <Bot size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold flex items-center gap-1.5 truncate">
                  <span className="truncate">{t("railCareAi")}</span>
                  <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block animate-ping shrink-0" />
                </div>
                <div className={`text-[10px] ${theme.textSecondary} hidden md:block`}>{t("bilingualTag")}</div>
              </div>
            </div>

            {/* Right Controls: Language Selector, SOS, Talk to Executive / Return to Call */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Language Selector Dropdown in Chat */}
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className={`text-xs px-2 py-1 rounded-lg border ${theme.cardBorder} ${theme.innerBg} font-semibold focus:outline-none shrink-0 shadow-xs cursor-pointer`}
                title="Select Language / भाषा चुनें"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>

              {callIsActive && callMinimized ? (
                // ── RESTORE CALL PILL — always visible in navbar when minimized ──
                <button
                  onClick={() => setCallMinimized(false)}
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md animate-pulse transition-all"
                  title="Return to active call"
                >
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
                    <Phone size={13} className="relative" />
                  </div>
                  <span className="hidden sm:inline">{t("returnToCall")}</span>
                  <span className="sm:hidden">{t("inCall")}</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleTalkToExecutive}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[#0284C7] text-xs font-semibold border border-[#0284C7]/30 hover:bg-[#0284C7]/10 transition-all shrink-0"
                    title="Speak to Railway Executive"
                  >
                    <PhoneForwarded size={13} />
                    <span className="hidden sm:inline">{t("executive")}</span>
                  </button>
                  <button
                    onClick={handleSOS}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#DC2626] text-xs font-bold flex items-center gap-1 hover:bg-[#EF4444]/25 transition-all shrink-0"
                    title="Emergency SOS"
                  >
                    <AlertTriangle size={13} />
                    <span>{t("sos")}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ── Mobile Slide-Over Drawer for Browse Topics ── */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
              onClick={() => setSidebarOpen(false)}
            />
            <div
              className={`relative w-72 max-w-[85vw] h-full ${theme.sidebarBg} flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200`}
            >
              <div className={`px-4 py-3.5 border-b ${theme.cardBorder} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-[#0284C7]" />
                  <span className="font-bold text-sm">{t("browseTopics")}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${theme.innerBg} font-mono text-gray-500`}>
                    {faqCategories.length}
                  </span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className={`p-1.5 rounded-lg ${theme.innerBg} text-gray-500 hover:text-gray-800 transition-colors`}
                  title="Close Menu"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {faqCategories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => {
                      handleChatCategoryClick(cat.name);
                      setSidebarOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3.5 flex items-center gap-3 text-xs font-semibold transition-all border-b ${theme.cardBorder} ${
                      activeFaqCategory === cat.name
                        ? theme.sidebarActive
                        : `${theme.sidebarHover} ${theme.textSecondary}`
                    }`}
                  >
                    <span className="w-6 flex items-center justify-center"><CatIcon name={cat.name} className="w-5 h-5" /></span>
                    <span className="flex-1 leading-snug">{tCat(cat.name)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      activeFaqCategory === cat.name ? "bg-white/20" : theme.innerBg
                    }`}>
                      {cat.intents.length}
                    </span>
                    <ChevronRight size={14} className="opacity-40" />
                  </button>
                ))}
              </div>
              <div className={`px-4 py-3 border-t ${theme.cardBorder} text-[10px] ${theme.textMuted} text-center`}>
                {t("tapTopicHint")}
              </div>
            </div>
          </div>
        )}

        {/* ── Main: Desktop 2-column ── */}
        <main className="flex-1 flex overflow-hidden max-w-7xl w-full mx-auto">

          {/* ── LEFT PANEL: Browse Topics (categories only) ── */}
          <aside className={`hidden lg:flex flex-col w-64 xl:w-72 shrink-0 border-r ${theme.cardBorder} ${theme.sidebarBg} overflow-hidden`}>
            <div className={`px-4 py-3 border-b ${theme.cardBorder} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <Layers size={14} className={theme.textMuted} />
                <span className={`text-[11px] font-bold uppercase tracking-widest ${theme.textMuted}`}>{t("browseTopics")}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${theme.innerBg} ${theme.textMuted}`}>
                {faqCategories.length}
              </span>
            </div>
            <div className="flex-1 flex flex-col overflow-y-auto">
              {faqCategories.length === 0 ? (
                <div className={`px-4 py-8 text-xs text-center ${theme.textMuted}`}>
                  <Loader2 size={18} className="animate-spin mx-auto mb-2" />
                  Loading topics…
                </div>
              ) : (
                faqCategories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => handleChatCategoryClick(cat.name)}
                    className={`w-full text-left px-4 py-3.5 flex items-center gap-3 text-xs font-semibold transition-all border-b ${theme.cardBorder} ${
                      activeFaqCategory === cat.name
                        ? theme.sidebarActive
                        : `${theme.sidebarHover} ${theme.textSecondary}`
                    }`}
                  >
                    <span className="w-6 flex items-center justify-center"><CatIcon name={cat.name} className="w-[18px] h-[18px]" /></span>
                    <span className="flex-1 leading-snug">{tCat(cat.name)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      activeFaqCategory === cat.name ? "bg-white/20" : theme.innerBg
                    }`}>{cat.intents.length}</span>
                    <ChevronRight size={13} className="opacity-40" />
                  </button>
                ))
              )}
            </div>
            {/* Helper note */}
            <div className={`px-4 py-3 border-t ${theme.cardBorder} text-[10px] ${theme.textMuted} text-center`}>
              {t("clickTopicHint")}
            </div>
          </aside>

          {/* ── RIGHT PANEL: Chat area ── */}
          <section className={`flex-1 flex flex-col overflow-hidden ${theme.bg}`}>

            {/* Info strip */}
            <div className={`px-3 sm:px-4 py-2 ${theme.innerBg} border-b ${theme.cardBorder} flex items-center justify-between text-xs shrink-0`}>
              <span className={`flex items-center gap-1.5 font-medium ${theme.textSecondary} truncate`}>
                <Sparkles size={12} className="text-[#F47920] shrink-0" />
                <span className="hidden sm:inline truncate">{t("selectTopicStrip")}</span>
                <span className="sm:hidden truncate">{t("tapTopicStrip")}</span>
              </span>
              <button
                onClick={handleTalkToExecutive}
                className="text-[#0284C7] font-semibold hover:underline flex items-center gap-1 whitespace-nowrap shrink-0 ml-2"
              >
                <PhoneForwarded size={12} />
                <span className="hidden sm:inline">{t("speakToExecutive")}</span>
                <span className="sm:hidden">{t("executive")}</span>
                <ArrowRight size={11} />
              </button>
            </div>

            {/* Mobile / Tablet Horizontal Category Scroll with Quick Drawer Trigger */}
            {faqCategories.length > 0 && (
              <div className={`lg:hidden px-2.5 sm:px-3 py-2 border-b ${theme.cardBorder} ${theme.sidebarBg} flex items-center gap-2 shrink-0`}>
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#004B87] hover:bg-[#003B6D] text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                  title="Browse all topics"
                >
                  <Layers size={13} />
                  <span>{t("topics")}</span>
                </button>
                <div className="flex-1 overflow-x-auto flex items-center gap-1.5 no-scrollbar py-0.5">
                  {faqCategories.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => handleChatCategoryClick(cat.name)}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap active:scale-95 ${
                        activeFaqCategory === cat.name
                          ? "bg-[#0284C7] text-white border-[#0284C7] shadow-sm font-bold"
                          : `${theme.cardBorder} ${theme.cardBg} ${theme.textSecondary} hover:border-[#0284C7]`
                      }`}
                    >
                      <CatIcon name={cat.name} className="w-3.5 h-3.5" />
                      <span>{tCat(cat.name)}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        activeFaqCategory === cat.name ? "bg-white/20" : theme.innerBg
                      }`}>
                        {cat.intents.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Chat scroll area ── */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto">

              {/* ═══ INITIAL / WELCOME STATE (When no messages have been exchanged yet) ═══ */}
              {transcript.length === 0 && (
                <div className="p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-5">

                  {/* 1. Welcome Card to Passenger with Indian Railways & Journey Details */}
                  <div className={`rounded-2xl border ${theme.cardBorder} overflow-hidden shadow-sm`}>
                    {/* IR Brand Header */}
                    <div className="bg-gradient-to-r from-[#003B73] to-[#004B87] px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <Train size={20} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-white font-bold text-xs sm:text-sm truncate">Indian Railways · IRCTC SRLMS</div>
                        <div className="text-white/70 text-[10px] sm:text-[11px] truncate">{t("irctcSmartSystem")}</div>
                      </div>
                      <div className="ml-auto text-right hidden sm:block shrink-0">
                        <div className="text-[10px] text-white/60 uppercase tracking-wider">{t("poweredBy")}</div>
                        <div className="text-white font-bold text-xs">RailCare AI</div>
                      </div>
                    </div>

                    {/* Passenger greeting body */}
                    <div className={`${theme.cardBg} px-4 py-3.5 sm:px-5 sm:py-4 space-y-3`}>
                      <div>
                        <div className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-widest ${theme.textMuted} mb-0.5`}>{t("welcomeAboard")}</div>
                        <div className="text-base sm:text-lg font-extrabold tracking-tight">
                          {t("namaste")}, {session?.user?.name || "Passenger"}
                        </div>
                        <div className={`text-xs ${theme.textSecondary} mt-0.5`}>
                          {t("howCanWeHelp")}
                        </div>
                      </div>

                      {/* Journey info strip */}
                      {activeBooking ? (
                        <div className={`rounded-xl ${theme.innerBg} border ${theme.cardBorder} p-2.5 sm:p-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3`}>
                          <div className="min-w-0">
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${theme.textMuted}`}>{t("train")}</div>
                            <div className="text-xs font-bold mt-0.5 truncate">{activeBooking.trainName || activeBooking.trainNumber || "—"}</div>
                          </div>
                          <div className="min-w-0">
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${theme.textMuted}`}>{t("pnr")}</div>
                            <div className="text-xs font-bold mt-0.5 font-mono tracking-widest truncate">{activeBooking.pnr || session?.user?.pnr || "—"}</div>
                          </div>
                          <div className="min-w-0">
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${theme.textMuted}`}>{t("coach")}</div>
                            <div className="text-xs font-bold mt-0.5 truncate">{activeBooking.coach || "—"}</div>
                          </div>
                          <div className="min-w-0">
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${theme.textMuted}`}>{t("berth")}</div>
                            <div className="text-xs font-bold mt-0.5 truncate">{activeBooking.berth || "—"}</div>
                          </div>
                        </div>
                      ) : (
                        <div className={`rounded-xl ${theme.innerBg} border ${theme.cardBorder} px-3.5 py-2.5 text-xs ${theme.textSecondary} flex items-center gap-2`}>
                          <Ticket size={14} className="shrink-0" />
                          <span>{t("noBooking")}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Topic State: If a topic is selected, display its questions right in the chat interface! */}
                  {activeFaqCategory ? (
                    <div className={`rounded-2xl p-3.5 sm:p-5 border-2 border-[#0284C7]/40 ${theme.cardBg} space-y-3.5 sm:space-y-4 shadow-sm animate-in fade-in duration-200`}>
                      {/* Topic Header with Clear button */}
                      <div className={`flex items-center justify-between gap-2 pb-3 border-b ${theme.cardBorder}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="shrink-0 w-8 h-8 rounded-full bg-[#0284C7]/10 flex items-center justify-center"><CatIcon name={activeFaqCategory} className="w-4 h-4 text-[#0284C7]" /></span>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-[#0284C7] leading-tight truncate">
                              {tCat(activeFaqCategory)}
                            </div>
                            <div className={`text-[11px] ${theme.textMuted}`}>
                              {activeIntents.length} {t("questionsAvailable")}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => { setActiveFaqCategory(null); setChatPhase("welcome"); }}
                          className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium ${theme.innerBg} border ${theme.cardBorder} ${theme.textSecondary} hover:text-[#EF4444] hover:border-[#EF4444]/40 transition-all shrink-0`}
                        >
                          <X size={13} /> {t("clear")}
                        </button>
                      </div>

                      {/* RailCare AI Prompt */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#0284C7]/15 border border-[#0284C7]/30 text-[#0284C7] flex items-center justify-center shrink-0 mt-0.5">
                          <Bot size={14} />
                        </div>
                        <div className={`px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-xs sm:text-sm ${theme.innerBg} border ${theme.cardBorder} ${theme.textPrimary}`}>
                          {t("clickPredefinedPrompt")}
                        </div>
                      </div>

                      {/* Predefined Questions List: Responsive 1 col on mobile, 2 cols on tablet & desktop */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:ml-9">
                        {activeIntents.length === 0 ? (
                          <div className={`col-span-full text-xs ${theme.textMuted} p-4 text-center rounded-xl ${theme.innerBg}`}>
                            {t("noQuestionsTopic")}
                          </div>
                        ) : (
                          activeIntents.map((intent) => (
                            <button
                              key={intent.id}
                              onClick={() => handleStarterPick(intent)}
                              className={`text-left p-3 rounded-xl border ${theme.cardBorder} ${theme.innerBg} hover:border-[#0284C7] hover:bg-[#0284C7]/5 transition-all group flex items-center justify-between gap-3 active:scale-[0.99]`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <HelpCircle size={16} className="shrink-0 text-[#0284C7] opacity-70 group-hover:opacity-100" />
                                <span className="text-xs sm:text-sm font-medium leading-snug group-hover:text-[#0284C7] transition-colors">
                                  {intent.questions?.[0] || intent.name}
                                </span>
                              </div>
                              <ChevronRight size={15} className="shrink-0 opacity-40 group-hover:opacity-100 group-hover:text-[#0284C7] transition-all" />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    /* If no topic is selected yet: Clean Guidance Card */
                    <div className={`rounded-2xl p-4 sm:p-5 border ${theme.cardBorder} ${theme.cardBg} space-y-3`}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#0284C7]/15 border border-[#0284C7]/30 text-[#0284C7] flex items-center justify-center shrink-0 mt-0.5">
                          <Bot size={16} />
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="text-xs font-bold flex items-center gap-2">
                            <span>{t("railCareAi")}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] font-medium">{t("aiReady")}</span>
                          </div>
                          <p className={`text-xs sm:text-sm ${theme.textSecondary} leading-relaxed`}>
                            {t("aiReadyGuidance")}
                          </p>
                        </div>
                      </div>

                      <div className={`pt-3 border-t ${theme.cardBorder} flex flex-wrap items-center justify-between gap-2 text-[11px] ${theme.textMuted}`}>
                        <span className="flex items-center gap-1.5">
                          <Sparkles size={13} className="text-[#F47920] shrink-0" />
                          {t("topicsInclude")}
                        </span>
                        <span className="hidden lg:inline font-semibold text-[#0284C7]">
                          {t("clickLeftGuidance")}
                        </span>
                        <span className="lg:hidden font-semibold text-[#0284C7]">
                          {t("tapAboveGuidance")}
                        </span>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* ═══ CONVERSATION THREAD (When messages exist) ═══ */}
              {transcript.length > 0 && (
                <div className="p-3 sm:p-5 space-y-4">
                  {/* Back to welcome / Clear chat */}
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-gray-500/10">
                    <button
                      onClick={handleBackToMenu}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${theme.textSecondary} hover:opacity-70 transition-all`}
                    >
                      <ArrowLeft size={13} /> {t("welcomeScreen")}
                    </button>
                    <span className={`text-[11px] ${theme.textMuted}`}>
                      {session?.user?.name ? `${session.user.name} · ` : ""}PNR: {activeBooking?.pnr || session?.user?.pnr || "—"}
                    </span>
                  </div>

                  {/* Chat bubbles */}
                  {transcript.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 ${
                        msg.speaker === "ai" ? "justify-start" : "justify-end"
                      }`}
                    >
                      {msg.speaker === "ai" && (
                        <div className="w-8 h-8 rounded-full bg-[#0284C7]/15 border border-[#0284C7]/30 text-[#0284C7] flex items-center justify-center shrink-0 mt-0.5">
                          <Bot size={15} />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] sm:max-w-[72%] px-4 py-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm ${
                          msg.speaker === "ai"
                            ? `${theme.innerBg} ${theme.textPrimary} border ${theme.cardBorder} rounded-tl-sm`
                            : "bg-[#004B87] text-white rounded-tr-sm"
                        }`}
                      >
                        <div className="text-[9px] uppercase font-bold tracking-widest mb-1.5 opacity-50">
                          {msg.speaker === "ai" ? "RailCare AI" : "You"}
                        </div>
                        {msg.text}
                      </div>
                      {msg.speaker !== "ai" && (
                        <div className="w-8 h-8 rounded-full bg-[#004B87]/15 border border-[#004B87]/30 text-[#004B87] dark:text-[#38BDF8] flex items-center justify-center shrink-0 mt-0.5">
                          <User size={15} />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* AI Thinking */}
                  {aiPhase === "thinking" && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] flex items-center justify-center shrink-0">
                        <Loader2 size={15} className="animate-spin" />
                      </div>
                      <div className={`px-4 py-3 rounded-2xl rounded-tl-sm ${theme.innerBg} border ${theme.cardBorder} text-xs`}>
                        {t("thinking")}
                      </div>
                    </div>
                  )}

                  {/* AI Speaking */}
                  {aiPhase === "speaking" && (
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#0284C7]/15 border border-[#0284C7]/30 text-[#0284C7] flex items-center justify-center shrink-0">
                        <Volume2 size={15} className="animate-pulse" />
                      </div>
                      <div className={`px-4 py-3 rounded-2xl rounded-tl-sm ${theme.innerBg} border ${theme.cardBorder} text-xs`}>
                        {t("speaking")}
                      </div>
                    </div>
                  )}

                  {/* Predefined Questions selection inside active conversation (when topic is clicked from sidebar) */}
                  {activeFaqCategory && (
                    <div className={`p-4 rounded-2xl border-2 border-[#0284C7]/40 ${theme.innerBg} space-y-3 shadow-md animate-in fade-in duration-150`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#0284C7]">
                          <CatIcon name={activeFaqCategory} className="w-3.5 h-3.5" />
                          <span>{tCat(activeFaqCategory)}:</span>
                        </div>
                        <button
                          onClick={() => setActiveFaqCategory(null)}
                          className={`p-1 rounded-lg text-xs ${theme.textMuted} hover:text-[#EF4444] transition-colors`}
                          title="Close"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activeIntents.map((intent) => (
                          <button
                            key={intent.id}
                            onClick={() => handleStarterPick(intent)}
                            className={`text-left p-2.5 rounded-xl border ${theme.cardBorder} ${theme.cardBg} hover:border-[#0284C7] hover:bg-[#0284C7]/5 transition-all text-xs font-medium flex items-center justify-between gap-2 group`}
                          >
                            <span className="truncate group-hover:text-[#0284C7]">{intent.questions?.[0] || intent.name}</span>
                            <ChevronRight size={13} className="shrink-0 opacity-40 group-hover:opacity-100 group-hover:text-[#0284C7]" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confirm panel */}
                  {aiPhase === "confirming" && pendingConfirm && (
                    <div className={`p-4 rounded-xl ${theme.innerBg} border ${theme.cardBorder} space-y-3 max-w-sm`}>
                      <div className="text-xs font-semibold">Did you mean: <span className="text-[#0284C7]">{pendingConfirm.name}</span>?</div>
                      <div className="flex gap-2">
                        <button onClick={handleConfirmYes} className="flex-1 py-2 rounded-lg bg-[#10B981] text-white text-xs font-bold inline-flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Yes</button>
                        <button onClick={handleConfirmNo} className="flex-1 py-2 rounded-lg bg-gray-500/15 text-xs font-semibold">No, other</button>
                      </div>
                    </div>
                  )}

                  {/* Clarify panel */}
                  {aiPhase === "clarifying" && clarifyOptions && (
                    <div className="space-y-1.5 max-w-sm">
                      <div className={`text-xs font-semibold ${theme.textSecondary} mb-2`}>Did you mean one of these?</div>
                      {clarifyOptions.options.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => handleClarifyPick(opt)}
                          className={`w-full text-left p-3 rounded-xl ${theme.innerBg} border ${theme.cardBorder} text-xs hover:border-[#0284C7] transition-all`}
                        >
                          <div className="font-bold">{opt.name}</div>
                          {opt.sampleQuestion && <div className="text-[11px] opacity-60 mt-0.5">"{opt.sampleQuestion}"</div>}
                        </button>
                      ))}
                      <button onClick={handleClarifyNone} className="w-full py-2 rounded-xl bg-gray-500/10 text-xs font-medium">None of these</button>
                    </div>
                  )}

                  {/* Unresolved */}
                  {aiPhase === "unresolved-choice" && (
                    <div className={`p-4 rounded-xl ${theme.innerBg} border border-orange-500/30 space-y-3 max-w-sm`}>
                      <div className="text-xs text-[#F59E0B] font-semibold">Couldn't resolve automatically. Connect with an executive?</div>
                      <div className="flex gap-2">
                        <button onClick={() => setAiPhase("rating")} className="flex-1 py-2 rounded-lg bg-gray-500/10 text-xs font-medium">{t("endChat")}</button>
                        <button onClick={handleTalkToExecutive} className="flex-1 py-2 rounded-lg bg-[#004B87] text-white text-xs font-bold flex items-center justify-center gap-1">
                          {t("callExecutiveDesk")} <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Related question chips */}
                  {aiPhase === "resolved" && relatedQuestions.length > 0 && (
                    <div className="space-y-2">
                      <div className={`text-[11px] font-bold uppercase tracking-wider ${theme.textMuted}`}>{t("suggestedFollowUps")}</div>
                      <div className="flex flex-col gap-1.5">
                        {relatedQuestions.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => handleRelatedIntentClick(r)}
                            className={`text-left px-4 py-2.5 rounded-xl border-2 ${theme.cardBorder} ${theme.cardBg} hover:border-[#0284C7] hover:shadow transition-all group flex items-center gap-3`}
                          >
                            <ChevronRight size={14} className="shrink-0 opacity-40 group-hover:opacity-100 group-hover:text-[#0284C7] transition-all" />
                            <span className="text-xs font-medium group-hover:text-[#0284C7] transition-colors">{r.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live speech & AI status indicators */}
                  {aiPhase === "listening" && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-[#0284C7]/10 border border-[#0284C7]/30 text-[#0284C7] text-xs font-semibold animate-pulse max-w-sm">
                      <Mic size={16} className="text-[#0284C7] shrink-0 animate-bounce" />
                      <span>Listening... Speak your query clearly into the mic</span>
                    </div>
                  )}

                  {aiPhase === "thinking" && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-500/10 border border-gray-500/20 text-xs font-medium max-w-sm">
                      <Loader2 size={15} className="animate-spin text-[#004B87] shrink-0" />
                      <span>Processing your query...</span>
                    </div>
                  )}

                  {aiPhase === "speaking" && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/30 text-[#059669] text-xs font-medium max-w-sm">
                      <Volume2 size={15} className="animate-pulse shrink-0" />
                      <span>Assistant is speaking...</span>
                    </div>
                  )}

                  {voiceError && (
                    <div className="p-2.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#DC2626] text-xs">{voiceError}</div>
                  )}
                </div>
              )}
            </div>

            {/* ── Bottom Input Dock ── */}
            <div className={`px-2.5 sm:px-4 py-2 sm:py-3 ${theme.innerBg} border-t ${theme.cardBorder} shrink-0`}>
              <form onSubmit={handleSendText} className="flex items-center gap-1.5 sm:gap-2">
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={t("typeQueryPlaceholder")}
                  className={`flex-1 min-w-0 rounded-xl px-3 sm:px-4 py-2.5 text-xs sm:text-sm border ${theme.cardBorder} ${theme.cardBg} ${theme.textPrimary} focus:outline-none focus:ring-2 focus:ring-[#0284C7] placeholder-gray-400`}
                />
                {speechRecognitionSupported && (
                  <button
                    type="button"
                    onClick={handleSpeak}
                    title={t("speak")}
                    className={`p-2.5 rounded-xl border shrink-0 ${
                      aiPhase === "listening" ? "bg-[#EF4444] text-white animate-pulse" : `${theme.cardBg} hover:opacity-80`
                    } transition-all`}
                  >
                    {aiPhase === "listening" ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!textInput.trim()}
                  className="px-3 sm:px-4 py-2.5 rounded-xl bg-[#004B87] hover:bg-[#003B6D] text-white font-bold text-xs sm:text-sm shadow transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <Send size={14} />
                  <span>{t("send")}</span>
                </button>
              </form>
            </div>
          </section>
        </main>

        {/* Live Call / SOS Modal & Audio */}
        {renderCallModal()}
        {renderMinimizedCallBar()}
        <audio ref={engine.remoteAudioRef} autoPlay playsInline />

        {/* Theme Selector Modal */}
        {renderThemeModal()}
      </div>
    );
  }

  // =========================================================================
  // 3. SUB-VIEWS: RAISE ISSUE, GENERAL QUERY, TICKET STATUS
  // =========================================================================
  if (view === "raise-issue" || view === "raise-ticket" || view === "ticket-status" || view === "journeys" || view === "complaints" || view === "history") {
    return (
      <div className={`min-h-screen ${theme.bg} ${theme.textPrimary} flex flex-col`} style={{ fontFamily: "Inter, sans-serif" }}>
        {/* Header with Prominent Back Button */}
        <header className={`w-full ${theme.headerBg} px-3 sm:px-6 py-2.5 sm:py-3 border-b ${theme.cardBorder} shadow-sm shrink-0`}>
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
            <button
              onClick={() => setView("dashboard")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-gray-500/10 hover:bg-gray-500/20 text-xs sm:text-sm font-bold transition-all border border-gray-500/20 shrink-0"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{t("backToHelpSupport")}</span>
              <span className="sm:hidden">{t("back")}</span>
            </button>
            <div className="text-xs sm:text-sm font-bold flex items-center gap-2 min-w-0">
              <Train size={18} className="text-[#004B87] dark:text-[#38BDF8] shrink-0" />
              <span className="truncate">{t("passengerCareServices")}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Language Selector */}
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className={`text-xs px-2 sm:px-2.5 py-1.5 rounded-lg border ${theme.cardBorder} ${theme.innerBg} font-medium focus:outline-none`}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>

              {callIsActive && callMinimized ? (
                <button
                  onClick={() => setCallMinimized(false)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md animate-pulse transition-all"
                  title="Return to active call"
                >
                  <Phone size={13} />
                  <span className="hidden sm:inline">{t("returnToCall")}</span>
                  <span className="sm:hidden">{t("inCall")}</span>
                </button>
              ) : (
                <button
                  onClick={() => setThemeModalOpen(true)}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-500/10 hover:bg-gray-500/20 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Palette size={14} /> <span className="hidden sm:inline">{t("theme")}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className={`flex-1 max-w-4xl w-full mx-auto p-3 sm:p-6 lg:p-8 ${callIsActive && callMinimized ? "pb-20" : ""}`}>
          {/* Subview 1: Raise Issue */}
          {view === "raise-issue" && (
            <div className={`p-6 sm:p-8 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} shadow-lg space-y-6`}>
              <div className="border-b pb-4 border-gray-200 dark:border-gray-800 space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#D95F10] dark:text-[#F59E0B]">
                  <AlertCircle size={22} /> {t("reportJourneyGrievance")}
                </h2>
                <p className={`text-xs ${theme.textSecondary}`}>
                  {t("reportJourneyGrievanceDesc")}
                </p>
              </div>

              <form onSubmit={handleFileIssue} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5">{t("selectBooking")}</label>
                  <select
                    value={issueBookingId}
                    onChange={(e) => setIssueBookingId(e.target.value)}
                    required
                    className={`w-full p-3 rounded-xl border ${theme.cardBorder} ${theme.innerBg} text-xs sm:text-sm focus:outline-none`}
                  >
                    <option value="">{t("chooseJourney")}</option>
                    {bookings.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.trainName} (#{b.trainNumber}) · PNR: {b.pnr} · {t("coach", "Coach")} {b.coach}, {t("berth", "Berth")} {b.berth}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5">{t("grievanceCategory")}</label>
                  <select
                    value={issueIntent}
                    onChange={(e) => setIssueIntent(e.target.value)}
                    className={`w-full p-3 rounded-xl border ${theme.cardBorder} ${theme.innerBg} text-xs sm:text-sm focus:outline-none`}
                  >
                    {INTENT_OPTIONS.map((i) => <option key={i} value={i}>{tCat(i)}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5">{t("description")}</label>
                  <textarea
                    rows={4}
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="Provide specific coach, berth details, or attendant interaction..."
                    className={`w-full p-3 rounded-xl border ${theme.cardBorder} ${theme.innerBg} text-xs sm:text-sm focus:outline-none`}
                  />
                </div>

                {fileError && <div className="p-3 rounded-xl bg-red-500/10 text-red-600 text-xs">{fileError}</div>}
                {fileSuccess && <div className="p-3 rounded-xl bg-green-500/10 text-green-600 text-xs font-semibold">{fileSuccess}</div>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={filing}
                    className="flex-1 py-3 rounded-xl bg-[#004B87] hover:bg-[#003B6D] text-white font-bold text-sm shadow-md"
                  >
                    {filing ? t("submittingGrievance") : t("submitGrievance")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("dashboard")}
                    className="px-6 py-3 rounded-xl bg-gray-500/15 font-semibold text-sm"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Subview 2: Raise General Query */}
          {view === "raise-ticket" && (
            <div className={`p-6 sm:p-8 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} shadow-lg space-y-6`}>
              <div className="border-b pb-4 border-gray-200 dark:border-gray-800 space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#004B87] dark:text-[#38BDF8]">
                  <HelpCircle size={22} /> {t("generalSupportQueryTitle")}
                </h2>
                <p className={`text-xs ${theme.textSecondary}`}>
                  {t("generalSupportQuerySubtitle")}
                </p>
              </div>

              <form onSubmit={handleFileTicket} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5">{t("concernCategory")}</label>
                  <select
                    value={ticketCategory}
                    onChange={(e) => { setTicketCategory(e.target.value); setTicketSubCategory(""); }}
                    required
                    className={`w-full p-3 rounded-xl border ${theme.cardBorder} ${theme.innerBg} text-xs sm:text-sm focus:outline-none`}
                  >
                    <option value="">{t("chooseCategory")}</option>
                    {Object.keys(TICKET_CATEGORIES).map((c) => <option key={c} value={c}>{tCat(c)}</option>)}
                  </select>
                </div>

                {ticketCategory && (
                  <div>
                    <label className="block text-xs font-bold mb-1.5">{t("subCategory")}</label>
                    <select
                      value={ticketSubCategory}
                      onChange={(e) => setTicketSubCategory(e.target.value)}
                      required
                      className={`w-full p-3 rounded-xl border ${theme.cardBorder} ${theme.innerBg} text-xs sm:text-sm focus:outline-none`}
                    >
                      <option value="">{t("chooseSubCategory")}</option>
                      {TICKET_CATEGORIES[ticketCategory].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold mb-1.5">{t("querySpecifics")}</label>
                  <textarea
                    rows={4}
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    placeholder="Provide transaction IDs, date of occurrence, or reference..."
                    className={`w-full p-3 rounded-xl border ${theme.cardBorder} ${theme.innerBg} text-xs sm:text-sm focus:outline-none`}
                  />
                </div>

                {ticketError && <div className="p-3 rounded-xl bg-red-500/10 text-red-600 text-xs">{ticketError}</div>}
                {ticketSuccess && <div className="p-3 rounded-xl bg-green-500/10 text-green-600 text-xs font-semibold">{ticketSuccess}</div>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={filingTicket}
                    className="flex-1 py-3 rounded-xl bg-[#004B87] hover:bg-[#003B6D] text-white font-bold text-sm shadow-md"
                  >
                    {filingTicket ? t("registeringQuery") : t("submitSupportQuery")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("dashboard")}
                    className="px-6 py-3 rounded-xl bg-gray-500/15 font-semibold text-sm"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Subview 3: Ticket Status / Query Tracking */}
          {view === "ticket-status" && (
            <div className={`p-6 sm:p-8 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} shadow-lg space-y-6`}>
              <div className="border-b pb-4 border-gray-200 dark:border-gray-800 space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#004B87] dark:text-[#38BDF8]">
                  <Clock size={22} /> {t("trackedQueriesConcerns")}
                </h2>
                <p className={`text-xs ${theme.textSecondary}`}>
                  {t("trackedQueriesConcernsDesc")}
                </p>
              </div>

              <div className="space-y-3">
                {tickets.map((tItem) => (
                  <div key={tItem._id} className={`p-4 rounded-xl ${theme.innerBg} border ${theme.cardBorder} space-y-2`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#004B87] dark:text-[#38BDF8]">
                        #{tItem.concernId}
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400">
                        {tItem.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-xs font-semibold">{tCat(tItem.category)} → {tItem.subCategory}</div>
                    {tItem.description && <p className={`text-xs ${theme.textSecondary}`}>{tItem.description}</p>}
                    {tItem.staffReply && (
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-1">
                        <div className="text-[11px] font-bold text-green-700 dark:text-green-400">
                          Reply from {(tItem.respondedByRole || "support").replace(/_/g, " ")}
                          {tItem.respondedBy && ` · ${tItem.respondedBy}`}
                        </div>
                        <p className={`text-xs ${theme.textSecondary} whitespace-pre-wrap`}>{tItem.staffReply}</p>
                        {tItem.respondedAt && <div className={`text-[10px] ${theme.textMuted}`}>{fmtDate(tItem.respondedAt)}</div>}
                      </div>
                    )}
                    <div className={`text-[10px] ${theme.textMuted}`}>{t("filedOn")} {fmtDate(tItem.createdAt)}</div>
                  </div>
                ))}
                {tickets.length === 0 && (
                  <div className="text-center py-10 text-xs opacity-60">
                    {t("noGeneralQueries")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Subview 4: Dedicated My Journeys Screen */}
          {view === "journeys" && (
            <div className={`p-6 sm:p-8 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} shadow-lg space-y-6`}>
              <div className="border-b pb-4 border-gray-200 dark:border-gray-800 space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#004B87] dark:text-[#38BDF8]">
                  <Train size={22} /> {t("allBookedJourneys")}
                </h2>
                <p className={`text-xs ${theme.textSecondary}`}>
                  {t("allBookedJourneysDesc")}
                </p>
              </div>

              <div className="grid gap-3">
                {bookings.map((b) => (
                  <div key={b._id} className={`p-4 rounded-xl ${theme.innerBg} border ${theme.cardBorder} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                    <div className="space-y-1">
                      <div className="text-sm font-bold flex items-center gap-2">
                        <span>{b.trainName}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-500/10 font-mono">#{b.trainNumber}</span>
                      </div>
                      <div className={`text-xs ${theme.textSecondary}`}>
                        {b.route} · PNR: <span className="font-mono font-semibold">{b.pnr}</span>
                      </div>
                      <div className="text-xs font-medium text-[#F47920]">
                        {t("coach", "Coach")} {b.coach} · {t("berth", "Berth")} {b.berth} · {fmtDate(b.journeyDate)}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold self-start sm:self-auto ${STATUS_META[b.status]?.tone}`}>
                      {STATUS_META[b.status]?.label || b.status}
                    </span>
                  </div>
                ))}
                {bookings.length === 0 && (
                  <div className="text-center py-10 text-xs opacity-60">{t("noJourneysOnRecord")}</div>
                )}
              </div>
            </div>
          )}

          {/* Subview 5: Dedicated Issues Filed Screen */}
          {view === "complaints" && (
            <div className={`p-6 sm:p-8 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} shadow-lg space-y-6`}>
              <div className="border-b pb-4 border-gray-200 dark:border-gray-800 space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#D95F10] dark:text-[#F59E0B]">
                  <AlertCircle size={22} /> {t("grievancesComplaintsFiled")}
                </h2>
                <p className={`text-xs ${theme.textSecondary}`}>
                  {t("grievancesComplaintsFiledDesc")}
                </p>
              </div>

              <div className="grid gap-3">
                {complaints.map((c) => (
                  <div key={c._id} className={`p-4 rounded-xl ${theme.innerBg} border ${theme.cardBorder} space-y-2`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#F47920]">{tCat(c.intent)}</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-500/15 text-orange-600">
                        {c.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className={`text-xs ${theme.textSecondary}`}>
                      PNR: <span className="font-mono font-medium">{c.pnr}</span> · {t("reference")}: #{c._id.slice(-6).toUpperCase()}
                    </div>
                    {c.description && <p className="text-xs italic">{c.description}</p>}
                    {c.staffReply && (
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-1">
                        <div className="text-[11px] font-bold text-green-700 dark:text-green-400">
                          Reply from {(c.respondedByRole || "support").replace(/_/g, " ")}
                          {c.respondedBy && ` · ${c.respondedBy}`}
                        </div>
                        <p className={`text-xs ${theme.textSecondary} whitespace-pre-wrap`}>{c.staffReply}</p>
                        {c.respondedAt && <div className={`text-[10px] ${theme.textMuted}`}>{fmtDate(c.respondedAt)}</div>}
                      </div>
                    )}
                    <div className={`text-[10px] ${theme.textMuted}`}>{t("filedOn")} {fmtDate(c.createdAt)}</div>
                  </div>
                ))}
                {complaints.length === 0 && (
                  <div className="text-center py-10 text-xs opacity-60">{t("noComplaintsYet")}</div>
                )}
              </div>
            </div>
          )}

          {/* Subview 6: Dedicated Past Queries Screen */}
          {view === "history" && (
            <div className={`p-6 sm:p-8 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} shadow-lg space-y-6`}>
              <div className="border-b pb-4 border-gray-200 dark:border-gray-800 space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[#004B87] dark:text-[#38BDF8]">
                  <MessageCircle size={22} /> {t("aiHelplineCallHistory")}
                </h2>
                <p className={`text-xs ${theme.textSecondary}`}>
                  {t("aiHelplineCallHistoryDesc")}
                </p>
              </div>

              <div className="grid gap-3">
                {history.map((h) => (
                  <div key={h.callId} className={`p-4 rounded-xl ${theme.innerBg} border ${theme.cardBorder} flex items-center justify-between gap-3`}>
                    <div className="space-y-1">
                      <div className="text-xs font-bold">{h.topic || h.aiIntent || t("generalInquiry")}</div>
                      <div className={`text-[11px] ${theme.textSecondary}`}>Call ID: {h.callId} · {h.status}</div>
                    </div>
                    {h.rating > 0 && (
                      <span className="flex items-center gap-1 text-[#F59E0B] text-xs font-bold">
                        <Star size={14} fill="currentColor" /> {h.rating}/5
                      </span>
                    )}
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-center py-10 text-xs opacity-60">{t("noPastQueries")}</div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Live Call / SOS Modal & Audio */}
        {renderCallModal()}
        {renderMinimizedCallBar()}
        <audio ref={engine.remoteAudioRef} autoPlay playsInline />

        {/* Theme Selector Modal */}
        {renderThemeModal()}
      </div>
    );
  }

  // =========================================================================
  // 4. MAIN PORTAL DASHBOARD WITH DESKTOP SIDEBAR & MOBILE DRAWER
  // =========================================================================
  return (
    <div className={`min-h-screen ${theme.bg} ${theme.textPrimary} flex flex-col`} style={{ fontFamily: "Inter, sans-serif" }}>
      
      {/* Top Navbar */}
      <header className={`w-full ${theme.headerBg} px-4 py-3 sm:px-8 border-b ${theme.cardBorder} sticky top-0 z-30 shadow-sm backdrop-blur-md`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Left: Mobile Hamburger & Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg bg-gray-500/10 text-[#004B87] dark:text-white"
              title="Open Navigation Menu"
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#004B87] text-white flex items-center justify-center shadow-sm">
                <Train size={18} />
              </div>
              <div className="text-left">
                <span className="font-bold text-sm sm:text-base tracking-tight text-[#003B73] dark:text-white">
                  IRCTC <span className="text-[#F47920]">SRLMS</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] text-gray-500 ml-2 font-mono">
                  {t("passengerSelfService")}
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Controls: Return to Call, Theme, Language, SOS, Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {callIsActive && callMinimized && (
              <button
                onClick={() => setCallMinimized(false)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md animate-pulse transition-all shrink-0"
                title="Return to active call"
              >
                <Phone size={13} />
                <span className="hidden sm:inline">{t("returnToCall")}</span>
                <span className="sm:hidden">{t("inCall")}</span>
              </button>
            )}

            {/* Theme Switcher Button in Navbar (Requirement 1) */}
            <button
              onClick={() => setThemeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-500/10 hover:bg-gray-500/20 text-xs font-semibold transition-all border border-gray-500/20 shadow-sm"
              title="Customize Portal Appearance"
            >
              <Palette size={15} className="text-[#F47920]" />
              <span className="hidden sm:inline">{t("theme")}</span>
            </button>

            {/* Language Selector */}
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border ${theme.cardBorder} ${theme.innerBg} font-medium focus:outline-none`}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>

            {/* Emergency SOS Button */}
            <button
              onClick={handleSOS}
              className="px-3.5 py-1.5 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-500/20 animate-pulse"
              title="Emergency SOS"
            >
              <AlertTriangle size={14} />
              <span>{t("sos")}</span>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-500/10 hover:bg-gray-500/20 text-xs font-medium text-gray-600 dark:text-gray-300"
            >
              <LogOut size={14} />
              <span>{t("logout")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout with Desktop Sidebar */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex">
        
        {/* Desktop Left Sidebar (Requirement 3) */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-[#E2E8F0] dark:border-[#1E293B] bg-white/50 dark:bg-[#0F172A]/50 backdrop-blur-sm p-4 space-y-6">
          
          {/* Passenger Identity Card */}
          <div className={`p-4 rounded-xl ${theme.innerBg} border ${theme.cardBorder} space-y-2`}>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-[#004B87]/15 text-[#004B87] dark:text-[#38BDF8] flex items-center justify-center font-bold text-sm">
                {session.user.name?.slice(0, 2).toUpperCase() || "PA"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{session.user.name}</div>
                <div className={`text-[11px] ${theme.textSecondary} truncate`}>
                  {t("irctcId")}: <span className="font-mono">{session.user.username}</span>
                </div>
              </div>
            </div>
            <div className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium inline-block">
              {t("verifiedPassenger")}
            </div>
          </div>

          {/* Sidebar Navigation */}
          <nav className="flex-1 space-y-1.5">
            <div className={`text-[10px] uppercase font-bold tracking-wider px-3 mb-2 ${theme.textMuted}`}>
              {t("navSections")}
            </div>

            <button
              onClick={() => setView("dashboard")}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                view === "dashboard" ? theme.sidebarActive : `${theme.sidebarHover}`
              }`}
            >
              <span className="flex items-center gap-2.5">
                <HelpCircle size={17} /> {t("helpSupportHome")}
              </span>
              <span className="w-2 h-2 rounded-full bg-[#F47920]" />
            </button>

            <button
              onClick={() => setView("journeys")}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-medium transition-all ${
                view === "journeys" ? theme.sidebarActive : `${theme.sidebarHover}`
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Train size={17} /> {t("myJourneys")}
              </span>
              {bookings.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#004B87]/10 text-[#004B87] dark:text-white">
                  {bookings.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setView("complaints")}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-medium transition-all ${
                view === "complaints" ? theme.sidebarActive : `${theme.sidebarHover}`
              }`}
            >
              <span className="flex items-center gap-2.5">
                <AlertCircle size={17} /> {t("issuesFiled")}
              </span>
              {complaints.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F47920]/15 text-[#D95F10]">
                  {complaints.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setView("history")}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-medium transition-all ${
                view === "history" ? theme.sidebarActive : `${theme.sidebarHover}`
              }`}
            >
              <span className="flex items-center gap-2.5">
                <MessageCircle size={17} /> {t("pastAiQueries")}
              </span>
              {history.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/10">
                  {history.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setView("ticket-status")}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-medium transition-all ${
                view === "ticket-status" ? theme.sidebarActive : `${theme.sidebarHover}`
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Clock size={17} /> {t("checkQueryStatus")}
              </span>
            </button>
          </nav>

          {/* Sidebar Footer Controls */}
          <div className="pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2">
            <button
              onClick={() => setThemeModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-gray-500/10 hover:bg-gray-500/20 text-[#004B87] dark:text-white transition-all"
            >
              <Palette size={15} className="text-[#F47920]" />
              <span>{t("theme")}: {theme.name}</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-500/10 transition-all"
            >
              <LogOut size={15} />
              <span>{t("signOut")}</span>
            </button>
          </div>
        </aside>

        {/* Mobile Hamburger Drawer (Requirement 3) */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setSidebarOpen(false)} />
            <div className={`relative w-72 max-w-[80vw] h-full ${theme.cardBg} p-5 flex flex-col shadow-2xl z-10 space-y-6`}>
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-[#1E293B]">
                <div className="font-bold text-sm flex items-center gap-2">
                  <Train size={18} className="text-[#004B87]" />
                  <span>{t("passengerMenu")}</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg bg-gray-500/10">
                  <X size={18} />
                </button>
              </div>

              <nav className="flex-1 space-y-2">
                <button
                  onClick={() => { setView("dashboard"); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-xs font-bold ${
                    view === "dashboard" ? "bg-[#004B87] text-white" : "hover:bg-gray-500/10"
                  }`}
                >
                  <HelpCircle size={16} /> {t("helpSupportHome")}
                </button>
                <button
                  onClick={() => { setView("journeys"); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-xs font-medium ${
                    view === "journeys" ? "bg-[#004B87] text-white" : "hover:bg-gray-500/10"
                  }`}
                >
                  <Train size={16} /> {t("myJourneys")} ({bookings.length})
                </button>
                <button
                  onClick={() => { setView("complaints"); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-xs font-medium ${
                    view === "complaints" ? "bg-[#004B87] text-white" : "hover:bg-gray-500/10"
                  }`}
                >
                  <AlertCircle size={16} /> {t("issuesFiled")} ({complaints.length})
                </button>
                <button
                  onClick={() => { setView("history"); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-xs font-medium ${
                    view === "history" ? "bg-[#004B87] text-white" : "hover:bg-gray-500/10"
                  }`}
                >
                  <MessageCircle size={16} /> {t("pastAiQueries")} ({history.length})
                </button>
                <button
                  onClick={() => { setView("ticket-status"); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-xs font-medium ${
                    view === "ticket-status" ? "bg-[#004B87] text-white" : "hover:bg-gray-500/10"
                  }`}
                >
                  <Clock size={16} /> {t("checkQueryStatus")}
                </button>
              </nav>

              <div className="pt-4 border-t border-[#E2E8F0] dark:border-[#1E293B] space-y-2">
                <button
                  onClick={() => { setThemeModalOpen(true); setSidebarOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-gray-500/10 text-xs font-semibold"
                >
                  <Palette size={14} className="text-[#F47920]" /> {t("changeTheme")}
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-red-500/10 text-red-600 text-xs font-bold"
                >
                  <LogOut size={14} /> {t("signOut")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Center Main Screen: HERO HELP & SUPPORT (Requirement 3) */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          
          {/* Welcome Headline */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 border-gray-200 dark:border-gray-800">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                {t("welcome")}, {session.user.name}
              </h1>
              <p className={`text-xs sm:text-sm ${theme.textSecondary}`}>
                {t("officialAssistance")}
              </p>
            </div>
            
            {/* Active PNR quick badge if any */}
            {bookings[0] && (
              <div className={`px-3 py-1.5 rounded-xl ${theme.innerBg} border ${theme.cardBorder} text-xs flex items-center gap-2 self-start sm:self-auto`}>
                <Ticket size={14} className="text-[#004B87] dark:text-[#38BDF8]" />
                <span>{t("activeJourney")}: <strong className="font-mono">{bookings[0].pnr}</strong></span>
              </div>
            )}
          </div>

          {/* WhatsApp Sandbox Notification Banner */}
          {whatsappInfo?.configured && !waBannerDismissed && (
            <div className="rounded-2xl border border-[#10B981]/40 bg-[#10B981]/10 p-4 flex items-start gap-3.5 shadow-sm">
              <MessageCircle size={22} className="text-[#10B981] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="text-sm font-bold">
                  {t("receiveWaAlerts")}
                </div>
                <div className={`text-xs ${theme.textSecondary} leading-relaxed`}>
                  {t("waInstruction")}{" "}
                  <span className="font-mono font-bold text-[#10B981] bg-white/20 px-1 py-0.5 rounded">{whatsappInfo.joinCode}</span>{" "}
                  to <span className="font-mono font-bold">{whatsappInfo.number}</span> {t("toOnce")}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`https://wa.me/${whatsappInfo.number.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappInfo.joinCode)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={dismissWaBanner}
                    className="px-3 py-1.5 rounded-lg bg-[#10B981] text-white text-xs font-bold hover:bg-[#059669] transition-all shadow-sm"
                  >
                    {t("openWaConnect")}
                  </a>
                  <button
                    onClick={dismissWaBanner}
                    className="text-xs text-gray-500 hover:underline px-2"
                  >
                    {t("dismiss")}
                  </button>
                </div>
              </div>
              <button onClick={dismissWaBanner} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={16} />
              </button>
            </div>
          )}

          {/* =========================================================================
              HELP & SUPPORT HERO CENTER (LARGE ENLARGED BUTTONS & CARDS - REQ 3)
             ========================================================================= */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-[#F47920] flex items-center gap-1.5">
                <Sparkles size={14} /> {t("passengerHelpDesk")}
              </div>
              <span className={`text-xs ${theme.textSecondary}`}>
                {t("selectAssistance")}
              </span>
            </div>

            {/* 1. HUGE HERO CARD: Talk to AI Voice Assistant */}
            <div
              onClick={openChat}
              className={`p-6 sm:p-8 rounded-2xl border-2 border-[#004B87]/30 dark:border-[#38BDF8]/40 bg-gradient-to-br from-[#004B87]/10 via-transparent to-[#F47920]/10 ${theme.cardBg} cursor-pointer hover:shadow-xl hover:scale-[1.01] transition-all group relative overflow-hidden`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                <div className="flex items-start gap-4 sm:gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#004B87] to-[#0284C7] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform shrink-0">
                    <Bot size={32} />
                  </div>
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[11px] font-bold">
                      <Sparkles size={12} /> {t("instantAiBadge")}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                      {t("talkToAi")}
                    </h2>
                    <p className={`text-xs sm:text-sm ${theme.textSecondary} max-w-xl leading-relaxed`}>
                      {t("talkToAiDesc")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-6 py-3.5 rounded-xl bg-[#004B87] dark:bg-[#2563EB] group-hover:brightness-110 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 shrink-0"
                >
                  <Mic size={18} />
                  <span>{t("startVoiceChat")}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* 2x2 Grid of Large Support Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Card 1: Raise Issue with a Journey */}
              <div
                onClick={() => { setIssueBookingId(""); setFileError(null); setFileSuccess(null); setView("raise-issue"); }}
                className={`p-6 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} ${theme.cardHover} cursor-pointer transition-all space-y-4 flex flex-col justify-between group`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#F47920]/15 text-[#D95F10] dark:text-[#F59E0B] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <AlertCircle size={24} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold">{t("raiseJourneyIssue")}</h3>
                    <p className={`text-xs ${theme.textSecondary} leading-relaxed`}>
                      {t("raiseJourneyIssueDesc")}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-xs font-bold text-[#F47920]">
                  <span>{t("reportSpecificIssue")}</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Card 2: General Support / eQuery */}
              <div
                onClick={() => { setTicketCategory(""); setTicketSubCategory(""); setTicketError(null); setTicketSuccess(null); setView("raise-ticket"); }}
                className={`p-6 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} ${theme.cardHover} cursor-pointer transition-all space-y-4 flex flex-col justify-between group`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#0284C7]/15 text-[#0284C7] dark:text-[#38BDF8] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <HelpCircle size={24} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold">{t("generalSupportQuery")}</h3>
                    <p className={`text-xs ${theme.textSecondary} leading-relaxed`}>
                      {t("generalSupportQueryDesc")}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-xs font-bold text-[#0284C7] dark:text-[#38BDF8]">
                  <span>{t("submitGeneralQuery")}</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Card 3: Check Query Status */}
              <div
                onClick={() => setView("ticket-status")}
                className={`p-6 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} ${theme.cardHover} cursor-pointer transition-all space-y-4 flex flex-col justify-between group`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Clock size={24} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold">{t("trackExistingQueries")}</h3>
                    <p className={`text-xs ${theme.textSecondary} leading-relaxed`}>
                      {t("trackExistingQueriesDesc")}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-xs font-bold text-purple-600 dark:text-purple-400">
                  <span>{t("trackStatus")} ({tickets.length})</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Card 4: Emergency Assistance SOS */}
              <div
                onClick={handleSOS}
                className="p-6 rounded-2xl border-2 border-red-500/40 bg-red-500/10 hover:bg-red-500/15 cursor-pointer transition-all space-y-4 flex flex-col justify-between group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                    <AlertTriangle size={24} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400">
                      {t("emergencySosCall")}
                    </h3>
                    <p className={`text-xs ${theme.textSecondary} leading-relaxed`}>
                      {t("emergencySosCallDesc")}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-xs font-bold text-red-600 dark:text-red-400">
                  <span>{t("triggerImmediateSos")}</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Summary Strip: Active Journeys & Open Complaints (Prompts user to Sidebar) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            
            {/* Recent Journey Preview */}
            <div className={`p-4 sm:p-5 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <Train size={14} /> {t("myBookings")}
                </div>
                <button
                  onClick={() => setView("journeys")}
                  className="text-xs font-semibold text-[#004B87] dark:text-[#38BDF8] hover:underline"
                >
                  {t("viewAll")} ({bookings.length}) →
                </button>
              </div>

              {bookings.slice(0, 1).map((b) => (
                <div key={b._id} className={`p-3 rounded-xl ${theme.innerBg} border ${theme.cardBorder} text-xs space-y-1`}>
                  <div className="font-bold flex items-center justify-between">
                    <span>{b.trainName} #{b.trainNumber}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 font-mono">PNR: {b.pnr}</span>
                  </div>
                  <div className={`text-[11px] ${theme.textSecondary}`}>
                    {t("coach", "Coach")} {b.coach}, {t("berth", "Berth")} {b.berth} · {fmtDate(b.journeyDate)}
                  </div>
                </div>
              ))}
              {bookings.length === 0 && (
                <div className="text-xs text-gray-400 py-2">{t("activeJourneysFound")}</div>
              )}
            </div>

            {/* Recent Grievance Preview */}
            <div className={`p-4 sm:p-5 rounded-2xl border ${theme.cardBorder} ${theme.cardBg} space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <AlertCircle size={14} /> {t("recentGrievances")}
                </div>
                <button
                  onClick={() => setView("complaints")}
                  className="text-xs font-semibold text-[#004B87] dark:text-[#38BDF8] hover:underline"
                >
                  {t("viewAll")} ({complaints.length}) →
                </button>
              </div>

              {complaints.slice(0, 1).map((c) => (
                <div key={c._id} className={`p-3 rounded-xl ${theme.innerBg} border ${theme.cardBorder} text-xs space-y-1`}>
                  <div className="font-bold flex items-center justify-between">
                    <span>{tCat(c.intent)}</span>
                    <span className="text-[10px] uppercase font-bold text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded">
                      {c.status}
                    </span>
                  </div>
                  <div className={`text-[11px] ${theme.textSecondary}`}>
                    PNR: {c.pnr} · {t("filedOn")} {fmtDate(c.createdAt)}
                  </div>
                </div>
              ))}
              {complaints.length === 0 && (
                <div className="text-xs text-gray-400 py-2">{t("noActiveComplaints")}</div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* WhatsApp-style BOTTOM sticky call bar — shown when call is minimized */}
      {renderMinimizedCallBar()}

      {/* Live Call / SOS Modal & Audio */}
      {renderCallModal()}
      <audio ref={engine.remoteAudioRef} autoPlay playsInline />

      {/* Theme Selector Modal (Requirement 1) */}
      {renderThemeModal()}
    </div>
  );

  // =========================================================================
  // LIVE WEBRTC CALL / EXECUTIVE / SOS MODAL (WhatsApp Call Style)
  // =========================================================================
  function renderCallModal() {
    const isCalling = engine.status !== "idle";
    const hasError = !!engine.error;

    // Don't show modal when minimized — bottom bar takes over
    if ((!isCalling && !hasError) || callMinimized) return null;

    const isEmergency = engine.callContext?.isEmergency;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className={`w-full max-w-[370px] rounded-[36px] border ${
            isEmergency
              ? "border-red-400/80 shadow-2xl shadow-red-500/25"
              : "border-slate-200/90 dark:border-slate-800 shadow-[0_25px_60px_-15px_rgba(15,23,42,0.2)] dark:shadow-slate-950/60"
          } bg-gradient-to-b from-[#FFFFFF] via-[#F8FAFC] to-[#EFF4F9] dark:from-[#0F172A] dark:via-[#0B1528] dark:to-[#060D1E] text-slate-800 dark:text-white p-6 sm:p-7 space-y-6 text-center backdrop-blur-2xl relative overflow-hidden transition-all duration-300`}
        >
          {/* Subtle ambient lighting accent */}
          <div
            className={`absolute -top-14 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full ${
              isEmergency ? "bg-red-500/10" : "bg-emerald-500/10"
            } blur-3xl pointer-events-none`}
          />

          {/* WhatsApp Style Top App Bar */}
          <div className="flex items-center justify-between w-full pb-2 border-b border-slate-200/80 dark:border-slate-700/60 relative z-10">
            {/* WhatsApp Minimize Chevron */}
            <button
              onClick={() => setCallMinimized(true)}
              className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors"
              title="Minimize call (continue chatting)"
            >
              <ChevronDown size={20} />
            </button>

            {/* End-to-end Encrypted WhatsApp Pill */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200/70 dark:border-emerald-800/50">
              <Lock size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{t("endToEndEncrypted")}</span>
            </div>

            {/* Call Badge */}
            <span
              className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full ${
                isEmergency
                  ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 animate-pulse border border-red-200"
                  : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300 border border-slate-200/70"
              }`}
            >
              {isEmergency ? (<span className="inline-flex items-center gap-1"><Siren className="w-3 h-3" />{t("sos")}</span>) : t("voiceCall")}
            </span>
          </div>

          {/* WhatsApp Profile & Animated Voice Waves */}
          <div className="flex flex-col items-center justify-center space-y-3 pt-1 relative z-10">
            <div className="relative flex items-center justify-center my-3">
              {/* Pulsing acoustic rings when ringing */}
              {engine.status === "ringing-out" && (
                <>
                  <div className="absolute w-28 h-28 rounded-full bg-[#0284C7]/20 animate-ping" />
                  <div className="absolute w-36 h-36 rounded-full bg-[#0284C7]/10 animate-pulse" />
                </>
              )}
              {/* Green acoustic rings when connected */}
              {engine.status === "connected" && (
                <>
                  <div className="absolute w-28 h-28 rounded-full bg-emerald-500/20 animate-ping" />
                  <div className="absolute w-36 h-36 rounded-full bg-emerald-500/10 animate-pulse" />
                </>
              )}
              {/* Amber wave when queued */}
              {engine.status === "queued" && (
                <div className="absolute w-28 h-28 rounded-full bg-amber-500/20 animate-pulse" />
              )}

              {/* Central Official Avatar */}
              <div
                className={`w-24 h-24 rounded-full ${
                  isEmergency
                    ? "bg-gradient-to-tr from-red-600 to-amber-500 shadow-red-500/30"
                    : "bg-gradient-to-tr from-[#003B73] via-[#0284C7] to-[#38BDF8] shadow-blue-500/25"
                } text-white flex items-center justify-center shadow-xl relative z-10 border-4 border-white dark:border-slate-800`}
              >
                {hasError ? (
                  <AlertTriangle size={40} className="text-amber-200" />
                ) : (
                  <Train size={42} className="text-white drop-shadow" />
                )}

                {/* WhatsApp Verified Checkmark */}
                {!hasError && (
                  <div
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-md"
                    title={t("verifiedRailwayOfficial")}
                  >
                    <CheckCircle2 size={16} />
                  </div>
                )}
              </div>
            </div>

            {/* Contact Name & Status */}
            <div className="space-y-1 w-full">
              <h3 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {hasError
                  ? t("callDisconnected")
                  : engine.peerName
                  ? engine.peerName
                  : isEmergency
                  ? t("emergencyOperationsDesk")
                  : t("railwaySupportExecutive")}
              </h3>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {t("officialHelpdesk247")}
              </div>

              {/* Call Status Subtext & Live Equalizer */}
              <div className="text-sm font-medium pt-1">
                {hasError ? (
                  <div className="text-xs text-red-600 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-950/40 p-2.5 rounded-xl border border-red-200 dark:border-red-900/50 mt-1">
                    {engine.error}
                  </div>
                ) : engine.status === "ringing-out" ? (
                  <span className="text-[#0284C7] dark:text-[#38BDF8] flex items-center justify-center gap-1.5 font-semibold">
                    <span>{t("ringing")}</span>
                    <span className="inline-flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] dark:bg-[#38BDF8] animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] dark:bg-[#38BDF8] animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] dark:bg-[#38BDF8] animate-bounce [animation-delay:0.4s]" />
                    </span>
                  </span>
                ) : engine.status === "queued" ? (
                  <div className="space-y-1.5 mt-1">
                    <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/60">
                      {t("allLinesBusy")} · {t("queue")} #{engine.queueInfo?.position || 1}
                    </span>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t("estWait")}: ~{engine.queueInfo?.estimatedWaitSec || 30}s · {t("stayOnLine")}
                    </div>
                  </div>
                ) : engine.status === "connected" ? (
                  <div className="space-y-1">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono tracking-widest text-lg flex items-center justify-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      {formatCallTime(callSeconds)}
                    </span>
                    {/* Sound wave equalizer animation */}
                    <div className="flex items-center justify-center gap-1 pt-0.5">
                      <span className="w-1 h-3 rounded-full bg-emerald-500 animate-pulse [animation-delay:0ms]" />
                      <span className="w-1 h-5 rounded-full bg-emerald-500 animate-pulse [animation-delay:150ms]" />
                      <span className="w-1 h-6 rounded-full bg-emerald-500 animate-pulse [animation-delay:300ms]" />
                      <span className="w-1 h-4 rounded-full bg-emerald-500 animate-pulse [animation-delay:100ms]" />
                      <span className="w-1 h-2.5 rounded-full bg-emerald-500 animate-pulse [animation-delay:250ms]" />
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-medium">{t("callEnded")}</span>
                )}
              </div>

              {/* Context Pill (PNR & Query Topic) */}
              <div className="pt-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-xs max-w-[95%] truncate">
                  <Ticket size={12} className="text-[#0284C7] shrink-0" />
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                    {engine.callContext?.pnr ? `PNR: ${engine.callContext.pnr}` : "Journey"}
                  </span>
                  <span>•</span>
                  <span className="truncate">{engine.callContext?.topic ? tCat(engine.callContext.topic) : t("generalInquiry")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rating prompt if ended */}
          {engine.status === "ended" && (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm space-y-2 animate-in fade-in relative z-10">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {t("rateCall")}
              </div>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleRateCall(star)}
                    disabled={callRatingSubmitting}
                    className={`p-1 transition-transform hover:scale-125 ${
                      (callRating || 0) >= star ? "text-amber-400" : "text-slate-300 dark:text-slate-600"
                    }`}
                  >
                    <Star size={24} fill={(callRating || 0) >= star ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              {callRating && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  {t("thankYouRating")}
                </div>
              )}
            </div>
          )}

          {/* WhatsApp Call Controls Dock */}
          <div className="pt-2 w-full relative z-10">
            {hasError ? (
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    engine.clearError();
                    engine.endCall();
                  }}
                  className="px-6 py-2.5 rounded-full bg-[#004B87] hover:bg-[#003B6D] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all"
                >
                  {t("dismissBackToChat")}
                </button>
              </div>
            ) : engine.status === "ended" ? (
              <div className="flex justify-center">
                <button
                  onClick={engine.endCall}
                  className="px-6 py-2.5 rounded-full bg-[#004B87] hover:bg-[#003B6D] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all"
                >
                  {t("done")}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-around max-w-xs mx-auto p-3 rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-lg backdrop-blur-md">
                {/* WhatsApp Speaker Button */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSpeakerOn(!speakerOn)}
                    className={`w-13 h-13 rounded-full flex items-center justify-center transition-all shadow-sm ${
                      speakerOn
                        ? "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-200 dark:ring-emerald-900/50"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700"
                    }`}
                    title={speakerOn ? t("speakerOn") : t("speakerOff")}
                  >
                    <Volume2 size={22} />
                  </button>
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">{t("speaker")}</span>
                </div>

                {/* WhatsApp Big Red End Call Button */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={engine.endCall}
                    className="w-16 h-16 rounded-full bg-[#E53935] hover:bg-[#D32F2F] text-white shadow-xl shadow-red-600/40 flex items-center justify-center active:scale-90 transition-all cursor-pointer ring-4 ring-red-100 dark:ring-red-950/50"
                    title={t("end")}
                  >
                    <PhoneOff size={26} />
                  </button>
                  <span className="text-[10px] font-bold text-red-600 dark:text-red-400">{t("end")}</span>
                </div>

                {/* WhatsApp Mute/Unmute Mic Button */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={engine.toggleMute}
                    className={`w-13 h-13 rounded-full flex items-center justify-center transition-all shadow-sm ${
                      engine.muted
                        ? "bg-red-50 hover:bg-red-100 text-red-600 border border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 ring-2 ring-red-200 dark:ring-red-900/50"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                    }`}
                    title={engine.muted ? t("unmute") : t("mute")}
                  >
                    {engine.muted ? <MicOff size={22} /> : <Mic size={22} />}
                  </button>
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                    {engine.muted ? t("unmute") : t("mute")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // WHATSAPP-STYLE BOTTOM STICKY MINIMIZED CALL BAR
  // =========================================================================
  function renderMinimizedCallBar() {
    if (!callIsActive || !callMinimized) return null;

    return (
      <div
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999 }}
        className={`${
          engine.callContext?.isEmergency
            ? "bg-gradient-to-r from-red-700 via-red-600 to-orange-600"
            : "bg-gradient-to-r from-[#005B3A] via-[#00874E] to-[#00A85A]"
        } shadow-2xl`}
      >
        {/* Top divider pulse line */}
        <div
          className={`h-0.5 w-full ${
            engine.callContext?.isEmergency ? "bg-orange-300/60" : "bg-emerald-300/50"
          } animate-pulse`}
        />

        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
          {/* LEFT: animated phone icon + call info */}
          <button
            onClick={() => setCallMinimized(false)}
            className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 cursor-pointer group text-left"
            title={t("tapToReturn")}
          >
            {/* Pulsing green phone icon */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full bg-white/30 animate-ping" />
              <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 border border-white/40 text-white flex items-center justify-center shadow-lg">
                <Phone size={17} />
              </div>
            </div>

            {/* Call name + timer + hint */}
            <div className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="text-white font-bold text-xs sm:text-sm leading-tight truncate">
                  {engine.peerName ||
                    (engine.callContext?.isEmergency
                      ? t("emergencySosDesk")
                      : t("irctcSupport"))}
                </span>
                {engine.status === "connected" && (
                  <span className="bg-white/20 text-white text-[10px] sm:text-[11px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 border border-white/25">
                    {formatCallTime(callSeconds)}
                  </span>
                )}
                {engine.status === "queued" && (
                  <span className="bg-amber-400/80 text-amber-900 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                    {t("queue")} #{engine.queueInfo?.position || 1}
                  </span>
                )}
                {engine.status === "ringing-out" && (
                  <span className="bg-white/20 text-white text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                    {t("ringing")}
                  </span>
                )}
              </div>
              <div className="text-white/80 text-[10px] sm:text-[11px] font-medium flex items-center gap-1 mt-0.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0" />
                <span className="truncate">{t("tapToReturn")}</span>
                <ChevronRight size={12} className="opacity-70 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </div>
            </div>
          </button>

          {/* RIGHT: controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mute toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); engine.toggleMute(); }}
              className={`flex flex-col items-center gap-0.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-all ${
                engine.muted
                  ? "bg-red-800/60 border border-red-400/40 text-white"
                  : "bg-white/15 hover:bg-white/25 border border-white/20 text-white"
              }`}
              title={engine.muted ? t("unmute") : t("mute")}
            >
              {engine.muted ? <MicOff size={15} /> : <Mic size={15} />}
              <span className="text-[8px] sm:text-[9px] font-semibold opacity-90">{engine.muted ? t("unmute") : t("mute")}</span>
            </button>

            {/* End call */}
            <button
              onClick={(e) => { e.stopPropagation(); engine.endCall(); }}
              className="flex flex-col items-center gap-0.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-red-600 hover:bg-red-700 border border-red-500/50 text-white shadow-lg active:scale-95 transition-all"
              title={t("end")}
            >
              <PhoneOff size={15} />
              <span className="text-[8px] sm:text-[9px] font-bold">{t("end")}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // THEME SELECTION MODAL
  // =========================================================================
  function renderThemeModal() {
    if (!themeModalOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0F172A] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
          
          <div className="flex items-center justify-between border-b pb-3 border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Palette size={20} className="text-[#F47920]" />
              <h3 className="text-base font-bold">{t("changeTheme")}</h3>
            </div>
            <button
              onClick={() => setThemeModalOpen(false)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.values(THEMES).map((tTheme) => {
              const Icon = tTheme.icon;
              const isSelected = currentTheme === tTheme.id;
              return (
                <div
                  key={tTheme.id}
                  onClick={() => {
                    setCurrentTheme(tTheme.id);
                  }}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? "border-[#004B87] dark:border-[#38BDF8] bg-blue-500/10 shadow-sm"
                      : "border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Icon size={16} className={isSelected ? "text-[#004B87] dark:text-[#38BDF8]" : "text-gray-400"} />
                      <span>{tTheme.name}</span>
                    </div>
                    {isSelected && <CheckCircle2 size={16} className="text-[#004B87] dark:text-[#38BDF8]" />}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-snug">
                    {tTheme.subtitle}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setThemeModalOpen(false)}
              className="px-5 py-2.5 rounded-xl bg-[#004B87] text-white text-xs font-bold shadow-md hover:bg-[#003B6D]"
            >
              {t("done")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
