import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }],
  lastMessage: {
    content: { type: String, default: "", maxlength: 2000 },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now }
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  unreadCounts: {
    type: Map,
    of: Number,
    default: () => new Map()
  }
}, { timestamps: true, versionKey: false });

conversationSchema.index({ participants: 1 });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
export default Conversation;
