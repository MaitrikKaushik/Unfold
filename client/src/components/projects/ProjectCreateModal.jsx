import React, { useState } from "react";
import { X, Plus, Trash2, Calendar, Users, Eye, Sparkles, Image, CheckCircle2 } from "lucide-react";
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

export default function ProjectCreateModal({ isOpen, onClose, onProjectCreated, communities = [] }) {
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Technology");
  const [visibility, setVisibility] = useState("public");
  const [communityId, setCommunityId] = useState("");
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("");
  const [maxCollaborators, setMaxCollaborators] = useState(10);
  const [skillInput, setSkillInput] = useState("");
  const [requiredSkills, setRequiredSkills] = useState([]);
  const [objectives, setObjectives] = useState([""]);
  const [coverImage, setCoverImage] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  function handleAddObjective() {
    if (objectives.length < 15) {
      setObjectives([...objectives, ""]);
    }
  }

  function handleObjectiveChange(index, val) {
    const updated = [...objectives];
    updated[index] = val;
    setObjectives(updated);
  }

  function handleRemoveObjective(index) {
    if (objectives.length > 1) {
      setObjectives(objectives.filter((_, i) => i !== index));
    } else {
      setObjectives([""]);
    }
  }

  function handleAddSkill(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = skillInput.trim().replace(/^,+|,+$/g, "");
      if (val && !requiredSkills.includes(val) && requiredSkills.length < 12) {
        setRequiredSkills([...requiredSkills, val]);
        setSkillInput("");
      }
    }
  }

  function handleRemoveSkill(skillToRemove) {
    setRequiredSkills(requiredSkills.filter((s) => s !== skillToRemove));
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setCoverImage(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!title.trim() || title.trim().length < 3) {
      setError("Project title must be at least 3 characters.");
      return;
    }
    if (!shortDescription.trim() || shortDescription.trim().length < 10) {
      setError("Please provide a concise short description (at least 10 characters).");
      return;
    }

    setLoading(true);

    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("shortDescription", shortDescription.trim());
      if (description.trim()) form.append("description", description.trim());
      form.append("category", category);
      form.append("visibility", visibility);
      if (visibility === "community" && communityId) {
        form.append("communityId", communityId);
      }
      if (expectedCompletionDate) {
        form.append("expectedCompletionDate", expectedCompletionDate);
      }
      form.append("maxCollaborators", Number(maxCollaborators) || 10);

      const cleanObjs = objectives.map((o) => o.trim()).filter(Boolean);
      form.append("objectives", JSON.stringify(cleanObjs));
      form.append("requiredSkills", JSON.stringify(requiredSkills));

      if (coverImage) {
        form.append("coverImage", coverImage);
      }

      const res = await api("/projects", {
        method: "POST",
        body: form
      });

      if (onProjectCreated) {
        onProjectCreated(res.project);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create project.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="project-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="project-modal-header">
          <div>
            <span className="eyebrow">NEW COMMUNITY PROJECT</span>
            <h2 className="project-modal-title">Create a Project</h2>
          </div>
          <button type="button" className="project-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        {error && <div className="alert alert-danger mb-3">{error}</div>}

        <form onSubmit={handleSubmit} className="project-form">
          {/* Title */}
          <div className="form-group mb-3">
            <label className="form-label">
              Project Title <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Open-Source AI Ethics Toolkit"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Short Description */}
          <div className="form-group mb-3">
            <label className="form-label">
              Short Description <span className="text-danger">*</span>
              <small className="text-muted ms-2">(1-2 sentences for discovery cards)</small>
            </label>
            <textarea
              className="form-control"
              rows="2"
              placeholder="A brief summary of what this project aims to achieve..."
              maxLength={250}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              required
            />
            <div className="text-end text-muted small">{shortDescription.length}/250</div>
          </div>

          {/* Detailed Description */}
          <div className="form-group mb-3">
            <label className="form-label">Detailed Description / Vision</label>
            <textarea
              className="form-control"
              rows="4"
              placeholder="Explain the background, methodology, problem being solved, and how collaborators can contribute..."
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Category & Visibility Row */}
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
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
              >
                <option value="public">Public (Discoverable by everyone)</option>
                <option value="community">Community Only (Restricted to community members)</option>
                <option value="private">Private (Invite only)</option>
              </select>
            </div>
          </div>

          {/* Associated Community if visibility is community */}
          {visibility === "community" && (
            <div className="form-group mb-3">
              <label className="form-label">Associated Community</label>
              <select
                className="form-select"
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
              >
                <option value="">Select a community...</option>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Capacity & Completion Date */}
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label">
                <Users size={14} className="me-1" />
                Max Collaborators
              </label>
              <input
                type="number"
                className="form-control"
                min="1"
                max="100"
                value={maxCollaborators}
                onChange={(e) => setMaxCollaborators(e.target.value)}
              />
              <small className="text-muted">Total number of contributors who can join</small>
            </div>

            <div className="col-md-6">
              <label className="form-label">
                <Calendar size={14} className="me-1" />
                Target Completion Date
              </label>
              <input
                type="date"
                className="form-control"
                value={expectedCompletionDate}
                onChange={(e) => setExpectedCompletionDate(e.target.value)}
              />
            </div>
          </div>

          {/* Required Skills */}
          <div className="form-group mb-3">
            <label className="form-label">Required Skills / Roles</label>
            <div className="d-flex flex-wrap gap-1 mb-2">
              {requiredSkills.map((skill) => (
                <span key={skill} className="badge-chip">
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="chip-remove-btn"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              className="form-control"
              placeholder="Type a skill and press Enter or comma (e.g. React, UX, Python, Copywriting)"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={handleAddSkill}
            />
          </div>

          {/* Objectives */}
          <div className="form-group mb-3">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label className="form-label m-0">Project Objectives / Milestones</label>
              <button
                type="button"
                className="btn btn-sm btn-link p-0 text-decoration-none"
                onClick={handleAddObjective}
              >
                + Add Objective
              </button>
            </div>
            <div className="objectives-inputs-list">
              {objectives.map((obj, idx) => (
                <div key={idx} className="input-group input-group-sm mb-2">
                  <span className="input-group-text bg-light">{idx + 1}</span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={`Objective ${idx + 1}...`}
                    value={obj}
                    onChange={(e) => handleObjectiveChange(idx, e.target.value)}
                  />
                  {objectives.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => handleRemoveObjective(idx)}
                      title="Remove objective"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Cover Image */}
          <div className="form-group mb-4">
            <label className="form-label">
              <Image size={14} className="me-1" />
              Cover Image (Optional)
            </label>
            <input
              type="file"
              accept="image/*"
              className="form-control"
              onChange={handleImageChange}
            />
            {coverPreview && (
              <div className="mt-2 cover-preview-wrap">
                <img src={coverPreview} alt="Cover preview" className="cover-preview-img" />
              </div>
            )}
          </div>

          <div className="modal-actions-footer">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !title.trim() || !shortDescription.trim()}
            >
              {loading ? "Creating Project..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
