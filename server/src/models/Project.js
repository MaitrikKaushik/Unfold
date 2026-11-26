import mongoose from "mongoose";

const objectiveSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true, trim: true, maxlength: 200 },
  completed: { type: Boolean, default: false }
}, { _id: false });

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Project title is required."],
    trim: true,
    minlength: [3, "Project title must be at least 3 characters."],
    maxlength: [120, "Project title cannot exceed 120 characters."]
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  shortDescription: {
    type: String,
    required: [true, "Short description is required."],
    trim: true,
    maxlength: [250, "Short description cannot exceed 250 characters."]
  },
  description: {
    type: String,
    default: "",
    trim: true,
    maxlength: [5000, "Detailed description cannot exceed 5000 characters."]
  },
  category: {
    type: String,
    required: [true, "Category is required."],
    enum: [
      "Technology",
      "Software Development",
      "Research",
      "Education",
      "Design",
      "Business",
      "Social Impact",
      "Other"
    ],
    default: "Technology",
    index: true
  },
  coverImage: {
    type: String,
    default: null
  },
  visibility: {
    type: String,
    enum: ["public", "community", "private"],
    default: "public",
    index: true
  },
  status: {
    type: String,
    enum: ["active", "completed", "archived"],
    default: "active",
    index: true
  },
  objectives: {
    type: [objectiveSchema],
    default: []
  },
  expectedCompletionDate: {
    type: Date,
    default: null
  },
  requiredSkills: {
    type: [String],
    default: [],
    index: true
  },
  maxCollaborators: {
    type: Number,
    default: 10,
    min: [1, "Max collaborators must be at least 1."],
    max: [100, "Max collaborators cannot exceed 100."]
  },
  communityId: {
    type: String,
    default: null,
    index: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  allowJoinRequests: {
    type: Boolean,
    default: true
  },
  stats: {
    memberCount: { type: Number, default: 1, min: 0 },
    taskCount: { type: Number, default: 0, min: 0 },
    completedTaskCount: { type: Number, default: 0, min: 0 },
    progress: { type: Number, default: 0, min: 0, max: 100 }
  },
  archivedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true, versionKey: false });

projectSchema.index({ title: "text", shortDescription: "text", description: "text" });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ "stats.progress": 1 });

const Project = mongoose.models.Project || mongoose.model("Project", projectSchema);
export default Project;
