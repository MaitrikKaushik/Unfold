import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";

const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_ROUNDS = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    const error = new Error(`Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`);
    error.status = 400;
    error.code = "WEAK_PASSWORD";
    throw error;
  }
  if (password.length > 128) {
    const error = new Error("Password must contain 128 characters or fewer.");
    error.status = 400;
    error.code = "PASSWORD_TOO_LONG";
    throw error;
  }
}


const USERNAME_WORDS = [
  "nebula", "pixel", "orbit", "velvet", "nova", "echo", "mellow", "cosmic",
  "lunar", "vivid", "drift", "honey", "cipher", "bloom", "solstice", "indigo",
  "ember", "aurora", "cloud", "mosaic", "atlas", "quirky", "midnight", "ripple"
];

function fallbackUsername() {
  const pick = () => USERNAME_WORDS[crypto.randomInt(USERNAME_WORDS.length)];
  return `${pick()}_${pick()}${crypto.randomInt(10, 100)}`;
}

function cleanUsername(value) {
  let username = String(value || "").trim().toLowerCase().replace(/^@+/, "");
  username = username.normalize("NFKD").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (username.length < 8) username = `${username}_unfold`;
  return username.slice(0, 32).replace(/_+$/g, "");
}

async function geminiUsernameCandidate(description = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackUsername();

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt = [
    "Create ONE original, memorable, modern internet username for a community social platform called Unfold.",
    "Style: genuinely cool, distinctive, clean, aesthetic and easy to remember. Avoid generic usernames, random hexadecimal strings, the word 'user', and long digit suffixes.",
    "Use lowercase letters and underscores only. Return only the username, without @, quotes, markdown or explanation.",
    "The username must be 8 to 24 characters long.",
    description ? `The user's optional inspiration: ${description.slice(0, 300)}` : "No inspiration was supplied. Invent a fresh creative direction yourself."
  ].join("\\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 1.1, maxOutputTokens: 40 }
    }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Gemini username generation failed (${response.status}).`);
  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  const candidate = cleanUsername(raw);
  if (!/^[a-z0-9_]{8,32}$/.test(candidate)) throw new Error("Gemini returned an invalid username.");
  return candidate;
}

export async function generateUniqueUsername(description = "") {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let candidate;
    try {
      candidate = await geminiUsernameCandidate(description);
    } catch {
      candidate = fallbackUsername();
    }
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = fallbackUsername();
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  const error = new Error("Could not generate an available username. Please try again.");
  error.status = 503;
  error.code = "USERNAME_GENERATION_FAILED";
  throw error;
}


export function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email || "",
    displayName: user.displayName || "",
    bio: user.bio || "",
    avatar: user.avatar || { url: "", publicId: "" },
    role: user.role,
    stats: user.stats,
    preferences: user.preferences || {
      theme: "light",
      privacy: { directMessages: "everyone", profileVisibility: "public" },
      notifications: { directMessages: true, communityActivity: true, accountUpdates: true }
    },
    blockedUsers: (user.blockedUsers || []).map(String),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function createAccessToken(user) {
  const payload = {
    sub: String(user._id),
    tv: user.tokenVersion || 0
  };
  if (user.legacyId) payload.lid = user.legacyId;
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    issuer: "unfold-api",
    audience: "unfold-client"
  });
}

export async function registerUser({ password, displayName = "", username: requestedUsername = "", email = "", usernameDescription = "" }) {
  validatePassword(password);
  const cleanDisplayName = String(displayName || "").trim();
  if (cleanDisplayName.length > 40) {
    const error = new Error("Display name must be 40 characters or fewer.");
    error.status = 400;
    error.code = "DISPLAY_NAME_TOO_LONG";
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const requested = requestedUsername ? String(requestedUsername).trim().toLowerCase() : "";
  const username = requested || await generateUniqueUsername(usernameDescription);
  if (!/^[a-z0-9_]{8,32}$/.test(username)) {
    const error = new Error("Username must be 8–32 characters using lowercase letters, numbers or underscores.");
    error.status = 400;
    error.code = "INVALID_USERNAME";
    throw error;
  }

  const cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    const error = new Error("Please enter a valid email address.");
    error.status = 400;
    error.code = "INVALID_EMAIL";
    throw error;
  }

  try {
    const userDoc = { username, passwordHash, displayName: cleanDisplayName };
    if (cleanEmail) userDoc.email = cleanEmail;
    return await User.create(userDoc);
  } catch (error) {
    if (error?.code === 11000) {
      if (error?.keyPattern?.email) {
        const conflict = new Error("An account with that email already exists.");
        conflict.status = 409;
        conflict.code = "EMAIL_TAKEN";
        throw conflict;
      }
      if (error?.keyPattern?.username) {
        const conflict = new Error("That username was just taken. Generate another one.");
        conflict.status = 409;
        conflict.code = "USERNAME_TAKEN";
        throw conflict;
      }
    }
    throw error;
  }
}

export async function authenticateUser({ username, password }) {
  const identifier = String(username || "").trim();
  if (!identifier || typeof password !== "string" || !password) {
    const error = new Error("Username and password are required.");
    error.status = 400;
    error.code = "MISSING_CREDENTIALS";
    throw error;
  }

  const normalized = identifier.toLowerCase();
  const user = await User.findOne({
    $or: [
      { username: normalized },
      { email: normalized }
    ]
  }).select("+passwordHash +legacyId");

  if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.passwordHash))) {
    const error = new Error("Username or password is incorrect.");
    error.status = 401;
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }
  return user;
}

export async function updatePassword({ userId, currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) {
    const error = new Error("Current password and new password are required.");
    error.status = 400;
    error.code = "MISSING_PASSWORD_FIELDS";
    throw error;
  }

  validatePassword(newPassword);

  const user = await User.findById(userId).select("+passwordHash");
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    const error = new Error("Current password is incorrect.");
    error.status = 401;
    error.code = "INVALID_CURRENT_PASSWORD";
    throw error;
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  return user;
}

export async function updateSettings({ userId, email, preferences }) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  if (email !== undefined) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (cleanEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        const error = new Error("Please enter a valid email address.");
        error.status = 400;
        error.code = "INVALID_EMAIL";
        throw error;
      }
      const existing = await User.findOne({ email: cleanEmail, _id: { $ne: userId } });
      if (existing) {
        const conflict = new Error("An account with that email already exists.");
        conflict.status = 409;
        conflict.code = "EMAIL_TAKEN";
        throw conflict;
      }
      user.email = cleanEmail;
    } else {
      user.email = undefined;
    }
  }

  if (preferences && typeof preferences === "object") {
    if (!user.preferences) user.preferences = {};
    if (preferences.theme && ["light", "dark"].includes(preferences.theme)) {
      user.preferences.theme = preferences.theme;
    }
    if (preferences.privacy && typeof preferences.privacy === "object") {
      if (!user.preferences.privacy) user.preferences.privacy = {};
      if (["everyone", "none"].includes(preferences.privacy.directMessages)) {
        user.preferences.privacy.directMessages = preferences.privacy.directMessages;
      }
      if (["public", "members"].includes(preferences.privacy.profileVisibility)) {
        user.preferences.privacy.profileVisibility = preferences.privacy.profileVisibility;
      }
    }
    if (preferences.notifications && typeof preferences.notifications === "object") {
      if (!user.preferences.notifications) user.preferences.notifications = {};
      if (typeof preferences.notifications.directMessages === "boolean") {
        user.preferences.notifications.directMessages = preferences.notifications.directMessages;
      }
      if (typeof preferences.notifications.communityActivity === "boolean") {
        user.preferences.notifications.communityActivity = preferences.notifications.communityActivity;
      }
      if (typeof preferences.notifications.accountUpdates === "boolean") {
        user.preferences.notifications.accountUpdates = preferences.notifications.accountUpdates;
      }
    }
  }

  await user.save();
  return user;
}

export async function blockUser(userId, targetUserId) {
  if (String(userId) === String(targetUserId)) {
    const error = new Error("You cannot block yourself.");
    error.status = 400;
    error.code = "CANNOT_BLOCK_SELF";
    throw error;
  }

  const target = await User.findById(targetUserId);
  if (!target) {
    const error = new Error("User to block not found.");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  await User.updateOne(
    { _id: userId },
    { $addToSet: { blockedUsers: targetUserId } }
  );

  return { success: true, message: `Blocked @${target.username}` };
}

export async function unblockUser(userId, targetUserId) {
  await User.updateOne(
    { _id: userId },
    { $pull: { blockedUsers: targetUserId } }
  );
  return { success: true, message: "User unblocked successfully." };
}

export async function getBlockedUsers(userId) {
  const user = await User.findById(userId).populate("blockedUsers", "username displayName avatar");
  return (user?.blockedUsers || []).map((u) => ({
    id: String(u._id),
    username: u.username,
    displayName: u.displayName || u.username,
    avatar: u.avatar || { url: "", publicId: "" }
  }));
}

export async function searchUsers(query, excludeUserId) {
  const term = String(query || "").trim();
  if (!term || term.length < 2) return [];

  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const users = await User.find({
    _id: { $ne: excludeUserId },
    status: "active",
    $or: [
      { username: regex },
      { displayName: regex }
    ]
  }).limit(10).lean();

  return users.map((u) => ({
    id: String(u._id),
    username: u.username,
    displayName: u.displayName || "",
    bio: u.bio || "",
    avatar: u.avatar || { url: "", publicId: "" },
    stats: u.stats
  }));
}

export { PASSWORD_MIN_LENGTH };
