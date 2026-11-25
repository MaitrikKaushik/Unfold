import mongoose from "mongoose";
import Project from "../../models/Project.js";
import ProjectMembership from "../../models/ProjectMembership.js";
import ProjectInvitation from "../../models/ProjectInvitation.js";
import ProjectTask from "../../models/ProjectTask.js";
import ProjectComment from "../../models/ProjectComment.js";
import ProjectDiscussion from "../../models/ProjectDiscussion.js";
import ProjectActivity from "../../models/ProjectActivity.js";
import ProjectUpdate from "../../models/ProjectUpdate.js";
import Notification from "../../models/Notification.js";
import User from "../../models/User.js";
import { getIO } from "../messages/messages.socket.js";
import logger from "../../config/logger.js";

// Helper to generate a unique url-friendly slug
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .slice(0, 60);
}

// -------------------------------------------------------------
// Real-time Event Broadcasters (Socket.IO)
// -------------------------------------------------------------
function broadcastToProject(projectId, event, data) {
  try {
    const io = getIO();
    if (io) {
      io.to(`project:${projectId}`).emit(event, data);
    }
  } catch (err) {
    logger.warn("Socket broadcast error", { error: err.message });
  }
}

function broadcastToUser(userId, event, data) {
  try {
    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit(event, data);
    }
  } catch (err) {
    logger.warn("Socket user broadcast error", { error: err.message });
  }
}

// -------------------------------------------------------------
// Notifications Service
// -------------------------------------------------------------
export async function sendNotification({ recipientId, actorId, type, projectId = null, taskId = null, title, message, link = "" }) {
  try {
    // Avoid notifying the actor themselves
    if (String(recipientId) === String(actorId)) return null;

    // Check user notification preferences
    const recipient = await User.findById(recipientId).select("preferences");
    if (recipient?.preferences?.notifications?.communityActivity === false && type.startsWith("project_")) {
      return null;
    }

    const notification = await Notification.create({
      recipientId,
      actorId,
      type,
      projectId,
      taskId,
      title,
      message,
      link
    });

    const populated = await Notification.findById(notification._id)
      .populate("actorId", "username displayName avatar")
      .lean();

    broadcastToUser(recipientId, "new_notification", populated);
    return populated;
  } catch (err) {
    logger.error("Failed to create notification", { error: err.message });
    return null;
  }
}

// -------------------------------------------------------------
// Activity Logging
// -------------------------------------------------------------
export async function logActivity(projectId, actorId, action, details = {}, idempotencyKey = null) {
  try {
    if (idempotencyKey) {
      const existing = await ProjectActivity.findOne({ idempotencyKey });
      if (existing) return existing;
    }

    const activity = await ProjectActivity.create({
      projectId,
      actorId,
      action,
      details,
      idempotencyKey: idempotencyKey || undefined
    });

    const populated = await ProjectActivity.findById(activity._id)
      .populate("actorId", "username displayName avatar")
      .lean();

    broadcastToProject(projectId, "project_activity", populated);
    return populated;
  } catch (err) {
    logger.error("Failed to log project activity", { error: err.message });
    return null;
  }
}

