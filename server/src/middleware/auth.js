import jwt from "jsonwebtoken";
import User from "../models/User.js";

export function getSessionToken(req) {
  const authorization = req.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);

  const cookieHeader = req.headers.cookie || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("unfold_session="));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice("unfold_session=".length));
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const token = getSessionToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: { code: "AUTH_REQUIRED", message: "Please log in to continue." } });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "unfold-api",
      audience: "unfold-client"
    });
    const user = await User.findById(payload.sub).select("+legacyId");
    if (!user || user.status !== "active" || user.tokenVersion !== Number(payload.tv || 0)) {
      return res.status(401).json({ success: false, error: { code: "INVALID_SESSION", message: "Your session is no longer valid." } });
    }
    req.user = {
      id: String(user._id),
      _id: user._id,
      username: user.username,
      role: user.role,
      status: user.status,
      legacyId: user.legacyId || null,
      mongoId: String(user._id)
    };
    return next();
  } catch {
    return res.status(401).json({ success: false, error: { code: "INVALID_SESSION", message: "Your session is invalid or has expired." } });
  }
}

export async function optionalAuth(req, _res, next) {
  const token = getSessionToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "unfold-api",
      audience: "unfold-client"
    });
    const user = await User.findById(payload.sub).select("+legacyId");
    if (user && user.status === "active" && user.tokenVersion === Number(payload.tv || 0)) {
      req.user = {
        id: String(user._id),
        _id: user._id,
        username: user.username,
        role: user.role,
        status: user.status,
        legacyId: user.legacyId || payload.lid || null,
        mongoId: String(user._id)
      };
    }
  } catch {
    // Invalid, expired or revoked optional sessions are treated as anonymous.
  }
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
    }
    return next();
  };
}
