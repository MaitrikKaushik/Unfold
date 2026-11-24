# Unfold — Community-Driven Social Platform

**Unfold** is a community-driven social platform where users publish content in a general feed or interest-based communities, build social connections and earn the ability to publish again through community voting.

> **Publishing rule (locked):** Every user can publish their first post for free. Each subsequent post is unlocked when the user's latest published post has at least **2 distinct upvotes**. Downvotes affect the displayed net score, but do not cancel or reduce the two-upvote requirement. This rule is global across General and community posts.

## 1. Technology architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 18 + Vite | Single-page web application |
| UI | Bootstrap 5 + custom CSS | Responsive components and Peachy Community design system |
| Client API | Fetch API | Calls the versioned REST API with cookie credentials |
| Backend | Node.js + Express | Modular monolith and REST APIs |
| Primary database | MongoDB + Mongoose | User accounts, communities, memberships, posts, votes, comments and media metadata |
| Relational database | PostgreSQL | Moderation reports and moderation audit records |
| Authentication | bcryptjs + JWT HttpOnly cookie | Password hashing and session authentication |
| Media | Multer + Cloudinary | File validation/handling and cloud media storage |
| Real-time | Socket.IO (integration phase) | Direct messages and live notifications |
| Cache | Redis (optional during local foundation work) | Feed/search caching |
| Logging | Winston + Morgan | Structured application logs and HTTP request logs |
| Verification | Source-level checks and documented acceptance criteria | Consistent module contracts without requiring manual API-client testing |
| DevOps | Docker + GitHub Actions (integration phase) | Reproducible runtime and CI workflow |

The backend is a **modular monolith**: one Express server, one authentication layer and shared infrastructure. Modules must not create independent server instances or duplicate the User model. MongoDB Atlas or a local replica set is required because post creation and vote updates use MongoDB transactions.

## 2. Current foundation status

### Implemented in the current project package

- Username/password registration with server-generated unique usernames.
- bcrypt password hashing and JWT authentication using an HttpOnly cookie.
- Logout token-version invalidation and current-user/profile endpoints.
- MongoDB/Mongoose models for User, Community, Membership, Post, Vote, Comment and MediaAsset.
- Default Technology, Programming and Gaming communities seeded on server start, plus a virtual General destination.
- MongoDB-backed General and community post feeds.
- Text, image and audio publishing; Multer memory uploads and Cloudinary media storage.
- Post editing/removal, comments and soft-deletion behaviour.
- One vote per user per post, vote switching/removal and self-vote prevention.
- Global two-distinct-upvote publishing gate, one pending post per author and automatic pending-post publication.
- Shared Peachy Community light/dark interface tokens and audio attachment rendering.
- PostgreSQL moderation schema/configuration, Redis configuration and Winston/Morgan logging.
- Docker Compose replica-set configuration and GitHub Actions workflow scaffolding.

### Remaining module integration work

- Community creation, richer community discovery/ownership and full membership UI (Person 3).
- Follow/unfollow and the following feed (Person 3).
- Direct messaging, Socket.IO live events and notifications (Person 3 plus shared integration).
- PostgreSQL moderation endpoints/UI and audit workflow completion.
- Redis feed-cache reads, writes and invalidation.
- Final deployment secrets, end-to-end integration and report evidence.

The legacy JSON store and routes remain in the repository as a compatibility layer for old endpoints/data export. The active `/api/v1` post, vote, comment, community-list and membership foundation routes are mounted ahead of those legacy routes and use MongoDB.

## 3. Requirements

- Node.js 20 or later (Node 22 LTS recommended).
- npm.
- MongoDB Atlas or a local MongoDB replica set (transactions are used by post/vote writes).
- PostgreSQL database (needed for moderation endpoints/CLO03 SQL demonstration).
- Redis instance (needed when caching is integrated).
- Cloudinary account and API credentials (required for image/audio uploads; the rest of the API can run without them).

## 4. Environment configuration

### Backend

```bash
cd server
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env`. The backend `.env.example` contains all service variables. Use a MongoDB replica-set URI for local development or MongoDB Atlas.

Set at least:

```env
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=replace_with_a_random_secret_at_least_32_characters_long
JWT_EXPIRES_IN=7d
COOKIE_SAME_SITE=lax
BCRYPT_ROUNDS=12
MONGODB_URI=mongodb://127.0.0.1:27017/unfold?replicaSet=rs0
```

Optional services:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/unfold
PG_POOL_MAX=5
PGSSLMODE=disable
REDIS_URL=redis://127.0.0.1:6379
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
MAX_MEDIA_FILES=5
MAX_MEDIA_SIZE_MB=25
```

For production, use a strong randomly generated `JWT_SECRET`, HTTPS, `secure` cookies and an appropriate `COOKIE_SAME_SITE` value. Configure `CLIENT_ORIGIN` to the exact deployed frontend origin. Never commit `.env` files or credentials.

### Frontend

The default development API URL is `http://localhost:4000/api/v1`. To configure it explicitly, copy `client/.env.example` to `client/.env`:

