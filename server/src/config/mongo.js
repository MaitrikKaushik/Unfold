import mongoose from "mongoose";
import logger from "./logger.js";

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required. Configure MongoDB Atlas or a local MongoDB instance.");

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000)
  });
  logger.info("MongoDB connected", { database: mongoose.connection.name });
  return mongoose.connection;
}

export function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

export async function disconnectMongo() {
  if (isMongoReady()) await mongoose.disconnect();
}

export async function getPublicUsersForLegacyFeed() {
  const { default: User } = await import("../models/User.js");
  const users = await User.find({ status: { $ne: "suspended" } })
    .select("username displayName bio createdAt legacyId")
    .lean();
  return users.map((user) => ({
    id: user.legacyId || String(user._id),
    mongoId: String(user._id),
    username: user.username,
    displayName: user.displayName || "",
    bio: user.bio || "",
    createdAt: user.createdAt
  }));
}
