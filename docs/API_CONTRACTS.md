# Unfold API Contracts — Foundation v2.2

Base URL: `http://localhost:4000/api/v1`

The shared backend is one Express modular monolith. MongoDB is the source of truth for users and social content. PostgreSQL is the source of truth for moderation reports and moderation audit records. Browser requests use the `unfold_session` HttpOnly cookie and must send `credentials: "include"`.

## Shared response conventions

Successful responses use `success: true` and include the relevant resource in `data`, or a documented top-level compatibility property for the existing UI. Errors use:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation"
  }
}
```

Common status codes: `200` success, `201` created, `202` accepted/queued, `400` invalid input, `401` unauthenticated, `403` forbidden, `404` missing resource, `409` business-rule conflict, `415` unsupported media type, `503` optional service not configured.

## Authentication — MongoDB

### POST `/auth/register`

Public. The server generates the username. The client must not submit a username.

Request:

```json
{ "displayName": "Optional name", "password": "minimum-eight-characters" }
```

Success `201`: returns the safe user profile in `data.user` and `user`, and sets the `unfold_session` HttpOnly cookie. The generated username is the login identity.

### POST `/auth/login`

Public.

Request:

```json
{ "username": "unfold_a1b2c3d4e5f6", "password": "minimum-eight-characters" }
```

Success `200`: returns the safe user profile and sets the session cookie.

### POST `/auth/logout`

Authenticated. Increments the user's `tokenVersion` and clears the session cookie.

### GET `/auth/me`

Authenticated. Returns the current safe user profile.

### PATCH `/auth/profile`

Authenticated.

Request:

```json
{ "displayName": "Updated name", "bio": "Up to 250 characters" }
```

## Communities and membership — MongoDB

### GET `/communities`

Public. Returns the virtual General destination followed by seeded/public communities. General has `id: "general"` and does not require membership.

### POST `/communities/:communityId/join`

Authenticated. `communityId` may be a MongoDB ID or community slug. Creates/reactivates the user's membership.

### DELETE `/communities/:communityId/leave`

Authenticated. Users cannot leave a community they own.

### GET `/communities/:communityId/eligibility`

Authenticated. Returns the global two-upvote gate plus the current destination membership state. For General, `isMember` is always true.

Example response:

```json
{
  "canPost": false,
  "reason": "UPVOTE_THRESHOLD_NOT_REACHED",
  "threshold": 2,
  "pendingPostExists": false,
  "currentGatePost": {
    "postId": "...",
    "upvoteCount": 1,
    "downvoteCount": 4,
    "score": -3
  },
  "isMember": true,
  "community": { "id": "general", "slug": "general", "name": "General" }
}
```

`NOT_A_MEMBER` is returned for an unjoined community. `PENDING_POST_EXISTS` is returned when the user already has a queued post.

### GET `/communities/:communityId/posts?sort=latest|top&limit=20&cursor=...`

Optional authentication. Use `communityId=general` for the General feed. Community feeds return only that community's published posts. The authenticated author's pending post may appear only in their own first-page response.

### POST `/communities/:communityId/posts`

Authenticated. Multipart form-data compatibility endpoint used by the current React composer. Supported fields: `title`, `category`, `link`, `text`; upload fields: `image` (one image) and/or `files` (media files). Supported media types in this MVP: JPEG, PNG, WEBP, GIF, MP3, WAV, M4A, OGG and audio WEBM.

Success `201` means published. Success `202` means stored as a private pending post awaiting the two-upvote gate. Both responses include `post` and `eligibility`.

### Community creation

Community creation, ownership controls, invitations and advanced discovery are assigned to the community/social module and are not part of this current content foundation endpoint set. Do not invent or depend on an endpoint until that module publishes its contract.

## Posts, feeds and media — MongoDB + Cloudinary

### POST `/posts`

Authenticated. Canonical JSON post creation endpoint.

```json
{
  "communityId": "general",
  "content": "A thought worth sharing",
  "title": "Optional title",
  "category": "Discussion",
  "link": null,
  "mediaAssetIds": []
}
```

For a community post, `communityId` may be its ID or slug and the user must be an active member. Do not supply Cloudinary URLs or public IDs directly; attach only media asset IDs uploaded by the authenticated user. Returns `201` for published or `202` for pending.

### POST `/media/upload`

Authenticated multipart form-data. Use field `files` for up to the configured file limit. Returns Cloudinary asset metadata and an `assetId` for each upload.

### DELETE `/media/:assetId`

Authenticated. Deletes an unattached media asset owned by the caller. An attached asset cannot be deleted independently.

### GET `/feed?scope=general&sort=latest|top&limit=20&cursor=...`

Optional authentication. `scope=general` is the default. `scope=following` is deliberately unavailable until Person 3 integrates Follow relationships.

### GET `/posts/:postId`

Optional authentication. Pending posts are only visible to their author. Removed posts are not returned.

### PATCH `/posts/:postId`

Authenticated. Owner-only edit of a published post. Supports JSON or multipart updates; current UI supports replacing/removing an image and updating text/title/category/link.

### DELETE `/posts/:postId`

Authenticated. Owner or moderator/admin. Soft-removes the post. The latest published post cannot be removed before it receives two upvotes, preventing an author from bypassing the gate by deleting the gating post.

### GET `/users/me/posts?status=pending`

Authenticated. Returns the current user's pending post queue (maximum one).

## Voting — MongoDB

### PUT `/posts/:postId/vote`

Authenticated. Creates or changes the user's single vote on a published post.

Request:

```json
{ "value": "up" }
```

Allowed values: `up` or `down`. The existing UI's numeric values `1` and `-1` are accepted for compatibility. Self-voting is rejected. Repeating the same vote is an idempotent no-op. Switching votes updates both counters and score.

### DELETE `/posts/:postId/vote`

Authenticated. Removes the caller's vote if present.

### GET `/posts/:postId/votes`

Optional authentication. Returns `upvotesCount`, `downvotesCount`, `score` and the current viewer's `myVote`.

## Comments — MongoDB

### GET `/posts/:postId/comments?limit=50`

Optional authentication. Returns comments for a published post.

### POST `/posts/:postId/comments`

Authenticated.

```json
{ "content": "Useful point", "parentCommentId": null }
```

The legacy UI field `{ "text": "..." }` is also accepted. One-level replies are supported by `parentCommentId`.

### DELETE `/comments/:commentId`

Authenticated. Comment owner or moderator/admin. Soft-deletes the comment.

## Moderation — PostgreSQL

These routes require `DATABASE_URL` and an authenticated moderator/admin where indicated.

### POST `/reports`

Authenticated. Allowed `targetType`: `post`, `comment`, `user`. Allowed `reason`: `spam`, `harassment`, `hate`, `misinformation`, `impersonation`, `other`.

```json
{ "targetType": "post", "targetId": "post-id", "reason": "spam", "details": "Optional details" }
```

### GET `/admin/reports?status=open&limit=20&before=100`

Moderator/admin only. Returns `data.reports` and `data.nextCursor`.

### PATCH `/admin/reports/:id`

Moderator/admin only.

```json
{ "status": "reviewing", "notes": "Checked report details" }
```

Allowed update statuses: `reviewing`, `resolved`, `dismissed`. Each successful update is written to `moderation_actions` in the same PostgreSQL transaction.

## Final posting rule — global invariant

1. A user's first post is published immediately.
2. Every later post is eligible for publication when the user's latest published post has at least **2 distinct upvotes**.
3. Downvotes affect visible net score only; they do not cancel or reduce the two-upvote requirement.
4. The rule is global across General and all communities.
5. Publishing in a community additionally requires active membership there.
6. If the gate is not met, one pending post may be stored. A second pending post is rejected.
7. Pending posts are private to their author and automatically publish when the gate post receives its second upvote.
8. Published posts stay published if their votes later change. A removed publication remains in the user's publication history and therefore does not reset the gate.

`score = upvotesCount - downvotesCount`.

## Integration status and boundaries

- Implemented foundation: authentication, MongoDB content models, General/community feed routes, membership join/leave, posts, media metadata, votes, comments, global reputation gate and Cloudinary upload wiring.
- Person 3 integration: community creation/ownership, Follow relationships and following feed, conversations/messages, Socket.IO and notifications.
- Remaining shared integration: full PostgreSQL moderation workflow/UI, Redis cache usage/invalidation and production deployment configuration.
- Manual Postman testing is not part of the current agreed workflow. These contracts are the shared integration specification; do not claim live database round-trips were tested as part of this package.
