export function latestPostFor(store, userId, communityId) {
  return store.posts
    .filter(p => p.authorId === userId && p.communityId === communityId && p.status === "active")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}

export function eligibilityFor(store, userId, communityId, threshold) {
  const membership = store.memberships.find(m => m.userId === userId && m.communityId === communityId && m.status === "active");
  if (!membership) return { canPost: false, reason: "NOT_A_MEMBER", currentGatePost: null, threshold };
  const post = latestPostFor(store, userId, communityId);
  if (!post) return { canPost: true, reason: "FIRST_POST", currentGatePost: null, threshold };
  const score = post.upvoteCount - post.downvoteCount;
  const canPost = score >= threshold;
  return {
    canPost,
    reason: canPost ? "THRESHOLD_REACHED" : "THRESHOLD_NOT_REACHED",
    currentGatePost: { postId: post.id, score, upvoteCount: post.upvoteCount, downvoteCount: post.downvoteCount },
    threshold
  };
}
