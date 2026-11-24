import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import path from "node:path";
import Community from "../../models/Community.js";
import MediaAsset from "../../models/MediaAsset.js";
import Post from "../../models/Post.js";
import { requireAuth, optionalAuth } from "../../middleware/auth.js";
import { asyncRoute, fail } from "../../utils/http.js";
import { uploadBufferToCloudinary, deleteCloudinaryAsset } from "../../services/cloudinary-media.js";
import {
  addComment,
  castVote,
  createPost,
  deleteComment,
  getAuthorPendingPosts,
  getPostForViewer,
  getVoteSummary,
  listComments,
  listPosts,
  removePost,
  removeVote,
  updatePost
} from "./post.service.js";
import {
  GENERAL_COMMUNITY,
  getMembership,
  joinCommunity,
  leaveCommunity,
  resolveCommunity,
  serializeCommunity
} from "../../services/community.service.js";
import { getPostingEligibility } from "../../services/reputation.service.js";

const router = express.Router();
const MAX_MEDIA_FILES = Math.max(1, Math.min(5, Number(process.env.MAX_MEDIA_FILES || 5)));
const MAX_MEDIA_SIZE = Math.max(1, Number(process.env.MAX_MEDIA_SIZE_MB || 25)) * 1024 * 1024;

const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_SIZE, files: MAX_MEDIA_FILES },
  fileFilter: (_req, file, callback) => {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error("Supported media: JPG, PNG, WEBP, GIF, MP3, WAV, M4A, OGG and audio WEBM.");
      error.status = 415;
      error.code = "UNSUPPORTED_MEDIA_TYPE";
      return callback(error);
    }
    return callback(null, true);
  }
});

const uploadFields = upload.fields([
  { name: "files", maxCount: MAX_MEDIA_FILES },
  { name: "image", maxCount: 1 }
]);

function getUploadedFiles(req) {
  return [ ...(req.files?.files || []), ...(req.files?.image || []) ];
}

function mediaTypeFor(file) {
  if (file.mimetype.startsWith("audio/")) return "audio";
  if (file.mimetype.startsWith("video/")) return "video";
  return "image";
}

async function saveCloudMedia(file, ownerId) {
  const mediaType = mediaTypeFor(file);
  const resourceType = mediaType === "image" ? "image" : "video";
  const uploaded = await uploadBufferToCloudinary(file.buffer, {
    folder: `unfold/${mediaType}s/${ownerId}`,
    resourceType
  });
  try {
    return await MediaAsset.create({
      ownerId,
      url: uploaded.url,
      publicId: uploaded.publicId,
      mediaType,
      resourceType,
      format: uploaded.format || path.extname(file.originalname).slice(1).toLowerCase(),
      bytes: uploaded.bytes || file.size,
      width: uploaded.width,
      height: uploaded.height,
      status: "uploaded"
    });
  } catch (error) {
    await deleteCloudinaryAsset(uploaded.publicId, resourceType).catch(() => {});
    throw error;
  }
}

async function uploadFiles(files, ownerId) {
  const assets = [];
  try {
    for (const file of files) assets.push(await saveCloudMedia(file, ownerId));
    return assets;
  } catch (error) {
    await Promise.allSettled(assets.map(async (asset) => {
      await deleteCloudinaryAsset(asset.publicId, asset.resourceType);
      await MediaAsset.updateOne({ _id: asset._id }, { $set: { status: "deleted" } });
    }));
    throw error;
  }
}

function assetResponse(asset) {
  return {
    assetId: String(asset._id),
    url: asset.url,
    mediaType: asset.mediaType,
    format: asset.format,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height
  };
}

function resolvePostBody(body = {}) {
  let mediaAssetIds = body.mediaAssetIds || [];
  if (typeof mediaAssetIds === "string") {
    try { mediaAssetIds = JSON.parse(mediaAssetIds); } catch { mediaAssetIds = [mediaAssetIds]; }
  }
  if (!Array.isArray(mediaAssetIds)) mediaAssetIds = [];
  return {
    content: body.content !== undefined ? body.content : body.text,
    title: body.title,
    category: body.category || "Discussion",
    link: body.link,
    mediaAssetIds
  };
}

function commentResponse(comment) {
  const author = comment.authorId && typeof comment.authorId === "object" ? comment.authorId : null;
  return {
    id: String(comment._id),
    postId: String(comment.postId),
    content: comment.content,
    text: comment.content,
    parentCommentId: comment.parentCommentId ? String(comment.parentCommentId) : null,
    author: author ? {
      id: String(author._id),
      mongoId: String(author._id),
      username: author.username,
      displayName: author.displayName || "",
      avatar: author.avatar || { url: "", publicId: "" }
    } : null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  };
}

