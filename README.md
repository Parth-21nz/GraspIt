# GraspIt

**Practitioner-led technical and product courses, with student, instructor and administrator workspaces.**

A full-stack learning project for studying security, database consistency and customer-focused design. Checkout can be simulated; this is not a commercial payment service.

<img width="1329" height="606" alt="GraspIt landing page" src="https://github.com/user-attachments/assets/cfb7045c-22bc-47a6-9616-cf8d1a8c6f9d" />

## Features

- Public catalog and contact form; role-filtered course and lesson access.
- **My Learning** for every account: enrollment, progress, lesson notes and course completion certificates. Instructors/admins keep separate Teaching/Admin workspaces; use `#learning` for the learner view.
- Session-aware loaders for startup, login and enrollment, with cancellation of outdated data requests and retryable loading errors. Lesson progress and note actions show saving feedback.
- Instructor course builder with image upload, progress/retry, preview and visible save errors.
- Administrator course approval, user moderation and category management.
- Editable account profile with name, email, professional title, bio and a photo; open **Profile** in the navbar or use `#profile`.
- Revocable cookie sessions, sign-out everywhere, password changes/recovery, email verification and admin-approved teaching applications. Run `npm run mail:outbox` to read local demo email.
- Explicit demo seeding, independent mock-payment configuration, and a local administrator command.
- Validated API inputs, security headers/CSP, origin checks, request limits and throttling.
- Local or Cloudinary image storage, owned asset references, resumable cover migration and orphan cleanup.

## Stack

React 19, Vite 8, TypeScript, Tailwind 4, Express 4, PostgreSQL and Prisma 7. Image uploads use Busboy and Sharp. Authentication uses scrypt password hashes, opaque revocable cookie sessions, CSRF protection and single-use recovery/verification links. Mail is stored locally for this learning project.

Supported Node versions: 20.19+, 22.12+, or 24+. A PostgreSQL database is required. Neon is already suitable for this project; local PostgreSQL works too.

## Setup

```sh
npm ci
# Copy .env.example to .env and configure DATABASE_URL and AUTH_SECRET.
npm run db:deploy
npm run dev
```

Copy the environment file with `Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on Unix. Generate a secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The default URL is http://localhost:3000. Vite and the API share one server in development. Startup checks database connectivity but **does not insert or reset sample data**. Restart after changing environment variables.

To use the sample dataset, set `DEMO_MODE=true`, optionally set `PAYMENTS_MODE=mock`, and run:

```sh
npm run db:seed
```

The seed command is idempotent, but deliberately resets the known sample passwords/roles when explicitly invoked. Use only a disposable demo database. Demo accounts are denied when `DEMO_MODE=false`; turning demo mode on never enables mock payments automatically.

| Role | Email | Password |
| --- | --- | --- |
| Student | student@graspit.dev | password123 |
| Instructor | instructor@graspit.dev | password123 |
| Administrator | admin@graspit.dev | password123 |

To provision a separate administrator, set `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your local process environment, then run `npm run db:admin`. The password must contain at least 12 characters. The command creates a new account and never promotes or overwrites an existing one. Remove those environment variables afterwards. Public signup creates students. Choosing **Apply to teach** submits an application; administrators approve it after email verification. Category management belongs to administrators.

## Configuration

