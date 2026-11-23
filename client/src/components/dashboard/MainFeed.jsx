import React from "react";
import PostCard from "../PostCard";
import Composer from "./Composer";
import Icon from "./Icon";

export default function MainFeed({
  currentCommunity,
  isMember,
  canPost,
  eligibility,
  posts,
  totalCount,
  searchQuery,
  loading,
  sortBy,
  onSortChange,
  user,
  posting,
  onJoin,
  onPublish,
  onClearSearch,
  onVote,
  onCommentCountChange,
  onUpdatePost,
  onDeletePost,
  onNotice,
  viewMode = "feed"
}) {
  const reason = eligibility?.reason;
  const isMyPosts = viewMode === "my-posts";

  return (
    <>
      <section className="welcome-row">
        <div className="welcome-copy">
          <p className="eyebrow">COMMUNITY SPACE</p>
          <div className="welcome-title-line">
            <h1>{currentCommunity.name}</h1>
            <span className={`membership-badge${isMember ? " is-member" : ""}`}>
              {isMember ? "Member" : "Not a member"}
            </span>
          </div>
          <p className="muted">{currentCommunity.description}</p>
        </div>
        <div className="feed-mark">
          <span className="community-hero-initial">{currentCommunity.name.slice(0, 1)}</span>
        </div>
      </section>

      <section className="eligibility-card">
        <div className="eligibility-symbol">
          <Icon
            name={canPost ? "checkCircle" : eligibility?.currentGatePost ? "arrowUp" : "plus"}
            size={18}
          />
        </div>
        <div className="eligibility-copy">
          <strong>
            {!eligibility
              ? "Your posting status"
              : canPost
              ? "You're clear to contribute"
              : reason === "NOT_A_MEMBER"
              ? "Join to participate"
              : "Your next post is locked"}
          </strong>
          <p>
            {!eligibility
              ? "Join this community to see your posting eligibility."
              : reason === "NOT_A_MEMBER"
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

        {reason === "NOT_A_MEMBER" && (
          <button type="button" className="btn btn-dark btn-sm join-btn" onClick={onJoin}>
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

      {isMember && canPost && (
        <Composer
          communityName={currentCommunity.name}
          user={user}
          posting={posting}
          onPublish={onPublish}
        />
      )}

      <div className="feed-heading">
        <div className="feed-heading-left">
          <h2>{isMyPosts ? "My Posts" : "Community Posts"}</h2>
          <span className="posts-count">
            {searchQuery ? `${posts.length} of ${totalCount}` : `${totalCount} ${totalCount === 1 ? "post" : "posts"}`}
          </span>
        </div>

        <div className="feed-sort-group" role="group" aria-label="Sort feed">
          <button
            type="button"
            className={`sort-pill ${sortBy === "latest" ? "active" : ""}`}
            onClick={() => onSortChange("latest")}
            aria-pressed={sortBy === "latest"}
          >
            <Icon name="clock" size={14} /> Latest
          </button>
          <button
            type="button"
            className={`sort-pill ${sortBy === "top" ? "active" : ""}`}
            onClick={() => onSortChange("top")}
            aria-pressed={sortBy === "top"}
          >
            <Icon name="arrowUp" size={14} /> Top
          </button>
        </div>
      </div>

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
              id={`post-${post.id}`}
              post={post}
              user={user}
              onVote={onVote}
              onCommentCountChange={onCommentCountChange}
              onUpdatePost={onUpdatePost}
              onDeletePost={onDeletePost}
              onNotice={onNotice}
            />
          ))}
        </div>
      ) : searchQuery ? (
        <div className="empty-state">
          <div className="empty-state-symbol">
            <Icon name="search" size={26} />
          </div>
          <h3>No matching posts.</h3>
          <p>
            Nothing in this community matches “{searchQuery}”. Try a different term or clear the
            search.
          </p>
          <button type="button" className="btn btn-dark btn-sm" onClick={onClearSearch}>
            Clear search
          </button>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-symbol">
            <Icon name={isMyPosts ? "fileText" : "sparkle"} size={26} />
          </div>
          <h3>{isMyPosts ? "No posts from you yet." : "It starts with someone."}</h3>
          <p>
            {isMyPosts
              ? `You haven't published in ${currentCommunity.name} yet. Use Create post to share a discussion, question, or resource.`
              : `No posts in ${currentCommunity.name} yet. Be the first member to start a discussion, ask a question, or share a helpful resource.`}
          </p>
          {reason === "NOT_A_MEMBER" && (
            <button type="button" className="btn btn-dark" onClick={onJoin}>
              Join and get started
            </button>
          )}
        </div>
      )}
    </>
  );
}
