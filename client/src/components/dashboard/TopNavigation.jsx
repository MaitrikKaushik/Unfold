import React from "react";
import UnfoldLogo from "../UnfoldLogo";
import AccountMenu from "./AccountMenu";
import Icon from "./Icon";

export default function TopNavigation({
  user,
  onNavigateFeed,
  onEditProfile,
  onCreatePost,
  canPost,
  eligibilityReason,
  searchQuery,
  onSearchChange,
  onToggleMobileNav,
  mobileNavOpen
}) {
  const createTitle = canPost
    ? "Create a post"
    : eligibilityReason === "NOT_A_MEMBER"
    ? "Join this community to create a post"
    : "Earn a net score of +5 to create another post";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={onToggleMobileNav}
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileNavOpen}
        >
          <Icon name={mobileNavOpen ? "close" : "menu"} size={20} />
        </button>

        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            onNavigateFeed();
          }}
          aria-label="Unfold home"
        >
          <UnfoldLogo size="sm" withText={true} />
        </a>
      </div>

      <div className="topbar-search">
        <Icon name="search" size={17} className="search-icon" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search loaded posts…"
          aria-label="Search posts in the current community"
          maxLength={120}
        />
        {searchQuery && (
          <button
            type="button"
            className="search-clear"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className={`btn btn-create-post${canPost ? "" : " is-restricted"}`}
          onClick={onCreatePost}
          title={createTitle}
        >
          <Icon name="plus" size={17} />
          <span>Create post</span>
        </button>

        <AccountMenu user={user} onEditProfile={onEditProfile} />
      </div>
    </header>
  );
}
