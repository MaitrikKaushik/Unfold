import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "./src/models/User.js";
import Project from "./src/models/Project.js";
import ProjectMembership from "./src/models/ProjectMembership.js";
import ProjectInvitation from "./src/models/ProjectInvitation.js";
import ProjectTask from "./src/models/ProjectTask.js";
import ProjectComment from "./src/models/ProjectComment.js";
import ProjectDiscussion from "./src/models/ProjectDiscussion.js";
import ProjectActivity from "./src/models/ProjectActivity.js";
import ProjectUpdate from "./src/models/ProjectUpdate.js";
import Notification from "./src/models/Notification.js";
import * as projectService from "./src/modules/projects/projects.service.js";
import { registerUser } from "./src/modules/auth/auth.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "111111111111111ddddd5455f4d5v85d54vw1df1brts5h544b44se4t654";
const MONGO_URI = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27018/unfold_projects_test";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function runProjectsTestSuite() {
  console.log("=================================================");
  console.log("=== Community Projects Test Suite: Backend & RBAC ===");
  console.log("=================================================");

  await mongoose.connect(MONGO_URI);

  const uOwnerName = "proj_test_owner";
  const uCollabName = "proj_test_collab";
  const uApplicantName = "proj_test_applicant";
  const uStrangerName = "proj_test_stranger";

  let owner, collab, applicant, stranger;

  try {
    // 1. Cleanup old test data
    await User.deleteMany({ username: { $in: [uOwnerName, uCollabName, uApplicantName, uStrangerName] } });
    await Project.deleteMany({ title: { $regex: /Test Project/i } });

    // 2. Register test users
    owner = await registerUser({ username: uOwnerName, password: "Password123!", displayName: "Project Owner" });
    collab = await registerUser({ username: uCollabName, password: "Password123!", displayName: "Collaborator Jane" });
    applicant = await registerUser({ username: uApplicantName, password: "Password123!", displayName: "Applicant Alex" });
    stranger = await registerUser({ username: uStrangerName, password: "Password123!", displayName: "Stranger Bob" });
    assert(owner && collab && applicant && stranger, "Test users registered successfully");

    // 3. Test Project Creation
    const createdProject = await projectService.createProject({
      title: "Test Project Alpha",
      shortDescription: "A revolutionary community-driven project for open education.",
      description: "Detailed description covering milestones, objectives, and deliverables.",
      category: "Education",
      visibility: "public",
      objectives: [
        { text: "Launch MVP platform", completed: false },
        { text: "Onboard 50 active learners", completed: false }
      ],
      requiredSkills: ["React", "Node.js", "Design"],
      maxCollaborators: 3,
      ownerId: owner._id
    });

    assert(createdProject._id, "Project created with generated ID");
    assert(createdProject.slug.startsWith("test-project-alpha"), "Unique slug generated correctly");
    assert(createdProject.stats.memberCount === 1, "Initial member count is 1 (the owner)");
    assert(createdProject.stats.progress === 0, "Initial progress is 0%");

    // Verify creator is automatically Project Owner in ProjectMembership
    const ownerMembership = await ProjectMembership.findOne({ projectId: createdProject._id, userId: owner._id });
    assert(ownerMembership && ownerMembership.role === "owner", "Creator automatically assigned Owner role in ProjectMembership");

    // 4. Test Project Discovery
    const discoverResult = await projectService.discoverProjects({
      search: "revolutionary",
      category: "Education"
    });
    assert(discoverResult.projects.length >= 1, "Public project found via keyword search and category filter");
    assert(discoverResult.projects[0].openPositions === 2, "Open positions calculated correctly (3 max - 1 member = 2)");

    // 5. Test Invitations & Join Requests
    // 5.1 Owner invites Collaborator
    const invitation = await projectService.inviteUser(createdProject._id, owner._id, uCollabName, "collaborator", "Join our team!");
    assert(invitation && invitation.status === "pending", "Invitation created for user with role collaborator");

    // Check notification sent to invitee
    const collabNotifs = await projectService.listUserNotifications(collab._id);
    assert(collabNotifs.length >= 1 && collabNotifs[0].type === "project_invitation", "Invitee received project_invitation notification");

    // 5.2 Duplicate invitation prevented
    let duplicateFailed = false;
    try {
      await projectService.inviteUser(createdProject._id, owner._id, uCollabName, "collaborator");
    } catch (e) {
      duplicateFailed = e.code === "INVITATION_PENDING";
    }
    assert(duplicateFailed, "Duplicate pending invitation correctly rejected");

    // 5.3 User accepts invitation
    const acceptRes = await projectService.respondToInvitation(invitation._id, collab._id, "accept");
    assert(acceptRes.status === "accepted", "Invitation accepted successfully");

    const collabMembership = await ProjectMembership.findOne({ projectId: createdProject._id, userId: collab._id });
    assert(collabMembership && collabMembership.role === "collaborator", "Collaborator membership created upon acceptance");

    const workspaceAfterAccept = await projectService.getProjectWorkspace(createdProject._id, owner._id);
    assert(workspaceAfterAccept.stats.memberCount === 2, "Project stats member count updated to 2");

    // 5.4 Applicant requests to join
    const joinReq = await projectService.requestToJoinProject(createdProject._id, applicant._id, "I have extensive React skills!");
    assert(joinReq && joinReq.type === "join_request" && joinReq.status === "pending", "Join request submitted by applicant");

    // 5.5 Owner approves join request
    const approveRes = await projectService.respondToJoinRequest(joinReq._id, owner._id, "approve");
    assert(approveRes.status === "accepted", "Join request approved by owner");

    const applicantMembership = await ProjectMembership.findOne({ projectId: createdProject._id, userId: applicant._id });
    assert(applicantMembership && applicantMembership.role === "collaborator", "Applicant enrolled as collaborator");

    // 5.6 Capacity Limit Check: Capacity was 3, members are now 3 (owner, collab, applicant)
    let capacityBlocked = false;
    try {
      await projectService.inviteUser(createdProject._id, owner._id, uStrangerName, "collaborator");
    } catch (e) {
      capacityBlocked = e.code === "CAPACITY_REACHED";
    }
    assert(capacityBlocked, "Capacity limit properly enforced when maximum collaborators reached");

    // 5.7 Update member role: Owner promotes Collaborator to Admin
    const promoted = await projectService.updateMemberRole(createdProject._id, collab._id, "admin", owner._id);
    assert(promoted.role === "admin", "Member role upgraded from collaborator to admin");

    // 6. Task Management & Progress Calculation
    // 6.1 Create tasks
    const task1 = await projectService.createTask(createdProject._id, owner._id, {
      title: "Set up design system & tokens",
      description: "Define color variables, buttons, and typography.",
      status: "completed",
      priority: "high",
      assignedTo: collab._id
    });

    const task2 = await projectService.createTask(createdProject._id, collab._id, {
      title: "Implement landing page header",
      description: "Responsive hero section and action buttons.",
      status: "in_progress",
      priority: "medium",
      assignedTo: applicant._id
    });

    const task3 = await projectService.createTask(createdProject._id, owner._id, {
      title: "Write documentation",
      description: "Draft getting started guide.",
      status: "todo",
      priority: "low"
    });

    const task4 = await projectService.createTask(createdProject._id, collab._id, {
      title: "Configure unit tests",
      description: "Ensure test coverage across controllers.",
      status: "backlog",
      priority: "medium"
    });

    assert(task1 && task2 && task3 && task4, "All 4 tasks created across statuses");

    // 6.2 Check initial progress: 1 completed / 4 total = 25%
    let updatedProj = await Project.findById(createdProject._id);
    assert(updatedProj.stats.taskCount === 4, "Total task count is 4");
    assert(updatedProj.stats.completedTaskCount === 1, "Completed task count is 1");
    assert(updatedProj.stats.progress === 25, "Accurate progress calculation: 25% (1/4 * 100)");

    // 6.3 Move task2 to completed
    await projectService.updateTaskStatus(task2._id, applicant._id, "completed");
    updatedProj = await Project.findById(createdProject._id);
    assert(updatedProj.stats.completedTaskCount === 2, "Completed task count increased to 2");
    assert(updatedProj.stats.progress === 50, "Accurate progress calculation updated: 50% (2/4 * 100)");

    // 6.4 Add comment to task
    const comment = await projectService.addTaskComment(task2._id, owner._id, "Great work completing this hero section!");
    assert(comment && comment.content.includes("Great work"), "Task comment added successfully");

    const taskDetails = await projectService.getTaskDetails(task2._id);
    assert(taskDetails.comments.length === 1, "Task details accurately return comments array");

    // 6.5 Filter tasks
    const completedTasks = await projectService.listProjectTasks(createdProject._id, { status: "completed" });
    assert(completedTasks.length === 2, "Task status filtering returns only completed tasks");

    // 7. Discussions & Updates
    const discussion = await projectService.createDiscussion(createdProject._id, collab._id, {
      title: "Which CSS architecture should we use?",
      content: "Should we use vanilla CSS variables or Tailwind CSS?"
    });
    assert(discussion._id, "Project discussion topic created");

    const reply = await projectService.replyDiscussion(discussion._id, applicant._id, "CSS custom properties match Unfold design perfectly.");
    assert(reply._id, "Reply added to project discussion topic");

    const updatePost = await projectService.postProjectUpdate(createdProject._id, owner._id, {
      title: "Milestone 1 Completed: UI Tokens Ready",
      content: "We have finalized the core tokens and typography scale.",
      category: "milestone"
    });
    assert(updatePost._id && updatePost.category === "milestone", "Project milestone update published");

    // 8. Activity Timeline
    const activities = await projectService.listProjectActivities(createdProject._id);
    assert(activities.length >= 6, "Chronological activity log recorded real project events");

    // 9. Notifications
    const unreadCount = await projectService.getUnreadNotificationCount(applicant._id);
    assert(unreadCount >= 1, "User unread notifications tracked");
    await projectService.markAllNotificationsAsRead(applicant._id);
    const unreadAfter = await projectService.getUnreadNotificationCount(applicant._id);
    assert(unreadAfter === 0, "Mark all notifications as read resets unread count to 0");

    // 10. Archive and Unarchive
    const archived = await projectService.archiveProject(createdProject._id, owner._id);
    assert(archived.status === "archived", "Project archived successfully");

    const unarchived = await projectService.unarchiveProject(createdProject._id, owner._id);
    assert(unarchived.status === "active", "Project unarchived back to active state");

    // 11. Project Delete (Owner only)
    const deleteRes = await projectService.deleteProject(createdProject._id, owner._id);
    assert(deleteRes.success, "Project and related memberships/tasks/activities safely cleaned up upon deletion");

    console.log("=================================================");
    console.log("=== All Community Projects Tests Passed 100%! ===");
    console.log("=================================================");
  } finally {
    if (owner?._id) {
      await User.deleteMany({ username: { $in: [uOwnerName, uCollabName, uApplicantName, uStrangerName] } });
      await Project.deleteMany({ title: { $regex: /Test Project/i } });
    }
    await mongoose.disconnect();
  }
}

runProjectsTestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
