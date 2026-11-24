import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readStore, writeStore, id, now } from "./data/store.js";
import { requireAuth, optionalAuth } from "./middleware/auth.js";
import { fail, asyncRoute } from "./utils/http.js";
import { eligibilityFor, promotePendingPostIfEligible } from "./services/eligibility.js";
import logger from "./config/logger.js";

const router = express.Router();
const UPVOTE_THRESHOLD = 2;
const legacyUserId = (user) => user?.legacyId || user?.id || null;

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(here, "../uploads");

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Only JPG, PNG, WEBP, and GIF images are allowed."), allowed.includes(file.mimetype));
  }
});

const ALLOWED_CATEGORIES = ["Discussion", "Question", "Resource"];

const publicUser = (u) => ({
  id: u.id,
  // mongoId lets migrated accounts match their legacy-authored content
  // without exposing password data or changing historical content IDs.
  ...(u.mongoId ? { mongoId: u.mongoId } : {}),
  username: u.username,
  displayName: u.displayName || "",
  bio: u.bio || "",
  createdAt: u.createdAt
});

const publicPost = (p, store, viewerId) => {
  const commentsForPost = (store.comments || []).filter((c) => c.postId === p.id);
  const upvotes = p.upvoteCount || 0;
  const downvotes = p.downvoteCount || 0;
  return {
    id: p.id,
    communityId: p.communityId,
    author: publicUser(store.users.find((u) => u.id === p.authorId) || { id: p.authorId, username: "unknown" }),
    title: p.title || null,
    category: p.category || "Discussion",
    link: p.link || null,
    text: p.text || "",
    imageUrl: p.imageUrl || null,
    upvoteCount: upvotes,
    downvoteCount: downvotes,
    score: upvotes - downvotes,
    commentCount: commentsForPost.length,
    myVote: (store.votes || []).find((v) => v.postId === p.id && v.userId === viewerId)?.value || 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt || null,
    status: p.status || "active"
  };
};

const publicComment = (c, store) => ({
  id: c.id,
  postId: c.postId,
  author: publicUser(store.users.find((u) => u.id === c.authorId) || { id: c.authorId, username: "unknown" }),
  text: c.text,
  createdAt: c.createdAt
});


// ----------------- Data Persistence & Backup Routes -----------------

// Status of data persistence and storage mode
router.get("/data/status", asyncRoute(async (_req, res) => {
  const store = await readStore();
  res.json({
    storageType: process.env.DATA_DIR ? "persistent-disk" : "local-json",
    isPersistent: Boolean(process.env.DATA_DIR),
    stats: {
      users: store.users.length,
      communities: store.communities.length,
      posts: store.posts.length,
      comments: (store.comments || []).length,
      votes: (store.votes || []).length
    }
  });
}));

// Download JSON backup file of current database
router.get("/data/export", requireAuth, asyncRoute(async (_req, res) => {
  const store = await readStore();
  const dateStr = now().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="unfold-backup-${dateStr}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.json(store);
}));

// Restore database from uploaded JSON backup
router.post("/data/restore", requireAuth, asyncRoute(async (req, res) => {
  const incoming = req.body?.data || req.body;
  if (!incoming || typeof incoming !== "object") {
    return fail(res, 400, "INVALID_BACKUP", "Invalid backup format. Expected a JSON object with store data.");
  }

  if (!Array.isArray(incoming.users) || !Array.isArray(incoming.posts)) {
    return fail(res, 400, "INVALID_BACKUP_SCHEMA", "Backup must contain valid users and posts arrays.");
  }

  const restored = {
    users: incoming.users,
    communities: Array.isArray(incoming.communities) && incoming.communities.length > 0
      ? incoming.communities
      : [
          { id: "technology", name: "Technology", description: "Technology, products, and ideas." },
          { id: "programming", name: "Programming", description: "Code, tools, and software engineering." },
          { id: "gaming", name: "Gaming", description: "Games, studios, and gaming culture." }
        ],
    memberships: Array.isArray(incoming.memberships) ? incoming.memberships : [],
    posts: incoming.posts,
    votes: Array.isArray(incoming.votes) ? incoming.votes : [],
    comments: Array.isArray(incoming.comments) ? incoming.comments : []
  };

  await writeStore(restored);

  res.json({
    success: true,
    message: "Database restored successfully.",
    stats: {
      users: restored.users.length,
      communities: restored.communities.length,
      posts: restored.posts.length,
      comments: restored.comments.length,
      votes: restored.votes.length
    }
  });
}));