// -------------------------------------------------------------
// Progress & Stats Calculation
// -------------------------------------------------------------
export async function recalculateProjectStats(projectId) {
  const [tasks, members] = await Promise.all([
    ProjectTask.find({ projectId }).select("status"),
    ProjectMembership.countDocuments({ projectId, status: "active" })
  ]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  const updatedProject = await Project.findByIdAndUpdate(
    projectId,
    {
      "stats.memberCount": members,
      "stats.taskCount": totalTasks,
      "stats.completedTaskCount": completedTasks,
      "stats.progress": progress
    },
    { new: true }
  );

  broadcastToProject(projectId, "project_stats_updated", {
    projectId,
    stats: updatedProject.stats
  });

  return updatedProject.stats;
}

// -------------------------------------------------------------
// Project CRUD & Discovery
// -------------------------------------------------------------
export async function createProject({
  title,
  shortDescription,
  description = "",
  category = "Technology",
  coverImage = null,
  visibility = "public",
  objectives = [],
  expectedCompletionDate = null,
  requiredSkills = [],
  maxCollaborators = 10,
  communityId = null,
  ownerId
}) {
  const baseSlug = slugify(title);
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const slug = `${baseSlug}-${randomSuffix}`;

  const formattedObjectives = objectives.map((obj, index) => {
    if (typeof obj === "string") {
      return { id: `obj-${Date.now()}-${index}`, text: obj.trim(), completed: false };
    }
    return {
      id: obj.id || `obj-${Date.now()}-${index}`,
      text: (obj.text || "").trim(),
      completed: Boolean(obj.completed)
    };
  }).filter((o) => o.text.length > 0);

  const cleanSkills = Array.isArray(requiredSkills)
    ? requiredSkills.map((s) => String(s).trim()).filter(Boolean)
    : String(requiredSkills || "").split(",").map((s) => s.trim()).filter(Boolean);

  const project = await Project.create({
    title: title.trim(),
    slug,
    shortDescription: shortDescription.trim(),
    description: (description || "").trim(),
    category,
    coverImage,
    visibility,
    objectives: formattedObjectives,
    expectedCompletionDate: expectedCompletionDate ? new Date(expectedCompletionDate) : null,
    requiredSkills: cleanSkills,
    maxCollaborators: Math.max(1, Math.min(100, Number(maxCollaborators) || 10)),
    communityId: communityId || null,
    ownerId,
    stats: {
      memberCount: 1,
      taskCount: 0,
      completedTaskCount: 0,
      progress: 0
    }
  });

  // Automatically make creator the Owner in ProjectMembership
  await ProjectMembership.create({
    projectId: project._id,
    userId: ownerId,
    role: "owner",
    status: "active"
  });

  await logActivity(project._id, ownerId, "project_created", {
    projectTitle: project.title
  });

  return project;
}

export async function getProjectWorkspace(projectId, userId = null) {
  const project = await Project.findById(projectId)
    .populate("ownerId", "username displayName avatar bio")
    .lean();

  if (!project) return null;

  // Compute membership info for viewer
  let userMembership = null;
  if (userId) {
    userMembership = await ProjectMembership.findOne({
      projectId: project._id,
      userId,
      status: "active"
    }).lean();
  }

  // Get active collaborator members (limit 10 for overview avatar strip)
  const memberships = await ProjectMembership.find({
    projectId: project._id,
    status: "active"
  })
    .populate("userId", "username displayName avatar")
    .sort({ role: 1, joinedAt: 1 })
    .lean();

  const members = memberships.map((m) => ({
    membershipId: m._id,
    user: m.userId,
    role: m.role,
    joinedAt: m.joinedAt
  }));

  // Get upcoming deadlines (tasks with due date >= today that are not completed)
  const upcomingDeadlines = await ProjectTask.find({
    projectId: project._id,
    status: { $ne: "completed" },
    dueDate: { $gte: new Date() }
  })
    .sort({ dueDate: 1 })
    .limit(5)
    .populate("assignedTo", "username displayName avatar")
    .lean();

  // Get recent 5 activities
  const recentActivity = await ProjectActivity.find({ projectId: project._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("actorId", "username displayName avatar")
    .lean();

  // Count open positions
  const openPositions = Math.max(0, project.maxCollaborators - members.length);

  return {
    ...project,
    currentUserRole: userMembership ? userMembership.role : (String(project.ownerId?._id) === String(userId) ? "owner" : null),
    isMember: Boolean(userMembership || String(project.ownerId?._id) === String(userId)),
    members,
    openPositions,
    upcomingDeadlines,
    recentActivity
  };
}

export async function listMyProjects(userId, { status = "active" } = {}) {
  const memberships = await ProjectMembership.find({
    userId,
    status: "active"
  }).select("projectId role");

  const projectIds = memberships.map((m) => m.projectId);
  const roleMap = new Map(memberships.map((m) => [String(m.projectId), m.role]));

  const query = { _id: { $in: projectIds } };
  if (status === "archived") {
    query.status = "archived";
  } else if (status === "active") {
    query.status = { $in: ["active", "completed"] };
  }

  const projects = await Project.find(query)
    .populate("ownerId", "username displayName avatar")
    .sort({ updatedAt: -1 })
    .lean();

  // Attach collaborator avatars
  const results = await Promise.all(
    projects.map(async (p) => {
      const topMembers = await ProjectMembership.find({ projectId: p._id, status: "active" })
        .populate("userId", "username displayName avatar")
        .limit(5)
        .lean();

      return {
        ...p,
        currentUserRole: roleMap.get(String(p._id)) || "viewer",
        collaborators: topMembers.map((m) => m.userId),
        openPositions: Math.max(0, p.maxCollaborators - (p.stats?.memberCount || topMembers.length))
      };
    })
  );

  return results;
}

export async function discoverProjects({
  search = "",
  category = "",
  skill = "",
  status = "active",
  sort = "recent",
  page = 1,
  limit = 12
}) {
  const query = {
    visibility: "public"
  };

  if (status && status !== "all") {
    query.status = status;
  }

  if (category && category !== "all") {
    query.category = category;
  }

  if (skill) {
    query.requiredSkills = { $in: [new RegExp(skill.trim(), "i")] };
  }

  if (search) {
    const searchRegex = new RegExp(search.trim(), "i");
    query.$or = [
      { title: searchRegex },
      { shortDescription: searchRegex },
      { requiredSkills: searchRegex }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort === "progress") {
    sortOption = { "stats.progress": -1 };
  } else if (sort === "members") {
    sortOption = { "stats.memberCount": -1 };
  } else if (sort === "popular") {
    sortOption = { "stats.taskCount": -1, createdAt: -1 };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [total, projects] = await Promise.all([
    Project.countDocuments(query),
    Project.find(query)
      .populate("ownerId", "username displayName avatar")
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .lean()
  ]);

  const results = await Promise.all(
    projects.map(async (p) => {
      const topMembers = await ProjectMembership.find({ projectId: p._id, status: "active" })
        .populate("userId", "username displayName avatar")
        .limit(5)
        .lean();

      return {
        ...p,
        collaborators: topMembers.map((m) => m.userId),
        openPositions: Math.max(0, p.maxCollaborators - (p.stats?.memberCount || 1))
      };
    })
  );

  return {
    projects: results,
    pagination: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      limit: Number(limit)
    }
  };
}

export async function updateProject(projectId, actorId, updateData) {
  const allowedFields = [
    "title",
    "shortDescription",
    "description",
    "category",
    "coverImage",
    "visibility",
    "expectedCompletionDate",
    "requiredSkills",
    "maxCollaborators",
    "allowJoinRequests",
    "objectives"
  ];

  const patch = {};
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      if (field === "objectives" && Array.isArray(updateData.objectives)) {
        patch.objectives = updateData.objectives.map((o, idx) => ({
          id: o.id || `obj-${Date.now()}-${idx}`,
          text: (o.text || "").trim(),
          completed: Boolean(o.completed)
        })).filter((o) => o.text.length > 0);
      } else if (field === "requiredSkills") {
        patch.requiredSkills = Array.isArray(updateData.requiredSkills)
          ? updateData.requiredSkills.map((s) => String(s).trim()).filter(Boolean)
          : String(updateData.requiredSkills || "").split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        patch[field] = updateData[field];
      }
    }
  }

  const updated = await Project.findByIdAndUpdate(projectId, patch, { new: true, runValidators: true })
    .populate("ownerId", "username displayName avatar");

  await logActivity(projectId, actorId, "project_updated", {
    fieldsUpdated: Object.keys(patch)
  });

  broadcastToProject(projectId, "project_updated", updated);
  return updated;
}

export async function archiveProject(projectId, actorId) {
  const project = await Project.findByIdAndUpdate(
    projectId,
    { status: "archived", archivedAt: new Date() },
    { new: true }
  );

  await logActivity(projectId, actorId, "project_archived", {
    title: project.title
  });

  broadcastToProject(projectId, "project_archived", { projectId });
  return project;
}

export async function unarchiveProject(projectId, actorId) {
  const project = await Project.findByIdAndUpdate(
    projectId,
    { status: "active", archivedAt: null },
    { new: true }
  );

  await logActivity(projectId, actorId, "project_unarchived", {
    title: project.title
  });

  broadcastToProject(projectId, "project_unarchived", { projectId });
  return project;
}

export async function deleteProject(projectId, actorId) {
  const project = await Project.findById(projectId);
  if (!project) {
    const error = new Error("Project not found.");
    error.status = 404;
    throw error;
  }

  // Only project owner can delete
  if (String(project.ownerId) !== String(actorId)) {
    const error = new Error("Only the project owner can delete this project.");
    error.status = 403;
    throw error;
  }

  await Promise.all([
    Project.findByIdAndDelete(projectId),
    ProjectMembership.deleteMany({ projectId }),
    ProjectInvitation.deleteMany({ projectId }),
    ProjectTask.deleteMany({ projectId }),
    ProjectComment.deleteMany({ projectId }),
    ProjectDiscussion.deleteMany({ projectId }),
    ProjectActivity.deleteMany({ projectId }),
    ProjectUpdate.deleteMany({ projectId }),
    Notification.deleteMany({ projectId })
  ]);

  return { success: true, projectId };
}

// -------------------------------------------------------------
// Membership & Invitations
// -------------------------------------------------------------
export async function inviteUser(projectId, inviterId, username, role = "collaborator", message = "") {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  const invitee = await User.findOne({ username: username.toLowerCase().trim() });
  if (!invitee) {
    const error = new Error(`User @${username} was not found.`);
    error.code = "USER_NOT_FOUND";
    error.status = 404;
    throw error;
  }

  if (String(invitee._id) === String(inviterId)) {
    const error = new Error("You cannot invite yourself.");
    error.code = "SELF_INVITE";
    error.status = 400;
    throw error;
  }

  // Check if user is already a member
  const existingMember = await ProjectMembership.findOne({
    projectId,
    userId: invitee._id,
    status: "active"
  });
  if (existingMember) {
    const error = new Error(`@${invitee.username} is already an active member of this project.`);
    error.code = "ALREADY_MEMBER";
    error.status = 400;
    throw error;
  }

  // Check capacity
  const currentMembers = await ProjectMembership.countDocuments({ projectId, status: "active" });
  if (currentMembers >= project.maxCollaborators) {
    const error = new Error("Project collaborator capacity has been reached.");
    error.code = "CAPACITY_REACHED";
    error.status = 400;
    throw error;
  }

  // Check existing pending invitation
  const existingInvite = await ProjectInvitation.findOne({
    projectId,
    inviteeId: invitee._id,
    type: "invitation",
    status: "pending"
  });
  if (existingInvite) {
    const error = new Error(`A pending invitation for @${invitee.username} already exists.`);
    error.code = "INVITATION_PENDING";
    error.status = 400;
    throw error;
  }

  const invitation = await ProjectInvitation.create({
    projectId,
    inviterId,
    inviteeId: invitee._id,
    role,
    type: "invitation",
    message: (message || "").trim(),
    status: "pending"
  });

  const inviter = await User.findById(inviterId).select("username displayName");

  await sendNotification({
    recipientId: invitee._id,
    actorId: inviterId,
    type: "project_invitation",
    projectId,
    title: "Project Invitation",
    message: `@${inviter.username} invited you to collaborate on "${project.title}" as ${role}.`,
    link: `/projects/${projectId}`
  });

  await logActivity(projectId, inviterId, "member_invited", {
    inviteeUsername: invitee.username,
    role
  });

  return await ProjectInvitation.findById(invitation._id)
    .populate("inviteeId", "username displayName avatar bio")
    .populate("inviterId", "username displayName avatar");
}

export async function requestToJoinProject(projectId, userId, message = "") {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  if (!project.allowJoinRequests) {
    const error = new Error("This project is currently not accepting join requests.");
    error.code = "JOIN_REQUESTS_DISABLED";
    error.status = 403;
    throw error;
  }

  // Check capacity
  const currentMembers = await ProjectMembership.countDocuments({ projectId, status: "active" });
  if (currentMembers >= project.maxCollaborators) {
    const error = new Error("Project collaborator capacity has been reached.");
    error.code = "CAPACITY_REACHED";
    error.status = 400;
    throw error;
  }

  // Check existing membership
  const existingMember = await ProjectMembership.findOne({
    projectId,
    userId,
    status: "active"
  });
  if (existingMember) {
    const error = new Error("You are already a member of this project.");
    error.code = "ALREADY_MEMBER";
    error.status = 400;
    throw error;
  }

  // Check existing pending request
  const existingReq = await ProjectInvitation.findOne({
    projectId,
    inviteeId: userId,
    type: "join_request",
    status: "pending"
  });
  if (existingReq) {
    const error = new Error("You already have a pending join request for this project.");
    error.code = "REQUEST_PENDING";
    error.status = 400;
    throw error;
  }

  const joinRequest = await ProjectInvitation.create({
    projectId,
    inviterId: userId,
    inviteeId: userId,
    role: "collaborator",
    type: "join_request",
    message: (message || "").trim(),
    status: "pending"
  });

  const applicant = await User.findById(userId).select("username displayName");

  // Notify project owner
  await sendNotification({
    recipientId: project.ownerId,
    actorId: userId,
    type: "join_request",
    projectId,
    title: "Join Request",
    message: `@${applicant.username} requested to join "${project.title}".`,
    link: `/projects/${projectId}`
  });

  await logActivity(projectId, userId, "join_requested", {
    applicantUsername: applicant.username
  });

  return joinRequest;
}

export async function respondToInvitation(invitationId, userId, action) {
  const invitation = await ProjectInvitation.findOne({
    _id: invitationId,
    inviteeId: userId,
    type: "invitation",
    status: "pending"
  });

  if (!invitation) {
    const error = new Error("Pending invitation not found.");
    error.status = 404;
    throw error;
  }

  const project = await Project.findById(invitation.projectId);
  if (!project) throw new Error("Project no longer exists.");

  if (action === "accept") {
    // Check capacity
    const currentMembers = await ProjectMembership.countDocuments({
      projectId: invitation.projectId,
      status: "active"
    });
    if (currentMembers >= project.maxCollaborators) {
      const error = new Error("Project collaborator capacity has been reached.");
      error.code = "CAPACITY_REACHED";
      error.status = 400;
      throw error;
    }

    invitation.status = "accepted";
    invitation.respondedAt = new Date();
    await invitation.save();

    await ProjectMembership.findOneAndUpdate(
      { projectId: invitation.projectId, userId },
      { role: invitation.role, status: "active", joinedAt: new Date() },
      { upsert: true, new: true }
    );

    await recalculateProjectStats(invitation.projectId);

    const responder = await User.findById(userId).select("username displayName");

    await sendNotification({
      recipientId: invitation.inviterId,
      actorId: userId,
      type: "invitation_accepted",
      projectId: project._id,
      title: "Invitation Accepted",
      message: `@${responder.username} accepted your invitation to "${project.title}".`,
      link: `/projects/${project._id}`
    });

    await logActivity(project._id, userId, "invitation_accepted", {
      username: responder.username,
      role: invitation.role
    });

    broadcastToProject(project._id, "member_joined", {
      projectId: project._id,
      userId,
      username: responder.username
    });

    return { status: "accepted", invitation };
  } else if (action === "reject") {
    invitation.status = "rejected";
    invitation.respondedAt = new Date();
    await invitation.save();

    const responder = await User.findById(userId).select("username displayName");

    await sendNotification({
      recipientId: invitation.inviterId,
      actorId: userId,
      type: "invitation_rejected",
      projectId: project._id,
      title: "Invitation Declined",
      message: `@${responder.username} declined your invitation to "${project.title}".`,
      link: `/projects/${project._id}`
    });

    await logActivity(project._id, userId, "invitation_rejected", {
      username: responder.username
    });

    return { status: "rejected", invitation };
  } else {
    throw new Error("Invalid action. Must be 'accept' or 'reject'.");
  }
}

export async function respondToJoinRequest(invitationId, responderId, action) {
  const joinRequest = await ProjectInvitation.findOne({
    _id: invitationId,
    type: "join_request",
    status: "pending"
  });

  if (!joinRequest) {
    const error = new Error("Pending join request not found.");
    error.status = 404;
    throw error;
  }

  const project = await Project.findById(joinRequest.projectId);
  if (!project) throw new Error("Project no longer exists.");

  if (action === "approve") {
    const currentMembers = await ProjectMembership.countDocuments({
      projectId: joinRequest.projectId,
      status: "active"
    });
    if (currentMembers >= project.maxCollaborators) {
      const error = new Error("Project collaborator capacity has been reached.");
      error.code = "CAPACITY_REACHED";
      error.status = 400;
      throw error;
    }

    joinRequest.status = "accepted";
    joinRequest.respondedAt = new Date();
    await joinRequest.save();

    await ProjectMembership.findOneAndUpdate(
      { projectId: joinRequest.projectId, userId: joinRequest.inviteeId },
      { role: joinRequest.role || "collaborator", status: "active", joinedAt: new Date() },
      { upsert: true, new: true }
    );

    await recalculateProjectStats(joinRequest.projectId);

    const applicant = await User.findById(joinRequest.inviteeId).select("username displayName");

    await sendNotification({
      recipientId: joinRequest.inviteeId,
      actorId: responderId,
      type: "join_request_approved",
      projectId: project._id,
      title: "Join Request Approved",
      message: `Your request to join "${project.title}" was approved!`,
      link: `/projects/${project._id}`
    });

    await logActivity(project._id, responderId, "join_approved", {
      applicantUsername: applicant.username
    });

    broadcastToProject(project._id, "member_joined", {
      projectId: project._id,
      userId: joinRequest.inviteeId,
      username: applicant.username
    });

    return { status: "accepted", joinRequest };
  } else if (action === "reject") {
    joinRequest.status = "rejected";
    joinRequest.respondedAt = new Date();
    await joinRequest.save();

    await sendNotification({
      recipientId: joinRequest.inviteeId,
      actorId: responderId,
      type: "join_request_rejected",
      projectId: project._id,
      title: "Join Request Update",
      message: `Your request to join "${project.title}" was not approved.`,
      link: `/projects/${project._id}`
    });

    await logActivity(project._id, responderId, "join_rejected", {
      applicantId: joinRequest.inviteeId
    });

    return { status: "rejected", joinRequest };
  } else {
    throw new Error("Invalid action. Must be 'approve' or 'reject'.");
  }
}

export async function listProjectMembers(projectId) {
  const memberships = await ProjectMembership.find({
    projectId,
    status: "active"
  })
    .populate("userId", "username displayName avatar bio createdAt")
    .sort({ role: 1, joinedAt: 1 })
    .lean();

  return memberships.map((m) => ({
    membershipId: m._id,
    user: m.userId,
    role: m.role,
    joinedAt: m.joinedAt
  }));
}

export async function updateMemberRole(projectId, targetUserId, newRole, actorId) {
  if (!["admin", "collaborator", "viewer"].includes(newRole)) {
    throw new Error("Invalid role. Role must be admin, collaborator, or viewer.");
  }

  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  if (String(project.ownerId) === String(targetUserId)) {
    throw new Error("Cannot change the owner's role.");
  }

  const updatedMembership = await ProjectMembership.findOneAndUpdate(
    { projectId, userId: targetUserId, status: "active" },
    { role: newRole },
    { new: true }
  ).populate("userId", "username displayName avatar");

  if (!updatedMembership) {
    throw new Error("Member not found in this project.");
  }

  await logActivity(projectId, actorId, "member_role_changed", {
    memberUsername: updatedMembership.userId?.username,
    newRole
  });

  broadcastToProject(projectId, "member_role_changed", {
    projectId,
    userId: targetUserId,
    newRole
  });

  return updatedMembership;
}

export async function removeMember(projectId, targetUserId, actorId) {
  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found.");

  if (String(project.ownerId) === String(targetUserId)) {
    throw new Error("Cannot remove the project owner.");
  }

  // Unassign any tasks assigned to this user
  await ProjectTask.updateMany(
    { projectId, assignedTo: targetUserId },
    { assignedTo: null }
  );

  await ProjectMembership.findOneAndDelete({
    projectId,
    userId: targetUserId
  });

  await recalculateProjectStats(projectId);

  const removedUser = await User.findById(targetUserId).select("username");

  await logActivity(projectId, actorId, "member_removed", {
    removedUsername: removedUser?.username || "member",
    isSelf: String(targetUserId) === String(actorId)
  });

  broadcastToProject(projectId, "member_removed", {
    projectId,
    userId: targetUserId
  });

  return { success: true, removedUserId: targetUserId };
}

export async function listProjectInvitations(projectId) {
  const invites = await ProjectInvitation.find({
    projectId,
    status: "pending"
  })
    .populate("inviteeId", "username displayName avatar")
    .populate("inviterId", "username displayName avatar")
    .sort({ createdAt: -1 })
    .lean();

  return invites;
}

export async function listUserInvitations(userId) {
  const [receivedInvitations, sentJoinRequests] = await Promise.all([
    ProjectInvitation.find({
      inviteeId: userId,
      type: "invitation",
      status: "pending"
    })
      .populate("projectId", "title shortDescription category status")
      .populate("inviterId", "username displayName avatar")
      .sort({ createdAt: -1 })
      .lean(),
    ProjectInvitation.find({
      inviteeId: userId,
      type: "join_request"
    })
      .populate("projectId", "title shortDescription category status")
      .sort({ createdAt: -1 })
      .lean()
  ]);

  return {
    receivedInvitations: receivedInvitations.filter((i) => i.projectId),
    sentJoinRequests: sentJoinRequests.filter((r) => r.projectId)
  };
}

// -------------------------------------------------------------
// Tasks Management
// -------------------------------------------------------------
export async function createTask(projectId, creatorId, taskData) {
  const {
    title,
    description = "",
    status = "todo",
    priority = "medium",
    assignedTo = null,
    startDate = null,
    dueDate = null,
    labels = []
  } = taskData;

  // Find max order in this status column
  const lastTask = await ProjectTask.findOne({ projectId, status })
    .sort({ order: -1 })
    .select("order");
  const nextOrder = lastTask ? lastTask.order + 100 : 100;

  const cleanLabels = Array.isArray(labels)
    ? labels.map((l) => String(l).trim()).filter(Boolean)
    : String(labels || "").split(",").map((l) => l.trim()).filter(Boolean);

  const task = await ProjectTask.create({
    projectId,
    title: title.trim(),
    description: (description || "").trim(),
    status,
    priority,
    assignedTo: assignedTo || null,
    createdBy: creatorId,
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    labels: cleanLabels,
    order: nextOrder,
    completedAt: status === "completed" ? new Date() : null
  });

  await recalculateProjectStats(projectId);

  await logActivity(projectId, creatorId, "task_created", {
    taskId: task._id,
    taskTitle: task.title,
    status: task.status,
    priority: task.priority
  });

  const populated = await ProjectTask.findById(task._id)
    .populate("assignedTo", "username displayName avatar")
    .populate("createdBy", "username displayName avatar")
    .lean();

  if (assignedTo && String(assignedTo) !== String(creatorId)) {
    const creator = await User.findById(creatorId).select("username");
    await sendNotification({
      recipientId: assignedTo,
      actorId: creatorId,
      type: "task_assigned",
      projectId,
      taskId: task._id,
      title: "Task Assigned",
      message: `@${creator.username} assigned you to task "${task.title}".`,
      link: `/projects/${projectId}?tab=tasks&task=${task._id}`
    });
  }

  broadcastToProject(projectId, "task_created", populated);
  return populated;
}

export async function listProjectTasks(projectId, filters = {}) {
  const query = { projectId };

  if (filters.status && filters.status !== "all") {
    query.status = filters.status;
  }
  if (filters.priority && filters.priority !== "all") {
    query.priority = filters.priority;
  }
  if (filters.assignedTo && filters.assignedTo !== "all") {
    query.assignedTo = filters.assignedTo === "unassigned" ? null : filters.assignedTo;
  }
  if (filters.search) {
    const searchRegex = new RegExp(filters.search.trim(), "i");
    query.$or = [{ title: searchRegex }, { description: searchRegex }, { labels: searchRegex }];
  }

  let sort = { order: 1, createdAt: -1 };
  if (filters.sortBy === "dueDate") {
    sort = { dueDate: 1, createdAt: -1 };
  } else if (filters.sortBy === "priority") {
    sort = { priority: -1, createdAt: -1 };
  } else if (filters.sortBy === "recent") {
    sort = { createdAt: -1 };
  }

  const tasks = await ProjectTask.find(query)
    .populate("assignedTo", "username displayName avatar")
    .populate("createdBy", "username displayName avatar")
    .sort(sort)
    .lean();

  return tasks;
}

export async function getTaskDetails(taskId) {
  const task = await ProjectTask.findById(taskId)
    .populate("assignedTo", "username displayName avatar")
    .populate("createdBy", "username displayName avatar")
    .lean();

  if (!task) return null;

  const comments = await ProjectComment.find({
    targetType: "task",
    targetId: taskId
  })
    .populate("authorId", "username displayName avatar")
    .sort({ createdAt: 1 })
    .lean();

  return { ...task, comments };
}

export async function updateTask(taskId, updaterId, updates) {
  const task = await ProjectTask.findById(taskId);
  if (!task) throw new Error("Task not found.");

  const oldAssignedTo = task.assignedTo;
  const allowedFields = [
    "title",
    "description",
    "status",
    "priority",
    "assignedTo",
    "startDate",
    "dueDate",
    "labels",
    "order"
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === "labels" && Array.isArray(updates.labels)) {
        task.labels = updates.labels.map((l) => String(l).trim()).filter(Boolean);
      } else if (field === "assignedTo") {
        task.assignedTo = updates.assignedTo ? updates.assignedTo : null;
      } else {
        task[field] = updates[field];
      }
    }
  }

  if (updates.status === "completed" && !task.completedAt) {
    task.completedAt = new Date();
  } else if (updates.status && updates.status !== "completed") {
    task.completedAt = null;
  }

  await task.save();
  await recalculateProjectStats(task.projectId);

  await logActivity(task.projectId, updaterId, "task_updated", {
    taskId: task._id,
    taskTitle: task.title
  });

  // Notify new assignee if changed
  if (task.assignedTo && String(task.assignedTo) !== String(oldAssignedTo) && String(task.assignedTo) !== String(updaterId)) {
    const updater = await User.findById(updaterId).select("username");
    await sendNotification({
      recipientId: task.assignedTo,
      actorId: updaterId,
      type: "task_assigned",
      projectId: task.projectId,
      taskId: task._id,
      title: "Task Assigned",
      message: `@${updater.username} assigned you to "${task.title}".`,
      link: `/projects/${task.projectId}?tab=tasks&task=${task._id}`
    });
  }

  const populated = await ProjectTask.findById(task._id)
    .populate("assignedTo", "username displayName avatar")
    .populate("createdBy", "username displayName avatar")
    .lean();

  broadcastToProject(task.projectId, "task_updated", populated);
  return populated;
}