Keep secrets in ignored environment files or host secret settings. Never commit them or use a `VITE_` prefix for server secrets.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL runtime connection. The URL's `schema` parameter is honored by queries and explicit row locks. |
| `DIRECT_URL` | Optional direct connection for Prisma migrations; defaults to `DATABASE_URL`. |
| `AUTH_SECRET` | Stable random secret for session CSRF tokens, at least 32 characters outside development. Development generates an ephemeral secret only when unset. |
| `DEMO_MODE` | `true` permits sample-account access and displays demo credentials. Default `false`. |
| `PAYMENTS_MODE` | `disabled` (default) permits free enrollment only. `mock` explicitly simulates paid enrollment. `razorpay_test` fails startup until implemented. |
| `PUBLIC_ORIGIN` | Exact browser origin, default `http://localhost:3000`. Public production origins must use HTTPS. |
| `TRUST_PROXY` | Default `false`. Set only known proxy IPs/subnets when deploying; unrestricted `true` and numeric hop counts are rejected. |
| `SESSION_DAYS` | Absolute session lifetime, default 7 days, maximum 30. HTTPS uses Secure host-only cookies. HTTP is permitted only for localhost origins. |
| `MAIL_MODE` | `outbox` (default) saves local mail without sending it. Requires localhost `PUBLIC_ORIGIN`. `disabled` permits a public demo without recovery delivery. |
| `MAIL_OUTBOX_DIR` | Private mail directory, default `.data/mail-outbox`; must be a subdirectory of `.data`. Never publicly served. |
| `IMAGE_STORAGE` | `local` (default) or `cloudinary`. |
| `UPLOAD_DIR` | Local image directory, default `.data/uploads`. Keep it outside `public/`; only safe generated image filenames are served. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Required only for Cloudinary. Keys stay on the server. |
| `CLOUDINARY_FOLDER` | Cloudinary asset folder, default `graspit`. Keep it stable for cleanup. |
| `VIDEO_ORIGINS` | Explicit comma-separated origins permitted for author-supplied videos and by CSP. Defaults to YouTube/Vimeo. Add a trusted direct-media origin here before using it. |
| `PORT` | Server port, default `3000`. |
| `DATA_DIR` | Directory containing the old JSON file, default `.data`; used by import/parity commands. |

Production-style startup works on Windows and Unix:

```sh
npm run build
npm start
```

`npm start` applies pending committed migrations and starts the production entry point. It does not seed data. Local image files need persistent storage; use Cloudinary on a future host with an ephemeral filesystem.

## Image upload lifecycle

`POST /api/uploads` accepts exactly one multipart `file` from a signed-in instructor or administrator. Authentication precedes multipart parsing. Limits are 5 MB, 8192 pixels per side and 20 megapixels; JPEG/PNG/WebP only, with no animation or SVG. The server decodes, rotates, strips metadata, scales to at most 1920 pixels per side, and re-encodes WebP. MIME types and filenames are never sufficient proof of image content.

The response contains an asset id and URL. Course creation/editing accepts `thumbnailAssetId`; only the owner or an administrator may attach it. The URL must match the asset. Existing static `/images/...` fixtures remain supported. Arbitrary cover URLs and data-URI JSON payloads are rejected. JSON requests are limited to 100 KB everywhere; binary images have a separate bounded streaming path.

Unused assets have a 24-hour grace period. A bounded cleanup batch runs hourly while the server is running. For a manual batch, run:

```sh
npm run uploads:cleanup
```

Each batch examines at most 100 assets. Repeat to drain a larger backlog. Referenced assets are retained. Assets selected for deletion are locked/marked before storage deletion, so they cannot be attached during cleanup; failures remain retryable. Cleanup operates on the currently configured provider. When changing provider or folder, drain its old backlog with its original configuration first.

To migrate legacy base64 course covers:

```sh
npm run uploads:migrate -- --dry-run
npm run uploads:migrate
```

This is resumable: each course is changed only after successful storage and only if its original cover has not changed in the meantime. Failed covers remain intact. Interrupted or unused uploads are collected after the grace period. The legacy JSON backup is never rewritten.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Express plus Vite development server |
| `npm run build` | Production frontend build |
| `npm start` | Deploy committed migrations and serve the build |
| `npm run lint` | Type-check frontend, backend, scripts and tests |
| `npm run db:deploy` | Apply existing migrations |
| `npm run db:migrate` | Create/apply migrations on a development database |
| `npm run db:seed` | Explicit demo dataset and sample-account reset |
| `npm run db:admin` | Create the first non-demo administrator locally |
| `npm run db:import` | Import the old JSON dataset transactionally |
| `npm run db:verify-import` | Strict read-only parity check against the original demo JSON |
| `npm run db:backup-cleanup` | Back up retired column values before applying the cleanup migration |
| `npm run mail:outbox` | Read the latest 10 local verification/recovery messages; contains private single-use links |
| `npm run uploads:migrate` | Move legacy data-URI course covers to image storage |
| `npm run uploads:cleanup` | Delete old unreferenced assets with retry protection |
| `npm run verify:step2` | Original PostgreSQL/API regression suite; build first |
| `npm run verify:foundation` | Configuration, validation, image lifecycle and payment-mode tests |
| `npm run verify:dev` | Vite middleware, TSX/static delivery and development CSP smoke check |
| `npm run verify:cleanup` | Populated-schema upgrade, rollback guard and retained-field verification |
| `npm run verify:profile` | Profile permissions, email confirmation, avatar ownership and cleanup |
| `npm run verify:analytics` | Actual enrollment counts, unique learners and scoped instructor booking totals |
| `npm run verify:loading` | Outdated responses, logout cancellation, timeout recovery and retry races |
| `npm run verify:auth` | Cookie/CSRF security, revocation, reset races, verification, email changes and instructor approval |
| `npm test` | Run all database/API suites and the development smoke check sequentially |

