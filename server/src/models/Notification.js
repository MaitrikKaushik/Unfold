import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      "project_invitation",
      "invitation_accepted",
      "invitation_rejected",
      "join_request",
      "join_request_approved",
      "join_request_rejected",
      "task_assigned",
      "task_status_changed",
      "task_comment",
      "task_mention",
      "project_update"
    ]
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    default: null
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProjectTask",
    default: null
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  link: {
    type: String,
    default: ""
  }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
