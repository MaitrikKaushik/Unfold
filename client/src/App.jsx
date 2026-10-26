import { useCallback, useEffect, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import PostCard from "./components/PostCard";
import { api, clearSession, getToken, getUser } from "./services/api";
import React from "react";

export default function App() {
  const [user, setUser] = useState(getUser());
  const [communities, setCommunities] = useState([]);
  const [communityId, setCommunityId] = useState("technology");
  const [posts, setPosts] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [joined, setJoined] = useState([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadCommunities = useCallback(async () => {
    try { const data = await api("/communities"); setCommunities(data.communities); }
    catch (e) { setError(e.message); }
  }, []);

  const loadCommunity = useCallback(async () => {
    if (!communityId) return;
    setLoading(true); setError("");
    try {
      const data = await api(`/communities/${communityId}/posts`);
      setPosts(data.posts);
      if (getToken()) {
        try {
          const gate = await api(`/communities/${communityId}/eligibility`);
          setEligibility(gate);
        } catch { setEligibility(null); }
      } else setEligibility(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [communityId]);

  useEffect(() => { loadCommunities(); }, [loadCommunities]);
  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  async function joinCommunity() {
    setError(""); setNotice("");
    try {
      await api(`/communities/${communityId}/join`, { method: "POST" });
      setJoined(old => old.includes(communityId) ? old : [...old, communityId]);
      setNotice(`Joined ${communityId}. You can now post here.`);
      await loadCommunity();
    } catch (e) { setError(e.message); }
  }

  async function createPost(e) {
    e.preventDefault(); setError(""); setNotice("");
    const form = new FormData(); form.append("text", text); if (image) form.append("image", image);
    try {
      await api(`/communities/${communityId}/posts`, { method: "POST", body: form });
      setText(""); setImage(null); e.target.reset();
      setNotice("Post published.");
      await loadCommunity();
    } catch (e) { setError(e.message); await loadCommunity(); }
  }

  async function vote(post, value) {
    if (!user) { setError("Log in to vote."); return; }
    setError(""); setNotice("");
    try {
      if (post.myVote === value) await api(`/posts/${post.id}/vote`, { method: "DELETE" });
      else await api(`/posts/${post.id}/vote`, { method: "PUT", body: JSON.stringify({ value }) });
      await loadCommunity();
    } catch (e) { setError(e.message); }
  }

  function logout() { clearSession(); setUser(null); setEligibility(null); setPosts(p => p.map(x => ({...x, myVote:0}))); setNotice("Logged out."); }

  if (!user) return <><header className="topbar"><a className="brand" href="#"><span className="brand-mark small-mark">c.</span> commonground</a><span className="topbar-note">Pseudonymous by default</span></header><AuthPanel onAuth={u => {setUser(u);setNotice("Welcome to CommonGround.");}} /></>;

  const isMember = joined.includes(communityId) || eligibility?.reason !== "NOT_A_MEMBER";
  const canPost = eligibility?.canPost === true;

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark small-mark">c.</span> commonground</a>
      <div className="topbar-right"><span className="user-chip"><span className="online-dot"></span>{user.username}</span><button className="btn btn-sm btn-outline-secondary" onClick={logout}>Log out</button></div>
    </header>
    <div className="layout">
      <aside className="sidebar">
        <p className="eyebrow">YOUR SPACE</p>
        <button className="nav-item active" onClick={() => loadCommunity()}><span>⌂</span> Community feed</button>
        <div className="sidebar-divider"></div>
        <p className="eyebrow">COMMUNITIES</p>
        {communities.map(c => <button key={c.id} className={`community-nav ${communityId === c.id ? "chosen" : ""}`} onClick={() => setCommunityId(c.id)}><span className="community-icon">{c.name.slice(0,1)}</span><span>{c.name}</span></button>)}
        <div className="sidebar-note"><span>✳</span><strong>Good things take votes.</strong><p>Your next post unlocks when your latest post earns a net score of +5.</p></div>
      </aside>

      <main className="main-content">
        <section className="welcome-row"><div><p className="eyebrow">YOUR COMMUNITY, YOUR VOICE</p><h1>{communities.find(c => c.id === communityId)?.name || "Community"}</h1><p className="muted">{communities.find(c => c.id === communityId)?.description}</p></div><div className="feed-mark">✳</div></section>

        {notice && <div className="alert alert-success py-2">{notice}<button className="alert-close" onClick={() => setNotice("")}>×</button></div>}
        {error && <div className="alert alert-danger py-2">{error}<button className="alert-close" onClick={() => setError("")}>×</button></div>}

        <section className="eligibility-card">
          <div className="eligibility-symbol">{canPost ? "✓" : eligibility?.currentGatePost ? "↗" : "＋"}</div>
          <div className="eligibility-copy"><strong>{!eligibility ? "Your posting status" : canPost ? "You're clear to contribute" : eligibility.reason === "NOT_A_MEMBER" ? "Join to participate" : "Your next post is still locked"}</strong><p>{!eligibility ? "Join this community to see your posting status." : eligibility.reason === "NOT_A_MEMBER" ? "Become a member to create your first post." : eligibility.currentGatePost ? `Latest post score: ${eligibility.currentGatePost.score} / 5. ${canPost ? "Your next post is unlocked." : `You need a net score of ${eligibility.threshold} to unlock your next post.`}` : "Your first post in this community is ready."}</p></div>
          {eligibility?.reason === "NOT_A_MEMBER" && <button className="btn btn-dark btn-sm" onClick={joinCommunity}>Join community</button>}
          {eligibility?.currentGatePost && <div className="score-progress"><div className="progress"><div className="progress-bar" style={{width:`${Math.max(0,Math.min(100, eligibility.currentGatePost.score / eligibility.threshold * 100))}%`}}></div></div><small>{eligibility.currentGatePost.score} / {eligibility.threshold}</small></div>}
        </section>

        {isMember && canPost && <section className="composer">
          <div className="composer-heading"><div className="avatar">{user.username.slice(0,1).toUpperCase()}</div><div><strong>Create a post</strong><p>Share something worth discussing.</p></div></div>
          <form onSubmit={createPost}>
            <textarea className="form-control post-input" rows="3" maxLength="2000" placeholder="What would you like to share?" value={text} onChange={e => setText(e.target.value)} />
            <div className="composer-footer"><label className="upload-label">＋ Add image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => setImage(e.target.files?.[0] || null)} /></label><span className="muted small">{image ? image.name : `${text.length}/2000`}</span><button className="btn btn-dark btn-sm" disabled={!text.trim() && !image}>Publish post ↗</button></div>
          </form>
        </section>}

        <div className="feed-heading"><h2>Recent posts</h2><span>{posts.length} posts</span></div>
        {loading ? <div className="loading-state">Loading your community…</div> : posts.length ? <div className="feed-list">{posts.map(post => <PostCard key={post.id} post={post} user={user} onVote={vote} />)}</div> : <div className="empty-state"><div>✳</div><h3>It starts with someone.</h3><p>No posts here yet. Join the community and be the first to share something.</p>{eligibility?.reason === "NOT_A_MEMBER" && <button className="btn btn-dark" onClick={joinCommunity}>Join and get started</button>}</div>}
      </main>
      <aside className="rightbar">
        <div className="about-card"><p className="eyebrow">THE IDEA</p><h3>Trust is built, not assumed.</h3><p>CommonGround gives every contribution a chance to earn the next one.</p><div className="rule-row"><span>Posting threshold</span><strong>+5 net</strong></div><div className="rule-row"><span>Identity</span><strong>Pseudonymous</strong></div><div className="rule-row"><span>Voting</span><strong>1 per person/post</strong></div></div>
        <div className="profile-card"><div className="avatar large">{user.username.slice(0,1).toUpperCase()}</div><h3>{user.username}</h3><span className="verified-label">● Community member</span><p className="muted">Your reputation grows with every contribution.</p><button className="btn btn-outline-secondary btn-sm w-100" onClick={() => setNotice("Profile and identity verification are planned for a later prototype phase.")}>View profile</button></div>
        <p className="footer-note">A student-built prototype · Be thoughtful, be kind.</p>
      </aside>
    </div>
  </div>;
}
