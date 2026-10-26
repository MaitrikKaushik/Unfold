import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "files");
const storePath = path.join(dataDir, "store.json");

const initial = () => ({
  users: [],
  communities: [
    { id: "technology", name: "Technology", description: "Technology, products, and ideas." },
    { id: "programming", name: "Programming", description: "Code, tools, and software engineering." },
    { id: "gaming", name: "Gaming", description: "Games, studios, and gaming culture." }
  ],
  memberships: [],
  posts: [],
  votes: []
});

export async function readStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    return JSON.parse(await fs.readFile(storePath, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    const data = initial();
    await writeStore(data);
    return data;
  }
}

export async function writeStore(data) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = `${storePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temp, storePath);
}

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
