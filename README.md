# Unfold

<p align="center">
  <strong>A community-driven social platform built around pseudonymous identity, shared interests and reputation-based publishing.</strong>
</p>

<p align="center">
  <a href="#getting-started">Getting started</a> ·
  <a href="#features">Features</a> ·
  <a href="#tech-stack">Tech stack</a> ·
  <a href="#team-development">Team development</a> ·
  <a href="#api-overview">API overview</a>
</p>

---

## About Unfold

Unfold is a community-driven social platform where people can share text and media, participate in interest-based communities, discuss posts and build a reputation through community voting. Users receive a server-generated username rather than choosing a username themselves.

The project is being developed as a **modular monolith**: one React client, one Express API and shared infrastructure. The codebase is organised so multiple contributors can work on separate feature areas without creating duplicate servers, authentication systems or data models.

## Features

### Available in the current foundation

- Account registration and login using a server-generated username and password.
- Password hashing with bcrypt and JWT authentication stored in an HttpOnly cookie.
- Optional Gemini-powered username suggestions during registration. The user may provide a short inspiration description or leave it blank for an automatically generated suggestion. A curated fallback is used if Gemini is not configured or unavailable.
- General feed and interest-based community feeds.
- Text, image and audio post creation (Cloudinary credentials are required for media uploads).
- Post editing and deletion, comments and voting.
- One vote per user per post, with vote switching/removal and self-vote prevention.
- A global reputation gate for publishing subsequent posts.
- Light and dark interface themes based on the Peachy Community design system.
- MongoDB for social application data, PostgreSQL foundation for moderation data and Redis connection support.
- Docker Compose setup for local infrastructure and the API.

### Reputation-based publishing rule

The publishing rule is intentionally simple and fixed:

1. A user's first post can be published without earning votes.
2. Each subsequent post requires **2 upvotes from 2 distinct accounts** on the user's latest published post.
3. Downvotes change the displayed net score but do not cancel the two-upvote eligibility requirement.
4. Users cannot vote on their own posts. Each user has at most one active vote per post and may change or remove it.
5. A user may have only one pending post at a time. A pending post is visible only to its author.
6. When the latest published post receives its second distinct upvote, the pending post is automatically published.
7. The gate applies across General and community posts. A post that has already been published remains published if its score later falls.

## Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18, Vite, JavaScript | Single-page application |
| Styling | Bootstrap 5, custom CSS | Responsive interface and shared theme |
| API client | Fetch API | Communicates with the versioned REST API |
| Backend | Node.js 20+, Express | Modular REST API |
| Main database | MongoDB, Mongoose | Accounts, communities, posts, votes, comments and media metadata |
| Relational database | PostgreSQL | Moderation reports and audit foundation |
| Authentication | bcryptjs, JWT, HttpOnly cookies | Password security and authenticated sessions |
| AI username suggestions | Google Gemini API | Optional creative username suggestions |
| Media | Multer, Cloudinary | Upload handling and media storage |
| Cache | Redis | Cache infrastructure for planned/integrating features |
| Logging | Winston, Morgan | Application and HTTP request logs |
| Dev environment | Docker, Docker Compose | Local services and API container |
| CI | GitHub Actions | Automated project checks |

## Architecture

```text
Browser
  │
  ▼
React + Vite client (localhost:5173)
  │  Fetch API / HttpOnly session cookie
  ▼
Express REST API (localhost:4000/api/v1)
  ├── Authentication module
  ├── Posts, comments and voting modules
  ├── Community services
  ├── Moderation routes
  └── Shared middleware, validation and logging
       │
       ├── MongoDB + Mongoose  → social application data
       ├── PostgreSQL          → moderation reports/audit records
       ├── Redis               → cache infrastructure
       ├── Cloudinary          → uploaded media
       └── Gemini API          → optional username suggestions
```

The API is a **single Express application**. Feature modules should reuse the shared User model, authentication middleware, API response conventions and infrastructure connections.

## Getting started

### Prerequisites

- Node.js 20 or later and npm
- Git
- Docker Desktop with the WSL 2 backend on Windows (recommended for the local database services)
- A MongoDB replica set or MongoDB Atlas deployment (MongoDB transactions are used by post/vote operations)

