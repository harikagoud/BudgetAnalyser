# Feature Specification: Budget Analyser Core

**Feature Branch**: `001-budget-analyser-core`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "a personal finance web app where the user connects their bank/credit cards (via Plaid sandbox) or imports CSV/OFX statements, and the app automatically categorizes transactions into spend categories (subscriptions, Costco, Walmart/groceries, car insurance, home/EMI, vacations, dining, utilities, etc.). The app shows monthly spend per category, compares each month against prior months (trend), identifies categories where spend increased or is discretionary, recommends specific cost-cutting actions with an estimated dollar amount the user could save per month, and projects annual savings. At year-end (or on demand), it shows an educational breakdown of how the projected saved amount could be allocated across general investment buckets — framed as informational only, not personalized financial advice. The UI must be clean, modern, and trustworthy-feeling. Security is critical: no raw card/account credentials stored, tokens encrypted at rest, everything runs locally for now."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import statements and see categorized monthly spend (Priority: P1)

A user uploads a CSV/OFX export of their card or bank statement. The app parses the
transactions, assigns each one to a spend category (subscriptions, groceries,
dining, car insurance, home/EMI, vacations, utilities, other), and shows a
dashboard of total spend per category for the current month.

**Why this priority**: This is the foundation — without ingested, categorized
transactions nothing else (comparison, recommendations, investment projection)
has data to work with. It is also fully testable offline with no external
dependency, satisfying the project's local-first/security principles.

**Independent Test**: Upload a sample CSV with ~50 transactions across 8+
categories; verify the dashboard shows correct per-category totals matching a
hand-calculated sum, and that every transaction has exactly one category
(or "Uncategorized").

**Acceptance Scenarios**:

1. **Given** a user with no prior data, **When** they upload a valid CSV
   statement, **Then** the system parses every row into a transaction record
   and shows a per-category monthly total that sums to the statement total.
2. **Given** an uploaded statement containing a merchant the system recognizes
   (e.g., "COSTCO WHSE #123"), **When** categorization runs, **Then** the
   transaction is assigned to the correct category (e.g., "Costco") rather than
   left Uncategorized.
3. **Given** a transaction the system cannot confidently categorize, **When**
   it appears on the dashboard, **Then** it is labeled "Uncategorized" and the
   user can manually assign it to a category, and that choice is remembered for
   future transactions from the same merchant.

---

### User Story 2 - Compare spend against prior months (Priority: P2)

Once at least two months of data exist, the user views a trend comparison
showing, per category, how this month's spend differs from last month (and
from a trailing average), with increases and discretionary categories
visually flagged.

**Why this priority**: Comparison is the analytical step that turns raw totals
into insight — it's the next most valuable capability after basic categorized
totals, and it is the direct input to cost-cutting recommendations (P3).

**Independent Test**: Load two months of sample data with a known increase in
one category (e.g., dining up 40%); verify the comparison view surfaces that
category as increased with the correct percentage/dollar delta.

**Acceptance Scenarios**:

1. **Given** two or more months of categorized transactions, **When** the user
   opens the trend view, **Then** each category shows current-month spend,
   prior-month spend, and the delta (amount and percent).
2. **Given** a category's spend increased more than a configurable threshold
   month-over-month, **When** the trend view renders, **Then** that category is
   visually flagged as increased.
3. **Given** fewer than two months of data exist, **When** the user opens the
   trend view, **Then** the system explains that more data is needed rather
   than showing a misleading or empty comparison.

---

### User Story 3 - Get cost-cutting recommendations with estimated savings (Priority: P3)