```env
VITE_API_BASE_URL=http://localhost:4000/api/v1
```

## 5. Run locally

Install dependencies separately because the frontend and backend are separate npm projects.

**Terminal 1 — backend:**

```bash
cd server
npm install
npm run dev
```

**Terminal 2 — frontend:**

```bash
cd client
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The backend listens on port `4000` by default.

### Optional local infrastructure with Docker Compose

From the repository root:

```bash
docker compose up --build -d
```

This starts MongoDB, PostgreSQL, Redis and the Express API. Then run the Vite client locally using the steps above. The Compose credentials are development-only and must never be reused in production. To stop the services:

```bash
docker compose down
```

Health check:

```text
GET http://localhost:4000/api/v1/health
```

## 6. Authentication contract

All routes are prefixed with `/api/v1`.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Register using password and optional display name; server generates username |
| POST | `/auth/login` | Public | Login using generated username and password |
| POST | `/auth/logout` | Required | Invalidate session and clear cookie |
| GET | `/auth/me` | Required | Return current safe user profile |
| PATCH | `/auth/profile` | Required | Update display name and bio |

### Registration request

```json
{
  "displayName": "Optional display name",
  "password": "minimum-eight-characters"
}
```

The client does **not** choose a username. The server generates a unique username such as `unfold_a1b2c3d4e5f6`, saves the bcrypt hash and returns the generated username once in the registration response. The user must save it for subsequent login.

### Login request

```json
{
  "username": "unfold_a1b2c3d4e5f6",
  "password": "minimum-eight-characters"
}
```

### Response shape

```json
{
  "success": true,
  "message": "Welcome back to Unfold.",
  "data": {
    "user": {
      "id": "mongo-user-id",
      "username": "unfold_a1b2c3d4e5f6",
      "displayName": "Optional display name",
      "bio": "",
      "role": "user"
    }
  }
}
```

A JWT is set as the `unfold_session` HttpOnly cookie. The browser sends it using `credentials: "include"`. The client stores only a non-sensitive profile cache in localStorage, never the JWT.

## 7. Reputation policy / backend contract

1. First published post is free (user must still be a member to post inside a community).
2. To publish another post, the user's latest published post across all feeds/communities must have at least 2 upvotes from distinct accounts.
3. A vote is one of `1` (upvote) or `-1` (downvote); a user may change or remove their vote.
4. One account can hold at most one vote per post. Self-voting is rejected.
5. Downvotes affect the visible net score (`upvotes - downvotes`) only. They do not affect posting eligibility.
6. If a user submits a post before reaching the threshold, the backend stores one pending post, visible only to its author. It is automatically published when the latest published post receives the second upvote.
7. Only one pending post per user is allowed. The gate is global, not per community.
8. A published post stays published if its score later decreases.

The deterministic business-rule tests are in `server/test-suite.js`:

```bash
cd server
npm test
```

## 8. PostgreSQL moderation endpoints

When `DATABASE_URL` is configured, the backend initialises:

- `reports`: report submitted by a user against a post, comment or account.
- `moderation_actions`: append-only record of a moderator's decision, linked to a report.

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| POST | `/reports` | Authenticated user | Create a report |
| GET | `/admin/reports?status=open&limit=20` | Moderator/admin | List reports |
| PATCH | `/admin/reports/:id` | Moderator/admin | Update status and record action |

The current prototype creates standard users with role `user`. For a local evaluation account, use the controlled CLI command below after creating the account; never allow public registration to choose a privileged role.

```bash
cd server
npm run set-role -- unfold_your_generated_username admin
```

Use `moderator` rather than `admin` when only moderation access is required.

## 9. Legacy account migration

If an existing local JSON `store.json` contains accounts from the previous prototype, configure MongoDB and run this migration **before starting the new application or making any writes to the legacy content store**:

```bash
cd server
npm run migrate:legacy-users
```

The script imports the old username and existing bcrypt hash into MongoDB, records the old ID as `legacyId` and does not need the user's plaintext password. Back up the old store before migrating. The compatibility adapter intentionally strips credential fields when writing public legacy user records; migrating first preserves the original hashes. The migration is optional for a fresh install.

## 10. DevOps foundation

- `server/Dockerfile` containerises the Express API.
- `docker-compose.yml` runs the API with MongoDB, PostgreSQL and Redis for local evaluation.
- `.github/workflows/ci.yml` runs backend syntax checks, reputation policy tests and a frontend production build on pushes and pull requests to `main` and `develop`.

The CI workflow is a continuous-integration check. `render.yaml` provides a backend service blueprint, but deployment requires you to configure the exact frontend origin and managed service credentials in Render. Because this API uses credentialed cookies, `CLIENT_ORIGIN` must be the real frontend origin, never `*`. Set `MONGODB_URI`; set `DATABASE_URL` and `REDIS_URL` to enable those services; provide Cloudinary credentials to enable media uploads. The frontend Netlify build uses `client/.env.example` as a reference; set `VITE_API_BASE_URL` to the deployed backend's `/api/v1` URL in Netlify.

## 11. Project structure

```text
Unfold-main/
├── client/
│   ├── src/
│   │   ├── components/       # Shared and feature UI components
│   │   ├── services/api.js   # Shared Fetch API client
│   │   ├── App.jsx
│   │   └── styles.css        # Shared Peachy Community tokens
│   └── package.json
├── server/
│   ├── src/
│   │   ├── config/           # MongoDB, PostgreSQL, Redis, Cloudinary, logger
│   │   ├── middleware/       # Authentication and shared middleware
│   │   ├── models/           # Mongoose models
│   │   ├── modules/          # Auth and moderation modules
│   │   ├── migrations/       # Legacy account migration
│   │   ├── services/         # Shared business rules
│   │   ├── data/             # Temporary legacy content adapter
│   │   ├── routes.js         # Temporary legacy content routes
│   │   └── server.js         # Express application and service startup
│   ├── test-suite.js
│   └── package.json
└── docs/
```

The final target architecture adds dedicated `posts`, `communities`, `social`, `messaging` and `notifications` modules. Each team member must use the shared User model, API client, response conventions and design tokens.

## 12. Shared interface system — Peachy Community

Typography: **Plus Jakarta Sans**.

Light palette:

| Token | Value |
|---|---|
| Background | `#FFF8F0` |
| Surface | `#FFFFFF` |
| Primary plum | `#5B4168` |
| Peach | `#FFB49A` |
| Lavender | `#C9B6FF` |
| Mint | `#A8E6CF` |
| Text | `#35263E` |
| Muted | `#786B7C` |

