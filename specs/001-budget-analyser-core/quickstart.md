# Quickstart: Budget Analyser Core

Validates the full user journey end-to-end on localhost, with no live
credentials required (Constitution Principle III).

## Prerequisites

- Node.js 20 LTS, npm
- No external accounts needed for the default path (CSV import + Plaid
  disabled)

## Setup

```bash
npm install
cp .env.example .env
# .env defaults: ENABLE_PLAID=false, DATABASE_URL="file:./dev.db",
# ENCRYPTION_KEY=<generate with: openssl rand -base64 32>
npx prisma migrate dev --name init
npm run db:seed        # seeds default Categories + MerchantRules
npm run dev            # starts on http://127.0.0.1:3000
```

## Validation Scenarios

### 1. Import & categorized dashboard (US1 / SC-001, SC-002)

1. Open `http://127.0.0.1:3000/accounts`.
2. Upload `tests/fixtures/sample-statement.csv` (a sample statement with
   ~50 transactions across all default categories, including recognizable
   merchants like "COSTCO WHSE", "WAL-MART", recurring subscription names).
3. Expected: redirected to the dashboard; per-category totals shown; sum of
   all categories equals the fixture's known total; ≥90% of rows are not
   "Uncategorized".
4. Manually recategorize the one "Uncategorized" row; re-upload a statement
   with the same merchant; expected: auto-categorized this time (FR-004).

### 2. Month-over-month trends (US2 / SC-003)

1. Seed or import a second month of fixture data with a known 40% increase
   in "Dining" (`tests/fixtures/sample-statement-month2.csv`).
2. Open `/trends`.
3. Expected: "Dining" row shows prior month, current month, and a flagged
   +40% delta; a category with <2 months of data (if any) shows an
   "insufficient history" state instead of a misleading number.

### 3. Cost-cutting recommendations (US3)

1. With the two months of data from Scenario 2, open `/recommendations`.
2. Expected: at least one recommendation referencing the flagged discretionary
   category, with a non-zero `estimatedMonthlySavings`; the page total equals
   the sum of listed recommendations, and `projectedAnnualSavings` = monthly
   total × 12.

### 4. Investment allocation (US4 / SC-004)

1. Open `/investments`.
2. Switch the risk-tolerance selector between Conservative / Moderate /
   Aggressive.
3. Expected: bucket percentages always sum to 100, bucket dollar amounts
   always sum to the projected annual savings shown in Scenario 3, and the
   educational disclaimer is visible on every tier.

### 5. Optional: Plaid sandbox connect (US5)

1. Set `ENABLE_PLAID=true` and real Plaid **sandbox** `PLAID_CLIENT_ID` /
   `PLAID_SECRET` in `.env` (never production keys).
2. Restart `npm run dev`; open `/accounts`; "Connect an account" is now
   visible.
3. Complete the Plaid Link sandbox flow with the test institution
   (`user_good` / `pass_good`).
4. Expected: sandbox transactions appear on the dashboard alongside any CSV
   imports, deduplicated correctly on repeat syncs; inspecting `dev.db`
   directly (e.g., `sqlite3 dev.db "select accessTokenEncrypted from
   Account;"`) shows only ciphertext, never a plaintext token.

## Unit Tests

```bash
npm test
```
Expected: all tests in `tests/unit/` pass, covering categorization rule
matching, monthly aggregation math, recommendation savings math, and
investment-bucket percentage/amount sums (each written before its
corresponding implementation, per Constitution Principle II).

## Security Spot-Check (Principle I / SC-005)

```bash
grep -ri "access_token\|password\|pan" dev.db || echo "no plaintext secrets found"
grep -ri "accessToken" logs/*.log || echo "no tokens in logs"
```
Both checks should find nothing (or only the redacted/ciphertext forms).
