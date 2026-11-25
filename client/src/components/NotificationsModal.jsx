import React, { useState, useEffect } from "react";
import { X, Bell, Check, CheckCheck, Clock, ArrowRight, ExternalLink } from "lucide-react";
import { api } from "../services/api";

export default function NotificationsModal({ isOpen, onClose, onNavigateToProject }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const res = await api("/notifications?limit=40");
      setNotifications(res.notifications || []);
    } catch (err) {
      setError(err.message || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  async function handleMarkRead(notifId) {
    try {
      await api(`/notifications/${notifId}/read`, { method: "POST" });
      setNotifications((prev) =>
        prev.map((n) => (n._id === notifId ? { ...n, read: true } : n))
      );
    } catch {}
  }

  async function handleMarkAllRead() {
    try {
      await api("/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  }

  function handleNotificationClick(notif) {
    if (!notif.read) {
      handleMarkRead(notif._id);
    }
    if (notif.projectId && onNavigateToProject) {
      const pId = notif.projectId._id || notif.projectId;
      onNavigateToProject(pId);
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="notifications-flyout-card" onClick={(e) => e.stopPropagation()}>
        <div className="notifications-header">
          <div className="d-flex align-items-center gap-2">
            <Bell size={18} strokeWidth={2.2} />
            <h3 className="m-0 fs-6 fw-bold">Notifications</h3>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-decoration-none small text-muted"
              onClick={handleMarkAllRead}
              title="Mark all as read"
            >
              <CheckCheck size={14} className="me-1" />
              Mark all read
            </button>
            <button
              type="button"
              className="project-modal-close ms-2"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger m-2 py-1 px-2 small">{error}</div>}

        <div className="notifications-list-scroll">
          {loading ? (
            <div className="py-4 text-center text-muted small">
              <div className="loading-spinner mb-2"></div>
              <span>Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-5 text-center text-muted">
              <Bell size={24} className="mb-2 text-muted opacity-50" />
              <p className="small m-0">No notifications yet.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif._id}
                className={`notification-item ${!notif.read ? "unread" : ""}`}
                onClick={() => handleNotificationClick(notif)}
                role="button"
                tabIndex={0}
              >
                <div className="avatar avatar-xs mt-1">
                  {(notif.actorId?.displayName || notif.actorId?.username || "U")
                    .slice(0, 1)
                    .toUpperCase()}
                </div>

                <div className="notification-item-content">
                  <div className="notification-title">{notif.title}</div>
                  <p className="notification-message">{notif.message}</p>
                  <div className="notification-time">
                    {new Date(notif.createdAt).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                </div>

                {!notif.read && <div className="unread-dot" title="Unread"></div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