```sh
npm run lint
npm run build
npm test
```

Tests create random `graspit_verify_*` schemas and local test files, then remove them in `finally` blocks. The database role needs schema-creation permission. Use a development database/branch; a forcibly killed process may require cleanup of its named schema. The Cloudinary adapter is tested at its SDK boundary; live uploads require real credentials and are not part of the default tests. GitHub Actions runs these checks with PostgreSQL 18, without external storage credentials.

For read-only migration/schema checks:

```sh
npx prisma migrate status
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

An empty diff exits with code 0; drift exits with code 2. Migration status alone does not detect schema drift. Use `migrate dev` only on a development database; do not accept a reset on a shared database as a verification step.

## Importing old JSON data

```sh
npm run db:deploy
npm run db:import
# Optional explicit source path:
npm run db:import -- path/to/graspit-db.json
```

The importer preserves the source file, hashes plaintext passwords, recognizes existing parents, skips conflicting emails with warnings, and aborts on an existing id assigned to a different identity. Existing curricula remain authoritative on reruns. Invalid progress and notes are reconciled against actual course lessons. Keep the source as a backup.

`db:verify-import` is a strict check for the original demo dataset. After intentional application edits, extra or changed records will fail parity without implying corruption. Existing pre-payment records are marked `legacy`; mock bookings are marked `mock` and displayed as sample value, never real revenue.

Use `node --import tsx scripts/verify-import.ts --allow-extra` to retain additional demo activity while checking every original record. This mode accepts additional records and the matching student-count/timestamp changes from additional enrollments; other source-field changes still fail the comparison. Direct Node invocation also avoids PowerShell/npm flag-forwarding differences.

For a database with edited profiles/progress or new certificate history, use `node --import tsx scripts/verify-import.ts --audit`. It checks source-record presence and reports changed field names without printing their values or claiming that an active database is identical to the old snapshot. Strict verification remains unchanged by this reporting mode.

## Project structure

```text
server.ts                 process startup, connectivity and shutdown
server/app.ts             injectable Express API factory
server/frontend.ts        Vite/static frontend integration
server/config.ts          validated environment configuration
server/validation.ts      route input schemas and allowlists
server/uploads.ts         image validation, assets, attachment and cleanup
server/storage.ts         local and Cloudinary storage adapters
server/imageMaintenance.ts resumable legacy cover migration
prisma/                   database schema and committed SQL migrations
scripts/                  admin, seed, import, cleanup and verification commands
src/                      React application and role workspaces
.github/workflows/ci.yml   reproducible build/database/API checks
```

The [implementation plan](docs/IMPLEMENTATION_PLAN.md) records the remaining milestones. [Foundation/image decisions](docs/FOUNDATION_UPLOADS.md) explain these changes. [Patch 2 verification](docs/STEP2_VERIFICATION.md) records the earlier database migration review.

The [database review](docs/DATABASE_REVIEW.md) lists the eight retired columns and optimization recommendations. [Session/recovery notes](docs/SESSIONS_RECOVERY.md) describe Milestone 3, its verification results and the local mail workflow. Email changes require the current password and confirmation of the new address; shared demo credentials stay fixed.

## License

Apache-2.0.
