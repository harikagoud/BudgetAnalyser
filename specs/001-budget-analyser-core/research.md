# Phase 0 Research: Budget Analyser Core

All items below were "NEEDS CLARIFICATION" candidates in Technical Context;
each is resolved with a decision, rationale, and alternatives considered.

## 1. Web framework / stack

- **Decision**: TypeScript + Next.js 14 (App Router), single codebase for UI
  and API routes.
- **Rationale**: User requested "great UI" and "whichever language is best."
  Next.js gives a modern React UI, built-in API routes (no separate backend
  service to stand up for a single-user local app), file-based routing, and
  first-class TypeScript support end-to-end — one language, one type system,
  from DB schema to UI.
- **Alternatives considered**: Python FastAPI + separate React frontend
  (better for heavy data-science-style analysis, but adds a second language
  and a second server to run locally for no clear benefit at this scale);
  plain Express + React (more boilerplate, no gain over Next.js).

## 2. Local data storage

- **Decision**: SQLite via Prisma ORM.
- **Rationale**: Zero-install local database (a single file), satisfies
  Principle III (local-testable-first) with no server process to run; Prisma
  gives typed models/migrations and an easy upgrade path to Postgres if this
  ever needs multi-device/shared deployment.
- **Alternatives considered**: Raw `better-sqlite3` (no schema migrations/
  type safety); Postgres locally (extra infrastructure for a single-user app
  with no current need).

## 3. Statement parsing (CSV/OFX)

- **Decision**: `csv-parse` for CSV (first-class, required default path);
  `ofx-js` for OFX (best-effort — OFX dialects vary by institution).
- **Rationale**: CSV export is close to universal across banks/card issuers
  and must work with zero dependencies (FR-001); OFX is common but less
  standardized, so it is supported but CSV remains the guaranteed path.
- **Alternatives considered**: Writing a custom parser for both formats
  (more maintenance, no benefit over mature libraries).

## 4. Transaction categorization

- **Decision**: Deterministic rule-based engine — a default merchant-keyword
  → category table, checked first; a per-merchant user-override table (set
  when the user manually recategorizes a transaction) checked before the
  default rules; unmatched transactions fall to "Uncategorized."
- **Rationale**: Transparent, debuggable, testable with exact unit tests
  (Principle II), and needs no training data or external ML service —
  matches Principle IV (simplicity/YAGNI) while still meeting the ≥90%
  auto-categorization success criterion (SC-002) for common merchants.
- **Alternatives considered**: ML/NLP classifier (higher accuracy ceiling but
  unjustified complexity and non-determinism for v1; revisit only if rule
  coverage proves insufficient in practice).

## 5. Live account linking

- **Decision**: Official `plaid` Node SDK (server-side) + `react-plaid-link`
  (client Link flow), sandbox environment only, gated behind `ENABLE_PLAID`
  env flag (default `false`).
- **Rationale**: Plaid is the de facto standard tokenized bank-linking
  aggregator — the app never sees real bank credentials, only Plaid's Link
  flow and an opaque `access_token`, satisfying Principle I. Sandbox-only for
  this phase per the constitution's Security & Privacy Requirements.
- **Alternatives considered**: Direct bank-credential scraping (explicitly
  disallowed — stores/handles real credentials, violates Principle I);
  other aggregators (MX, Finicity) — Plaid has the most mature sandbox and
  Node SDK for this use case.

## 6. Secret / token encryption

- **Decision**: Node's built-in `crypto` module, AES-256-GCM, key read from
  `ENCRYPTION_KEY` env var (32-byte, base64), applied to the `accessToken`
  field before it is written to SQLite.
- **Rationale**: Built into Node (no extra dependency), authenticated
  encryption (GCM) prevents silent tampering, satisfies Principle I's
  "encrypted at rest" requirement at the application level (not just relying
  on disk encryption).
- **Alternatives considered**: A third-party vault/KMS service — unjustified
  operational overhead for a single-user local app; revisit if/when this is
  deployed beyond localhost.

## 7. Charting / UI library

- **Decision**: Tailwind CSS + shadcn/ui for general components, Tremor (or
  Recharts if a Tremor component doesn't fit) for dashboard cards/charts.
- **Rationale**: Directly targets the "clean, modern, trustworthy-feeling"
  UI requirement with pre-built, accessible dashboard primitives (KPI cards,
  bar/line charts) that compose well in a Next.js + Tailwind app, minimizing
  custom chart code.
- **Alternatives considered**: D3 directly (far more flexible, far more time
  to reach a polished result — unjustified for v1); Chart.js (fine, but
  Tremor's dashboard-specific components are a closer fit out of the box).

## 8. Testing approach

- **Decision**: Vitest for unit tests of all financial-math modules
  (categorization, aggregation, recommendations, investment allocation),
  written before implementation per Constitution Principle II. No dedicated
  e2e framework for v1; `quickstart.md` defines a manual end-to-end
  verification flow using fixture data.
- **Rationale**: Vitest is fast, native ESM/TS, integrates cleanly with a
  Next.js/Vite-adjacent toolchain. A full e2e framework (Playwright/Cypress)
  is deferred — YAGNI — until there's a concrete regression it would catch
  that manual quickstart verification doesn't.
- **Alternatives considered**: Jest (works fine, but Vitest has faster
  TS/ESM defaults for a new project); Playwright now (adds setup overhead
  not yet justified by the current single-user scope).

## 9. Structured logging

- **Decision**: `pino`, configured with `redact` paths for
  `*.accessToken`, `*.account.number`, `*.rawDescription`.
- **Rationale**: Minimal-overhead structured JSON logging with built-in
  redaction support, directly satisfying Principle VI.
- **Alternatives considered**: `winston` (more configuration for the same
  outcome); `console.log` (no structure, no redaction — rejected outright
  given the constitution's explicit logging requirement).

## 10. Risk-tolerance → investment bucket mapping

- **Decision**: A static, versioned config (`lib/investments/allocation.ts`)
  defining three tiers — Conservative, Moderate, Aggressive — each a fixed
  percentage split across named buckets: Emergency Fund, Retirement Account,
  Taxable Brokerage (with the conservative tier weighted toward Emergency
  Fund, aggressive toward Taxable Brokerage/growth).
- **Rationale**: Matches spec Assumption "simple user-selected setting with
  predefined bucket percentage templates" — no personalization engine needed
  for v1, keeps output clearly educational/generic (Principle V), and is
  trivially unit-testable (percentages sum to 100 for every tier).
- **Alternatives considered**: A dynamic questionnaire-driven risk profile —
  explicitly out of scope per spec Assumptions; would also push the feature
  closer to "personalized advice," which Principle V prohibits.

**Outcome**: All Technical Context unknowns resolved. No remaining
NEEDS CLARIFICATION markers. Proceeding to Phase 1 design.
