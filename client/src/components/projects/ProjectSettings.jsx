import React, { useState } from "react";
import { Archive, Trash2, RotateCcw, Save, AlertTriangle } from "lucide-react";
import { api } from "../../services/api";

const CATEGORIES = [
  "Technology",
  "Software Development",
  "Research",
  "Education",
  "Design",
  "Business",
  "Social Impact",
  "Other"
];

export default function ProjectSettings({
  project,
  currentUserRole,
  onProjectUpdated,
  onProjectArchived,
  onProjectDeleted
}) {
  const isOwner = currentUserRole === "owner";
  const isAdmin = currentUserRole === "admin" || isOwner;

  const [title, setTitle] = useState(project.title || "");
  const [shortDescription, setShortDescription] = useState(project.shortDescription || "");
  const [description, setDescription] = useState(project.description || "");
  const [category, setCategory] = useState(project.category || "Technology");
  const [visibility, setVisibility] = useState(project.visibility || "public");
  const [maxCollaborators, setMaxCollaborators] = useState(project.maxCollaborators || 10);
  const [allowJoinRequests, setAllowJoinRequests] = useState(project.allowJoinRequests !== false);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleSaveSettings(e) {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await api(`/projects/${project._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          shortDescription: shortDescription.trim(),
          description: description.trim(),
          category,
          visibility,
          maxCollaborators: Number(maxCollaborators) || 10,
          allowJoinRequests
        })
      });
      setNotice("Project settings saved successfully.");
      if (onProjectUpdated) onProjectUpdated(res.project);
    } catch (err) {
      setError(err.message || "Failed to update project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (!isOwner) return;
    setError("");
    setNotice("");
    try {
      if (project.status === "archived") {
        await api(`/projects/${project._id}/unarchive`, { method: "POST" });
        setNotice("Project restored to active state!");
      } else {
        await api(`/projects/${project._id}/archive`, { method: "POST" });
        setNotice("Project archived.");
      }
      if (onProjectArchived) onProjectArchived();
    } catch (err) {
      setError(err.message || "Failed to update project status.");
    }
  }

  async function handleDeleteProject() {
    if (!isOwner) return;
    const confirmName = window.prompt(`To permanently delete this project, type the project title "${project.title}":`);
    if (confirmName !== project.title) {
      alert("Project title did not match. Deletion cancelled.");
      return;
    }

    try {
      await api(`/projects/${project._id}`, { method: "DELETE" });
      if (onProjectDeleted) onProjectDeleted();
    } catch (err) {
      setError(err.message || "Failed to delete project.");
    }
  }

  return (
    <div className="project-settings-pane">
      {notice && (
        <div className="alert alert-success alert-dismissible fade show mb-3">
          {notice}
          <button type="button" className="btn-close" onClick={() => setNotice("")}></button>
        </div>
      )}

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      <div className="pane-header-row mb-3">
        <div>
          <span className="eyebrow">CONFIGURATION</span>
          <h3 className="pane-title">Project Settings</h3>
          <p className="pane-desc">Manage project visibility, capacity, information, and lifecycle.</p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="settings-form-layout">
        {/* Title */}
        <div className="form-group mb-3">
          <label className="form-label">Project Title</label>
          <input
            type="text"
            className="form-control"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isAdmin || saving}
            required
          />
        </div>

        {/* Short Description */}
        <div className="form-group mb-3">
          <label className="form-label">Short Description</label>
          <textarea
            className="form-control"
            rows="2"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            disabled={!isAdmin || saving}
            maxLength={250}
            required
          />
        </div>

        {/* Detailed Description */}
        <div className="form-group mb-3">
          <label className="form-label">Detailed Description</label>
          <textarea
            className="form-control"
            rows="4"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isAdmin || saving}
            maxLength={5000}
          />
        </div>

        {/* Category & Visibility */}
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!isAdmin || saving}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-6">
            <label className="form-label">Visibility</label>
            <select
              className="form-select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              disabled={!isAdmin || saving}
            >
              <option value="public">Public</option>
              <option value="community">Community Only</option>
              <option value="private">Private (Invite only)</option>
            </select>
          </div>
        </div>

        {/* Capacity & Join Requests */}
        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <label className="form-label">Max Collaborator Capacity</label>
            <input
              type="number"
              className="form-control"
              min="1"
              max="100"
              value={maxCollaborators}
              onChange={(e) => setMaxCollaborators(e.target.value)}
              disabled={!isAdmin || saving}
            />
          </div>

          <div className="col-md-6 d-flex align-items-center pt-4">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="joinRequestsCheck"
                checked={allowJoinRequests}
                onChange={(e) => setAllowJoinRequests(e.target.checked)}
                disabled={!isAdmin || saving}
              />
              <label className="form-check-label" htmlFor="joinRequestsCheck">
                Allow Unfold members to submit join applications
              </label>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="mb-5">
            <button
              type="submit"
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
              disabled={saving}
            >
              <Save size={14} />
              <span>{saving ? "Saving..." : "Save Settings"}</span>
            </button>
          </div>
        )}
      </form>

      {/* Danger Zone (Archive & Delete) */}
      {isOwner && (
        <div className="danger-zone-card mt-4">
          <h4 className="danger-zone-title d-flex align-items-center gap-2">
            <AlertTriangle size={18} className="text-danger" />
            <span>Danger Zone</span>
          </h4>
          <p className="text-muted small">
            Actions here affect the availability of this project for all collaborators.
          </p>

          <div className="danger-zone-actions-list">
            <div className="danger-action-row">
              <div>
                <strong>{project.status === "archived" ? "Restore Project" : "Archive Project"}</strong>
                <p className="small text-muted m-0">
                  {project.status === "archived"
                    ? "Move this project back to active workspaces."
                    : "Archived projects become read-only and are hidden from discovery."}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={handleArchiveToggle}
              >
                {project.status === "archived" ? "Restore" : "Archive"}
              </button>
            </div>

            <div className="danger-action-row border-top pt-3 mt-3">
              <div>
                <strong className="text-danger">Delete Project Permanently</strong>
                <p className="small text-muted m-0">
                  Permanently remove this project, all tasks, discussions, and member associations.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleDeleteProject}
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