Optional integrations:

- Gemini API key for AI username suggestions
- Cloudinary account for image/audio uploads
- PostgreSQL and Redis if running those services outside Docker

### 1. Clone the repository

```bash
git clone https://github.com/MaitrikKaushik/Unfold.git
cd Unfold
```

### 2. Configure the backend environment

**Windows PowerShell:**

```powershell
cd server
Copy-Item .env.example .env
```

**macOS/Linux:**

```bash
cd server
cp .env.example .env
```

Open `server/.env` and set a strong local JWT secret. Generate one with:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Minimum local configuration:

```env
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
COOKIE_SAME_SITE=lax
BCRYPT_ROUNDS=12
MONGODB_URI=mongodb://127.0.0.1:27017/unfold?replicaSet=rs0
```

Optional integrations in `server/.env`:

```env
# Gemini username suggestions (server-side only)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Cloudinary media uploads
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# PostgreSQL and Redis (leave blank if not using them locally)
DATABASE_URL=postgresql://unfold:unfold_local_dev@127.0.0.1:5432/unfold
REDIS_URL=redis://127.0.0.1:6379
```

**Never put `GEMINI_API_KEY`, JWT secrets, database passwords or Cloudinary secrets in the frontend or commit a real `.env` file.** The Gemini key belongs only in `server/.env`. Without a Gemini key, username generation uses the built-in fallback. Without Cloudinary credentials, the API can start but media upload endpoints will not be available.

### 3. Configure the frontend

Open a second terminal at the repository root.

**Windows PowerShell:**

```powershell
cd client
Copy-Item .env.example .env
```

**macOS/Linux:**

```bash
cd client
cp .env.example .env
```

The frontend API setting should be:

```env
VITE_API_BASE_URL=http://localhost:4000/api/v1
```

### 4. Start local services with Docker

From the repository root, run:

```bash
docker compose up -d --build
```

This starts MongoDB, PostgreSQL, Redis and the Express API. The MongoDB container is configured as a single-node replica set named `rs0`.

Check service status:

```bash
docker compose ps
```

Wait until MongoDB, PostgreSQL and Redis report healthy. Check API startup logs if needed:

```bash
docker compose logs --tail=80 api
```

Health endpoint:

```text
http://localhost:4000/api/v1/health
```

Expected health response includes `success: true` and service connection statuses.

### 5. Install and run the frontend

In a terminal at the repository root:

```bash
cd client
npm install
npm run dev
```

Open the Vite URL printed in the terminal, normally:

```text
http://localhost:5173
```

> **Important:** When using the Docker Compose setup above, the API is already running in Docker on port `4000`. Do not also start `npm run dev` inside `server` at the same time, because both API processes would compete for that port.

### Alternative: run the API directly on your machine

If you prefer to run the backend outside Docker, first stop the Compose API container while keeping the databases running:

```bash
docker compose stop api
```

Then start the backend in its own terminal:

```bash
cd server
npm install
npm run dev
```

For this arrangement, the MongoDB replica-set member hostname must be reachable from the host machine. The default Compose replica-set advertises `mongo:27017`, which is resolvable inside Docker but generally not by Windows/macOS host processes. Use the all-Docker API option above unless you have configured host-resolvable replica-set networking.

### Stop local services

Stop the frontend with `Ctrl + C`. Stop Docker services with:

```bash
docker compose down
```

This preserves named database volumes. **Do not use `docker compose down -v` unless you intend to delete local database data.**

## Environment variables reference

