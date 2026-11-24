import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
  parentCommentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
  deletedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ authorId: 1, createdAt: -1 });

const Comment = mongoose.models.Comment || mongoose.model("Comment", commentSchema);
export default Comment;
