import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import express from "express";
import cors from "cors";

const here = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(here, "src/data/files/store.json");
const backupPath = path.join(here, "src/data/files/store.backup.json");

process.env.PORT = "4000";
process.env.JWT_SECRET = "test_secret_for_unfold_api_running_locally_123456";
process.env.POST_THRESHOLD = "5";

const { default: routes } = await import("./src/routes.js");

const app = express();
app.use(cors());
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "Unfold" }));
app.use("/api", routes);

function makeRequest(method, url, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? (typeof body === "string" ? body : JSON.stringify(body)) : "";
    const req = new Readable({
      read() {
        if (bodyStr) this.push(bodyStr);
        this.push(null);
      }
    });

    req.method = method.toUpperCase();
    req.url = url;
    req.headers = {};
    for (const [k, v] of Object.entries(headers)) {
      req.headers[k.toLowerCase()] = v;
    }

    if (bodyStr) {
      req.headers["content-length"] = String(Buffer.byteLength(bodyStr));
      if (!req.headers["content-type"]) {
        req.headers["content-type"] = "application/json";
      }
    }

    const res = new EventEmitter();
    res.statusCode = 200;
    res._headers = {};
    res.setHeader = (k, v) => { res._headers[k.toLowerCase()] = v; };
    res.getHeader = (k) => res._headers[k.toLowerCase()];
    res.removeHeader = (k) => { delete res._headers[k.toLowerCase()]; };
    res.writeHead = (code, hdrs) => {
      res.statusCode = code;
      if (hdrs) Object.assign(res._headers, hdrs);
    };

    let resBody = "";
    res.write = (chunk) => {
      resBody += chunk ? chunk.toString() : "";
      return true;
    };

    res.end = (chunk) => {
      if (chunk) resBody += chunk.toString();
      resolve({
        status: res.statusCode,
        headers: res._headers,
        text: () => Promise.resolve(resBody),
        json: () => Promise.resolve(JSON.parse(resBody || "{}"))
      });
    };

    app.handle(req, res, (err) => {
      if (err) reject(err);
      else {
        resolve({
          status: res.statusCode || 404,
          headers: res._headers,
          text: () => Promise.resolve(resBody),
          json: () => Promise.resolve(JSON.parse(resBody || "{}"))
        });
      }
    });
  });
}

