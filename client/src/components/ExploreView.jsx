import React, { useState, useMemo } from "react";
import {
  Compass,
  Search,
  X,
  Users,
  Check,
  Plus,
  ArrowRight,
  Sparkles,
  Loader2,
  FolderKanban
} from "lucide-react";

export default function ExploreView({
  communities = [],
  joinedCommunityIds = [],
  onSelectCommunity,
  onJoinCommunity,
  getCommunityIcon,
  currentUser,
  onNavigateToProjects
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "popular" | "recent" | "joined"
  const [joiningId, setJoiningId] = useState(null);

  // Helper to determine if community is joined
  const isCommunityJoined = (comm) => {
    if (comm.id === "general" || comm.slug === "general") return true;
    if (comm.isMember) return true;
    return joinedCommunityIds.includes(comm.id) || joinedCommunityIds.includes(comm.slug);
  };

  // Filter and sort communities
  const filteredCommunities = useMemo(() => {
    let list = [...communities];

    // 1. Search Query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description && c.description.toLowerCase().includes(q)) ||
          (c.slug && c.slug.toLowerCase().includes(q))
      );
    }

    // 2. Tab Filter
    if (activeFilter === "joined") {
      list = list.filter((c) => isCommunityJoined(c));
    } else if (activeFilter === "popular") {
      list.sort((a, b) => {
        // Keep General first or sort by memberCount
        if (a.id === "general") return -1;
        if (b.id === "general") return 1;
        return (b.memberCount || 0) - (a.memberCount || 0);
      });
    } else if (activeFilter === "recent") {
      list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    return list;
  }, [communities, searchQuery, activeFilter, joinedCommunityIds]);

  // Counts for tabs
  const joinedCount = useMemo(() => {
    return communities.filter((c) => isCommunityJoined(c)).length;
  }, [communities, joinedCommunityIds]);

  const handleJoinClick = async (e, communityId) => {
    e.stopPropagation();
    if (joiningId) return;
    setJoiningId(communityId);
    try {
      await onJoinCommunity(communityId);
    } catch {
      // Error handled by parent notice/error state
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="explore-view-container">
      {/* 1. DISCOVERY HEADER */}
      <header className="discovery-header">
        <div className="discovery-header-top">
          <div className="discovery-eyebrow-row">
            <Compass size={15} strokeWidth={2.4} color="var(--color-primary)" />
            <span className="discovery-eyebrow">DISCOVER</span>
          </div>
          <h1 className="discovery-title">Explore Communities</h1>
          <p className="discovery-description">
            Find your people. Discover ideas. Build knowledge.
          </p>
        </div>

        {onNavigateToProjects && (
          <div
            className="explore-projects-cta-card mt-3"
            onClick={onNavigateToProjects}
            role="button"
            tabIndex={0}
          >
            <div className="d-flex align-items-center gap-3">
              <div className="explore-projects-icon-wrap">
                <FolderKanban size={20} strokeWidth={2.2} />
              </div>
              <div>
                <strong>Community Projects</strong>
                <p className="m-0 text-muted small">
                  Collaborate on initiatives, coordinate tasks on Kanban boards, and build real-world work.
                </p>
              </div>
            </div>
            <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
              <span>Explore Projects</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}
      </header>

      {/* 2. COMMUNITY SEARCH */}
      <div className="discovery-search-wrapper">
        <div className="discovery-search-box">
          <Search size={18} strokeWidth={2.2} className="discovery-search-icon" />
          <input
            type="text"
            className="discovery-search-input"
            placeholder="Search communities by name or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search communities"
          />
          {searchQuery && (
            <button
              type="button"
              className="discovery-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      {/* 3. DISCOVERY FILTERS */}
      <div className="discovery-filters-bar">
        <div className="discovery-tabs">
          <button
            type="button"
            className={`discovery-tab-btn ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            <span>All Communities</span>
            <span className="discovery-tab-count">{communities.length}</span>
          </button>

          <button
            type="button"
            className={`discovery-tab-btn ${activeFilter === "popular" ? "active" : ""}`}
            onClick={() => setActiveFilter("popular")}
          >
            <span>Popular</span>
          </button>

          <button
            type="button"
            className={`discovery-tab-btn ${activeFilter === "recent" ? "active" : ""}`}
            onClick={() => setActiveFilter("recent")}
          >
            <span>Recently Created</span>
          </button>

          <button
            type="button"
            className={`discovery-tab-btn ${activeFilter === "joined" ? "active" : ""}`}
            onClick={() => setActiveFilter("joined")}
          >
            <span>Joined</span>
            <span className="discovery-tab-count">{joinedCount}</span>
          </button>
        </div>

        <div className="discovery-result-count">
          {filteredCommunities.length}{" "}
          {filteredCommunities.length === 1 ? "community" : "communities"}
        </div>
      </div>

      {/* 4. COMMUNITY DIRECTORY GRID */}
      {filteredCommunities.length > 0 ? (
        <div className="discovery-grid">
          {filteredCommunities.map((comm) => {
            const joined = isCommunityJoined(comm);
            const isJoining = joiningId === comm.id;

            return (
              <div
                key={comm.id}
                className="discovery-card"
                onClick={() => onSelectCommunity(comm.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectCommunity(comm.id);
                  }
                }}
              >
                {/* Card Top: Icon & Badge */}
                <div className="discovery-card-top">
                  <div className="discovery-card-icon-container">
                    {getCommunityIcon(comm.slug || comm.id || comm.name, 20)}
                  </div>
                  <span className="discovery-card-slug">{comm.slug || comm.id}</span>
                </div>

                {/* Card Identity */}
                <div className="discovery-card-info">
                  <h3 className="discovery-card-title">{comm.name}</h3>
                  <p className="discovery-card-desc">
                    {comm.description || "Active discussions, shared insights and community resources."}
                  </p>
                </div>

                {/* Card Metadata */}
                <div className="discovery-card-meta">
                  <div className="discovery-meta-item">
                    <Users size={13} strokeWidth={2.2} />
                    <span>
                      {comm.id === "general"
                        ? "Open to all"
                        : `${comm.memberCount || 0} ${comm.memberCount === 1 ? "member" : "members"}`}
                    </span>
                  </div>
                  {comm.isGeneral && (
                    <span className="discovery-meta-badge">Default space</span>
                  )}
                </div>

                {/* Card Actions */}
                <div className="discovery-card-actions">
                  {joined ? (
                    <span className="discovery-badge-joined">
                      <Check size={12} strokeWidth={2.8} />
                      <span>Joined</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm discovery-join-btn"
                      onClick={(e) => handleJoinClick(e, comm.id)}
                      disabled={isJoining}
                    >
                      {isJoining ? (
                        <>
                          <Loader2 size={13} strokeWidth={2.2} className="spin-animate" />
                          <span>Joining...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={13} strokeWidth={2.4} />
                          <span>Join Community</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm discovery-view-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCommunity(comm.id);
                    }}
                  >
                    <span>View</span>
                    <ArrowRight size={13} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 5. DISCOVERY EMPTY STATES */
        <div className="discovery-empty-state">
          {searchQuery ? (
            <>
              <div className="discovery-empty-icon">
                <Search size={32} strokeWidth={1.8} />
              </div>
              <h3>No communities match your search</h3>
              <p>
                We could not find any communities matching &ldquo;{searchQuery}&rdquo;.
                Try searching with different terms or explore all communities.
              </p>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => setSearchQuery("")}
              >
                Clear Search
              </button>
            </>
          ) : activeFilter === "joined" ? (
            <>
              <div className="discovery-empty-icon">
                <Users size={32} strokeWidth={1.8} />
              </div>
              <h3>You have not joined any topic communities yet</h3>
              <p>
                Join communities in your areas of interest to participate in focused discussions,
                ask questions, and share resources.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setActiveFilter("all")}
              >
                Browse All Communities
              </button>
            </>
          ) : (
            <>
              <div className="discovery-empty-icon">
                <Compass size={32} strokeWidth={1.8} />
              </div>
              <h3>No communities available</h3>
              <p>There are currently no public communities to display.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
