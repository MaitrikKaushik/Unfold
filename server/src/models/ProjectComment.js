import mongoose from "mongoose";

const projectCommentSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
    index: true
  },
  targetType: {
    type: String,
    enum: ["task", "discussion"],
    required: true,
    index: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  content: {
    type: String,
    required: [true, "Comment content is required."],
    trim: true,
    maxlength: 2000
  },
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }]
}, { timestamps: true, versionKey: false });

projectCommentSchema.index({ targetId: 1, createdAt: 1 });

const ProjectComment = mongoose.models.ProjectComment || mongoose.model("ProjectComment", projectCommentSchema);
export default ProjectComment;
