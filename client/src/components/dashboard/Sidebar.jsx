import React, { useState } from "react";
import { AccountIdentity } from "./AccountMenu";
import Icon from "./Icon";

const VISIBLE_COMMUNITIES = 6;

export default function Sidebar({
  communities,
  joined,
  communityId,
  activeView,
  eligibility,
  user,
  onNavigateFeed,
  onNavigateExplore,
  onNavigateMyPosts,
  onNavigateSettings,
  onSelectCommunity,
  onLogout,
  onCloseMobileNav,
  mobileNavOpen
}) {
  const [communitiesOpen, setCommunitiesOpen] = useState(true);
  const [showAllCommunities, setShowAllCommunities] = useState(false);

  const threshold = eligibility?.threshold || 5;
  const score = eligibility?.currentGatePost?.score ?? null;
  const canPost = eligibility?.canPost === true;
  const notMember = eligibility?.reason === "NOT_A_MEMBER";

  const joinedCommunities = communities.filter((community) => joined.includes(community.id));
  const visibleCommunities = showAllCommunities
    ? joinedCommunities
    : joinedCommunities.slice(0, VISIBLE_COMMUNITIES);

  function run(action) {
    action();
    onCloseMobileNav();
  }

  return (
    <aside
      className={`sidebar${mobileNavOpen ? " mobile-open" : ""}`}
      aria-label="Main navigation"
    >
      <div className="sidebar-mobile-head">
        <span>
          Signed in as <strong>{user.username}</strong>
        </span>
        <button type="button" onClick={onCloseMobileNav} aria-label="Close navigation">
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="sidebar-scroll">
        <nav aria-label="Discover">
          <p className="eyebrow">DISCOVER</p>
          <button
            type="button"
            className={`nav-item ${activeView === "feed" ? "active" : ""}`}
            onClick={() => run(onNavigateFeed)}
            aria-current={activeView === "feed" ? "page" : undefined}
          >
            <Icon name="home" size={18} className="nav-icon" />
            <span>Home</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeView === "explore" ? "active" : ""}`}
            onClick={() => run(onNavigateExplore)}
            aria-current={activeView === "explore" ? "page" : undefined}
          >
            <Icon name="compass" size={18} className="nav-icon" />
            <span>Explore</span>
          </button>
        </nav>

        <div className="sidebar-divider" />

        <section className="sidebar-section" aria-label="Your communities">
          <button
            type="button"
            className="sidebar-section-toggle"
            onClick={() => setCommunitiesOpen((open) => !open)}
            aria-expanded={communitiesOpen}
          >
            <span className="eyebrow">YOUR COMMUNITIES</span>
            <Icon
              name="chevron"
              size={14}
              className={`section-chevron${communitiesOpen ? " is-open" : ""}`}
            />
          </button>

          {communitiesOpen && (
            <>
              {visibleCommunities.length ? (
                <div className="community-list">
                  {visibleCommunities.map((community) => (
                    <button
                      key={community.id}
                      type="button"
                      className={`community-nav ${
                        activeView === "feed" && communityId === community.id ? "chosen" : ""
                      }`}
                      onClick={() => run(() => onSelectCommunity(community.id))}
                      aria-current={
                        activeView === "feed" && communityId === community.id ? "page" : undefined
                      }
                    >
                      <span className="community-icon">{community.name.slice(0, 1)}</span>
                      <span className="community-nav-name">{community.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="sidebar-empty">No communities joined yet.</p>
              )}

              {joinedCommunities.length > VISIBLE_COMMUNITIES && (
                <button
                  type="button"
                  className="sidebar-text-link"
                  onClick={() => setShowAllCommunities((value) => !value)}
                >
                  {showAllCommunities ? "Show fewer" : "Show all joined"}
                  <Icon name="chevron" size={13} />
                </button>
              )}

              <button
                type="button"
                className="sidebar-text-link"
                onClick={() => run(onNavigateExplore)}
              >
                View all communities
                <Icon name="arrowRight" size={13} />
              </button>
            </>
          )}
        </section>

        <div className="sidebar-divider" />

        <nav aria-label="Your activity">
          <p className="eyebrow">YOUR ACTIVITY</p>
          <button
            type="button"
            className={`nav-item ${activeView === "my-posts" ? "active" : ""}`}
            onClick={() => run(onNavigateMyPosts)}
            aria-current={activeView === "my-posts" ? "page" : undefined}
          >
            <Icon name="fileText" size={18} className="nav-icon" />
            <span>My posts</span>
          </button>

          <div className="contribution-nav-card">
            <div className="contribution-nav-top">
              <span className={`contribution-dot${canPost ? " is-unlocked" : ""}`} />
              <strong>
                {notMember ? "Join to participate" : canPost ? "Ready to post" : "Next post locked"}
              </strong>
            </div>
            <p>
              {notMember
                ? "Membership is required before you can contribute."
                : score === null
                ? `Your first post is ready. After it, earn +${threshold} net score to post again.`
                : `Latest post: ${score} / +${threshold} net score.`}
            </p>
            {score !== null && !canPost && (
              <div className="mini-progress" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.max(0, Math.min(100, (score / threshold) * 100))}%`
                  }}
                />
              </div>
            )}
          </div>
        </nav>

        <div className="sidebar-spacer" />

        <section className="sidebar-utilities" aria-label="Utilities">
          <div className="sidebar-divider" />
          <p className="eyebrow">MORE</p>
          <button
            type="button"
            className={`nav-item ${activeView === "settings" ? "active" : ""}`}
            onClick={() => run(onNavigateSettings)}
            aria-current={activeView === "settings" ? "page" : undefined}
          >
            <Icon name="settings" size={18} className="nav-icon" />
            <span>Settings</span>
          </button>
          <button type="button" className="nav-item" onClick={() => run(onLogout)}>
            <Icon name="logout" size={18} className="nav-icon" />
            <span>Log out</span>
          </button>
        </section>
      </div>

      <div className="sidebar-account">
        <div className="sidebar-account-card" aria-label={`Signed in as ${user.username}`}>
          <AccountIdentity user={user} />
        </div>
      </div>
    </aside>
  );
}
