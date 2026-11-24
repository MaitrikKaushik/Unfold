import mongoose from "mongoose";

const avatarSchema = new mongoose.Schema({
  url: { type: String, default: "" },
  publicId: { type: String, default: "" }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    lowercase: true,
    trim: true,
    minlength: 8,
    maxlength: 32,
    match: /^[a-z0-9_]{3,32}$/
  },
  passwordHash: { type: String, required: true, select: false },
  displayName: { type: String, trim: true, maxlength: 40, default: "" },
  bio: { type: String, trim: true, maxlength: 250, default: "" },
  avatar: { type: avatarSchema, default: () => ({}) },
  role: { type: String, enum: ["user", "moderator", "admin"], default: "user" },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  tokenVersion: { type: Number, default: 0 },
  legacyId: { type: String, default: undefined, select: false },
  stats: {
    followers: { type: Number, default: 0, min: 0 },
    following: { type: Number, default: 0, min: 0 },
    publishedPosts: { type: Number, default: 0, min: 0 }
  }
}, { timestamps: true, versionKey: false });

userSchema.index({ displayName: "text", username: "text" });
userSchema.index({ legacyId: 1 }, { unique: true, sparse: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
