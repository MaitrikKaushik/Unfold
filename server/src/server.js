import "dotenv/config";
import express from "express";
import cors from "cors";
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

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));
app.use("/uploads", express.static(path.resolve(here, "../uploads")));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", routes);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } });
});
app.listen(port, () => console.log(`CommonGround API listening at http://localhost:${port}`));
