import mongoose from "mongoose";

const projectMembershipSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ["owner", "admin", "collaborator", "viewer"],
    default: "collaborator",
    required: true
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
    index: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true, versionKey: false });

projectMembershipSchema.index({ projectId: 1, userId: 1 }, { unique: true });
projectMembershipSchema.index({ userId: 1, status: 1 });

const ProjectMembership = mongoose.models.ProjectMembership || mongoose.model("ProjectMembership", projectMembershipSchema);
export default ProjectMembership;
