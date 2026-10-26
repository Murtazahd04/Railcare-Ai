require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDB } = require("../db");
const mongoose = require("mongoose");

const User = require("../models/User");
const Train = require("../models/Train");
const Passenger = require("../models/Passenger");
const Booking = require("../models/Booking");
const Rfid = require("../models/Rfid");
const Complaint = require("../models/Complaint");
const Fine = require("../models/Fine");
const Call = require("../models/Call");
const KbCategory = require("../models/KbCategory");
const KbIntent = require("../models/KbIntent");

const NAMES = [
  "Ramesh Iyer", "Fatima Sheikh", "Arjun Deshmukh", "Priya Nair", "Vikram Chauhan",
  "Sunita Rao", "Aditya Kulkarni", "Meera Pillai", "Rohan Malhotra", "Kavita Joshi",
  "Imran Qureshi", "Ananya Bose", "Suresh Patil", "Divya Menon", "Karan Thakur",
  "Neha Agarwal", "Sanjay Verma", "Pooja Reddy", "Manoj Gupta", "Ritu Saxena",
];
const TRAIN_DEFS = [
  { number: "12951", name: "Mumbai Rajdhani", route: "Mumbai Central - New Delhi" },
  { number: "12301", name: "Howrah Rajdhani", route: "Howrah - New Delhi" },
  { number: "12009", name: "Shatabdi Express", route: "Mumbai - Ahmedabad" },
  { number: "22691", name: "KSR Bengaluru Rajdhani", route: "Bengaluru - New Delhi" },
  { number: "12622", name: "Tamil Nadu Express", route: "Chennai - New Delhi" },
];
const COACH_CODES = ["A1", "B1", "B2", "S4", "S7", "H1"];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a)); }
function genPNR() { return String(randInt(1000000000, 9999999999)); }

// Demo password for every seeded account. Override with SEED_PASSWORD (REQUIRED when
// seeding a production database — never ship the well-known default to the internet).
const SEED_PASSWORD = process.env.SEED_PASSWORD || "password123";