export async function updateTaskStatus(taskId, updaterId, newStatus, newOrder = null) {
  const task = await ProjectTask.findById(taskId);
  if (!task) throw new Error("Task not found.");

  const oldStatus = task.status;
  task.status = newStatus;
  if (newOrder !== null && !isNaN(Number(newOrder))) {
    task.order = Number(newOrder);
  }
  if (newStatus === "completed") {
    task.completedAt = new Date();
  } else {
    task.completedAt = null;
  }

  await task.save();
  await recalculateProjectStats(task.projectId);

  await logActivity(task.projectId, updaterId, newStatus === "completed" ? "task_completed" : "task_status_changed", {
    taskId: task._id,
    taskTitle: task.title,
    oldStatus,
    newStatus
  });

  const populated = await ProjectTask.findById(task._id)
    .populate("assignedTo", "username displayName avatar")
    .populate("createdBy", "username displayName avatar")
    .lean();

  broadcastToProject(task.projectId, "task_status_changed", populated);
  return populated;
}

export async function deleteTask(taskId, actorId) {
  const task = await ProjectTask.findById(taskId);
  if (!task) throw new Error("Task not found.");

  const projectId = task.projectId;
  const title = task.title;

  await Promise.all([
    ProjectTask.findByIdAndDelete(taskId),
    ProjectComment.deleteMany({ targetType: "task", targetId: taskId })
  ]);

  await recalculateProjectStats(projectId);

  await logActivity(projectId, actorId, "task_deleted", {
    taskTitle: title
  });

  broadcastToProject(projectId, "task_deleted", { taskId, projectId });
  return { success: true, taskId };
}

