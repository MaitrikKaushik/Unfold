import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAuth, optionalAuth } from "../../middleware/auth.js";
import { requireProjectAccess, requireProjectRole } from "./projects.middleware.js";
import * as projectService from "./projects.service.js";
import logger from "../../config/logger.js";

const router = express.Router();

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(here, "../../../uploads");

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Only JPG, PNG, WEBP, and GIF images are allowed."), allowed.includes(file.mimetype));
  }
});

// Helper for standard JSON responses
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, ...data });
}

function sendError(res, err, defaultStatus = 400) {
  const status = Number(err?.status) || defaultStatus;
  const code = err?.code || "PROJECT_ERROR";
  return res.status(status).json({
    success: false,
    error: { code, message: err?.message || "An error occurred." }
  });
}

// -------------------------------------------------------------
// 1. PROJECT DISCOVERY & LISTING
// -------------------------------------------------------------

// Discover public projects with search and filters
router.get("/projects/discover", optionalAuth, async (req, res) => {
  try {
    const { search, category, skill, status, sort, page, limit } = req.query;
    const result = await projectService.discoverProjects({
      search,
      category,
      skill,
      status,
      sort,
      page,
      limit
    });
    return sendSuccess(res, result);
  } catch (err) {
    logger.error("Discover projects failed", { error: err.message });
    return sendError(res, err, 500);
  }
});

// List user's active projects (Owner, Admin, Collaborator, Viewer)
router.get("/projects/my", requireAuth, async (req, res) => {
  try {
    const status = req.query.status || "active";
    const projects = await projectService.listMyProjects(req.user._id, { status });
    return sendSuccess(res, { projects });
  } catch (err) {
    logger.error("List my projects failed", { error: err.message });
    return sendError(res, err, 500);
  }
});

// List user's archived projects
router.get("/projects/archived", requireAuth, async (req, res) => {
  try {
    const projects = await projectService.listMyProjects(req.user._id, { status: "archived" });
    return sendSuccess(res, { projects });
  } catch (err) {
    logger.error("List archived projects failed", { error: err.message });
    return sendError(res, err, 500);
  }
});

// -------------------------------------------------------------
// 2. PROJECT CREATION & CRUD
// -------------------------------------------------------------

router.post("/projects", requireAuth, upload.single("coverImage"), async (req, res) => {
  try {
    const {
      title,
      shortDescription,
      description,
      category,
      visibility,
      objectives,
      expectedCompletionDate,
      requiredSkills,
      maxCollaborators,
      communityId
    } = req.body;

    if (!title || !title.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Project title is required." });
    }
    if (!shortDescription || !shortDescription.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Short description is required." });
    }

    let parsedObjectives = [];
    if (objectives) {
      try {
        parsedObjectives = typeof objectives === "string" ? JSON.parse(objectives) : objectives;
      } catch {
        parsedObjectives = typeof objectives === "string" ? objectives.split("\n").filter(Boolean) : [];
      }
    }

    let parsedSkills = [];
    if (requiredSkills) {
      try {
        parsedSkills = typeof requiredSkills === "string" ? JSON.parse(requiredSkills) : requiredSkills;
      } catch {
        parsedSkills = typeof requiredSkills === "string" ? requiredSkills.split(",").map((s) => s.trim()).filter(Boolean) : [];
      }
    }

    const coverImageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.coverImageUrl || null;

    const project = await projectService.createProject({
      title,
      shortDescription,
      description,
      category,
      coverImage: coverImageUrl,
      visibility,
      objectives: parsedObjectives,
      expectedCompletionDate,
      requiredSkills: parsedSkills,
      maxCollaborators,
      communityId,
      ownerId: req.user._id
    });

    return sendSuccess(res, { project, message: "Project created successfully." }, 201);
  } catch (err) {
    logger.error("Create project failed", { error: err.message });
    return sendError(res, err);
  }
});

// Get Project Workspace Details
router.get("/projects/:id", optionalAuth, requireProjectAccess, async (req, res) => {
  try {
    const workspace = await projectService.getProjectWorkspace(req.project._id, req.user?._id || null);
    return sendSuccess(res, { project: workspace });
  } catch (err) {
    logger.error("Get project workspace failed", { error: err.message });
    return sendError(res, err, 500);
  }
});

