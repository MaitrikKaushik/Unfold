import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import routes from "./routes.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
  console.error("Set JWT_SECRET in server/.env to a random secret of at least 24 characters.");
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT || 4000);
const here = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(here, "../uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Robust CORS configuration:
// Handles trailing slashes, multiple domains, and echoes exact request Origin
const clientOriginEnv = process.env.CLIENT_ORIGIN?.trim();
const allowedOrigins = clientOriginEnv && clientOriginEnv !== "*"
  ? clientOriginEnv.split(",").map((o) => o.trim().replace(/\/+$/, ""))
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. curl, server-to-server)
      if (!origin) return callback(null, true);
      // If wildcard or no restricted origin configured, allow all
      if (!allowedOrigins) return callback(null, true);

      const cleanOrigin = origin.replace(/\/+$/, "");
      if (allowedOrigins.some((o) => o === cleanOrigin)) {
        return callback(null, true);
      }
      // Allow local development ports
      if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "100kb" }));
app.use("/uploads", express.static(uploadsDir));

// Health check endpoint
app.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    app: "Unfold",
    persistence: process.env.DATA_DIR ? "persistent-disk" : "local-json",
    uptime: Math.floor(process.uptime())
  })
);

// REST API routes
app.use("/api", routes);

// 404 handler for undefined API routes
app.use("/api/*", (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "API endpoint not found." } });
});

// Serve frontend static build if present (e.g. unified deployment)
const clientDist = path.resolve(here, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } });
});

app.listen(port, () => console.log(`Unfold API listening at http://localhost:${port}`));
