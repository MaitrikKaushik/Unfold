import React, { useState, useEffect } from "react";
import { MessageSquare, Plus, Pin, Send, ArrowLeft, Clock, User } from "lucide-react";
import { api } from "../../services/api";

export default function ProjectDiscussions({
  projectId,
  canParticipate = true,
  currentUser
}) {
  const [discussions, setDiscussions] = useState([]);
  const [activeTopic, setActiveTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create discussion state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newPinned, setNewPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  async function loadDiscussions() {
    setLoading(true);
    setError("");
    try {
      const res = await api(`/projects/${projectId}/discussions`);
      setDiscussions(res.discussions || []);
    } catch (err) {
      setError(err.message || "Failed to load discussions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDiscussions();
  }, [projectId]);

  async function openTopic(discussionId) {
    setError("");
    try {
      const res = await api(`/projects/${projectId}/discussions/${discussionId}`);
      setActiveTopic(res.discussion);
    } catch (err) {
      setError(err.message || "Failed to load discussion topic.");
    }
  }

  async function handleCreateTopic(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await api(`/projects/${projectId}/discussions`, {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          content: newContent.trim(),
          pinned: newPinned
        })
      });
      setShowCreateModal(false);
      setNewTitle("");
      setNewContent("");
      setNewPinned(false);
      await loadDiscussions();
      setActiveTopic(res.discussion);
    } catch (err) {
      setError(err.message || "Failed to start discussion.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !activeTopic) return;

    setSubmittingReply(true);
    setError("");
    try {
      const res = await api(`/projects/${projectId}/discussions/${activeTopic._id}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: replyText.trim() })
      });
      setActiveTopic({
        ...activeTopic,
        replies: [...(activeTopic.replies || []), res.reply],
        replyCount: (activeTopic.replyCount || 0) + 1
      });
      setReplyText("");
    } catch (err) {
      setError(err.message || "Failed to post reply.");
    } finally {
      setSubmittingReply(false);
    }
  }

  return (
    <div className="project-discussions-pane">
      {error && <div className="alert alert-danger mb-3">{error}</div>}

      {activeTopic ? (
        /* TOPIC THREAD VIEW */
        <div className="discussion-thread-view">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm mb-3 d-inline-flex align-items-center gap-1"
            onClick={() => {
              setActiveTopic(null);
              loadDiscussions();
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to all topics</span>
          </button>

          {/* Original Post */}
          <div className="discussion-thread-card">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="d-flex align-items-center gap-2">
                <div className="avatar avatar-sm">
                  {(activeTopic.authorId?.displayName || activeTopic.authorId?.username || "U")
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
                <div>
                  <strong>{activeTopic.authorId?.displayName || activeTopic.authorId?.username}</strong>
                  <span className="text-muted small ms-2">@{activeTopic.authorId?.username}</span>
                </div>
              </div>
              <span className="text-muted small">
                {new Date(activeTopic.createdAt).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </span>
            </div>

            <h3 className="thread-title">{activeTopic.title}</h3>
            <div className="thread-content-body">{activeTopic.content}</div>
          </div>

          {/* Replies Section */}
          <div className="thread-replies-list mt-4">
            <h4 className="replies-count-heading">
              {activeTopic.replies ? activeTopic.replies.length : 0} Replies
            </h4>

            {activeTopic.replies && activeTopic.replies.length > 0 ? (
              activeTopic.replies.map((reply) => (
                <div key={reply._id} className="reply-card">
                  <div className="reply-card-header">
                    <div className="d-flex align-items-center gap-2">
                      <div className="avatar avatar-xs">
                        {(reply.authorId?.displayName || reply.authorId?.username || "U")
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>
                      <strong>@{reply.authorId?.username}</strong>
                    </div>
                    <span className="text-muted small">
                      {new Date(reply.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </div>
                  <div className="reply-text">{reply.content}</div>
                </div>
              ))
            ) : (
              <p className="text-muted small py-2">No replies yet. Start the conversation!</p>
            )}
          </div>

          {/* Reply Composer */}
          {canParticipate && (
            <form onSubmit={handleSendReply} className="reply-composer-form mt-3">
              <div className="form-group mb-2">
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Share your perspective or propose a solution..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={submittingReply}
                  required
                />
              </div>
              <div className="d-flex justify-content-end">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                  disabled={submittingReply || !replyText.trim()}
                >
                  <Send size={13} />
                  <span>{submittingReply ? "Posting..." : "Post Reply"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* DISCUSSIONS LIST VIEW */
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h3 className="section-title m-0">Project Discussions</h3>
              <p className="section-subtitle m-0">Brainstorm, debate decisions, and share findings</p>
            </div>
            {canParticipate && (
              <button
                type="button"
                className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={15} strokeWidth={2.4} />
                <span>New Topic</span>
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <span>Loading discussions...</span>
            </div>
          ) : discussions.length === 0 ? (
            <div className="projects-empty-banner">
              <MessageSquare size={32} className="text-muted mb-2" />
              <h4>No discussions yet</h4>
              <p>Start a topic to brainstorm architecture, debate implementation ideas, or coordinate work.</p>
              {canParticipate && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCreateModal(true)}
                >
                  Start Discussion
                </button>
              )}
            </div>
          ) : (
            <div className="discussions-card-list">
              {discussions.map((topic) => (
                <div
                  key={topic._id}
                  className="discussion-card clickable"
                  onClick={() => openTopic(topic._id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="discussion-card-body">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      {topic.pinned && (
                        <span className="badge-pinned">
                          <Pin size={11} className="me-1" />
                          Pinned
                        </span>
                      )}
                      <h4 className="discussion-topic-title m-0">{topic.title}</h4>
                    </div>

                    <p className="discussion-snippet">{topic.content}</p>

                    <div className="discussion-footer-meta">
                      <div className="d-flex align-items-center gap-1">
                        <div className="avatar avatar-xs">
                          {(topic.authorId?.displayName || topic.authorId?.username || "U")
                            .slice(0, 1)
                            .toUpperCase()}
                        </div>
                        <span className="small text-muted">@{topic.authorId?.username}</span>
                      </div>

                      <span className="meta-dot">·</span>

                      <span className="small text-muted">
                        {new Date(topic.createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric"
                        })}
                      </span>

                      <span className="meta-dot">·</span>

                      <span className="small text-muted d-flex align-items-center gap-1">
                        <MessageSquare size={12} />
                        {topic.replyCount || 0} {topic.replyCount === 1 ? "reply" : "replies"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New Discussion Modal */}
          {showCreateModal && (
            <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
              <div className="project-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="project-modal-header">
                  <div>
                    <span className="eyebrow">NEW DISCUSSION</span>
                    <h3 className="project-modal-title">Start a Topic</h3>
                  </div>
                  <button
                    type="button"
                    className="project-modal-close"
                    onClick={() => setShowCreateModal(false)}
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleCreateTopic}>
                  <div className="form-group mb-3">
                    <label className="form-label">Topic Title</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Database schema proposals for v1"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      maxLength={150}
                      required
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label className="form-label">Discussion Content</label>
                    <textarea
                      className="form-control"
                      rows="5"
                      placeholder="Provide background, proposed directions, and questions for the team..."
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      maxLength={4000}
                      required
                    />
                  </div>

                  <div className="form-check mb-3">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="pinCheck"
                      checked={newPinned}
                      onChange={(e) => setNewPinned(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="pinCheck">
                      Pin this discussion to the top of the list
                    </label>
                  </div>

                  <div className="modal-actions-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setShowCreateModal(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submitting || !newTitle.trim() || !newContent.trim()}
                    >
                      {submitting ? "Starting..." : "Start Discussion"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