| Variable | Required? | Description |
|---|---|---|
| `PORT` | No | Express port (default `4000`) |
| `CLIENT_ORIGIN` | Yes for browser auth | Exact frontend origin allowed by CORS |
| `JWT_SECRET` | Yes | Secret used to sign authentication tokens |
| `JWT_EXPIRES_IN` | No | Token lifetime (default `7d`) |
| `COOKIE_SAME_SITE` | No | Cookie SameSite policy |
| `BCRYPT_ROUNDS` | No | Password hashing cost |
| `MONGODB_URI` | Yes | MongoDB replica-set connection string |
| `DATABASE_URL` | Optional | PostgreSQL connection string |
| `REDIS_URL` | Optional | Redis connection string |
| `GEMINI_API_KEY` | Optional | Gemini key for username suggestions; backend only |
| `GEMINI_MODEL` | No | Gemini model name (default `gemini-2.5-flash`) |
| `CLOUDINARY_CLOUD_NAME` | Optional | Cloudinary account name |
| `CLOUDINARY_API_KEY` | Optional | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Optional | Cloudinary API secret |
| `VITE_API_BASE_URL` | Yes for frontend | API base URL exposed to the browser; never put secrets here |

## API overview

All versioned API routes use the `/api/v1` prefix. The API returns JSON responses with a `success` flag and structured error information.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Service health and connection status |
| POST | `/auth/username/suggest` | Public, rate-limited | Generate a username suggestion |
| POST | `/auth/register` | Public, rate-limited | Register an account |
| POST | `/auth/login` | Public, rate-limited | Log in with username and password |
| POST | `/auth/logout` | Authenticated | Invalidate the current session |
| GET | `/auth/me` | Authenticated | Get the current account |
| PATCH | `/auth/profile` | Authenticated | Update profile fields supported by the current API |
| GET | `/communities` | Public | List communities |
| GET | `/communities/:slug/posts` | Public/optional auth | Read a community feed |
| POST | `/posts` | Authenticated | Create a post or pending post |
| GET | `/posts/:id` | Public/optional auth | Read a post |
| PATCH | `/posts/:id` | Author | Edit a post |
| DELETE | `/posts/:id` | Author | Delete a post |
| POST | `/posts/:id/vote` | Authenticated | Upvote or downvote a post |
| GET | `/posts/:id/comments` | Public | List comments |
| POST | `/posts/:id/comments` | Authenticated | Add a comment |

The endpoint list is a quick orientation, not a substitute for the route definitions. Check `server/src/modules/` and `server/src/routes.js` for the exact request validation and response contracts as modules evolve.

### Authentication behaviour

- Passwords are hashed using bcryptjs.
- The API sets the `unfold_session` JWT as an HttpOnly cookie.
- The browser sends the cookie with credentialed requests.
- The frontend must not store the JWT in localStorage or sessionStorage.
- Login uses the generated username and the password created at registration.

### Username generation behaviour

- The backend owns username generation and checks MongoDB for collisions.
- The optional registration inspiration is limited to 300 characters.
- When `GEMINI_API_KEY` is configured, the backend requests a Gemini-generated suggestion.
- When Gemini is not configured or a generation attempt fails, a built-in fallback generator is used.
- The API rate-limits username suggestion requests.

## Team development

### Shared rules

1. Work in the existing repository and follow the current folder structure.
2. Keep one Express server and one shared MongoDB connection.
3. Reuse `server/src/models/User.js`; do not create another User model.
4. Reuse authentication middleware from `server/src/middleware/auth.js`.
5. Reuse the shared frontend API client in `client/src/services/api.js`.
6. Keep API routes under `/api/v1` and follow existing response/error conventions.
7. Keep secrets in local environment files. Commit `.env.example` changes when new variables are introduced, never real credentials.
8. Do not change the global Peachy Community theme tokens independently in feature modules.
9. Do not change the two-distinct-upvote publishing policy without an explicit team decision.
10. Avoid adding dependencies or restructuring shared folders without coordinating with the team.

### Suggested ownership areas

| Workstream | Primary responsibility | Typical files/areas |
|---|---|---|
| Core integration and authentication | Shared backend setup, auth, profile/settings, environment, integration and CI | `server/src/modules/auth`, `server/src/config`, shared middleware, `client/src/components/AuthPanel.jsx` |
| Posts and reputation | Post lifecycle, media, comments, voting, eligibility and feed behaviour | `server/src/modules/posts`, `server/src/services`, `client/src/components/PostCard.jsx` |
| Communities and social features | Community experience, membership, following, messaging and notifications | Community/social modules and their client components |

