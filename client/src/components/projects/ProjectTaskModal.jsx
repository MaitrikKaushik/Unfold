import React, { useState, useEffect } from "react";
import {
  X,
  Calendar,
  User,
  Flag,
  Tag,
  MessageSquare,
  Send,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { api } from "../../services/api";

const PRIORITIES = ["low", "medium", "high", "critical"];
const STATUSES = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "in_review", label: "In Review" },
  { id: "completed", label: "Completed" }
];

export default function ProjectTaskModal({
  isOpen,
  onClose,
  projectId,
  task = null, // null for create, object for edit
  members = [],
  currentUser,
  canEdit = true,
  onTaskSaved,
  onTaskDeleted
}) {
  const isEditing = Boolean(task && task._id);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [labels, setLabels] = useState([]);

  // Task comments state
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (task) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setStatus(task.status || "todo");
      setPriority(task.priority || "medium");
      setAssignedTo(task.assignedTo?._id || task.assignedTo || "");
      setStartDate(task.startDate ? task.startDate.slice(0, 10) : "");
      setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
      setLabels(task.labels || []);
      setComments(task.comments || []);

      if (task._id) {
        // Fetch fresh comments
        api(`/projects/${projectId}/tasks/${task._id}`)
          .then((res) => {
            if (res.task?.comments) {
              setComments(res.task.comments);
            }
          })
          .catch(() => {});
      }
    } else {
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setAssignedTo("");
      setStartDate("");
      setDueDate("");
      setLabels([]);
      setComments([]);
    }
    setError("");
  }, [task, projectId, isOpen]);

  if (!isOpen) return null;

  function handleAddLabel(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = labelInput.trim().replace(/^,+|,+$/g, "");
      if (val && !labels.includes(val) && labels.length < 8) {
        setLabels([...labels, val]);
        setLabelInput("");
      }
    }
  }

  function handleRemoveLabel(labelToRemove) {
    setLabels(labels.filter((l) => l !== labelToRemove));
  }

  async function handleSaveTask(e) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        assignedTo: assignedTo || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        labels
      };

      let resultTask;
      if (isEditing) {
        const res = await api(`/projects/${projectId}/tasks/${task._id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        resultTask = res.task;
      } else {
        const res = await api(`/projects/${projectId}/tasks`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        resultTask = res.task;
      }

      if (onTaskSaved) onTaskSaved(resultTask);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save task.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTask() {
    if (!isEditing) return;
    if (!window.confirm(`Delete task "${task.title}"?`)) return;

    setLoading(true);
    try {
      await api(`/projects/${projectId}/tasks/${task._id}`, {
        method: "DELETE"
      });
      if (onTaskDeleted) onTaskDeleted(task._id);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to delete task.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!newComment.trim() || !task?._id) return;

    setSubmittingComment(true);
    try {
      const res = await api(`/projects/${projectId}/tasks/${task._id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: newComment.trim() })
      });
      setComments([...comments, res.comment]);
      setNewComment("");
    } catch (err) {
      setError(err.message || "Failed to post comment.");
    } finally {
      setSubmittingComment(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="project-task-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="project-modal-header">
          <div className="d-flex align-items-center gap-2">
            <span className="eyebrow m-0">{isEditing ? "TASK DETAILS" : "CREATE TASK"}</span>
            {isEditing && (
              <span className={`badge-status ${status}`}>
                {STATUSES.find((s) => s.id === status)?.label}
              </span>
            )}
          </div>
          <button type="button" className="project-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        {error && <div className="alert alert-danger mb-3">{error}</div>}

        <div className="task-modal-body-layout">
          {/* Main Form (Left / Upper) */}
          <form onSubmit={handleSaveTask} className="task-main-form">
            {/* Title */}
            <div className="form-group mb-3">
              <label className="form-label">Task Title</label>
              <input
                type="text"
                className="form-control"
                placeholder="What needs to be done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEdit}
                required
              />
            </div>

            {/* Description */}
            <div className="form-group mb-3">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows="4"
                placeholder="Add details, acceptance criteria, or context for collaborators..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            {/* Status & Priority Row */}
            <div className="row g-2 mb-3">
              <div className="col-md-6">
                <label className="form-label">Status</label>
                <select
                  className="form-select form-select-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={!canEdit}
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-6">
                <label className="form-label">Priority</label>
                <select
                  className="form-select form-select-sm"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={!canEdit}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Assignee & Due Date Row */}
            <div className="row g-2 mb-3">
              <div className="col-md-6">
                <label className="form-label">
                  <User size={13} className="me-1" />
                  Assignee
                </label>
                <select
                  className="form-select form-select-sm"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user?._id || m.membershipId} value={m.user?._id}>
                      @{m.user?.username} ({m.user?.displayName || m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-6">
                <label className="form-label">
                  <Calendar size={13} className="me-1" />
                  Due Date
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Labels */}
            <div className="form-group mb-4">
              <label className="form-label">
                <Tag size={13} className="me-1" />
                Labels / Tags
              </label>
              <div className="d-flex flex-wrap gap-1 mb-2">
                {labels.map((lbl) => (
                  <span key={lbl} className="badge-chip">
                    <span>{lbl}</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLabel(lbl)}
                        className="chip-remove-btn"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {canEdit && (
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Type label and press Enter (e.g. Frontend, Bug, Feature)"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={handleAddLabel}
                />
              )}
            </div>

            {/* Action Buttons */}
            <div className="d-flex justify-content-between align-items-center pt-2 border-top">
              {isEditing && canEdit ? (
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
                  onClick={handleDeleteTask}
                  disabled={loading}
                >
                  <Trash2 size={14} />
                  <span>Delete Task</span>
                </button>
              ) : (
                <div></div>
              )}

              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                {canEdit && (
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={loading || !title.trim()}
                  >
                    {loading ? "Saving..." : isEditing ? "Save Changes" : "Create Task"}
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Task Comments Sidebar (Right / Lower) when editing */}
          {isEditing && (
            <div className="task-comments-pane">
              <h4 className="comments-heading">
                <MessageSquare size={14} className="me-1" />
                Comments ({comments.length})
              </h4>

              <div className="task-comments-list">
                {comments.length === 0 ? (
                  <p className="text-muted small">No comments yet. Discuss this task below.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c._id} className="task-comment-item">
                      <div className="comment-header">
                        <div className="avatar avatar-xs">
                          {(c.authorId?.displayName || c.authorId?.username || "U").slice(0, 1).toUpperCase()}
                        </div>
                        <span className="comment-author">@{c.authorId?.username}</span>
                        <span className="comment-time">
                          {new Date(c.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="comment-text">{c.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Comment composer */}
              <form onSubmit={handleAddComment} className="comment-form mt-2">
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    disabled={submittingComment}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submittingComment || !newComment.trim()}
                  >
                    <Send size={13} />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
