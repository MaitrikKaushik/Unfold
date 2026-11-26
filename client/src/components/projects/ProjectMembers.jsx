import React, { useState, useEffect } from "react";
import { Users, UserPlus, Shield, X, Check, Trash2, Mail, Clock } from "lucide-react";
import { api } from "../../services/api";

const ROLES = [
  { id: "admin", label: "Admin", desc: "Manage tasks, invites, and settings" },
  { id: "collaborator", label: "Collaborator", desc: "Create/update tasks and participate" },
  { id: "viewer", label: "Viewer", desc: "Read-only access to workspace" }
];

export default function ProjectMembers({
  projectId,
  members = [],
  currentUser,
  currentUserRole,
  maxCollaborators = 10,
  onMembersUpdated
}) {
  const isOwner = currentUserRole === "owner";
  const isAdmin = currentUserRole === "admin" || isOwner;

  const [invitations, setInvitations] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState("collaborator");
  const [inviteMessage, setInviteMessage] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPendingInvitations() {
    if (!isAdmin) return;
    setLoadingInvites(true);
    try {
      const res = await api(`/projects/${projectId}/invitations`);
      setInvitations(res.invitations || []);
    } catch {
      // Ignore if viewer
    } finally {
      setLoadingInvites(false);
    }
  }

  useEffect(() => {
    loadPendingInvitations();
  }, [projectId, isAdmin]);

  async function handleSendInvite(e) {
    e.preventDefault();
    if (!inviteUsername.trim()) return;

    setSendingInvite(true);
    setError("");
    setNotice("");
    try {
      await api(`/projects/${projectId}/invite`, {
        method: "POST",
        body: JSON.stringify({
          username: inviteUsername.trim(),
          role: inviteRole,
          message: inviteMessage.trim()
        })
      });
      setNotice(`Invitation sent to @${inviteUsername.trim()}!`);
      setShowInviteModal(false);
      setInviteUsername("");
      setInviteMessage("");
      loadPendingInvitations();
      if (onMembersUpdated) onMembersUpdated();
    } catch (err) {
      setError(err.message || "Failed to send invitation.");
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleRoleChange(userId, newRole) {
    if (!isOwner) return;
    setError("");
    setNotice("");
    try {
      await api(`/projects/${projectId}/members/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole })
      });
      setNotice("Member role updated.");
      if (onMembersUpdated) onMembersUpdated();
    } catch (err) {
      setError(err.message || "Failed to update member role.");
    }
  }

  async function handleRemoveMember(userId, username) {
    const isSelf = String(currentUser?._id || currentUser?.id) === String(userId);
    const promptMsg = isSelf
      ? "Are you sure you want to leave this project?"
      : `Remove @${username} from this project?`;

    if (!window.confirm(promptMsg)) return;

    setError("");
    setNotice("");
    try {
      await api(`/projects/${projectId}/members/${userId}`, { method: "DELETE" });
      setNotice(isSelf ? "You have left the project." : `@${username} removed from project.`);
      if (onMembersUpdated) onMembersUpdated();
    } catch (err) {
      setError(err.message || "Failed to remove member.");
    }
  }

  async function handleRespondJoinRequest(invitationId, action) {
    setError("");
    setNotice("");
    try {
      await api(`/projects/${projectId}/join-request/${invitationId}/respond`, {
        method: "POST",
        body: JSON.stringify({ action })
      });
      setNotice(action === "approve" ? "Application approved!" : "Application declined.");
      loadPendingInvitations();
      if (onMembersUpdated) onMembersUpdated();
    } catch (err) {
      setError(err.message || "Failed to process application.");
    }
  }

  const joinRequests = invitations.filter((i) => i.type === "join_request");
  const pendingInvites = invitations.filter((i) => i.type === "invitation");
  const capacityUsed = members.length;
  const capacityLeft = Math.max(0, maxCollaborators - capacityUsed);

  return (
    <div className="project-members-pane">
      {notice && (
        <div className="alert alert-success alert-dismissible fade show mb-3">
          {notice}
          <button type="button" className="btn-close" onClick={() => setNotice("")}></button>
        </div>
      )}

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      {/* Header & Capacity Bar */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 className="section-title m-0">Project Collaborators</h3>
          <p className="section-subtitle m-0">
            {capacityUsed} of {maxCollaborators} spots filled ({capacityLeft} open spot{capacityLeft === 1 ? "" : "s"})
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            onClick={() => setShowInviteModal(true)}
            disabled={capacityLeft === 0}
          >
            <UserPlus size={14} />
            <span>Invite Collaborator</span>
          </button>
        )}
      </div>

      {/* Capacity Progress Bar */}
      <div className="progress mb-4" style={{ height: "6px" }}>
        <div
          className="progress-bar"
          style={{ width: `${Math.min(100, (capacityUsed / maxCollaborators) * 100)}%` }}
        ></div>
      </div>

      {/* Join Requests Review (if admin) */}
      {isAdmin && joinRequests.length > 0 && (
        <div className="join-requests-review-card mb-4">
          <div className="d-flex align-items-center gap-2 mb-2">
            <Mail size={16} className="text-warning" />
            <h4 className="m-0 fs-6 fw-bold">Pending Join Applications ({joinRequests.length})</h4>
          </div>
          <p className="small text-muted mb-3">
            Unfold members have requested to collaborate on this project.
          </p>

          <div className="join-requests-list">
            {joinRequests.map((req) => (
              <div key={req._id} className="join-request-row">
                <div className="d-flex align-items-center gap-2">
                  <div className="avatar avatar-sm">
                    {(req.inviteeId?.displayName || req.inviteeId?.username || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>@{req.inviteeId?.username}</strong>
                    {req.message && <div className="small text-muted">"{req.message}"</div>}
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => handleRespondJoinRequest(req._id, "reject")}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRespondJoinRequest(req._id, "approve")}
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member List Table */}
      <div className="table-responsive members-table-wrap">
        <table className="table table-hover align-middle members-table">
          <thead>
            <tr>
              <th>Member</th>
              <th style={{ width: "160px" }}>Role</th>
              <th style={{ width: "150px" }}>Joined</th>
              {isAdmin && <th style={{ width: "80px" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const u = m.user;
              const isMemberOwner = m.role === "owner";
              const isCurrentUser = String(currentUser?._id || currentUser?.id) === String(u?._id);

              return (
                <tr key={u?._id || m.membershipId}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <div className="avatar avatar-sm">
                        {(u?.displayName || u?.username || "U").slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="fw-semibold">
                          {u?.displayName || u?.username}
                          {isCurrentUser && <span className="badge bg-light text-dark ms-2">You</span>}
                        </div>
                        <div className="small text-muted">@{u?.username}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {isOwner && !isMemberOwner ? (
                      <select
                        className="form-select form-select-sm role-select"
                        value={m.role}
                        onChange={(e) => handleRoleChange(u._id, e.target.value)}
                      >
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge-role ${m.role}`}>{m.role}</span>
                    )}
                  </td>
                  <td>
                    <span className="small text-muted">
                      {new Date(m.joinedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      {!isMemberOwner && (
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm p-1"
                          onClick={() => handleRemoveMember(u._id, u.username)}
                          title="Remove from project"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pending Invitations Strip */}
      {isAdmin && pendingInvites.length > 0 && (
        <div className="pending-invites-strip mt-4">
          <h5 className="fs-6 fw-bold mb-2">Sent Pending Invitations ({pendingInvites.length})</h5>
          <div className="d-flex flex-wrap gap-2">
            {pendingInvites.map((inv) => (
              <span key={inv._id} className="badge bg-light text-dark border p-2 d-flex align-items-center gap-1">
                <Clock size={12} className="text-muted" />
                <span>@{inv.inviteeId?.username}</span>
                <span className="badge-role collaborator ms-1">{inv.role}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
          <div className="project-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="project-modal-header">
              <div>
                <span className="eyebrow">INVITE COLLABORATOR</span>
                <h3 className="project-modal-title">Invite to Project</h3>
              </div>
              <button
                type="button"
                className="project-modal-close"
                onClick={() => setShowInviteModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSendInvite}>
              <div className="form-group mb-3">
                <label className="form-label">Unfold Username</label>
                <div className="input-group">
                  <span className="input-group-text">@</span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="username"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Assign Role</label>
                <select
                  className="form-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Invitation Message (Optional)</label>
                <textarea
                  className="form-control"
                  rows="3"
                  maxLength={500}
                  placeholder="Hey, we'd love for you to help us build this project..."
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                />
              </div>

              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowInviteModal(false)}
                  disabled={sendingInvite}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sendingInvite || !inviteUsername.trim()}
                >
                  {sendingInvite ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
