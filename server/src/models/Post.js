import mongoose from "mongoose";

const postMediaSchema = new mongoose.Schema({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: "MediaAsset", default: null },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  mediaType: { type: String, enum: ["image", "audio", "video"], required: true },
  resourceType: { type: String, enum: ["image", "video", "raw"], default: "image" },
  format: { type: String, default: "" },
  bytes: { type: Number, default: 0, min: 0 },
  width: { type: Number, default: null },
  height: { type: Number, default: null }
}, { _id: false });

const postSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  communityId: { type: mongoose.Schema.Types.ObjectId, ref: "Community", default: null },
  content: { type: String, default: "", trim: true, maxlength: 2000 },
  title: { type: String, default: null, trim: true, maxlength: 150 },
  category: { type: String, enum: ["Discussion", "Question", "Resource"], default: "Discussion" },
  link: { type: String, default: null, maxlength: 500 },
  media: { type: [postMediaSchema], default: [] },
  postType: { type: String, enum: ["text", "image", "audio", "video", "mixed"], default: "text" },
  status: { type: String, enum: ["pending", "published", "removed"], default: "published" },
  publishedAt: { type: Date, default: null },
  upvotesCount: { type: Number, default: 0, min: 0 },
  downvotesCount: { type: Number, default: 0, min: 0 },
  score: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true, versionKey: false });

postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ authorId: 1, publishedAt: -1, _id: -1 });
postSchema.index({ communityId: 1, status: 1, publishedAt: -1, _id: -1 });
postSchema.index({ status: 1, publishedAt: -1, _id: -1 });
postSchema.index(
  { authorId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_post_per_author" }
);

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
export default Post;