async function seed() {
  const uri = process.env.MONGO_URI || "";
  const isLocalDb = !uri || /^mongodb:\/\/(localhost|127\.0\.0\.1|mongo)[:/]/.test(uri);
  if (process.env.NODE_ENV === "production" || !isLocalDb) {
    // Any non-local database (Atlas, etc.) counts as "real". The seed script WIPES users, passengers, complaints, calls, KB etc. Make that explicit.
    if (process.env.ALLOW_SEED !== "true") {
      console.error("[seed] Refusing to run against a non-local / production database unless ALLOW_SEED=true. This script DELETES existing data.");
      process.exit(1);
    }
    if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 8) {
      console.error("[seed] Refusing to run against a non-local / production database without SEED_PASSWORD (min 8 chars) — don't use the public default password.");
      process.exit(1);
    }
  }
  await connectDB();
  console.log("[seed] clearing existing demo collections...");
  await Promise.all([
    User.deleteMany({}), Train.deleteMany({}), Passenger.deleteMany({}),
    Rfid.deleteMany({}), Complaint.deleteMany({}), Fine.deleteMany({}),
    Call.deleteMany({}), KbCategory.deleteMany({}), KbIntent.deleteMany({}),
    Booking.deleteMany({}),
  ]);

  // ---- Users ----
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  await User.insertMany([
    { name: "Admin User", username: "admin", passwordHash, role: "admin" },
    { name: "Supervisor Rao", username: "supervisor", passwordHash, role: "supervisor" },
    { name: "Agent Priya", username: "priya", passwordHash, role: "executive" },
    { name: "Agent Karan", username: "karan", passwordHash, role: "executive" },
    { name: "Agent Farah", username: "farah", passwordHash, role: "executive" },
    { name: "Agent Vikas", username: "vikas", passwordHash, role: "executive" },
    { name: "Agent Sneha", username: "sneha", passwordHash, role: "executive" },
  ]);
  console.log("[seed] users created");

  // ---- Trains ----
  const trains = await Train.insertMany(
    TRAIN_DEFS.map((t) => ({
      ...t,
      coaches: COACH_CODES.map((code) => ({ code, type: code.startsWith("A") ? "AC2" : code.startsWith("B") ? "AC3" : code.startsWith("H") ? "AC1" : "Sleeper", berths: 72 })),
    }))
  );

  // ---- Passengers ----
  const passengers = [
    // fixed PNR matching the sample voice queries (e.g. "check PNR 4521098234") so it's demo-able end to end
    { name: "Amey Banaye", mobile: "+91 98765 43210", pnr: "4521098234", trainNumber: "12951", coach: "B1", berth: 24, priorComplaints: 0 },
  ];
  for (let i = 0; i < 20; i++) {
    const train = rand(trains);
    passengers.push({
      name: rand(NAMES),
      mobile: `+91 ${randInt(70000, 99999)}${randInt(10000, 99999)}`,
      pnr: genPNR(),
      trainNumber: train.number,
      coach: rand(COACH_CODES),
      berth: randInt(1, 72),
      priorComplaints: randInt(0, 3),
    });
  }
  const savedPassengers = await Passenger.insertMany(passengers);
  console.log(`[seed] ${savedPassengers.length} passengers created`);

  // ---- Passenger Portal demo logins (5) — each gets 3 bookings: past, ongoing, upcoming ----
  const DEMO_PASSENGER_DEFS = [
    { name: "Rahul Mehta", mobile: "+91 90000 00001", username: "passenger1" },
    { name: "Sneha Kapoor", mobile: "+91 90000 00002", username: "passenger2" },
    { name: "Aman Tripathi", mobile: "+91 90000 00003", username: "passenger3" },
    { name: "Kritika Bhatt", mobile: "+91 90000 00004", username: "passenger4" },
    { name: "Om Prakash", mobile: "+91 90000 00005", username: "passenger5" },
  ];
  const allBookings = [];
  for (const def of DEMO_PASSENGER_DEFS) {
    const pastTrain = rand(trains);
    const presentTrain = rand(trains);
    const futureTrain = rand(trains);
    const pastBooking = {
      pnr: genPNR(), trainNumber: pastTrain.number, trainName: pastTrain.name, route: pastTrain.route,
      coach: rand(COACH_CODES), berth: randInt(1, 72),
      journeyDate: new Date(Date.now() - randInt(10, 40) * 86400000), status: "completed",
    };
    const presentBooking = {
      pnr: genPNR(), trainNumber: presentTrain.number, trainName: presentTrain.name, route: presentTrain.route,
      coach: rand(COACH_CODES), berth: randInt(1, 72),
      journeyDate: new Date(), status: "ongoing",
    };
    const futureBooking = {
      pnr: genPNR(), trainNumber: futureTrain.number, trainName: futureTrain.name, route: futureTrain.route,
      coach: rand(COACH_CODES), berth: randInt(1, 72),
      journeyDate: new Date(Date.now() + randInt(7, 30) * 86400000), status: "upcoming",
    };

    // the Passenger doc's own pnr/train/coach/berth mirrors their ongoing journey (used by executive PNR lookups)
    const passenger = await Passenger.create({
      name: def.name, mobile: def.mobile, username: def.username, passwordHash,
      pnr: presentBooking.pnr, trainNumber: presentBooking.trainNumber,
      coach: presentBooking.coach, berth: presentBooking.berth,
      journeyDate: presentBooking.journeyDate, priorComplaints: 0,
    });

    for (const b of [pastBooking, presentBooking, futureBooking]) {
      allBookings.push({ ...b, passengerId: passenger._id });
    }
  }
  await Booking.insertMany(allBookings);
  console.log(`[seed] ${DEMO_PASSENGER_DEFS.length} Passenger Portal logins created`);

  // ---- RFID tags (100) ----
  const stages = Rfid.STAGES;
  const rfidDocs = [];
  for (let i = 0; i < 100; i++) {
    const stage = rand(stages);
    const train = rand(trains);
    rfidDocs.push({
      tagId: `RFID-${1000 + i}`,
      kitType: rand(["Blanket", "Bedsheet", "Pillow Cover", "Towel"]),
      currentStage: stage,
      trainNumber: train.number,
      coach: rand(COACH_CODES),
      berth: randInt(1, 72),
      history: [{ stage, note: "Seed data initial scan" }],
    });
  }
  await Rfid.insertMany(rfidDocs);
  console.log(`[seed] ${rfidDocs.length} RFID tags created`);

  // ---- Complaints (20) ----
  const intentsForComplaints = ["Missing Blanket", "Dirty Bedsheet", "Missing Pillow", "Linen Return Confusion", "Coach Attendant Complaint"];
  const complaintDocs = savedPassengers.slice(0, 20).map((p, i) => {
    const status = i < 4 ? rand(["open", "in_progress"]) : rand(["open", "in_progress", "resolved"]);
    const doc = {
      passengerName: p.name,
      pnr: p.pnr,
      trainNumber: p.trainNumber,
      coach: p.coach,
      berth: p.berth,
      intent: rand(intentsForComplaints),
      description: "Auto-generated demo complaint.",
      status,
      source: rand(["ai_call", "executive_call", "manual"]),
    };
    // Backdate a handful of still-open ones past the escalation thresholds
    // (utils/escalation.js) so the Analytics Dashboard's escalation ladder
    // panel has real data the moment you seed, instead of looking empty
    // until complaints actually age in real time.
    if (status !== "resolved" && i < 4) {
      if (i < 2) {
        // past level-1 threshold (default 24h) — the boot-time sweep will bump these to Supervisor
        doc.createdAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
      } else {
        // already at Supervisor and past level-2 threshold (default 48h) — sweep bumps to Divisional Officer
        doc.createdAt = new Date(Date.now() - 60 * 60 * 60 * 1000);
        doc.escalationLevel = 1;
        doc.escalatedAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
        doc.escalationHistory = [{ level: 1, reason: "auto_timeout", at: doc.escalatedAt }];
      }
    }
    return doc;
  });
  await Complaint.insertMany(complaintDocs);
  console.log(`[seed] ${complaintDocs.length} complaints created (4 backdated to demo the escalation ladder on next server boot)`);

  // ---- Fines ----
  const fineDocs = savedPassengers.slice(0, 10).map((p) => ({
    passengerName: p.name,
    pnr: p.pnr,
    reason: rand(["Berth mismatch", "Linen not returned", "Travelling without valid ticket upgrade"]),
    amount: randInt(200, 900),
    status: rand(["pending", "paid"]),
  }));
  await Fine.insertMany(fineDocs);
  console.log(`[seed] ${fineDocs.length} fines created`);

  // ---- Call history (30) ----
  const callDocs = [];
  for (let i = 0; i < 30; i++) {
    const status = rand(["completed", "completed", "completed", "missed", "transferred"]);
    const hasExecutive = status !== "missed";
    // Most (not all) executive-handled calls get rated — mirrors real life,
    // where not every caller bothers to rate, but most do. Feeds the
    // Executive Performance / Passenger Satisfaction panels on the Analytics Dashboard.
    const rating = hasExecutive && Math.random() < 0.75 ? randInt(3, 5) : undefined;
    callDocs.push({
      callId: `CALL-${(1000 + i).toString(36).toUpperCase()}`,
      customerName: rand(NAMES),
      executiveName: hasExecutive ? rand(["Agent Priya", "Agent Karan"]) : undefined,
      intent: rand(intentsForComplaints.concat(["Fine Appeal", "Train Delay Info", "RFID Tracking Query"])),
      confidence: +(0.5 + Math.random() * 0.5).toFixed(2),
      status,
      durationSec: randInt(30, 360),
      rating,
    });
  }
  await Call.insertMany(callDocs);
  console.log(`[seed] ${callDocs.length} call history records created (with sample ratings for the Analytics Dashboard)`);

  // ---- AI Knowledge Base ----
  const linenCategory = await KbCategory.create({ name: "Linen Issues", description: "Blanket, bedsheet, pillow related issues" });
  const fineCategory = await KbCategory.create({ name: "Fines & Payments", description: "Fine reasons, appeals, QR payments" });
  const journeyCategory = await KbCategory.create({ name: "Journey Info", description: "Delay, platform, PNR status" });
  const choiceCategory = await KbCategory.create({
    name: "Customer's Choice",
    description: "Choices the passenger makes about their own linen service — type, timing, and changes to a request already placed",
  });
  const cateringCategory = await KbCategory.create({
    name: "E-Catering & Station Assistance",
    description: "Food ordering to seat and in-transit station help",
  });
  const policyCategory = await KbCategory.create({
    name: "Policy & General FAQ",
    description: "Refund rules, Tatkal booking guidelines, senior citizen quota — general IRCTC policy questions answered from the knowledge base",
  });
  const safetyCategory = await KbCategory.create({
    name: "Coach & Safety",
    description: "AC, water, toilet cleanliness, medical emergencies, and passenger security — the most common categories on Indian Railways' real Rail Madad helpline",
  });

  await KbIntent.insertMany([
    {
      name: "Missing Blanket",
      categoryId: linenCategory._id,
      questions: [
        "Where is my blanket?", "Blanket not received", "Need blanket", "Blanket nahi mila",
        "Mera kambal kaha hai", "Bedroll missing", "I did not get my blanket", "Blanket abhi tak nahi aaya",
        "Kambal chahiye", "No blanket on my berth", "My blanket is missing", "Kaha hai mera blanket",
      ],
      synonyms: ["blanket", "kambal", "bedroll", "rajai"],
      keywords: ["blanket", "kambal", "missing", "nahi mila"],
      expectedAction: "notify_coach_attendant",
      expectedAnswer: "I'm sorry about that, {passenger_name}. I've notified the coach attendant for coach {coach} to bring a blanket to berth {berth} right away.",
      confidenceThreshold: 0.55,
    },
    {
      name: "Dirty Bedsheet",
      categoryId: linenCategory._id,
      questions: [
        "My bedsheet is dirty", "Bedsheet gandi hai", "Need clean bedsheet", "Sheet is stained",
        "Chadar saaf nahi hai", "Bedsheet not clean", "Dirty linen on my berth",
      ],
      synonyms: ["bedsheet", "chadar", "linen", "sheet"],
      keywords: ["dirty", "gandi", "stained", "bedsheet"],
      expectedAction: "notify_coach_attendant",
      expectedAnswer: "Apologies for the inconvenience. A clean bedsheet is being sent to your berth {berth} shortly.",
      confidenceThreshold: 0.55,
    },
    {
      name: "Fine Appeal",
      categoryId: fineCategory._id,
      questions: [
        "Why was I fined?", "I want to appeal my fine", "The fine is wrong", "Galat fine laga hai",
        "Mujhe fine kyun mila", "I had a valid ticket", "Fine appeal karna hai",
      ],
      synonyms: ["fine", "penalty", "jurmana"],
      keywords: ["fine", "appeal", "wrong", "galat"],
      expectedAction: "lookup_fine",
      expectedAnswer: "Let me pull up your fine details on PNR {pnr}. Given the details, I'll connect you to an executive to review the appeal.",
      confidenceThreshold: 0.75,
    },
    {
      name: "Train Delay Info",
      categoryId: journeyCategory._id,
      questions: [
        "Is my train late?", "Train kitna late hai", "What is the current delay",
        "Train ki position batao", "How late is the train running",
      ],
      synonyms: ["delay", "late", "running status"],
      keywords: ["late", "delay", "position", "running"],
      expectedAction: "lookup_train_status",
      expectedAnswer: "Checking live position for train {train_number}... it is currently running with a moderate delay. I'll keep you updated.",
      confidenceThreshold: 0.6,
    },
    {
      name: "RFID Tracking Query",
      categoryId: linenCategory._id,
      questions: [
        "Where is my linen kit", "RFID status", "Track my blanket", "Linen kit kaha hai",
      ],
      synonyms: ["rfid", "tag", "tracking"],
      keywords: ["rfid", "track", "tag"],
      expectedAction: "lookup_rfid",
      expectedAnswer: "Your linen kit's RFID tag shows it is currently at the {stage} stage.",
      confidenceThreshold: 0.6,
    },
    {
      name: "Choose Linen Type",
      categoryId: choiceCategory._id,
      questions: [
        "Can I choose which blanket I get", "I want a woollen blanket instead",
        "Do you have cotton bedsheets", "Mujhe cotton wali chadar chahiye",
        "Can I pick my pillow type", "What linen options are available",
        "I want a thicker blanket", "Kya alag type ka kambal mil sakta hai",
        "Can I request a specific fabric", "Options for bedsheet material",
      ],
      synonyms: ["linen type", "fabric", "material", "woollen", "cotton"],
      keywords: ["choose", "type", "option", "prefer", "chahiye"],
      expectedAction: "offer_linen_choice",
      expectedAnswer: "We currently offer standard cotton bedsheets and woollen blankets, {passenger_name}. I've noted your preference for coach {coach}, berth {berth} — the attendant will bring the closest match available on this train.",
      confidenceThreshold: 0.55,
    },
    {
      name: "Change Delivery Time",
      categoryId: choiceCategory._id,
      questions: [
        "Can I get my linen later", "I want linen delivered after dinner",
        "Change the time you bring my blanket", "Bedroll thodi der baad de dena",
        "Can you delay the linen delivery", "I'm not ready yet, come back in an hour",
        "Reschedule my linen delivery", "Linen abhi nahi baad mein chahiye",
        "Can I choose when linen arrives", "Bring my bedsheet at a later time",
      ],
      synonyms: ["delivery time", "reschedule", "later", "delay"],
      keywords: ["time", "later", "delay", "reschedule", "baad"],
      expectedAction: "reschedule_linen_delivery",
      expectedAnswer: "No problem, {passenger_name}. I've asked the coach attendant to bring your linen to berth {berth} a little later instead of right away.",
      confidenceThreshold: 0.55,
    },
    {
      name: "Change or Cancel Linen Request",
      categoryId: choiceCategory._id,
      questions: [
        "I want to cancel my blanket request", "Undo my linen request",
        "I changed my mind, I don't need a blanket", "Mujhe ab blanket nahi chahiye",
        "Cancel the bedsheet request", "Remove my earlier request",
        "I don't want linen anymore", "Request cancel karna hai",
        "Can I change what I asked for earlier", "Switch my request to just a pillow",
      ],
      synonyms: ["cancel request", "undo", "change request"],
      keywords: ["cancel", "undo", "change", "nahi chahiye"],
      expectedAction: "cancel_linen_request",
      expectedAnswer: "Understood, {passenger_name} — I've cancelled your earlier linen request for berth {berth}. Let me know if you'd like to request something else instead.",
      confidenceThreshold: 0.55,
    },
    {
      name: "Choose Berth Preference",
      categoryId: choiceCategory._id,
      questions: [
        "Can I switch to a lower berth", "I want to change my berth preference",
        "Can I get an upper berth instead", "Berth badal sakte hain kya",
        "I prefer a side lower berth", "Request a berth change for comfort",
        "Can I swap berths with someone", "Mujhe lower berth chahiye",
        "Is a berth change possible right now", "I'd like a window side berth",
      ],
      synonyms: ["berth preference", "berth change", "swap berth"],
      keywords: ["berth", "lower", "upper", "swap", "badal"],
      expectedAction: "log_berth_preference_request",
      expectedAnswer: "I've logged your berth preference for PNR {pnr}, {passenger_name}. Berth changes depend on availability, so I'm connecting you to an executive who can check what's free on this train and confirm it for you.",
      confidenceThreshold: 0.7,
    },
    {
      name: "PNR Status",
      categoryId: journeyCategory._id,
      questions: [
        "What is the current ticket status for my PNR", "Mera PNR number hai, seat confirm hui ya nahi",
        "Check my PNR status", "Is my ticket confirmed", "PNR status batao",
        "Seat confirm hui kya", "What's my booking status", "Mera ticket confirm hai ya waiting",
        "Can you check PNR 4521098234", "Ticket status check karo",
        "My PNR is still showing waiting list, any update", "Please tell me if my ticket got confirmed",
        // Marathi
        "माझं तिकीट कन्फर्म झालं का", "PNR स्टेटस सांगा",
        // Gujarati
        "મારી ટિકિટ કન્ફર્મ થઈ કે નહીં", "PNR સ્ટેટસ ચેક કરો",
        // Tamil
        "என் டிக்கெட் கன்பர்ம் ஆகிடுச்சா", "PNR ஸ்டேட்டஸ் சொல்லுங்க",
      ],
      synonyms: ["pnr status", "ticket status", "booking status", "confirm"],
      keywords: ["pnr", "status", "confirm", "waiting", "ticket"],
      languages: ["en", "hi", "hi-latn", "mr", "gu", "ta"],
      expectedAction: "lookup_pnr_status",
      expectedAnswer: "Checking PNR {pnr} for you, {passenger_name}... your seat is confirmed — coach {coach}, berth {berth}.",
      confidenceThreshold: 0.6,
    },
    {
      name: "Train Running Status",
      categoryId: journeyCategory._id,
      questions: [
        "Is Rajdhani Express running on time at New Delhi station today", "Kya Rajdhani Express New Delhi station par late chal rahi hai",
        "Is my train running on time", "Train ki running status kya hai",
        "What is the live status of my train", "Train late hai kya",
        "Check running status for Karnataka Express", "Mera train time par hai kya",
        "Is the train delayed today", "Live train status batao",
        "How many hours late is my train running", "Where is my train right now",
        // Marathi
        "माझी ट्रेन उशिरा आहे का", "ट्रेनची लाइव्ह स्टेटस सांगा",
        // Gujarati
        "મારી ટ્રેન મોડી છે કે નહીં", "ટ્રેનનું લાઈવ સ્ટેટસ કહો",
        // Tamil
        "என் ரயில் லேட்டா இருக்கா", "ரயிலோட லைவ் ஸ்டேட்டஸ் சொல்லுங்க",
      ],
      synonyms: ["running status", "live status", "on time", "delayed"],
      keywords: ["running", "status", "late", "delay", "time"],
      languages: ["en", "hi", "hi-latn", "mr", "gu", "ta"],
      expectedAction: "lookup_train_status",
      expectedAnswer: "Checking live position for train {train_number}, {passenger_name}... it is currently running with a moderate delay. I'll keep you updated.",
      confidenceThreshold: 0.6,
    },
    {
      name: "Seat & Fare Availability",
      categoryId: journeyCategory._id,
      questions: [
        "Check 3rd AC seat availability for Karnataka Express for this Friday", "Is Friday ko Karnataka Express me 3rd AC ki kitni seats khali hain",
        "How many seats are available", "Kitni seats khali hain",
        "What is the fare for AC 2 tier", "Fare kitna hai is train ka",
        "Is there availability for tomorrow", "Waiting list kitni lambi hai",
        "Check seat availability for next week", "AC 3 tier me seat khali hai kya",
      ],
      synonyms: ["seat availability", "fare", "waiting list", "khali seats"],
      keywords: ["seat", "availability", "fare", "khali", "waiting"],
      expectedAction: "lookup_seat_availability",
      expectedAnswer: "Let me check current seat and fare availability for train {train_number} — I'll connect you to an executive who can confirm the latest numbers and complete a booking if needed.",
      confidenceThreshold: 0.65,
    },
    {
      name: "E-Catering / Food Order",
      categoryId: cateringCategory._id,
      questions: [
        "Can I order a veg thali to my seat at Kanpur Central station", "Kya mujhe Kanpur station par meri seat par veg thali mil sakti hai",
        "I want to order food to my seat", "Khana order karna hai seat par",
        "What food options are available at the next station", "Food menu dikhao",
        "Can I get food delivered on the train", "Meal order karna hai",
        "Order breakfast to my berth", "Khana kaise order karu train me",
      ],
      synonyms: ["e-catering", "food order", "meal", "khana"],
      keywords: ["food", "order", "meal", "khana", "catering"],
      expectedAction: "place_ecatering_order",
      expectedAnswer: "Sure, {passenger_name}! I can help place a food order to berth {berth}. I'll connect you to an executive to confirm the menu and payment for your upcoming station stop.",
      confidenceThreshold: 0.6,
    },
    {
      name: "Destination Alert",
      categoryId: cateringCategory._id,
      questions: [
        "Set a destination wake-up call 20 minutes before arriving at Agra", "Agra station aane se 20 minute pehle mujhe call karke jaga dena",
        "Wake me up before my stop", "Mera stop aane se pehle jaga dena",
        "Set a destination alert", "Destination alert lagana hai",
        "Remind me before my station comes", "Mera station aane wala hai to batana",
        "Can you set a wake up alarm for my stop", "Alert set karo mere station ke liye",
      ],
      synonyms: ["destination alert", "wake up call", "reminder"],
      keywords: ["alert", "wake", "reminder", "jaga", "station"],
      expectedAction: "set_destination_alert",
      expectedAnswer: "Done, {passenger_name} — I've set a destination alert 20 minutes before your stop. You'll get a wake-up call/notification automatically.",
      confidenceThreshold: 0.6,
    },
    {
      name: "Refund Rules",
      categoryId: policyCategory._id,
      questions: [
        "My train got cancelled by railways. How many days will the refund take", "Train cancel ho gayi hai, mera refund kitne din me account me aayega",
        "What is the refund policy", "Refund kaise milega",
        "How long does a refund take", "Cancellation ka refund kab tak aata hai",
        "I cancelled my ticket, when will I get money back", "Paisa wapas kab aayega",
        "What are the refund rules for TDR", "TDR file karne ke baad refund kitne din me milta hai",
        // Marathi / Gujarati / Tamil
        "रिफंड किती दिवसात मिळेल", "રિફંડ કેટલા દિવસમાં મળશે", "ரீஃபண்ட் எத்தனை நாளில் வரும்",
      ],
      synonyms: ["refund", "cancellation", "tdr", "paisa wapas"],
      keywords: ["refund", "cancel", "money", "tdr", "wapas"],
      languages: ["en", "hi", "hi-latn", "mr", "gu", "ta"],
      expectedAction: "answer_from_kb",
      expectedAnswer: "For railway-cancelled trains, refunds are usually processed automatically within 3-7 working days to your original payment method. For self-cancelled tickets, it depends on how early you cancelled. I can connect you to an executive if you'd like your specific case checked.",
      confidenceThreshold: 0.6,
    },
    {
      name: "Tatkal Booking Guidelines",
      categoryId: policyCategory._id,
      questions: [
        "At what time does Tatkal booking open for AC classes", "AC class ke liye Tatkal ticket ki booking kitne baje shuru hoti hai",
        "When does Tatkal booking start", "Tatkal kitne baje khulta hai",
        "What is the Tatkal timing for sleeper class", "Sleeper Tatkal ka time kya hai",
        "How many days before can I book Tatkal", "Tatkal ticket kitne din pehle book hota hai",
        "What documents are needed for Tatkal", "Tatkal booking ke rules kya hain",
      ],
      synonyms: ["tatkal", "tatkal booking", "quota timing"],
      keywords: ["tatkal", "booking", "time", "open", "baje"],
      expectedAction: "answer_from_kb",
      expectedAnswer: "Tatkal booking opens one day before the journey date (excluding the day of travel) — 10:00 AM for AC classes and 11:00 AM for non-AC/Sleeper classes.",
      confidenceThreshold: 0.6,
    },
    {
      name: "Senior Citizen Quota",
      categoryId: policyCategory._id,
      questions: [
        "What are the age limits and lower berth rules for senior citizens", "Senior citizens ke liye lower berth lene ke kya niyam hain",
        "What is the senior citizen quota age", "Senior citizen quota ke liye age kitni honi chahiye",
        "How do I get a lower berth as a senior citizen", "Senior citizen ko lower berth kaise milta hai",
        "Is there a discount for senior citizens", "Senior citizen discount hai kya",
        "What documents prove senior citizen status", "Senior citizen proof kya chahiye",
      ],
      synonyms: ["senior citizen", "lower berth", "quota", "age limit"],
      keywords: ["senior", "citizen", "quota", "berth", "age"],
      expectedAction: "answer_from_kb",
      expectedAnswer: "Senior citizen quota applies to men 60+ and women 58+. Eligible passengers can request a lower berth at booking time, and it's auto-preferred by the system based on availability. A valid age-proof ID is needed at boarding.",
      confidenceThreshold: 0.6,
    },
    {
      name: "AC Coach Not Cooling",
      categoryId: safetyCategory._id,
      questions: [
        "AC is not working in my coach", "Coach ka AC kharab hai", "It's too hot, AC not cooling",
        "Air conditioning not working in coach", "AC bahut garam hawa de raha hai", "No cooling in my compartment",
        "AC band ho gaya hai", "The AC in coach B2 is not functioning", "Bohot garmi lag rahi hai AC ke bawajood",
        "Please fix the AC in my coach", "AC thanda nahi kar raha", "Temperature is too high inside the coach",
        // Marathi / Gujarati / Tamil
        "AC काम करत नाहीये माझ्या कोचमध्ये", "AC કામ નથી કરતું મારા કોચમાં", "என் கோச்சில் AC வேலை செய்யல",
      ],
      synonyms: ["ac", "air conditioning", "cooling", "thanda"],
      keywords: ["ac", "cooling", "hot", "garam", "kharab"],
      languages: ["en", "hi", "hi-latn", "mr", "gu", "ta"],
      expectedAction: "notify_coach_attendant",
      expectedAnswer: "I'm sorry for the discomfort, {passenger_name}. I've raised an AC malfunction alert for coach {coach} — the on-board technician/attendant has been notified to check it.",
      confidenceThreshold: 0.55,
    },
    {
      name: "Water Not Available",
      categoryId: safetyCategory._id,
      questions: [
        "There is no water in my coach", "Paani nahi hai coach mein", "Water tank is empty",
        "No drinking water available", "Washroom mein paani nahi hai", "Water not coming in toilet",
        "Please refill drinking water", "Coach mein pani khatam ho gaya", "Bottle refill station not working",
        "Need water urgently", "Paani ki bahut kami hai", "Water supply issue in coach",
      ],
      synonyms: ["water", "paani", "drinking water"],
      keywords: ["water", "paani", "empty", "khatam", "refill"],
      expectedAction: "notify_coach_attendant",
      expectedAnswer: "Noted, {passenger_name}. I've alerted the coach attendant for coach {coach} to arrange a water refill at the next stop.",
      confidenceThreshold: 0.55,
    },
    {
      name: "Toilet Cleanliness",
      categoryId: safetyCategory._id,
      questions: [
        "The toilet is very dirty", "Toilet bahut ganda hai", "Washroom needs cleaning",
        "Bathroom is unhygienic", "Toilet safai nahi hui hai", "Toilet is smelling badly",
        "Please clean the washroom", "Coach ka toilet bahut kharab condition mein hai",
        "Washroom floor is wet and dirty", "Toilet saaf karwao", "No soap or tissue in toilet",
        "Toilet door is broken",
      ],
      synonyms: ["toilet", "washroom", "bathroom", "cleanliness", "safai"],
      keywords: ["toilet", "dirty", "ganda", "clean", "safai"],
      expectedAction: "notify_coach_attendant",
      expectedAnswer: "Apologies, {passenger_name}. I've sent an urgent cleaning request for the washroom in coach {coach} to the on-board housekeeping staff.",
      confidenceThreshold: 0.55,
    },
    {
      name: "Medical Emergency",
      categoryId: safetyCategory._id,
      questions: [
        "There is a medical emergency on board", "Mujhe medical help chahiye abhi",
        "Someone is unwell in my coach", "Need a doctor urgently on the train",
        "Passenger has fainted", "Emergency medical assistance needed",
        "Co-passenger is having chest pain", "Turant doctor chahiye",
        "Medical emergency, please help immediately", "Ambulance chahiye agle station par",
        "Someone collapsed in the coach", "Health emergency on train",
        // Marathi / Gujarati / Tamil — this is the one intent where every extra
        // language covered can genuinely matter
        "मला तातडीने डॉक्टर हवा आहे", "मला તાત્કાલિક ડોક્ટરની જરૂર છે", "எனக்கு உடனே டாக்டர் வேணும்",
        "कोणीतरी बेशुद्ध पडलं आहे", "કોઈ બેભાન થઈ ગયું છે", "யாரோ மயங்கி விழுந்துவிட்டார்கள்",
      ],
      synonyms: ["medical", "emergency", "doctor", "ambulance"],
      keywords: ["medical", "emergency", "doctor", "unwell", "help"],
      languages: ["en", "hi", "hi-latn", "mr", "gu", "ta"],
      expectedAction: "escalate_emergency",
      expectedAnswer: "This has been flagged as urgent, {passenger_name} — connecting you to an executive immediately who can coordinate on-board medical assistance and arrange help at the next station.",
      confidenceThreshold: 0.4,
    },
    {
      name: "Security / Safety Concern",
      categoryId: safetyCategory._id,
      questions: [
        "I feel unsafe in my coach", "Someone is harassing me", "There was a theft in my coach",
        "My luggage got stolen", "Suspicious person in the coach", "Chori ho gayi hai mere saamaan ki",
        "Mujhe koi tang kar raha hai", "Need RPF help urgently", "Security issue on the train",
        "Someone is misbehaving with me", "Unknown person entered my coach", "I want to report a safety concern",
        // Marathi / Gujarati / Tamil
        "मला असुरक्षित वाटतंय", "મને અસુરક્ષિત લાગે છે", "எனக்கு பாதுகாப்பில்லாம இருக்கு",
      ],
      synonyms: ["security", "safety", "theft", "harassment", "rpf"],
      keywords: ["safe", "theft", "chori", "security", "harass"],
      languages: ["en", "hi", "hi-latn", "mr", "gu", "ta"],
      expectedAction: "escalate_emergency",
      expectedAnswer: "Your safety is the top priority, {passenger_name}. I'm connecting you to an executive right now who can alert the RPF/on-board security for coach {coach}.",
      confidenceThreshold: 0.4,
    },
    {
      name: "Lost Luggage / Belongings",
      categoryId: safetyCategory._id,
      questions: [
        "I lost my bag on the train", "Mera saaman kho gaya", "Left my luggage at the station",
        "Can't find my suitcase", "Forgot my bag on the platform", "Mera bag train mein reh gaya",
        "Lost property help needed", "Someone took my bag by mistake", "Missing luggage complaint",
        "I need to file a lost item report", "Bag chhoot gaya station par", "Where is the lost and found",
      ],
      synonyms: ["lost luggage", "lost property", "bag", "saaman", "missing"],
      keywords: ["lost", "luggage", "bag", "kho", "missing"],
      expectedAction: "log_lost_property",
      expectedAnswer: "I'm sorry about that, {passenger_name}. I've logged a lost-property report referencing PNR {pnr} — an executive will help you file it formally with the details of the item and last seen location.",
      confidenceThreshold: 0.55,
    },
  ]);
  console.log("[seed] AI knowledge base categories + intents created");

  console.log(`\n[seed] DONE. Demo logins use SEED_PASSWORD (${process.env.SEED_PASSWORD ? "from env" : "default: password123"}):`);
  console.log("        admin / supervisor / priya / karan");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
