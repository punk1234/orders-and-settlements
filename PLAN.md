# Orders & Settlements — Implementation Plan

CrossVal take-home: Backend/Full Stack Developer. Target: demonstrate every JD must-have (Node/TS, MongoDB modeling, AWS deploy ownership, security instinct, third-party integration patterns, LLM/agent exposure) inside a correct, well-tested Orders & Settlements app.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | NestJS + TypeScript | Matches Nestcoin experience; modules/guards/DI read as production-grade structure to reviewers |
| Database | MongoDB Atlas (M0 free tier, replica set) | Required by JD; replica set needed for multi-document transactions |
| ODM | Mongoose | Schema validation, indexes, transactions |
| Auth | JWT (access token, httpOnly cookie) + bcrypt | Standard, secure, no third-party auth dependency to configure |
| Validation | Zod schemas in a shared package | Reused by NestJS pipes and by the Next.js frontend forms |
| Frontend | Next.js (App Router) + TypeScript + Tailwind | JD: "shared Next.js and TypeScript codebase"; bonus full-stack range |
| Backend hosting | Vercel (NestJS zero-config, Fluid compute) | Decision revisited after Batch 7: one platform for both apps, no cross-cloud CORS/cookie complexity. **Tradeoff:** drops the direct "hands-on AWS" demonstration from the JD's must-haves — partially offset by keeping the Dockerfile + App Runner-ready config in the repo as evidence of AWS deployment readiness, even though it isn't the live URL. |
| Frontend hosting | Vercel | Fast, zero-config Next.js hosting |
| Monorepo tool | Yarn Classic (1.x) workspaces | Zero extra tooling, fast to scaffold; pinned via `packageManager` so `corepack` resolves the same version everywhere |

Repo layout:
```
orders-and-settlements/
  apps/
    api/        # NestJS backend
    web/        # Next.js frontend
  packages/
    shared/     # Zod schemas + shared TS types (Order, LineItem, Payment, Status)
  README.md
  PLAN.md
```

## 2. Data model

**User**
- `_id`, `email` (unique, indexed), `passwordHash`, `createdAt`

**Order**
- `_id`, `userId` (indexed, ref User), `customer`, `dueDate`, `lineItems: [{ description, quantity, unitPrice }]`, `subtotal`, `total`, `amountPaid` (denormalized, updated transactionally), `createdAt`, `updatedAt`
- Indexes: `{ userId: 1, dueDate: 1 }`, `{ userId: 1 }` — supports dashboard filter/list queries
- `status` is **not stored** — it's a computed/virtual field (see §3), so it never goes stale when time passes.

**Payment**
- `_id`, `orderId` (indexed, ref Order), `userId`, `amount`, `date`, `note?`, `createdAt`
- Kept as its own collection (not embedded) so payment history and audit trail are first-class, and so the "amountPaid" aggregate can be verified independently of the denormalized field if needed.

## 3. Status derivation (documented assumption)

The spec's status table has an inherent overlap: "overdue" (past due, not fully paid) can co-occur with "partially_paid" (some payment, less than total). Since status must be a single value, I'm defining explicit precedence, to be stated plainly in the README:

1. `paid` — `amountPaid >= total` (highest precedence; a settled order is never "overdue")
2. `overdue` — `now > dueDate` and not fully paid (regardless of partial payments)
3. `partially_paid` — `amountPaid > 0`, not past due
4. `pending` — no payments, not past due

Edge case called out explicitly in README: an order that was overdue and is later fully paid becomes `paid`, not `overdue` — status is always computed fresh from current time + current payment sum, never cached as a fact about the past.

## 4. Concurrency / overpayment safety

Two safeguards, both documented in README even though full pessimistic locking isn't implemented:

1. **Atomic conditional update** on the Order document: `findOneAndUpdate({ _id, $expr: { $lte: [{ $add: ["$amountPaid", amount] }, "$total"] } }, { $inc: { amountPaid: amount } })`. This is a single-document atomic op — MongoDB guarantees only one of two concurrent requests can win if they'd jointly exceed the total.
2. **Multi-document transaction** wrapping the Order update + Payment insert, so a payment record is never created without the corresponding order update succeeding (and vice versa). Requires the Atlas replica set (default on Atlas, including free tier).

If the conditional update matches zero documents, the API returns 409 with the current amount due, per the spec's "clear, actionable error" requirement.

## 5. API design

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | email + password |
| POST | `/auth/login` | returns JWT (httpOnly cookie) |
| POST | `/auth/logout` | clears cookie |
| GET | `/orders?status=` | list, scoped to `req.user`, optional status filter |
| POST | `/orders` | create with line items; computes subtotal/total server-side (never trust client totals) |
| GET | `/orders/:id` | detail incl. line items + payment history + computed status |
| PATCH | `/orders/:id` | edit — **rejected (409) once any payment exists**; decision + rationale documented in README |
| DELETE | `/orders/:id` | only if no payments recorded |
| POST | `/orders/:id/payments` | record payment; atomic overpayment guard from §4 |
| GET | `/orders/:id/payments` | full history (also embedded in order detail response) |
| POST | `/assistant/query` *(stretch)* | NL question → scoped read-only answer over the caller's own orders |

Interactive API docs (Swagger UI, via `@nestjs/swagger`) are served at `/docs` on the running API.

Error shape (consistent across the API):
```json
{ "error": { "code": "OVERPAYMENT_REJECTED", "message": "Payment exceeds amount due.", "maxAmount": 600.00 } }
```

## 6. LLM/agent differentiator (stretch, clearly separated from core scope)

