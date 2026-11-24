import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import legacyRoutes from "./routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import moderationRoutes from "./modules/moderation/moderation.routes.js";
import postsRoutes from "./modules/posts/posts.routes.js";
import messagesRoutes from "./modules/messages/messages.routes.js";
import { setupSocketIO } from "./modules/messages/messages.socket.js";
import { connectMongo, isMongoReady } from "./config/mongo.js";
import { initialisePostgres, postgresPool, closePostgres } from "./config/postgres.js";
import { connectRedis, redisClient, closeRedis } from "./config/redis.js";
import { configureCloudinary, isCloudinaryConfigured } from "./config/cloudinary.js";
import { disconnectMongo } from "./config/mongo.js";
import logger from "./config/logger.js";
import { seedDefaultCommunities } from "./services/community.service.js";

const requiredEnv = ["JWT_SECRET", "MONGODB_URI"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}. Copy server/.env.example to server/.env and configure them.`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must contain at least 32 characters.");
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT || 4000);
const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(here, "../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const clientOriginEnv = process.env.CLIENT_ORIGIN?.trim();
const allowedOrigins = clientOriginEnv
  ? clientOriginEnv.split(",").map((origin) => origin.trim().replace(/\/+$/, ""))
  : ["http://localhost:5173"];

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ""))) return callback(null, true);
    const error = new Error(`CORS origin not allowed: ${origin}`);
    error.status = 403;
    error.code = "CORS_ORIGIN_DENIED";
    return callback(error);
  },
  credentials: true
}));

// Cookie-based sessions are protected with SameSite cookies and an Origin check
// for state-changing browser requests. Requests from non-browser clients that do not send an Origin header remain supported.
app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  const normalizedOrigin = origin.replace(/\/+$/, "");
  if (!allowedOrigins.includes(normalizedOrigin)) {
    return res.status(403).json({
      success: false,
      error: { code: "CSRF_ORIGIN_DENIED", message: "This request origin is not allowed." }
    });
  }
  return next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/uploads", express.static(uploadsDir, { maxAge: "1h", immutable: false }));
app.use(morgan("combined", {
  stream: { write: (message) => logger.info(message.trim(), { source: "http" }) }
}));

// Versioned API is the canonical integration base. /api remains a temporary
// compatibility alias for deployed previews that use the original frontend.
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1", moderationRoutes);
app.use("/api/v1", postsRoutes);
app.use("/api/v1", messagesRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/v1", legacyRoutes);
app.use("/api", legacyRoutes);

app.get(["/api/v1/health", "/api/health"], (_req, res) => {
  res.json({
    success: true,
    app: "Unfold",
    version: "2.2.0-posts-foundation",
    status: isMongoReady() ? "ok" : "degraded",
    services: {
      mongodb: isMongoReady() ? "connected" : "disconnected",
      postgresql: postgresPool ? "connected" : "not-configured",
      redis: redisClient?.isReady ? "connected" : "not-configured",
      cloudinary: isCloudinaryConfigured() ? "configured" : "not-configured"
    },
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "API endpoint not found." } });
});

app.use((error, _req, res, _next) => {
  if (error?.code === 11000) {
    return res.status(409).json({ success: false, error: { code: "DUPLICATE_VALUE", message: "That value is already in use." } });
  }
  if (error?.name === "ValidationError") {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Please check the submitted information." } });
  }
  if (error?.name === "MulterError") {
    return res.status(400).json({ success: false, error: { code: "UPLOAD_ERROR", message: error.message } });
  }
  const status = Number(error?.status) || 500;
  const code = error?.code || "INTERNAL_ERROR";
  if (status >= 500) logger.error("Unhandled request error", { message: error?.message, stack: error?.stack });
  return res.status(status).json({
    success: false,
    error: { code, message: status >= 500 ? "Unexpected server error." : error.message }
  });
});

async function shutdown(signal) {
  logger.info("Shutting down Unfold API", { signal });
  await Promise.allSettled([closeRedis(), closePostgres(), disconnectMongo()]);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function start() {
  try {
    await connectMongo();
    await seedDefaultCommunities();
    await initialisePostgres();
    await connectRedis();
    configureCloudinary();

    const httpServer = http.createServer(app);
    setupSocketIO(httpServer, allowedOrigins);

    httpServer.listen(port, () => logger.info(`Unfold API listening at http://localhost:${port}`));
  } catch (error) {
    logger.error("Unfold API startup failed", { message: error.message, stack: error.stack });
    process.exit(1);
  }
}

start();
