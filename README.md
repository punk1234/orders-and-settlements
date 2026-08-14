# Orders & Settlements

| | |
|---|---|
| **Task** | Orders and Settlements |
| **Frontend (live)** | [orders-and-settlements-web.vercel.app](https://orders-and-settlements-web.vercel.app/) |
| **Backend (live)** | [orders-and-settlements-api.vercel.app](https://orders-and-settlements-api.vercel.app/) |
| **Backend API docs** | [orders-and-settlements-api.vercel.app/docs](https://orders-and-settlements-api.vercel.app/docs) |

GitHub repo URL is submitted separately via the application form, not listed here.

A small full-stack app for creating orders with line items, recording full/partial payments against them, and viewing a dashboard with derived order status and amounts due.

The UI is a left-sidebar layout (Dashboard, New order, a light/dark theme toggle, and the signed-in user) kept deliberately plain — no component library, just Tailwind utility classes and a text-only "OS" wordmark, so nothing distracts from the data.

**Stack:** NestJS + TypeScript + MongoDB (backend), Next.js + TypeScript + Tailwind (frontend), Zod schemas shared between both.

## Prerequisites

- Node.js ≥ 20
- Yarn (`corepack enable` will pick up the pinned version automatically — see `packageManager` in the root `package.json`)
- A MongoDB connection string (Atlas free tier works — see [Deployment](#deployment))

## Setup

```bash
git clone <this-repo>
cd orders-and-settlements
yarn install          # also builds packages/shared automatically (postinstall hook)

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# edit apps/api/.env: set MONGO_URI and JWT_SECRET at minimum

yarn dev:api           # NestJS on http://localhost:4000
yarn dev:web            # Next.js on http://localhost:3000, in a second terminal
```

Open `http://localhost:3000`, sign up, and you're in the dashboard. `http://localhost:4000/docs` has interactive Swagger API docs. `http://localhost:3000/status` and `http://localhost:4000/health` are simple connectivity checks.

### Running tests

```bash
yarn test:shared        # status-derivation + order-total logic
yarn test:api           # 78 tests: auth, orders, payments, refunds, audit log, CSV export, assistant
```

## API overview

Full interactive docs are served at **`/docs`** on the running API (Swagger UI via `@nestjs/swagger`) — locally that's `http://localhost:4000/docs`. Every endpoint has a real response **schema** (backed by `@ApiProperty()`-decorated DTO classes, not just an inline example blob), so the Schema tab in Swagger UI reflects the actual shape of what comes back, not just a sample. You can also try requests directly from the UI: log in via `POST /auth/login` first (it sets the auth cookie the browser will then send), or click "Authorize" and paste a `Bearer` token. Below is a quick-reference summary; `/docs` is the source of truth for exact request/response shapes and error cases.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | email + password → session cookie |
| POST | `/auth/login` | → session cookie |
| POST | `/auth/logout` | clears the cookie |
| GET | `/auth/me` | current user, used by the frontend to check session state |
| GET | `/orders?status=` | list, scoped to the caller, optional status filter |
| POST | `/orders` | create with line items; subtotal/total computed server-side |
| GET | `/orders/:id` | line items + full payment history + computed status |
| PATCH | `/orders/:id` | edit — rejected (409 `ORDER_LOCKED`) once any payment exists |
| DELETE | `/orders/:id` | same lock rule |
| POST | `/orders/:id/payments` | record a payment; atomically rejected (409 `OVERPAYMENT_REJECTED`, with the max allowed amount) if it would exceed the total |
| GET | `/orders/:id/payments` | payment history (also embedded in the order detail response) |
| POST | `/orders/:id/refunds` | *stretch feature* — record a refund; atomically rejected (409 `REFUND_EXCEEDS_PAID`, with the max refundable amount, or 409 `NO_PAYMENTS_TO_REFUND`) if it would take amount paid below 0 |
| GET | `/orders/:id/refunds` | refund history (also embedded in the order detail response) |
| GET | `/orders/:id/audit-log` | *stretch feature* — status-change history for one order, with timestamps |
| GET | `/orders/export?from=&to=` | *stretch feature* — download the caller's orders as CSV, optionally filtered to a due-date range |
| POST | `/assistant/query` | *optional stretch feature* — natural-language question over the caller's own orders |

Auth is a JWT in an httpOnly cookie, `sameSite: 'none'` + `secure: true` in production (the frontend and backend are different origins), `lax` locally. A `Bearer` token in the `Authorization` header also works, for convenience when testing the API directly.

Every error response has the same shape:

```json
{ "error": { "code": "OVERPAYMENT_REJECTED", "message": "Payment exceeds the amount due. Maximum allowed payment is 400.", "maxAmount": 400 } }
```

A couple of reliability details worth calling out explicitly:
- **Required env vars are validated at boot** (`MONGO_URI`, `JWT_SECRET`) — the app refuses to start with a clear error rather than failing confusingly deep in the stack the first time something tries to use a missing value.
- **The one third-party API call in the app** (Anthropic, for the assistant) retries transient failures (network errors, 429, 5xx) with backoff, and does not retry 4xx errors like a bad API key. Signup's check-then-insert also has a race (two identical emails arriving at once) closed by catching the database's own duplicate-key error, not just the initial existence check.

## Data model

Five collections: `User`, `Order` (embeds `lineItems`; `status` is never stored — see below), `Payment`, `Refund`, and `AuditLogEntry` — the latter three each reference their `Order` by `orderId` rather than embedding, so payment/refund/status history reads as its own append-only trail instead of growing an unbounded array on the order document.

Indexes, all deliberate rather than default — every one of these is a compound index whose leading field also covers "filter by that field alone," so there's no separate single-field index sitting alongside it just adding write/storage overhead:
- `User.email` — unique + indexed (enforces one account per email at the database level, not just in application code; also what makes the signup race-condition test meaningful).
- `Order: { userId: 1, dueDate: 1 }` — covers both real query patterns: "this user's orders" and "this user's orders by due date" (dashboard, CSV export's date-range filter).
- `Payment` / `Refund: { orderId: 1, date: 1 }` — covers "this order's payments/refunds in date order" (the order detail page's transaction history).
- `AuditLogEntry: { orderId: 1, occurredAt: 1 }` — covers the audit log endpoint's chronological read.

Ownership checks (`findOne({ _id, userId })`) don't need any of the above — `_id` is already unique, so that lookup goes straight through MongoDB's default `_id` index and the `userId` is just an equality check against the one document found, not a filter that benefits from indexing.

## Status derivation rules and edge cases

Status is **derived, never stored** — it's computed fresh from `amountPaid`, `total`, and the current time on every read, so it can never go stale. The assignment's status table has an inherent overlap (an order can be simultaneously "past due" and "partially paid"), so precedence is:

1. **`paid`** — `amountPaid >= total`. Highest precedence: a fully-settled order is never shown as overdue, even if it was paid after its due date.
2. **`overdue`** — past due date and not fully paid (this covers both zero and partial payments).
3. **`partially_paid`** — some payment recorded, not past due.
4. **`pending`** — no payments, not past due.

**Edge case:** an order that was overdue and later gets fully paid becomes `paid`, not `overdue` — confirmed by a dedicated test (`status.spec.ts`).

## Stretch goals implemented

All three optional stretch goals from the spec are implemented, alongside the LLM assistant.

**Refunds.** Modeled as their own `Refund` entity (not a negative `Payment`) — the spec explicitly allows either. A separate collection means `Payment`'s own invariants (amount always ≥ 0.01, the overpayment guard's arithmetic) never have to account for negative values, and refund history reads as its own auditable trail rather than an overloaded payment record. `amountPaid` on the order stays a single net figure (payments minus refunds); status derivation (`deriveOrderStatus`) didn't need any changes, since it already just compares `amountPaid` to `total`. The atomic guard mirrors the overpayment guard exactly, just inverted: a refund can never take `amountPaid` below 0, enforced the same way (a single-document `findOneAndUpdate` with an `$expr` guard, wrapped in a transaction with the `Refund` insert), with the same "one wins, one gets a clear 409 with the max refundable amount" behavior under concurrent requests. **Known gap:** the existing "orders become read-only after the first payment" rule keys off `amountPaid === 0`. A fully-refunded order (net `amountPaid` back to 0) becomes editable again under that rule, even though it has real payment/refund history — arguably not ideal, but fixing it would mean tracking "has this order ever had a payment" separately from the live balance, which felt like scope creep for this exercise. Flagged here rather than silently left as a surprise.

**Audit log.** Every payment and refund logs a `{ fromStatus, toStatus, trigger, occurredAt }` entry (`GET /orders/:id/audit-log`), computed arithmetically from the before/after `amountPaid` rather than an extra read, so it costs nothing extra and lands in the same transaction as the payment/refund it's explaining. Order creation logs the initial `pending` (or occasionally `overdue`, if created with a past due date) status the same way. The one case this can't cover directly: an order can also become `overdue` with **no write at all** — pure time passing. There's no event to hang a log entry off of for that. The pragmatic fix here: the order-detail read path (`GET /orders/:id`) compares the freshly-derived status against the last logged entry and backfills a transition (`trigger: 'observed'`) if they've drifted. That means an `observed` entry's timestamp is "first noticed", not the literal instant the due date passed — documented via the `trigger` field so it's never presented as more precise than it is. This only runs on the single-order read path, not the orders list, so a busy dashboard doesn't turn into a write on every poll.

**Export.** `GET /orders/export` streams CSV (`Content-Disposition: attachment`), filtered by an optional `from`/`to` due-date range (both optional; omit either for an open-ended range). **Assumption worth naming:** "date range" could reasonably mean due date or created date — I went with due date since it's the field already surfaced everywhere else in the UI (dashboard, orders table); `createdAt` would suit a "what happened this month" accounting export instead. Implemented as a small hand-rolled CSV writer (proper quoting/escaping per RFC 4180) rather than pulling in a dependency for something this size.

## Assumptions and tradeoffs

- **Orders become read-only after the first payment.** Editing (customer, due date, or line items — which would change the total) is blocked with 409 `ORDER_LOCKED` once `amountPaid > 0`. Rationale: once money has moved against a specific total, silently changing that total would make the payment history inconsistent with the order it's meant to settle. Deleting an order follows the same rule.
- **Overpayment safety** uses an atomic single-document conditional update (`findOneAndUpdate` with `$expr` guarding `amountPaid + amount <= total`) wrapped in a Mongo transaction with the payment insert. The atomicity of the conditional update — not the transaction — is what actually prevents two concurrent payment requests from jointly exceeding the total; the transaction just guarantees the payment record and the order's running total never drift apart. There's a test that fires two real concurrent (`Promise.all`) $700 payments against a $1,000 order and asserts exactly one succeeds — but to be precise about what that proves: it validates the service's contract under interleaving, using a mock built to mirror MongoDB's atomic single-document semantics. The actual atomicity guarantee comes from MongoDB itself; proving that end-to-end would need an integration test against a real (or in-memory) replica set, which isn't set up here.
- **Line item quantity is restricted to integers** (`z.number().int()`), stricter than the spec's plain "Number (≥ 1)". Assumption: order line items are discrete units (not fractional quantities like hours or weight) — reasonable for the assignment's examples, but worth relaxing if the real use case needs fractional quantities.
- **Unit price allows 0** (`z.number().min(0)`). The spec doesn't state a minimum for unit price (unlike quantity, which explicitly says "≥ 1"), so this is a deliberate choice, not an oversight: a $0 line item is a legitimate real-world case (e.g. a free item or promotional line) rather than something to reject.
- **Currency math** is 2-decimal doubles with a small epsilon (0.005) tolerance in the overpayment guard to absorb floating-point drift. Documented as a known limitation — production would use integer minor-unit (cents) arithmetic instead.
- **Signup reveals whether an email is already registered** (409 `EMAIL_IN_USE`) — standard practice and matches most consumer signup flows, but it is a minor account-enumeration tradeoff worth naming explicitly. (By contrast, order lookups deliberately return a uniform 404 for both "doesn't exist" and "not yours", specifically to avoid this kind of leak where it matters more.)
- **No IP allowlisting** on the database — both Vercel Functions and AWS App Runner use dynamic egress ranges, so Atlas network access is set to allow-from-anywhere with a strong generated credential instead.
- **Single currency, no multi-currency handling.**
- **The LLM assistant** (`/assistant/query`) is explicitly optional: it's isolated in its own module, fails gracefully with a clear 503 if `ANTHROPIC_API_KEY` isn't set, and can't touch anything outside the two read-only, user-scoped tools it's given. It was added specifically to speak to the JD's "LLM and agent tooling" must-have, not because the assignment required it.
- **Backend hosting ended up on Vercel, not AWS.** The Dockerfile (AWS App Runner-ready: multi-stage build, health check endpoint, CloudWatch-friendly logging) is still in the repo and still builds correctly — kept as evidence of container/AWS deployment readiness even though the live URL runs on Vercel's zero-config NestJS support instead.

## What I'd improve before production

- Integer cents instead of floating-point currency amounts.
- **Idempotency keys on `POST /orders/:id/payments`.** A client-side retry after a timed-out request (flaky network, not a double-click — the frontend already disables the submit button while in flight) could currently create a duplicate payment if the retry lands before the first request's response. The standard fix is an `Idempotency-Key` header the client generates once per submission, stored against the resulting payment so a repeat with the same key returns the original result instead of creating a second one.
- JWT revocation on logout — right now `/auth/logout` only clears the client's cookie; a stolen token would stay valid until it naturally expires (7 days). A Redis-backed denylist of logged-out token ids would close this.
- A scheduled job (e.g. Vercel Cron) that proactively sweeps all orders for due-date-driven overdue transitions, instead of the audit log's current read-triggered backfill — would make "observed" entries' timestamps exact instead of "first noticed," at the cost of real infra to stand up. Documented as a deliberate tradeoff in the stretch-goals section above, not an oversight.
- Idempotency keys on `POST /orders/:id/refunds` too, for the same reason as payments below.
- Pagination on `GET /orders` — fine at take-home scale, would need it for a real customer with thousands of orders.
- Frontend unit/component tests (Vitest + React Testing Library) — CI (see below) covers `apps/api`'s Jest suite and `apps/web`'s lint/type-check/build, but there's no frontend test runner set up yet to exercise things like the order detail page's payment/refund refetch behavior or the orders list's client-side filtering.
- Structured request logging and error monitoring (e.g. Sentry) in production — currently just Nest's default logger.
- A real integration test (`mongodb-memory-server` or similar) proving the overpayment guard's atomicity against an actual MongoDB replica set, not just a mock built to mirror its semantics — see the concurrency note above.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request, as three parallel jobs (each does its own `yarn install --frozen-lockfile` from the repo root, same as local/Docker/Vercel):

- **shared** — builds `packages/shared` and runs its Jest suite.
- **api** — builds `apps/api` (which rebuilds `packages/shared` first, same as production) and runs its Jest suite (mocked services, no real MongoDB connection needed).
- **web** — lints `apps/web` and runs `next build`, which also type-checks the whole app.

## Deployment

Both apps deploy from this monorepo as two separate Vercel projects, backed by a shared MongoDB Atlas cluster.

**Note on `packages/shared`:** each app's own `build` script (`yarn workspace @orders/shared build && nest build` / `... && next build`) explicitly rebuilds the shared package before building itself, rather than relying solely on the root `postinstall` hook. Reason: when a Vercel project's Root Directory is set to `apps/api` or `apps/web`, its install/build step isn't guaranteed to run from — or trigger a hook defined in — the monorepo root, so a stale or missing `packages/shared/dist` (gitignored, since it's build output) would otherwise surface as confusing "module has no exported member" TypeScript errors that don't reproduce locally once `yarn install` has run once at the root.

**Docker (optional, AWS App Runner path):** `apps/api/Dockerfile` needs the monorepo root as its build context — not `apps/api` — because it `COPY`s `packages/shared` into the image so yarn workspaces can resolve `@orders/shared`. That's also why `.dockerignore` lives at the repo root rather than inside `apps/api`: Docker only reads a `.dockerignore` from the build context root, and here the context root is the repo root. Build it with:

```bash
docker build -f apps/api/Dockerfile -t orders-api .
```

run from the repo root (the trailing `.` is the context).

### 1. MongoDB Atlas

1. Create a free M0 cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas) (permanently free, real replica set — required for the payment transaction).
2. Database Access → add a user with a strong generated password.
3. Network Access → allow access from anywhere (`0.0.0.0/0`) — neither Vercel nor AWS App Runner have a fixed egress IP to allowlist instead.
4. Copy the connection string for `MONGO_URI`.

### 2. Backend (`apps/api`) on Vercel

1. New Vercel project → import this repo → **Root Directory: `apps/api`**.
2. Project Settings → General → enable **"Include files outside the Root Directory in the Build Step"** (needed so the build can see `packages/shared`).
3. Environment variables: `MONGO_URI`, `JWT_SECRET` (long random string), `FRONTEND_ORIGIN` (the web project's URL — can be added after step 3 deploys), `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` (optional, for the assistant).
4. Deploy. Vercel auto-detects `src/main.ts` as the NestJS entrypoint (zero-config).

### 3. Frontend (`apps/web`) on Vercel

1. New Vercel project → same repo → **Root Directory: `apps/web`**, same "include outside root directory" toggle.
2. Environment variable: `NEXT_PUBLIC_API_URL` = the backend project's URL from step 2.
3. Deploy, then go back to the backend project and set `FRONTEND_ORIGIN` to this URL (for CORS).

### 4. Smoke test

Run the assignment's exact sample scenario against the **live URL**:

1. Create an order: 2 × $500 = $1,000, due in 7 days.
2. Record a $400 payment → `partially_paid`, amount due $600.
3. Record a $600 payment → `paid`, amount due $0.
4. Attempt a $1 payment → rejected with a clear error.
