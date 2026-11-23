import React from "react";
import Icon from "./Icon";

function scrollToPost(postId) {
  const target = document.getElementById(`post-${postId}`);
  if (!target) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  target.classList.add("post-highlight");
  window.setTimeout(() => target.classList.remove("post-highlight"), 1600);
}

export default function RightSidebar({
  currentCommunity,
  isMember,
  eligibility,
  posts,
  user
}) {
  const threshold = eligibility?.threshold || 5;
  const score = eligibility?.currentGatePost?.score ?? null;
  const canPost = eligibility?.canPost === true;
  const notMember = eligibility?.reason === "NOT_A_MEMBER";

  return (
    <aside className="rightbar" aria-label="Community context">
      <section className="context-card recent-posts-card">
        <div className="context-card-head">
          <p className="eyebrow">RECENT POSTS</p>
          <span className="context-count">{posts.length}</span>
        </div>
        {posts.length ? (
          <ul className="recent-list">
            {posts.slice(0, 4).map((post) => (
              <li key={post.id}>
                <button type="button" onClick={() => scrollToPost(post.id)}>
                  <span className={`recent-category recent-${(post.category || "discussion").toLowerCase()}`}>
                    {(post.category || "Discussion").slice(0, 1)}
                  </span>
                  <span className="recent-body">
                    <strong>{post.title || post.text || "Untitled post"}</strong>
                    <small>
                      {post.author?.username || "anonymous"} · {post.score} pts · {post.commentCount || 0} comments
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="context-empty">No posts in this community yet.</p>
        )}
      </section>

      <section className="context-card contribution-card">
        <div className="context-card-head">
          <p className="eyebrow">YOUR CONTRIBUTION</p>
          <Icon name="contribution" size={16} />
        </div>
        <div className="contribution-status">
          <strong>{notMember ? "Join to participate" : canPost ? "Ready to contribute" : "Next post locked"}</strong>
          <p>
            {notMember
              ? "Become a member to start posting in this community."
              : score === null
              ? `Your first post is ready. Future posts require a net score of +${threshold}.`
              : `Your latest post has a net score of ${score}. Reach +${threshold} to unlock your next post.`}
          </p>
        </div>
        {score !== null && (
          <div className="contribution-progress">
            <div className="progress">
              <div
                className={`progress-bar${canPost ? " is-complete" : ""}`}
                style={{ width: `${Math.max(0, Math.min(100, (score / threshold) * 100))}%` }}
              ></div>
            </div>
            <div className="contribution-progress-labels">
              <span>{score} net score</span>
              <span>+{threshold} required</span>
            </div>
          </div>
        )}
      </section>

      <section className="context-card community-info-card">
        <div className="context-card-head">
          <p className="eyebrow">COMMUNITY</p>
          <span className="community-icon small">{currentCommunity.name.slice(0, 1)}</span>
        </div>
        <h3>{currentCommunity.name}</h3>
        <p>{currentCommunity.description}</p>
        <div className="context-rule-row">
          <span>Membership</span>
          <strong className={isMember ? "is-positive" : ""}>{isMember ? "Member" : "Not a member"}</strong>
        </div>
        <div className="context-rule-row">
          <span>Your account</span>
          <strong title={user.username}>{user.username}</strong>
        </div>
        <div className="context-rule-row">
          <span>Posting gate</span>
          <strong>+{threshold} net score</strong>
        </div>
      </section>

      <p className="footer-note">Unfold · Community, Earned.</p>
    </aside>
  );
}
