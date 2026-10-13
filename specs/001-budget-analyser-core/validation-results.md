# Phase 8 Validation Results

Run 2026-10-13 against a throwaway SQLite DB (`/tmp`, deleted after) so
`prisma/dev.db` was untouched. API-level walkthrough via `curl`; UI pages
were checked for HTTP 200 and exercised in the embedded browser during
US1–US4 verification.

## T058 — quickstart walkthrough

| Scenario | Result | Notes |
|----------|--------|-------|
| 1. Import & dashboard | PASS | 51 CSV rows → 50 imported, 1 dup skipped. Per-category sum 7587.05 == fixture deduped sum 7587.05. 48/50 (96%) categorized (≥90%). Recategorizing `QQQ MYSTERY VENDOR` → Dining created a USER rule; month-2 import auto-categorized the same merchant as Dining (`RULE`). |
| 2. Trends | PASS (see deviation) | Dining flagged increase, other categories 0%. |
| 3. Recommendations | PASS | Sum of items 36.70 == `totalMonthlySavings`; annual 440.40 == 36.70 × 12. |
| 4. Investments | PASS | All 3 tiers: percents sum 100, amounts sum 440.40 == projected annual savings, disclaimer present. |
| 5. Plaid sandbox | **SKIPPED** | No `PLAID_CLIENT_ID`/`PLAID_SECRET` in this environment. Real link-token, exchange, and `transactionsSync` are unverified. Offline coverage only: `tests/unit/plaid-client.test.ts`, `tests/integration/plaid-sync.test.ts`; `ENABLE_PLAID=false` → both routes 404, button absent (verified live). |

**Deviation (Scenario 2/1 interaction)**: the quickstart's "+40% Dining" only
reproduces if Scenario 1 step 4 (recategorizing the Uncategorized `QQQ`
row, $41, into Dining) is *not* done first. With it done, Sept Dining is
$168.70 vs Aug $132.00 → +27.8% (still flagged, ≥20%). Without it:
$127.70 vs $91.00 → +40.3%. Behavior is correct; quickstart wording should
say "run Scenario 2 before step 4 of Scenario 1" or expect ~28%.

## T059 — security spot-check

Quickstart commands drifted from reality: DB is `prisma/dev.db` (not
`./dev.db`), and there is no `logs/` directory (pino writes to stdout). Equivalent checks run:

- `prisma/dev.db`: 0 `PLAID` accounts exist, so there is nothing to
  inspect there (not a meaningful pass on its own).
- Throwaway DB: created a `PLAID` account via `encrypt()`; stored value is
  `iv:tag:ciphertext` base64, **not** the plaintext; plaintext marker found 0
  times in the DB file bytes; decrypt round-trip OK.
- Dev-server stdout log: 0 occurrences of token/`public-sandbox` strings.
- Not verified: the real Plaid exchange response shape (no credentials);
  the "response omits token" requirement (T054) is by code inspection only —
  the route returns `{accountId, institutionName}` literally — no automated test asserts it.

## T061 — edge-case coverage review

| Spec edge case | Coverage |
|----------------|----------|
| Bad/empty/corrupt file | Parser errors → 400 (pre-existing; atomic import) |
| Duplicates (same file twice) | **Added** `import-flow` re-upload test; in-file dup already covered |
| Duplicate CSV ↔ Plaid | Known limitation: `dedupeKey` includes `accountId`, so these do not collapse (documented in `contracts/api.md`) |
| Out-of-calendar-year | **Added** Dec→Jan boundary delta test; annual savings is monthly × 12, not calendar-year bound |
| Plaid sync failure | `plaid-sync` integration test (data preserved). Gap: no visible "sync failed" UI indicator — failure is logged only; no schema field to persist it |
| Refund / negative | **Added** unit (reduces total, can go negative) + import test |
| Partial month | Pre-existing unit tests + delta suppression |

All new tests passed against existing code (no bugs found).

## T062 — performance (throwaway DB, 2,100 transactions)

| Measure | Goal | Actual |
|---------|------|--------|
| Import + categorize 1,000 rows | <5s | 0.15s |
| Dashboard `/` (cold, incl. dev compile) | <2s | 1.27s (0.02s warm) |
| `/trends`, `/recommendations` | <2s | 0.41s / 0.38s cold |

Measured on `next dev`, not a production build.

## T063 — logging review

11 `logger.*` call sites across `app/`, `lib/`, `components/` (8 error, 1
warn, 2 info; Grep-verified). Every error site logs `(err as Error).message`
only; warn/info log ids, counts, category counts, and a reason code. No
`console.*` anywhere in `app/`, `lib/`, `components/`. No access tokens, public tokens, account numbers, or raw merchant
strings are logged; pino redact paths are a second layer, not the primary defense.
