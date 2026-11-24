import mongoose from "mongoose";

const assetSchema = new mongoose.Schema({
  url: { type: String, default: "" },
  publicId: { type: String, default: "" }
}, { _id: false });

const communitySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 48 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: "", trim: true, maxlength: 300 },
  cover: { type: assetSchema, default: () => ({}) },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  visibility: { type: String, enum: ["public"], default: "public" },
  memberCount: { type: Number, default: 0, min: 0 },
  isSystem: { type: Boolean, default: false }
}, { timestamps: true, versionKey: false });

communitySchema.index({ createdAt: -1 });
communitySchema.index({ memberCount: -1 });

const Community = mongoose.models.Community || mongoose.model("Community", communitySchema);
export default Community;