// ----------------- Community Routes -----------------

router.get("/communities", asyncRoute(async (_req, res) => {
  const store = await readStore();
  res.json({ communities: store.communities });
}));

router.post("/communities/:id/join", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  if (!store.communities.some((c) => c.id === req.params.id)) {
    return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  }
  let membership = store.memberships.find((m) => m.userId === legacyUserId(req.user) && m.communityId === req.params.id);
  if (!membership) {
    membership = { id: id(), userId: legacyUserId(req.user), communityId: req.params.id, status: "active", joinedAt: now() };
    store.memberships.push(membership);
    await writeStore(store);
  }
  res.json({ membership, message: "You are a member of this community." });
}));

router.get("/communities/:id/eligibility", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  if (!store.communities.some((c) => c.id === req.params.id)) {
    return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  }
  res.json(eligibilityFor(store, legacyUserId(req.user), req.params.id, UPVOTE_THRESHOLD));
}));

// ----------------- Post Routes (CRUD + Sorting) -----------------

router.get("/communities/:id/posts", optionalAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  if (!store.communities.some((c) => c.id === req.params.id)) {
    return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  }

  const sortBy = String(req.query.sort || "latest").toLowerCase();
  const viewerId = legacyUserId(req.user);
  const communityPosts = store.posts.filter((p) =>
    p.communityId === req.params.id && (p.status === "active" || (p.status === "pending" && p.authorId === viewerId))
  );

  if (sortBy === "top") {
    communityPosts.sort((a, b) => {
      const scoreA = (a.upvoteCount || 0) - (a.downvoteCount || 0);
      const scoreB = (b.upvoteCount || 0) - (b.downvoteCount || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.createdAt.localeCompare(a.createdAt);
    });
  } else {
    // Default: latest
    communityPosts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  res.json({
    posts: communityPosts.map((p) => publicPost(p, store, viewerId)),
    sortBy
  });
}));

router.get("/posts/:id", optionalAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const viewerId = legacyUserId(req.user);
  const post = store.posts.find((p) => p.id === req.params.id && (p.status === "active" || (p.status === "pending" && p.authorId === viewerId)));
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");
  res.json({ post: publicPost(post, store, viewerId) });
}));

