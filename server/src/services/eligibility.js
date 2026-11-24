/**
 * Temporary compatibility gate for the original JSON-backed content module.
 * The new MongoDB Post service must implement the same contract:
 * first post is free; every later post requires two distinct upvotes on the
 * user's latest published post. Downvotes affect displayed score only.
 */
export function latestPostFor(store, userId) {
  return store.posts
    .filter((post) => post.authorId === userId && ["active", "published"].includes(post.status))
    .sort((a, b) => {
      const dateA = a.publishedAt || a.createdAt;
      const dateB = b.publishedAt || b.createdAt;
      return String(dateB).localeCompare(String(dateA));
    })[0] || null;
}

export function eligibilityFor(store, userId, communityId, _threshold = 2, { ignorePending = false } = {}) {
  const membership = store.memberships.find(
    (item) => item.userId === userId && item.communityId === communityId && item.status === "active"
  );
  if (!membership) {
    return { canPost: false, reason: "NOT_A_MEMBER", currentGatePost: null, threshold: 2, pendingPostExists: false };
  }

  const pendingPost = store.posts.find((post) => post.authorId === userId && post.status === "pending");
  const post = latestPostFor(store, userId);
  const upvoteCount = Number(post?.upvoteCount || 0);
  const downvoteCount = Number(post?.downvoteCount || 0);
  const gateMet = !post || upvoteCount >= 2;
  const currentGatePost = post ? {
    postId: post.id,
    upvoteCount,
    downvoteCount,
    score: upvoteCount - downvoteCount
  } : null;

  if (pendingPost && !ignorePending) {
    return {
      canPost: false,
      reason: "PENDING_POST_EXISTS",
      currentGatePost,
      pendingPostId: pendingPost.id,
      threshold: 2,
      pendingPostExists: true
    };
  }

  return {
    canPost: gateMet,
    reason: !post ? "FIRST_POST" : gateMet ? "UPVOTE_THRESHOLD_REACHED" : "UPVOTE_THRESHOLD_NOT_REACHED",
    currentGatePost,
    threshold: 2,
    pendingPostExists: Boolean(pendingPost)
  };
}

/**
 * Publish the author's one queued post as soon as the latest published post
 * reaches the two-upvote threshold. Pass a timestamp for deterministic tests.
 */
export function promotePendingPostIfEligible(store, authorId, publishedAt = new Date().toISOString()) {
  const pending = store.posts
    .filter((post) => post.authorId === authorId && post.status === "pending")
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  if (!pending) return null;

  const eligibility = eligibilityFor(store, authorId, pending.communityId, 2, { ignorePending: true });
  if (!eligibility.canPost) return null;

  pending.status = "active";
  pending.publishedAt = publishedAt;
  pending.updatedAt = publishedAt;
  return pending;
}
