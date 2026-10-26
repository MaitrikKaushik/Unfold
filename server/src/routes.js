import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "node:path";
import { readStore, writeStore, id, now } from "./data/store.js";
import { requireAuth } from "./middleware/auth.js";
import { fail, asyncRoute } from "./utils/http.js";
import { eligibilityFor } from "./services/eligibility.js";

const router = express.Router();
const threshold = Math.max(1, Number.parseInt(process.env.POST_THRESHOLD || "5", 10));
const upload = multer({
  dest: path.resolve("uploads"),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Only JPG, PNG, WEBP, and GIF images are allowed."), allowed.includes(file.mimetype));
  }
});

const publicUser = u => ({ id: u.id, username: u.username, createdAt: u.createdAt });
const publicPost = (p, store, viewerId) => ({
  id: p.id, communityId: p.communityId, author: publicUser(store.users.find(u => u.id === p.authorId) || { id: p.authorId, username: "unknown" }),
  text: p.text, imageUrl: p.imageUrl || null, upvoteCount: p.upvoteCount, downvoteCount: p.downvoteCount,
  score: p.upvoteCount - p.downvoteCount, myVote: store.votes.find(v => v.postId === p.id && v.userId === viewerId)?.value || 0,
  createdAt: p.createdAt
});

router.post("/auth/register", asyncRoute(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_]+$/.test(username))
    return fail(res, 400, "INVALID_USERNAME", "Username must be 3–24 characters and use letters, numbers, or underscores.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "INVALID_EMAIL", "Enter a valid email.");
  if (password.length < 8) return fail(res, 400, "WEAK_PASSWORD", "Password must contain at least 8 characters.");

  const store = await readStore();
  if (store.users.some(u => u.username.toLowerCase() === username.toLowerCase() || u.email === email))
    return fail(res, 409, "ACCOUNT_EXISTS", "That username or email is already registered.");

  const user = { id: id(), username, email, passwordHash: await bcrypt.hash(password, 10), createdAt: now() };
  store.users.push(user);
  await writeStore(store);
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ token, user: publicUser(user) });
}));

router.post("/auth/login", asyncRoute(async (req, res) => {
  const login = String(req.body.login || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const store = await readStore();
  const user = store.users.find(u => u.username.toLowerCase() === login || u.email === login);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return fail(res, 401, "INVALID_CREDENTIALS", "Username/email or password is incorrect.");
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: publicUser(user) });
}));

router.get("/auth/me", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const user = store.users.find(u => u.id === req.user.id);
  if (!user) return fail(res, 404, "USER_NOT_FOUND", "User not found.");
  res.json({ user: publicUser(user) });
}));

router.get("/communities", asyncRoute(async (_req, res) => {
  const store = await readStore();
  res.json({ communities: store.communities });
}));

router.post("/communities/:id/join", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  if (!store.communities.some(c => c.id === req.params.id)) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  let membership = store.memberships.find(m => m.userId === req.user.id && m.communityId === req.params.id);
  if (!membership) {
    membership = { id: id(), userId: req.user.id, communityId: req.params.id, status: "active", joinedAt: now() };
    store.memberships.push(membership);
    await writeStore(store);
  }
  res.json({ membership, message: "You are a member of this community." });
}));

router.get("/communities/:id/eligibility", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  if (!store.communities.some(c => c.id === req.params.id)) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  res.json(eligibilityFor(store, req.user.id, req.params.id, threshold));
}));

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* public feed remains available */ }
  }
  next();
}

router.get("/communities/:id/posts", optionalAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  if (!store.communities.some(c => c.id === req.params.id)) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  const posts = store.posts.filter(p => p.communityId === req.params.id && p.status === "active").sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ posts: posts.map(p => publicPost(p, store, req.user?.id || null)) });
}));

router.post("/communities/:id/posts", requireAuth, upload.single("image"), asyncRoute(async (req, res) => {
  const store = await readStore();
  const community = store.communities.find(c => c.id === req.params.id);
  if (!community) return fail(res, 404, "COMMUNITY_NOT_FOUND", "Community not found.");
  const membership = store.memberships.find(m => m.userId === req.user.id && m.communityId === community.id && m.status === "active");
  if (!membership) return fail(res, 403, "JOIN_REQUIRED", "Join this community before posting.");
  const text = String(req.body.text || "").trim();
  if (!text && !req.file) return fail(res, 400, "EMPTY_POST", "Add text or an image.");
  if (text.length > 2000) return fail(res, 400, "POST_TOO_LONG", "Post text must be 2,000 characters or fewer.");

  const eligibility = eligibilityFor(store, req.user.id, community.id, threshold);
  if (!eligibility.canPost) return fail(res, 422, "POSTING_LOCKED", "Your latest post has not reached the required score.", eligibility);

  const post = {
    id: id(), authorId: req.user.id, communityId: community.id, text,
    imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
    upvoteCount: 0, downvoteCount: 0, status: "active", createdAt: now()
  };
  store.posts.push(post);
  await writeStore(store);
  res.status(201).json({ post: publicPost(post, store, req.user.id) });
}));

router.put("/posts/:id/vote", requireAuth, asyncRoute(async (req, res) => {
  const value = Number(req.body.value);
  if (![1, -1].includes(value)) return fail(res, 400, "INVALID_VOTE", "Vote value must be 1 or -1.");
  const store = await readStore();
  const post = store.posts.find(p => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");
  if (post.authorId === req.user.id) return fail(res, 403, "SELF_VOTE", "You cannot vote on your own post.");

  let vote = store.votes.find(v => v.postId === post.id && v.userId === req.user.id);
  const previous = vote?.value || 0;
  if (previous !== value) {
    if (previous === 1) post.upvoteCount--;
    if (previous === -1) post.downvoteCount--;
    if (value === 1) post.upvoteCount++;
    if (value === -1) post.downvoteCount++;
    if (vote) { vote.value = value; vote.updatedAt = now(); }
    else store.votes.push({ id: id(), postId: post.id, userId: req.user.id, value, createdAt: now(), updatedAt: now() });
    await writeStore(store);
  }
  res.json({ post: publicPost(post, store, req.user.id), eligibilityChanged: true });
}));

router.delete("/posts/:id/vote", requireAuth, asyncRoute(async (req, res) => {
  const store = await readStore();
  const post = store.posts.find(p => p.id === req.params.id && p.status === "active");
  if (!post) return fail(res, 404, "POST_NOT_FOUND", "Post not found.");
  const index = store.votes.findIndex(v => v.postId === post.id && v.userId === req.user.id);
  if (index >= 0) {
    const [vote] = store.votes.splice(index, 1);
    if (vote.value === 1) post.upvoteCount--;
    if (vote.value === -1) post.downvoteCount--;
    await writeStore(store);
  }
  res.json({ post: publicPost(post, store, req.user.id), eligibilityChanged: true });
}));

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return fail(res, 400, "UPLOAD_ERROR", err.message);
  if (err.message?.startsWith("Only JPG")) return fail(res, 400, "INVALID_IMAGE_TYPE", err.message);
  console.error(err);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong.");
});

export default router;
