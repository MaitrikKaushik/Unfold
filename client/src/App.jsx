import React, { useCallback, useEffect, useState } from "react";
import {
  Home,
  Compass,
  MessageSquare,
  Bell,
  Settings,
  Sun,
  Moon,
  LogOut,
  Sparkles,
  ShieldCheck,
  Check,
  ArrowUpRight,
  HelpCircle,
  Link as LinkIcon,
  Image as ImageIcon,
  AudioLines,
  Plus,
  Users,
  Gamepad2,
  Code,
  Cpu,
  UserRound,
  Layers,
  ChevronUp,
  X,
  Edit3,
  Lock,
  Clock,
  ArrowRight
} from "lucide-react";
import AuthPanel from "./components/AuthPanel";
import PostCard from "./components/PostCard";
import ProfileView from "./components/ProfileView";
import AccountSettingsView from "./components/AccountSettingsView";
import MessagesView from "./components/MessagesView";
import ExploreView from "./components/ExploreView";
import UnfoldLogo from "./components/UnfoldLogo";
import { api, clearSession, hasCachedUser, getUser } from "./services/api";

const CATEGORIES = ["Discussion", "Question", "Resource"];

function getCommunityIcon(slugOrName, size = 16) {
  const key = String(slugOrName || "").toLowerCase();
  if (key.includes("game")) return <Gamepad2 size={size} strokeWidth={2.2} />;
  if (key.includes("program") || key.includes("code") || key.includes("dev")) return <Code size={size} strokeWidth={2.2} />;
  if (key.includes("tech")) return <Cpu size={size} strokeWidth={2.2} />;
  return <Users size={size} strokeWidth={2.2} />;
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const [activeView, setActiveView] = useState("feed"); // "feed" | "explore" | "profile" | "settings" | "messages"
  const [activeNav, setActiveNav] = useState("workspace_feed"); // "workspace_feed" | "explore" | "community_<id>" | "profile" | "settings" | "messages"
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [communities, setCommunities] = useState([]);
  const [communityId, setCommunityId] = useState("general");
  const [posts, setPosts] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [joined, setJoined] = useState([]);
  const [sortBy, setSortBy] = useState("latest");
  const [theme, setTheme] = useState(() => localStorage.getItem("unfold_theme") || "light");

  // Collapsible composer state
  const [composerExpanded, setComposerExpanded] = useState(false);

  // Post composer form states (preserved across collapses)
  const [postTitle, setPostTitle] = useState("");
  const [postCategory, setPostCategory] = useState("Discussion");
  const [postLink, setPostLink] = useState("");
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [postAudio, setPostAudio] = useState(null);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  // Sync theme to root element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("unfold_theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  // Verify stored session on mount and listen for session expiration events
  useEffect(() => {
    if (hasCachedUser()) {
      api("/auth/me")
        .then((res) => {
          if (res?.user) setUser(res.user);
        })
        .catch(() => {
          clearSession();
          setUser(null);
        });
    }

    function handleAuthExpired(e) {
      setUser(null);
      setEligibility(null);
      setError(e?.detail || "Your session has expired. Please log in again.");
    }

    window.addEventListener("unfold_auth_expired", handleAuthExpired);
    return () => window.removeEventListener("unfold_auth_expired", handleAuthExpired);
  }, []);

  // Fetch unread direct messages count
  useEffect(() => {
    if (!user) {
      setUnreadMessages(0);
      return;
    }
    api("/conversations/unread")
      .then((res) => {
        setUnreadMessages(res?.data?.unreadTotal || 0);
      })
      .catch(() => {});
  }, [user, activeView]);

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

      if (hasCachedUser()) {
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
  }, [communityId, sortBy, user]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  useEffect(() => {
    loadCommunity();
  }, [loadCommunity]);

  async function handleJoinCommunity(targetId) {
    const idToJoin = targetId || communityId;
    setError("");
    setNotice("");
    try {
      await api(`/communities/${idToJoin}/join`, { method: "POST" });
      setJoined((old) => (old.includes(idToJoin) ? old : [...old, idToJoin]));
      const targetComm = communities.find((c) => c.id === idToJoin)?.name || idToJoin;
      setNotice(`Joined ${targetComm}. You are now ready to participate.`);
      await loadCommunities();
      if (idToJoin === communityId) {
        await loadCommunity();
      }
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }

  function joinCommunity() {
    return handleJoinCommunity(communityId);
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
    if (postAudio) form.append("files", postAudio);

    try {
      const result = await api(`/communities/${communityId}/posts`, { method: "POST", body: form });
      setPostTitle("");
      setPostText("");
      setPostLink("");
      setPostCategory("Discussion");
      setPostImage(null);
      setPostAudio(null);
      setComposerExpanded(false);
      e.target.reset();
      setNotice(
        result?.post?.status === "pending"
          ? "Your post is saved privately. It will appear in the feed after your latest published post receives 2 upvotes."
          : "Your post has been published to the community."
      );
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

  function handlePostUpdated(updatedPost) {
    setPosts((prevPosts) =>
      prevPosts.map((p) => (p.id === updatedPost.id ? updatedPost : p))
    );
  }

  function handlePostDeleted(deletedId) {
    setPosts((prevPosts) => prevPosts.filter((p) => p.id !== deletedId));
    loadCommunity(); // Refresh gate eligibility after deletion
  }

  function handleUserUpdated(updatedUser) {
    setUser(updatedUser);
  }

  async function logout() {
    try {
      if (hasCachedUser()) await api("/auth/logout", { method: "POST" });
    } catch {
      // Clear profile cache regardless of server network status
    }
    clearSession();
    setUser(null);
    setEligibility(null);
    setPosts((p) => p.map((x) => ({ ...x, myVote: 0 })));
    setActiveView("feed");
    setActiveNav("workspace_feed");
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
            setActiveView("feed");
            setActiveNav("workspace_feed");
            setNotice("Welcome to Unfold!");
          }}
        />
      </div>
    );
  }

  const isMember =
    communityId === "general" ||
    eligibility?.isMember === true ||
    joined.includes(communityId) ||
    communities.find((c) => c.id === communityId)?.isMember === true;
  const canPost = eligibility?.canPost === true;
  const currentCommunity = communities.find((c) => c.id === communityId) || {
    id: communityId,
    name: communityId.charAt(0).toUpperCase() + communityId.slice(1),
    description: "Community discussion and knowledge exchange."
  };

  // Find top discussion for the right panel
  const featuredPost = posts.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];

  return (
    <div className={`app-shell ${activeView === "messages" ? "messages-mode-active" : ""}`}>
      {/* ================================================================
          1. PRIMARY NAVIGATION RAIL (SLIM VERTICAL ICON RAIL)
          Strict Active State: Home | Explore | Messages | Notifications | Theme | Avatar
          ================================================================ */}
      <nav className="nav-rail" aria-label="Primary navigation rail">
        <div
          className="nav-rail-logo"
          onClick={() => {
            setActiveView("feed");
            setActiveNav("workspace_feed");
            setCommunityId("general");
          }}
          title="Unfold Home"
        >
          <UnfoldLogo size="sm" />
        </div>

        <div className="nav-rail-items">
          <button
            type="button"
            className={`nav-rail-item ${activeView === "feed" && activeNav !== "explore" ? "active" : ""}`}
            onClick={() => {
              setActiveView("feed");
              setActiveNav("workspace_feed");
              setCommunityId("general");
            }}
            aria-label="Home / Community Feed"
          >
            <Home size={20} strokeWidth={2.2} />
            <span className="tooltip-text">Home</span>
          </button>

          <button
            type="button"
            className={`nav-rail-item ${activeNav === "explore" && activeView === "explore" ? "active" : ""}`}
            onClick={() => {
              setActiveView("explore");
              setActiveNav("explore");
              setNotice("");
            }}
            aria-label="Explore Communities"
          >
            <Compass size={20} strokeWidth={2.2} />
            <span className="tooltip-text">Explore</span>
          </button>

          <button
            type="button"
            className={`nav-rail-item ${activeView === "messages" ? "active" : ""}`}
            onClick={() => {
              setActiveView("messages");
              setActiveNav("messages");
              setNotice("");
            }}
            aria-label="Direct Messages"
            title="Direct Messages"
          >
            <MessageSquare size={20} strokeWidth={2.2} />
            {unreadMessages > 0 && <span className="rail-badge">{unreadMessages}</span>}
            <span className="tooltip-text">Messages</span>
          </button>

          <button
            type="button"
            className="nav-rail-item"
            disabled
            aria-label="Notifications (Coming soon)"
          >
            <Bell size={20} strokeWidth={2.2} />
            <span className="tooltip-text">Notifications</span>
          </button>
        </div>

        <div className="nav-rail-bottom">
          <button
            type="button"
            className="nav-rail-item"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? <Moon size={20} strokeWidth={2.2} /> : <Sun size={20} strokeWidth={2.2} />}
            <span className="tooltip-text">{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>

          <button
            type="button"
            className={`nav-rail-item avatar-rail-btn ${activeView === "profile" ? "active" : ""}`}
            onClick={() => {
              setActiveView("profile");
              setActiveNav("profile");
              setNotice("");
            }}
            aria-label="My Profile"
            title="My Profile"
          >
            <span className="nav-avatar">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</span>
            <span className="tooltip-text">@{user.username}</span>
          </button>
        </div>
      </nav>

      {/* ================================================================
          2. SECONDARY SIDEBAR (3 STRICT SECTIONS & PRECISE ACTIVE STATES)
          Section A: WORKSPACE | Section B: YOUR COMMUNITIES | Section C: ACCOUNT (Bottom)
          ================================================================ */}
      <aside className="community-sidebar" aria-label="Secondary community sidebar">
        {/* SECTION A — WORKSPACE */}
        <div className="sidebar-section">
          <p className="eyebrow">WORKSPACE</p>
          <button
            type="button"
            className={`community-sidebar-item ${activeNav === "workspace_feed" && activeView === "feed" ? "active" : ""}`}
            onClick={() => {
              setActiveNav("workspace_feed");
              setCommunityId("general");
              setActiveView("feed");
            }}
          >
            <span className="sidebar-item-icon">
              <Layers size={16} strokeWidth={2.2} />
            </span>
            <span>General Feed</span>
          </button>

          <button
            type="button"
            className={`community-sidebar-item ${activeNav === "explore" && activeView === "explore" ? "active" : ""}`}
            onClick={() => {
              setActiveNav("explore");
              setActiveView("explore");
              setNotice("");
            }}
          >
            <span className="sidebar-item-icon">
              <Compass size={16} strokeWidth={2.2} />
            </span>
            <span>Explore Communities</span>
          </button>
        </div>

        <div className="community-sidebar-divider"></div>

        {/* SECTION B — YOUR COMMUNITIES */}
        <div className="sidebar-section communities-section-scroll">
          <p className="eyebrow">YOUR COMMUNITIES</p>
          <div className="community-list">
            {communities.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`community-sidebar-item ${activeNav === `community_${c.id}` && activeView === "feed" ? "active" : ""}`}
                onClick={() => {
                  setActiveNav(`community_${c.id}`);
                  setCommunityId(c.id);
                  setActiveView("feed");
                }}
              >
                <span className="sidebar-item-icon">
                  {getCommunityIcon(c.slug || c.id || c.name, 16)}
                </span>
                <span>{c.name}</span>
              </button>
            ))}

            <button
              type="button"
              className="community-sidebar-item create-comm-btn"
              onClick={() => {
                setNotice("Community creation is unlocked for verified contributors with high reputation.");
              }}
              title="Create new community"
            >
              <span className="sidebar-item-icon create-icon-wrap">
                <Plus size={16} strokeWidth={2.2} />
              </span>
              <span>Create Community</span>
            </button>
          </div>
        </div>

        {/* SECTION C — ACCOUNT (ANCHORED TO THE BOTTOM) */}
        <div className="sidebar-account-section">
          <p className="eyebrow">ACCOUNT</p>

          <button
            type="button"
            className={`community-sidebar-item ${activeNav === "profile" && activeView === "profile" ? "active" : ""}`}
            onClick={() => {
              setActiveNav("profile");
              setActiveView("profile");
              setNotice("");
            }}
          >
            <span className="sidebar-item-icon">
              <UserRound size={16} strokeWidth={2.2} />
            </span>
            <span>My Profile</span>
          </button>

          <button
            type="button"
            className={`community-sidebar-item ${activeNav === "settings" && activeView === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveNav("settings");
              setActiveView("settings");
              setNotice("");
            }}
          >
            <span className="sidebar-item-icon">
              <Settings size={16} strokeWidth={2.2} />
            </span>
            <span>Account Settings</span>
          </button>
        </div>
      </aside>

      {/* ================================================================
          3. MAIN CONTENT WORKSPACE (DOMINANT CENTRAL FEED, 60-65%)
          A. Community Header | B. Highlights | C. Collapsible Composer | D. Tabs | E. Feed
          ================================================================ */}
      <main className={`main-content ${["profile", "settings", "messages"].includes(activeView) ? "full-width-content" : ""} ${activeView === "messages" ? "messages-main-mode" : ""}`}>
        {notice && (
          <div className="alert alert-success">
            <span>{notice}</span>
            <button type="button" className="alert-close" onClick={() => setNotice("")} aria-label="Close notification">
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            <span>{error}</span>
            <button type="button" className="alert-close" onClick={() => setError("")} aria-label="Close alert">
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {activeView === "profile" ? (
          <ProfileView
            user={user}
            onUserUpdate={handleUserUpdated}
            onNavigateToSettings={() => {
              setActiveView("settings");
              setActiveNav("settings");
            }}
            onBackToFeed={() => {
              setActiveView("feed");
              setActiveNav("workspace_feed");
              loadCommunity();
            }}
          />
        ) : activeView === "settings" ? (
          <AccountSettingsView
            user={user}
            onUserUpdate={handleUserUpdated}
            onLogout={logout}
            onNavigateToProfile={() => {
              setActiveView("profile");
              setActiveNav("profile");
            }}
            onBackToFeed={() => {
              setActiveView("feed");
              setActiveNav("workspace_feed");
              loadCommunity();
            }}
          />
        ) : activeView === "messages" ? (
          <MessagesView
            currentUser={user}
            onBackToFeed={() => {
              setActiveView("feed");
              setActiveNav("workspace_feed");
              loadCommunity();
            }}
          />
        ) : activeView === "explore" ? (
          <ExploreView
            communities={communities}
            joinedCommunityIds={joined}
            onSelectCommunity={(selectedId) => {
              setCommunityId(selectedId);
              setActiveView("feed");
              setActiveNav(`community_${selectedId}`);
              setComposerExpanded(false);
            }}
            onJoinCommunity={handleJoinCommunity}
            getCommunityIcon={getCommunityIcon}
            currentUser={user}
          />
        ) : (
          <>
            {/* A. Community Header (Compact, unified with contextual badge) */}
            <section className="community-header-compact">
              <span className="community-space-badge">COMMUNITY SPACE</span>
              <div className="community-header-main-row">
                <div className="community-header-icon" aria-hidden="true">
                  {getCommunityIcon(currentCommunity.slug || currentCommunity.name, 22)}
                </div>
                <div className="community-header-details">
                  <div className="community-header-top-row">
                    <h1>{currentCommunity.name}</h1>
                    {isMember ? (
                      <span className="community-header-badge member">
                        <Check size={12} strokeWidth={2.6} />
                        <span>Member</span>
                      </span>
                    ) : (
                      <button type="button" className="btn btn-primary btn-sm community-join-btn" onClick={joinCommunity}>
                        <Plus size={13} strokeWidth={2.2} />
                        <span>Join</span>
                      </button>
                    )}
                  </div>
                  <p className="community-header-description">{currentCommunity.description}</p>
                </div>
              </div>
            </section>

            {/* B. Community Highlights (Horizontal discovery rail - only on General Feed) */}
            {communityId === "general" && (
              <section className="highlights-section">
                <div className="highlights-header-row">
                  <h3 className="highlights-title">Community Highlights</h3>
                </div>
                <div className="highlights-scroll">
                  {communities.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`highlights-card ${communityId === c.id ? "active" : ""}`}
                      onClick={() => {
                        setCommunityId(c.id);
                        setActiveNav(`community_${c.id}`);
                        setActiveView("feed");
                      }}
                    >
                      <div className="highlights-card-top">
                        <span className="highlights-card-icon">
                          {getCommunityIcon(c.slug || c.id || c.name, 17)}
                        </span>
                        <span className="highlights-card-badge">{c.slug || c.id}</span>
                      </div>
                      <span className="highlights-card-name">{c.name}</span>
                      <span className="highlights-card-desc">{c.description || "Active discussions and shared knowledge"}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* C. Collapsible Post Composer & Compact Accurate Eligibility State */}
            {isMember && !eligibility?.pendingPostExists && (
              <section className="composer-wrapper">
                {/* Compact Accurate Eligibility Indicator */}
                <div className="eligibility-compact-bar">
                  <div className="eligibility-compact-left">
                    {eligibility?.reason === "FIRST_POST" ? (
                      <>
                        <span className="eligibility-pill ready">
                          <Check size={12} strokeWidth={2.6} />
                          <span>First post ready</span>
                        </span>
                        <span className="eligibility-compact-text">
                          Your first contribution publishes publicly immediately. Subsequent posts require 2 peer upvotes to unlock.
                        </span>
                      </>
                    ) : canPost ? (
                      <>
                        <span className="eligibility-pill ready">
                          <Check size={12} strokeWidth={2.6} />
                          <span>Unlocked</span>
                        </span>
                        <span className="eligibility-compact-text">
                          Your latest post reached 2 upvotes. Your next contribution publishes immediately.
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="eligibility-pill waiting">
                          <Clock size={12} strokeWidth={2.6} />
                          <span>{eligibility?.currentGatePost?.upvoteCount || 0} / 2 upvotes</span>
                        </span>
                        <span className="eligibility-compact-text">
                          Your post will queue privately until your latest published post receives 2 distinct upvotes.
                        </span>
                      </>
                    )}
                  </div>

                  {eligibility?.currentGatePost && !canPost && (
                    <div className="eligibility-mini-progress">
                      <div className="progress">
                        <div
                          className="progress-bar"
                          style={{
                            width: `${Math.max(0, Math.min(100, (eligibility.currentGatePost.upvoteCount / 2) * 100))}%`
                          }}
                        ></div>
                      </div>
                      <small>{eligibility.currentGatePost.upvoteCount}/2</small>
                    </div>
                  )}
                </div>

                {/* Collapsed Composer Trigger vs Expanded Full Composer */}
                {!composerExpanded ? (
                  <div
                    className="composer-collapsed"
                    onClick={() => setComposerExpanded(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setComposerExpanded(true);
                      }
                    }}
                  >
                    <div className="avatar composer-collapsed-avatar">
                      {(user.displayName || user.username).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="composer-collapsed-prompt">
                      {postText.trim()
                        ? `${postText.slice(0, 55)}...`
                        : `Share something with ${currentCommunity.name}...`}
                    </div>
                    <button
                      type="button"
                      className="composer-collapsed-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setComposerExpanded(true);
                      }}
                    >
                      <Edit3 size={14} strokeWidth={2.2} />
                      <span>Create Post</span>
                    </button>
                  </div>
                ) : (
                  /* Expanded Composer Card */
                  <div className="composer expanded">
                    <div className="composer-header-row">
                      <div className="composer-heading-compact">
                        <div className="avatar">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</div>
                        <div>
                          <strong>Create a post</strong>
                          <p>Sharing to {currentCommunity.name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="composer-collapse-btn"
                        onClick={() => setComposerExpanded(false)}
                        title="Collapse composer (draft is saved)"
                        aria-label="Collapse composer"
                      >
                        <X size={16} strokeWidth={2.2} />
                      </button>
                    </div>

                    <form onSubmit={createPost}>
                      {/* Category Selection with Professional Lucide Icons */}
                      <div className="composer-category-row">
                        <span className="category-select-label">Category:</span>
                        <div className="category-pills">
                          {CATEGORIES.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              className={`cat-pill-btn ${postCategory === cat ? "selected" : ""}`}
                              onClick={() => setPostCategory(cat)}
                            >
                              {cat === "Discussion" && <MessageSquare size={13} strokeWidth={2.2} />}
                              {cat === "Question" && <HelpCircle size={13} strokeWidth={2.2} />}
                              {cat === "Resource" && <LinkIcon size={13} strokeWidth={2.2} />}
                              <span>{cat}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Post Title */}
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
                            : `What would you like to share with ${currentCommunity.name}?`
                        }
                        value={postText}
                        onChange={(e) => setPostText(e.target.value)}
                        autoFocus
                      />

                      {/* Resource Link Input */}
                      {postCategory === "Resource" && (
                        <div className="mb-2">
                          <div className="input-group">
                            <span className="input-group-text">
                              <LinkIcon size={14} strokeWidth={2.2} />
                            </span>
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
                        <div className="composer-attachments">
                          <label className="upload-label" title="Attach an image">
                            <ImageIcon size={14} strokeWidth={2.2} />
                            <span>Add image</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              hidden
                              onChange={(e) => setPostImage(e.target.files?.[0] || null)}
                            />
                          </label>

                          <label className="upload-label" title="Attach an audio file">
                            <AudioLines size={14} strokeWidth={2.2} />
                            <span>Add audio</span>
                            <input
                              type="file"
                              accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm"
                              hidden
                              onChange={(e) => setPostAudio(e.target.files?.[0] || null)}
                            />
                          </label>
                        </div>

                        <span className="composer-file-names">
                          {[postImage?.name, postAudio?.name].filter(Boolean).join(" · ") || `${postText.length}/2000`}
                        </span>

                        <div className="composer-action-group">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => setComposerExpanded(false)}
                          >
                            Collapse
                          </button>
                          <button
                            type="submit"
                            className="btn btn-primary btn-sm composer-publish-btn"
                            disabled={posting || (!postText.trim() && !postTitle.trim() && !postLink.trim() && !postImage && !postAudio)}
                          >
                            {posting ? "Submitting…" : canPost ? "Publish post" : "Queue post"}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                )}
              </section>
            )}

            {/* D. Feed Navigation & Sorting Tabs */}
            <div className="feed-tabs">
              <button
                type="button"
                className={`feed-tab ${sortBy === "latest" ? "active" : ""}`}
                onClick={() => setSortBy("latest")}
              >
                Latest
              </button>
              <button
                type="button"
                className={`feed-tab ${sortBy === "top" ? "active" : ""}`}
                onClick={() => setSortBy("top")}
              >
                Top Discussions
              </button>
              <button
                type="button"
                className="feed-tab disabled-tab"
                title="Following feed is active when following contributors"
                disabled
              >
                Following
              </button>
              <span className="feed-count">
                {posts.length} {posts.length === 1 ? "post" : "posts"}
              </span>
            </div>

            {/* E. Community Feed List */}
            {loading ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <span>Loading {currentCommunity.name} discussions…</span>
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
                    onUpdatePost={handlePostUpdated}
                    onDeletePost={handlePostDeleted}
                    onNotice={(msg) => setNotice(msg)}
                  />
                ))}
              </div>
            ) : (
              /* F. Compact Professional Empty State */
              <div className="empty-state-compact">
                <div className="empty-state-icon-container">
                  <Sparkles size={22} strokeWidth={2} />
                </div>
                <h3>It starts with someone.</h3>
                <p>
                  No discussions in this community yet. Be the first to start a meaningful discussion,
                  ask a question, or share a helpful resource.
                </p>
                {eligibility?.reason === "NOT_A_MEMBER" ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={joinCommunity}>
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Join Community</span>
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setComposerExpanded(true)}>
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Start a Discussion</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ================================================================
          4. RIGHT CONTEXTUAL PANEL (COMPACT & SECONDARY, 270px)
          Rendered on Feed and Explore views only (omitted on Profile, Settings & Messages)
          ================================================================ */}
      {(activeView === "feed" || activeView === "explore") && (
        <aside className="right-panel">
          {/* A. User Profile Summary Card */}
          <div className="right-panel-card profile-card-compact">
            <div className="profile-card-top-row">
              <div className="avatar profile-avatar-sm">
                {(user.displayName || user.username).slice(0, 1).toUpperCase()}
              </div>
              <div className="profile-card-user-info">
                <h3>{user.displayName || user.username}</h3>
                <span className="profile-username">@{user.username}</span>
              </div>
            </div>

            <p className="profile-bio-compact">
              {user.bio ? user.bio : "Your reputation grows as the community upvotes your contributions."}
            </p>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm flex-grow-1"
                onClick={() => {
                  setActiveView("profile");
                  setActiveNav("profile");
                }}
              >
                My Profile
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  setActiveView("settings");
                  setActiveNav("settings");
                }}
                title="Account Settings"
              >
                <Settings size={14} strokeWidth={2.2} />
              </button>
            </div>
          </div>

        {activeView === "explore" ? (
          <>
            {/* B. Community Discovery Information Card */}
            <div className="right-panel-card discovery-guide-card">
              <div className="d-flex align-items-center gap-2 mb-2">
                <Compass size={16} strokeWidth={2.2} color="var(--color-primary)" />
                <p className="eyebrow m-0">COMMUNITY DISCOVERY</p>
              </div>
              <h3>Find Your Community</h3>
              <p className="discovery-guide-desc">
                Explore communities based on your interests, learn about their purpose and join conversations that matter.
              </p>

              <div className="discovery-guide-list">
                <div className="discovery-guide-item">
                  <span className="guide-item-icon">
                    <Compass size={14} strokeWidth={2.2} />
                  </span>
                  <div>
                    <strong>Explore Topics</strong>
                    <p>Discover shared repositories of knowledge and active ideas.</p>
                  </div>
                </div>
                <div className="discovery-guide-item">
                  <span className="guide-item-icon">
                    <Users size={14} strokeWidth={2.2} />
                  </span>
                  <div>
                    <strong>Join Discussions</strong>
                    <p>Connect with peer contributors and topic specialists.</p>
                  </div>
                </div>
                <div className="discovery-guide-item">
                  <span className="guide-item-icon">
                    <ShieldCheck size={14} strokeWidth={2.2} />
                  </span>
                  <div>
                    <strong>Build Reputation</strong>
                    <p>Earn publishing privileges through meaningful community upvotes.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* C. Your Joined Communities (Compact) */}
            <div className="right-panel-card joined-communities-card">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <p className="eyebrow m-0">YOUR COMMUNITIES</p>
                <span className="joined-count-badge">
                  {communities.filter((c) => c.id === "general" || c.isMember || joined.includes(c.id)).length} joined
                </span>
              </div>
              <h3>Joined Spaces</h3>

              <div className="joined-communities-list">
                {communities
                  .filter((c) => c.id === "general" || c.isMember || joined.includes(c.id))
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="joined-community-row"
                      onClick={() => {
                        setCommunityId(c.id);
                        setActiveView("feed");
                        setActiveNav(`community_${c.id}`);
                        setComposerExpanded(false);
                      }}
                    >
                      <div className="d-flex align-items-center gap-2">
                        <span className="joined-community-mini-icon">
                          {getCommunityIcon(c.slug || c.id || c.name, 13)}
                        </span>
                        <span className="joined-community-name">{c.name}</span>
                      </div>
                      <ArrowRight size={13} strokeWidth={2} className="joined-community-arrow" />
                    </button>
                  ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* B. Community Philosophy Card (Properly aligned two-column + separate categories tags) */}
            <div className="right-panel-card about-card-compact">
              <div className="d-flex align-items-center gap-2 mb-2">
                <ShieldCheck size={16} strokeWidth={2.2} color="var(--color-primary)" />
                <p className="eyebrow m-0">COMMUNITY PHILOSOPHY</p>
              </div>
              <h3>Trust is built, not assumed.</h3>
              <p className="about-philosophy-desc">
                Unfold is an intentional community where each contribution earns the privilege to make the next one through peer upvotes.
              </p>

              <div className="rule-table">
                <div className="rule-row">
                  <span className="rule-label">Posting threshold</span>
                  <strong className="rule-value">2 upvotes</strong>
                </div>
                <div className="rule-row">
                  <span className="rule-label">Identity model</span>
                  <strong className="rule-value">Pseudonymous</strong>
                </div>
                <div className="rule-row">
                  <span className="rule-label">Voting rules</span>
                  <strong className="rule-value">1 vote per post</strong>
                </div>
              </div>

              {/* Clean dedicated category tags block */}
              <div className="rule-categories-block">
                <span className="rule-categories-label">Supported categories:</span>
                <div className="rule-categories-tags">
                  <span className="rule-tag">Discussion</span>
                  <span className="rule-tag">Question</span>
                  <span className="rule-tag">Resource</span>
                </div>
              </div>
            </div>

            {/* C. Featured Discussion (When available from real posts) */}
            {featuredPost && (
              <div className="right-panel-card featured-discussion-card">
                <p className="eyebrow">FEATURED DISCUSSION</p>
                <h3>{featuredPost.title || "Community Conversation"}</h3>
                <p className="featured-discussion-preview">
                  {featuredPost.text || "A highlighted discussion in " + currentCommunity.name}
                </p>
                <div className="featured-discussion-footer">
                  <span className="d-flex align-items-center gap-1">
                    <ChevronUp size={13} strokeWidth={2.5} />
                    <span>{featuredPost.score || 0} score</span>
                  </span>
                  <span className="d-flex align-items-center gap-1">
                    <MessageSquare size={13} strokeWidth={2.2} />
                    <span>{featuredPost.commentCount || 0} comments</span>
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        <div className="footer-note-subtle">
          <p className="m-0">Unfold · Community-Driven Platform</p>
        </div>
      </aside>
      )}

      {/* ================================================================
          5. MOBILE BOTTOM NAVIGATION (EXACTLY 4 ITEMS)
          1. Feed | 2. Explore | 3. Messages | 4. Settings (Includes Account & Profile)
          ================================================================ */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={`mobile-nav-item ${activeView === "feed" && activeNav !== "explore" ? "active" : ""}`}
          onClick={() => {
            setActiveView("feed");
            setActiveNav("workspace_feed");
            loadCommunity();
          }}
          aria-label="Feed"
        >
          <Home size={20} strokeWidth={2.2} />
          <span>Feed</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeView === "explore" ? "active" : ""}`}
          onClick={() => {
            setActiveView("explore");
            setActiveNav("explore");
          }}
          aria-label="Explore"
        >
          <Compass size={20} strokeWidth={2.2} />
          <span>Explore</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeView === "messages" ? "active" : ""}`}
          onClick={() => {
            setActiveView("messages");
            setActiveNav("messages");
          }}
          aria-label="Messages"
        >
          <div className="mobile-icon-wrap">
            <MessageSquare size={20} strokeWidth={2.2} />
            {unreadMessages > 0 && <span className="mobile-unread-badge">{unreadMessages}</span>}
          </div>
          <span>Messages</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeView === "settings" || activeView === "profile" ? "active" : ""}`}
          onClick={() => {
            setActiveView("settings");
            setActiveNav("settings");
          }}
          aria-label="Settings & Account"
        >
          <Settings size={20} strokeWidth={2.2} />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}
