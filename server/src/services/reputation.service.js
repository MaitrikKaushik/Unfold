import Post from "../models/Post.js";
import User from "../models/User.js";
import { assertActiveMember, getMembership } from "./community.service.js";

export const REQUIRED_UPVOTES = 2;

export async function getLatestPublishedPost({ authorId, session } = {}) {
  // Removed published posts remain in the reputation history. This prevents
  // deleting a post from resetting a user's lifetime publishing sequence.
  let query = Post.findOne({
    authorId,
    $or: [
      { status: "published" },
      { status: "removed", publishedAt: { $ne: null } }
    ]
  }).sort({ publishedAt: -1, _id: -1 });
  if (session) query = query.session(session);
  return query;
}

export async function getPostingEligibility({ userId, communityId = null, session } = {}) {
  if (communityId) {
    const membership = await getMembership({ userId, communityId, session });
    if (!membership.isMember) {
      return {
        canPost: false,
        reason: "NOT_A_MEMBER",
        currentGatePost: null,
        threshold: REQUIRED_UPVOTES,
        pendingPostExists: false
      };
    }
  }

  let pendingQuery = Post.findOne({ authorId: userId, status: "pending" });
  if (session) pendingQuery = pendingQuery.session(session);
  const pendingPost = await pendingQuery;
  const latestPost = await getLatestPublishedPost({ authorId: userId, session });
  const upvoteCount = latestPost?.upvotesCount || 0;
  const gateMet = !latestPost || upvoteCount >= REQUIRED_UPVOTES;
  const currentGatePost = latestPost ? {
    postId: String(latestPost._id),
    upvoteCount,
    downvoteCount: latestPost.downvotesCount || 0,
    score: latestPost.score || 0
  } : null;

  if (pendingPost) {
    return {
      canPost: false,
      reason: "PENDING_POST_EXISTS",
      currentGatePost,
      pendingPostId: String(pendingPost._id),
      threshold: REQUIRED_UPVOTES,
      pendingPostExists: true
    };
  }

  return {
    canPost: gateMet,
    reason: !latestPost ? "FIRST_POST" : gateMet ? "UPVOTE_THRESHOLD_REACHED" : "UPVOTE_THRESHOLD_NOT_REACHED",
    currentGatePost,
    threshold: REQUIRED_UPVOTES,
    pendingPostExists: false
  };
}

/** Promote the author's one queued post after the latest published post has two upvotes. */
export async function promotePendingPostIfEligible({ authorId, session, now = new Date() } = {}) {
  const latestPost = await getLatestPublishedPost({ authorId, session });
  if (latestPost && latestPost.upvotesCount < REQUIRED_UPVOTES) return null;

  let pendingQuery = Post.findOne({ authorId, status: "pending" }).sort({ createdAt: 1, _id: 1 });
  if (session) pendingQuery = pendingQuery.session(session);
  const pending = await pendingQuery;
  if (!pending) return null;

  pending.status = "published";
  pending.publishedAt = now;
  await pending.save({ session });
  await User.updateOne({ _id: authorId }, { $inc: { "stats.publishedPosts": 1 } }, { session });
  return pending;
}

export async function assertCanSubmitPost({ userId, communityId = null, session } = {}) {
  if (communityId) await assertActiveMember({ userId, communityId, session });
  const eligibility = await getPostingEligibility({ userId, communityId, session });
  if (eligibility.reason === "PENDING_POST_EXISTS") {
    const error = new Error("You already have a post waiting for two upvotes on your latest published post.");
    error.status = 409;
    error.code = "PENDING_POST_EXISTS";
    throw error;
  }
  return eligibility;
}
