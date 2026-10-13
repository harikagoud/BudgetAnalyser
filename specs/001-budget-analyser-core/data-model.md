# Phase 1 Data Model: Budget Analyser Core

Derived from spec.md Key Entities. Implemented via Prisma schema → SQLite.

## Account

Represents a transaction source: either a manual CSV/OFX upload source or a
Plaid-linked account. Never stores raw credentials.

| Field | Type | Notes |
|---|---|---|
| id | string (cuid) | PK |
| name | string | User-facing label, e.g. "Chase Sapphire", "Manual Import" |
| type | enum: `MANUAL`, `PLAID` | How transactions enter the system |
| plaidItemId | string? | Plaid `item_id`, null for MANUAL accounts |
| accessTokenEncrypted | string? | AES-256-GCM ciphertext of Plaid `access_token`; null for MANUAL; **never stored in plaintext, never logged** |
| institutionName | string? | e.g. "Chase" (display only, from Plaid metadata) |
| createdAt | datetime | |
| lastSyncedAt | datetime? | Last successful Plaid sync; null for MANUAL |

**Validation**: `type=PLAID` requires `accessTokenEncrypted` non-null;
`type=MANUAL` requires both Plaid fields null.

## Transaction

| Field | Type | Notes |
|---|---|---|
| id | string (cuid) | PK |
| accountId | string | FK → Account |
| date | date | Transaction date |
| amount | decimal | Positive = expense, negative = refund/credit (consistent sign convention) |
| merchantRaw | string | Original description from source file/Plaid (not logged beyond this record) |
| merchantNormalized | string | Lowercased/trimmed, used for rule matching |
| categoryId | string | FK → Category (defaults to "Uncategorized") |
| categorySource | enum: `RULE`, `USER_OVERRIDE`, `DEFAULT` | How the category was assigned |
| dedupeKey | string | Hash of (date, amount, accountId, merchantNormalized) — unique index |
| importBatchId | string? | FK → ImportBatch, null for Plaid-sourced transactions |
| createdAt | datetime | |

**Validation**: `dedupeKey` has a unique constraint — enforces FR-013
(duplicate prevention) at the database level. `amount` must be a valid
decimal with 2 fraction digits.

## Category

| Field | Type | Notes |
|---|---|---|
| id | string (cuid) | PK |
| name | string | e.g. "Subscriptions", "Groceries", "Car Insurance" |
| isDiscretionary | boolean | Drives recommendation-engine eligibility |
| isDefault | boolean | Seeded vs user-created |

**Seed data** (isDefault=true): Subscriptions (discretionary), Groceries
(non-discretionary), Dining (discretionary), Car Insurance
(non-discretionary), Home/EMI (non-discretionary), Vacations/Travel
(discretionary), Utilities (non-discretionary), Uncategorized (non-eligible
for recommendations by definition).

## MerchantRule

Encodes both the default seed rules and user-override memory (FR-004).

| Field | Type | Notes |
|---|---|---|
| id | string (cuid) | PK |
| pattern | string | Substring/keyword matched against `merchantNormalized` |
| categoryId | string | FK → Category |
| source | enum: `SEED`, `USER` | USER rules take precedence over SEED on conflict |
| createdAt | datetime | |

**Validation**: `(pattern, source)` unique per source type; when a user
recategorizes a transaction, a `USER` rule is upserted for that merchant's
normalized pattern.

## MonthlySummary (derived/computed, not a mutable table)

Computed on read from `Transaction` + `Category` (optionally cached in a
table of the same shape for performance at larger scale — not required for
v1's scope of ~10k transactions).

| Field | Type | Notes |
|---|---|---|
| yearMonth | string | `YYYY-MM` |
| categoryId | string | FK → Category |
| totalAmount | decimal | Sum of transaction amounts in that category/month |
| transactionCount | integer | |
| isPartialMonth | boolean | True if the earliest available data for the account starts mid-month (per spec Edge Cases) |

## Recommendation (derived/computed, not persisted — regenerated per request)

| Field | Type | Notes |
|---|---|---|
| categoryId | string | FK → Category |
| reason | string | Human-readable explanation (e.g., "35% above 3-month average") |
| estimatedMonthlySavings | decimal | |
| basisMonth | string | `YYYY-MM` the recommendation was computed against |

**Note**: Recommendations are intentionally not persisted as mutable state
for v1 (no "accept/dismiss" workflow in scope) — they are recalculated from
current `MonthlySummary` data on each view, keeping the system simple
(Principle IV) and always consistent with the latest data.

## RiskProfile (static config, not a database table)

Defined in code (`lib/investments/allocation.ts`) as a lookup, not
user-editable data for v1:

| Tier | Emergency Fund | Retirement Account | Taxable Brokerage |
|---|---|---|---|
| Conservative | 50% | 35% | 15% |
| Moderate | 25% | 45% | 30% |
| Aggressive | 10% | 40% | 50% |

**Validation**: each row's percentages MUST sum to 100 — enforced by a unit
test (Constitution Principle II).

## UserSetting

| Field | Type | Notes |
|---|---|---|
| key | string | PK, e.g. `riskTolerance`, `enablePlaid` (mirrors env flag default, user can override in UI if flag allows) |
| value | string | |

## ImportBatch

Tracks a single CSV/OFX upload for traceability and potential rollback.

| Field | Type | Notes |
|---|---|---|
| id | string (cuid) | PK |
| accountId | string | FK → Account |
| fileName | string | |
| format | enum: `CSV`, `OFX` | |
| transactionCount | integer | Rows successfully imported |
| duplicateCount | integer | Rows skipped as duplicates |
| errorCount | integer | Rows that failed to parse |
| createdAt | datetime | |

## Entity Relationship Summary

```
Account 1---* Transaction *---1 Category
Category 1---* MerchantRule
Account 1---* ImportBatch 1---* Transaction (nullable for Plaid-sourced rows)
```

No entity stores raw card numbers, CVVs, or bank login credentials anywhere
in this model (Constitution Principle I) — `Account.accessTokenEncrypted` is
the only credential-adjacent field, and it is always ciphertext.