// Update Project (Owner or Admin)
router.patch("/projects/:id", requireAuth, requireProjectAccess, requireProjectRole("admin"), upload.single("coverImage"), async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (req.file) {
      updateData.coverImage = `/uploads/${req.file.filename}`;
    }

    if (updateData.objectives && typeof updateData.objectives === "string") {
      try {
        updateData.objectives = JSON.parse(updateData.objectives);
      } catch {}
    }

    if (updateData.requiredSkills && typeof updateData.requiredSkills === "string") {
      try {
        updateData.requiredSkills = JSON.parse(updateData.requiredSkills);
      } catch {
        updateData.requiredSkills = updateData.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    const updated = await projectService.updateProject(req.project._id, req.user._id, updateData);
    return sendSuccess(res, { project: updated, message: "Project updated successfully." });
  } catch (err) {
    return sendError(res, err);
  }
});

// Archive Project (Owner only)
router.post("/projects/:id/archive", requireAuth, requireProjectAccess, requireProjectRole("owner"), async (req, res) => {
  try {
    const project = await projectService.archiveProject(req.project._id, req.user._id);
    return sendSuccess(res, { project, message: "Project archived successfully." });
  } catch (err) {
    return sendError(res, err);
  }
});

// Unarchive Project (Owner only)
router.post("/projects/:id/unarchive", requireAuth, requireProjectAccess, requireProjectRole("owner"), async (req, res) => {
  try {
    const project = await projectService.unarchiveProject(req.project._id, req.user._id);
    return sendSuccess(res, { project, message: "Project restored to active state." });
  } catch (err) {
    return sendError(res, err);
  }
});

// Delete Project (Owner only)
router.delete("/projects/:id", requireAuth, requireProjectAccess, requireProjectRole("owner"), async (req, res) => {
  try {
    const result = await projectService.deleteProject(req.project._id, req.user._id);
    return sendSuccess(res, { ...result, message: "Project deleted successfully." });
  } catch (err) {
    return sendError(res, err);
  }
});

// -------------------------------------------------------------
// 3. COLLABORATION & INVITATIONS
// -------------------------------------------------------------

// List user's received invitations & join requests
router.get("/projects/invitations/my", requireAuth, async (req, res) => {
  try {
    const result = await projectService.listUserInvitations(req.user._id);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, err, 500);
  }
});

// Respond to an invitation (accept or reject)
router.post("/projects/invitations/:invitationId/respond", requireAuth, async (req, res) => {
  try {
    const { action } = req.body; // "accept" | "reject"
    if (!["accept", "reject"].includes(action)) {
      return sendError(res, { code: "INVALID_ACTION", message: "Action must be 'accept' or 'reject'." });
    }
    const result = await projectService.respondToInvitation(req.params.invitationId, req.user._id, action);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, err);
  }
});

