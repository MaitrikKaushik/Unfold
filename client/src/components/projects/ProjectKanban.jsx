import React, { useState, useMemo } from "react";
import {
  Kanban,
  List,
  Plus,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  MoreVertical,
  User,
  MessageSquare,
  Tag
} from "lucide-react";
import ProjectTaskModal from "./ProjectTaskModal";

const COLUMNS = [
  { id: "backlog", title: "Backlog", color: "#786B7C" },
  { id: "todo", title: "To Do", color: "#5B4168" },
  { id: "in_progress", title: "In Progress", color: "#FFB49A" },
  { id: "in_review", title: "In Review", color: "#C9B6FF" },
  { id: "completed", title: "Completed", color: "#287A5B" }
];

export default function ProjectKanban({
  projectId,
  tasks = [],
  members = [],
  currentUser,
  canEdit = true,
  onTaskStatusChange,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted
}) {
  const [viewMode, setViewMode] = useState("kanban"); // "kanban" | "list"
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("default");

  // Task modal state
  const [activeTaskModal, setActiveTaskModal] = useState(null); // null, "new", or task object
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterAssignee !== "all") {
        if (filterAssignee === "unassigned" && t.assignedTo) return false;
        if (filterAssignee !== "unassigned" && t.assignedTo?._id !== filterAssignee && t.assignedTo !== filterAssignee) {
          return false;
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = (t.description || "").toLowerCase().includes(q);
        const matchesLabel = (t.labels || []).some((l) => l.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesLabel) return false;
      }
      return true;
    });
  }, [tasks, filterPriority, filterStatus, filterAssignee, search]);

  // Sort tasks
  const sortedTasks = useMemo(() => {
    const list = [...filteredTasks];
    if (sortBy === "dueDate") {
      list.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    } else if (sortBy === "priority") {
      const order = { critical: 4, high: 3, medium: 2, low: 1 };
      list.sort((a, b) => (order[b.priority] || 0) - (order[a.priority] || 0));
    }
    return list;
  }, [filteredTasks, sortBy]);

  // Drag and Drop handlers
  function handleDragStart(e, taskId) {
    e.dataTransfer.setData("text/plain", taskId);
    setDraggedTaskId(taskId);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDrop(e, targetStatus) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDraggedTaskId(null);

    if (!taskId) return;
    const task = tasks.find((t) => t._id === taskId);
    if (task && task.status !== targetStatus) {
      if (onTaskStatusChange) {
        onTaskStatusChange(taskId, targetStatus);
      }
    }
  }

  function isOverdue(dueDate, status) {
    if (!dueDate || status === "completed") return false;
    const d = new Date(dueDate);
    d.setHours(23, 59, 59, 999);
    return d < new Date();
  }

  return (
    <div className="kanban-workspace-pane">
      {/* Controls Bar */}
      <div className="kanban-controls-bar">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className={`btn ${viewMode === "kanban" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("kanban")}
              title="Kanban Board View"
            >
              <Kanban size={14} className="me-1" />
              Board
            </button>
            <button
              type="button"
              className={`btn ${viewMode === "list" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("list")}
              title="Structured List View"
            >
              <List size={14} className="me-1" />
              List
            </button>
          </div>

          {/* Search */}
          <div className="search-input-wrap">
            <Search size={13} className="search-icon" />
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Filter tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Priority filter */}
          <select
            className="form-select form-select-sm auto-width-select"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Assignee filter */}
          <select
            className="form-select form-select-sm auto-width-select"
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <option value="all">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            {members.map((m) => (
              <option key={m.user?._id || m.membershipId} value={m.user?._id}>
                @{m.user?.username}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            className="form-select form-select-sm auto-width-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="default">Default Order</option>
            <option value="dueDate">Due Date</option>
            <option value="priority">Priority</option>
          </select>
        </div>

        {canEdit && (
          <button
            type="button"
            className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            onClick={() => setActiveTaskModal("new")}
          >
            <Plus size={15} strokeWidth={2.4} />
            <span>Add Task</span>
          </button>
        )}
      </div>

      {/* Main Task Views */}
      {viewMode === "kanban" ? (
        /* KANBAN BOARD */
        <div className="kanban-board-scroll">
          <div className="kanban-columns-container">
            {COLUMNS.map((column) => {
              const columnTasks = sortedTasks.filter((t) => t.status === column.id);
              return (
                <div
                  key={column.id}
                  className="kanban-column"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, column.id)}
                >
                  <div className="kanban-column-header">
                    <div className="d-flex align-items-center gap-2">
                      <span className="column-indicator-dot" style={{ backgroundColor: column.color }}></span>
                      <h4 className="column-title">{column.title}</h4>
                    </div>
                    <span className="column-count-badge">{columnTasks.length}</span>
                  </div>

                  <div className="kanban-column-cards">
                    {columnTasks.map((task) => (
                      <div
                        key={task._id}
                        className={`kanban-card ${isOverdue(task.dueDate, task.status) ? "overdue" : ""}`}
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, task._id)}
                        onClick={() => setActiveTaskModal(task)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="kanban-card-top">
                          <span className={`priority-chip ${task.priority}`}>
                            {task.priority}
                          </span>
                          {canEdit && (
                            <div className="dropdown" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="card-quick-move-btn"
                                title="Move status"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextIdx = (COLUMNS.findIndex((c) => c.id === task.status) + 1) % COLUMNS.length;
                                  onTaskStatusChange(task._id, COLUMNS[nextIdx].id);
                                }}
                              >
                                →
                              </button>
                            </div>
                          )}
                        </div>

                        <h5 className="kanban-card-title">{task.title}</h5>

                        {task.description && (
                          <p className="kanban-card-desc">{task.description}</p>
                        )}

                        {task.labels && task.labels.length > 0 && (
                          <div className="kanban-card-labels">
                            {task.labels.slice(0, 3).map((l) => (
                              <span key={l} className="card-label-chip">
                                {l}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="kanban-card-footer">
                          {task.dueDate ? (
                            <span
                              className={`card-date-badge ${
                                isOverdue(task.dueDate, task.status) ? "text-danger" : "text-muted"
                              }`}
                            >
                              <Calendar size={12} className="me-1" />
                              {new Date(task.dueDate).toLocaleDateString([], {
                                month: "short",
                                day: "numeric"
                              })}
                            </span>
                          ) : (
                            <span></span>
                          )}

                          <div className="d-flex align-items-center gap-2">
                            {task.comments && task.comments.length > 0 && (
                              <span className="card-comment-count text-muted small">
                                <MessageSquare size={12} className="me-1" />
                                {task.comments.length}
                              </span>
                            )}

                            {task.assignedTo ? (
                              <div
                                className="avatar avatar-xs"
                                title={task.assignedTo?.displayName || task.assignedTo?.username}
                              >
                                {(task.assignedTo?.displayName || task.assignedTo?.username || "U")
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </div>
                            ) : (
                              <div className="avatar avatar-xs avatar-unassigned" title="Unassigned">
                                <User size={10} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {columnTasks.length === 0 && (
                      <div className="column-empty-placeholder">
                        <span>Drop tasks here</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* STRUCTURED LIST VIEW */
        <div className="table-responsive kanban-list-table-wrap">
          <table className="table table-hover align-middle kanban-table">
            <thead>
              <tr>
                <th style={{ width: "120px" }}>Status</th>
                <th>Task Title</th>
                <th style={{ width: "110px" }}>Priority</th>
                <th style={{ width: "160px" }}>Assignee</th>
                <th style={{ width: "130px" }}>Due Date</th>
                <th style={{ width: "80px" }}>Comments</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-muted">
                    No tasks match the selected criteria.
                  </td>
                </tr>
              ) : (
                sortedTasks.map((task) => (
                  <tr
                    key={task._id}
                    className="clickable-row"
                    onClick={() => setActiveTaskModal(task)}
                  >
                    <td>
                      <span className={`badge-status ${task.status}`}>
                        {COLUMNS.find((c) => c.id === task.status)?.title}
                      </span>
                    </td>
                    <td>
                      <div className="fw-semibold text-truncate" style={{ maxWidth: "340px" }}>
                        {task.title}
                      </div>
                      {task.labels && task.labels.length > 0 && (
                        <div className="d-flex gap-1 mt-1">
                          {task.labels.slice(0, 2).map((l) => (
                            <span key={l} className="card-label-chip">
                              {l}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`priority-chip ${task.priority}`}>{task.priority}</span>
                    </td>
                    <td>
                      {task.assignedTo ? (
                        <div className="d-flex align-items-center gap-1">
                          <div className="avatar avatar-xs">
                            {(task.assignedTo?.displayName || task.assignedTo?.username || "U")
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                          <span className="small text-truncate">@{task.assignedTo?.username}</span>
                        </div>
                      ) : (
                        <span className="text-muted small">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {task.dueDate ? (
                        <span
                          className={`small ${
                            isOverdue(task.dueDate, task.status) ? "text-danger fw-bold" : "text-muted"
                          }`}
                        >
                          {new Date(task.dueDate).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          })}
                        </span>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td>
                      <span className="text-muted small">
                        {task.comments ? task.comments.length : 0}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Task Creation / Edit Modal */}
      {activeTaskModal && (
        <ProjectTaskModal
          isOpen={Boolean(activeTaskModal)}
          onClose={() => setActiveTaskModal(null)}
          projectId={projectId}
          task={activeTaskModal === "new" ? null : activeTaskModal}
          members={members}
          currentUser={currentUser}
          canEdit={canEdit}
          onTaskSaved={(savedTask) => {
            if (activeTaskModal === "new") {
              if (onTaskCreated) onTaskCreated(savedTask);
            } else {
              if (onTaskUpdated) onTaskUpdated(savedTask);
            }
          }}
          onTaskDeleted={onTaskDeleted}
        />
      )}
    </div>
  );
}
