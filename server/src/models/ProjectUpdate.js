import mongoose from "mongoose";

const projectUpdateSchema = new mongoose.Schema({
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
    required: [true, "Update title is required."],
    trim: true,
    minlength: 3,
    maxlength: 150
  },
  content: {
    type: String,
    required: [true, "Update content is required."],
    trim: true,
    maxlength: 5000
  },
  category: {
    type: String,
    enum: ["milestone", "announcement", "release", "general"],
    default: "general"
  }
}, { timestamps: true, versionKey: false });

projectUpdateSchema.index({ projectId: 1, createdAt: -1 });

const ProjectUpdate = mongoose.models.ProjectUpdate || mongoose.model("ProjectUpdate", projectUpdateSchema);
export default ProjectUpdate;
