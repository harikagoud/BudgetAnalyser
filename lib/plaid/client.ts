import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from 'plaid';
import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { decrypt } from '@/lib/security/encryption';
import {
  categorizeFromRules,
  loadRulesForUser,
  normalizeMerchant,
  type MerchantRuleLike,
} from '@/lib/categorization/engine';
import { computeDedupeKey } from '@/lib/dedupe';
import { logger } from '@/lib/logger';

/**
 * Plaid client wrapper (US5, FR-011, FR-012). Everything here is gated
 * behind `ENABLE_PLAID` (Constitution Principle IV — the feature must be a
 * true no-op, not just hidden UI, when disabled). `PlaidApi`/`Configuration`
 * are constructed lazily inside each function, AFTER the enabled check —
 * never at module scope — so importing this module (or running the T051
 * disabled-path tests) never requires PLAID_CLIENT_ID/PLAID_SECRET to be
 * set, and `ENABLE_PLAID=false` never touches the network.
 */
export type PlaidResult<T> = { enabled: true; data: T } | { enabled: false };

export function isPlaidEnabled(): boolean {
  // Exact-string check, not truthy coercion — "false", "1", "TRUE" etc. must
  // all resolve to disabled; only the literal string "true" enables Plaid.
  return process.env.ENABLE_PLAID === 'true';
}

function buildClient(): PlaidApi {
  const env = process.env.PLAID_ENV ?? 'sandbox';
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(configuration);
}

/** Stable client_user_id for Plaid Link — this app has no multi-user auth. */
const LOCAL_USER_ID = 'local-user';

export async function createLinkToken(
  clientUserId: string = LOCAL_USER_ID,
): Promise<PlaidResult<{ linkToken: string }>> {
  if (!isPlaidEnabled()) return { enabled: false };
  const client = buildClient();
  try {
    const res = await client.linkTokenCreate({
      client_name: 'Budget Analyser',
      language: 'en',
      country_codes: [CountryCode.Us],
      user: { client_user_id: clientUserId },
      products: [Products.Transactions],
    });
    return { enabled: true, data: { linkToken: res.data.link_token } };
  } catch (err) {
    // Plaid SDK errors carry PLAID-SECRET in request headers and tokens in
    // request/response bodies — never log the error object itself, only
    // the message (same rule app/api/import/route.ts follows for ParseError).
    logger.error({ err: (err as Error).message }, 'Plaid link token creation failed');
    throw new Error('Failed to create Plaid link token.');
  }
}

export interface ExchangeResult {
  accessToken: string;
  itemId: string;
}

export async function exchangePublicToken(
  publicToken: string,
): Promise<PlaidResult<ExchangeResult>> {
  if (!isPlaidEnabled()) return { enabled: false };
  const client = buildClient();
  try {
    const res = await client.itemPublicTokenExchange({ public_token: publicToken });
    return { enabled: true, data: { accessToken: res.data.access_token, itemId: res.data.item_id } };
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Plaid public token exchange failed');
    throw new Error('Failed to exchange Plaid public token.');
  }
}

export interface PlaidTxLike {
  date: string; // YYYY-MM-DD
  amount: number;
  merchantRaw: string;
}

/**
 * Pages through /transactions/sync to completion. No cursor is persisted
 * between calls (no column for it on Account, and adding one is out of
 * scope for this phase per plan.md's file tree) — every sync re-fetches
 * the full `added` history from a null cursor and relies on `dedupeKey`
 * (shared with CSV/OFX import, lib/dedupe.ts) to recognize transactions
 * already persisted. Known limitation: a transaction imported manually via
 * CSV for the same real-world purchase a Plaid-linked account also reports
 * will NOT be recognized as the same transaction — `dedupeKey` includes
 * `accountId`, so cross-account/cross-source collision is intentionally
 * out of scope here, not a bug in this function.
 */
export async function fetchAllTransactions(
  accessToken: string,
): Promise<PlaidResult<PlaidTxLike[]>> {
  if (!isPlaidEnabled()) return { enabled: false };
  const client = buildClient();
  const results: PlaidTxLike[] = [];
  try {
    let cursor: string | undefined;
    for (;;) {
      const res = await client.transactionsSync({ access_token: accessToken, cursor });
      for (const t of res.data.added) {
        results.push({
          date: t.date,
          amount: t.amount,
          merchantRaw: t.merchant_name ?? t.name,
        });
      }
      cursor = res.data.next_cursor;
      if (!res.data.has_more) break;
    }
    return { enabled: true, data: results };
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Plaid transactions fetch failed');
    throw new Error('Failed to fetch Plaid transactions.');
  }
}

export interface ApplyPlaidTransactionsResult {
  toCreate: Array<{
    date: Date;
    amount: number;
    merchantRaw: string;
    merchantNormalized: string;
    categoryId: string;
    categorySource: string;
    dedupeKey: string;
  }>;
  duplicateCount: number;
  categoryCounts: Record<string, number>;
}

