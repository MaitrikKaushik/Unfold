import React from "react";
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  Users,
  Plus,
  ArrowRight,
  TrendingUp,
  Inbox,
  Sparkles,
  Layers,
  ChevronRight
} from "lucide-react";
import { getAssetUrl } from "../../services/api";

export default function ProjectsOverview({
  myProjects = [],
  invitations = [],
  loading = false,
  error = "",
  onRetry,
  onNavigate,
  onOpenCreate,
  onSelectProject
}) {
  // Compute aggregated stats
  const totalProjects = myProjects.length;
  const ownedProjects = myProjects.filter((p) => p.currentUserRole === "owner").length;
  const totalTasks = myProjects.reduce((acc, p) => acc + (p.stats?.taskCount || 0), 0);
  const completedTasks = myProjects.reduce((acc, p) => acc + (p.stats?.completedTaskCount || 0), 0);
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const pendingInvitesCount = invitations.length;

  if (loading) {
    return (
      <div className="projects-overview-pane">
        <section className="projects-hero-banner placeholder-glow">
          <div className="hero-content">
            <span className="eyebrow-accent">COMMUNITY PROJECTS</span>
            <h1 className="hero-title">Loading project workspaces...</h1>
            <p className="hero-subtitle">Gathering your initiatives, tasks, and collaboration updates.</p>
          </div>
        </section>

        <section className="projects-stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="project-stat-card placeholder-glow">
              <div className="stat-top">
                <span className="placeholder col-6" style={{ height: "14px", borderRadius: "4px" }}></span>
                <span className="stat-icon-wrap placeholder"></span>
              </div>
              <div className="stat-number placeholder col-4 mt-2" style={{ height: "30px", borderRadius: "6px" }}></div>
              <div className="stat-subtext placeholder col-8 mt-2" style={{ height: "12px", borderRadius: "4px" }}></div>
            </div>
          ))}
        </section>

        <div className="loading-state py-4 text-center">
          <div className="loading-spinner mb-2"></div>
          <span className="text-muted small">Loading project data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="projects-overview-pane">
        <div className="alert alert-danger d-flex align-items-center justify-content-between">
          <span>{error}</span>
          {onRetry && (
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="projects-overview-pane">
      {/* Banner */}
      <section className="projects-hero-banner">
        <div className="hero-content">
          <span className="eyebrow-accent">COMMUNITY PROJECTS</span>
          <h1 className="hero-title">Turn conversations into real-world work.</h1>
          <p className="hero-subtitle">
            Collaborate with peers, coordinate tasks on Kanban boards, track shared progress,
            and build meaningful initiatives across the Unfold community.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
              onClick={onOpenCreate}
            >
              <Plus size={16} strokeWidth={2.4} />
              <span>Create Project</span>
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2"
              onClick={() => onNavigate("discover")}
            >
              <Sparkles size={15} strokeWidth={2.2} />
              <span>Discover Projects</span>
            </button>
          </div>
        </div>
      </section>

      {/* Invitations callout if any pending */}
      {pendingInvitesCount > 0 && (
        <div
          className="projects-invitation-callout"
          onClick={() => onNavigate("invitations")}
          role="button"
          tabIndex={0}
        >
          <div className="d-flex align-items-center gap-3">
            <div className="callout-icon-wrap">
              <Inbox size={20} strokeWidth={2.2} />
            </div>
            <div>
              <strong>You have {pendingInvitesCount} pending project invitation{pendingInvitesCount === 1 ? "" : "s"}!</strong>
              <p className="m-0 text-muted small">Collaborators have invited you to join their project workspaces.</p>
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-primary">
            <span>Review</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <section className="projects-stats-grid">
        <div className="project-stat-card">
          <div className="stat-top">
            <span className="stat-label">Active Projects</span>
            <span className="stat-icon-wrap">
              <FolderKanban size={16} strokeWidth={2.2} />
            </span>
          </div>
          <div className="stat-number">{totalProjects}</div>
          <div className="stat-subtext">{ownedProjects} created by you</div>
        </div>

        <div className="project-stat-card">
          <div className="stat-top">
            <span className="stat-label">Completed Tasks</span>
            <span className="stat-icon-wrap mint">
              <CheckCircle2 size={16} strokeWidth={2.2} />
            </span>
          </div>
          <div className="stat-number">{completedTasks}</div>
          <div className="stat-subtext">out of {totalTasks} total tasks</div>
        </div>

        <div className="project-stat-card">
          <div className="stat-top">
            <span className="stat-label">Overall Progress</span>
            <span className="stat-icon-wrap lavender">
              <TrendingUp size={16} strokeWidth={2.2} />
            </span>
          </div>
          <div className="stat-number">{overallProgress}%</div>
          <div className="progress mini-progress">
            <div className="progress-bar" style={{ width: `${overallProgress}%` }}></div>
          </div>
        </div>

        <div className="project-stat-card">
          <div className="stat-top">
            <span className="stat-label">Pending Invitations</span>
            <span className="stat-icon-wrap peach">
              <Users size={16} strokeWidth={2.2} />
            </span>
          </div>
          <div className="stat-number">{pendingInvitesCount}</div>
          <div className="stat-subtext">Awaiting your response</div>
        </div>
      </section>

      {/* Recent Projects Section */}
      <section className="projects-section-block">
        <div className="section-header-row">
          <div>
            <h3 className="section-title">Your Active Projects</h3>
            <p className="section-subtitle">Jump back into your active workspaces</p>
          </div>
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-decoration-none view-all-link"
            onClick={() => onNavigate("my_projects")}
          >
            <span>View all</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {myProjects.length === 0 ? (
          <div className="projects-empty-banner">
            <div className="empty-icon-wrap">
              <Layers size={24} strokeWidth={2} />
            </div>
            <h4>No projects yet</h4>
            <p>You haven't created or joined any projects yet. Start one or explore community initiatives!</p>
            <div className="d-flex gap-2 justify-content-center">
              <button type="button" className="btn btn-primary btn-sm" onClick={onOpenCreate}>
                <Plus size={14} className="me-1" />
                Create a Project
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onNavigate("discover")}>
                Discover Projects
              </button>
            </div>
          </div>
        ) : (
          <div className="projects-card-grid">
            {myProjects.slice(0, 6).map((project) => (
              <div
                key={project._id}
                className="project-card"
                onClick={() => onSelectProject(project._id)}
                role="button"
                tabIndex={0}
              >
                {project.coverImage && (
                  <div className="project-card-cover">
                    <img src={getAssetUrl(project.coverImage)} alt={project.title} />
                  </div>
                )}
                <div className="project-card-body">
                  <div className="project-card-badges">
                    <span className="badge-category">{project.category}</span>
                    <span className={`badge-role ${project.currentUserRole}`}>
                      {project.currentUserRole}
                    </span>
                  </div>

                  <h4 className="project-card-title">{project.title}</h4>
                  <p className="project-card-desc">{project.shortDescription}</p>

                  {/* Progress */}
                  <div className="project-card-progress-wrap">
                    <div className="d-flex justify-content-between small text-muted mb-1">
                      <span>Progress</span>
                      <strong>{project.stats?.progress || 0}%</strong>
                    </div>
                    <div className="progress card-progress">
                      <div
                        className="progress-bar"
                        style={{ width: `${project.stats?.progress || 0}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="project-card-footer">
                    <div className="collaborator-avatars">
                      {(project.collaborators || []).slice(0, 3).map((collab, idx) => (
                        <div
                          key={collab._id || idx}
                          className="avatar avatar-xs"
                          title={collab.displayName || collab.username}
                        >
                          {(collab.displayName || collab.username || "U").slice(0, 1).toUpperCase()}
                        </div>
                      ))}
                      {(project.collaborators || []).length > 3 && (
                        <div className="avatar avatar-xs avatar-more">
                          +{(project.collaborators || []).length - 3}
                        </div>
                      )}
                    </div>

                    <div className="project-card-tasks-count">
                      <CheckCircle2 size={13} className="me-1 text-muted" />
                      <span>
                        {project.stats?.completedTaskCount || 0}/{project.stats?.taskCount || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
