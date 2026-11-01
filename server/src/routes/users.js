const express = require("express");
const { z } = require("zod");
const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const adminRoles = ["admin", "super_admin"];
const userProfileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  role: z.enum(User.ROLES),
});

router.get("/", requireAuth, requireRole(...adminRoles), async (req, res) => {
  const search = String(req.query.search || "").trim();
  if (search.length > 100) return res.status(400).json({ error: "Search must be 100 characters or fewer." });

  const filter = search
    ? { $or: ["name", "username", "role"].map((field) => ({ [field]: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })) }
    : {};
  const users = await User.find(filter)
    .select("name username role createdAt updatedAt")
    .sort({ role: 1, name: 1 })
    .limit(200)
    .lean();

  res.json(users.map((user) => ({
    ...user,
    isCurrentUser: String(user._id) === String(req.user.id),
  })));
});

router.patch("/:id", requireAuth, requireRole(...adminRoles), async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid user ID." });
  const parsed = userProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid user profile." });
  }

  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found." });

  if (req.user.role !== "super_admin") {
    if (target.role === "super_admin") {
      return res.status(403).json({ error: "Only a super admin can edit a super admin profile." });
    }
    if (parsed.data.role === "super_admin") {
      return res.status(403).json({ error: "Only a super admin can assign the super admin role." });
    }
  }
  if (String(target._id) === String(req.user.id) && parsed.data.role !== target.role) {
    return res.status(400).json({ error: "You cannot change your own role." });
  }

  const existing = await User.findOne({ username: parsed.data.username, _id: { $ne: target._id } }).select("_id");
  if (existing) return res.status(409).json({ error: "That username is already in use." });

  target.name = parsed.data.name;
  target.username = parsed.data.username;
  target.role = parsed.data.role;
  await target.save();

  res.json({
    _id: target._id,
    name: target.name,
    username: target.username,
    role: target.role,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  });
});

module.exports = router;
