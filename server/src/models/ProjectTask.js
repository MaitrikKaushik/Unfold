import mongoose from "mongoose";

const projectTaskSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, "Task title is required."],
    trim: true,
    minlength: 2,
    maxlength: 150
  },
  description: {
    type: String,
    trim: true,
    maxlength: 3000,
    default: ""
  },
  status: {
    type: String,
    enum: ["backlog", "todo", "in_progress", "in_review", "completed"],
    default: "todo",
    index: true
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
    index: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  startDate: {
    type: Date,
    default: null
  },
  dueDate: {
    type: Date,
    default: null,
    index: true
  },
  labels: {
    type: [String],
    default: []
  },
  order: {
    type: Number,
    default: 0
  },
  completedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true, versionKey: false });

projectTaskSchema.index({ projectId: 1, status: 1, order: 1 });
projectTaskSchema.index({ projectId: 1, dueDate: 1 });
projectTaskSchema.index({ projectId: 1, assignedTo: 1 });

const ProjectTask = mongoose.models.ProjectTask || mongoose.model("ProjectTask", projectTaskSchema);
export default ProjectTask;