async function runTests() {
  console.log("=== Starting Unfold Test Suite ===");

  // Backup existing store
  let existingStore = null;
  try {
    existingStore = await fs.readFile(storePath, "utf8");
    await fs.writeFile(backupPath, existingStore, "utf8");
    console.log("✓ Backed up existing store.json");
  } catch (err) {
    console.log("Notice: No existing store.json to back up.");
  }

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      testsFailed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // ---------------- Test 1: Health Check ----------------
    console.log("\n--- Test 1: Health Check ---");
    const healthRes = await makeRequest("GET", "/api/health");
    const healthData = await healthRes.json();
    assert(healthRes.status === 200, "Health check returns 200");
    assert(healthData.app === "Unfold", "Health check reports app name 'Unfold'");

    // ---------------- Test 2: User Registration & Validation ----------------
    console.log("\n--- Test 2: User Registration & Validation ---");
    // Invalid username (too short)
    const badUserRes = await makeRequest("POST", "/api/auth/register", {
      body: { username: "ab", email: "ab@test.com", password: "password123" }
    });
    assert(badUserRes.status === 400, "Rejects username shorter than 3 chars with 400");

    // Invalid email
    const badEmailRes = await makeRequest("POST", "/api/auth/register", {
      body: { username: "valid_user", email: "invalid-email", password: "password123" }
    });
    assert(badEmailRes.status === 400, "Rejects invalid email format with 400");

    // Weak password
    const badPassRes = await makeRequest("POST", "/api/auth/register", {
      body: { username: "valid_user", email: "valid@test.com", password: "123" }
    });
    assert(badPassRes.status === 400, "Rejects password shorter than 8 chars with 400");

    // Successful registration: Author user
    const timestamp = Date.now();
    const authorUsername = `alice_${timestamp}`;
    const authorEmail = `alice_${timestamp}@test.com`;
    const regRes = await makeRequest("POST", "/api/auth/register", {
      body: { username: authorUsername, email: authorEmail, password: "password123" }
    });
    const regData = await regRes.json();
    assert(regRes.status === 201, "Registers user with 201 Created");
    assert(!!regData.token, "Returns JWT token upon registration");
    assert(regData.user.username === authorUsername, "Returns created user profile");
    const authorToken = regData.token;
    const authorId = regData.user.id;

    // Duplicate registration rejected
    const dupRes = await makeRequest("POST", "/api/auth/register", {
      body: { username: authorUsername, email: authorEmail, password: "password123" }
    });
    assert(dupRes.status === 409, "Rejects duplicate registration with 409 Conflict");

    // ---------------- Test 3: Login & Authentication ----------------
    console.log("\n--- Test 3: Login & Authentication ---");
    const badLoginRes = await makeRequest("POST", "/api/auth/login", {
      body: { login: authorUsername, password: "wrongpassword" }
    });
    assert(badLoginRes.status === 401, "Rejects incorrect password with 401 Unauthorized");

    const goodLoginRes = await makeRequest("POST", "/api/auth/login", {
      body: { login: authorEmail, password: "password123" }
    });
    const goodLoginData = await goodLoginRes.json();
    assert(goodLoginRes.status === 200, "Allows login with email and valid password");
    assert(!!goodLoginData.token, "Login returns JWT token");

    // Verify /auth/me
    const meRes = await makeRequest("GET", "/api/auth/me", {
      headers: { Authorization: `Bearer ${authorToken}` }
    });
    const meData = await meRes.json();
    assert(meRes.status === 200, "GET /auth/me returns 200 with valid token");
    assert(meData.user.id === authorId, "GET /auth/me returns correct user ID");

    // ---------------- Test 4: Communities & Joining ----------------
    console.log("\n--- Test 4: Communities & Joining ---");
    const commsRes = await makeRequest("GET", "/api/communities");
    const commsData = await commsRes.json();
    assert(commsRes.status === 200, "GET /communities returns 200");
    assert(commsData.communities.length >= 3, "Contains seeded communities (Technology, Programming, Gaming)");

    // Pre-join eligibility check -> canPost: false, reason: "NOT_A_MEMBER"
    const preJoinEligRes = await makeRequest("GET", "/api/communities/programming/eligibility", {
      headers: { Authorization: `Bearer ${authorToken}` }
    });
    const preJoinElig = await preJoinEligRes.json();
    assert(preJoinElig.canPost === false, "Cannot post before joining community");
    assert(preJoinElig.reason === "NOT_A_MEMBER", "Eligibility reason is NOT_A_MEMBER");

    // Join community
    const joinRes = await makeRequest("POST", "/api/communities/programming/join", {
      headers: { Authorization: `Bearer ${authorToken}` }
    });
    assert(joinRes.status === 200, "POST /communities/:id/join returns 200");

    // Post-join eligibility check -> canPost: true, reason: "FIRST_POST"
    const postJoinEligRes = await makeRequest("GET", "/api/communities/programming/eligibility", {
      headers: { Authorization: `Bearer ${authorToken}` }
    });
    const postJoinElig = await postJoinEligRes.json();
    assert(postJoinElig.canPost === true, "Can create first post after joining");
    assert(postJoinElig.reason === "FIRST_POST", "Reason is FIRST_POST");

    // ---------------- Test 5: Feature A - Post Creation with Categories & Links ----------------
    console.log("\n--- Test 5: Feature A - Post Categories & Links ---");
    // Create a Resource post with title, link, and content
    const createResourceRes = await makeRequest("POST", "/api/communities/programming/posts", {
      headers: { Authorization: `Bearer ${authorToken}` },
      body: {
        title: "Top Backend Libraries",
        category: "Resource",
        link: "expressjs.com",
        text: "Here is the official documentation for Express.js framework."
      }
    });
    const resourcePostData = await createResourceRes.json();
    assert(createResourceRes.status === 201, "Creates post with 201 Created");
    assert(resourcePostData.post.title === "Top Backend Libraries", "Saves post title");
    assert(resourcePostData.post.category === "Resource", "Saves category as Resource");
    assert(resourcePostData.post.link === "https://expressjs.com", "Automatically formats URL to https://");
    assert(resourcePostData.post.commentCount === 0, "Initial commentCount is 0");
    const gatePostId = resourcePostData.post.id;

    // ---------------- Test 6: +5 Posting Rule Enforcement ----------------
    console.log("\n--- Test 6: +5 Net Score Posting Gate Rule ---");
    // Alice tries to post again immediately in programming community
    const secondPostAttemptRes = await makeRequest("POST", "/api/communities/programming/posts", {
      headers: { Authorization: `Bearer ${authorToken}` },
      body: {
        title: "Second Post Attempt",
        category: "Discussion",
        text: "Should be blocked because latest post has score 0 < 5"
      }
    });
    const secondPostAttempt = await secondPostAttemptRes.json();
    assert(secondPostAttemptRes.status === 422, "Second post blocked with 422 Unprocessable Entity");
    assert(secondPostAttempt.error.code === "POSTING_LOCKED", "Error code is POSTING_LOCKED");

    // Alice cannot vote on her own post
    const selfVoteRes = await makeRequest("PUT", `/api/posts/${gatePostId}/vote`, {
      headers: { Authorization: `Bearer ${authorToken}` },
      body: { value: 1 }
    });
    assert(selfVoteRes.status === 403, "Prevents self-voting with 403 Forbidden");

    // Create 5 voter accounts to upvote Alice's post to reach +5
    console.log("  Registering 5 test voters to upvote the post...");
    const voterTokens = [];
    for (let i = 1; i <= 5; i++) {
      const vName = `voter_${i}_${timestamp}`;
      const vReg = await makeRequest("POST", "/api/auth/register", {
        body: { username: vName, email: `${vName}@test.com`, password: "password123" }
      });
      const vData = await vReg.json();
      voterTokens.push(vData.token);

      // Cast upvote
      const voteRes = await makeRequest("PUT", `/api/posts/${gatePostId}/vote`, {
        headers: { Authorization: `Bearer ${vData.token}` },
        body: { value: 1 }
      });
      assert(voteRes.status === 200, `Voter ${i} upvote accepted`);
    }

    // Verify post score is now 5
    const checkPostRes = await makeRequest("GET", `/api/posts/${gatePostId}`);
    const checkPostData = await checkPostRes.json();
    assert(checkPostData.post.score === 5, "Gate post net score is now +5");

    // Check Alice's eligibility in programming community
    const unlockedEligRes = await makeRequest("GET", "/api/communities/programming/eligibility", {
      headers: { Authorization: `Bearer ${authorToken}` }
    });
    const unlockedElig = await unlockedEligRes.json();
    assert(unlockedElig.canPost === true, "Alice is now eligible to post again (+5 threshold reached)");
    assert(unlockedElig.reason === "THRESHOLD_REACHED", "Eligibility reason is THRESHOLD_REACHED");

    // Alice publishes her second post successfully!
    const secondPostSuccessRes = await makeRequest("POST", "/api/communities/programming/posts", {
      headers: { Authorization: `Bearer ${authorToken}` },
      body: {
        title: "Express Middleware Insights",
        category: "Discussion",
        text: "Here are tips for writing robust Express error handlers."
      }
    });
    const secondPostData = await secondPostSuccessRes.json();
    assert(secondPostSuccessRes.status === 201, "Alice successfully published second post after earning +5 score!");
    const secondPostId = secondPostData.post.id;

    // ---------------- Test 7: Feature B - Comments ----------------
    console.log("\n--- Test 7: Feature B - Comments (Add, View, Delete own, Ownership Security) ---");
    // Add comment by voter 1
    const commentRes = await makeRequest("POST", `/api/posts/${gatePostId}/comments`, {
      headers: { Authorization: `Bearer ${voterTokens[0]}` },
      body: { text: "Great resource! Very helpful for beginners." }
    });
    const commentData = await commentRes.json();
    assert(commentRes.status === 201, "Creates comment with 201 Created");
    assert(commentData.comment.text === "Great resource! Very helpful for beginners.", "Saves comment text");
    assert(commentData.commentCount === 1, "Returns updated commentCount = 1");
    const commentId = commentData.comment.id;

    // Add empty comment -> rejected with 400
    const emptyCommentRes = await makeRequest("POST", `/api/posts/${gatePostId}/comments`, {
      headers: { Authorization: `Bearer ${voterTokens[0]}` },
      body: { text: "   " }
    });
    assert(emptyCommentRes.status === 400, "Rejects empty comment with 400 Bad Request");

    // View comments for post
    const getCommentsRes = await makeRequest("GET", `/api/posts/${gatePostId}/comments`);
    const getCommentsData = await getCommentsRes.json();
    assert(getCommentsRes.status === 200, "GET /posts/:id/comments returns 200");
    assert(getCommentsData.comments.length === 1, "Returns 1 comment");
    assert(getCommentsData.comments[0].id === commentId, "Comment ID matches");

    // Security check: Voter 2 attempts to delete Voter 1's comment -> 403 Forbidden!
    const unauthorizedDeleteRes = await makeRequest("DELETE", `/api/comments/${commentId}`, {
      headers: { Authorization: `Bearer ${voterTokens[1]}` }
    });
    assert(unauthorizedDeleteRes.status === 403, "Rejects deletion of other user's comment with 403 Forbidden");

    // Voter 1 deletes their own comment -> 200 OK
    const authorizedDeleteRes = await makeRequest("DELETE", `/api/comments/${commentId}`, {
      headers: { Authorization: `Bearer ${voterTokens[0]}` }
    });
    const authDeleteData = await authorizedDeleteRes.json();
    assert(authorizedDeleteRes.status === 200, "Allows author to delete their own comment");
    assert(authDeleteData.commentCount === 0, "Updated commentCount is now 0");

    // Add a fresh comment so we verify persistence
    const persistentCommentRes = await makeRequest("POST", `/api/posts/${gatePostId}/comments`, {
      headers: { Authorization: `Bearer ${authorToken}` },
      body: { text: "Thanks for reading, everyone!" }
    });
    assert(persistentCommentRes.status === 201, "Author added persistent comment");

    // ---------------- Test 8: Feature C - Feed Sorting ----------------
    console.log("\n--- Test 8: Feature C - Feed Sorting (Latest & Top) ---");
    // Latest: second post was created after gate post, so second post comes first.
    const latestFeedRes = await makeRequest("GET", "/api/communities/programming/posts?sort=latest");
    const latestFeed = await latestFeedRes.json();
    assert(latestFeedRes.status === 200, "GET /communities/:id/posts?sort=latest returns 200");
    assert(latestFeed.posts[0].id === secondPostId, "Latest sort places newest post first");

    // Top: gate post has score 5, second post has score 0, so gate post comes first!
    const topFeedRes = await makeRequest("GET", "/api/communities/programming/posts?sort=top");
    const topFeed = await topFeedRes.json();
    assert(topFeedRes.status === 200, "GET /communities/:id/posts?sort=top returns 200");
    assert(topFeed.posts[0].id === gatePostId, "Top sort places highest scored post (+5) first");
    assert(topFeed.posts[0].score >= topFeed.posts[1].score, "Posts ordered descending by net vote score");

    // ---------------- Test 9: Edit Post (PATCH /api/posts/:id) ----------------
    console.log("\n--- Test 9: Edit Post (PATCH /api/posts/:id) ---");
    // Voter 1 attempts to edit Alice's post -> 403 Forbidden
    const unauthEditRes = await makeRequest("PATCH", `/api/posts/${secondPostId}`, {
      headers: { Authorization: `Bearer ${voterTokens[0]}` },
      body: { title: "Hacked Title", text: "Hacked Content" }
    });
    assert(unauthEditRes.status === 403, "Prevents other users from editing post with 403 Forbidden");

    // Alice edits her own post
    const authEditRes = await makeRequest("PATCH", `/api/posts/${secondPostId}`, {
      headers: { Authorization: `Bearer ${authorToken}` },
      body: {
        title: "Express Middleware Insights (Updated)",
        text: "Updated text with additional architectural best practices.",
        category: "Question"
      }
    });
    const editData = await authEditRes.json();
    assert(authEditRes.status === 200, "Author successfully edits post with 200 OK");
    assert(editData.post.title === "Express Middleware Insights (Updated)", "Updated title persists");
    assert(editData.post.category === "Question", "Updated category persists");
    assert(editData.post.author.id === authorId, "Author identity preserved");

    // ---------------- Test 10: Delete Post (DELETE /api/posts/:id) ----------------
    console.log("\n--- Test 10: Delete Post (DELETE /api/posts/:id) ---");
    // Voter 1 attempts to delete Alice's post -> 403 Forbidden
    const unauthPostDeleteRes = await makeRequest("DELETE", `/api/posts/${secondPostId}`, {
      headers: { Authorization: `Bearer ${voterTokens[0]}` }
    });
    assert(unauthPostDeleteRes.status === 403, "Prevents other users from deleting post with 403 Forbidden");

    // Alice deletes her own post
    const authPostDeleteRes = await makeRequest("DELETE", `/api/posts/${secondPostId}`, {
      headers: { Authorization: `Bearer ${authorToken}` }
    });
    assert(authPostDeleteRes.status === 200, "Author successfully deletes post with 200 OK");

    // Verify post is no longer returned
    const getDeletedPostRes = await makeRequest("GET", `/api/posts/${secondPostId}`);
    assert(getDeletedPostRes.status === 404, "Deleted post returns 404 Not Found");

    // ---------------- Test 11: Settings & Profile Update (PATCH /api/auth/profile) ----------------
    console.log("\n--- Test 11: Settings & Profile Update ---");
    // Alice updates her username and bio
    const newUsername = `alice_dev_${timestamp}`;
    const updateProfileRes = await makeRequest("PATCH", "/api/auth/profile", {
      headers: { Authorization: `Bearer ${authorToken}` },
      body: {
        username: newUsername,
        bio: "Full stack student developer building on Node.js and Express."
      }
    });
    const updateProfileData = await updateProfileRes.json();
    assert(updateProfileRes.status === 200, "Updates profile with 200 OK");
    assert(updateProfileData.user.username === newUsername, "Username updated");
    assert(updateProfileData.user.bio.includes("Full stack student developer"), "Bio updated");

    // Duplicate username conflict check: voter tries to take Alice's new username -> 409 Conflict
    const conflictProfileRes = await makeRequest("PATCH", "/api/auth/profile", {
      headers: { Authorization: `Bearer ${voterTokens[0]}` },
      body: { username: newUsername }
    });
    assert(conflictProfileRes.status === 409, "Rejects duplicate username with 409 Conflict");

    // GET /auth/me returns updated profile information
    const updatedMeRes = await makeRequest("GET", "/api/auth/me", {
      headers: { Authorization: `Bearer ${updateProfileData.token}` }
    });
    const updatedMeData = await updatedMeRes.json();
    assert(updatedMeData.user.username === newUsername, "GET /auth/me reflects updated username");
    assert(updatedMeData.user.bio.includes("Full stack student developer"), "GET /auth/me reflects updated bio");
    assert(updatedMeData.user.email === authorEmail, "GET /auth/me includes registered email");

    // ---------------- Test 12: Persistence Verification ----------------
    console.log("\n--- Test 12: Persistence Verification ---");
    const rawDiskData = JSON.parse(await fs.readFile(storePath, "utf8"));
    assert(rawDiskData.posts.some((p) => p.id === gatePostId), "Gate post persisted in store.json");
    assert(!rawDiskData.posts.some((p) => p.id === secondPostId), "Deleted post is removed from store.json");
    assert(rawDiskData.comments.some((c) => c.postId === gatePostId), "Comment persisted in store.json");
    assert(rawDiskData.votes.some((v) => v.postId === gatePostId), "Votes persisted in store.json");

    // ---------------- Test 13: Data Persistence, Export & Restore ----------------
    console.log("\n--- Test 13: Data Persistence, Export & Restore ---");
    const statusRes = await makeRequest("GET", "/api/data/status");
    const statusData = await statusRes.json();
    assert(statusRes.status === 200, "GET /api/data/status returns 200 OK");
    assert(statusData.stats.users >= 6, "Data status accurately reports user count");
    assert(statusData.stats.posts >= 1, "Data status accurately reports post count");

    // Export database backup
    const exportRes = await makeRequest("GET", "/api/data/export", {
      headers: { Authorization: `Bearer ${authorToken}` }
    });
    assert(exportRes.status === 200, "GET /api/data/export returns 200 OK");
    const exportData = await exportRes.json();
    assert(Array.isArray(exportData.users), "Backup contains users array");
    assert(Array.isArray(exportData.posts), "Backup contains posts array");

    // Restore database from backup
    const restoreRes = await makeRequest("POST", "/api/data/restore", {
      headers: { Authorization: `Bearer ${authorToken}` },
      body: { data: exportData }
    });
    const restoreData = await restoreRes.json();
    assert(restoreRes.status === 200, "POST /api/data/restore returns 200 OK");
    assert(restoreData.success === true, "Restore returns success: true");
    assert(restoreData.stats.posts >= 1, "Restored database retains posts count");

    console.log("\n==========================================");
    console.log(`ALL TESTS PASSED! (${testsPassed} assertions passed, 0 failures)`);
    console.log("==========================================");
  } finally {
    // Restore original store if backup existed
    if (existingStore) {
      await fs.writeFile(storePath, existingStore, "utf8");
      await fs.unlink(backupPath).catch(() => {});
      console.log("✓ Restored original store.json after test run");
    }
  }
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