Based on category trends and discretionary-category spend, the user sees a
list of specific, actionable recommendations (e.g., "Dining spend is $320/mo
across 3 subscriptions you rarely use — cancelling 2 could save ~$45/mo"),
each with an estimated monthly dollar amount, and a running total of
potential monthly and annual savings if all recommendations were followed.

**Why this priority**: This is where the app delivers its core promise —
turning analysis into money saved — but it depends on P1 (data) and P2
(trend) existing first.

**Independent Test**: Load sample data with a clearly discretionary,
recurring, above-average category (e.g., 4 active streaming subscriptions);
verify the system recommends reducing that category with a non-zero estimated
saving, and that the total projected annual saving equals 12x the sum of
recommended monthly savings.

**Acceptance Scenarios**:

1. **Given** categorized spend with recurring discretionary items identified,
   **When** the user opens the recommendations view, **Then** each
   recommendation names the category, the action, and an estimated monthly
   dollar saving.
2. **Given** one or more recommendations exist, **When** the user views the
   summary, **Then** the total estimated monthly saving and projected annual
   saving (monthly × 12) are both displayed.
3. **Given** no discretionary overspend is detected, **When** the user opens
   the recommendations view, **Then** the system states no cuts are currently
   recommended rather than fabricating one.

---

### User Story 4 - View year-end educational investment allocation (Priority: P4)

Using the projected annual savings from P3, the user sees an educational
breakdown of how that amount could be split across general investment buckets
(e.g., emergency fund, retirement account, taxable brokerage) based on a
risk-tolerance setting they choose, clearly labeled as informational only.

**Why this priority**: This is the "payoff" view the user described last in
their request — it is the least data-dependent-on-correctness (directional,
educational) and the most regulated/sensitive to get wrong, so it is built
last, after the core numbers it depends on are trustworthy.

**Independent Test**: With a known projected annual saving (e.g., $1,200) and
a selected risk tolerance (e.g., "moderate"), verify the allocation view shows
bucket percentages that sum to 100% and dollar amounts that sum to the
projected total, with the required disclaimer visible.

**Acceptance Scenarios**:

1. **Given** a projected annual saving amount, **When** the user opens the
   investment view, **Then** it shows a percentage and dollar breakdown across
   general buckets (not specific securities) that sums to 100% / the full
   amount.
2. **Given** the user changes their risk-tolerance setting, **When** the
   allocation view re-renders, **Then** the bucket percentages change
   accordingly (e.g., more conservative → larger emergency-fund/bond-like
   bucket).
3. **Given** the investment view is shown, **When** it renders, **Then** a
   visible disclaimer states the breakdown is educational/informational only
   and not personalized financial, legal, or tax advice.

---

### User Story 5 - Connect a card/bank account directly instead of uploading a file (Priority: P5)

As an alternative to manual CSV/OFX upload, the user links a bank or card
account through a sandbox bank-linking flow, and transactions sync in
automatically on the same categorization/dashboard pipeline as P1.

**Why this priority**: Lower priority than the CSV path because the app must
be fully usable and testable without any live external account (Principle III
— local-testable-first, Principle IV — simplicity/YAGNI); this is a
convenience layer on top of an already-working core.

**Independent Test**: With the live-linking feature flag enabled and a sandbox
test institution/account, link an account and verify sandbox transactions
appear in the same categorized dashboard as a CSV import would produce, with
no raw account credentials ever visible to or stored by the app.

**Acceptance Scenarios**:

1. **Given** the live-linking feature is enabled, **When** the user completes
   the linking flow for a sandbox institution, **Then** the app stores only an
   opaque access token (never the user's bank username/password) and begins
   showing that account's transactions on the dashboard.
2. **Given** an account is linked, **When** new sandbox transactions become
   available, **Then** they are pulled in, categorized, and reflected in the
   monthly totals without duplicate entries on repeated syncs.
3. **Given** the live-linking feature flag is disabled, **When** the user opens
   the app, **Then** the "Connect an account" option is hidden or disabled and
   CSV/OFX upload remains fully functional.

---

### Edge Cases

- What happens when an uploaded file is not a recognized CSV/OFX format, or is
  corrupted/empty? System must reject with a clear error and not create
  partial/garbage transactions.
- How does the system handle duplicate transactions — the same statement
  uploaded twice, or a transaction present in both a CSV upload and a linked
  account sync? Duplicates must not double-count toward spend totals.
- How does the system handle a transaction dated outside the current calendar
  year when computing the "projected annual savings" and year-end view?
- What happens if a linked sandbox account returns an error or becomes
  unreachable during sync? The dashboard must keep showing last-known-good
  data and indicate the sync failure rather than showing zero/blank data.
- How does the system handle a refund or reversal (negative expense) within a
  category — it must reduce that category's total rather than being
  miscategorized as a new expense.
- What happens when a user has only partial-month data (e.g., just connected
  mid-month)? Comparisons and recommendations must account for partial months
  rather than unfairly flagging a low partial month as a "decrease."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a user to import transactions via CSV or OFX
  file upload, with no external account or network dependency required.
- **FR-002**: System MUST parse each imported transaction into date, merchant/
  description, amount, and (if present in the source file) account identifier.
- **FR-003**: System MUST assign every transaction to exactly one spend
  category from a default category set (at minimum: Subscriptions, Groceries,
  Dining, Car Insurance, Home/EMI, Vacations/Travel, Utilities, Other/
  Uncategorized), using merchant-name/description matching rules.
- **FR-004**: Users MUST be able to manually reassign a transaction's category,
  and the system MUST remember that choice for future transactions from the
  same merchant.
- **FR-005**: System MUST compute total spend per category per calendar month.
- **FR-006**: System MUST show, for any category with at least two months of
  history, the month-over-month dollar and percent change, and visually flag
  increases above a configurable threshold.
- **FR-007**: System MUST generate cost-cutting recommendations for categories
  identified as discretionary and above-trend, each with an estimated monthly
  dollar saving.
- **FR-008**: System MUST compute and display total estimated monthly savings
  (sum of active recommendations) and projected annual savings (monthly × 12).
- **FR-009**: System MUST provide a year-end (or on-demand) investment
  allocation view that splits the projected annual savings across general,
  named investment buckets (not specific securities/tickers) based on a user-
  selected risk-tolerance setting.
- **FR-010**: System MUST display a visible disclaimer on the investment
  allocation view stating the content is educational/informational only, not
  personalized financial, legal, or tax advice.
- **FR-011**: System MUST support an optional, feature-flagged live account-
  linking flow (Plaid sandbox) that lets a user connect an account instead of
  uploading a file, feeding the same categorization/dashboard pipeline as
  FR-001–FR-005.
- **FR-012**: System MUST NOT store raw bank/card credentials (usernames,
  passwords, PANs, CVVs) at any time; when live linking is used, only an
  opaque access token issued by the aggregator may be persisted, and it MUST
  be encrypted at rest.
- **FR-013**: System MUST detect and prevent duplicate transactions (same
  date + amount + account + description) from being counted twice, whether
  from a repeated file upload or an overlapping linked-account sync.
- **FR-014**: System MUST run fully on localhost for local development/testing
  with no requirement for a live production credential or cloud deployment.
- **FR-015**: System MUST log import, categorization, sync, and recommendation
  events in a structured, redacted form that never includes account numbers,
  access tokens, or full raw transaction descriptions tied to a linked account.

### Key Entities

- **Transaction**: A single financial event — date, amount, merchant/
  description, source (upload vs linked account), assigned category, and a
  duplicate-detection key. Belongs to one Account.
- **Account**: A statement-upload source or a linked bank/card account
  (identified by an opaque token reference only, never raw credentials).
- **Category**: A spend bucket (e.g., Subscriptions, Groceries, Car Insurance)
  with a set of merchant-matching rules and a flag for whether it is
  considered discretionary.
- **MonthlySummary**: Aggregated spend per Category per calendar month,
  derived from Transactions, used for trend comparison.
- **Recommendation**: A generated suggestion tied to one or more Categories,
  with an estimated monthly dollar saving and the reasoning that produced it.
- **InvestmentAllocation**: A point-in-time breakdown of a projected savings
  amount across named general buckets (e.g., Emergency Fund, Retirement,
  Taxable Brokerage) for a given risk-tolerance setting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can import a statement and see a correct, fully
  categorized monthly dashboard in under 2 minutes from file selection.
- **SC-002**: At least 90% of transactions in a typical personal statement
  (common recognizable merchants) are auto-categorized correctly without
  manual intervention.
- **SC-003**: Given two or more months of data, the trend/comparison view and
  at least one cost-cutting recommendation are visible within a single page
  load, with no separate manual calculation required by the user.
- **SC-004**: 100% of projected-savings and investment-allocation figures
  shown to the user are internally consistent (bucket percentages sum to
  100%, bucket dollar amounts sum to the projected total, monthly ×12 equals
  the displayed annual figure).
- **SC-005**: Zero instances of raw bank/card credentials or unencrypted
  access tokens appearing in storage, logs, or UI at any point — verifiable
  by inspection of the local database and log output.
- **SC-006**: The full user journey (import or connect → categorized dashboard
  → trend comparison → recommendations → investment allocation) can be
  demonstrated entirely on localhost with sample/sandbox data, with no live
  production credential involved.

## Assumptions

- Single-user, local-first application for now: no multi-tenant login system
  is required for v1; the app runs for one person's own data on their own
  machine. Multi-user auth is out of scope unless requested later.
- The default category list given in the request (subscriptions, Costco,
  Walmart/groceries, car insurance, home/EMI, vacations, dining, utilities) is
  treated as the seed/default category set; users can rename or add
  categories and adjust merchant-matching rules.
- "Discretionary" categories (e.g., dining, subscriptions, vacations) are
  distinguished from "fixed" categories (e.g., car insurance, home/EMI,
  utilities) via a per-category flag, so recommendations target the former.
- Live account linking uses Plaid's sandbox/test environment only for this
  phase (per the project constitution); production bank-credential linking is
  explicitly out of scope until a separate, reviewed decision is made.
- Risk-tolerance for the investment allocation view is a simple user-selected
  setting (e.g., Conservative / Moderate / Aggressive) with predefined bucket
  percentage templates per tier; no personalized profile/questionnaire is
  required for v1.
- "Month-over-month" comparison uses calendar months; partial first/last
  months are labeled as partial rather than silently compared as full months.
- Cloud deployment, multi-device sync, and mobile apps are explicitly out of
  scope for this feature — the current scope is a local, single-machine web
  application.
