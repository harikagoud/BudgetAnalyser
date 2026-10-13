# Implementation Plan: Budget Analyser Core

**Branch**: `001-budget-analyser-core` | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-budget-analyser-core/spec.md`

## Summary

A local-first personal finance web app. Users import transactions via CSV/OFX
(default, zero external dependency) or optionally connect a sandbox bank/card
account via Plaid (feature-flagged). Transactions are auto-categorized by a
merchant-rule engine, aggregated into monthly per-category summaries, compared
month-over-month to surface discretionary overspend, turned into cost-cutting
recommendations with estimated savings, and projected annual savings are
shown as an educational (non-advisory) investment-bucket allocation. Built as
a single TypeScript Next.js app with SQLite storage so the entire flow is
runnable and testable on `localhost` with no cloud dependency.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS

**Primary Dependencies**: Next.js 14 (App Router, combines UI + API routes),
Prisma ORM, Tailwind CSS + shadcn/ui (components), Tremor / Recharts (charts),
Zod (validation), `csv-parse` (CSV parsing), `ofx-js` (OFX parsing, best-effort),
official `plaid` Node SDK + `react-plaid-link` (feature-flagged), `pino`
(structured logging with redaction), Node `crypto` (AES-256-GCM field
encryption), Vitest (unit tests)

**Storage**: SQLite (file-based, local dev) via Prisma; schema designed to
migrate to Postgres later without data-model changes

**Testing**: Vitest for unit tests (categorization, aggregation, recommendation
math, investment allocation — written before implementation per Constitution
Principle II); manual end-to-end validation via `quickstart.md` using sample
fixture statements

**Target Platform**: Local web browser against a Node.js server bound to
`127.0.0.1` in development

**Project Type**: Web application — single Next.js codebase (UI + API routes
in one project; no separate frontend/backend split needed)

**Performance Goals**: Categorized dashboard renders in <2s for a statement of
up to ~2,000 transactions; categorization of 1,000 transactions completes in
<5s on a local machine

**Constraints**: Must be fully functional and demoable with `ENABLE_PLAID=false`
(CSV/OFX only, zero network calls); dev server binds to `127.0.0.1` only; no
raw card/bank credentials or PANs ever persisted or logged; Plaid access
tokens encrypted at rest

**Scale/Scope**: Single user, local SQLite file; designed comfortably for
up to ~10,000 transactions / 5 years of personal history

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Security & Privacy First | Plaid stores only an opaque `access_token`, encrypted at rest (AES-256-GCM, key from `ENCRYPTION_KEY` env var, never committed); no PAN/credential fields exist in the schema; dev server binds `127.0.0.1` | PASS |
| II. Test-First for Financial Logic | `lib/categorization`, `lib/aggregation`, `lib/recommendations`, `lib/investments` each get Vitest unit tests written before implementation (enforced in tasks ordering) | PASS |
| III. Local-Testable-First | CSV import path has zero external dependencies; `quickstart.md` defines a full local run+verify flow using fixture data, no live credential required | PASS |
| IV. Simplicity/YAGNI | `ENABLE_PLAID` feature flag defaults to off; CSV/OFX adapter is the default `TransactionSource`, Plaid is an additional adapter behind the same interface, not a hard dependency | PASS |
| V. Informational Output Only | Investment allocation uses named general buckets (Emergency Fund, Retirement, Taxable Brokerage) from a static risk-tier config — no tickers/securities; disclaimer component required on that view | PASS |
| VI. Observability Without Leakage | `pino` logger configured with redact paths for `accessToken`, `account.*`, and raw transaction descriptions beyond category-level logging | PASS |

No violations — Complexity Tracking table not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-budget-analyser-core/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output (API route contracts)
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
app/                          # Next.js App Router
├── (dashboard)/
│   ├── page.tsx                  # Monthly categorized dashboard (US1)
│   ├── trends/page.tsx           # Month-over-month comparison (US2)
│   ├── recommendations/page.tsx  # Cost-cutting recommendations (US3)
│   ├── investments/page.tsx      # Year-end allocation view (US4)
│   └── accounts/page.tsx         # Import CSV/OFX or connect Plaid (US1, US5)
├── api/
│   ├── import/route.ts           # POST CSV/OFX upload
│   ├── transactions/route.ts     # GET list, PATCH category override
│   ├── summary/route.ts          # GET monthly per-category summary
│   ├── recommendations/route.ts  # GET recommendations
│   ├── investments/route.ts      # GET allocation for a risk tier
│   └── plaid/
│       ├── link-token/route.ts   # POST create Plaid Link token (flagged)
│       └── exchange/route.ts     # POST exchange public token → encrypted access token (flagged)
├── layout.tsx
└── globals.css

lib/
├── parsers/
│   ├── csv.ts                    # CSV statement parser
│   └── ofx.ts                    # OFX statement parser
├── categorization/
│   ├── rules.ts                  # default merchant → category rules
│   └── engine.ts                 # categorize(transaction) + user-override memory
├── aggregation/
│   └── monthly-summary.ts        # per-category monthly totals + trend deltas
├── recommendations/
│   └── engine.ts                 # discretionary-overspend → recommendation + savings math
├── investments/
│   └── allocation.ts             # risk-tier → bucket % config + allocation calculator
├── plaid/
│   └── client.ts                 # Plaid SDK wrapper, no-ops when ENABLE_PLAID=false
├── security/
│   └── encryption.ts             # AES-256-GCM encrypt/decrypt helpers
├── db/
│   └── client.ts                 # Prisma client singleton
└── logger.ts                     # pino logger with redaction config

prisma/
├── schema.prisma
└── migrations/

components/
├── ui/                           # shadcn/ui primitives (button, card, dialog, select)
├── charts/                       # CategoryBarChart, TrendLineChart, AllocationDonut
├── dashboard/                    # CategoryCard, UploadForm, ConnectAccountButton
└── disclaimers/
    └── InvestmentDisclaimer.tsx

tests/
├── unit/
│   ├── categorization.test.ts
│   ├── aggregation.test.ts
│   ├── recommendations.test.ts
│   └── investments.test.ts
├── integration/
│   └── import-flow.test.ts       # upload fixture CSV → assert categorized summary
└── fixtures/
    └── sample-statement.csv

.env.example
```

**Structure Decision**: Single Next.js (App Router) full-stack TypeScript
project — UI pages and API routes live in one codebase, business/financial
logic isolated in `lib/` so it is independently unit-testable (Principle II)
without spinning up the web server. Chosen over a split frontend/backend
layout because the stack decision (Next.js) already unifies both concerns in
one language, which keeps the system simpler to run and test locally
(Principle III/IV) with fewer moving parts for a single-user local app.

## Complexity Tracking

*No constitution violations — table intentionally empty.*
