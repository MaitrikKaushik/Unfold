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
    displayName: user.displayName || "",
    bio: user.bio || "",
    avatar: user.avatar || { url: "", publicId: "" },
    role: user.role,
    stats: user.stats,
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

export async function registerUser({ password, displayName = "", username: requestedUsername = "", usernameDescription = "" }) {
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
  try {
    return await User.create({ username, passwordHash, displayName: cleanDisplayName });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.username) {
      const conflict = new Error("That username was just taken. Generate another one.");
      conflict.status = 409;
      conflict.code = "USERNAME_TAKEN";
      throw conflict;
    }
    throw error;
  }
}

export async function authenticateUser({ username, password }) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername || typeof password !== "string" || !password) {
    const error = new Error("Username and password are required.");
    error.status = 400;
    error.code = "MISSING_CREDENTIALS";
    throw error;
  }

  const user = await User.findOne({ username: normalizedUsername }).select("+passwordHash +legacyId");
  if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.passwordHash))) {
    const error = new Error("Username or password is incorrect.");
    error.status = 401;
    error.code = "INVALID_CREDENTIALS";
    throw error;
  }
  return user;
}

export { PASSWORD_MIN_LENGTH };
