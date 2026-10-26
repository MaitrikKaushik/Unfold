import React, { useCallback, useEffect, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import PostCard from "./components/PostCard";
import UnfoldLogo from "./components/UnfoldLogo";
import { api, clearSession, getToken, getUser } from "./services/api";

const CATEGORIES = ["Discussion", "Question", "Resource"];

export default function App() {
  const [user, setUser] = useState(getUser());
  const [communities, setCommunities] = useState([]);
  const [communityId, setCommunityId] = useState("technology");
  const [posts, setPosts] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [joined, setJoined] = useState([]);
  const [sortBy, setSortBy] = useState("latest");

  // Post composer form states
  const [postTitle, setPostTitle] = useState("");
  const [postCategory, setPostCategory] = useState("Discussion");
  const [postLink, setPostLink] = useState("");
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState(null);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const loadCommunities = useCallback(async () => {
    try {
      const data = await api("/communities");
      setCommunities(data.communities || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadCommunity = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api(`/communities/${communityId}/posts?sort=${sortBy}`);
      setPosts(data.posts || []);

      if (getToken()) {
        try {
          const gate = await api(`/communities/${communityId}/eligibility`);
          setEligibility(gate);
        } catch {
          setEligibility(null);
        }
      } else {
        setEligibility(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [communityId, sortBy]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  useEffect(() => {
    loadCommunity();
  }, [loadCommunity]);

  async function joinCommunity() {
    setError("");
    setNotice("");
    try {
      await api(`/communities/${communityId}/join`, { method: "POST" });
      setJoined((old) => (old.includes(communityId) ? old : [...old, communityId]));
      const currentComm = communities.find((c) => c.id === communityId)?.name || communityId;
      setNotice(`Joined ${currentComm}. You are now ready to participate.`);
      await loadCommunity();
    } catch (e) {
      setError(e.message);
    }
  }

  async function createPost(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setPosting(true);

    const form = new FormData();
    if (postTitle.trim()) form.append("title", postTitle.trim());
    form.append("category", postCategory);
    if (postCategory === "Resource" && postLink.trim()) {
      form.append("link", postLink.trim());
    } else if (postLink.trim()) {
      form.append("link", postLink.trim());
    }
    if (postText.trim()) form.append("text", postText.trim());
    if (postImage) form.append("image", postImage);

    try {
      await api(`/communities/${communityId}/posts`, { method: "POST", body: form });
      setPostTitle("");
      setPostText("");
      setPostLink("");
      setPostCategory("Discussion");
      setPostImage(null);
      e.target.reset();
      setNotice("Your post has been published to the community.");
      await loadCommunity();
    } catch (e) {
      setError(e.message);
      await loadCommunity();
    } finally {
      setPosting(false);
    }
  }

  async function vote(post, value) {
    if (!user) {
      setError("Please log in to vote on posts.");
      return;
    }
    setError("");
    setNotice("");
    try {
      if (post.myVote === value) {
        await api(`/posts/${post.id}/vote`, { method: "DELETE" });
      } else {
        await api(`/posts/${post.id}/vote`, {
          method: "PUT",
          body: JSON.stringify({ value })
        });
      }
      await loadCommunity();
    } catch (e) {
      setError(e.message);
    }
  }

  function handleCommentCountChange(postId, newCount) {
    setPosts((prevPosts) =>
      prevPosts.map((p) => (p.id === postId ? { ...p, commentCount: newCount } : p))
    );
  }

  function logout() {
    clearSession();
    setUser(null);
    setEligibility(null);
    setPosts((p) => p.map((x) => ({ ...x, myVote: 0 })));
    setNotice("You have logged out successfully.");
  }

  if (!user) {
    return (
      <div className="auth-page-wrapper">
        <header className="topbar">
          <div className="brand">
            <UnfoldLogo size="sm" withText={true} />
          </div>
          <span className="topbar-note">Simple discussions · Quality earned</span>
        </header>
        <AuthPanel
          onAuth={(u) => {
            setUser(u);
            setNotice("Welcome to Unfold!");
          }}
        />
      </div>
    );
  }

  const isMember = joined.includes(communityId) || eligibility?.reason !== "NOT_A_MEMBER";
  const canPost = eligibility?.canPost === true;
  const currentCommunity = communities.find((c) => c.id === communityId) || {
    id: communityId,
    name: communityId,
    description: "Community discussion"
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); loadCommunity(); }}>
          <UnfoldLogo size="sm" withText={true} />
        </a>
        <div className="topbar-right">
          <span className="user-chip">
            <span className="online-dot" aria-hidden="true"></span>
            {user.username}
          </span>
          <button className="btn btn-sm btn-outline-secondary logout-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <div className="layout">
        {/* Left Sidebar */}
        <aside className="sidebar">
          <p className="eyebrow">YOUR SPACE</p>
          <button
            type="button"
            className="nav-item active"
            onClick={() => loadCommunity()}
          >
            <span className="nav-icon">⌂</span> Community Feed
          </button>

          <div className="sidebar-divider"></div>

          <p className="eyebrow">COMMUNITIES</p>
          <div className="community-list">
            {communities.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`community-nav ${communityId === c.id ? "chosen" : ""}`}
                onClick={() => setCommunityId(c.id)}
              >
                <span className="community-icon">{c.name.slice(0, 1)}</span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>

          <div className="sidebar-note">
            <span className="sidebar-note-icon">✳</span>
            <strong>Good things take votes.</strong>
            <p>
              Your next post in a community unlocks when your latest post earns a net score of +{eligibility?.threshold || 5}.
            </p>
          </div>
        </aside>

        {/* Central Community Feed */}
        <main className="main-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">COMMUNITY SPACE</p>
              <h1>{currentCommunity.name}</h1>
              <p className="muted">{currentCommunity.description}</p>
            </div>
            <div className="feed-mark">
              <span className="community-hero-initial">{currentCommunity.name.slice(0, 1)}</span>
            </div>
          </section>

          {notice && (
            <div className="alert alert-success py-2">
              {notice}
              <button type="button" className="alert-close" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}

          {error && (
            <div className="alert alert-danger py-2">
              {error}
              <button type="button" className="alert-close" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}

          {/* Posting Rule / Eligibility Card */}
          <section className="eligibility-card">
            <div className="eligibility-symbol">
              {canPost ? "✓" : eligibility?.currentGatePost ? "↗" : "＋"}
            </div>
            <div className="eligibility-copy">
              <strong>
                {!eligibility
                  ? "Your posting status"
                  : canPost
                  ? "You're clear to contribute"
                  : eligibility.reason === "NOT_A_MEMBER"
                  ? "Join to participate"
                  : "Your next post is locked"}
              </strong>
              <p>
                {!eligibility
                  ? "Join this community to see your posting eligibility."
                  : eligibility.reason === "NOT_A_MEMBER"
                  ? "Become a member to create your first post in this community."
                  : eligibility.currentGatePost
                  ? `Latest post net score: ${eligibility.currentGatePost.score} / ${eligibility.threshold}. ${
                      canPost
                        ? "Threshold achieved! You are clear to post again."
                        : `You need a net score of +${eligibility.threshold} on your latest post to unlock your next contribution.`
                    }`
                  : "Your first post in this community is ready to be published."}
              </p>
            </div>

            {eligibility?.reason === "NOT_A_MEMBER" && (
              <button type="button" className="btn btn-dark btn-sm join-btn" onClick={joinCommunity}>
                Join community
              </button>
            )}

            {eligibility?.currentGatePost && (
              <div className="score-progress">
                <div className="progress">
                  <div
                    className="progress-bar"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, (eligibility.currentGatePost.score / eligibility.threshold) * 100)
                      )}%`
                    }}
                  ></div>
                </div>
                <small>
                  {eligibility.currentGatePost.score} / +{eligibility.threshold}
                </small>
              </div>
            )}
          </section>

          {/* Composer (Feature A: Categories & Optional Link) */}
          {isMember && canPost && (
            <section className="composer">
              <div className="composer-heading">
                <div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>Create a post</strong>
                  <p>Share knowledge, questions, or resources with {currentCommunity.name}.</p>
                </div>
              </div>

              <form onSubmit={createPost}>
                {/* Category Selection */}
                <div className="composer-category-row mb-3">
                  <span className="category-select-label">Category:</span>
                  <div className="category-pills">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`cat-pill-btn ${postCategory === cat ? "selected" : ""}`}
                        onClick={() => setPostCategory(cat)}
                      >
                        {cat === "Discussion" && "💬 "}
                        {cat === "Question" && "❓ "}
                        {cat === "Resource" && "🔗 "}
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Title */}
                <div className="mb-2">
                  <input
                    type="text"
                    className="form-control post-title-input"
                    maxLength={150}
                    placeholder="Title (optional)"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                  />
                </div>

                {/* Post Content */}
                <textarea
                  className="form-control post-input mb-2"
                  rows="3"
                  maxLength={2000}
                  placeholder={
                    postCategory === "Question"
                      ? "What is your question? Provide relevant context…"
                      : postCategory === "Resource"
                      ? "Describe this resource and how it helps…"
                      : "What would you like to share?"
                  }
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                />

                {/* Resource Link Input (shown for Resource category or general link) */}
                {postCategory === "Resource" && (
                  <div className="mb-2 resource-link-input-wrap">
                    <div className="input-group">
                      <span className="input-group-text bg-white text-muted">🔗</span>
                      <input
                        type="url"
                        className="form-control form-control-sm"
                        placeholder="Website URL (e.g. https://example.com)"
                        maxLength={500}
                        value={postLink}
                        onChange={(e) => setPostLink(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="composer-footer">
                  <label className="upload-label" title="Attach an image">
                    ＋ Add image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      onChange={(e) => setPostImage(e.target.files?.[0] || null)}
                    />
                  </label>
                  <span className="muted small">
                    {postImage ? postImage.name : `${postText.length}/2000`}
                  </span>
                  <button
                    type="submit"
                    className="btn btn-dark btn-sm"
                    disabled={posting || (!postText.trim() && !postTitle.trim() && !postImage)}
                  >
                    {posting ? "Publishing…" : "Publish post ↗"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Feed Heading with Feature C: Feed Sorting (Latest / Top) */}
          <div className="feed-heading">
            <div className="feed-heading-left">
              <h2>Community Posts</h2>
              <span className="posts-count">
                {posts.length} {posts.length === 1 ? "post" : "posts"}
              </span>
            </div>

            <div className="feed-sort-group" role="group" aria-label="Sort feed">
              <button
                type="button"
                className={`sort-pill ${sortBy === "latest" ? "active" : ""}`}
                onClick={() => setSortBy("latest")}
              >
                Latest
              </button>
              <button
                type="button"
                className={`sort-pill ${sortBy === "top" ? "active" : ""}`}
                onClick={() => setSortBy("top")}
              >
                Top
              </button>
            </div>
          </div>

          {/* Feed List */}
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <span>Loading {currentCommunity.name} feed…</span>
            </div>
          ) : posts.length ? (
            <div className="feed-list">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  user={user}
                  onVote={vote}
                  onCommentCountChange={handleCommentCountChange}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-symbol">✳</div>
              <h3>It starts with someone.</h3>
              <p>
                No posts in {currentCommunity.name} yet. Be the first member to start a discussion,
                ask a question, or share a helpful resource.
              </p>
              {eligibility?.reason === "NOT_A_MEMBER" && (
                <button type="button" className="btn btn-dark" onClick={joinCommunity}>
                  Join and get started
                </button>
              )}
            </div>
          )}
        </main>

        {/* Right Sidebar Information Cards */}
        <aside className="rightbar">
          <div className="about-card">
            <p className="eyebrow">THE IDEA</p>
            <h3>Trust is built, not assumed.</h3>
            <p>
              Unfold is an intentional community where every contribution earns the right to make
              the next one through peer upvotes.
            </p>
            <div className="rule-row">
              <span>Posting threshold</span>
              <strong>+{eligibility?.threshold || 5} net score</strong>
            </div>
            <div className="rule-row">
              <span>Identity</span>
              <strong>Pseudonymous</strong>
            </div>
            <div className="rule-row">
              <span>Voting</span>
              <strong>1 vote per post</strong>
            </div>
            <div className="rule-row">
              <span>Categories</span>
              <strong>Discussion · Question · Resource</strong>
            </div>
          </div>

          <div className="profile-card">
            <div className="avatar large">{user.username.slice(0, 1).toUpperCase()}</div>
            <h3>{user.username}</h3>
            <span className="verified-label">● Community member</span>
            <p className="muted">Your reputation grows as the community upvotes your contributions.</p>
          </div>

          <p className="footer-note">
            Unfold · Academic Full-Stack Project
            <br />
            Built with React, Express, and REST APIs.
          </p>
        </aside>
      </div>
    </div>
  );
}
