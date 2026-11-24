import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { getPublicUsersForLegacyFeed, isMongoReady } from "../config/mongo.js";
import logger from "../config/logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// Configurable data directory: defaults to src/data/files, or an external persistent volume (e.g. /var/data)
export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(here, "files");

export const storePath = path.join(dataDir, "store.json");
export const backupPath = path.join(dataDir, "store.backup.json");
const seedPath = path.join(here, "seed-store.json");

export const defaultCommunities = [
  { id: "technology", name: "Technology", description: "Technology, products, and ideas." },
  { id: "programming", name: "Programming", description: "Code, tools, and software engineering." },
  { id: "gaming", name: "Gaming", description: "Games, studios, and gaming culture." }
];

const initial = () => ({
  users: [],
  communities: defaultCommunities,
  memberships: [],
  posts: [],
  votes: [],
  comments: []
});

function sanitizeStore(data) {
  if (!data || typeof data !== "object") return initial();
  data.users = Array.isArray(data.users) ? data.users : [];
  data.communities = Array.isArray(data.communities) && data.communities.length > 0 ? data.communities : defaultCommunities;
  data.memberships = Array.isArray(data.memberships) ? data.memberships : [];
  data.posts = Array.isArray(data.posts) ? data.posts : [];
  data.votes = Array.isArray(data.votes) ? data.votes : [];
  data.comments = Array.isArray(data.comments) ? data.comments : [];
  return data;
}

async function attachMongoUsers(data) {
  const sanitized = sanitizeStore(data);
  if (!isMongoReady()) return sanitized;

  const byId = new Map();
  for (const user of sanitized.users) {
    byId.set(user.id, {
      id: user.id,
      username: user.username,
      displayName: user.displayName || "",
      bio: user.bio || "",
      createdAt: user.createdAt
    });
  }
  const mongoUsers = await getPublicUsersForLegacyFeed();
  for (const user of mongoUsers) byId.set(user.id, user);
  return { ...sanitized, users: [...byId.values()] };
}

export async function readStore() {
  await fs.mkdir(dataDir, { recursive: true });

  // 1. Try reading the active store.json
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const data = JSON.parse(raw);
    return attachMongoUsers(data);
  } catch (err) {
    if (err.code !== "ENOENT") {
      // If store.json is corrupted, attempt recovery from backup
      try {
        logger.warn("Legacy store read failed; attempting backup recovery", { message: err.message });
        const backupRaw = await fs.readFile(backupPath, "utf8");
        const recovered = sanitizeStore(JSON.parse(backupRaw));
        await writeStore(recovered);
        return attachMongoUsers(recovered);
      } catch {
        throw err;
      }
    }

    // 2. store.json does not exist yet. Check if DATA_JSON environment variable is provided
    if (process.env.DATA_JSON) {
      try {
        logger.info("Initializing legacy store from DATA_JSON environment variable.");
        const envData = sanitizeStore(JSON.parse(process.env.DATA_JSON));
        await writeStore(envData);
        return attachMongoUsers(envData);
      } catch (e) {
        logger.warn("Failed parsing DATA_JSON environment variable", { message: e.message });
      }
    }

    // 3. Check if seed template (seed-store.json) exists
    try {
      const seedRaw = await fs.readFile(seedPath, "utf8");
      const seedData = sanitizeStore(JSON.parse(seedRaw));
      await writeStore(seedData);
      return attachMongoUsers(seedData);
    } catch {
      // 4. Fallback to code defaults
      const data = initial();
      await writeStore(data);
      return attachMongoUsers(data);
    }
  }
}

export async function writeStore(data) {
  await fs.mkdir(dataDir, { recursive: true });
  const sanitized = sanitizeStore(data);
  // MongoDB owns accounts. JSON persists only the public legacy user fields needed
  // to render pre-migration content; never write emails or password hashes.
  const persisted = {
    ...sanitized,
    users: (sanitized.users || []).map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName || "",
      bio: user.bio || "",
      createdAt: user.createdAt
    }))
  };
  const payload = JSON.stringify(persisted, null, 2);

  // Atomic write to store.json
  const temp = `${storePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, payload, "utf8");
  await fs.rename(temp, storePath);

  // Keep a persistent backup copy for disaster recovery
  try {
    const backupTemp = `${backupPath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(backupTemp, payload, "utf8");
    await fs.rename(backupTemp, backupPath);
  } catch {
    // Non-fatal if backup fails
  }
}

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