export async function addTaskComment(taskId, authorId, content, mentions = []) {
  const task = await ProjectTask.findById(taskId);
  if (!task) throw new Error("Task not found.");

  const comment = await ProjectComment.create({
    projectId: task.projectId,
    targetType: "task",
    targetId: taskId,
    authorId,
    content: content.trim(),
    mentions: Array.isArray(mentions) ? mentions : []
  });

  const populated = await ProjectComment.findById(comment._id)
    .populate("authorId", "username displayName avatar")
    .lean();

  await logActivity(task.projectId, authorId, "comment_added", {
    taskId: task._id,
    taskTitle: task.title
  });

  // Notify assignee if not the author
  if (task.assignedTo && String(task.assignedTo) !== String(authorId)) {
    const author = await User.findById(authorId).select("username");
    await sendNotification({
      recipientId: task.assignedTo,
      actorId: authorId,
      type: "task_comment",
      projectId: task.projectId,
      taskId: task._id,
      title: "New Task Comment",
      message: `@${author.username} commented on "${task.title}".`,
      link: `/projects/${task.projectId}?tab=tasks&task=${task._id}`
    });
  }

  broadcastToProject(task.projectId, "task_comment_added", {
    taskId,
    comment: populated
  });

  return populated;
}

// -------------------------------------------------------------
// Discussions
// -------------------------------------------------------------
export async function createDiscussion(projectId, authorId, { title, content, pinned = false }) {
  const discussion = await ProjectDiscussion.create({
    projectId,
    authorId,
    title: title.trim(),
    content: content.trim(),
    pinned: Boolean(pinned)
  });

  await logActivity(projectId, authorId, "discussion_created", {
    discussionId: discussion._id,
    title: discussion.title
  });

  const populated = await ProjectDiscussion.findById(discussion._id)
    .populate("authorId", "username displayName avatar")
    .lean();

  broadcastToProject(projectId, "discussion_created", populated);
  return populated;
}

