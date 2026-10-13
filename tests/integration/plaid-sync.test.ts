import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb } from './setup';
import { syncAccountTransactions } from '@/lib/plaid/client';
import { encrypt } from '@/lib/security/encryption';

/**
 * Integration coverage for US5 Acceptance Scenario 2 ("new sandbox
 * transactions are pulled in and categorized without duplicate entries on
 * repeated syncs") and the sync-failure Edge Case. Runs against a real
 * temp SQLite DB (createTestDb) but with the network fetch replaced by an
 * injected fixture — this environment has no Plaid sandbox credentials
 * (PLAID_CLIENT_ID/PLAID_SECRET are blank in .env), so this is the
 * offline-verifiable half of US5; the other half (actually hitting Plaid
 * sandbox via a real link token + public token exchange) is not exercised
 * by this suite.
 */
describe('syncAccountTransactions (US5, T055 integration)', () => {
  let client: PrismaClient;
  let cleanup: () => void;
  let accountId: string;

  const fixturePage = {
    enabled: true as const,
    data: [
      { date: '2026-09-03', amount: 42.1, merchantRaw: 'WHOLE FOODS MARKET' },
      { date: '2026-09-05', amount: 12.0, merchantRaw: 'NETFLIX.COM' },
    ],
  };

  beforeAll(async () => {
    // encryption.ts reads ENCRYPTION_KEY lazily (inside encrypt/decrypt, not
    // at module scope), so this is the only place this suite needs it set —
    // vitest does not auto-load .env, so set a throwaway 32-byte key here.
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;

    const account = await client.account.create({
      data: {
        name: 'Sandbox Checking',
        type: 'PLAID',
        plaidItemId: 'item-sandbox-fake',
        accessTokenEncrypted: encrypt('access-sandbox-fake-token'),
      },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await client.$disconnect();
    cleanup();
  });

  it('persists fetched transactions, categorizes them, and stamps lastSyncedAt', async () => {
    const outcome = await syncAccountTransactions(accountId, client, async () => fixturePage);
    expect(outcome).toEqual({
      success: true,
      transactionCount: 2,
      duplicateCount: 0,
      categoryCounts: expect.any(Object),
    });

    const persisted = await client.transaction.count({ where: { accountId } });
    expect(persisted).toBe(2);

    const updated = await client.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(updated.lastSyncedAt).not.toBeNull();
  });

  it('a repeated sync with the same fetched page produces zero new transactions (Scenario 2)', async () => {
    const outcome = await syncAccountTransactions(accountId, client, async () => fixturePage);
    expect(outcome).toEqual({
      success: true,
      transactionCount: 0,
      duplicateCount: 2,
      categoryCounts: {},
    });

    const persisted = await client.transaction.count({ where: { accountId } });
    expect(persisted).toBe(2); // still 2, not 4
  });

  it('a fetch failure is reported, not thrown, and leaves existing data untouched (sync-failure Edge Case)', async () => {
    const before = await client.transaction.count({ where: { accountId } });

    const outcome = await syncAccountTransactions(accountId, client, async () => {
      throw new Error('ECONNRESET: sandbox unreachable');
    });
    expect(outcome).toEqual({ success: false, reason: 'SYNC_FAILED' });

    const after = await client.transaction.count({ where: { accountId } });
    expect(after).toBe(before);
  });

  it('a non-Plaid account (no accessTokenEncrypted) is reported as not syncable, not an error', async () => {
    const manualAccount = await client.account.create({
      data: { name: 'Manual Account', type: 'MANUAL' },
    });
    const outcome = await syncAccountTransactions(manualAccount.id, client, async () => fixturePage);
    expect(outcome).toEqual({ success: false, reason: 'NOT_A_PLAID_ACCOUNT' });
  });
});
