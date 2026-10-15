# API Contracts: Budget Analyser Core

Internal API routes exposed by the Next.js app under `app/api/`. Consumed by
the app's own UI (no external/public API in scope for v1). All responses are
JSON. All endpoints run on the local server (`127.0.0.1`) only in dev.

## Authentication (all endpoints except `/api/auth/*`)

> **Scope change vs. the original spec**: v1 was specified as single-user and
> local-first with no login. Publishing to an app store requires multiple
> users, so accounts and sign-in were added. Every `Account` (and thus every
> `Transaction`/`ImportBatch`), `UserSetting`, and `USER` merchant rule now
> belongs to exactly one `User`. `Category` and `SEED` merchant rules remain
> global. Pre-login data (single anonymous user) is deleted by migration
> `20261014000000_add_users_and_ownership`.

Every `/api/*` route except `login`, `register`, `logout`, `verify-email`,
`resend-verification` and `health` requires a valid
session token, supplied either as the httpOnly `ba_token` cookie (web) or
`Authorization: Bearer <token>` (mobile app). Otherwise: **401**
`{ "error": "UNAUTHORIZED", "message": "Sign in required." }`.
`middleware.ts` verifies the token and injects the user id as the
`x-user-id` request header (any client-supplied `x-user-id` is discarded);
handlers re-check it (`getUserId`) as defense in depth. Resources owned by
another user are indistinguishable from missing ones (**404**), e.g.
`POST /api/import` with someone else's `accountId`, or
`PATCH /api/transactions/:id` on someone else's transaction.

Tokens are stateless HMAC-SHA256-signed `{uid, exp}` (7-day expiry, key =
`AUTH_SECRET`, 32+ bytes). They cannot be revoked before expiry; rotating
`AUTH_SECRET` signs everyone out. A missing/short `AUTH_SECRET` makes
protected routes fail closed with **500** `SERVER_MISCONFIGURED`.