One endpoint, `POST /assistant/query`: takes a natural-language question (e.g. "which orders are overdue and over $500?"), uses tool-calling against a small fixed set of read-only Mongo query functions scoped to `req.user`, and returns a natural-language answer plus the underlying matched orders. Explicitly labeled in the README as an optional addition built to demonstrate agent-tooling exposure — not required by the spec, kept isolated so it can't jeopardize core grading criteria (correctness, business rules, API design).

## 7. Testing

Jest (no Supertest — services are tested directly against mocked Mongoose models rather than over HTTP), covering the spec's own sample scenario plus:
- Line item subtotal/total math
- Status transitions across all four states, including the overdue-then-paid edge case
- Overpayment rejection at the exact boundary, and a `Promise.all`-based interleaved-concurrency test that models MongoDB's single-document atomicity to prove the request that would overpay is the one rejected regardless of arrival order
- Signup's check-then-insert race (duplicate email arriving at the same instant) surfacing the same clean error as the non-race case, not a generic 500
- Auth/ownership isolation (a malformed or someone-else's order id returns 404, not 403 — deliberately, to avoid confirming an id's existence to a non-owner)

**Honest caveat:** none of this is a true multi-process concurrency test against a real database — that would need an integration test against a real (or in-memory) MongoDB replica set actually firing simultaneous requests. What's here proves the *service-level contract* is correct under interleaving; the actual atomicity guarantee is provided by MongoDB's single-document `findOneAndUpdate`, not by anything our test suite can exercise without a live database.

## 8. Deployment

Both apps deploy from the same monorepo as **two separate Vercel projects**. Neither app's own build script knows how to build `packages/shared` first, so a root-level `postinstall` hook (`node -e "...tsc -p packages/shared/tsconfig.json..."`) builds it automatically after every install, before either app's build step runs — this works the same way locally, in CI, and on Vercel, without per-app `vercel.json` overrides.

1. **MongoDB Atlas** M0 cluster (free, permanent, real replica set — required for the payment transaction). Network access set to allow-from-anywhere with a strong generated password, since neither Vercel Functions nor App Runner expose a fixed egress IP range to allowlist — documented as a tradeoff, not an oversight.
2. **Backend project** (`apps/api` as Root Directory): Vercel's zero-config NestJS support detects `src/main.ts` and deploys it as a single Vercel Function. Enable "Include files outside the Root Directory in the Build Step" in project settings so `packages/shared` is visible during the build. Env vars: `MONGO_URI`, `JWT_SECRET`, `FRONTEND_ORIGIN` (the web project's URL), `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` (optional).
3. **Frontend project** (`apps/web` as Root Directory): same "include outside root directory" toggle. Env var: `NEXT_PUBLIC_API_URL` pointing at the backend project's URL.
4. The two projects live on different `vercel.app` subdomains, so the cross-site cookie settings from §… (`sameSite: 'none'`, `secure: true` in production) are still required even though everything's on one platform — this isn't the same as same-origin deployment.
5. The Dockerfile (AWS App Runner-ready) stays in the repo and still builds/runs correctly — kept as evidence of container/AWS deployment readiness even though it isn't what's live.
6. Smoke test: run the spec's exact sample scenario (create $1,000 order → $400 payment → $600 payment → rejected $1 payment) against the **live URL**, not just locally, before submitting.

## 9. Batches

Each batch is a reviewable, working checkpoint — deploy pipeline is stood up early (Batch 1) so there's never a late-stage "does it even deploy" surprise.

1. **Scaffolding & deploy skeleton** — monorepo, shared package, NestJS health-check endpoint, Next.js placeholder page, Dockerfile, Atlas cluster, first App Runner + Vercel deploy of "hello world."
2. **Auth** — signup/login/logout, bcrypt, JWT middleware/guards, ownership scoping pattern, tests.
3. **Orders CRUD** — line items, server-computed subtotal/total, validation (Zod), edit/delete rules, tests.
4. **Payments & status** — atomic overpayment guard, transaction, status derivation function, tests incl. the sample scenario and an interleaved-concurrency simulation (see §7's caveat on what that does and doesn't prove).
5. **Dashboard API** — list with status filter, order detail with payment history, consistent error responses.
6. **Frontend** — auth pages, order list + filter, order detail + payment form, create-order form.
7. **LLM/agent stretch feature** — `/assistant/query` endpoint + minimal UI entry point.
8. **Deployment hardening & README** — final AWS/Vercel config, CloudWatch check, README (setup, API overview, status rules, assumptions/tradeoffs, what I'd improve for production), live-URL smoke test against the sample scenario.
9. **Remaining stretch goals** — Refunds (`Refund` as its own entity, atomic guard mirroring the overpayment check inverted, wired into the same transaction as the payment guard), Audit log (write-triggered on order create/payment/refund, plus a read-triggered backfill on order detail for pure due-date-driven overdue transitions — see README's "Stretch goals implemented" section for the exact tradeoff), CSV export (`GET /orders/export`, optional due-date range, hand-rolled CSV writer). 24 new backend tests.

## 10. Assumptions to state in README (not yet decisions to revisit — just flagged)

- Orders become read-only after the first payment (Batch 3 decision, §5). Known gap since Batch 9: a fully-refunded order's `amountPaid` nets back to 0, which reopens this lock under the existing rule — see README.
- Status precedence order as defined in §3.
- Refunds are their own entity (Batch 9), not a negative payment — spec allows either; see README for the rationale.
- Single currency, no multi-currency handling.