Coordinate changes to shared files before merging. Each contributor should pull the latest `main` before starting and push feature work on a separate branch where practical.

### Recommended Git workflow

```bash
# Get the latest shared code
git switch main
git pull origin main

# Create a feature branch
git switch -c feature/short-feature-name

# After making and reviewing changes
git status
git add .
git diff --cached
git commit -m "Add: short description"
git push -u origin feature/short-feature-name
```

Open a Pull Request into `main` and request a teammate review before merging. Do not commit `.env`, credentials, generated `node_modules` folders or local database files.

## Project structure

```text
Unfold/
├── client/
│   ├── src/
│   │   ├── components/       # Shared and feature UI components
│   │   ├── services/         # Shared API client
│   │   ├── App.jsx
│   │   └── styles.css        # Shared Peachy Community design tokens
│   └── package.json
├── server/
│   ├── src/
│   │   ├── config/           # MongoDB, PostgreSQL, Redis, Cloudinary, logger
│   │   ├── middleware/       # Authentication and shared middleware
│   │   ├── models/           # Mongoose models
│   │   ├── modules/          # Auth, posts and moderation routes/services
│   │   ├── migrations/       # Legacy account migration
│   │   ├── services/         # Shared business logic
│   │   └── server.js         # Express application startup
│   ├── test-suite.js
│   └── package.json
├── docs/                     # Project documentation
├── .github/workflows/        # CI workflow
├── docker-compose.yml
├── render.yaml
└── README.md
```

## Checks

Backend business-rule test suite:

```bash
cd server
npm test
```

Frontend production build:

```bash
cd client
npm install
npm run build
```

The GitHub Actions workflow also runs the configured checks on pushes and pull requests. A passing build or unit/business-rule test does not by itself prove that every external integration is configured; check the health endpoint and service credentials in the environment where the app is running.

## Current scope and roadmap

Unfold is an evolving project foundation. Some infrastructure and feature areas are present as configuration or scaffolding while their complete user-facing workflows are still being integrated.

| Area | Current position |
|---|---|
| Authentication and generated usernames | Implemented; Gemini suggestions are optional and require a server-side key |
| MongoDB-backed posts, feeds, votes and comments | Foundation implemented |
| Two-upvote publishing gate | Implemented in the post/reputation foundation |
| Image/audio upload | Cloudinary integration present; requires credentials |
| Communities and membership | Core list/membership foundation present; richer creation/discovery and UI remain work |
| PostgreSQL moderation | Connection/schema and route foundation present; full moderation workflow remains work |
| Redis caching | Connection/configuration present; full feed-cache integration remains work |
| Following, direct messages, live notifications | Planned/integration work |
| Deployment and CI/CD | Deployment configuration and CI scaffolding present; production credentials and final deployment setup remain work |

## Course outcome alignment

| Course outcome | Evidence in the project |
|---|---|
| CLO01 — Frontend engineering | React components, responsive UI, theme handling and API integration |
| CLO02 — Backend engineering | Express REST endpoints, middleware, authentication, password hashing and validation |
| CLO03 — Database engineering | MongoDB/Mongoose models and PostgreSQL moderation schema |
| CLO04 — Full-stack integration and DevOps | Credentialed API integration, environment configuration, logging, Docker Compose and CI workflow |

## Security notes

- Never commit `.env` files, API keys, database credentials or production secrets.
- Keep Gemini and Cloudinary credentials on the server only.
- Use a unique, strong `JWT_SECRET` outside local development.
- Use HTTPS and secure cookie settings in production.
- Restrict CORS to the exact deployed frontend origin.
- Do not grant moderator/admin roles through public registration.
- Treat user-generated text and uploaded files as untrusted input.

## Contributing

Contributions from teammates and collaborators are welcome. Before implementing a feature, read the shared development rules, check the current API and data models, coordinate ownership with the team and keep the README or relevant documentation updated when contracts change.

For bugs or proposed features, open a GitHub Issue with reproduction steps, expected behaviour and relevant screenshots or logs. For code changes, submit a Pull Request with a concise summary and the checks you ran.

---

**Unfold — find your community, share your perspective and earn your next post.**
