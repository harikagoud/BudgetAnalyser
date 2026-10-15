# Deploy for $0 — Vercel Hobby + Neon Free

For **testing with people you know**. Vercel Hobby is non-commercial only, and
Neon Free keeps just 6 hours of history. Before real users or the Play Store,
see `docs/PRODUCTION.md` (upgrade path: Neon Launch + a small always-on host).

## 1. Database (Neon)
1. neon.com → sign up with GitHub → **Create project** (`budget-analyser`,
   newest Postgres). **Region: match Vercel's function region** (US East /
   `iad1` by default), not where you live — app-to-database latency is what
   matters, and a mismatch makes every page slower.
2. **Connect** dialog: copy two strings, both with `?sslmode=require`:
   - *Pooled* (host contains `-pooler`) → `DATABASE_URL`, and **append
     `&connect_timeout=15`**. Neon sleeps after 5 idle minutes; Prisma's default
     5 s connect wait is shorter than a cold start and fails with `P1001`.
   - *Direct* (turn the "Connection pooling" toggle off) → `DIRECT_URL`
   (Neon's own docs call the direct one `DATABASE_URL_UNPOOLED`; this repo uses
   `DIRECT_URL`. If you use Vercel's Neon integration, which injects the
   `*_UNPOOLED` name, add `DIRECT_URL` yourself with the same value.)
3. Create the tables **from your laptop**, using inline variables so nothing is
   saved to `.env`:
   ```bash
   DATABASE_URL='<direct string>' DIRECT_URL='<direct string>' npx prisma migrate deploy
   DATABASE_URL='<direct string>' DIRECT_URL='<direct string>' npm run db:seed
   ```

## 2. Secrets
Generate **new** values for production (do not reuse your local ones):
```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY (keep a private copy; only matters if Plaid is enabled)
```

## 3. Vercel
1. vercel.com → sign up with GitHub → **Add New → Project** → import
   `harikagoud/BudgetAnalyser`.
2. **Production Branch**: Vercel deploys `main`. `main` is still the very first
   commit, so either merge the `001-budget-analyser-core` pull request first, or
   set Settings → Git → Production Branch to `001-budget-analyser-core`.
3. Framework preset Next.js, defaults for build/output (`postinstall` runs
   `prisma generate`).
4. Environment variables (Production):
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | pooled Neon string |
   | `DIRECT_URL` | direct Neon string |
   | `AUTH_SECRET` | from step 2 |
   | `ENCRYPTION_KEY` | from step 2 |
   | `ENABLE_PLAID` | `false` (set up Plaid later: `docs/PLAID.md`) |
5. Deploy, then check `https://<your-app>.vercel.app/api/health` → `{"status":"ok"}`
   (it queries the database, so `503` means the connection string is wrong).
6. Register an account, upload `tests/fixtures/sample-statement.csv`, open the
   dashboard, then try Settings → delete account.

## 4. Email verification (Gmail SMTP)
New accounts must click an emailed link before they can sign in.
1. Use a **personal** Google account (Workspace/company accounts often block this).
   Turn on 2-Step Verification, then create an **App Password**
   (myaccount.google.com/apppasswords). Copy the 16-character value.
2. Add these Vercel environment variables (Production), then redeploy:

   | Name | Value |
   |---|---|
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | your Gmail address |
   | `SMTP_PASS` | the App Password (not your Google password) |
   | `EMAIL_FROM` | `Budget Analyser <your Gmail address>` |
   | `APP_URL` | your site, e.g. `https://budget-analyser-xxxx.vercel.app` (no trailing slash) |

3. **Before the code deploys**, add the new column to Neon (SQL Editor, run once). If
   the code reaches production first, register/login return 500:
   ```sql
   ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
   UPDATE "User" SET "emailVerifiedAt" = "createdAt";  -- existing test accounts count as verified
   ```
4. Gmail allows roughly 500 messages a day, which is plenty for testing. Mail can
   land in spam on the first send. For wider use, move to a domain-based sender
   (Resend/Postmark) — only `SMTP_*`/`EMAIL_FROM` change.

## 5. Budget limits (new table)
Run **Part 4** of `prisma/neon-setup.sql` (the `CREATE TABLE "BudgetLimit"` block) in
Neon's SQL Editor **before** the code that uses it deploys, or the Budgets pages and
the nav-bar bell return errors.

## 5b. Category recognition (new column + ~470 merchant rules)
Run **Part 5** of `prisma/neon-setup.sql` (starts at `-- ===== Part 5`) in Neon's SQL
Editor **before** deploying this version — the app now reads
`Category.excludeFromSpending`, so every page errors until the column exists. Part 5
is idempotent (safe to run twice). The editor may warn that query history will be
truncated; the query still runs. Regenerate it after editing
`lib/categorization/rules.ts` with `npx tsx prisma/gen-neon-part5.ts`.

After deploying, open the Dashboard and press **Re-categorize with latest rules**
once to fix transactions imported earlier. Categories you set by hand are never
changed.

Later, from a network that can reach Neon on port 5432, tell Prisma those changes
are already applied (one command per migration, four after Part 5), so future `migrate deploy` runs
don't try to re-create them:
```bash
DATABASE_URL="$D" DIRECT_URL="$D" npx prisma migrate resolve --applied 20261014120000_init_postgres
DATABASE_URL="$D" DIRECT_URL="$D" npx prisma migrate resolve --applied 20261014180000_add_email_verification
DATABASE_URL="$D" DIRECT_URL="$D" npx prisma migrate resolve --applied 20261015120000_add_budget_limits
DATABASE_URL="$D" DIRECT_URL="$D" npx prisma migrate resolve --applied 20261016120000_category_exclude_from_spending
```

## Known limits of this setup
- **Login/registration throttles are per serverless instance**, so on Vercel they
  only slow an attacker down. Fine for friends-and-family; add a shared store
  (e.g. Upstash Redis) before opening to the public.
- Neon Free sleeps after 5 idle minutes; the first request after that is slow.
- Function time limit on Hobby is 300 s, so the 20,000-row import (20 s
  transaction timeout) fits without extra configuration.
- Uploads are capped at 4 MB (Vercel's request-body limit is about 4.5 MB).
- Preview deployments need their own database env vars; don't point them at
  production data.
- Schema changes: run `prisma migrate deploy` from your laptop *before*
  deploying code that needs them.
