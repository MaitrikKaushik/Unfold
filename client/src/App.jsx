import React, { useCallback, useEffect, useMemo, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import SettingsView from "./components/SettingsView";
import UnfoldLogo from "./components/UnfoldLogo";
import TopNavigation from "./components/dashboard/TopNavigation";
import Sidebar from "./components/dashboard/Sidebar";
import MainFeed from "./components/dashboard/MainFeed";
import RightSidebar from "./components/dashboard/RightSidebar";
import ExploreView from "./components/dashboard/ExploreView";
import Icon from "./components/dashboard/Icon";
import { api, clearSession, getToken, getUser } from "./services/api";

export default function App({ entering = false }) {
  const [user, setUser] = useState(getUser());
  const [activeView, setActiveView] = useState("feed"); // "feed" | "explore" | "my-posts" | "settings"
  const [communities, setCommunities] = useState([]);
  const [communityId, setCommunityId] = useState("technology");
  const [posts, setPosts] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [joined, setJoined] = useState([]);
  const [sortBy, setSortBy] = useState("latest");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  // Initialize theme from localStorage on load
  useEffect(() => {
    const savedTheme = localStorage.getItem("unfold_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  // Verify stored session on mount and listen for session expiration events
  useEffect(() => {
    if (getToken()) {
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
      setJoined([]);
      setError(e?.detail || "Your session has expired. Please log in again.");
    }

    window.addEventListener("unfold_auth_expired", handleAuthExpired);
    return () => window.removeEventListener("unfold_auth_expired", handleAuthExpired);
  }, []);

  // Escape closes the mobile navigation drawer.
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    function handleKey(event) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileNavOpen]);

  // Lock background scrolling while the mobile drawer is open.
  useEffect(() => {
    const root = document.documentElement;
    if (mobileNavOpen) root.classList.add("mobile-nav-open");
    else root.classList.remove("mobile-nav-open");
    return () => root.classList.remove("mobile-nav-open");
  }, [mobileNavOpen]);

  const loadCommunities = useCallback(async () => {
    try {
      const data = await api("/communities");
      setCommunities(data.communities || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Membership is not returned by /communities; derive it from the existing
  // per-community eligibility endpoint so the sidebar shows only real joins.
  const loadMemberships = useCallback(async (list) => {
    if (!getToken() || !list.length) return;
    const results = await Promise.all(
      list.map(async (community) => {
        try {
          const gate = await api(`/communities/${community.id}/eligibility`);
          return gate?.reason && gate.reason !== "NOT_A_MEMBER" ? community.id : null;
        } catch {
          return null;
        }
      })
    );
    setJoined(results.filter(Boolean));
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
  }, [communityId, sortBy, user]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  useEffect(() => {
    loadCommunity();
  }, [loadCommunity]);

  useEffect(() => {
    if (user && communities.length) loadMemberships(communities);
  }, [user?.id, communities, loadMemberships]);

  // Derived state used by both the dashboard and its handlers.
  const isMember = joined.includes(communityId) || eligibility?.reason !== "NOT_A_MEMBER";
  const canPost = eligibility?.canPost === true;
  const currentCommunity = communities.find((c) => c.id === communityId) || {
    id: communityId,
    name: communityId,
    description: "Community discussion"
  };

  const authoredPosts = useMemo(
    () => posts.filter((post) => post.author?.id === user?.id),
    [posts, user?.id]
  );
  const scopedPosts = activeView === "my-posts" ? authoredPosts : posts;

  const filteredPosts = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return scopedPosts;
    return scopedPosts.filter((post) =>
      [post.title, post.text, post.link, post.category, post.author?.username].some(
        (value) => typeof value === "string" && value.toLowerCase().includes(term)
      )
    );
  }, [scopedPosts, searchQuery]);

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

  async function createPost(form, reset) {
    setError("");
    setNotice("");
    setPosting(true);

    try {
      await api(`/communities/${communityId}/posts`, { method: "POST", body: form });
      reset();
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

  function navigateFeed() {
    setActiveView("feed");
    setSearchQuery("");
    loadCommunity();
  }

  function navigateExplore() {
    setActiveView("explore");
    setSearchQuery("");
    setMobileNavOpen(false);
  }

  function navigateMyPosts() {
    setActiveView("my-posts");
    setSearchQuery("");
    setMobileNavOpen(false);
  }

  function navigateSettings() {
    setActiveView("settings");
    setMobileNavOpen(false);
  }

  function selectCommunity(id) {
    setCommunityId(id);
    setActiveView("feed");
    setSearchQuery("");
    setMobileNavOpen(false);
  }

  function openComposer() {
    if (activeView !== "feed") {
      setActiveView("feed");
      setSearchQuery("");
      setMobileNavOpen(false);
    }
    window.requestAnimationFrame(() => {
      const target =
        canPost && isMember
          ? document.getElementById("composer")
          : document.querySelector(".eligibility-card");
      if (!target) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      if (canPost && isMember) {
        window.setTimeout(
          () => document.getElementById("composer-title")?.focus({ preventScroll: true }),
          reduce ? 0 : 350
        );
      }
    });
  }

  function logout() {
    clearSession();
    setUser(null);
    setEligibility(null);
    setJoined([]);
    setPosts((p) => p.map((x) => ({ ...x, myVote: 0 })));
    setActiveView("feed");
    setSearchQuery("");
    setMobileNavOpen(false);
    setNotice("You have logged out successfully.");
  }

  if (!user) {
    return (
      <div className={`auth-page-wrapper${entering ? " app-entering" : ""}`}>
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
            setNotice("Welcome to Unfold!");
          }}
        />
      </div>
    );
  }

  return (
    <div className={`app-shell${entering ? " app-entering" : ""}`}>
      <TopNavigation
        user={user}
        onNavigateFeed={navigateFeed}
        onEditProfile={navigateSettings}
        onCreatePost={openComposer}
        canPost={canPost}
        eligibilityReason={eligibility?.reason}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleMobileNav={() => setMobileNavOpen((open) => !open)}
        mobileNavOpen={mobileNavOpen}
      />

      {mobileNavOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="layout">
        <Sidebar
          communities={communities}
          joined={joined}
          communityId={communityId}
          activeView={activeView}
          eligibility={eligibility}
          user={user}
          onNavigateFeed={navigateFeed}
          onNavigateExplore={navigateExplore}
          onNavigateMyPosts={navigateMyPosts}
          onNavigateSettings={navigateSettings}
          onSelectCommunity={selectCommunity}
          onLogout={logout}
          onCloseMobileNav={() => setMobileNavOpen(false)}
          mobileNavOpen={mobileNavOpen}
        />

        <main className="main-content">
          {notice && (
            <div className="alert alert-success py-2 mb-3">
              {notice}
              <button type="button" className="alert-close" onClick={() => setNotice("")}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}

          {error && (
            <div className="alert alert-danger py-2 mb-3">
              {error}
              <button type="button" className="alert-close" onClick={() => setError("")}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}

          {activeView === "settings" ? (
            <SettingsView
              user={user}
              onUserUpdate={handleUserUpdated}
              onBackToFeed={navigateFeed}
            />
          ) : activeView === "explore" ? (
            <ExploreView
              communities={communities}
              joined={joined}
              onSelectCommunity={selectCommunity}
            />
          ) : (
            <MainFeed
              currentCommunity={currentCommunity}
              isMember={isMember}
              canPost={canPost}
              eligibility={eligibility}
              posts={filteredPosts}
              totalCount={scopedPosts.length}
              searchQuery={searchQuery}
              loading={loading}
              sortBy={sortBy}
              onSortChange={setSortBy}
              user={user}
              posting={posting}
              onJoin={joinCommunity}
              onPublish={createPost}
              onClearSearch={() => setSearchQuery("")}
              onVote={vote}
              onCommentCountChange={handleCommentCountChange}
              onUpdatePost={handlePostUpdated}
              onDeletePost={handlePostDeleted}
              onNotice={setNotice}
              viewMode={activeView}
            />
          )}
        </main>

        <RightSidebar
          currentCommunity={currentCommunity}
          isMember={isMember}
          eligibility={eligibility}
          posts={posts}
          user={user}
        />
      </div>
    </div>
  );
}
