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

export function generateUsernameCandidate() {
  return `unfold_${crypto.randomBytes(6).toString("hex")}`;
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

export async function registerUser({ password, displayName = "" }) {
  validatePassword(password);
  const cleanDisplayName = String(displayName || "").trim();
  if (cleanDisplayName.length > 40) {
    const error = new Error("Display name must be 40 characters or fewer.");
    error.status = 400;
    error.code = "DISPLAY_NAME_TOO_LONG";
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const username = generateUsernameCandidate();
    try {
      const user = await User.create({ username, passwordHash, displayName: cleanDisplayName });
      return user;
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.username && attempt < 5) continue;
      throw error;
    }
  }
  const error = new Error("Could not generate a unique username. Please try again.");
  error.status = 503;
  error.code = "USERNAME_GENERATION_FAILED";
  throw error;
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
