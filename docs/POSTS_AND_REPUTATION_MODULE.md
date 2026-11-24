# Unfold — Posts, Media and Reputation Module

Version: 2.2.0-posts-foundation  
API prefix: `/api/v1`

## Ownership

This module owns MongoDB persistence for posts, votes, comments, media-asset metadata and the read/write APIs for general and community feeds. It uses the shared `User` model and authentication middleware. The `Community` and `Membership` models here are integration foundations; Person 3 can extend community creation, discovery, moderation and membership management without changing the Post contract.

## Data model

- `Post`: author, optional community, content, title/category/link compatibility fields, media snapshots, post type, status, publication timestamp, vote counters, score and comment count.
- `Vote`: one current vote per user and post. Unique compound index `{ postId, userId }`.
- `Comment`: post, author, content, optional one-level parent reply and soft-delete timestamp.
- `MediaAsset`: Cloudinary metadata, owner, media type, attachment status and linked post.
- `Community`: name, slug, description, cover metadata and member count.
- `Membership`: community/user relationship, role and active/left state.

General posts use `communityId: null`. Community posts reference a MongoDB Community ObjectId. The General destination is returned by `GET /communities` as a virtual item with `id: "general"`.

## Publishing eligibility — final rule

1. A user's first post is published immediately.
2. Every later post is published only when the user's latest published post has at least two distinct upvotes.
3. Downvotes affect the displayed score only. They do not reduce or cancel the required two upvotes.
4. The rule is global across General and all communities.
5. Community posts additionally require active membership in that community.
6. If the condition is not met, one post may be stored with `status: "pending"`; a second pending post is rejected.
7. A pending post is visible only to its author and is automatically published when the latest published post reaches two upvotes.
8. A published post stays published if its votes later change. Its vote count then controls eligibility for the next post. Removing a post does not erase its publication history; the latest removed publication remains the reputation gate. A user's current gate post cannot be removed before it receives two upvotes, preventing deletion from resetting or permanently bypassing eligibility.

`score = upvotesCount - downvotesCount`.

## Media upload

`POST /media/upload` — authenticated, multipart form-data, field `files`.

The backend uses Multer memory storage and uploads files server-side to Cloudinary. It returns `assetId`, `url`, `mediaType`, `format`, `bytes`, `width` and `height`. A post can attach only uploaded assets owned by the authenticated user. Arbitrary client-provided URLs/public IDs are not trusted.

MVP file types: JPEG, PNG, WebP, GIF, MP3, WAV, M4A, OGG and audio WEBM. Configure `MAX_MEDIA_FILES` and `MAX_MEDIA_SIZE_MB` in `server/.env`.

The current web composer supports text, image and audio attachments. Video is intentionally deferred.

## Endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/communities` | Public | General plus public communities |
| POST | `/communities/:communityId/join` | Auth | Join a community |
| DELETE | `/communities/:communityId/leave` | Auth | Leave a community |
| GET | `/communities/:communityId/eligibility` | Auth | Check global post eligibility and membership |
| GET | `/communities/:communityId/posts` | Optional auth | Community or General feed |
| POST | `/communities/:communityId/posts` | Auth | Compatibility composer endpoint; accepts image/audio multipart uploads |
| POST | `/media/upload` | Auth | Upload media to Cloudinary |
| DELETE | `/media/:assetId` | Auth | Delete an unattached media asset owned by caller |
| POST | `/posts` | Auth | Canonical JSON post creation |
| GET | `/feed?scope=general` | Optional auth | General feed |
| GET | `/posts/:postId` | Optional auth | Post detail; pending visible only to author |
| PATCH | `/posts/:postId` | Auth | Edit own published post |
| DELETE | `/posts/:postId` | Auth | Soft-remove own post or moderator removal |
| PUT | `/posts/:postId/vote` | Auth | Create or change a vote (`up`/`down`, also accepts `1`/`-1` for current client compatibility) |
| DELETE | `/posts/:postId/vote` | Auth | Remove current vote |
| GET | `/posts/:postId/votes` | Optional auth | Vote counts and current viewer's vote |
| GET | `/posts/:postId/comments` | Optional auth | List comments |
| POST | `/posts/:postId/comments` | Auth | Add a comment or one-level reply |
| DELETE | `/comments/:commentId` | Auth | Soft-delete own comment or moderator removal |
| GET | `/users/me/posts?status=pending` | Auth | Author's pending posts |

Feed responses use cursor pagination (`nextCursor`, `hasMore`, `limit`). The current frontend reads the first page; infinite scrolling can be added using the same contract.

The `following` feed scope is intentionally not activated until Person 3 integrates the Follow model and service. The route returns `FOLLOWING_FEED_NOT_READY` instead of silently showing an incorrect feed.

## Vote semantics

- A user has one vote per post.
- Repeating the same vote is an idempotent no-op.
- Switching up to down or down to up updates both counters and score.
- Self-votes are rejected with `403 SELF_VOTE_NOT_ALLOWED`.
- Public feeds and vote/comment operations exclude pending or removed posts.
- Vote changes are wrapped in MongoDB transactions.

## MongoDB deployment requirement

Post creation and vote mutations use transactions. Use MongoDB Atlas or a local MongoDB replica set. A standalone local `mongod` does not support these transactions. The `.env.example` local URI shows the replica-set query parameter; the local replica set itself must be configured before use.

## Frontend compatibility

The API serializer exposes the canonical fields (`content`, `media`, `postType`, `upvotesCount`, `downvotesCount`) and temporary UI aliases (`text`, `imageUrl`, `upvoteCount`, `downvoteCount`, numeric `myVote`) so the existing PostCard can be migrated incrementally without reintroducing JSON-file persistence.

## Next integration dependencies

- Person 3: extend community creation/discovery and add Follow, Conversation, Message and Notification models/services.
- Person 1: keep the User model/auth middleware and shared response/error conventions as the single source of truth; extend settings/profile as needed.
- Integration lead: wire Socket.IO notification events, Redis feed-cache invalidation, PostgreSQL moderation and Docker/CI deployment after module contracts are merged.


## Verification policy for this working phase

The team has elected not to perform manual Postman testing at this stage. Treat endpoint behaviour as an integration assumption while the modules are being assembled; do not describe live database round-trips as independently verified until the team chooses to perform that verification. Source-level JavaScript syntax and configuration checks may still be used during packaging.
