# Going to production — step by step

Status legend: **DONE** = implemented and verified in this repo. **YOU** = needs
an account, a decision, or infrastructure only you can provide. **TODO** = code
work that is still open.

## 0. Already done in the codebase
- DONE Login / register / sign-out, per-user data isolation (verified across two users).
- DONE Passwords hashed with scrypt; signed 7-day session tokens (httpOnly cookie on web, Bearer on mobile).
- DONE Login throttle (5 failures / 15 min per IP+email) and registration throttle (10 / hour per IP) — **in-memory only**, see step 5.
- DONE Change password (`PUT /api/auth/password`) and delete account (`DELETE /api/auth/account`) with a `/settings` page.
- DONE Upload limits: 4 MB file, 20,000 rows; failed imports no longer leave an empty account behind.
- DONE Security headers (HSTS, nosniff, frame deny, referrer, permissions policy), `X-Powered-By` removed.
- DONE `GET /api/health` for uptime checks.
- DONE Production build passes (`npm run build`), 88 tests, `tsc` and `eslint` clean.

## 1. Choose and provision hosting — YOU
Any Node 20+ host that terminates TLS and runs `npm run build && npm start`
(Fly.io, Render, Railway, a VM + Caddy/nginx, Kubernetes…). Requirements:
- HTTPS only. The proxy **must** send `X-Forwarded-Proto: https` — the login
  cookie gets its `Secure` flag from it (verified).
- Run **one** instance until step 5 is done (throttles are per-process).
- Point your uptime check at `/api/health`.

## 2. Database — DONE in code, YOU provision
The app now runs on **PostgreSQL** (schema, a single baseline migration, tests —
all verified against Postgres 16). What is left is yours:
1. Provision managed Postgres (Neon free tier is enough to start — see
   `docs/DEPLOY-FREE.md`); get a pooled `DATABASE_URL` and a direct `DIRECT_URL`.
2. From your machine, once: `DATABASE_URL=<direct> DIRECT_URL=<direct> npx prisma migrate deploy`
   then `... npm run db:seed`. Run migrations as a deliberate step, not in the
   host's build, so preview deploys can never touch the production database.
3. Money columns stay `Float` (double precision) with rounding to cents in the
   aggregation code; switch to `Decimal` only if you need exact-cent storage.
4. Enable backups and **test a restore**. Neon's free plan keeps only 6 hours of
   history — move to a paid plan (7 days) before you hold real users' data.

## 3. Secrets — YOU
Set these in your host's secret manager, never in the repo or image:
| Variable | Notes |
|---|---|
| `DATABASE_URL` | from step 2 |
| `AUTH_SECRET` | `openssl rand -base64 32`; changing it signs everyone out |
| `ENCRYPTION_KEY` | `openssl rand -base64 32`; **losing it makes stored Plaid tokens unreadable** — back it up separately |
| `ENABLE_PLAID`, `PLAID_*` | only if you enable Plaid (step 7) |
| `LOG_LEVEL` | optional (`info`) |

Generate production values fresh; do not reuse your dev `.env`.

## 4. Content-Security-Policy — TODO (needs a browser)
Deliberately not set yet: Next injects inline scripts and Recharts injects
inline styles, so a strict policy needs nonces and testing in a real browser.
Roll out as `Content-Security-Policy-Report-Only` first, fix violations, then
enforce. If Plaid is on, allow `cdn.plaid.com` (script/frame) and `*.plaid.com` (connect).

## 5. Shared rate limiting — TODO
`lib/auth/throttle.ts` resets on restart and isn't shared between instances.
Before running more than one instance, back it with Redis (or use your
platform's / CDN's rate limiting) for login, register, and import.

## 6. Account recovery & verification — YOU (pick a provider) + TODO
There is no password reset or email verification yet. Choose an email
provider (SES, Postmark, Resend…), then add: verification on sign-up,
"forgot password" with single-use expiring links. Until then a user who
forgets their password is locked out. Also consider revocable sessions
(server-side) — today a stolen token is valid until it expires.

## 7. Plaid (optional) — YOU
Only sandbox was exercised, and never against real credentials.
1. Verify with `PLAID_ENV=sandbox` first (`user_good` / `pass_good`).
2. Apply for Plaid production access (review required) before real banks.
3. Replace sync-on-page-load with a webhook + a stored cursor (today every
   visit re-fetches full history).

## 8. Monitoring — YOU
Error tracking (Sentry etc.), ship the pino JSON logs somewhere searchable,
alert on `/api/health` and 5xx rate. Logs already redact passwords, tokens and
raw merchant strings.

## 9. CI — TODO
Add a pipeline running `npm install`, `npx prisma generate`, `npx tsc --noEmit`,
`npm run lint`, `npm test`, `npm run build` on every push. Note
`package-lock.json` is git-ignored (it resolves to Walmart-internal npm
registries); generate one on the public registry and commit it for
reproducible CI builds.

## 10. Android / Play Store — YOU
1. Build on a machine that can reach Maven Central + Google Maven (Gradle was blocked on the dev network), with JDK 21 and Android SDK platform 36.
2. In `capacitor.config.ts` set `androidScheme: 'https'` and remove `cleartext`; build with `NEXT_PUBLIC_API_BASE=https://<your-api-host>`.
3. Create a release keystore (**back it up — you can't update the app without it**) and a signed `.aab`.
4. Play Console ($25 one-time): store listing, screenshots, **privacy policy URL**, **Data safety form** (declare financial info + Plaid), content rating, and the account-deletion URL/in-app flow (done: Settings → Delete account).
5. Expect scrutiny: apps that merely wrap a website can be rejected — keep the real in-app functionality.
6. iOS is separate and needs a Mac with Xcode and an Apple developer account ($99/yr).

## 11. Legal — YOU
Publish a privacy policy and terms before accepting real users' financial
data. The in-app investment view is educational only and carries a disclaimer;
have it reviewed for your jurisdiction.

## 12. Launch checklist
- [ ] Postgres provisioned, migrated, seeded, backups tested
- [ ] All secrets set; `AUTH_SECRET` / `ENCRYPTION_KEY` are fresh and backed up
- [ ] HTTPS with `X-Forwarded-Proto`; `/api/health` monitored
- [ ] `curl -I https://<host>/login` shows the security headers
- [ ] Register → import → delete account works end to end on the live site
- [ ] Single instance, or shared rate limiter (step 5)
- [ ] Email reset/verification (step 6) or an explicit decision to ship without
- [ ] Privacy policy + terms published
