import mongoose from "mongoose";

const projectInvitationSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
    index: true
  },
  inviterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  inviteeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ["admin", "collaborator", "viewer"],
    default: "collaborator"
  },
  type: {
    type: String,
    enum: ["invitation", "join_request"],
    default: "invitation",
    index: true
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "canceled"],
    default: "pending",
    index: true
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ""
  },
  respondedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true, versionKey: false });

projectInvitationSchema.index({ projectId: 1, inviteeId: 1, type: 1, status: 1 });
projectInvitationSchema.index({ inviteeId: 1, status: 1 });
projectInvitationSchema.index({ createdAt: -1 });

const ProjectInvitation = mongoose.models.ProjectInvitation || mongoose.model("ProjectInvitation", projectInvitationSchema);
export default ProjectInvitation;
