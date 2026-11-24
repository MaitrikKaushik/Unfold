import mongoose from "mongoose";

const mediaAssetSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  url: { type: String, required: true },
  publicId: { type: String, required: true, unique: true },
  mediaType: { type: String, enum: ["image", "audio", "video"], required: true },
  resourceType: { type: String, enum: ["image", "video", "raw"], default: "image" },
  format: { type: String, default: "" },
  bytes: { type: Number, default: 0, min: 0 },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  status: { type: String, enum: ["uploaded", "attached", "deleted"], default: "uploaded" },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
  attachedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

mediaAssetSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
mediaAssetSchema.index({ postId: 1 });

const MediaAsset = mongoose.models.MediaAsset || mongoose.model("MediaAsset", mediaAssetSchema);
export default MediaAsset;
