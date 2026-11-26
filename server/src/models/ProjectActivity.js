import mongoose from "mongoose";

const projectActivitySchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
    index: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      "project_created",
      "project_updated",
      "project_archived",
      "project_unarchived",
      "member_invited",
      "invitation_accepted",
      "invitation_rejected",
      "join_requested",
      "join_approved",
      "join_rejected",
      "member_role_changed",
      "member_removed",
      "task_created",
      "task_updated",
      "task_assigned",
      "task_status_changed",
      "task_completed",
      "task_deleted",
      "discussion_created",
      "comment_added",
      "project_update_posted"
    ]
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  idempotencyKey: {
    type: String,
    sparse: true,
    index: true
  }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

projectActivitySchema.index({ projectId: 1, createdAt: -1 });

const ProjectActivity = mongoose.models.ProjectActivity || mongoose.model("ProjectActivity", projectActivitySchema);
export default ProjectActivity;
