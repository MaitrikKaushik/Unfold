import React, { useState, useEffect, useCallback } from "react";
import { Search, Sparkles, Users, CheckCircle2, Filter, ArrowRight, UserPlus, Lock } from "lucide-react";
import { api, getAssetUrl } from "../../services/api";

const CATEGORIES = [
  "All",
  "Technology",
  "Software Development",
  "Research",
  "Education",
  "Design",
  "Business",
  "Social Impact",
  "Other"
];

export default function ProjectsDiscover({ onSelectProject, onRequestJoinSuccess }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [skill, setSkill] = useState("");
  const [sortBy, setSortBy] = useState("recent"); // "recent" | "progress" | "popular"

  const [joinModalProject, setJoinModalProject] = useState(null);
  const [joinMessage, setJoinMessage] = useState("");
  const [submittingJoin, setSubmittingJoin] = useState(false);
  const [joinNotice, setJoinNotice] = useState("");

  const fetchDiscoverProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (category && category !== "All") params.append("category", category);
      if (skill.trim()) params.append("skill", skill.trim());
      if (sortBy) params.append("sort", sortBy);

      const res = await api(`/projects/discover?${params.toString()}`);
      setProjects(res.projects || []);
    } catch (err) {
      setError(err.message || "Failed to load public projects.");
    } finally {
      setLoading(false);
    }
  }, [search, category, skill, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDiscoverProjects();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchDiscoverProjects]);

  useEffect(() => {
    if (!joinModalProject) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setJoinModalProject(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [joinModalProject]);

  async function handleSendJoinRequest(e) {
    e.preventDefault();
    if (!joinModalProject) return;
    setSubmittingJoin(true);
    try {
      await api(`/projects/${joinModalProject._id}/join-request`, {
        method: "POST",
        body: JSON.stringify({ message: joinMessage.trim() })
      });
      setJoinNotice(`Application to join "${joinModalProject.title}" has been sent!`);
      setJoinModalProject(null);
      setJoinMessage("");
      if (onRequestJoinSuccess) onRequestJoinSuccess();
      fetchDiscoverProjects();
    } catch (err) {
      setError(err.message || "Failed to submit join request.");
    } finally {
      setSubmittingJoin(false);
    }
  }

  return (
    <div className="discover-projects-pane">
      {/* Header */}
      <div className="pane-header-row mb-3">
        <div>
          <span className="eyebrow">EXPLORE & CONTRIBUTE</span>
          <h2 className="pane-title">Discover Projects</h2>
          <p className="pane-desc">
            Explore initiatives created by Unfold members, discover opportunities to apply your skills,
            and collaborate with mission-driven teams.
          </p>
        </div>
      </div>

      {joinNotice && (
        <div className="alert alert-success alert-dismissible fade show mb-3">
          {joinNotice}
          <button type="button" className="btn-close" onClick={() => setJoinNotice("")}></button>
        </div>
      )}

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      {/* Search and Filters Strip */}
      <div className="discover-filter-strip mb-4">
        <div className="row g-2 align-items-center">
          <div className="col-md-5">
            <div className="search-input-wrap">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search by project title, keyword or goal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="col-md-4">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Filter by required skill (e.g. React, UX, Python)"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
            />
          </div>

          <div className="col-md-3">
            <select
              className="form-select form-select-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="recent">Recently Created</option>
              <option value="progress">Highest Progress</option>
              <option value="popular">Most Tasks</option>
            </select>
          </div>
        </div>

        {/* Category Pills Bar */}
        <div className="category-filter-pills mt-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cat-filter-btn ${category === cat ? "active" : ""}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <span>Discovering projects...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="projects-empty-banner">
          <Sparkles size={32} className="text-muted mb-2" />
          <h4>No projects found</h4>
          <p>Try clearing filters or search terms to see available public projects.</p>
        </div>
      ) : (
        <div className="projects-card-grid">
          {projects.map((project) => (
            <div key={project._id} className="project-card discover-card">
              {project.coverImage && (
                <div
                  className="project-card-cover clickable"
                  onClick={() => onSelectProject(project._id)}
                >
                  <img src={getAssetUrl(project.coverImage)} alt={project.title} />
                </div>
              )}
              <div className="project-card-body">
                <div className="project-card-badges">
                  <span className="badge-category">{project.category}</span>
                  <span className="badge-open-positions">
                    {project.openPositions > 0 ? (
                      <span className="text-success">{project.openPositions} open spot{project.openPositions === 1 ? "" : "s"}</span>
                    ) : (
                      <span className="text-muted">Full</span>
                    )}
                  </span>
                </div>

                <h4
                  className="project-card-title clickable"
                  onClick={() => onSelectProject(project._id)}
                >
                  {project.title}
                </h4>
                <p className="project-card-desc">{project.shortDescription}</p>

                {/* Required Skills Chips */}
                {project.requiredSkills && project.requiredSkills.length > 0 && (
                  <div className="card-skills-strip mb-2">
                    {project.requiredSkills.slice(0, 4).map((sk) => (
                      <span key={sk} className="skill-chip">
                        {sk}
                      </span>
                    ))}
                    {project.requiredSkills.length > 4 && (
                      <span className="skill-chip-more">+{project.requiredSkills.length - 4}</span>
                    )}
                  </div>
                )}

                {/* Owner info */}
                <div className="project-owner-strip mb-3">
                  <div className="avatar avatar-xs">
                    {(project.ownerId?.displayName || project.ownerId?.username || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <span className="owner-name">
                    Led by <strong>@{project.ownerId?.username || "creator"}</strong>
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="project-card-progress-wrap mb-3">
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

                {/* Action Row */}
                <div className="discover-card-actions">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm flex-grow-1"
                    onClick={() => onSelectProject(project._id)}
                  >
                    View Project
                  </button>

                  {project.allowJoinRequests && project.openPositions > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setJoinModalProject(project)}
                      title="Apply to join this project"
                    >
                      <UserPlus size={14} className="me-1" />
                      Apply
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Join Request Modal */}
      {joinModalProject && (
        <div className="modal-backdrop" onClick={() => setJoinModalProject(null)}>
          <div className="project-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="project-modal-header">
              <div>
                <span className="eyebrow">APPLICATION</span>
                <h3 className="project-modal-title">Apply to Join</h3>
                <p className="small text-muted m-0">{joinModalProject.title}</p>
              </div>
              <button
                type="button"
                className="project-modal-close"
                onClick={() => setJoinModalProject(null)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSendJoinRequest}>
              <div className="form-group mb-3">
                <label className="form-label">
                  Introduce yourself and what you'd like to contribute:
                </label>
                <textarea
                  className="form-control"
                  rows="4"
                  maxLength={500}
                  placeholder="Share your relevant background, skills, or ideas for this project..."
                  value={joinMessage}
                  onChange={(e) => setJoinMessage(e.target.value)}
                  required
                />
                <div className="text-end text-muted small">{joinMessage.length}/500</div>
              </div>

              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setJoinModalProject(null)}
                  disabled={submittingJoin}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingJoin || !joinMessage.trim()}
                >
                  {submittingJoin ? "Submitting..." : "Send Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
