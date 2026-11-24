import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { postgresPool } from "../../config/postgres.js";
import { asyncRoute } from "../../utils/http.js";

const router = express.Router();
const TARGET_TYPES = new Set(["post", "comment", "user"]);
const REPORT_REASONS = new Set(["spam", "harassment", "hate", "misinformation", "impersonation", "other"]);
const REPORT_STATUSES = new Set(["open", "reviewing", "resolved", "dismissed"]);

function requirePostgres(res) {
  if (postgresPool) return true;
  res.status(503).json({
    success: false,
    error: { code: "POSTGRES_NOT_CONFIGURED", message: "PostgreSQL is not configured. Set DATABASE_URL to enable moderation reporting." }
  });
  return false;
}

router.post("/reports", requireAuth, asyncRoute(async (req, res) => {
  if (!requirePostgres(res)) return;
  const targetType = String(req.body?.targetType || "").trim().toLowerCase();
  const targetId = String(req.body?.targetId || "").trim();
  const reason = String(req.body?.reason || "").trim().toLowerCase();
  const details = String(req.body?.details || "").trim();

  if (!TARGET_TYPES.has(targetType) || !targetId || targetId.length > 100) {
    return res.status(400).json({ success: false, error: { code: "INVALID_REPORT_TARGET", message: "Provide a valid target type and target ID." } });
  }
  if (!REPORT_REASONS.has(reason)) {
    return res.status(400).json({ success: false, error: { code: "INVALID_REPORT_REASON", message: "Choose a valid report reason." } });
  }
  if (details.length > 2000) {
    return res.status(400).json({ success: false, error: { code: "REPORT_DETAILS_TOO_LONG", message: "Report details must be 2,000 characters or fewer." } });
  }

  const result = await postgresPool.query(
    `INSERT INTO reports (reporter_user_id, target_type, target_id, reason, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, target_type, target_id, reason, details, status, created_at`,
    [req.user.id, targetType, targetId, reason, details || null]
  );

  return res.status(201).json({ success: true, message: "Report submitted for review.", data: { report: result.rows[0] } });
}));

router.get("/admin/reports", requireAuth, requireRole("moderator", "admin"), asyncRoute(async (req, res) => {
  if (!requirePostgres(res)) return;
  const status = req.query.status ? String(req.query.status) : "open";
  if (!REPORT_STATUSES.has(status)) {
    return res.status(400).json({ success: false, error: { code: "INVALID_REPORT_STATUS", message: "Invalid report status filter." } });
  }
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || "20", 10) || 20));
  const beforeId = req.query.before ? Number.parseInt(req.query.before, 10) : null;
  const result = await postgresPool.query(
    `SELECT id, reporter_user_id, target_type, target_id, reason, details, status, created_at, updated_at
       FROM reports
      WHERE status = $1 AND ($2::bigint IS NULL OR id < $2)
      ORDER BY id DESC
      LIMIT $3`,
    [status, Number.isSafeInteger(beforeId) ? beforeId : null, limit]
  );
  const rows = result.rows;
  return res.json({
    success: true,
    data: {
      reports: rows,
      nextCursor: rows.length === limit ? String(rows[rows.length - 1].id) : null
    }
  });
}));

router.patch("/admin/reports/:id", requireAuth, requireRole("moderator", "admin"), asyncRoute(async (req, res) => {
  if (!requirePostgres(res)) return;
  const reportId = Number.parseInt(req.params.id, 10);
  const status = String(req.body?.status || "").trim().toLowerCase();
  const notes = String(req.body?.notes || "").trim();
  if (!Number.isSafeInteger(reportId) || reportId < 1 || !REPORT_STATUSES.has(status) || status === "open") {
    return res.status(400).json({ success: false, error: { code: "INVALID_MODERATION_UPDATE", message: "Provide a valid report ID and a new status: reviewing, resolved or dismissed." } });
  }
  if (notes.length > 2000) {
    return res.status(400).json({ success: false, error: { code: "MODERATION_NOTES_TOO_LONG", message: "Moderation notes must be 2,000 characters or fewer." } });
  }

  const client = await postgresPool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE reports SET status = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, reporter_user_id, target_type, target_id, reason, details, status, created_at, updated_at`,
      [status, reportId]
    );
    if (updated.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: { code: "REPORT_NOT_FOUND", message: "Report not found." } });
    }
    const report = updated.rows[0];
    await client.query(
      `INSERT INTO moderation_actions (report_id, moderator_user_id, action, target_type, target_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [report.id, req.user.id, status, report.target_type, report.target_id, notes || null]
    );
    await client.query("COMMIT");
    return res.json({ success: true, message: "Moderation decision saved.", data: { report } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

export default router;
