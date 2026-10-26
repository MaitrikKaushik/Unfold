# Unfold — Simple Community Discussions

**Unfold** is a clean, intentional community discussion platform inspired by Reddit, OneHack, and Instagram. Built as an academic full-stack project, Unfold demonstrates core backend and web development concepts without unnecessary architectural complexity.

The platform uses a reputation-based contribution model: a user's first post in any community is permitted upon joining, but subsequent posts in that community require the author's latest post to reach a net score of **+5** through peer upvotes.

---

## 🛠 Technology Stack

- **Frontend:** React (Vite), JavaScript (ES Modules), Bootstrap 5, Custom CSS, Fetch API
- **Backend:** Node.js, Express.js, REST APIs, JSON Web Tokens (JWT), `bcryptjs`, `multer`
- **Data Storage:** Atomic JSON-file persistence (`store.json`)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ (Node 20, 22, or 24 recommended)
- npm

### 1. Start Backend Server
```bash
cd server
cp .env.example .env
npm install
npm run dev
```
The Express API runs at `http://localhost:4000`.

To run the automated backend test suite:
```bash
npm test
```

### 2. Start Frontend Client
In a second terminal window:
```bash
cd client
npm install
npm run dev
```
Open the Vite URL printed in your terminal (typically `http://localhost:5173`).

---

## ✨ Features

### Core Capabilities
- **Authentication:** Pseudonymous user registration and login with bcrypt password hashing and 7-day JWT tokens.
- **Communities:** Three seeded communities (`Technology`, `Programming`, `Gaming`). Users can browse publicly or join to participate.
- **+5 Posting Gate Rule:** A user can create their first post immediately upon joining a community. Their subsequent post in that community unlocks only after their latest post achieves a net upvote score of +5 (configurable via `POST_THRESHOLD` in `.env`).
- **Voting System:** Upvote (+1) or downvote (-1) posts. Switch or retract votes. Authors cannot vote on their own posts.
- **Media Attachments:** Upload optional images (JPG, PNG, WEBP, GIF, max 3MB) processed safely via Multer.

### New Features Added
1. **Feature A — Post Categories & Resource Links:**
   - Choose between **Discussion**, **Question**, or **Resource** when publishing.
   - For **Resource** posts, add an optional website URL with automatic `https://` formatting and clickable display.
   - Distinctive visual badges for each category on post cards.
2. **Feature B — Comments:**
   - Read discussions and view total comment counts directly on post cards.
   - Authenticated users can post comments.
   - Authors can delete their own comments (strictly protected on the backend so users cannot delete others' comments).
   - Comments persist in the JSON store across server restarts and page refreshes.
3. **Feature C — Simple Feed Sorting:**
   - **Latest:** View posts chronologically with the newest posts first.
   - **Top:** View posts sorted by net score (`upvotes - downvotes`) descending.

---

## 📚 College Syllabus Demonstration

This project directly demonstrates key concepts in web and backend development:

| Syllabus Topic | Implementation in Unfold |
| :--- | :--- |
| **JavaScript & Async Programming** | Modern ES Modules (`import`/`export`), `async`/`await`, Promises, array methods (`filter`, `map`, `some`, `find`, `sort`). |
| **Node.js & Express.js** | Modular router (`server/src/routes.js`), Express server configuration, static asset serving (`/uploads`), environment variable loading with `dotenv`. |
| **RESTful API Design** | Predictable endpoint naming, resource hierarchy (`/communities/:id/posts`, `/posts/:id/comments`), appropriate HTTP verbs (`GET`, `POST`, `PUT`, `DELETE`), and standard HTTP status codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `422`, `500`). |
| **Middleware** | `requireAuth` for protecting write endpoints; `optionalAuth` for attaching viewer identity to public feeds; `multer` for secure multipart file upload handling; central error-handling middleware. |
| **Authentication & Passwords** | `bcryptjs` salted password hashing (work factor 10) on registration and comparison on login; signed JWT tokens stored securely. |
| **Input Validation** | Request body validation for username constraints, email format, password length, comment length, link length, and image mimetype/size limits. |
| **Authorization & Ownership** | Backend enforcement preventing users from voting on their own posts and ensuring users can only delete comments they authored. |
| **CRUD Operations** | Complete Create, Read, Update, and Delete lifecycles across Users, Communities, Posts, Votes, and Comments. |
| **Data Persistence** | File-system persistence using atomic temporary-file writes and renames (`fs.writeFile` + `fs.rename`) to guard against file corruption. |

---

## 📡 REST API Reference

### Authentication
- `POST /api/auth/register` — Create account (`{ username, email, password }`)
- `POST /api/auth/login` — Sign in (`{ login, password }`)
- `GET /api/auth/me` — Get current user profile *(requires Bearer token)*

### Communities
- `GET /api/communities` — List all communities
- `POST /api/communities/:id/join` — Join a community *(requires Bearer token)*
- `GET /api/communities/:id/eligibility` — Check user's posting gate status *(requires Bearer token)*

### Posts
- `GET /api/communities/:id/posts?sort=latest|top` — View posts (sorted by newest or highest score)
- `GET /api/posts/:id` — Get single post details
- `POST /api/communities/:id/posts` — Create a post (`title`, `category`, `link`, `text`, optional `image` file) *(requires Bearer token)*
- `PUT /api/posts/:id/vote` — Vote on post (`{ "value": 1 }` or `{ "value": -1 }`) *(requires Bearer token)*
- `DELETE /api/posts/:id/vote` — Retract active vote *(requires Bearer token)*

### Comments
- `GET /api/posts/:id/comments` — View comments for a post
- `POST /api/posts/:id/comments` — Add a comment (`{ "text": "..." }`) *(requires Bearer token)*
- `DELETE /api/comments/:id` — Delete own comment *(requires Bearer token; author only)*

---

## 🧪 Testing the +5 Posting Rule

1. Register User A and User B.
2. Both users join the `Programming` community.
3. User A creates their first post (allowed immediately).
4. User A attempts to create a second post immediately (locked; receives a `422 POSTING_LOCKED` error until their previous post achieves a net score of +5).
5. User B upvotes User A's post. (To simulate reaching +5 quickly during local testing, you can adjust `POST_THRESHOLD=1` in `server/.env` or register additional test accounts).
6. Once the gate post reaches the required net score, User A's posting status updates to "You're clear to contribute" and publishing unlocks!
