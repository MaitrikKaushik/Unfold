import "dotenv/config";
import { connectMongo, disconnectMongo } from "../config/mongo.js";
import User from "../models/User.js";

const [usernameArg, roleArg] = process.argv.slice(2);
const allowedRoles = new Set(["user", "moderator", "admin"]);

async function main() {
  const username = String(usernameArg || "").trim().toLowerCase();
  const role = String(roleArg || "").trim().toLowerCase();
  if (!username || !allowedRoles.has(role)) {
    throw new Error("Usage: npm run set-role -- <username> <user|moderator|admin>");
  }
  await connectMongo();
  const user = await User.findOneAndUpdate({ username }, { $set: { role } }, { new: true });
  if (!user) throw new Error(`No Unfold account found for @${username}.`);
  console.log(`Updated @${user.username} role to ${user.role}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => disconnectMongo());
