import mongoose from "mongoose";

const voteSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  value: { type: String, enum: ["up", "down"], required: true }
}, { timestamps: true, versionKey: false });

voteSchema.index({ postId: 1, userId: 1 }, { unique: true });
voteSchema.index({ postId: 1, value: 1 });
voteSchema.index({ userId: 1, createdAt: -1 });

const Vote = mongoose.models.Vote || mongoose.model("Vote", voteSchema);
export default Vote;
