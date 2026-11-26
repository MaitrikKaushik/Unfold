import React, { useState, useEffect } from "react";
import { Archive, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { api } from "../../services/api";

export default function ProjectsArchived({ onSelectProject, onProjectUpdated }) {
  const [archivedProjects, setArchivedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadArchived() {
    setLoading(true);
    setError("");
    try {
      const res = await api("/projects/archived");
      setArchivedProjects(res.projects || []);
    } catch (err) {
      setError(err.message || "Failed to load archived projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadArchived();
  }, []);

  async function handleUnarchive(projectId) {
    setError("");
    setNotice("");
    try {
      await api(`/projects/${projectId}/unarchive`, { method: "POST" });
      setNotice("Project restored to active state!");
      await loadArchived();
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      setError(err.message || "Failed to unarchive project.");
    }
  }

  async function handleDelete(projectId) {
    if (!window.confirm("Are you sure you want to permanently delete this project? This cannot be undone.")) {
      return;
    }
    setError("");
    setNotice("");
    try {
      await api(`/projects/${projectId}`, { method: "DELETE" });
      setNotice("Project deleted permanently.");
      await loadArchived();
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      setError(err.message || "Failed to delete project.");
    }
  }

  return (
    <div className="archived-projects-pane">
      <div className="pane-header-row mb-3">
        <div>
          <span className="eyebrow">ARCHIVE</span>
          <h2 className="pane-title">Archived Projects</h2>
          <p className="pane-desc">Inactive projects preserved for reference. Owners can restore or permanently delete them.</p>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success alert-dismissible fade show mb-3">
          {notice}
          <button type="button" className="btn-close" onClick={() => setNotice("")}></button>
        </div>
      )}

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <span>Loading archive...</span>
        </div>
      ) : archivedProjects.length === 0 ? (
        <div className="projects-empty-banner">
          <Archive size={32} className="text-muted mb-2" />
          <h4>No archived projects</h4>
          <p>Projects you or your team archive will be stored here safely.</p>
        </div>
      ) : (
        <div className="archived-list">
          {archivedProjects.map((project) => (
            <div key={project._id} className="archived-card">
              <div className="archived-card-details">
                <span className="badge-category mb-1">{project.category}</span>
                <h4
                  className="archived-card-title clickable"
                  onClick={() => onSelectProject(project._id)}
                >
                  {project.title}
                </h4>
                <p className="archived-card-desc">{project.shortDescription}</p>
                <div className="text-muted small">
                  {project.stats?.taskCount || 0} tasks · {project.stats?.progress || 0}% progress · Role: {project.currentUserRole}
                </div>
              </div>

              {project.currentUserRole === "owner" && (
                <div className="archived-actions">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                    onClick={() => handleUnarchive(project._id)}
                    title="Restore to active projects"
                  >
                    <RotateCcw size={14} />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
                    onClick={() => handleDelete(project._id)}
                    title="Delete permanently"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
