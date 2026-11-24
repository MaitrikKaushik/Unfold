import pg from "pg";
import logger from "./logger.js";

const { Pool } = pg;
export let postgresPool = null;

export async function initialisePostgres() {
  if (!process.env.DATABASE_URL) {
    logger.warn("PostgreSQL is not configured yet; moderation endpoints will remain unavailable.");
    return null;
  }

  postgresPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 5),
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
  });

  await postgresPool.query("SELECT 1");
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id BIGSERIAL PRIMARY KEY,
      reporter_user_id VARCHAR(64) NOT NULL,
      target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
      target_id VARCHAR(64) NOT NULL,
      reason VARCHAR(80) NOT NULL,
      details TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS reports_status_created_idx ON reports (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_type, target_id);

    CREATE TABLE IF NOT EXISTS moderation_actions (
      id BIGSERIAL PRIMARY KEY,
      report_id BIGINT REFERENCES reports(id) ON DELETE SET NULL,
      moderator_user_id VARCHAR(64) NOT NULL,
      action VARCHAR(30) NOT NULL,
      target_type VARCHAR(20) NOT NULL,
      target_id VARCHAR(64) NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS moderation_actions_target_idx ON moderation_actions (target_type, target_id, created_at DESC);
  `);

  logger.info("PostgreSQL connected and moderation schema checked");
  return postgresPool;
}

export async function closePostgres() {
  if (postgresPool) {
    await postgresPool.end();
    postgresPool = null;
  }
}
