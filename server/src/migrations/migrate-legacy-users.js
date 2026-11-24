import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectMongo, disconnectMongo } from "../config/mongo.js";
import User from "../models/User.js";
import logger from "../config/logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "../..");
const candidates = [
  process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR, "store.json") : path.join(serverRoot, "src/data/files/store.json"),
  path.join(serverRoot, "src/data/seed-store.json")
];

async function readUsers(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  await connectMongo();

  const allUsers = [];
  for (const filePath of candidates) allUsers.push(...await readUsers(filePath));

  let migrated = 0;
  let skipped = 0;
  for (const legacy of allUsers) {
    if (!legacy?.id || !legacy?.username || !legacy?.passwordHash) {
      skipped += 1;
      continue;
    }
    const exists = await User.findOne({ $or: [{ legacyId: String(legacy.id) }, { username: String(legacy.username).toLowerCase() }] }).select("+legacyId");
    if (exists) {
      skipped += 1;
      continue;
    }

    // Existing bcrypt hashes remain valid; passwords are not read or re-hashed.
    await User.create({
      username: String(legacy.username).toLowerCase(),
      passwordHash: legacy.passwordHash,
      displayName: legacy.displayName || "",
      bio: legacy.bio || "",
      legacyId: String(legacy.id),
      createdAt: legacy.createdAt ? new Date(legacy.createdAt) : new Date()
    });
    migrated += 1;
  }

  logger.info("Legacy user migration completed", { migrated, skipped });
}

main()
  .catch((error) => {
    logger.error("Legacy user migration failed", { message: error.message, stack: error.stack });
    process.exitCode = 1;
  })
  .finally(async () => disconnectMongo());
