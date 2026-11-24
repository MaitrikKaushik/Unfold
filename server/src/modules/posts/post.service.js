import mongoose from "mongoose";
import Post from "../../models/Post.js";
import Vote from "../../models/Vote.js";
import Comment from "../../models/Comment.js";
import MediaAsset from "../../models/MediaAsset.js";
import User from "../../models/User.js";
import { assertCanSubmitPost, getLatestPublishedPost, getPostingEligibility, promotePendingPostIfEligible, REQUIRED_UPVOTES } from "../../services/reputation.service.js";
import { deleteCloudinaryAsset } from "../../services/cloudinary-media.js";

const MAX_CONTENT_LENGTH = 2000;
const MAX_TITLE_LENGTH = 150;
const MAX_LINK_LENGTH = 500;
const ALLOWED_CATEGORIES = ["Discussion", "Question", "Resource"];

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanLink(value) {
  const link = String(value || "").trim();
  if (!link) return null;
  if (link.length > MAX_LINK_LENGTH) throw httpError(400, "LINK_TOO_LONG", "Link must be 500 characters or fewer.");
  const normalized = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  let parsed;
  try { parsed = new URL(normalized); } catch { throw httpError(400, "INVALID_LINK", "Enter a valid HTTP or HTTPS link."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw httpError(400, "INVALID_LINK", "Only HTTP and HTTPS links are allowed.");
  return normalized;
}

function derivePostType(content, title, media) {
  if (media.length && (content || title)) return "mixed";
  if (!media.length) return "text";
  const types = new Set(media.map((item) => item.mediaType));
  if (types.size > 1) return "mixed";
  return types.values().next().value || "text";
}

async function resolveOwnedAssets({ userId, mediaAssetIds = [], session }) {
  if (!Array.isArray(mediaAssetIds)) throw httpError(400, "INVALID_MEDIA_ASSET_LIST", "mediaAssetIds must be an array.");
  const ids = [...new Set(mediaAssetIds.map(String))];
  if (!ids.length) return [];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) {
    throw httpError(400, "INVALID_MEDIA_ASSET", "One or more media asset IDs are invalid.");
  }
  let query = MediaAsset.find({
    _id: { $in: ids },
    ownerId: userId,
    status: "uploaded"
  });
  if (session) query = query.session(session);
  const assets = await query;
  if (assets.length !== ids.length) {
    throw httpError(403, "MEDIA_ASSET_NOT_AVAILABLE", "One or more media files are not available to this account.");
  }
  return assets;
}

function mediaSnapshot(asset) {
  return {
    assetId: asset._id,
    url: asset.url,
    publicId: asset.publicId,
    mediaType: asset.mediaType,
    resourceType: asset.resourceType,
    format: asset.format,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height
  };
}

export async function createPost({
  userId,
  communityId = null,
  content = "",
  title = "",
  category = "Discussion",
  link = "",
  mediaAssetIds = []
} = {}) {
  const cleanContent = String(content || "").trim();
  const cleanTitle = String(title || "").trim();
  if (cleanContent.length > MAX_CONTENT_LENGTH) throw httpError(400, "POST_TOO_LONG", "Post content must be 2,000 characters or fewer.");
  if (cleanTitle.length > MAX_TITLE_LENGTH) throw httpError(400, "TITLE_TOO_LONG", "Post title must be 150 characters or fewer.");
  if (!ALLOWED_CATEGORIES.includes(category)) category = "Discussion";
  const cleanResourceLink = cleanLink(link);

  const session = await mongoose.startSession();
  let createdPost;
  try {
    await session.withTransaction(async () => {
      const eligibility = await assertCanSubmitPost({ userId, communityId, session });
      const assets = await resolveOwnedAssets({ userId, mediaAssetIds, session });
      if (!cleanContent && !cleanTitle && assets.length === 0 && !cleanResourceLink) {
        throw httpError(400, "EMPTY_POST", "Add text, a title, a link or a media attachment before publishing.");
      }

      const media = assets.map(mediaSnapshot);
      const status = eligibility.canPost ? "published" : "pending";
      const [post] = await Post.create([{
        authorId: userId,
        communityId,
        content: cleanContent,
        title: cleanTitle || null,
        category,
        link: cleanResourceLink,
        media,
        postType: derivePostType(cleanContent, cleanTitle, media),
        status,
        publishedAt: status === "published" ? new Date() : null,
        upvotesCount: 0,
        downvotesCount: 0,
        score: 0,
        commentCount: 0
      }], { session });

      if (assets.length) {
        await MediaAsset.updateMany(
          { _id: { $in: assets.map((asset) => asset._id) }, ownerId: userId },
          { $set: { status: "attached", postId: post._id, attachedAt: new Date() } },
          { session }
        );
      }
      if (status === "published") {
        await User.updateOne({ _id: userId }, { $inc: { "stats.publishedPosts": 1 } }, { session });
      }
      createdPost = post;
    });
  } catch (error) {
    if (error?.code === 11000) throw httpError(409, "PENDING_POST_EXISTS", "You already have a post waiting for two upvotes on your latest published post.");
    throw error;
  } finally {
    await session.endSession();
  }

  const eligibility = await getPostingEligibility({ userId, communityId });
  return { post: createdPost, eligibility };
}

export async function updatePost({ postId, userId, updates = {}, mediaAssetIds = [] } = {}) {
  if (!mongoose.isValidObjectId(postId)) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  const post = await Post.findOne({ _id: postId, status: "published" });
  if (!post) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  if (String(post.authorId) !== String(userId)) throw httpError(403, "FORBIDDEN", "You can only edit your own posts.");

  const content = updates.content !== undefined ? String(updates.content).trim() : post.content;
  const title = updates.title !== undefined ? String(updates.title).trim() : (post.title || "");
  const category = updates.category !== undefined && ALLOWED_CATEGORIES.includes(updates.category)
    ? updates.category
    : post.category;
  const link = updates.link !== undefined ? cleanLink(updates.link) : post.link;
  if (content.length > MAX_CONTENT_LENGTH) throw httpError(400, "POST_TOO_LONG", "Post content must be 2,000 characters or fewer.");
  if (title.length > MAX_TITLE_LENGTH) throw httpError(400, "TITLE_TOO_LONG", "Post title must be 150 characters or fewer.");

  const assets = await resolveOwnedAssets({ userId, mediaAssetIds });
  let media = [...post.media];
  const assetsToDelete = [];

  if (updates.removeImage) {
    const kept = [];
    for (const item of media) {
      if (item.mediaType === "image") assetsToDelete.push(item);
      else kept.push(item);
    }
    media = kept;
  }
  media.push(...assets.map(mediaSnapshot));

  if (!content && !title && !link && media.length === 0) {
    throw httpError(400, "EMPTY_POST", "A post must contain text, a title, a link or media.");
  }

  post.content = content;
  post.title = title || null;
  post.category = category;
  post.link = link;
  post.media = media;
  post.postType = derivePostType(content, title, media);
  await post.save();

  if (assets.length) {
    await MediaAsset.updateMany(
      { _id: { $in: assets.map((asset) => asset._id) }, ownerId: userId },
      { $set: { status: "attached", postId: post._id, attachedAt: new Date() } }
    );
  }
  if (assetsToDelete.length) {
    await Promise.allSettled(assetsToDelete.map(async (asset) => {
      if (asset.assetId) await MediaAsset.updateOne({ _id: asset.assetId, ownerId: userId }, { $set: { status: "deleted", postId: null } });
      await deleteCloudinaryAsset(asset.publicId, asset.resourceType);
    }));
  }
  return post;
}

export async function removePost({ postId, userId, role = "user" } = {}) {
  if (!mongoose.isValidObjectId(postId)) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  const post = await Post.findOne({ _id: postId, status: { $in: ["published", "pending"] } });
  if (!post) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  const isOwner = String(post.authorId) === String(userId);
  const isModerator = ["moderator", "admin"].includes(role);
  if (!isOwner && !isModerator) throw httpError(403, "FORBIDDEN", "You cannot remove this post.");
  if (post.status === "published") {
    const latestPost = await getLatestPublishedPost({ authorId: post.authorId });
    if (latestPost && String(latestPost._id) === String(post._id) && post.upvotesCount < REQUIRED_UPVOTES) {
      throw httpError(409, "GATING_POST_CANNOT_BE_REMOVED", "Your latest published post must remain available until it receives two upvotes.");
    }
  }
  const removedMedia = [...(post.media || [])];
  post.status = "removed";
  post.media = [];
  post.commentCount = 0;
  await post.save();
  await Promise.all([
    Comment.updateMany({ postId: post._id, deletedAt: null }, { $set: { deletedAt: new Date() } }),
    Vote.deleteMany({ postId: post._id }),
    MediaAsset.updateMany(
      { _id: { $in: removedMedia.map((item) => item.assetId).filter(Boolean) } },
      { $set: { status: "deleted", postId: null } }
    ),
    ...removedMedia.map((item) => deleteCloudinaryAsset(item.publicId, item.resourceType))
  ].map((operation) => Promise.resolve(operation).catch(() => null)));
  return post;
}

export async function listPosts({ communityId = undefined, userId = null, scope = "community", sort = "latest", limit = 20, cursor = null } = {}) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const filter = { status: "published" };
  if (scope === "general") filter.communityId = null;
  else if (communityId !== undefined) filter.communityId = communityId;
  if (scope === "following") {
    const error = httpError(501, "FOLLOWING_FEED_NOT_READY", "The following feed will be enabled when the social graph module is integrated.");
    throw error;
  }

  if (cursor && sort !== "top") {
    let decoded;
    try { decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { throw httpError(400, "INVALID_CURSOR", "The feed cursor is invalid."); }
    if (!decoded?.publishedAt || !mongoose.isValidObjectId(decoded?.id)) throw httpError(400, "INVALID_CURSOR", "The feed cursor is invalid.");
    const cursorDate = new Date(decoded.publishedAt);
    filter.$and = [
      ...(filter.$and || []),
      { $or: [{ publishedAt: { $lt: cursorDate } }, { publishedAt: cursorDate, _id: { $lt: decoded.id } }] }
    ];
  }

  const sortSpec = sort === "top" ? { score: -1, publishedAt: -1, _id: -1 } : { publishedAt: -1, _id: -1 };
  const posts = await Post.find(filter)
    .sort(sortSpec)
    .limit(safeLimit + 1)
    .populate("authorId", "username displayName bio avatar createdAt")
    .populate("communityId", "name slug")
    .lean();
  const hasMore = posts.length > safeLimit;
  if (hasMore) posts.pop();
  const next = hasMore && posts.length
    ? Buffer.from(JSON.stringify({ publishedAt: posts[posts.length - 1].publishedAt, id: String(posts[posts.length - 1]._id) })).toString("base64url")
    : null;

  // Pending posts are appended only to their author's first-page response.
  // They never enter the public feed query or become visible to other users.
  const pendingPosts = userId && !cursor
    ? await Post.find({ ...Object.fromEntries(Object.entries(filter).filter(([key]) => key !== "status" && key !== "$and")), authorId: userId, status: "pending" })
        .sort({ createdAt: 1 })
        .limit(1)
        .populate("authorId", "username displayName bio avatar createdAt")
        .populate("communityId", "name slug")
        .lean()
    : [];

  const responseDocs = [...posts, ...pendingPosts];
  const myVotes = userId && responseDocs.length
    ? await Vote.find({ postId: { $in: responseDocs.map((post) => post._id) }, userId }).lean()
    : [];
  const voteMap = new Map(myVotes.map((vote) => [String(vote.postId), vote.value]));
  return {
    posts: responseDocs.map((post) => serializePost(post, voteMap.get(String(post._id)) || null)),
    nextCursor: next,
    hasMore,
    limit: safeLimit
  };
}

export function serializePost(post, myVote = null) {
  const author = post.authorId && typeof post.authorId === "object" ? post.authorId : null;
  const community = post.communityId && typeof post.communityId === "object" ? post.communityId : null;
  const media = (post.media || []).map((item) => ({
    assetId: item.assetId ? String(item.assetId) : null,
    url: item.url,
    publicId: item.publicId,
    mediaType: item.mediaType,
    format: item.format,
    bytes: item.bytes,
    width: item.width,
    height: item.height
  }));
  const firstImage = media.find((item) => item.mediaType === "image");
  const upvotesCount = Number(post.upvotesCount || 0);
  const downvotesCount = Number(post.downvotesCount || 0);
  return {
    id: String(post._id),
    author: author ? {
      id: String(author._id),
      mongoId: String(author._id),
      username: author.username,
      displayName: author.displayName || "",
      bio: author.bio || "",
      avatar: author.avatar || { url: "", publicId: "" },
      createdAt: author.createdAt
    } : null,
    communityId: community?.slug || (post.communityId ? String(post.communityId) : "general"),
    community: community ? { id: String(community._id), slug: community.slug, name: community.name } : null,
    content: post.content || "",
    text: post.content || "",
    title: post.title || null,
    category: post.category || "Discussion",
    link: post.link || null,
    media,
    imageUrl: firstImage?.url || null,
    postType: post.postType,
    status: post.status,
    publishedAt: post.publishedAt,
    upvotesCount,
    downvotesCount,
    upvoteCount: upvotesCount,
    downvoteCount: downvotesCount,
    score: upvotesCount - downvotesCount,
    commentCount: post.commentCount || 0,
    myVote: myVote === "up" ? 1 : myVote === "down" ? -1 : 0,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
}

export async function getPostForViewer({ postId, userId = null } = {}) {
  if (!mongoose.isValidObjectId(postId)) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  const post = await Post.findById(postId)
    .populate("authorId", "username displayName bio avatar createdAt")
    .populate("communityId", "name slug");
  if (!post || post.status === "removed") throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  if (post.status === "pending" && String(post.authorId?._id || post.authorId) !== String(userId || "")) {
    throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  }
  const vote = userId ? await Vote.findOne({ postId: post._id, userId }).lean() : null;
  return serializePost(post.toObject(), vote?.value || null);
}

export async function getAuthorPendingPosts({ userId } = {}) {
  const docs = await Post.find({ authorId: userId, status: "pending" })
    .sort({ createdAt: 1 })
    .populate("authorId", "username displayName bio avatar createdAt")
    .populate("communityId", "name slug")
    .lean();
  return docs.map((post) => serializePost(post));
}

export async function castVote({ postId, userId, value } = {}) {
  const normalised = value === 1 || value === "up" ? "up" : value === -1 || value === "down" ? "down" : null;
  if (!normalised) throw httpError(400, "INVALID_VOTE", "Vote value must be 'up' or 'down'.");
  if (!mongoose.isValidObjectId(postId)) throw httpError(404, "POST_NOT_FOUND", "Post not found.");

  const session = await mongoose.startSession();
  let result;
  let promotedPost = null;
  try {
    await session.withTransaction(async () => {
      const post = await Post.findOne({ _id: postId, status: "published" }).session(session);
      if (!post) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
      if (String(post.authorId) === String(userId)) throw httpError(403, "SELF_VOTE_NOT_ALLOWED", "You cannot vote on your own post.");

      const existing = await Vote.findOne({ postId: post._id, userId }).session(session);
      if (existing?.value === normalised) {
        result = { post, changed: false };
        return;
      }

      const increments = { upvotesCount: 0, downvotesCount: 0 };
      if (existing?.value === "up") increments.upvotesCount -= 1;
      if (existing?.value === "down") increments.downvotesCount -= 1;
      if (normalised === "up") increments.upvotesCount += 1;
      if (normalised === "down") increments.downvotesCount += 1;

      if (existing) {
        existing.value = normalised;
        await existing.save({ session });
      } else {
        await Vote.create([{ postId: post._id, userId, value: normalised }], { session });
      }

      await Post.updateOne(
        { _id: post._id },
        {
          $inc: increments,
          $set: { score: post.score + increments.upvotesCount - increments.downvotesCount }
        },
        { session }
      );
      const updatedPost = await Post.findById(post._id).session(session);
      promotedPost = await promotePendingPostIfEligible({ authorId: post.authorId, session });
      result = { post: updatedPost, changed: true };
    });
  } catch (error) {
    if (error?.code === 11000) throw httpError(409, "VOTE_CONFLICT", "Your vote changed at the same time. Please retry.");
    throw error;
  } finally {
    await session.endSession();
  }

  const [postView, promotedView] = await Promise.all([
    getPostForViewer({ postId, userId }),
    promotedPost ? getPostForViewer({ postId: promotedPost._id, userId }) : Promise.resolve(null)
  ]);
  return { post: postView, changed: result?.changed || false, promotedPost: promotedView };
}

export async function removeVote({ postId, userId } = {}) {
  if (!mongoose.isValidObjectId(postId)) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  const session = await mongoose.startSession();
  let promotedPost = null;
  try {
    await session.withTransaction(async () => {
      const post = await Post.findOne({ _id: postId, status: "published" }).session(session);
      if (!post) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
      const vote = await Vote.findOne({ postId: post._id, userId }).session(session);
      if (!vote) return;
      const increments = vote.value === "up" ? { upvotesCount: -1, downvotesCount: 0 } : { upvotesCount: 0, downvotesCount: -1 };
      await vote.deleteOne({ session });
      await Post.updateOne(
        { _id: post._id },
        {
          $inc: increments,
          $set: { score: post.score + increments.upvotesCount - increments.downvotesCount }
        },
        { session }
      );
      promotedPost = await promotePendingPostIfEligible({ authorId: post.authorId, session });
    });
  } finally {
    await session.endSession();
  }
  const [postView, promotedView] = await Promise.all([
    getPostForViewer({ postId, userId }),
    promotedPost ? getPostForViewer({ postId: promotedPost._id, userId }) : Promise.resolve(null)
  ]);
  return { post: postView, promotedPost: promotedView };
}

export async function getVoteSummary({ postId, userId = null } = {}) {
  if (!mongoose.isValidObjectId(postId)) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  const post = await Post.findOne({ _id: postId, status: "published" }).select("upvotesCount downvotesCount score").lean();
  if (!post) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  const myVote = userId ? await Vote.findOne({ postId, userId }).lean() : null;
  return {
    upvotesCount: post.upvotesCount,
    downvotesCount: post.downvotesCount,
    score: post.upvotesCount - post.downvotesCount,
    myVote: myVote?.value || null
  };
}

export async function listComments({ postId, limit = 50 } = {}) {
  if (!mongoose.isValidObjectId(postId)) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  const postExists = await Post.exists({ _id: postId, status: "published" });
  if (!postExists) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  return Comment.find({ postId, deletedAt: null })
    .sort({ createdAt: 1, _id: 1 })
    .limit(Math.min(100, Math.max(1, Number(limit) || 50)))
    .populate("authorId", "username displayName avatar")
    .lean();
}

export async function addComment({ postId, userId, content, parentCommentId = null } = {}) {
  const cleanContent = String(content || "").trim();
  if (!cleanContent) throw httpError(400, "EMPTY_COMMENT", "Comment cannot be empty.");
  if (cleanContent.length > 1000) throw httpError(400, "COMMENT_TOO_LONG", "Comment must be 1,000 characters or fewer.");
  if (!mongoose.isValidObjectId(postId)) throw httpError(404, "POST_NOT_FOUND", "Post not found.");

  const post = await Post.findOne({ _id: postId, status: "published" });
  if (!post) throw httpError(404, "POST_NOT_FOUND", "Post not found.");
  let parent = null;
  if (parentCommentId) {
    if (!mongoose.isValidObjectId(parentCommentId)) throw httpError(400, "INVALID_PARENT_COMMENT", "Parent comment ID is invalid.");
    parent = await Comment.findOne({ _id: parentCommentId, postId, deletedAt: null });
    if (!parent || parent.parentCommentId) throw httpError(400, "INVALID_PARENT_COMMENT", "Replies can only target a top-level comment.");
  }

  const comment = await Comment.create({ postId, authorId: userId, content: cleanContent, parentCommentId: parent?._id || null });
  await Post.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
  return Comment.findById(comment._id).populate("authorId", "username displayName avatar").lean();
}

export async function deleteComment({ commentId, userId, role = "user" } = {}) {
  if (!mongoose.isValidObjectId(commentId)) throw httpError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  const existing = await Comment.findOne({ _id: commentId, deletedAt: null });
  if (!existing) throw httpError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  if (String(existing.authorId) !== String(userId) && !["moderator", "admin"].includes(role)) {
    throw httpError(403, "FORBIDDEN", "You can only delete your own comment.");
  }
  const comment = await Comment.findOneAndUpdate(
    { _id: commentId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true }
  );
  if (!comment) throw httpError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  await Post.updateOne({ _id: comment.postId, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  return { commentId: String(comment._id), postId: String(comment.postId) };
}

export { httpError, derivePostType, mediaSnapshot };
