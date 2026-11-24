import { eligibilityFor, latestPostFor, promotePendingPostIfEligible } from "./src/services/eligibility.js";

const userId = "user-a";
const communityId = "technology";
const member = { id: "membership-a", userId, communityId, status: "active" };

function makeStore({ posts = [], memberships = [member] } = {}) {
  return { posts, memberships, votes: [], comments: [], users: [], communities: [] };
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`✓ ${message}`);
}

console.log("=== Unfold foundation tests: reputation gate ===");

const firstPostStore = makeStore();
assert(eligibilityFor(firstPostStore, userId, communityId).canPost, "A member can publish their first post without votes");

const oneUpvoteStore = makeStore({ posts: [
  { id: "post-1", authorId: userId, communityId, upvoteCount: 1, downvoteCount: 0, status: "active", createdAt: "2026-11-24T08:00:00.000Z" }
] });
assert(!eligibilityFor(oneUpvoteStore, userId, communityId).canPost, "One upvote does not unlock the next post");
assert(eligibilityFor(oneUpvoteStore, userId, communityId).currentGatePost.upvoteCount === 1, "Eligibility reports the current upvote count");

const twoUpvotesWithManyDownvotes = makeStore({ posts: [
  { id: "post-1", authorId: userId, communityId, upvoteCount: 2, downvoteCount: 7, status: "active", createdAt: "2026-11-24T08:00:00.000Z" }
] });
assert(eligibilityFor(twoUpvotesWithManyDownvotes, userId, communityId).canPost, "Two upvotes unlock the next post even when downvotes make net score negative");

const globalGateStore = makeStore({
  memberships: [member, { id: "membership-b", userId, communityId: "gaming", status: "active" }],
  posts: [
    { id: "post-1", authorId: userId, communityId: "technology", upvoteCount: 2, downvoteCount: 0, status: "active", createdAt: "2026-11-24T08:00:00.000Z" }
  ]
});
assert(eligibilityFor(globalGateStore, userId, "gaming").canPost, "The two-upvote rule is global across communities");

const pendingStore = makeStore({ posts: [
  { id: "post-1", authorId: userId, communityId, upvoteCount: 1, downvoteCount: 0, status: "active", createdAt: "2026-11-24T08:00:00.000Z" },
  { id: "post-2", authorId: userId, communityId, upvoteCount: 0, downvoteCount: 0, status: "pending", createdAt: "2026-11-24T08:01:00.000Z" }
] });
assert(eligibilityFor(pendingStore, userId, communityId).reason === "PENDING_POST_EXISTS", "A user cannot queue a second pending post");
assert(eligibilityFor(pendingStore, userId, communityId, 2, { ignorePending: true }).canPost === false, "A pending post does not bypass the two-upvote gate");

const crossCommunityHistory = makeStore({
  memberships: [member],
  posts: [
    { id: "post-old", authorId: userId, communityId: "gaming", upvoteCount: 8, downvoteCount: 0, status: "active", createdAt: "2026-11-23T08:00:00.000Z" },
    { id: "post-latest", authorId: userId, communityId: "technology", upvoteCount: 0, downvoteCount: 0, status: "active", createdAt: "2026-11-24T08:00:00.000Z" }
  ]
});
assert(latestPostFor(crossCommunityHistory, userId).id === "post-latest", "The latest published post is selected across communities");
assert(!eligibilityFor(crossCommunityHistory, userId, communityId).canPost, "The latest post controls the next unlock, not the best-scoring post");


const pendingPromotionStore = makeStore({ posts: [
  { id: "gate-post", authorId: userId, communityId, upvoteCount: 2, downvoteCount: 11, status: "active", createdAt: "2026-11-24T08:00:00.000Z" },
  { id: "queued-post", authorId: userId, communityId, upvoteCount: 0, downvoteCount: 0, status: "pending", createdAt: "2026-11-24T08:01:00.000Z" }
] });
const promoted = promotePendingPostIfEligible(pendingPromotionStore, userId, "2026-11-24T08:02:00.000Z");
assert(promoted?.status === "active" && promoted.publishedAt === "2026-11-24T08:02:00.000Z", "A pending post auto-publishes once the latest published post has two upvotes, regardless of downvotes");
assert(promotePendingPostIfEligible(pendingStore, userId, "2026-11-24T08:02:00.000Z") === null, "A pending post remains private until the latest published post reaches two upvotes");

const noMembership = makeStore({ memberships: [] });
assert(eligibilityFor(noMembership, userId, communityId).reason === "NOT_A_MEMBER", "Community posting still requires membership");

console.log("=== All foundation reputation tests passed ===");