Dark palette:

| Token | Value |
|---|---|
| Background | `#1D1523` |
| Surface | `#291F30` |
| Soft surface | `#35263E` |
| Primary lavender | `#C9B6FF` |
| Peach | `#FFB49A` |
| Mint | `#A8E6CF` |
| Text | `#FFF8F0` |
| Muted | `#B8A7BB` |

Theme preference is stored under `unfold_theme` and applied using `data-theme="light"` or `data-theme="dark"` on the document root. Do not introduce separate module palettes.

## 13. Development rules for team integration

- Use one Express server and the `/api/v1` base path.
- Reuse `User` from `server/src/models/User.js`; do not create another User model.
- Reuse `requireAuth` / `optionalAuth` from `server/src/middleware/auth.js`.
- Reuse the shared Fetch wrapper in `client/src/services/api.js`.
- Do not store JWTs in localStorage or return password hashes.
- New module routes must use consistent JSON response and error formats.
- Validate and sanitise all request input on the server.
- MongoDB owns users and social-domain collections. PostgreSQL owns the moderation report/audit domain. Do not duplicate the same source-of-truth records across databases.
- Build new features on the MongoDB/PostgreSQL modules. The older JSON routes remain only as a compatibility path for legacy endpoints; do not add new production features to that adapter.
- Store media in Cloudinary; store only `publicId`, secure URL, resource type, owner and metadata in MongoDB.
- Keep `.env`, database credentials and Cloudinary secrets private.
- Each module must include endpoint examples, ownership boundaries and acceptance criteria before integration. Manual Postman testing is not part of the current agreed workflow.

## 14. Course outcome mapping

| CLO | How Unfold demonstrates it |
|---|---|
| CLO01 | React UI, component state, responsive Bootstrap/custom CSS, light/dark theme, Fetch API integration |
| CLO02 | Node.js, Express modular routing, REST APIs, middleware, JWT, bcrypt, validation and error handling |
| CLO03 | Mongoose schemas, MongoDB CRUD/indexes/references and PostgreSQL reports/audit tables with SQL queries |
| CLO04 | Authenticated full-stack integration, CORS/Origin checks, secure cookies, logging, API tests, Redis, Docker and CI/CD as completed in the integration phase |

## 15. Known current limitations

This is an active foundation branch, not the completed project. The versioned `/api/v1` routes for the General/community feeds, post CRUD, voting, comments, membership join/leave and media upload now use MongoDB/Mongoose and Cloudinary. The older JSON compatibility routes remain for legacy paths and any not-yet-migrated features. Community creation/ownership, follow relationships, direct messaging, Socket.IO events, Redis feed caching and the full deployment pipeline remain integration work. PostgreSQL connection/schema setup and Docker Compose scaffolding exist; the complete moderation workflow and deployment configuration still need to be finished.
