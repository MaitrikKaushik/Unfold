import React, { useState, useEffect, useRef } from "react";
import { api, getAssetUrl } from "../services/api";

const CATEGORIES = ["Discussion", "Question", "Resource"];

export default function PostCard({
  post,
  user,
  onVote,
  onCommentCountChange,
  onUpdatePost,
  onDeletePost,
  onNotice
}) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);

  // Three-dot menu & Edit/Delete states
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Edit form field states
  const [editTitle, setEditTitle] = useState(post.title || "");
  const [editText, setEditText] = useState(post.text || "");
  const [editCategory, setEditCategory] = useState(post.category || "Discussion");
  const [editLink, setEditLink] = useState(post.link || "");
  const [editImage, setEditImage] = useState(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);

  const menuRef = useRef(null);

  const isAuthor = Boolean(user && user.id === post.author?.id);

  const date = new Date(post.createdAt).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

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

  function startEditing() {
    setEditTitle(post.title || "");
    setEditText(post.text || "");
    setEditCategory(post.category || "Discussion");
    setEditLink(post.link || "");
    setEditImage(null);
    setRemoveCurrentImage(false);
    setEditError("");
    setIsEditing(true);
    setMenuOpen(false);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditError("");
    setEditImage(null);
    setRemoveCurrentImage(false);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setEditError("");
    setIsSavingEdit(true);

    const form = new FormData();
    form.append("title", editTitle.trim());
    form.append("text", editText.trim());
    form.append("category", editCategory);
    form.append("link", editLink.trim());
    if (editImage) {
      form.append("image", editImage);
    }
    if (removeCurrentImage) {
      form.append("removeImage", "true");
    }

    try {
      const res = await api(`/posts/${post.id}`, {
        method: "PATCH",
        body: form
      });

      setIsEditing(false);
      if (onUpdatePost) onUpdatePost(res.post);
      if (onNotice) onNotice(res.message || "Post updated successfully.");
    } catch (err) {
      setEditError(err.message);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    try {
      await api(`/posts/${post.id}`, { method: "DELETE" });
      setShowDeleteConfirm(false);
      if (onDeletePost) onDeletePost(post.id);
      if (onNotice) onNotice("Post deleted successfully.");
    } catch (err) {
      alert(`Could not delete post: ${err.message}`);
      setIsDeleting(false);
    }
  }

  const category = post.category || "Discussion";
  const categoryClass = category.toLowerCase();

  return (
    <article className="post-card">
      {/* Top Header of the Post Card */}
      <div className="post-top">
        <div className="avatar">{(post.author?.username || "?").slice(0, 1).toUpperCase()}</div>
        <div className="post-author">
          <strong>{post.author?.username || "anonymous"}</strong>
          <span>
            {date}
            {post.updatedAt && <em className="ms-1 small muted">(edited)</em>}
          </span>
        </div>

        <div className="post-badges">
          <span className={`category-badge badge-${categoryClass}`}>{category}</span>
          <span className="community-pill">{post.communityId}</span>
        </div>

        {/* Three-Dot Menu (Owner only) */}
        {isAuthor && (
          <div className="post-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="post-menu-trigger"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Post options"
              title="Post actions"
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="post-dropdown-menu">
                <button
                  type="button"
                  className="post-dropdown-item"
                  onClick={startEditing}
                >
                  <span className="dropdown-icon">✏️</span> Edit post
                </button>
                <button
                  type="button"
                  className="post-dropdown-item text-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowDeleteConfirm(true);
                  }}
                >
                  <span className="dropdown-icon">🗑️</span> Delete post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal / Dialog */}
      {showDeleteConfirm && (
        <div className="delete-confirm-box my-3 p-3 border border-danger-subtle rounded bg-danger-subtle bg-opacity-25">
          <strong className="d-block mb-1 text-danger">Delete this post?</strong>
          <p className="mb-3 small text-muted">
            Are you sure you want to delete this post? This action will remove the post and its comments permanently.
          </p>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? "Deleting…" : "Delete Post"}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={isDeleting}
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline Post Edit Form */}
      {isEditing ? (
        <form onSubmit={handleSaveEdit} className="post-edit-form my-3 p-3 border rounded bg-subtle">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong className="small">Edit Post</strong>
            <button
              type="button"
              className="btn-close-sm"
              onClick={cancelEditing}
              aria-label="Cancel editing"
            >
              ×
            </button>
          </div>

          {editError && <div className="alert alert-danger py-2 mb-2 small">{editError}</div>}

          {/* Category selection */}
          <div className="mb-2">
            <label className="form-label small mb-1">Category</label>
            <div className="category-pills">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`cat-pill-btn ${editCategory === cat ? "selected" : ""}`}
                  onClick={() => setEditCategory(cat)}
                >
                  {cat === "Discussion" && "💬 "}
                  {cat === "Question" && "❓ "}
                  {cat === "Resource" && "🔗 "}
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="mb-2">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Title (optional)"
              maxLength={150}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>

          {/* Content */}
          <div className="mb-2">
            <textarea
              className="form-control form-control-sm"
              rows={3}
              maxLength={2000}
              placeholder="What would you like to share?"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
          </div>

          {/* Resource URL (shown if Resource selected) */}
          {editCategory === "Resource" && (
            <div className="mb-2">
              <input
                type="url"
                className="form-control form-control-sm"
                placeholder="Resource URL (e.g. https://example.com)"
                maxLength={500}
                value={editLink}
                onChange={(e) => setEditLink(e.target.value)}
              />
            </div>
          )}

          {/* Existing Image & New Image Upload */}
          <div className="mb-3">
            {post.imageUrl && !removeCurrentImage && (
              <div className="existing-image-preview d-flex align-items-center gap-2 mb-2 p-2 border rounded">
                <img
                  src={getAssetUrl(post.imageUrl)}
                  alt="Current attachment"
                  style={{ width: "45px", height: "45px", objectFit: "cover", borderRadius: "6px" }}
                />
                <span className="small muted flex-grow-1">Current attachment</span>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm py-0 px-2"
                  onClick={() => setRemoveCurrentImage(true)}
                >
                  ✕ Remove image
                </button>
              </div>
            )}

            {removeCurrentImage && (
              <div className="mb-2 small text-warning">
                Current image will be removed upon saving.{" "}
                <button
                  type="button"
                  className="link-button small"
                  onClick={() => setRemoveCurrentImage(false)}
                >
                  Undo
                </button>
              </div>
            )}

            <label className="upload-label small">
              ＋ {post.imageUrl && !removeCurrentImage ? "Replace image" : "Add image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  setEditImage(e.target.files?.[0] || null);
                  setRemoveCurrentImage(false);
                }}
              />
            </label>
            {editImage && <span className="ms-2 small muted">{editImage.name}</span>}
          </div>

          <div className="d-flex gap-2">
            <button
              type="submit"
              className="btn btn-dark btn-sm"
              disabled={isSavingEdit || (!editText.trim() && !editTitle.trim() && !post.imageUrl && !editImage)}
            >
              {isSavingEdit ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={isSavingEdit}
              onClick={cancelEditing}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* Regular Post Content Display */
        <>
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
        </>
      )}

      {/* Post Actions (Votes & Comments) */}
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
          <span>
            {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </span>
        </button>

        <span className="vote-detail ms-auto">
          {post.upvoteCount} up · {post.downvoteCount} down
        </span>
      </div>

      {/* Comments Section */}
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
                const isCommentAuthor = Boolean(user && user.id === comment.author?.id);

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
                        {isCommentAuthor && (
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
