import mongoose from "mongoose";

const projectDiscussionSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
    index: true
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  title: {
    type: String,
    required: [true, "Discussion title is required."],
    trim: true,
    minlength: 3,
    maxlength: 150
  },
  content: {
    type: String,
    required: [true, "Discussion content is required."],
    trim: true,
    maxlength: 4000
  },
  pinned: {
    type: Boolean,
    default: false
  },
  replyCount: {
    type: Number,
    default: 0
  },
  lastReplyAt: {
    type: Date,
    default: null
  }
}, { timestamps: true, versionKey: false });

projectDiscussionSchema.index({ projectId: 1, pinned: -1, createdAt: -1 });

const ProjectDiscussion = mongoose.models.ProjectDiscussion || mongoose.model("ProjectDiscussion", projectDiscussionSchema);
export default ProjectDiscussion;
