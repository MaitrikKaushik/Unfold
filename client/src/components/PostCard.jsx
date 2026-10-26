import React, { useState } from "react";
import { api, getAssetUrl } from "../services/api";

export default function PostCard({ post, user, onVote, onCommentCountChange }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);

  const date = new Date(post.createdAt).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });

  async function toggleComments() {
    const nextState = !showComments;
    setShowComments(nextState);
    if (nextState && comments.length === 0) {
      await fetchComments();
    }
  }

  async function fetchComments() {
    setLoadingComments(true);
    setCommentError("");
    try {
      const data = await api(`/posts/${post.id}/comments`);
      setComments(data.comments || []);
      setCommentCount((data.comments || []).length);
      if (onCommentCountChange) onCommentCountChange(post.id, (data.comments || []).length);
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setLoadingComments(false);
    }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    setCommentError("");

    try {
      const res = await api(`/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text: commentText.trim() })
      });
      setComments((prev) => [...prev, res.comment]);
      setCommentText("");
      const newCount = res.commentCount !== undefined ? res.commentCount : comments.length + 1;
      setCommentCount(newCount);
      if (onCommentCountChange) onCommentCountChange(post.id, newCount);
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDeleteComment(commentId) {
    setCommentError("");
    try {
      const res = await api(`/comments/${commentId}`, { method: "DELETE" });
      const updated = comments.filter((c) => c.id !== commentId);
      setComments(updated);
      const newCount = res.commentCount !== undefined ? res.commentCount : Math.max(0, commentCount - 1);
      setCommentCount(newCount);
      if (onCommentCountChange) onCommentCountChange(post.id, newCount);
    } catch (err) {
      setCommentError(err.message);
    }
  }

  const category = post.category || "Discussion";
  const categoryClass = category.toLowerCase();

  return (
    <article className="post-card">
      <div className="post-top">
        <div className="avatar">{(post.author?.username || "?").slice(0, 1).toUpperCase()}</div>
        <div className="post-author">
          <strong>{post.author?.username || "anonymous"}</strong>
          <span>{date}</span>
        </div>
        <div className="post-badges">
          <span className={`category-badge badge-${categoryClass}`}>{category}</span>
          <span className="community-pill">{post.communityId}</span>
        </div>
      </div>

      {post.title && <h3 className="post-title">{post.title}</h3>}
      {post.text && <p className="post-text">{post.text}</p>}

      {post.link && (
        <div className="post-link-box">
          <a
            href={post.link}
            target="_blank"
            rel="noopener noreferrer"
            className="post-resource-link"
            title={post.link}
          >
            <span className="link-icon">🔗</span>
            <span className="link-url">{post.link}</span>
            <span className="link-arrow">↗</span>
          </a>
        </div>
      )}

      {post.imageUrl && (
        <img
          className="post-image"
          src={getAssetUrl(post.imageUrl)}
          alt="Post attachment"
          loading="lazy"
        />
      )}

      <div className="post-actions">
        <div className="vote-group">
          <button
            className={`vote-btn ${post.myVote === 1 ? "selected" : ""}`}
            onClick={() => onVote(post, 1)}
            aria-label="Upvote"
            title="Upvote post"
          >
            ↑
          </button>
          <span className={`score ${post.score < 0 ? "negative" : ""}`}>{post.score}</span>
          <button
            className={`vote-btn ${post.myVote === -1 ? "selected down" : ""}`}
            onClick={() => onVote(post, -1)}
            aria-label="Downvote"
            title="Downvote post"
          >
            ↓
          </button>
        </div>

        <button
          className={`comment-toggle-btn ${showComments ? "active" : ""}`}
          onClick={toggleComments}
          aria-label="Toggle comments"
        >
          <span className="comment-icon">💬</span>
          <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
        </button>

        <span className="vote-detail ms-auto">
          {post.upvoteCount} up · {post.downvoteCount} down
        </span>
      </div>

      {showComments && (
        <section className="comments-section" aria-label="Comments">
          <div className="comments-header">
            <h4>Discussion ({commentCount})</h4>
          </div>

          {commentError && (
            <div className="alert alert-danger py-2 mb-3">
              {commentError}
              <button
                type="button"
                className="alert-close"
                onClick={() => setCommentError("")}
              >
                ×
              </button>
            </div>
          )}

          {user ? (
            <form onSubmit={handleAddComment} className="comment-form mb-3">
              <div className="input-group">
                <input
                  type="text"
                  className="form-control form-control-sm comment-input"
                  placeholder="Add a thoughtful comment…"
                  maxLength={1000}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  disabled={submittingComment}
                />
                <button
                  type="submit"
                  className="btn btn-dark btn-sm comment-submit-btn"
                  disabled={submittingComment || !commentText.trim()}
                >
                  {submittingComment ? "Posting…" : "Comment"}
                </button>
              </div>
            </form>
          ) : (
            <div className="comment-login-hint">Log in to leave a comment.</div>
          )}

          {loadingComments ? (
            <div className="comment-loading">Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="no-comments">No comments yet. Be the first to start the conversation!</div>
          ) : (
            <div className="comment-list">
              {comments.map((comment) => {
                const commentDate = new Date(comment.createdAt).toLocaleString([], {
                  dateStyle: "short",
                  timeStyle: "short"
                });
                const isAuthor = user && user.id === comment.author?.id;

                return (
                  <div key={comment.id} className="comment-item">
                    <div className="comment-avatar">
                      {(comment.author?.username || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="comment-content">
                      <div className="comment-meta">
                        <strong className="comment-author-name">
                          {comment.author?.username || "unknown"}
                        </strong>
                        <span className="comment-date">{commentDate}</span>
                        {isAuthor && (
                          <button
                            type="button"
                            className="comment-delete-btn"
                            title="Delete your comment"
                            onClick={() => handleDeleteComment(comment.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <p className="comment-text">{comment.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </article>
  );
}