router.post("/communities/:id/posts", requireAuth, upload.single("image"), asyncRoute(async (req, res) => {
  const store = await readStore();
  const community = store.communities.find((c) => c.id === req.params.id);
  if (!community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");

  const membership = store.memberships.find(
    (m) => m.userId === legacyUserId(req.user) && m.communityId === community.id && m.status === "active"
  );
  if (!membership) return fail(res, 403, "JOIN_REQUIRED", "Join this community before posting.");

  const title = String(req.body.title || "").trim();
  const text = String(req.body.text || "").trim();
  let category = String(req.body.category || "Discussion").trim();
  if (!ALLOWED_CATEGORIES.includes(category)) {
    category = "Discussion";
  }

  let link = String(req.body.link || "").trim();
  if (link) {
    if (link.length > 500) {
      return fail(res, 400, "LINK_TOO_LONG", "Resource URL must be 500 characters or fewer.");
    }
    if (!/^https?:\/\//i.test(link)) {
      link = `https://${link}`;
    }
  }

  if (title.length > 150) {
    return fail(res, 400, "TITLE_TOO_LONG", "Post title must be 150 characters or fewer.");
  }
  if (text.length > 2000) {
    return fail(res, 400, "POST_TOO_LONG", "Post text must be 2,000 characters or fewer.");
  }
  if (!text && !title && !req.file) {
    return fail(res, 400, "EMPTY_POST", "Please provide a title, text, or an image.");
  }

  const pendingExists = store.posts.some((item) => item.authorId === legacyUserId(req.user) && item.status === "pending");
  if (pendingExists) {
    return fail(res, 409, "PENDING_POST_EXISTS", "You already have a post waiting for two upvotes on your latest published post.");
  }

  const eligibility = eligibilityFor(store, legacyUserId(req.user), community.id, UPVOTE_THRESHOLD);
  const post = {
    id: id(),
    authorId: legacyUserId(req.user),
    communityId: community.id,
    title: title || null,
    category,
    link: link || null,
    text,
    imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
    upvoteCount: 0,
    downvoteCount: 0,
    status: eligibility.canPost ? "active" : "pending",
    createdAt: now(),
    publishedAt: eligibility.canPost ? now() : null
  };

  store.posts.push(post);
  await writeStore(store);

  if (!eligibility.canPost) {
    return res.status(202).json({
      success: true,
      message: "Your post is saved privately. It will be published after your latest published post receives two upvotes.",
      post: publicPost(post, store, legacyUserId(req.user)),
      eligibility
    });
  }

  return res.status(201).json({ success: true, message: "Post published successfully.", post: publicPost(post, store, legacyUserId(req.user)) });
}));

// Update a post (PATCH /api/posts/:id)
router.patch("/posts/:id", requireAuth, upload.single("image"), asyncRoute(async (req, res) => {
  const store = await readStore();
  const post = store.posts.find((p) => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");

  // Verify ownership
  if (post.authorId !== legacyUserId(req.user)) {
    return fail(res, 403, "FORBIDDEN", "You can only edit your own posts.");
  }

  const title = req.body.title !== undefined ? String(req.body.title).trim() : post.title;
  const text = req.body.text !== undefined ? String(req.body.text).trim() : post.text;
  let category = req.body.category !== undefined ? String(req.body.category).trim() : post.category;
  if (!ALLOWED_CATEGORIES.includes(category)) {
    category = "Discussion";
  }

  let link = req.body.link !== undefined ? String(req.body.link).trim() : (post.link || "");
  if (link) {
    if (link.length > 500) {
      return fail(res, 400, "LINK_TOO_LONG", "Resource URL must be 500 characters or fewer.");
    }
    if (!/^https?:\/\//i.test(link)) {
      link = `https://${link}`;
    }
  } else {
    link = null;
  }

  if (title && title.length > 150) {
    return fail(res, 400, "TITLE_TOO_LONG", "Post title must be 150 characters or fewer.");
  }
  if (text && text.length > 2000) {
    return fail(res, 400, "POST_TOO_LONG", "Post text must be 2,000 characters or fewer.");
  }

  const removeImage = String(req.body.removeImage || "").toLowerCase() === "true";
  const oldImageUrl = post.imageUrl;

  if (req.file) {
    post.imageUrl = `/uploads/${req.file.filename}`;
  } else if (removeImage) {
    post.imageUrl = null;
  }

  // Safely clean up old image if replaced or removed, checking if any other post references it
  if (oldImageUrl && (req.file || removeImage)) {
    const isShared = store.posts.some((p) => p.id !== post.id && p.imageUrl === oldImageUrl);
    if (!isShared && oldImageUrl.startsWith("/uploads/")) {
      const filename = path.basename(oldImageUrl);
      fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {});
    }
  }

  if (!text && !title && !post.imageUrl) {
    return fail(res, 400, "EMPTY_POST", "Post must have a title, text, or an image.");
  }

  post.title = title || null;
  post.text = text || "";
  post.category = category;
  post.link = category === "Resource" || link ? link : null;
  post.updatedAt = now();

  await writeStore(store);

  res.json({
    post: publicPost(post, store, legacyUserId(req.user)),
    message: "Post updated successfully."
  });
}));

// Delete a post (DELETE /api/posts/:id)
router.delete("/posts/:id", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const postIndex = store.posts.findIndex((p) => p.id === req.params.id && ["active", "pending"].includes(p.status));
  if (postIndex === -1) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");

  const post = store.posts[postIndex];

  // Verify ownership
  if (post.authorId !== legacyUserId(req.user)) {
    return fail(res, 403, "FORBIDDEN", "You can only delete your own posts.");
  }

  // Safely delete image if not referenced by another post
  if (post.imageUrl && post.imageUrl.startsWith("/uploads/")) {
    const isShared = store.posts.some((p) => p.id !== post.id && p.imageUrl === post.imageUrl);
    if (!isShared) {
      const filename = path.basename(post.imageUrl);
      fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {});
    }
  }

  // Remove associated comments and votes
  store.comments = (store.comments || []).filter((c) => c.postId !== post.id);
  store.votes = (store.votes || []).filter((v) => v.postId !== post.id);

  // Remove post from store
  store.posts.splice(postIndex, 1);
  await writeStore(store);

  res.json({
    message: "Post deleted successfully.",
    postId: req.params.id
  });
}));

// ----------------- Voting Routes -----------------

