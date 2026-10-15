import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, createTestUser } from './setup';
import { encrypt } from '@/lib/security/encryption';
import {
  disconnectOwnedAccount,
  revokeAllPlaidItemsForUser,
  syncAllPlaidAccounts,
  syncOwnedAccount,
} from '@/lib/plaid/accounts';
import type { SyncOutcome } from '@/lib/plaid/client';

const OK: SyncOutcome = { success: true, transactionCount: 1, duplicateCount: 0, categoryCounts: {} };

describe('linked-account operations', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    alice = (await createTestUser(client)).id;
    bob = (await createTestUser(client)).id;
  });
  afterAll(async () => {
    await cleanup();
  });

  const linked = (userId: string, name: string, extra: Record<string, unknown> = {}) =>
    client.account.create({
      data: { userId, name, type: 'PLAID', plaidItemId: `item-${name}`, accessTokenEncrypted: encrypt(`tok-${name}`), ...extra },
    });

  it('sync is owner-only: another user gets NOT_FOUND and nothing is fetched', async () => {
    const a = await linked(alice, 'own1');
    const sync = vi.fn(async () => OK);
    expect(await syncOwnedAccount(bob, a.id, { force: true }, client, sync)).toEqual({ success: false, reason: 'NOT_FOUND' });
    expect(sync).not.toHaveBeenCalled();
    expect(await syncOwnedAccount(alice, a.id, { force: true }, client, sync)).toEqual(OK);
  });

  it('a manual (non-Plaid) account is not syncable through this path', async () => {
    const m = await client.account.create({ data: { userId: alice, name: 'manual', type: 'MANUAL' } });
    const sync = vi.fn(async () => OK);
    expect(await syncOwnedAccount(alice, m.id, { force: true }, client, sync)).toEqual({ success: false, reason: 'NOT_FOUND' });
  });

  it('a recent sync is throttled unless forced', async () => {
    const a = await linked(alice, 'recent', { lastSyncedAt: new Date() });
    const sync = vi.fn(async () => OK);
    expect(await syncOwnedAccount(alice, a.id, {}, client, sync)).toEqual({ success: true, throttled: true });
    expect(sync).not.toHaveBeenCalled();
    await syncOwnedAccount(alice, a.id, { force: true }, client, sync);
    expect(sync).toHaveBeenCalledTimes(1);
    const old = await linked(alice, 'old', { lastSyncedAt: new Date(Date.now() - 3600_000) });
    await syncOwnedAccount(alice, old.id, {}, client, sync);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('disconnect revokes at Plaid, keeps history, and clears the token', async () => {
    const a = await linked(alice, 'disc');
    await client.transaction.create({
      data: {
        accountId: a.id, date: new Date('2026-10-01'), amount: 5, merchantRaw: 'X', merchantNormalized: 'x',
        categoryId: (await client.category.findUniqueOrThrow({ where: { name: 'Uncategorized' } })).id,
        categorySource: 'DEFAULT', dedupeKey: 'disc-1',
      },
    });
    const remove = vi.fn(async () => 'removed' as const);
    expect(await disconnectOwnedAccount(bob, a.id, client, remove)).toBe('NOT_FOUND');
    expect(remove).not.toHaveBeenCalled();
    expect(await disconnectOwnedAccount(alice, a.id, client, remove)).toBe('DISCONNECTED');
    expect(remove).toHaveBeenCalledWith('tok-disc');
    const after = await client.account.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.type).toBe('MANUAL');
    expect(after.accessTokenEncrypted).toBeNull();
    expect(after.plaidItemId).toBeNull();
    expect(await client.transaction.count({ where: { accountId: a.id } })).toBe(1);
  });

  it('if Plaid cannot be reached the connection is kept so the user can retry', async () => {
    const a = await linked(alice, 'retry');
    expect(await disconnectOwnedAccount(alice, a.id, client, async () => 'failed')).toBe('REVOKE_FAILED');
    const after = await client.account.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.type).toBe('PLAID');
    expect(after.accessTokenEncrypted).not.toBeNull();
    // 'gone' (already removed at Plaid) still disconnects locally
    expect(await disconnectOwnedAccount(alice, a.id, client, async () => 'gone')).toBe('DISCONNECTED');
  });

  it("Plaid switched off on the server ('disabled') does not disconnect locally: the live connection would be orphaned", async () => {
    const a = await linked(alice, 'off');
    expect(await disconnectOwnedAccount(alice, a.id, client, async () => 'disabled')).toBe('REVOKE_FAILED');
    expect((await client.account.findUniqueOrThrow({ where: { id: a.id } })).type).toBe('PLAID');
  });

  it('deleting a user revokes all their items, and one failure does not stop the rest', async () => {
    const carol = (await createTestUser(client)).id;
    await linked(carol, 'c1');
    await linked(carol, 'c2');
    const seen: string[] = [];
    await revokeAllPlaidItemsForUser(carol, client, async (t) => {
      seen.push(t);
      if (t === 'tok-c1') throw new Error('boom');
      return 'removed';
    });
    expect(seen.sort()).toEqual(['tok-c1', 'tok-c2']);
  });

  it('the daily sync covers every linked account and isolates failures', async () => {
    const dave = (await createTestUser(client)).id;
    const good = await linked(dave, 'good');
    const bad = await linked(dave, 'bad');
    const calls: string[] = [];
    const result = await syncAllPlaidAccounts(client, async (id) => {
      calls.push(id);
      return id === bad.id ? { success: false, reason: 'SYNC_FAILED' } : OK;
    });
    expect(calls).toEqual(expect.arrayContaining([good.id, bad.id]));
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.succeeded + result.failed).toBe(result.accounts);
  });
});