export async function listDiscussions(projectId) {
  const discussions = await ProjectDiscussion.find({ projectId })
    .populate("authorId", "username displayName avatar")
    .sort({ pinned: -1, lastReplyAt: -1, createdAt: -1 })
    .lean();

  return discussions;
}

export async function getDiscussionDetails(discussionId) {
  const discussion = await ProjectDiscussion.findById(discussionId)
    .populate("authorId", "username displayName avatar bio")
    .lean();

  if (!discussion) return null;

  const replies = await ProjectComment.find({
    targetType: "discussion",
    targetId: discussionId
  })
    .populate("authorId", "username displayName avatar")
    .sort({ createdAt: 1 })
    .lean();

  return { ...discussion, replies };
}

export async function replyDiscussion(discussionId, authorId, content) {
  const discussion = await ProjectDiscussion.findById(discussionId);
  if (!discussion) throw new Error("Discussion not found.");

  const comment = await ProjectComment.create({
    projectId: discussion.projectId,
    targetType: "discussion",
    targetId: discussionId,
    authorId,
    content: content.trim()
  });

  discussion.replyCount = (discussion.replyCount || 0) + 1;
  discussion.lastReplyAt = new Date();
  await discussion.save();

  const populated = await ProjectComment.findById(comment._id)
    .populate("authorId", "username displayName avatar")
    .lean();

  if (String(discussion.authorId) !== String(authorId)) {
    const author = await User.findById(authorId).select("username");
    await sendNotification({
      recipientId: discussion.authorId,
      actorId: authorId,
      type: "task_comment",
      projectId: discussion.projectId,
      title: "New Discussion Reply",
      message: `@${author.username} replied to your discussion "${discussion.title}".`,
      link: `/projects/${discussion.projectId}?tab=discussions&topic=${discussion._id}`
    });
  }

  broadcastToProject(discussion.projectId, "discussion_reply_added", {
    discussionId,
    reply: populated
  });

  return populated;
}

