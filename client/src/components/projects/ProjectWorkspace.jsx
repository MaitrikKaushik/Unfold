import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Kanban,
  MessageSquare,
  Users,
  Clock,
  Settings,
  Activity,
  CheckCircle2,
  Calendar,
  Lock,
  Globe,
  Share2,
  AlertCircle,
  Plus,
  TrendingUp,
  FolderKanban
} from "lucide-react";
import { io } from "socket.io-client";
import { api, getAssetUrl, getToken, SERVER_ORIGIN } from "../../services/api";
import ProjectKanban from "./ProjectKanban";
import ProjectDiscussions from "./ProjectDiscussions";
import ProjectMembers from "./ProjectMembers";
import ProjectSettings from "./ProjectSettings";

export default function ProjectWorkspace({
  projectId,
  currentUser,
  onBack,
  onProjectDeleted
}) {
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "tasks" | "discussions" | "members" | "activity" | "settings"
  const [notice, setNotice] = useState("");

  const socketRef = useRef(null);

  const fetchWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api(`/projects/${projectId}`);
      setProject(res.project);

      // Load tasks and activities in parallel
      const [tasksRes, actRes] = await Promise.all([
        api(`/projects/${projectId}/tasks`),
        api(`/projects/${projectId}/activity?limit=30`)
      ]);
      setTasks(tasksRes.tasks || []);
      setActivities(actRes.activities || []);
    } catch (err) {
      setError(err.message || "Failed to load project workspace.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  // Connect Socket.IO for real-time workspace updates
  useEffect(() => {
    if (!projectId) return;

    const token = getToken();
    const socket = io(SERVER_ORIGIN || undefined, {
      auth: { token },
      transports: ["websocket", "polling"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_project", projectId);
    });

    socket.on("task_created", (newTask) => {
      setTasks((prev) => {
        if (prev.some((t) => t._id === newTask._id)) return prev;
        return [newTask, ...prev];
      });
      // Refresh project stats
      api(`/projects/${projectId}`).then((r) => setProject(r.project)).catch(() => {});
    });

    socket.on("task_updated", (updatedTask) => {
      setTasks((prev) => prev.map((t) => (t._id === updatedTask._id ? updatedTask : t)));
      api(`/projects/${projectId}`).then((r) => setProject(r.project)).catch(() => {});
    });

    socket.on("task_status_changed", (updatedTask) => {
      setTasks((prev) => prev.map((t) => (t._id === updatedTask._id ? updatedTask : t)));
      api(`/projects/${projectId}`).then((r) => setProject(r.project)).catch(() => {});
    });

    socket.on("task_deleted", ({ taskId }) => {
      setTasks((prev) => prev.filter((t) => t._id !== taskId));
      api(`/projects/${projectId}`).then((r) => setProject(r.project)).catch(() => {});
    });

    socket.on("project_activity", (newActivity) => {
      setActivities((prev) => [newActivity, ...prev]);
    });

    socket.on("member_joined", () => {
      fetchWorkspace();
    });

    return () => {
      socket.emit("leave_project", projectId);
      socket.disconnect();
    };
  }, [projectId, fetchWorkspace]);

  // Handlers for task mutations
  async function handleTaskStatusChange(taskId, newStatus) {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await api(`/projects/${projectId}/tasks/${taskId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus })
      });
      // Replace with confirmed server task
      setTasks((prev) => prev.map((t) => (t._id === taskId ? res.task : t)));
      // Refresh stats
      const ws = await api(`/projects/${projectId}`);
      setProject(ws.project);
    } catch (err) {
      setError(err.message || "Failed to update task status.");
      fetchWorkspace(); // Revert
    }
  }

  function handleTaskCreated(newTask) {
    setTasks((prev) => [newTask, ...prev]);
    fetchWorkspace();
  }

  function handleTaskUpdated(updatedTask) {
    setTasks((prev) => prev.map((t) => (t._id === updatedTask._id ? updatedTask : t)));
    fetchWorkspace();
  }

  function handleTaskDeleted(deletedTaskId) {
    setTasks((prev) => prev.filter((t) => t._id !== deletedTaskId));
    fetchWorkspace();
  }

  const currentUserRole = project?.currentUserRole;
  const isMember = Boolean(project?.isMember);
  const canEdit = currentUserRole === "owner" || currentUserRole === "admin" || currentUserRole === "collaborator";
  const isOwner = currentUserRole === "owner";

  if (loading) {
    return (
      <div className="workspace-loading-pane">
        <div className="loading-spinner"></div>
        <span>Opening project workspace...</span>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="workspace-error-pane">
        <AlertCircle size={32} className="text-danger mb-2" />
        <h3>Could not open project</h3>
        <p className="text-muted">{error}</p>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={14} className="me-1" />
          Back to Projects
        </button>
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const pendingCount = tasks.filter((t) => t.status !== "completed").length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const overdueCount = tasks.filter((t) => {
    if (!t.dueDate || t.status === "completed") return false;
    const d = new Date(t.dueDate);
    d.setHours(23, 59, 59, 999);
    return d < new Date();
  }).length;

  return (
    <div className="project-workspace-container">
      {/* Back button & top bar */}
      <div className="workspace-top-bar">
        <button type="button" className="workspace-back-btn" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={2.4} />
          <span>Projects</span>
        </button>

        <div className="workspace-top-actions">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              setNotice("Project URL copied to clipboard!");
              setTimeout(() => setNotice(""), 3000);
            }}
          >
            <Share2 size={13} />
            <span>Share</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success alert-dismissible fade show mb-3">
          {notice}
          <button type="button" className="btn-close" onClick={() => setNotice("")}></button>
        </div>
      )}

      {/* Project Hero Header */}
      <header className="workspace-header-card">
        {project.coverImage && (
          <div className="workspace-cover-banner">
            <img src={getAssetUrl(project.coverImage)} alt={project.title} />
          </div>
        )}

        <div className="workspace-header-content">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="badge-category">{project.category}</span>
                <span className="badge-visibility">
                  {project.visibility === "private" ? (
                    <>
                      <Lock size={11} className="me-1" /> Private
                    </>
                  ) : (
                    <>
                      <Globe size={11} className="me-1" /> Public
                    </>
                  )}
                </span>
                {currentUserRole && (
                  <span className={`badge-role ${currentUserRole}`}>
                    Your Role: {currentUserRole}
                  </span>
                )}
              </div>
              <h1 className="workspace-title">{project.title}</h1>
            </div>

            {/* Overall Progress Widget */}
            <div className="workspace-progress-widget">
              <div className="progress-widget-top">
                <span className="widget-label">Progress</span>
                <strong className="widget-percent">{progressPercent}%</strong>
              </div>
              <div className="progress mini-progress" style={{ width: "140px" }}>
                <div
                  className="progress-bar"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          </div>

          <p className="workspace-short-desc">{project.shortDescription}</p>

          {/* Collaborator Avatars & Capacity */}
          <div className="workspace-members-strip">
            <div className="collaborator-avatars">
              {(project.members || []).slice(0, 5).map((m) => (
                <div
                  key={m.user?._id || m.membershipId}
                  className="avatar avatar-sm"
                  title={`@${m.user?.username} (${m.role})`}
                >
                  {(m.user?.displayName || m.user?.username || "U").slice(0, 1).toUpperCase()}
                </div>
              ))}
              {(project.members || []).length > 5 && (
                <div className="avatar avatar-sm avatar-more">
                  +{(project.members || []).length - 5}
                </div>
              )}
            </div>

            <span className="text-muted small ms-2">
              {(project.members || []).length} of {project.maxCollaborators} collaborators
              {project.openPositions > 0 && ` (${project.openPositions} open spots)`}
            </span>
          </div>
        </div>

        {/* Workspace Tab Navigation */}
        <nav className="workspace-tabs-nav" aria-label="Project Workspace Sections">
          <button
            type="button"
            className={`workspace-tab ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>

          <button
            type="button"
            className={`workspace-tab ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            Tasks ({tasks.length})
          </button>

          <button
            type="button"
            className={`workspace-tab ${activeTab === "discussions" ? "active" : ""}`}
            onClick={() => setActiveTab("discussions")}
          >
            Discussions
          </button>

          <button
            type="button"
            className={`workspace-tab ${activeTab === "members" ? "active" : ""}`}
            onClick={() => setActiveTab("members")}
          >
            Members ({(project.members || []).length})
          </button>

          <button
            type="button"
            className={`workspace-tab ${activeTab === "activity" ? "active" : ""}`}
            onClick={() => setActiveTab("activity")}
          >
            Activity
          </button>

          {canEdit && (
            <button
              type="button"
              className={`workspace-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </button>
          )}
        </nav>
      </header>

      {/* Main Workspace Body Content by Tab */}
      <div className="workspace-tab-content">
        {activeTab === "overview" && (
          /* =======================================================
             TAB 1: WORKSPACE OVERVIEW
             ======================================================= */
          <div className="workspace-overview-tab">
            {/* KPI Cards */}
            <div className="row g-3 mb-4">
              <div className="col-sm-6 col-lg-3">
                <div className="overview-kpi-card">
                  <div className="kpi-label">Completed Tasks</div>
                  <div className="kpi-value text-success">{completedCount}</div>
                  <div className="kpi-sub">{progressPercent}% completion rate</div>
                </div>
              </div>

              <div className="col-sm-6 col-lg-3">
                <div className="overview-kpi-card">
                  <div className="kpi-label">Pending Tasks</div>
                  <div className="kpi-value">{pendingCount}</div>
                  <div className="kpi-sub">Across Kanban columns</div>
                </div>
              </div>

              <div className="col-sm-6 col-lg-3">
                <div className="overview-kpi-card">
                  <div className="kpi-label">Overdue Tasks</div>
                  <div className={`kpi-value ${overdueCount > 0 ? "text-danger" : "text-muted"}`}>
                    {overdueCount}
                  </div>
                  <div className="kpi-sub">Needs attention</div>
                </div>
              </div>

              <div className="col-sm-6 col-lg-3">
                <div className="overview-kpi-card">
                  <div className="kpi-label">Target Completion</div>
                  <div className="kpi-value fs-5 mt-1">
                    {project.expectedCompletionDate ? (
                      new Date(project.expectedCompletionDate).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })
                    ) : (
                      "Open-ended"
                    )}
                  </div>
                  <div className="kpi-sub">Project milestone target</div>
                </div>
              </div>
            </div>

            <div className="row g-4">
              {/* Left Column: Description & Objectives */}
              <div className="col-lg-8">
                {/* Detailed Description */}
                <div className="overview-section-card mb-4">
                  <h3 className="overview-card-heading">About this Project</h3>
                  <div className="overview-description-text">
                    {project.description ? (
                      project.description
                    ) : (
                      <p className="text-muted m-0">No detailed description has been added yet.</p>
                    )}
                  </div>

                  {project.requiredSkills && project.requiredSkills.length > 0 && (
                    <div className="mt-4">
                      <h4 className="skills-subheading">Required Skills / Desired Roles</h4>
                      <div className="d-flex flex-wrap gap-1 mt-2">
                        {project.requiredSkills.map((sk) => (
                          <span key={sk} className="badge-chip">
                            {sk}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Objectives Checklist */}
                {project.objectives && project.objectives.length > 0 && (
                  <div className="overview-section-card mb-4">
                    <h3 className="overview-card-heading">Project Objectives & Milestones</h3>
                    <div className="objectives-checklist">
                      {project.objectives.map((obj) => (
                        <div key={obj.id} className="objective-item">
                          <CheckCircle2
                            size={16}
                            className={obj.completed ? "text-success" : "text-muted"}
                          />
                          <span className={obj.completed ? "completed-obj" : ""}>{obj.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Deadlines, Owner & Recent Activity */}
              <div className="col-lg-4">
                {/* Project Owner */}
                <div className="overview-section-card mb-4">
                  <h4 className="sidebar-subheading">PROJECT OWNER</h4>
                  <div className="d-flex align-items-center gap-2 mt-2">
                    <div className="avatar avatar-md">
                      {(project.ownerId?.displayName || project.ownerId?.username || "U").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="fw-semibold">
                        {project.ownerId?.displayName || project.ownerId?.username}
                      </div>
                      <div className="small text-muted">@{project.ownerId?.username}</div>
                    </div>
                  </div>
                </div>

                {/* Upcoming Deadlines */}
                <div className="overview-section-card mb-4">
                  <h4 className="sidebar-subheading">UPCOMING DEADLINES</h4>
                  {project.upcomingDeadlines && project.upcomingDeadlines.length > 0 ? (
                    <div className="deadlines-list mt-2">
                      {project.upcomingDeadlines.map((t) => (
                        <div key={t._id} className="deadline-item">
                          <Calendar size={13} className="text-muted mt-1" />
                          <div>
                            <div className="deadline-title">{t.title}</div>
                            <div className="deadline-date small text-muted">
                              Due{" "}
                              {new Date(t.dueDate).toLocaleDateString([], {
                                month: "short",
                                day: "numeric"
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted small mt-2 mb-0">No upcoming task deadlines.</p>
                  )}
                </div>

                {/* Recent Activity */}
                <div className="overview-section-card">
                  <h4 className="sidebar-subheading">RECENT ACTIVITY</h4>
                  {activities.length > 0 ? (
                    <div className="mini-activity-stream mt-2">
                      {activities.slice(0, 5).map((act) => (
                        <div key={act._id} className="mini-activity-item">
                          <div className="mini-activity-dot"></div>
                          <div className="mini-activity-content">
                            <span className="fw-semibold">@{act.actorId?.username || "someone"}</span>{" "}
                            <span className="text-muted">
                              {act.action.replace(/_/g, " ")}
                            </span>
                            <div className="small text-muted">
                              {new Date(act.createdAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric"
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted small mt-2 mb-0">No activity recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          /* =======================================================
             TAB 2: KANBAN BOARD & TASK MANAGEMENT
             ======================================================= */
          <ProjectKanban
            projectId={projectId}
            tasks={tasks}
            members={project.members || []}
            currentUser={currentUser}
            canEdit={canEdit}
            onTaskStatusChange={handleTaskStatusChange}
            onTaskCreated={handleTaskCreated}
            onTaskUpdated={handleTaskUpdated}
            onTaskDeleted={handleTaskDeleted}
          />
        )}

        {activeTab === "discussions" && (
          /* =======================================================
             TAB 3: DISCUSSIONS & BRAINSTORMING
             ======================================================= */
          <ProjectDiscussions
            projectId={projectId}
            canParticipate={isMember}
            currentUser={currentUser}
          />
        )}

        {activeTab === "members" && (
          /* =======================================================
             TAB 4: COLLABORATORS & INVITATIONS
             ======================================================= */
          <ProjectMembers
            projectId={projectId}
            members={project.members || []}
            currentUser={currentUser}
            currentUserRole={currentUserRole}
            maxCollaborators={project.maxCollaborators}
            onMembersUpdated={fetchWorkspace}
          />
        )}

        {activeTab === "activity" && (
          /* =======================================================
             TAB 5: FULL ACTIVITY TIMELINE
             ======================================================= */
          <div className="workspace-activity-tab">
            <h3 className="section-title mb-3">Project Activity Timeline</h3>
            {activities.length === 0 ? (
              <p className="text-muted">No activity has been recorded yet.</p>
            ) : (
              <div className="full-activity-stream">
                {activities.map((act) => (
                  <div key={act._id} className="activity-timeline-entry">
                    <div className="avatar avatar-sm">
                      {(act.actorId?.displayName || act.actorId?.username || "U").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="activity-details">
                      <div className="activity-actor-row">
                        <strong>@{act.actorId?.username}</strong>
                        <span className="activity-action-text ms-1">
                          {act.action.replace(/_/g, " ")}
                        </span>
                      </div>

                      {act.details && (
                        <div className="activity-meta-details small text-muted">
                          {act.details.taskTitle && `Task: "${act.details.taskTitle}"`}
                          {act.details.newStatus && ` → moved to ${act.details.newStatus}`}
                          {act.details.inviteeUsername && `invited @${act.details.inviteeUsername}`}
                          {act.details.applicantUsername && `applied to join`}
                          {act.details.title && `"${act.details.title}"`}
                        </div>
                      )}

                      <div className="activity-time small text-muted">
                        {new Date(act.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && canEdit && (
          /* =======================================================
             TAB 6: SETTINGS & LIFECYCLE
             ======================================================= */
          <ProjectSettings
            project={project}
            currentUserRole={currentUserRole}
            onProjectUpdated={fetchWorkspace}
            onProjectArchived={fetchWorkspace}
            onProjectDeleted={onProjectDeleted}
          />
        )}
      </div>
    </div>
  );
}