/**
 * Pure categorize + dedupe core, deliberately separated from the network
 * fetch (`fetchAllTransactions`) and from persistence (`syncAccountTransactions`)
 * so Acceptance Scenario 2 ("repeated syncs, no duplicate entries") is
 * directly unit-testable offline, with no DB and no Plaid sandbox
 * credentials — same pure-core/thin-wrapper split as
 * `categorizeFromRules`/`lib/import/importStatement.ts`.
 */
export function applyPlaidTransactions(
  plaidTxs: PlaidTxLike[],
  accountId: string,
  rules: MerchantRuleLike[],
  categories: Array<{ id: string; name: string }>,
  uncategorizedCategoryId: string,
  existingKeys: Set<string>,
): ApplyPlaidTransactionsResult {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const seenInBatch = new Set<string>();
  const toCreate: ApplyPlaidTransactionsResult['toCreate'] = [];
  let duplicateCount = 0;
  const categoryCounts: Record<string, number> = {};

  for (const tx of plaidTxs) {
    const dedupeKey = computeDedupeKey({
      date: tx.date,
      amount: tx.amount,
      accountId,
      merchantRaw: tx.merchantRaw,
    });
    if (existingKeys.has(dedupeKey) || seenInBatch.has(dedupeKey)) {
      duplicateCount += 1;
      continue;
    }
    seenInBatch.add(dedupeKey);

    const merchantNormalized = normalizeMerchant(tx.merchantRaw);
    const { categoryId, source } = categorizeFromRules(
      merchantNormalized,
      rules,
      uncategorizedCategoryId,
    );
    const categoryName = categoryNameById.get(categoryId) ?? 'Uncategorized';
    categoryCounts[categoryName] = (categoryCounts[categoryName] ?? 0) + 1;

    toCreate.push({
      date: new Date(tx.date),
      amount: tx.amount,
      merchantRaw: tx.merchantRaw,
      merchantNormalized,
      categoryId,
      categorySource: source === 'RULE' ? 'RULE' : 'DEFAULT',
      dedupeKey,
    });
  }

  return { toCreate, duplicateCount, categoryCounts };
}

export type SyncOutcome =
  | {
      success: true;
      transactionCount: number;
      duplicateCount: number;
      categoryCounts: Record<string, number>;
    }
  | { success: false; reason: 'PLAID_DISABLED' | 'NOT_A_PLAID_ACCOUNT' | 'SYNC_FAILED' };

/**
 * DB-backed orchestrator: decrypt the stored access token, fetch, categorize,
 * dedupe, persist, and stamp `lastSyncedAt`. Never throws — a fetch failure
 * (sandbox account unreachable, token revoked, etc.) is caught, logged
 * (message only, never the raw error/axios object), and reported back as
 * `{ success: false, reason: 'SYNC_FAILED' }` so the caller (the initial
 * post-exchange sync, or any future re-sync) can leave existing data
 * untouched and surface a failure rather than wiping the dashboard
 * (spec Edge Case: sandbox account errors/unreachable during sync).
 *
 * `fetchFn` is injectable (defaults to `fetchAllTransactions`) so this can
 * be integration-tested against a real temp DB with a fixture Plaid
 * payload, with no network call and no sandbox credentials required.
 */
export async function syncAccountTransactions(
  accountId: string,
  client: PrismaClient = defaultPrisma,
  fetchFn: (accessToken: string) => Promise<PlaidResult<PlaidTxLike[]>> = fetchAllTransactions,
): Promise<SyncOutcome> {
  try {
    const account = await client.account.findUniqueOrThrow({ where: { id: accountId } });
    if (!account.accessTokenEncrypted) {
      return { success: false, reason: 'NOT_A_PLAID_ACCOUNT' };
    }

    const accessToken = decrypt(account.accessTokenEncrypted);
    const fetched = await fetchFn(accessToken);
    if (!fetched.enabled) {
      return { success: false, reason: 'PLAID_DISABLED' };
    }

    const [rules, categories] = await Promise.all([
      loadRulesForUser(account.userId, client),
      client.category.findMany(),
    ]);
    const uncategorized = categories.find((c) => c.name === 'Uncategorized');
    if (!uncategorized) {
      throw new Error('Uncategorized category not seeded. Run `npm run db:seed` first.');
    }

    const existingKeys = new Set(
      (
        await client.transaction.findMany({
          where: { accountId },
          select: { dedupeKey: true },
        })
      ).map((t) => t.dedupeKey),
    );

    const { toCreate, duplicateCount, categoryCounts } = applyPlaidTransactions(
      fetched.data,
      accountId,
      rules,
      categories,
      uncategorized.id,
      existingKeys,
    );

    await client.$transaction(async (tx) => {
      if (toCreate.length > 0) {
        await tx.transaction.createMany({
          data: toCreate.map((row) => ({ ...row, accountId })),
        });
      }
      await tx.account.update({ where: { id: accountId }, data: { lastSyncedAt: new Date() } });
    });

    logger.info(
      { accountId, transactionCount: toCreate.length, duplicateCount, categoryCounts },
      'Plaid sync completed',
    );

    return { success: true, transactionCount: toCreate.length, duplicateCount, categoryCounts };
  } catch (err) {
    logger.error({ accountId, err: (err as Error).message }, 'Plaid sync failed');
    return { success: false, reason: 'SYNC_FAILED' };
  }
}