// List project members
router.get("/projects/:id/members", optionalAuth, requireProjectAccess, async (req, res) => {
  try {
    const members = await projectService.listProjectMembers(req.project._id);
    return sendSuccess(res, { members });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

// Invite a user to project (Owner or Admin)
router.post("/projects/:id/invite", requireAuth, requireProjectAccess, requireProjectRole("admin"), async (req, res) => {
  try {
    const { username, role = "collaborator", message = "" } = req.body;
    if (!username || !username.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Username is required." });
    }
    const invitation = await projectService.inviteUser(req.project._id, req.user._id, username, role, message);
    return sendSuccess(res, { invitation, message: `Invitation sent to @${username}.` }, 201);
  } catch (err) {
    return sendError(res, err);
  }
});

// List pending invitations for project (Owner or Admin)
router.get("/projects/:id/invitations", requireAuth, requireProjectAccess, requireProjectRole("admin"), async (req, res) => {
  try {
    const invitations = await projectService.listProjectInvitations(req.project._id);
    return sendSuccess(res, { invitations });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

// Request to join project (Logged-in user)
router.post("/projects/:id/join-request", requireAuth, async (req, res) => {
  try {
    const { message = "" } = req.body;
    const joinRequest = await projectService.requestToJoinProject(req.params.id, req.user._id, message);
    return sendSuccess(res, { joinRequest, message: "Your application to join has been submitted." }, 201);
  } catch (err) {
    return sendError(res, err);
  }
});

// Approve or reject join request (Owner or Admin)
router.post("/projects/:id/join-request/:invitationId/respond", requireAuth, requireProjectAccess, requireProjectRole("admin"), async (req, res) => {
  try {
    const { action } = req.body; // "approve" | "reject"
    if (!["approve", "reject"].includes(action)) {
      return sendError(res, { code: "INVALID_ACTION", message: "Action must be 'approve' or 'reject'." });
    }
    const result = await projectService.respondToJoinRequest(req.params.invitationId, req.user._id, action);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, err);
  }
});

// Withdraw join request (Applicant)
router.post("/projects/join-requests/:invitationId/withdraw", requireAuth, async (req, res) => {
  try {
    const result = await projectService.withdrawJoinRequest(req.params.invitationId, req.user._id);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, err);
  }
});

// Update member role (Owner only)
router.patch("/projects/:id/members/:userId/role", requireAuth, requireProjectAccess, requireProjectRole("owner"), async (req, res) => {
  try {
    const { role } = req.body;
    const updated = await projectService.updateMemberRole(req.project._id, req.params.userId, role, req.user._id);
    return sendSuccess(res, { membership: updated, message: "Member role updated successfully." });
  } catch (err) {
    return sendError(res, err);
  }
});

// Remove member or leave project
router.delete("/projects/:id/members/:userId", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const isSelf = String(req.user._id) === String(req.params.userId);
    const userRole = req.projectMembership?.role;

    // Must be either removing self (leaving), or be Owner/Admin removing someone else
    if (!isSelf && userRole !== "owner" && userRole !== "admin") {
      return sendError(res, { code: "FORBIDDEN", message: "You do not have permission to remove this member." }, 403);
    }

    const result = await projectService.removeMember(req.project._id, req.params.userId, req.user._id);
    return sendSuccess(res, {
      ...result,
      message: isSelf ? "You have left the project." : "Member removed from project."
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// -------------------------------------------------------------
// 4. TASK MANAGEMENT
// -------------------------------------------------------------

// List project tasks with filters
router.get("/projects/:id/tasks", optionalAuth, requireProjectAccess, async (req, res) => {
  try {
    const { status, priority, assignedTo, search, sortBy } = req.query;
    const tasks = await projectService.listProjectTasks(req.project._id, {
      status,
      priority,
      assignedTo,
      search,
      sortBy
    });
    return sendSuccess(res, { tasks });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

// Create task (Collaborator or above)
router.post("/projects/:id/tasks", requireAuth, requireProjectAccess, requireProjectRole("collaborator"), async (req, res) => {
  try {
    const { title, description, status, priority, assignedTo, startDate, dueDate, labels } = req.body;
    if (!title || !title.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Task title is required." });
    }

    const task = await projectService.createTask(req.project._id, req.user._id, {
      title,
      description,
      status,
      priority,
      assignedTo,
      startDate,
      dueDate,
      labels
    });

    return sendSuccess(res, { task, message: "Task created successfully." }, 201);
  } catch (err) {
    return sendError(res, err);
  }
});

// Get task details with comments
router.get("/projects/:id/tasks/:taskId", optionalAuth, requireProjectAccess, async (req, res) => {
  try {
    const task = await projectService.getTaskDetails(req.params.taskId);
    if (!task) return sendError(res, { code: "TASK_NOT_FOUND", message: "Task not found." }, 404);
    return sendSuccess(res, { task });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

// Update task
router.patch("/projects/:id/tasks/:taskId", requireAuth, requireProjectAccess, requireProjectRole("collaborator"), async (req, res) => {
  try {
    const updated = await projectService.updateTask(req.params.taskId, req.user._id, req.body);
    return sendSuccess(res, { task: updated, message: "Task updated." });
  } catch (err) {
    return sendError(res, err);
  }
});

// Update task status (for Kanban drag & drop)
router.patch("/projects/:id/tasks/:taskId/status", requireAuth, requireProjectAccess, requireProjectRole("collaborator"), async (req, res) => {
  try {
    const { status, order } = req.body;
    if (!["backlog", "todo", "in_progress", "in_review", "completed"].includes(status)) {
      return sendError(res, { code: "INVALID_STATUS", message: "Invalid status value." });
    }
    const updated = await projectService.updateTaskStatus(req.params.taskId, req.user._id, status, order);
    return sendSuccess(res, { task: updated });
  } catch (err) {
    return sendError(res, err);
  }
});

// Delete task
router.delete("/projects/:id/tasks/:taskId", requireAuth, requireProjectAccess, requireProjectRole("collaborator"), async (req, res) => {
  try {
    const result = await projectService.deleteTask(req.params.taskId, req.user._id);
    return sendSuccess(res, { ...result, message: "Task deleted." });
  } catch (err) {
    return sendError(res, err);
  }
});

// Add comment to task
router.post("/projects/:id/tasks/:taskId/comments", requireAuth, requireProjectAccess, requireProjectRole("collaborator"), async (req, res) => {
  try {
    const { content, mentions } = req.body;
    if (!content || !content.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Comment content is required." });
    }
    const comment = await projectService.addTaskComment(req.params.taskId, req.user._id, content, mentions);
    return sendSuccess(res, { comment, message: "Comment added." }, 201);
  } catch (err) {
    return sendError(res, err);
  }
});

// -------------------------------------------------------------
// 5. DISCUSSIONS
// -------------------------------------------------------------

router.get("/projects/:id/discussions", optionalAuth, requireProjectAccess, async (req, res) => {
  try {
    const discussions = await projectService.listDiscussions(req.project._id);
    return sendSuccess(res, { discussions });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

router.post("/projects/:id/discussions", requireAuth, requireProjectAccess, requireProjectRole("collaborator"), async (req, res) => {
  try {
    const { title, content, pinned } = req.body;
    if (!title || !title.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Discussion title is required." });
    }
    if (!content || !content.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Discussion content is required." });
    }
    const discussion = await projectService.createDiscussion(req.project._id, req.user._id, {
      title,
      content,
      pinned
    });
    return sendSuccess(res, { discussion, message: "Discussion started." }, 201);
  } catch (err) {
    return sendError(res, err);
  }
});

router.get("/projects/:id/discussions/:discussionId", optionalAuth, requireProjectAccess, async (req, res) => {
  try {
    const details = await projectService.getDiscussionDetails(req.params.discussionId);
    if (!details) return sendError(res, { code: "NOT_FOUND", message: "Discussion topic not found." }, 404);
    return sendSuccess(res, { discussion: details });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

router.post("/projects/:id/discussions/:discussionId/replies", requireAuth, requireProjectAccess, requireProjectRole("collaborator"), async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Reply content cannot be empty." });
    }
    const reply = await projectService.replyDiscussion(req.params.discussionId, req.user._id, content);
    return sendSuccess(res, { reply, message: "Reply posted." }, 201);
  } catch (err) {
    return sendError(res, err);
  }
});

// -------------------------------------------------------------
// 6. UPDATES & ACTIVITY
// -------------------------------------------------------------

router.get("/projects/:id/updates", optionalAuth, requireProjectAccess, async (req, res) => {
  try {
    const updates = await projectService.listProjectUpdates(req.project._id);
    return sendSuccess(res, { updates });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

router.post("/projects/:id/updates", requireAuth, requireProjectAccess, requireProjectRole("collaborator"), async (req, res) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !title.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Update title is required." });
    }
    if (!content || !content.trim()) {
      return sendError(res, { code: "VALIDATION_ERROR", message: "Update content is required." });
    }
    const update = await projectService.postProjectUpdate(req.project._id, req.user._id, {
      title,
      content,
      category
    });
    return sendSuccess(res, { update, message: "Project update published." }, 201);
  } catch (err) {
    return sendError(res, err);
  }
});

router.get("/projects/:id/activity", optionalAuth, requireProjectAccess, async (req, res) => {
  try {
    const activities = await projectService.listProjectActivities(req.project._id, req.query.limit);
    return sendSuccess(res, { activities });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

// -------------------------------------------------------------
// 7. NOTIFICATIONS
// -------------------------------------------------------------

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const notifications = await projectService.listUserNotifications(req.user._id, req.query.limit);
    return sendSuccess(res, { notifications });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  try {
    const count = await projectService.getUnreadNotificationCount(req.user._id);
    return sendSuccess(res, { unreadCount: count });
  } catch (err) {
    return sendError(res, err, 500);
  }
});

router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const notification = await projectService.markNotificationAsRead(req.params.id, req.user._id);
    return sendSuccess(res, { notification });
  } catch (err) {
    return sendError(res, err);
  }
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const result = await projectService.markAllNotificationsAsRead(req.user._id);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
