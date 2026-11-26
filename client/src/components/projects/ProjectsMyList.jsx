import React, { useState, useMemo } from "react";
import { Plus, Search, Filter, FolderKanban, CheckCircle2, Users, ArrowUpRight, Lock, Globe } from "lucide-react";
import { getAssetUrl } from "../../services/api";

export default function ProjectsMyList({
  projects = [],
  loading = false,
  onOpenCreate,
  onSelectProject
}) {
  const [filterRole, setFilterRole] = useState("all"); // "all" | "owner" | "collaborator"
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (filterRole === "owner" && p.currentUserRole !== "owner") return false;
      if (filterRole === "collaborator" && (p.currentUserRole === "owner" || p.currentUserRole === "viewer")) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(q);
        const matchesDesc = (p.shortDescription || "").toLowerCase().includes(q);
        const matchesSkills = (p.requiredSkills || []).some((s) => s.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesSkills) return false;
      }
      return true;
    });
  }, [projects, filterRole, categoryFilter, search]);

  const categories = useMemo(() => {
    const set = new Set(projects.map((p) => p.category).filter(Boolean));
    return Array.from(set);
  }, [projects]);

  return (
    <div className="my-projects-pane">
      {/* Top Header */}
      <div className="pane-header-row">
        <div>
          <span className="eyebrow">YOUR WORKSPACES</span>
          <h2 className="pane-title">My Projects</h2>
          <p className="pane-desc">Projects you own, manage, or collaborate on.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm d-flex align-items-center gap-2" onClick={onOpenCreate}>
          <Plus size={16} strokeWidth={2.4} />
          <span>New Project</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="projects-filter-bar">
        <div className="role-tabs">
          <button
            type="button"
            className={`role-tab ${filterRole === "all" ? "active" : ""}`}
            onClick={() => setFilterRole("all")}
          >
            All Projects ({projects.length})
          </button>
          <button
            type="button"
            className={`role-tab ${filterRole === "owner" ? "active" : ""}`}
            onClick={() => setFilterRole("owner")}
          >
            Owned by Me ({projects.filter((p) => p.currentUserRole === "owner").length})
          </button>
          <button
            type="button"
            className={`role-tab ${filterRole === "collaborator" ? "active" : ""}`}
            onClick={() => setFilterRole("collaborator")}
          >
            Collaborating ({projects.filter((p) => p.currentUserRole === "collaborator" || p.currentUserRole === "admin").length})
          </button>
        </div>

        <div className="filter-controls-group">
          {categories.length > 0 && (
            <select
              className="form-select form-select-sm category-dropdown"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          <div className="search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Project Grid */}
      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <span>Loading your projects...</span>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="projects-empty-banner">
          <FolderKanban size={32} className="text-muted mb-2" />
          <h4>No projects found</h4>
          <p>
            {search || categoryFilter !== "all" || filterRole !== "all"
              ? "No projects match your current filters. Try resetting search or role filter."
              : "You haven't created or joined any projects yet."}
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenCreate}>
            <Plus size={14} className="me-1" />
            Create a Project
          </button>
        </div>
      ) : (
        <div className="projects-card-grid">
          {filteredProjects.map((project) => (
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
                  <div className="d-flex align-items-center gap-1">
                    {project.visibility === "private" ? (
                      <span className="badge-visibility" title="Private project">
                        <Lock size={11} />
                      </span>
                    ) : (
                      <span className="badge-visibility" title="Public project">
                        <Globe size={11} />
                      </span>
                    )}
                    <span className={`badge-role ${project.currentUserRole}`}>
                      {project.currentUserRole}
                    </span>
                  </div>
                </div>

                <h4 className="project-card-title">{project.title}</h4>
                <p className="project-card-desc">{project.shortDescription}</p>

                {/* Progress Bar */}
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
                      {project.stats?.completedTaskCount || 0}/{project.stats?.taskCount || 0} tasks
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