async function createPostWithFiles({ req, communityId }) {
  const assets = await uploadFiles(getUploadedFiles(req), req.user.id);
  try {
    const body = resolvePostBody(req.body);
    const result = await createPost({
      userId: req.user.id,
      communityId,
      ...body,
      mediaAssetIds: [...(Array.isArray(body.mediaAssetIds) ? body.mediaAssetIds : []), ...assets.map((asset) => String(asset._id))]
    });
    return result;
  } catch (error) {
    await Promise.allSettled(assets.map(async (asset) => {
      await deleteCloudinaryAsset(asset.publicId, asset.resourceType);
      await MediaAsset.updateOne({ _id: asset._id }, { $set: { status: "deleted" } });
    }));
    throw error;
  }
}

// General appears alongside public communities as a virtual destination.
router.get("/communities", asyncRoute(async (_req, res) => {
  const communities = await Community.find({ visibility: "public" })
    .sort({ isSystem: -1, memberCount: -1, name: 1 })
    .lean();
  res.json({ communities: [GENERAL_COMMUNITY, ...communities.map(serializeCommunity)] });
}));

router.post("/communities/:communityId/join", requireAuth, asyncRoute(async (req, res) => {
  const community = await resolveCommunity(req.params.communityId);
  if (!community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  const membership = await joinCommunity({ userId: req.user.id, communityId: community._id });
  res.status(200).json({ success: true, message: `You joined ${community.name}.`, membership: {
    id: String(membership._id), communityId: String(membership.communityId), userId: String(membership.userId), role: membership.role, status: membership.status
  } });
}));

router.delete("/communities/:communityId/leave", requireAuth, asyncRoute(async (req, res) => {
  const community = await resolveCommunity(req.params.communityId);
  if (!community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  const membership = await leaveCommunity({ userId: req.user.id, communityId: community._id });
  if (!membership) return fail(res, 409, "CANNOT_LEAVE_COMMUNITY", "You are not an active member or you own this community.");
  res.json({ success: true, message: `You left ${community.name}.` });
}));

router.get("/communities/:communityId/eligibility", requireAuth, asyncRoute(async (req, res) => {
  const community = await resolveCommunity(req.params.communityId);
  if (req.params.communityId !== "general" && !community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  const eligibility = await getPostingEligibility({ userId: req.user.id, communityId: community?._id || null });
  const membership = await getMembership({ userId: req.user.id, communityId: community?._id || null });
  const currentGatePost = eligibility.currentGatePost ? {
    ...eligibility.currentGatePost,
    upvoteCount: eligibility.currentGatePost.upvoteCount,
    downvoteCount: eligibility.currentGatePost.downvoteCount
  } : null;
  res.json({ ...eligibility, currentGatePost, isMember: membership.isMember, community: serializeCommunity(community) });
}));

router.get("/communities/:communityId/posts", optionalAuth, asyncRoute(async (req, res) => {
  const isGeneral = req.params.communityId === "general";
  const community = isGeneral ? null : await resolveCommunity(req.params.communityId);
  if (!isGeneral && !community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  const result = await listPosts({
    communityId: community?._id ?? null,
    scope: isGeneral ? "general" : "community",
    sort: String(req.query.sort || "latest").toLowerCase(),
    cursor: req.query.cursor || null,
    limit: req.query.limit,
    userId: req.user?.id || null
  });
  res.json({ ...result, posts: result.posts });
}));

router.post("/communities/:communityId/posts", requireAuth, uploadFields, asyncRoute(async (req, res) => {
  const isGeneral = req.params.communityId === "general";
  const community = isGeneral ? null : await resolveCommunity(req.params.communityId);
  if (!isGeneral && !community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  const result = await createPostWithFiles({ req, communityId: community?._id || null });
  const status = result.post.status === "pending" ? 202 : 201;
  return res.status(status).json({
    success: true,
    message: result.post.status === "pending"
      ? "Your post is saved privately. It will publish when your latest published post receives two upvotes."
      : "Post published successfully.",
    post: await getPostForViewer({ postId: result.post._id, userId: req.user.id }),
    eligibility: result.eligibility
  });
}));

router.post("/media/upload", requireAuth, uploadFields, asyncRoute(async (req, res) => {
  const files = getUploadedFiles(req);
  if (!files.length) return fail(res, 400, "NO_MEDIA_FILES", "Select at least one media file to upload.");
  const assets = await uploadFiles(files, req.user.id);
  res.status(201).json({ success: true, data: assets.map(assetResponse), assets: assets.map(assetResponse) });
}));

router.delete("/media/:assetId", requireAuth, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.assetId)) return fail(res, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
  const asset = await MediaAsset.findOne({ _id: req.params.assetId, ownerId: req.user.id });
  if (!asset || asset.status === "deleted") return fail(res, 404, "MEDIA_ASSET_NOT_FOUND", "Media asset not found.");
  if (asset.status === "attached") return fail(res, 409, "MEDIA_ALREADY_ATTACHED", "Media attached to a post cannot be deleted through this endpoint.");
  await deleteCloudinaryAsset(asset.publicId, asset.resourceType);
  asset.status = "deleted";
  await asset.save();
  res.json({ success: true, message: "Media asset deleted." });
}));

router.post("/posts", requireAuth, asyncRoute(async (req, res) => {
  let communityId = null;
  if (req.body?.communityId && req.body.communityId !== "general") {
    const community = await resolveCommunity(req.body.communityId);
    if (!community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
    communityId = community._id;
  }
  const body = resolvePostBody(req.body);
  const result = await createPost({ userId: req.user.id, communityId, ...body });
  const post = await getPostForViewer({ postId: result.post._id, userId: req.user.id });
  return res.status(result.post.status === "pending" ? 202 : 201).json({
    success: true,
    message: result.post.status === "pending" ? "Your post is pending two upvotes on your latest published post." : "Post published successfully.",
    data: { post, eligibility: result.eligibility },
    post,
    eligibility: result.eligibility
  });
}));

router.get("/feed", optionalAuth, asyncRoute(async (req, res) => {
  const scope = String(req.query.scope || "general").toLowerCase();
  const result = await listPosts({
    scope,
    communityId: null,
    sort: String(req.query.sort || "latest").toLowerCase(),
    cursor: req.query.cursor || null,
    limit: req.query.limit,
    userId: req.user?.id || null
  });
  res.json({ success: true, ...result });
}));

router.get("/users/me/posts", requireAuth, asyncRoute(async (req, res) => {
  const status = String(req.query.status || "pending");
  if (status !== "pending") return fail(res, 400, "UNSUPPORTED_POST_STATUS", "Only pending posts can be requested through this endpoint.");
  const posts = await getAuthorPendingPosts({ userId: req.user.id });
  res.json({ success: true, posts });
}));

router.get("/posts/:postId", optionalAuth, asyncRoute(async (req, res) => {
  const post = await getPostForViewer({ postId: req.params.postId, userId: req.user?.id || null });
  res.json({ success: true, post });
}));

router.patch("/posts/:postId", requireAuth, uploadFields, asyncRoute(async (req, res) => {
  const files = getUploadedFiles(req);
  const assets = await uploadFiles(files, req.user.id);
  try {
    const updates = {
      content: req.body.content !== undefined ? req.body.content : req.body.text,
      title: req.body.title,
      category: req.body.category,
      link: req.body.link,
      removeImage: String(req.body.removeImage || "").toLowerCase() === "true"
    };
    const post = await updatePost({
      postId: req.params.postId,
      userId: req.user.id,
      updates,
      mediaAssetIds: assets.map((asset) => String(asset._id))
    });
    const view = await getPostForViewer({ postId: post._id, userId: req.user.id });
    res.json({ success: true, message: "Post updated successfully.", post: view });
  } catch (error) {
    await Promise.allSettled(assets.map(async (asset) => {
      await deleteCloudinaryAsset(asset.publicId, asset.resourceType);
      await MediaAsset.updateOne({ _id: asset._id }, { $set: { status: "deleted" } });
    }));
    throw error;
  }
}));

router.delete("/posts/:postId", requireAuth, asyncRoute(async (req, res) => {
  const post = await removePost({ postId: req.params.postId, userId: req.user.id, role: req.user.role });
  res.json({ success: true, message: "Post removed successfully.", postId: String(post._id) });
}));

router.put("/posts/:postId/vote", requireAuth, asyncRoute(async (req, res) => {
  const result = await castVote({ postId: req.params.postId, userId: req.user.id, value: req.body?.value });
  res.json({ success: true, post: result.post, promotedPost: result.promotedPost, changed: result.changed });
}));

router.delete("/posts/:postId/vote", requireAuth, asyncRoute(async (req, res) => {
  const result = await removeVote({ postId: req.params.postId, userId: req.user.id });
  res.json({ success: true, post: result.post, promotedPost: result.promotedPost });
}));

router.get("/posts/:postId/votes", optionalAuth, asyncRoute(async (req, res) => {
  const votes = await getVoteSummary({ postId: req.params.postId, userId: req.user?.id || null });
  res.json({ success: true, ...votes });
}));

router.get("/posts/:postId/comments", optionalAuth, asyncRoute(async (req, res) => {
  const comments = await listComments({ postId: req.params.postId, limit: req.query.limit });
  res.json({ success: true, comments: comments.map(commentResponse) });
}));

router.post("/posts/:postId/comments", requireAuth, asyncRoute(async (req, res) => {
  const comment = await addComment({
    postId: req.params.postId,
    userId: req.user.id,
    content: req.body?.content ?? req.body?.text,
    parentCommentId: req.body?.parentCommentId || null
  });
  const count = await Post.findById(req.params.postId).select("commentCount").lean();
  res.status(201).json({ success: true, message: "Comment added.", comment: commentResponse(comment), commentCount: count?.commentCount || 0 });
}));

router.delete("/comments/:commentId", requireAuth, asyncRoute(async (req, res) => {
  const result = await deleteComment({ commentId: req.params.commentId, userId: req.user.id, role: req.user.role });
  const post = await Post.findById(result.postId).select("commentCount").lean();
  res.json({ success: true, message: "Comment deleted.", commentId: result.commentId, commentCount: post?.commentCount || 0 });
}));

export default router;