### POST /api/auth/register
**Request**: `{ "email": "a@b.co", "password": "min 8, max 128 chars" }`
**201**: `{ "pendingVerification": true, "email": "a@b.co", "emailSent": true }` —
**no session is issued**; a verification link is emailed (`emailSent:false` if
the send failed; the account exists and the user can request a resend).
Registering again with an email that is still **unverified** replaces its
password and re-sends the link (prevents squatting someone else's address).
**400** `INVALID_BODY` · **409** `EMAIL_TAKEN` (case-insensitive, verified accounts only)

### POST /api/auth/verify-email *(public)*
**Request**: `{ "token": "<from the emailed link>", "password": "<the account's password>" }`.
**200** `{ "ok": true }` (idempotent) · **400** `INVALID_OR_EXPIRED_TOKEN` /
`INVALID_BODY` · **403** `INVALID_PASSWORD` · **429** after 10 failures per IP
per hour (in-memory, per process). Tokens last 24 h and are purpose-bound
(derived HMAC key): a session token is not a verification token and vice-versa.
The password is required so a squatter who registered someone else's address
with their own password can't get the real owner to activate it — the owner
doesn't know that password. The link is `APP_URL/verify-email?token=…`
(never built from request headers).

### POST /api/auth/resend-verification *(public)*
**Request**: `{ "email": "a@b.co" }`. Always **200** with the same body whether
or not the address exists/is already verified (no enumeration). **429** after
3 requests per email or 10 per IP per hour (in-memory, per process).

### POST /api/auth/login
**Request**: same shape. **200**: `{ "user": { "id", "email" }, "token": "..." }` +
`Set-Cookie: ba_token=...; HttpOnly; SameSite=Lax`.
**403** `EMAIL_NOT_VERIFIED` — correct password but the email link was never
clicked (no session issued; not counted as a throttle failure).
**401** `INVALID_CREDENTIALS` — identical for wrong password, unknown email
and malformed input (no user enumeration; unknown emails cost the same
hashing time). **429** `TOO_MANY_ATTEMPTS` after 5 failures per (IP, email)
in 15 minutes (in-memory, per server process).

### POST /api/auth/logout
Clears the cookie. **200** `{ "ok": true }`. Mobile clients discard their token.

### GET /api/auth/me
**200** `{ "user": { "id", "email" } }` or **401**.

### PUT /api/auth/password *(session required)*
**Request**: `{ "currentPassword": "...", "newPassword": "8-128 chars" }`
**200** `{ "ok": true }` · **400** `INVALID_BODY` · **403** `INVALID_PASSWORD`
(current password wrong; nothing changes). Tokens are stateless, so sessions
issued before the change remain valid until they expire or `AUTH_SECRET` is
rotated.

### DELETE /api/auth/account *(session required)*
**Request**: `{ "password": "..." }` (re-authentication).
**200** `{ "ok": true }` and the cookie is cleared. Permanently deletes the
user and all their accounts, transactions, import batches, settings and USER
rules in one DB transaction. **403** `INVALID_PASSWORD` deletes nothing.
Required for Google Play's account-deletion policy.

### Budgets *(session required)*
One monthly limit per category per user (the same amount applies to every month).
Limits are removed with the account.

- `GET /api/budgets?month=YYYY-MM` → `{ categories: [{categoryId,name}], month, limits: [{categoryId,name,amount}], statuses: [{categoryId,name,limit,spent,remaining,percent,level}], alerts }`.
  `month` defaults to the **latest month that has data** (statements are often
  imported after the fact). `spent` uses the dashboard's net-of-refunds totals.
  `level`: `ok` below 80 %, `warning` from 80 %, `over` once spent **reaches**
  the limit (compared in whole cents). `alerts` = the non-`ok` statuses, worst
  first. **400** `INVALID_MONTH`.
- `PUT /api/budgets` `{ categoryId, amount }` — amount > 0, ≤ 1,000,000, at most
  2 decimals. **200** `{ limits }` · **400** `INVALID_BODY` / `UNKNOWN_CATEGORY`.
- `DELETE /api/budgets?categoryId=…` — idempotent. **200** `{ limits }`.
- `POST /api/import` responses also carry `budgetAlerts: [{ month, alerts }]`
  for the months the import added transactions to (empty when no limit is
  near/over). Alerts are computed when data is loaded; nothing is pushed while
  the app is closed.
- `PATCH /api/transactions/:id` `{ categoryId }` now also returns `alsoUpdated`: how
  many of the caller's other (not manually set) transactions the newly learned
  merchant rule moved. The learned rule key is the cleaned merchant name without
  store numbers/city/state, so later imports of that merchant follow it.
- `POST /api/transactions/recategorize` — re-runs the current rules over the
  caller's own transactions, skipping `USER_OVERRIDE` rows. **200**
  `{ scanned, changed }`. Idempotent.
- Categories flagged `excludeFromSpending` (**Payments/Transfers**: card payments,
  transfers, paychecks) are left out of `GET /api/summary`, budgets and
  recommendations. `GET /api/summary` returns `assignableCategories` (all
  categories) for the recategorize dropdown. Import skips `$0.00` lines and says
  so in `notes`.
- `GET /api/summary` now also returns `partialMonths` (months whose data starts
  mid-month) and clamps `months` to 1–120.

### GET /api/health *(public)*
**200** `{ "status": "ok" }` when the database answers, else **503**
`{ "status": "unavailable" }`. For load balancers / uptime checks.

`POST /api/auth/register` is also throttled to 10 attempts per IP per hour
(**429** `TOO_MANY_ATTEMPTS`; in-memory, per process).

Passwords are hashed with scrypt (per-hash random salt) and never logged;
`lib/logger.ts` redacts `password`, `passwordHash`, `token`, `authorization`.

---

## POST /api/import

Upload and process a CSV/OFX statement (US1, FR-001, FR-002, FR-013).

**Request**: `multipart/form-data`
- `file`: the CSV/OFX file
- `accountId`: string (existing account) or `"new"` + `accountName`: string

**Response 200**:
```json
{
  "importBatchId": "clx...",
  "transactionCount": 48,
  "duplicateCount": 2,
  "errorCount": 0,
  "categories": { "Subscriptions": 3, "Groceries": 12, "Uncategorized": 1 }
}
```

**Response 413**: `{ "error": "FILE_TOO_LARGE" }` — files over 4 MB are rejected
before being read. **Response 400** `TOO_MANY_ROWS` — more than 20,000 rows
(limits live in `lib/import/limits.ts`). If a request that created a new
account (`accountId: "new"`) fails, that empty account is removed again.

**Response 404** `NOT_FOUND` when `accountId` is not one of the signed-in
user's accounts.

**Response 400**: `{ "error": "UNRECOGNIZED_FORMAT" | "EMPTY_FILE" | "PARSE_ERROR", "message": string }`
— satisfies spec Edge Case: corrupted/empty/unrecognized file must be
rejected with a clear error, no partial transactions created (atomic import).

---

## GET /api/transactions?month=YYYY-MM&accountId=...

List transactions, optionally filtered.

**Response 200**: `{ "transactions": Transaction[] }` where each item has
`id, date, amount, merchantRaw, category: { id, name }, categorySource`.

## PATCH /api/transactions/:id

Manually reassign a transaction's category (US1 scenario 3, FR-004).

**Request**: `{ "categoryId": "clx..." }`

**Response 200**: `{ "transaction": Transaction, "ruleUpdated": true }`
— `ruleUpdated` confirms a `USER` MerchantRule was upserted for this
merchant so future imports auto-categorize the same way.

---

## GET /api/summary?months=6

Monthly per-category totals and month-over-month deltas (US2, FR-005, FR-006).

**Response 200**:
```json
{
  "months": ["2026-05", "2026-06", "2026-07"],
  "categories": [
    {
      "categoryId": "clx...",
      "name": "Dining",
      "isDiscretionary": true,
      "byMonth": { "2026-05": 180.00, "2026-06": 210.00, "2026-07": 294.00 },
      "momDeltaAmount": 84.00,
      "momDeltaPercent": 40.0,
      "flaggedIncrease": true
    }
  ],
  "insufficientHistory": false
}
```
`insufficientHistory: true` when fewer than 2 months of data exist.

> **Implementation deviation (US1 MVP)**: `categories` is still populated
> with current-month totals even when `insufficientHistory: true` — only
> `momDeltaAmount`/`momDeltaPercent`/`flaggedIncrease` are omitted per
> category in that case. A literal empty `categories: []` would leave the
> dashboard blank after the very first import (quickstart.md Scenario 1),
> which only requires one month of data to show per-category totals;
> trend comparison (US2, requiring 2+ months) is the only thing actually
> gated by `insufficientHistory`. Edge Case intent (no misleading empty
> comparison) is preserved by omitting the delta fields, not the totals.

> **Implementation addition (dashboard month picker)**: each category also
> carries `countByMonth` (`{ "2026-08": 12, ... }`, same keys as `byMonth`) —
> the per-month transaction count — so the dashboard can show correct counts
> for whichever month the user selects. The dashboard requests `?months=60`
> so the picker reaches all imported history.

> **Delta suppression (US2)**: a category omits
> `momDeltaAmount`/`momDeltaPercent`/`flaggedIncrease` — even when 2+ months
> of data exist overall — in two cases: (1) the *immediately preceding*
> month is itself a partial month (its earliest transaction starts after
> the 1st, per `isPartialMonth` in `data-model.md`) — comparing a full
> month against a partial one would produce a misleading inflated delta; or
> (2) the preceding month falls outside the requested `?months=N` window —
> e.g. `months=1` always returns exactly one month with no delta fields at
> all, never a delta that cites a "previous month" absent from that same
> response's `months`/`byMonth`. `insufficientHistory` reflects this
> per-category check (true when the latest month's categories carry no
> delta at all), not a raw `months.length < 2` count. Consumers of
> `flaggedIncrease` (US3's recommendation engine) must treat it as
> optional/`undefined`, not assume it is always present once
> `insufficientHistory` is false at the response level — it is present
> per-category, not response-wide.

---

## GET /api/recommendations

Cost-cutting recommendations derived from the current summary (US3, FR-007, FR-008).
Accepts the same optional `?months=` query param as `GET /api/summary`.

**Response 200**:
```json
{
  "recommendations": [
    {
      "categoryId": "clx...",
      "categoryName": "Subscriptions",
      "reason": "Subscriptions is up 35% vs. last month — trimming back to last month's level saves $45.00/mo",
      "estimatedMonthlySavings": 45.00,
      "basisMonth": "2026-09"
    }
  ],
  "totalMonthlySavings": 45.00,
  "projectedAnnualSavings": 540.00
}
```
Empty `recommendations: []` with `totalMonthlySavings: 0` when no
discretionary overspend is detected (US3 scenario 3).

**Implementation deviation (US3)**: `reason` and `estimatedMonthlySavings` are
derived directly from the month-over-month delta/threshold mechanism built
for US2 (`computeMonthlySummaryWithDeltas`, `lib/aggregation/monthly-summary.ts`)
rather than a separate trailing 3-month-average calculation — a category
qualifies when it is discretionary AND already `flaggedIncrease` for its
latest month. `estimatedMonthlySavings` is that category's `momDeltaAmount`
(the amount spent above last month). The "35% above 3-month average" wording
in the original contract draft was illustrative example text, not a literal
computation requirement; no such trailing-average exists anywhere else in the
codebase. `basisMonth` (`YYYY-MM`) is the month these recommendations were
computed against — always the latest month in the requested window. Because
recommendations are derived from the same per-category delta fields as
`GET /api/summary`, the same window-consistency rule applies: if the
requested window leaves the latest month with no delta (e.g. `months=1`,
or a single-month history), `recommendations` is `[]` and totals are `0` —
this is also the simplest deterministic way to exercise the "no cuts
recommended" empty state.

---

## GET /api/investments?riskTolerance=moderate

Educational allocation breakdown for the projected annual savings (US4, FR-009, FR-010).

**Response 200**:
```json
{
  "projectedAnnualSavings": 540.00,
  "riskTolerance": "moderate",
  "buckets": [
    { "name": "Emergency Fund", "percent": 25, "amount": 135.00 },
    { "name": "Retirement Account", "percent": 45, "amount": 243.00 },
    { "name": "Taxable Brokerage", "percent": 30, "amount": 162.00 }
  ],
  "disclaimer": "This is a general, educational breakdown — not personalized financial, legal, or tax advice."
}
```
`buckets[].percent` always sums to 100; `buckets[].amount` always sums to
`projectedAnnualSavings` (Success Criterion SC-004) — the last bucket absorbs
any per-bucket rounding remainder rather than being independently rounded,
so this holds even when `projectedAnnualSavings` doesn't divide evenly.

An explicit but unrecognized `riskTolerance` query value returns **400**
(`{ "error": "INVALID_RISK_TOLERANCE", "message": "..." }`) rather than
silently falling back to a default. When `riskTolerance` is omitted
entirely, the persisted `UserSetting.riskTolerance` is used (default
`"moderate"` if never set), and is echoed back in the `riskTolerance` field
so the UI knows which tier to pre-select.

**Implementation addition (US4)**: `GET /api/investments` is read-only and
never persists — writing the user's risk-tolerance choice is a separate
endpoint, below.

---

## PUT /api/settings

Generic key/value write for `UserSetting` (data-model.md). Added for US4
(T050) to persist the risk-tolerance selector across visits; the shape is
deliberately generic rather than a one-off `/api/risk-tolerance` endpoint,
since `UserSetting` itself is a generic key/value table. Only `riskTolerance`
is a recognized key today.

**Request body**: `{ "key": "riskTolerance", "value": "aggressive" }`

**Response 200**: `{ "key": "riskTolerance", "value": "aggressive" }`

**Response 400** when `key` is unrecognized or `value` isn't a valid option
for that key (e.g. `value` not one of `conservative`/`moderate`/`aggressive`):
`{ "error": "UNKNOWN_SETTING" | "INVALID_VALUE" | "INVALID_BODY", "message": "..." }`

---

## POST /api/plaid/link-token *(only when `ENABLE_PLAID=true`)*

Create a Plaid Link token to start the sandbox connect flow (US5, FR-011).

**Response 200**: `{ "linkToken": "link-sandbox-..." }`

**Response 404** when `ENABLE_PLAID=false`: feature is not available —
UI must hide the "Connect an account" entry point in this mode (US5 scenario 3).

**Response 502**: `{ "error": "PLAID_ERROR", "message": "..." }` when the
Plaid Link token creation call itself fails.

## POST /api/plaid/exchange *(only when `ENABLE_PLAID=true`)*

Exchange a Plaid `public_token` for an `access_token`, encrypt it, and create
an Account record (US5, FR-011, FR-012).

**Request**: `{ "publicToken": "public-sandbox-...", "accountName": "Chase Checking", "institutionName": "Chase" }`

**Response 200**: `{ "accountId": "clx...", "institutionName": "Chase" }`
— response body never includes the access token, encrypted or otherwise.

**Implementation addition (US5)**: `institutionName` is an addition to the
request body beyond the original draft's `{publicToken, accountName}`.
`react-plaid-link`'s `onSuccess(publicToken, metadata)` callback already
receives `metadata.institution.name` client-side for free; the route trusts
and stores it as-is rather than re-deriving it server-side via an extra
`itemGet` + `institutionsGetById` round-trip, which would be pure overhead
for a sandbox-only, single-user app (Constitution Principle IV). It is
optional and nullable — a `null` is stored as-is if Link's metadata omits it.

After creating the Account, the route calls `syncAccountTransactions`
(`lib/plaid/client.ts`, T055) once as a best-effort initial sync: a fetch
failure there is logged and reported via `SyncOutcome`, but never blocks or
fails Account creation — the account is linked either way, and the first
sync can be retried by any later sync the UI triggers (spec Edge Case:
sandbox errors must not wipe or block existing/new data).

**Response 404** when `ENABLE_PLAID=false`, same shape as `link-token` above.

**Response 400**: `{ "error": "INVALID_BODY", "message": "..." }` when
`publicToken` or `accountName` are missing/not strings.

**Response 502**: `{ "error": "PLAID_ERROR", "message": "..." }` when the
Plaid token exchange itself fails (sandbox unreachable, invalid public
token, etc.) — distinct from a 500, since this is an upstream failure, not
an application bug.

> **Known limitation (US5)**: no `cursor` is persisted per Account, so every
> sync (initial or repeat) re-fetches Plaid's full transaction history from
> a null cursor and relies on `dedupeKey` (`lib/dedupe.ts`, shared with
> CSV/OFX import) to recognize already-persisted rows. This also means a
> transaction manually imported via CSV and later also reported by a
> Plaid-linked account for the same real-world purchase will NOT collapse
> into one row — `dedupeKey` includes `accountId`, so cross-source dedupe
> across a manual and a Plaid account is out of scope for this phase.

> **Implementation addition (US5) — repeated syncs**: there is no dedicated
> re-sync API route or UI button (`plan.md`'s file tree has neither,
> Constitution Principle IV). Acceptance Scenario 2 ("new sandbox
> transactions... pulled in... without duplicate entries on repeated
> syncs") is instead satisfied by `GET /api/accounts` (called by the accounts
> page on every visit): when Plaid is enabled it re-syncs every `type=PLAID`
> Account **of the signed-in user** before listing. (This used to live in the
> accounts page as a Server Component; it moved into the route when the page
> became a client component for the static mobile build.) A sync failure is
> logged and never thrown, so the list still returns whatever was last
> persisted rather than going blank (sync-failure Edge Case).

---

## Error shape (all endpoints)

```json
{ "error": "ERROR_CODE", "message": "human-readable message" }
```
Error messages and all server logs for these routes MUST NOT include account
numbers, access tokens, or unredacted raw merchant descriptions beyond what
is already shown in the authenticated UI response (Constitution Principle VI).

---

## Linked accounts (Plaid) — added

- `GET /api/accounts` no longer calls Plaid. Items now include `lastSyncedAt`
  (ISO or `null`); the response includes `plaidEnv` (`sandbox`/`development`/
  `production`, or `null` when disabled).
- `POST /api/accounts/:id/sync` `{ force?: boolean }` — refresh one linked
  account. **200** `{ throttled, transactionCount }` (`throttled: true` when it
  was synced in the last 5 minutes and `force` is not set) · **404** not found /
  not yours / not linked, or Plaid disabled · **502** `SYNC_FAILED` (existing
  data untouched).
- `POST /api/accounts/:id/disconnect` — revoke the bank connection at Plaid,
  keep the imported transactions, turn the account into a normal imported
  account. **200** `{ disconnected: true }` · **404** · **502** `REVOKE_FAILED`
  (nothing changed; retry — also returned when Plaid is disabled on the server, so a
  live connection is never orphaned).
- `GET /api/cron/plaid-sync` — daily refresh of every linked account. Public to
  the session middleware but requires `Authorization: Bearer $CRON_SECRET`
  (**401** otherwise; fails closed when `CRON_SECRET` is unset or < 16 chars).
  Scheduled by `vercel.json` (once a day — the Hobby plan limit).
- Plaid rows are deduped by Plaid's `transaction_id`; pending rows are skipped
  until they post. Deleting the user account also revokes their Plaid items.
- `POST /api/plaid/link-token` sends `redirect_uri` when `PLAID_REDIRECT_URI` is
  set (OAuth banks); the web page `/plaid-oauth` finishes that flow.

---

## Deleting uploads and accounts — added

- `GET /api/imports` → `{ imports: [{ id, fileName, format, accountId, accountName, createdAt, transactionCount }] }`
  (newest first; `transactionCount` is the live number of rows this upload added).
- `DELETE /api/imports/:id` — removes the upload and the transactions it added (rows a later,
  overlapping upload skipped as duplicates belong to the earlier upload and go with it).
  **200** `{ deletedTransactions }` · **404** not found / not yours. Re-uploading the file restores the rows.
- `DELETE /api/accounts/:id` — deletes an uploaded account with its transactions and uploads.
  **200** `{ deletedTransactions }` · **404** · **409** `DISCONNECT_FIRST` for a linked (Plaid)
  account (use `POST /api/accounts/:id/disconnect` first).
