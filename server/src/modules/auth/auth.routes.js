import express from "express";
import rateLimit from "express-rate-limit";
import { asyncRoute } from "../../utils/http.js";
import { requireAuth } from "../../middleware/auth.js";
import User from "../../models/User.js";
import { authenticateUser, createAccessToken, publicUser, registerUser } from "./auth.service.js";
import logger from "../../config/logger.js";

const router = express.Router();
const SESSION_COOKIE = "unfold_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "TOO_MANY_ATTEMPTS", message: "Too many authentication attempts. Please try again later." } }
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === "production" ? "none" : "lax"),
    path: "/",
    maxAge: SESSION_MAX_AGE
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

function clearSessionCookie(res) {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(SESSION_COOKIE, options);
}

router.post("/register", authLimiter, asyncRoute(async (req, res) => {
  const user = await registerUser({ password: req.body?.password, displayName: req.body?.displayName });
  const token = createAccessToken(user);
  setSessionCookie(res, token);
  logger.info("New Unfold account registered", { userId: String(user._id) });
  return res.status(201).json({
    success: true,
    message: "Your Unfold account has been created.",
    data: { user: publicUser(user) },
    user: publicUser(user)
  });
}));

router.post("/login", authLimiter, asyncRoute(async (req, res) => {
  const user = await authenticateUser({ username: req.body?.username, password: req.body?.password });
  const token = createAccessToken(user);
  setSessionCookie(res, token);
  logger.info("User logged in", { userId: String(user._id) });
  return res.json({ success: true, message: "Welcome back to Unfold.", data: { user: publicUser(user) }, user: publicUser(user) });
}));

router.post("/logout", requireAuth, asyncRoute(async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
  clearSessionCookie(res);
  return res.json({ success: true, message: "You have been logged out." });
}));

router.get("/me", requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, error: { code: "USER_NOT_FOUND", message: "User not found." } });
  return res.json({ success: true, data: { user: publicUser(user) }, user: publicUser(user) });
}));

router.patch("/profile", requireAuth, asyncRoute(async (req, res) => {
  const updates = {};
  if (req.body?.displayName !== undefined) {
    const value = String(req.body.displayName).trim();
    if (value.length > 40) return res.status(400).json({ success: false, error: { code: "DISPLAY_NAME_TOO_LONG", message: "Display name must be 40 characters or fewer." } });
    updates.displayName = value;
  }
  if (req.body?.bio !== undefined) {
    const value = String(req.body.bio).trim();
    if (value.length > 250) return res.status(400).json({ success: false, error: { code: "BIO_TOO_LONG", message: "Bio must be 250 characters or fewer." } });
    updates.bio = value;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: { code: "NO_PROFILE_FIELDS", message: "Provide a display name or bio to update." } });
  }

  const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true });
  return res.json({ success: true, message: "Profile updated successfully.", data: { user: publicUser(user) }, user: publicUser(user) });
}));

export default router;
