import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema({
  communityId: { type: mongoose.Schema.Types.ObjectId, ref: "Community", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["owner", "moderator", "member"], default: "member" },
  status: { type: String, enum: ["active", "left"], default: "active" },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });

membershipSchema.index({ communityId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, status: 1 });

const Membership = mongoose.models.Membership || mongoose.model("Membership", membershipSchema);
export default Membership;
