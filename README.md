# Budget Analyser

A local-first personal budgeting web app. Import a bank/card statement (CSV or
OFX), get automatic categorization, month-over-month trends, cost-cutting
recommendations, and an educational year-end investment allocation view.
Everything runs on your machine — nothing is sent anywhere by default.

Stack: Next.js 14 (App Router) · TypeScript · Prisma + SQLite · Tailwind ·
Recharts · Vitest · pino. Optional Plaid **sandbox** account linking behind a
feature flag.

## Setup

Requires Node.js 20 LTS and npm. No external accounts needed.

```bash
npm install
cp .env.example .env
# edit .env: set ENCRYPTION_KEY (generate with: openssl rand -base64 32)
npx prisma migrate dev --name init   # creates prisma/dev.db
npm run db:seed                      # default categories + merchant rules
npm run dev                          # http://127.0.0.1:3000
```

`.env` defaults: `ENABLE_PLAID=false`, `DATABASE_URL="file:./dev.db"`.

## Using it

| Page | What it does |
|------|--------------|
| `/accounts` | Upload a CSV/OFX statement; list accounts |
| `/` | Categorized monthly dashboard |
| `/trends` | Month-over-month comparison, flagged increases |
| `/recommendations` | Cuts for overspent discretionary categories + projected annual savings |
| `/investments` | Educational allocation of projected savings by risk tolerance |

Try it with the bundled fixtures: `tests/fixtures/sample-statement.csv`
(then `sample-statement-month2.csv` for a second month and a trend).
CSV columns: `Date,Description,Amount` (positive = expense, negative =
refund). Re-uploading the same file is safe — duplicates are skipped.

Manually recategorizing a transaction teaches the app: future imports of that
merchant are categorized the same way.

## Tests

```bash
npm test          # unit + integration (integration uses throwaway temp DBs)
npx tsc --noEmit
npm run lint
```

## Optional: Plaid sandbox (off by default)

1. In `.env`: `ENABLE_PLAID=true`, plus Plaid **sandbox** `PLAID_CLIENT_ID` /
   `PLAID_SECRET` (never production keys).
2. Restart `npm run dev`; `/accounts` now shows "Connect an account (sandbox)".
3. In Plaid Link use the sandbox test institution (`user_good` / `pass_good`).

Access tokens are encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`) and
are never logged or returned by any API. Linked accounts re-sync each time
`/accounts` is opened; duplicates are skipped. With `ENABLE_PLAID=false` the
Plaid API routes return 404 and the button is absent.

## Security notes

- Server binds to `127.0.0.1` only.
- Logs are structured (pino) with token / raw-description redaction; log
  sites record `err.message` only, never raw SDK error objects.
- Investment view is educational only — not financial, legal, or tax advice.

## Docs

Spec-driven design artifacts live in `specs/001-budget-analyser-core/`
(`spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `contracts/api.md`,
`quickstart.md`, `validation-results.md`).