// -------------------------------------------------------------
// Project Updates & Activity Timeline
// -------------------------------------------------------------
export async function postProjectUpdate(projectId, authorId, { title, content, category = "general" }) {
  const update = await ProjectUpdate.create({
    projectId,
    authorId,
    title: title.trim(),
    content: content.trim(),
    category
  });

  await logActivity(projectId, authorId, "project_update_posted", {
    updateId: update._id,
    updateTitle: update.title,
    category
  });

  const project = await Project.findById(projectId);
  const author = await User.findById(authorId).select("username");

  // Notify all other project members
  const members = await ProjectMembership.find({ projectId, status: "active" }).select("userId");
  for (const m of members) {
    if (String(m.userId) !== String(authorId)) {
      await sendNotification({
        recipientId: m.userId,
        actorId: authorId,
        type: "project_update",
        projectId,
        title: `Project Update: ${project.title}`,
        message: `@${author.username} posted an update: "${update.title}"`,
        link: `/projects/${projectId}?tab=updates`
      });
    }
  }

  const populated = await ProjectUpdate.findById(update._id)
    .populate("authorId", "username displayName avatar")
    .lean();

  broadcastToProject(projectId, "project_update_posted", populated);
  return populated;
}

export async function listProjectUpdates(projectId) {
  const updates = await ProjectUpdate.find({ projectId })
    .populate("authorId", "username displayName avatar")
    .sort({ createdAt: -1 })
    .lean();

  return updates;
}

export async function listProjectActivities(projectId, limit = 50) {
  const activities = await ProjectActivity.find({ projectId })
    .populate("actorId", "username displayName avatar")
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();

  return activities;
}

// -------------------------------------------------------------
// Notifications API
// -------------------------------------------------------------
export async function listUserNotifications(userId, limit = 30) {
  const notifications = await Notification.find({ recipientId: userId })
    .populate("actorId", "username displayName avatar")
    .populate("projectId", "title slug")
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();

  return notifications;
}

export async function getUnreadNotificationCount(userId) {
  const count = await Notification.countDocuments({
    recipientId: userId,
    read: false
  });
  return count;
}

export async function markNotificationAsRead(notificationId, userId) {
  const notif = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: userId },
    { read: true },
    { new: true }
  );
  return notif;
}

export async function markAllNotificationsAsRead(userId) {
  await Notification.updateMany(
    { recipientId: userId, read: false },
    { read: true }
  );
  return { success: true };
}
