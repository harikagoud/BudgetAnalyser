import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { decrypt } from '@/lib/security/encryption';
import { logger } from '@/lib/logger';
import {
  removePlaidItem,
  syncAccountTransactions,
  type RemoveItemResult,
  type SyncOutcome,
} from '@/lib/plaid/client';

/** "Sync now" presses and page-load refreshes within this window are answered from stored data. */
export const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export type OwnedSyncOutcome = SyncOutcome | { success: false; reason: 'NOT_FOUND' } | { success: true; throttled: true };

/** Sync one of the caller's linked accounts. Ownership is checked here, not in the sync itself. */
export async function syncOwnedAccount(
  userId: string,
  accountId: string,
  options: { force?: boolean } = {},
  client: PrismaClient = defaultPrisma,
  syncFn: typeof syncAccountTransactions = syncAccountTransactions,
): Promise<OwnedSyncOutcome> {
  const account = await client.account.findFirst({
    where: { id: accountId, userId, type: 'PLAID' },
    select: { id: true, lastSyncedAt: true },
  });
  if (!account) return { success: false, reason: 'NOT_FOUND' };
  if (
    !options.force &&
    account.lastSyncedAt &&
    Date.now() - account.lastSyncedAt.getTime() < MIN_SYNC_INTERVAL_MS
  ) {
    return { success: true, throttled: true };
  }
  return syncFn(account.id, client);
}

export type DisconnectOutcome = 'DISCONNECTED' | 'NOT_FOUND' | 'REVOKE_FAILED';

/**
 * Stops the bank connection (revokes the token at Plaid) but keeps the transactions already
 * imported; the account becomes a normal imported account you can still upload statements to.
 */
export async function disconnectOwnedAccount(
  userId: string,
  accountId: string,
  client: PrismaClient = defaultPrisma,
  removeFn: (accessToken: string) => Promise<RemoveItemResult> = removePlaidItem,
): Promise<DisconnectOutcome> {
  const account = await client.account.findFirst({
    where: { id: accountId, userId, type: 'PLAID' },
    select: { id: true, accessTokenEncrypted: true },
  });
  if (!account) return 'NOT_FOUND';

  if (account.accessTokenEncrypted) {
    const result = await removeFn(decrypt(account.accessTokenEncrypted));
    // Only 'removed' / 'gone' mean access is really revoked. 'failed' and 'disabled' (Plaid turned
    // off on this server) keep the token, so a live bank connection is never silently orphaned.
    if (result !== 'removed' && result !== 'gone') return 'REVOKE_FAILED';
  }
  await client.account.update({
    where: { id: account.id },
    data: { type: 'MANUAL', accessTokenEncrypted: null, plaidItemId: null },
  });
  return 'DISCONNECTED';
}

/** Best-effort revoke of every linked bank connection a user has (used when they delete their account). */
export async function revokeAllPlaidItemsForUser(
  userId: string,
  client: PrismaClient = defaultPrisma,
  removeFn: (accessToken: string) => Promise<RemoveItemResult> = removePlaidItem,
): Promise<void> {
  const accounts = await client.account.findMany({
    where: { userId, type: 'PLAID', accessTokenEncrypted: { not: null } },
    select: { id: true, accessTokenEncrypted: true },
  });
  for (const a of accounts) {
    try {
      const result = await removeFn(decrypt(a.accessTokenEncrypted as string));
      if (result === 'failed') logger.warn({ accountId: a.id }, 'Could not revoke Plaid item during account deletion');
    } catch (err) {
      logger.warn({ accountId: a.id, err: (err as Error).message }, 'Plaid revoke threw during account deletion');
    }
  }
}

/** Daily cron: refresh every linked account. One failing account never stops the others. */
export async function syncAllPlaidAccounts(
  client: PrismaClient = defaultPrisma,
  syncFn: typeof syncAccountTransactions = syncAccountTransactions,
): Promise<{ accounts: number; succeeded: number; failed: number }> {
  const accounts = await client.account.findMany({
    where: { type: 'PLAID', accessTokenEncrypted: { not: null } },
    select: { id: true },
  });
  let succeeded = 0;
  for (const a of accounts) {
    const outcome = await syncFn(a.id, client);
    if (outcome.success) succeeded += 1;
  }
  return { accounts: accounts.length, succeeded, failed: accounts.length - succeeded };
}
