import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readStore, writeStore, id, now } from "./data/store.js";
import { requireAuth } from "./middleware/auth.js";
import { fail, asyncRoute } from "./utils/http.js";
import { eligibilityFor } from "./services/eligibility.js";

const router = express.Router();
const threshold = Math.max(1, Number.parseInt(process.env.POST_THRESHOLD || "5", 10));

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(here, "../uploads");

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
  username: u.username,
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
    updatedAt: p.updatedAt || null
  };
};

const publicComment = (c, store) => ({
  id: c.id,
  postId: c.postId,
  author: publicUser(store.users.find((u) => u.id === c.authorId) || { id: c.authorId, username: "unknown" }),
  text: c.text,
  createdAt: c.createdAt
});

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      /* viewer token invalid; continue anonymously */
    }
  }
  next();
}

// ----------------- Authentication & Profile Routes -----------------

router.post("/auth/register", asyncRoute(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return fail(res, 400, "INVALID_USERNAME", "Username must be 3–24 characters and use letters, numbers, or underscores.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, 400, "INVALID_EMAIL", "Enter a valid email address.");
  }
  if (password.length < 8) {
    return fail(res, 400, "WEAK_PASSWORD", "Password must contain at least 8 characters.");
  }

  const store = await readStore();
  if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase() || u.email === email)) {
    return fail(res, 409, "ACCOUNT_EXISTS", "That username or email is already registered.");
  }

  const user = {
    id: id(),
    username,
    email,
    bio: "",
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: now()
  };
  store.users.push(user);
  await writeStore(store);

  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({
    token,
    user: { id: user.id, username: user.username, email: user.email, bio: "", createdAt: user.createdAt }
  });
}));

router.post("/auth/login", asyncRoute(async (req, res) => {
  const login = String(req.body.login || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!login || !password) {
    return fail(res, 400, "MISSING_FIELDS", "Username/email and password are required.");
  }

  const store = await readStore();
  const user = store.users.find((u) => u.username.toLowerCase() === login || u.email === login);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return fail(res, 401, "INVALID_CREDENTIALS", "Username/email or password is incorrect.");
  }

  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, bio: user.bio || "", createdAt: user.createdAt }
  });
}));

router.get("/auth/me", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const user = store.users.find((u) => u.id === req.user.id);
  if (!user) return fail(res, 404, "USER_NOT_FOUND", "User not found.");
  res.json({
    user: { id: user.id, username: user.username, email: user.email, bio: user.bio || "", createdAt: user.createdAt }
  });
}));

router.patch("/auth/profile", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const user = store.users.find((u) => u.id === req.user.id);
  if (!user) return fail(res, 404, "USER_NOT_FOUND", "User not found.");

  const username = req.body.username !== undefined ? String(req.body.username).trim() : null;
  const bio = req.body.bio !== undefined ? String(req.body.bio).trim() : null;

  if (username !== null) {
    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return fail(res, 400, "INVALID_USERNAME", "Username must be 3–24 characters and use letters, numbers, or underscores.");
    }
    const conflict = store.users.find(
      (u) => u.id !== user.id && u.username.toLowerCase() === username.toLowerCase()
    );
    if (conflict) {
      return fail(res, 409, "USERNAME_TAKEN", "That username is already taken.");
    }
    user.username = username;
  }

  if (bio !== null) {
    if (bio.length > 250) {
      return fail(res, 400, "BIO_TOO_LONG", "Bio must be 250 characters or fewer.");
    }
    user.bio = bio;
  }

  user.updatedAt = now();
  await writeStore(store);

  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({
    user: { id: user.id, username: user.username, email: user.email, bio: user.bio || "", createdAt: user.createdAt },
    token,
    message: "Profile updated successfully."
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
  let membership = store.memberships.find((m) => m.userId === req.user.id && m.communityId === req.params.id);
  if (!membership) {
    membership = { id: id(), userId: req.user.id, communityId: req.params.id, status: "active", joinedAt: now() };
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
  res.json(eligibilityFor(store, req.user.id, req.params.id, threshold));
}));

// ----------------- Post Routes (CRUD + Sorting) -----------------

router.get("/communities/:id/posts", optionalAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  if (!store.communities.some((c) => c.id === req.params.id)) {
    return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  }

  const sortBy = String(req.query.sort || "latest").toLowerCase();
  const communityPosts = store.posts.filter((p) => p.communityId === req.params.id && p.status === "active");

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
    posts: communityPosts.map((p) => publicPost(p, store, req.user?.id || null)),
    sortBy
  });
}));

router.get("/posts/:id", optionalAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const post = store.posts.find((p) => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");
  res.json({ post: publicPost(post, store, req.user?.id || null) });
}));

router.post("/communities/:id/posts", requireAuth, upload.single("image"), asyncRoute(async (req, res) => {
  const store = await readStore();
  const community = store.communities.find((c) => c.id === req.params.id);
  if (!community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");

  const membership = store.memberships.find(
    (m) => m.userId === req.user.id && m.communityId === community.id && m.status === "active"
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

  const eligibility = eligibilityFor(store, req.user.id, community.id, threshold);
  if (!eligibility.canPost) {
    return fail(res, 422, "POSTING_LOCKED", "Your latest post has not reached the required score.", eligibility);
  }

  const post = {
    id: id(),
    authorId: req.user.id,
    communityId: community.id,
    title: title || null,
    category,
    link: link || null,
    text,
    imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
    upvoteCount: 0,
    downvoteCount: 0,
    status: "active",
    createdAt: now()
  };

  store.posts.push(post);
  await writeStore(store);

  res.status(201).json({ post: publicPost(post, store, req.user.id) });
}));

// Update a post (PATCH /api/posts/:id)
router.patch("/posts/:id", requireAuth, upload.single("image"), asyncRoute(async (req, res) => {
  const store = await readStore();
  const post = store.posts.find((p) => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");

  // Verify ownership
  if (post.authorId !== req.user.id) {
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
    post: publicPost(post, store, req.user.id),
    message: "Post updated successfully."
  });
}));

// Delete a post (DELETE /api/posts/:id)
router.delete("/posts/:id", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const postIndex = store.posts.findIndex((p) => p.id === req.params.id && p.status === "active");
  if (postIndex === -1) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");

  const post = store.posts[postIndex];

  // Verify ownership
  if (post.authorId !== req.user.id) {
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
  if (post.authorId === req.user.id) {
    return fail(res, 403, "SELF_VOTE", "You cannot vote on your own post.");
  }

  let vote = store.votes.find((v) => v.postId === post.id && v.userId === req.user.id);
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
        userId: req.user.id,
        value,
        createdAt: now(),
        updatedAt: now()
      });
    }
    await writeStore(store);
  }

  res.json({ post: publicPost(post, store, req.user.id), eligibilityChanged: true });
}));

router.delete("/posts/:id/vote", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const post = store.posts.find((p) => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");

  const index = store.votes.findIndex((v) => v.postId === post.id && v.userId === req.user.id);
  if (index >= 0) {
    const [vote] = store.votes.splice(index, 1);
    if (vote.value === 1) post.upvoteCount = Math.max(0, (post.upvoteCount || 0) - 1);
    if (vote.value === -1) post.downvoteCount = Math.max(0, (post.downvoteCount || 0) - 1);
    await writeStore(store);
  }

  res.json({ post: publicPost(post, store, req.user.id), eligibilityChanged: true });
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
    authorId: req.user.id,
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
  if (comment.authorId !== req.user.id) {
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
  console.error(err);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong.");
});

export default router;