router.put("/posts/:id/vote", requireAuth, asyncRoute(async (req, res) => {
  const value = Number(req.body.value);
  if (![1, -1].includes(value)) {
    return fail(res, 400, "INVALID_VOTE", "Vote value must be 1 (upvote) or -1 (downvote).");
  }

  const store = await readStore();
  const post = store.posts.find((p) => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");
  if (post.authorId === legacyUserId(req.user)) {
    return fail(res, 403, "SELF_VOTE", "You cannot vote on your own post.");
  }

  let vote = store.votes.find((v) => v.postId === post.id && v.userId === legacyUserId(req.user));
  const previous = vote?.value || 0;

  if (previous !== value) {
    if (previous === 1) post.upvoteCount = Math.max(0, (post.upvoteCount || 0) - 1);
    if (previous === -1) post.downvoteCount = Math.max(0, (post.downvoteCount || 0) - 1);
    if (value === 1) post.upvoteCount = (post.upvoteCount || 0) + 1;
    if (value === -1) post.downvoteCount = (post.downvoteCount || 0) + 1;

    if (vote) {
      vote.value = value;
      vote.updatedAt = now();
    } else {
      store.votes.push({
        id: id(),
        postId: post.id,
        userId: legacyUserId(req.user),
        value,
        createdAt: now(),
        updatedAt: now()
      });
    }
  }

  const promotedPost = promotePendingPostIfEligible(store, post.authorId, now());
  await writeStore(store);

  res.json({
    success: true,
    post: publicPost(post, store, legacyUserId(req.user)),
    eligibilityChanged: true,
    promotedPost: promotedPost ? publicPost(promotedPost, store, legacyUserId(req.user)) : null
  });
}));

router.delete("/posts/:id/vote", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const post = store.posts.find((p) => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");

  const index = store.votes.findIndex((v) => v.postId === post.id && v.userId === legacyUserId(req.user));
  if (index >= 0) {
    const [vote] = store.votes.splice(index, 1);
    if (vote.value === 1) post.upvoteCount = Math.max(0, (post.upvoteCount || 0) - 1);
    if (vote.value === -1) post.downvoteCount = Math.max(0, (post.downvoteCount || 0) - 1);
  }

  const promotedPost = promotePendingPostIfEligible(store, post.authorId, now());
  await writeStore(store);

  res.json({
    success: true,
    post: publicPost(post, store, legacyUserId(req.user)),
    eligibilityChanged: true,
    promotedPost: promotedPost ? publicPost(promotedPost, store, legacyUserId(req.user)) : null
  });
}));

// ----------------- Comment Routes -----------------

router.get("/posts/:id/comments", optionalAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const post = store.posts.find((p) => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");

  const comments = (store.comments || [])
    .filter((c) => c.postId === post.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  res.json({
    comments: comments.map((c) => publicComment(c, store))
  });
}));

router.post("/posts/:id/comments", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const post = store.posts.find((p) => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");

  const text = String(req.body.text || "").trim();
  if (!text) {
    return fail(res, 400, "EMPTY_COMMENT", "Comment cannot be empty.");
  }
  if (text.length > 1000) {
    return fail(res, 400, "COMMENT_TOO_LONG", "Comment must be 1,000 characters or fewer.");
  }

  const comment = {
    id: id(),
    postId: post.id,
    authorId: legacyUserId(req.user),
    text,
    createdAt: now()
  };

  store.comments = store.comments || [];
  store.comments.push(comment);
  await writeStore(store);

  res.status(201).json({
    comment: publicComment(comment, store),
    commentCount: store.comments.filter((c) => c.postId === post.id).length
  });
}));

router.delete("/comments/:id", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  store.comments = store.comments || [];
  const comment = store.comments.find((c) => c.id === req.params.id);
  if (!comment) {
    return fail(res, 404, "COMMENT_NOT_FOUND", "Comment not found.");
  }

  // Security: only the author of the comment may delete it
  if (comment.authorId !== legacyUserId(req.user)) {
    return fail(res, 403, "FORBIDDEN", "You can only delete your own comments.");
  }

  const postId = comment.postId;
  store.comments = store.comments.filter((c) => c.id !== req.params.id);
  await writeStore(store);

  res.json({
    message: "Comment deleted successfully.",
    commentId: req.params.id,
    commentCount: store.comments.filter((c) => c.postId === postId).length
  });
}));

// ----------------- Error Handling -----------------

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return fail(res, 400, "UPLOAD_ERROR", err.message);
  }
  if (err.message?.startsWith("Only JPG")) {
    return fail(res, 400, "INVALID_IMAGE_TYPE", err.message);
  }
  const status = Number(err?.status) || 500;
  logger.error("Legacy content route failed", { message: err?.message, stack: err?.stack, status });
  return fail(res, status, err?.code || "INTERNAL_ERROR", status >= 500 ? "Something went wrong." : err.message);
});

export default router;
