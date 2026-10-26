import React from "react";
export default function PostCard({ post, user, onVote }) {
  const date = new Date(post.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return <article className="post-card">
    <div className="post-top">
      <div className="avatar">{(post.author?.username || "?").slice(0,1).toUpperCase()}</div>
      <div className="post-author"><strong>{post.author?.username || "anonymous"}</strong><span>{date}</span></div>
      <span className="community-pill">{post.communityId}</span>
    </div>
    {post.text && <p className="post-text">{post.text}</p>}
    {post.imageUrl && <img className="post-image" src={`http://localhost:4000${post.imageUrl}`} alt="Post attachment" />}
    <div className="post-actions">
      <div className="vote-group">
        <button className={`vote-btn ${post.myVote === 1 ? "selected" : ""}`} onClick={() => onVote(post, 1)} aria-label="Upvote">↑</button>
        <span className={`score ${post.score < 0 ? "negative" : ""}`}>{post.score}</span>
        <button className={`vote-btn ${post.myVote === -1 ? "selected down" : ""}`} onClick={() => onVote(post, -1)} aria-label="Downvote">↓</button>
      </div>
      <span className="vote-detail">{post.upvoteCount} up · {post.downvoteCount} down</span>
    </div>
  </article>;
}
