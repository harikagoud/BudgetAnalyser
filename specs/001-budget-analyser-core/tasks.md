---
description: "Task list for Budget Analyser Core"
---

# Tasks: Budget Analyser Core

**Input**: Design documents from `/specs/001-budget-analyser-core/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included and REQUIRED for all financial-math modules (categorization,
aggregation, recommendations, investment allocation) per Constitution
Principle II (Test-First, NON-NEGOTIABLE) — these must be written and must
fail before their implementation task.

**Organization**: Tasks are grouped by user story (P1–P5 from spec.md) so each
story is independently implementable, testable, and demoable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency)
- **[Story]**: US1–US5, mapping to spec.md priorities
- File paths are exact, from plan.md's project structure

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create project directory structure per plan.md (`app/`, `lib/`, `components/`, `prisma/`, `tests/unit/`, `tests/integration/`, `tests/fixtures/`)
- [x] T002 Initialize TypeScript Next.js 14 (App Router) project in repo root with dependencies: `next`, `react`, `typescript`, `prisma`/`@prisma/client`, `zod`, `pino`, `csv-parse`, `ofx-js`, `plaid`, `react-plaid-link`, `tailwindcss`, dev deps `vitest`, `@types/node`
- [x] T003 [P] Configure ESLint + Prettier for the project
- [x] T004 [P] Configure Tailwind CSS and install shadcn/ui CLI scaffolding
- [x] T005 Create `.env.example` with `DATABASE_URL="file:./dev.db"`, `ENCRYPTION_KEY=`, `ENABLE_PLAID=false`, `PLAID_CLIENT_ID=`, `PLAID_SECRET=`, `PLAID_ENV=sandbox`

**Checkpoint**: Project scaffolds and installs cleanly; `npm run dev` serves an empty Next.js app on `127.0.0.1:3000`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work may begin until this phase is complete.

- [x] T006 Define Prisma schema in `prisma/schema.prisma` with `Account`, `Transaction`, `Category`, `MerchantRule`, `UserSetting`, `ImportBatch` models exactly per `data-model.md` field tables, including: `Account.type` enum `MANUAL|PLAID`, `Account.accessTokenEncrypted` nullable string, `Transaction.dedupeKey` with a **unique index** (hash of date+amount+accountId+merchantNormalized), `Transaction.categorySource` enum `RULE|USER_OVERRIDE|DEFAULT`, `Category.isDiscretionary` boolean, `MerchantRule.source` enum `SEED|USER`
- [x] T007 Run initial migration: `npx prisma migrate dev --name init` (depends on T006)
- [x] T008 Create `prisma/seed.ts` seeding default Categories exactly as listed in data-model.md: Subscriptions (discretionary=true), Groceries (false), Dining (true), Car Insurance (false), Home/EMI (false), Vacations/Travel (true), Utilities (false), Uncategorized (false); and SEED `MerchantRule` rows mapping common merchants (e.g. "COSTCO", "WAL-MART", "WALMART") to Groceries
- [x] T009 [P] Implement Prisma client singleton in `lib/db/client.ts`
- [x] T010 [P] Implement structured logger in `lib/logger.ts` using `pino` with `redact` paths for `*.accessToken`, `*.account.number`, `*.rawDescription` per Constitution Principle VI
- [x] T011 [P] Implement AES-256-GCM encryption helpers (`encrypt`, `decrypt`) in `lib/security/encryption.ts`, reading the 32-byte key from `ENCRYPTION_KEY` env var, throwing a clear startup error if the key is missing or the wrong length
- [x] T012 Create root layout and global Tailwind styles: `app/layout.tsx`, `app/globals.css`
- [x] T013 [P] Scaffold base UI primitives (`button`, `card`, `select`, `dialog`) under `components/ui/` via shadcn/ui

**Checkpoint**: Database, logging, encryption, and base UI shell are ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Import statements and see categorized monthly spend (Priority: P1) 🎯 MVP

**Goal**: Upload a CSV/OFX statement and see correctly categorized monthly spend per category.

**Independent Test**: Upload `tests/fixtures/sample-statement.csv` (~50 transactions across 8 categories); dashboard per-category totals match a hand-calculated sum; ≥90% of rows are not "Uncategorized".

### Tests for User Story 1 (write first, confirm they FAIL before implementing) ⚠️

- [x] T014 [P] [US1] Unit test categorization engine in `tests/unit/categorization.test.ts`: `"COSTCO WHSE #123"` and `"WAL-MART #456"` → Groceries via SEED rules; an unmatched merchant → Uncategorized; after a USER override is recorded for a merchant, future lookups for that merchant return the USER category even when a SEED rule would otherwise match
- [x] T015 [P] [US1] Unit test monthly aggregation in `tests/unit/aggregation.test.ts`: per-category sums equal the known sum of fixture transactions for that category/month; a month whose earliest transaction is mid-month is flagged `isPartialMonth=true`
- [x] T016 [P] [US1] Integration test in `tests/integration/import-flow.test.ts`: posting `tests/fixtures/sample-statement.csv` to the import pipeline results in a persisted `ImportBatch` with `transactionCount` matching the file's row count and `errorCount=0`

### Implementation for User Story 1

- [x] T017 [P] [US1] Create `tests/fixtures/sample-statement.csv` — ~50 rows spanning all 8 default categories, including recognizable merchants ("COSTCO WHSE", "WAL-MART"), at least one unrecognizable merchant, and one duplicate row pair for dedupe testing
- [x] T018 [P] [US1] Implement CSV parser in `lib/parsers/csv.ts` using `csv-parse`: returns `{ date, merchantRaw, amount }[]`; throws a typed `PARSE_ERROR`/`EMPTY_FILE` on invalid/empty input
- [x] T019 [P] [US1] Implement OFX parser in `lib/parsers/ofx.ts` using `ofx-js` (best-effort), same return shape as T018
- [x] T020 [US1] Implement default SEED merchant rules in `lib/categorization/rules.ts` covering all 8 default categories with representative keyword patterns
- [x] T021 [US1] Implement categorization engine in `lib/categorization/engine.ts`: `categorize(merchantNormalized)` checks `USER` `MerchantRule` rows first, then `SEED` rules, else returns Uncategorized; `upsertUserRule(merchantNormalized, categoryId)` for manual overrides (depends on T009, T020)
- [x] T022 [US1] Implement monthly aggregation in `lib/aggregation/monthly-summary.ts`: `computeMonthlySummary(accountId?, months)` returning per-category totals, `transactionCount`, `isPartialMonth` (depends on T009)
- [x] T023 [US1] Implement dedupe-key generation (hash of date+amount+accountId+merchantNormalized) shared by import and Plaid sync, enforcing FR-013 at the application layer in addition to the DB unique constraint (T006)
- [x] T024 [US1] Implement `POST /api/import` in `app/api/import/route.ts`: parse (T018/T019) → dedupe check (T023) → categorize (T021) → persist `Transaction`+`ImportBatch` atomically (no partial writes on failure) → respond per `contracts/api.md` including `UNRECOGNIZED_FORMAT`/`EMPTY_FILE`/`PARSE_ERROR` error codes
- [x] T025 [US1] Implement `GET /api/transactions` in `app/api/transactions/route.ts` filtered by `month`/`accountId` query params
- [x] T026 [US1] Implement `PATCH /api/transactions/[id]` in `app/api/transactions/[id]/route.ts`: reassigns category and calls `upsertUserRule` (T021), responds with `ruleUpdated: true`
- [x] T027 [US1] Implement `GET /api/summary` in `app/api/summary/route.ts` using T022, returning `insufficientHistory: true` with empty `categories` when fewer than 2 months of data exist
- [x] T028 [P] [US1] Build `UploadForm` component in `components/dashboard/UploadForm.tsx`
- [x] T029 [P] [US1] Build `CategoryCard` and `CategoryBarChart` components in `components/dashboard/CategoryCard.tsx`, `components/charts/CategoryBarChart.tsx`
- [x] T030 [US1] Build accounts page `app/(dashboard)/accounts/page.tsx` wiring `UploadForm` to `POST /api/import`
- [x] T031 [US1] Build dashboard page `app/(dashboard)/page.tsx` wiring `GET /api/summary` to `CategoryCard`/`CategoryBarChart`, with inline manual-recategorize control calling `PATCH /api/transactions/[id]`
- [x] T032 [US1] Add Zod request/response validation and error handling across all US1 routes
- [x] T033 [US1] Add redacted structured logging (via `lib/logger.ts`) for import and categorization operations

**Checkpoint**: User Story 1 fully functional and independently testable (quickstart.md Scenario 1).

---

## Phase 4: User Story 2 - Compare spend against prior months (Priority: P2)

**Goal**: With ≥2 months of data, show per-category month-over-month deltas with increases flagged.

**Independent Test**: Load two months of fixture data with a known 40% Dining increase; trend view shows that category flagged with the correct delta.

### Tests for User Story 2

- [x] T034 [P] [US2] Unit test trend-delta calculation in `tests/unit/aggregation.test.ts` (extend): `momDeltaAmount`/`momDeltaPercent` computed correctly across two known months; a category increase above the configured threshold sets `flaggedIncrease=true`; fewer than 2 months yields `insufficientHistory=true`

### Implementation for User Story 2

- [x] T035 [US2] Extend `lib/aggregation/monthly-summary.ts` with month-over-month delta calculation and a configurable increase threshold (depends on T022)
- [x] T036 [US2] Extend `GET /api/summary` (`app/api/summary/route.ts`) to include `byMonth`, `momDeltaAmount`, `momDeltaPercent`, `flaggedIncrease` per `contracts/api.md` (depends on T035)
- [x] T037 [P] [US2] Build `TrendLineChart` component in `components/charts/TrendLineChart.tsx`
- [x] T038 [US2] Build trends page `app/(dashboard)/trends/page.tsx` wiring `GET /api/summary?months=6`
- [x] T039 [P] [US2] Create `tests/fixtures/sample-statement-month2.csv` with a known ~40% increase in Dining spend vs. the first fixture month

**Checkpoint**: User Stories 1 and 2 both work independently (quickstart.md Scenario 2).

---

## Phase 5: User Story 3 - Get cost-cutting recommendations with estimated savings (Priority: P3)

**Goal**: Surface specific, actionable recommendations with estimated monthly/annual savings.

**Independent Test**: With a clearly discretionary, above-average recurring category, the recommendations view shows a non-zero estimated saving and `projectedAnnualSavings = totalMonthlySavings × 12`.

### Tests for User Story 3

- [x] T040 [P] [US3] Unit test recommendation engine in `tests/unit/recommendations.test.ts`: discretionary category above threshold produces a recommendation with non-zero `estimatedMonthlySavings`; `totalMonthlySavings` equals the sum of all recommendations; `projectedAnnualSavings` equals `totalMonthlySavings * 12`; no discretionary overspend yields an empty list and `totalMonthlySavings=0`

### Implementation for User Story 3

- [x] T041 [US3] Implement recommendation engine in `lib/recommendations/engine.ts`: `generate(categorySummaries)` returns recommendations for discretionary (`Category.isDiscretionary=true`) categories flagged as above-trend, each with a `reason` string and `estimatedMonthlySavings` (depends on T035)
- [x] T042 [US3] Implement `GET /api/recommendations` in `app/api/recommendations/route.ts` per `contracts/api.md` (depends on T041)
- [x] T043 [P] [US3] Build recommendations page `app/(dashboard)/recommendations/page.tsx`
- [x] T044 [US3] Add empty-state UI ("No cuts currently recommended") when `recommendations=[]`

**Checkpoint**: User Stories 1–3 all work independently (quickstart.md Scenario 3).

---

## Phase 6: User Story 4 - View year-end educational investment allocation (Priority: P4)

**Goal**: Show the projected annual savings split across general investment buckets by risk tolerance, with a required disclaimer.

**Independent Test**: With a known projected annual saving and selected risk tier, bucket percentages sum to 100 and dollar amounts sum to the total; disclaimer is visible.

### Tests for User Story 4

- [x] T045 [P] [US4] Unit test risk-tier allocation in `tests/unit/investments.test.ts`: for all three tiers (Conservative 50/35/15, Moderate 25/45/30, Aggressive 10/40/50 — Emergency Fund/Retirement/Taxable Brokerage per data-model.md), percentages sum to exactly 100 and computed bucket amounts sum to the input `projectedAnnualSavings`

### Implementation for User Story 4

- [x] T046 [US4] Implement static risk-tier config and allocation calculator in `lib/investments/allocation.ts` exactly per the data-model.md RiskProfile table (depends on T045 failing first)
- [x] T047 [US4] Implement `GET /api/investments` in `app/api/investments/route.ts`, consuming `projectedAnnualSavings` (T042) and a `riskTolerance` query param, returning the `disclaimer` string from `contracts/api.md` (depends on T046)
- [x] T048 [P] [US4] Build `InvestmentDisclaimer` component in `components/disclaimers/InvestmentDisclaimer.tsx` with the exact educational-only disclaimer text (FR-010) — must render on every risk tier, no exceptions
- [x] T049 [P] [US4] Build `AllocationDonut` chart component in `components/charts/AllocationDonut.tsx`
- [x] T050 [US4] Build investments page `app/(dashboard)/investments/page.tsx` with a risk-tolerance selector (persisting the choice to `UserSetting.riskTolerance`), wiring `GET /api/investments` and always rendering `InvestmentDisclaimer`

**Checkpoint**: User Stories 1–4 all work independently — core MVP+ complete with zero external/live dependencies (quickstart.md Scenario 4).

---

## Phase 7: User Story 5 - Connect a card/bank account directly via Plaid sandbox (Priority: P5)

**Goal**: Optional, feature-flagged live account linking as an alternative to CSV upload, feeding the same pipeline.

**Independent Test**: With `ENABLE_PLAID=true` and a sandbox institution, linking an account surfaces sandbox transactions on the same dashboard as a CSV import, with no raw credentials ever stored.

### Tests for User Story 5

- [x] T051 [P] [US5] Unit test in `tests/unit/plaid-client.test.ts`: the Plaid client wrapper is a safe no-op (throws no error, returns a clear "disabled" result) when `ENABLE_PLAID=false`

### Implementation for User Story 5

- [x] T052 [US5] Implement Plaid client wrapper in `lib/plaid/client.ts` using the official `plaid` SDK, sandbox environment, gated entirely behind `ENABLE_PLAID`
- [x] T053 [US5] Implement `POST /api/plaid/link-token` in `app/api/plaid/link-token/route.ts`, returning 404 when `ENABLE_PLAID=false` per `contracts/api.md` (depends on T052)
- [x] T054 [US5] Implement `POST /api/plaid/exchange` in `app/api/plaid/exchange/route.ts`: exchanges `public_token` for `access_token`, encrypts it via `lib/security/encryption.ts` (T011) before persisting, creates an `Account(type=PLAID)` row, and **never** includes the token (plaintext or ciphertext) in the HTTP response (depends on T052, T011)
- [x] T055 [US5] Implement Plaid transaction sync in `lib/plaid/client.ts`: fetch sandbox transactions → categorize (T021) → dedupe (T023) → persist, update `Account.lastSyncedAt`
- [x] T056 [P] [US5] Build `ConnectAccountButton` component in `components/dashboard/ConnectAccountButton.tsx` using `react-plaid-link`, rendered only when the Plaid feature is enabled
- [x] T057 [US5] Wire `ConnectAccountButton` into the accounts page `app/(dashboard)/accounts/page.tsx`, hidden entirely when `ENABLE_PLAID=false`

**Checkpoint**: All five user stories independently functional (quickstart.md Scenario 5).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T058 [P] Run the full `quickstart.md` validation walkthrough (Scenarios 1–5) and record results
- [x] T059 [P] Run the `quickstart.md` Security Spot-Check — confirm no plaintext tokens/credentials in `dev.db` or `logs/*.log` (Constitution Principle I, Success Criterion SC-005)
- [x] T060 [P] Write `README.md` with setup/run instructions mirroring `quickstart.md`
- [x] T061 Review all financial-math modules (`lib/categorization`, `lib/aggregation`, `lib/recommendations`, `lib/investments`) for test coverage of edge cases from spec.md's Edge Cases section (duplicate transactions, refunds/negative amounts, partial months, out-of-year transactions)
- [x] T062 [P] Performance check: seed ~1,000 synthetic transactions and confirm dashboard load and categorization timing meet plan.md's Performance Goals (<2s dashboard, <5s categorization)
- [x] T063 Final structured-logging review across all `app/api/**/route.ts` files confirming no access tokens, account numbers, or raw unredacted descriptions are ever logged (Constitution Principle VI)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only — this is the MVP
- **User Story 2 (Phase 4)**: Depends on Foundational + US1's aggregation module (T022) — extends it, does not duplicate it
- **User Story 3 (Phase 5)**: Depends on US2's trend/delta output (T035)
- **User Story 4 (Phase 6)**: Depends on US3's `projectedAnnualSavings` (T042)
- **User Story 5 (Phase 7)**: Depends on Foundational + US1's categorization/dedupe modules (T021, T023) — independent of US2–US4
- **Polish (Phase 8)**: Depends on all implemented user stories

### Parallel Opportunities

- All `[P]` tasks within a phase touch different files and can run concurrently
- US5 (Plaid) can be developed in parallel with US2–US4 once Phase 3 (US1) is done, since it only depends on US1's categorization/dedupe, not on trends/recommendations/investments

---

## Parallel Example: User Story 1

```bash
# Tests (after writing, confirm they fail):
Task: "Unit test categorization engine in tests/unit/categorization.test.ts"
Task: "Unit test monthly aggregation in tests/unit/aggregation.test.ts"
Task: "Integration test import flow in tests/integration/import-flow.test.ts"

# Parsers and fixture (independent files):
Task: "Create tests/fixtures/sample-statement.csv"
Task: "Implement CSV parser in lib/parsers/csv.ts"
Task: "Implement OFX parser in lib/parsers/ofx.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. Complete Phase 3 (US1 — import, categorize, monthly dashboard)
3. **STOP and VALIDATE** against quickstart.md Scenario 1
4. Run locally, review with the user, before continuing

### Incremental Delivery

1. Foundation → US1 (MVP: import + categorized dashboard) → validate → review
2. + US2 (trend comparison) → validate → review
3. + US3 (cost-cutting recommendations) → validate → review
4. + US4 (investment allocation) → validate → review — **core product complete, no live external dependency used anywhere**
5. + US5 (Plaid sandbox linking, optional convenience layer) → validate → review

Each increment is run and manually verified on `localhost` (Constitution
Principle III) before moving to the next, and before anything is committed.
