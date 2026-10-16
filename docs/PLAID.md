# Connecting cards with Plaid

Users can either **upload statements** or **connect their bank** (Plaid) from the Accounts
page. The connect option only appears when `ENABLE_PLAID=true`.

> Don't do both for the same card. A connected card and an uploaded statement are separate
> accounts, so each purchase would be counted twice. Pick one per card.

## What you need
1. A Plaid account (dashboard.plaid.com) and its **client_id** and **secret**.
   Sandbox is free and uses fake banks. Real banks need **Production access**, which Plaid
   reviews and may bill for — check their current pricing and limits before you plan on it.
2. A 32-byte `ENCRYPTION_KEY` (already set if you followed `DEPLOY-FREE.md`). Bank access
   tokens are stored AES-256-GCM encrypted with it. **If you change it, existing connections
   stop working** (users must reconnect).
3. Never paste the secret in chat or commit it. Put it in `.env` locally and in Vercel.

## Step 1 — try it in sandbox
Vercel → Project → Settings → Environment Variables (Production), then redeploy:

| Name | Value |
|---|---|
| `ENABLE_PLAID` | `true` |
| `PLAID_CLIENT_ID` | from the Plaid dashboard |
| `PLAID_SECRET` | the **Sandbox** secret |
| `PLAID_ENV` | `sandbox` |
| `CRON_SECRET` | `openssl rand -base64 24` (16+ characters) |

Then Accounts → **Connect your bank (sandbox)**, pick any bank, sign in with
`user_good` / `pass_good`. You should see an account appear with transactions.
"Sync now" refreshes it; the account card shows when it was last synced.

## Before applying for Production
Plaid reviews your use case and normally wants a privacy policy and terms link. The app now
serves them at `/privacy` and `/terms` (linked in the footer, readable signed out). They describe
what the app actually does, but they are a starting point, **not legal advice** — have someone
qualified review them before relying on them. Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel (a real
mailbox you read) and redeploy so the "Contact" lines show it. Use these URLs in the Plaid
application: `https://<your-site>/privacy` and `https://<your-site>/terms`.

## Step 2 — real banks (Bank of America, Chase, …)
1. Request Production access in the Plaid dashboard and switch `PLAID_SECRET` to the
   production secret and `PLAID_ENV=production`.
2. Most large banks use **OAuth**: the user leaves for the bank's site and comes back.
   - Set `PLAID_REDIRECT_URI` to `https://<your-site>/plaid-oauth`.
   - Add the same URL under Plaid dashboard → Developers → API → *Allowed redirect URIs*.
   - Some banks need extra Plaid registration/approval before they appear; check the
     institution's status in the dashboard.
3. Redeploy and connect a real card.

## How syncing works
- When you connect, history is pulled once. Banks can take a few minutes to hand over the full
  history, so a brand-new connection may show few or no transactions at first: press **Sync now**
  after a few minutes.
- The Accounts page refreshes linked accounts that haven't updated in an hour; **Sync now**
  forces one. A daily Vercel Cron job (`vercel.json`, 11:00 UTC) refreshes everything.
- Pending transactions are skipped until they post. Rows are matched by Plaid's own
  transaction id, so nothing is added twice and two identical same-day purchases both stay.
- Categories use the same rules as uploads, and your own corrections are learned.

## Disconnecting
Accounts → **Disconnect** revokes access at Plaid and keeps the transactions already
imported. Deleting your whole account (Settings) also revokes every connection first.

## Known limits
- Web only. The mobile (Capacitor) build does not support the OAuth return.
- One app account per bank connection: if you link several cards at one bank in a single
  step they arrive together under one account.
- No webhooks or stored cursor yet: each sync re-reads the history (fine for personal use).
- Vercel Hobby cron runs at most once a day.
- Not tested against real Plaid credentials or production banks in this repo; only against
  fixtures and (once you add keys) the sandbox.
