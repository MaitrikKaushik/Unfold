import React, { useState, useEffect } from "react";
import { Mail, Check, X, ArrowRight, Clock, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../services/api";

export default function ProjectsInvitations({ onSelectProject, onRefreshOverview }) {
  const [tab, setTab] = useState("received"); // "received" | "sent"
  const [receivedInvitations, setReceivedInvitations] = useState([]);
  const [sentJoinRequests, setSentJoinRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [processingId, setProcessingId] = useState(null);

  async function loadInvitations() {
    setLoading(true);
    setError("");
    try {
      const res = await api("/projects/invitations/my");
      setReceivedInvitations(res.receivedInvitations || []);
      setSentJoinRequests(res.sentJoinRequests || []);
    } catch (err) {
      setError(err.message || "Failed to load invitations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvitations();
  }, []);

  async function handleRespond(invitationId, action) {
    setProcessingId(invitationId);
    setError("");
    setNotice("");
    try {
      await api(`/projects/invitations/${invitationId}/respond`, {
        method: "POST",
        body: JSON.stringify({ action })
      });
      setNotice(
        action === "accept"
          ? "Invitation accepted! You are now a project collaborator."
          : "Invitation declined."
      );
      await loadInvitations();
      if (onRefreshOverview) onRefreshOverview();
    } catch (err) {
      setError(err.message || "Failed to process invitation.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="projects-invitations-pane">
      <div className="pane-header-row mb-3">
        <div>
          <span className="eyebrow">COLLABORATION INBOX</span>
          <h2 className="pane-title">Invitations & Requests</h2>
          <p className="pane-desc">Manage project invitations you have received and applications you sent.</p>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success alert-dismissible fade show mb-3">
          {notice}
          <button type="button" className="btn-close" onClick={() => setNotice("")}></button>
        </div>
      )}

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      {/* Tabs */}
      <div className="role-tabs mb-4">
        <button
          type="button"
          className={`role-tab ${tab === "received" ? "active" : ""}`}
          onClick={() => setTab("received")}
        >
          Received Invitations ({receivedInvitations.length})
        </button>
        <button
          type="button"
          className={`role-tab ${tab === "sent" ? "active" : ""}`}
          onClick={() => setTab("sent")}
        >
          Sent Join Applications ({sentJoinRequests.length})
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <span>Loading invitations...</span>
        </div>
      ) : tab === "received" ? (
        receivedInvitations.length === 0 ? (
          <div className="projects-empty-banner">
            <Mail size={32} className="text-muted mb-2" />
            <h4>No pending invitations</h4>
            <p>You have no project invitations waiting for your response.</p>
          </div>
        ) : (
          <div className="invitations-list">
            {receivedInvitations.map((inv) => (
              <div key={inv._id} className="invitation-card">
                <div className="invitation-card-left">
                  <div className="avatar avatar-md">
                    {(inv.inviterId?.displayName || inv.inviterId?.username || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="invitation-card-title-row">
                      <strong>@{inv.inviterId?.username}</strong>
                      <span className="text-muted">invited you to join as</span>
                      <span className="badge-role collaborator">{inv.role || "collaborator"}</span>
                    </div>

                    <h4
                      className="invitation-project-name clickable"
                      onClick={() => onSelectProject(inv.projectId?._id)}
                    >
                      {inv.projectId?.title}
                    </h4>

                    {inv.message && <p className="invitation-note">"{inv.message}"</p>}

                    <div className="text-muted small mt-1">
                      Received {new Date(inv.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="invitation-actions">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => handleRespond(inv._id, "reject")}
                    disabled={processingId === inv._id}
                  >
                    <X size={14} className="me-1" />
                    Decline
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRespond(inv._id, "accept")}
                    disabled={processingId === inv._id}
                  >
                    <Check size={14} className="me-1" />
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : sentJoinRequests.length === 0 ? (
        <div className="projects-empty-banner">
          <Clock size={32} className="text-muted mb-2" />
          <h4>No sent applications</h4>
          <p>You haven't requested to join any projects yet.</p>
        </div>
      ) : (
        <div className="invitations-list">
          {sentJoinRequests.map((req) => (
            <div key={req._id} className="invitation-card">
              <div className="invitation-card-left">
                <div>
                  <h4
                    className="invitation-project-name clickable"
                    onClick={() => onSelectProject(req.projectId?._id)}
                  >
                    {req.projectId?.title}
                  </h4>
                  {req.message && <p className="invitation-note">Your note: "{req.message}"</p>}
                  <div className="text-muted small">
                    Applied on {new Date(req.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="invitation-status-badge">
                {req.status === "pending" && (
                  <span className="badge bg-warning text-dark d-flex align-items-center gap-1">
                    <Clock size={12} />
                    Pending Review
                  </span>
                )}
                {req.status === "accepted" && (
                  <span className="badge bg-success d-flex align-items-center gap-1">
                    <CheckCircle2 size={12} />
                    Approved
                  </span>
                )}
                {req.status === "rejected" && (
                  <span className="badge bg-secondary d-flex align-items-center gap-1">
                    <XCircle size={12} />
                    Declined
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
