# GraspIt

**Practitioner-led technical and product courses, with separate workspaces for students, instructors and admins.**

GraspIt is a full-stack learning platform. Students browse and enroll in courses, watch lessons, take notes and earn completion certificates. Instructors author courses and submit them for review. Admins approve courses, manage categories and moderate users.


<!-- Add a screenshot or short GIF here, e.g. ![GraspIt landing page](docs/landing.png) -->
<img width="1329" height="606" alt="image" src="https://github.com/user-attachments/assets/cfb7045c-22bc-47a6-9616-cf8d1a8c6f9d" />



---

## Features

**Everyone**
- Landing page with featured courses, categories, mentor profiles and a contact form
- Sign up / sign in with role-based workspaces

**Students**
- Course catalog and a simulated checkout
- Video course player with a syllabus checklist and progress tracking
- Per-lesson notes
- Certificate issued automatically at 100% completion

**Instructors**
- Course builder: cover upload, modules, lessons and video URLs
- Courses are submitted as `pending` and must be approved by an admin
- Move courses between draft and pending; view enrollments for your courses

**Admins**
- Approve or unpublish courses and feature them on the landing page
- Create and delete categories
- Change user roles, suspend accounts and review contact inquiries

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Motion, Lucide icons |
| Backend | Node.js 20+, Express 4, TypeScript (run with `tsx`) |
| Auth | scrypt password hashing, HMAC-signed bearer tokens (7-day expiry) |
| Storage | JSON file (`.data/graspit-db.json`) |

---

## Getting started

**Requirements:** Node.js 20 or newer.

```bash
git clone <your-repo-url>
cd graspit
npm install
cp .env.example .env     # then edit the values
npm run dev
```

The app runs at <http://localhost:3000>. In development, Vite is mounted inside the Express server, so the frontend and API share one port.

### Environment variables

Copy `.env.example` to `.env`. The server reads it at startup, so **restart after changing it**.

| Variable | Required | Description |
|---|---|---|
| `AUTH_SECRET` | In production | Long random string used to sign login tokens. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. If unset, a random one is used and everyone is logged out on each restart. |
| `DEMO_MODE` | No | `true` enables the demo accounts and shows their credentials on the sign-in page. Default is off. |
| `DATA_DIR` | No | Folder for the JSON database. Point it at a persistent disk in production. Default is `./.data`. |
| `PORT` | No | Server port. Default is `3000`. Most hosts set this for you. |

### Demo accounts

With `DEMO_MODE=true`, these accounts are created or reset on every server start:

| Role | Email | Password |
|---|---|---|
| Student | `student@graspit.dev` | `password123` |
| Instructor | `instructor@graspit.dev` | `password123` |
| Admin | `admin@graspit.dev` | `password123` |

With `DEMO_MODE` off, these accounts are locked and you sign up for real accounts instead. **Never enable demo mode on an instance with real users**, because the admin password is public.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the server with Vite hot reload |
| `npm run build` | Build the frontend into `dist/` |
| `npm start` | Run the production server (serves `dist/`) |
| `npm run clean` | Delete `dist/` |

To test the production build locally: `npm run build && npm start`.

---

## Project structure

```
.
├── server.ts            # Express API, auth, seed data, JSON "database"
├── src/
│   ├── App.tsx          # App shell, session handling, API calls
│   ├── types.ts         # Shared TypeScript types
│   └── components/      # LandingPage, AuthPage, StudentDashboard,
│                        # InstructorCMS, AdminPortal, CheckoutModal, ...
├── public/images/       # Static images (served from /images/...)
└── .env.example
```

---

## API overview

All routes are under `/api`. Authenticated routes expect `Authorization: Bearer <token>`, which is returned by login and signup.

| Method & path | Access | Purpose |
|---|---|---|
| `POST /auth/signup` | Public | Create a student or instructor account (never admin) |
| `POST /auth/login` | Public | Sign in; rate-limited to 10 failures per 15 min per IP |
| `GET /bootstrap` | Public, filtered by role | Initial data load (see below) |
| `GET /courses`, `GET /categories` | Public | Published courses and categories |
| `POST /inquiries` | Public | Contact form |
| `POST /courses` | Instructor, Admin | Create a course (always starts as `pending`) |
| `PUT /courses/:id` | Owner or Admin | Edit; only admins can publish or feature |
| `DELETE /courses/:id` | Owner or Admin | Delete a course |
| `POST /categories` | Instructor, Admin | Create a category |
| `DELETE /categories/:id` | Admin | Delete a category |
| `POST /enrollments` | Any signed-in user | Enroll in a published course |
| `PATCH /enrollments/:id/progress` | Enrollment owner | Toggle a lesson complete |
| `POST /notes`, `DELETE /notes/:id` | Signed-in; owner (or Admin) to delete | Lesson notes |
| `PATCH /users/:id` | Admin | Change role or suspend (not yourself) |
| `PATCH /inquiries/:id` | Admin | Toggle new / reviewed |
| `GET /health` | Public | Health check |

`/bootstrap` returns only what the caller may see: visitors get published courses, categories and mentors. Students also get their own enrollments and notes. Instructors also get their own courses and the enrollments for them. Admins get everything.


## Roadmap ideas

- Replace the JSON file with MongoDB Atlas or Postgres
- Real payments and receipts
- Image uploads to Cloudinary or S3
- Email verification and password reset
- Protect lesson videos behind enrollment checks
- Automated API tests for the permission rules

---

## License

Apache-2.0
