const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../utils/config");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const Passenger = require("../models/Passenger");
const Booking = require("../models/Booking");
const Train = require("../models/Train");
const { validateBody } = require("../middleware/validate");
const { loginSchema, customerSessionSchema, passengerSignupSchema } = require("../utils/schemas");

const router = express.Router();

router.post("/login", validateBody(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";
  const signOptions = expiresIn === "none" ? {} : { expiresIn };

  const token = jwt.sign(
    { id: user._id, name: user.name, role: user.role, username: user.username },
    getJwtSecret(),
    signOptions
  );
  res.json({ token, user: { name: user.name, role: user.role, username: user.username } });
});

/**
 * Passenger Portal signup — demo self-registration (no OTP/email verification,
 * this is a demo auth system). Creates a real Passenger + one starter booking
 * on a random seeded train so the new account isn't empty.
 */
router.post("/passenger-signup", validateBody(passengerSignupSchema), async (req, res) => {
  const { name, mobile, email, username, password } = req.body;

  const existing = await Passenger.findOne({ username });
  if (existing) return res.status(409).json({ error: "That username is already taken" });

  const passwordHash = await bcrypt.hash(password, 10);
  const trains = await Train.find();
  const train = trains[Math.floor(Math.random() * trains.length)];
  const pnr = String(Math.floor(1000000000 + Math.random() * 8999999999));
  const coach = train?.coaches?.[0]?.code || "S4";
  const berth = Math.floor(Math.random() * 72) + 1;
  const journeyDate = new Date(Date.now() + 14 * 86400000); // 2 weeks out

  const passenger = await Passenger.create({
    name, mobile, email: email || undefined, username, passwordHash,
    pnr, trainNumber: train?.number || "12951", coach, berth, journeyDate,
  });
  if (train) {
    await Booking.create({
      passengerId: passenger._id, pnr, trainNumber: train.number, trainName: train.name,
      route: train.route, coach, berth, journeyDate, status: "upcoming",
    });
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";
  const signOptions = expiresIn === "none" ? {} : { expiresIn };
  const token = jwt.sign(
    { id: passenger._id, passengerId: passenger._id, name: passenger.name, role: "passenger", pnr: passenger.pnr },
    getJwtSecret(),
    signOptions
  );
  res.status(201).json({ token, user: { passengerId: passenger._id, name: passenger.name, role: "passenger", pnr: passenger.pnr, mobile: passenger.mobile, email: passenger.email || null } });
});

/**
 * Passenger Portal login — real username/password auth for the 5 demo
 * passenger accounts (separate from the staff /login above and from the
 * anonymous /customer-session used by the call simulator).
 */
router.post("/passenger-login", validateBody(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const passenger = await Passenger.findOne({ username });
  if (!passenger || !passenger.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, passenger.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";
  const signOptions = expiresIn === "none" ? {} : { expiresIn };

  const token = jwt.sign(
    { id: passenger._id, passengerId: passenger._id, name: passenger.name, role: "passenger", pnr: passenger.pnr },
    getJwtSecret(),
    signOptions
  );
  res.json({ token, user: { passengerId: passenger._id, name: passenger.name, role: "passenger", pnr: passenger.pnr, mobile: passenger.mobile, email: passenger.email || null } });
});

/**
 * Anonymous customer session — no username/password.
 * This is real authentication (a signed, verifiable JWT), just without
 * credentials: every passenger gets a stable customerId for this session,
 * which is what lets us tell "customer A called twice" from "two different
 * customers called once each" without asking anyone to sign up.
 */
router.post("/customer-session", validateBody(customerSessionSchema), (req, res) => {
  const { name } = req.body;
  const customerId = uuidv4();
  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";
  const signOptions = expiresIn === "none" ? {} : { expiresIn };

  const token = jwt.sign(
    { id: customerId, customerId, name: name || "Passenger", role: "customer" },
    getJwtSecret(),
    signOptions
  );
  res.json({ token, user: { customerId, name: name || "Passenger", role: "customer" } });
});

module.exports = router;
