# CommonGround — Minimal Reputation-Based Social Platform

A small academic MVP built with React + Vite, Node.js, Express, JWT, bcrypt, Multer, and JSON-file persistence.

## Requirements
- Node.js 20+ recommended
- npm

## Run locally

Open two terminals.

### 1. Start backend
```bash
cd server
cp .env.example .env
npm install
npm run dev
```
The API runs at `http://localhost:4000`.

### 2. Start frontend
```bash
cd client
npm install
npm run dev
```
Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

## Included
- Register/login with bcrypt password hashing and JWT.
- Three seeded communities: Technology, Programming, Gaming.
- Join multiple communities.
- Create text posts with optional image uploads.
- Upvote/downvote, switch vote, remove vote.
- Per-user, per-community dynamic posting gate (threshold +5).
- Feed and current eligibility display.
- Minimal React/Bootstrap UI.

## Important prototype limitations
This is an academic prototype, not production-ready. JSON files are used to keep setup small. JSON persistence is not safe for concurrent writes or multi-process deployments. The voting and posting operations are implemented simply for local demonstration, not as transaction-safe production logic. For production, migrate to MongoDB/Mongoose and use database transactions or equivalent concurrency controls.

Image files are stored locally in `server/uploads`. Do not use this approach for production hosting without durable file storage and upload security hardening.

JWT is stored in localStorage for simplicity in this prototype. Production applications should assess XSS risks and consider secure, HttpOnly cookie-based sessions.

## Quick demo
1. Register two accounts in separate browser sessions.
2. Join the same community with both accounts.
3. Account A creates a post.
4. Account B upvotes it five times? **No**: each account can have only one active vote per post. To demonstrate the +5 threshold, create five separate test accounts and upvote the post once per account, or temporarily change `POST_THRESHOLD` in `server/.env` to `1` for a quick smoke test.
5. Once the gate post reaches +5, its author can publish another post in that community.
6. If the score drops below +5, the author is locked again, provided that post remains their latest post in that community.

## API overview
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/communities`
- `POST /api/communities/:id/join`
- `GET /api/communities/:id/eligibility`
- `GET /api/communities/:id/posts`
- `POST /api/communities/:id/posts` (multipart form: `text`, optional `image`)
- `PUT /api/posts/:id/vote` (`{ "value": 1 }` or `{ "value": -1 }`)
- `DELETE /api/posts/:id/vote`

All protected endpoints require `Authorization: Bearer <token>`.
