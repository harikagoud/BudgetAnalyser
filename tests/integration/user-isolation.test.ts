import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb } from './setup';
import { registerUser } from '@/lib/auth/service';
import { importStatement } from '@/lib/import/importStatement';
import { computeMonthlySummaryFromDb } from '@/lib/aggregation/monthly-summary';
import { upsertUserRule } from '@/lib/categorization/engine';
import { getOwnedAccount } from '@/lib/accounts';

const CSV = ['Date,Description,Amount', '2026-03-02,QQQ MYSTERY VENDOR,41.00'].join('\n');

describe('per-user data isolation', () => {
  let client: PrismaClient;
  let cleanup: () => void;
  let alice: { id: string };
  let bob: { id: string };
  let aliceAccount: string;
  let bobAccount: string;

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    alice = await registerUser(client, { email: 'alice@example.com', password: 'alice-password' });
    bob = await registerUser(client, { email: 'bob@example.com', password: 'bob-password-1' });
    aliceAccount = (await client.account.create({ data: { name: 'A', type: 'MANUAL', userId: alice.id } })).id;
    bobAccount = (await client.account.create({ data: { name: 'B', type: 'MANUAL', userId: bob.id } })).id;
  });
  afterAll(async () => {
    await client.$disconnect();
    cleanup();
  });

  it('getOwnedAccount returns your account and null for someone else\'s (no IDOR)', async () => {
    expect((await getOwnedAccount(client, alice.id, aliceAccount))?.id).toBe(aliceAccount);
    expect(await getOwnedAccount(client, alice.id, bobAccount)).toBeNull();
    expect(await getOwnedAccount(client, alice.id, 'does-not-exist')).toBeNull();
  });

  it('monthly summaries only include the requesting user\'s transactions', async () => {
    await importStatement(
      { userId: alice.id, accountId: aliceAccount, fileName: 'a.csv', fileContent: CSV, format: 'CSV' },
      client,
    );
    const aliceMonths = await computeMonthlySummaryFromDb({ userId: alice.id, months: 6 }, client);
    const bobMonths = await computeMonthlySummaryFromDb({ userId: bob.id, months: 6 }, client);
    expect(aliceMonths.length).toBe(1);
    expect(aliceMonths[0].categories.reduce((s, c) => s + c.total, 0)).toBe(41);
    expect(bobMonths).toEqual([]);
  });

  it('one user\'s category override (USER rule) does not affect another user\'s imports', async () => {
    const dining = await client.category.findUniqueOrThrow({ where: { name: 'Dining' } });
    await upsertUserRule('QQQ MYSTERY VENDOR', dining.id, alice.id, client);

    const bobResult = await importStatement(
      { userId: bob.id, accountId: bobAccount, fileName: 'b.csv', fileContent: CSV, format: 'CSV' },
      client,
    );
    expect(bobResult.categories).toEqual({ Uncategorized: 1 });

    // ...while Alice's own re-import of a new row for the same merchant does use her rule.
    const aliceResult = await importStatement(
      {
        userId: alice.id,
        accountId: aliceAccount,
        fileName: 'a2.csv',
        fileContent: ['Date,Description,Amount', '2026-03-09,QQQ MYSTERY VENDOR,12.00'].join('\n'),
        format: 'CSV',
      },
      client,
    );
    expect(aliceResult.categories).toEqual({ Dining: 1 });
  });

  it('settings are keyed per user (no collision on the same key)', async () => {
    await client.userSetting.create({ data: { userId: alice.id, key: 'riskTolerance', value: 'aggressive' } });
    await client.userSetting.create({ data: { userId: bob.id, key: 'riskTolerance', value: 'conservative' } });
    const a = await client.userSetting.findUniqueOrThrow({
      where: { userId_key: { userId: alice.id, key: 'riskTolerance' } },
    });
    const b = await client.userSetting.findUniqueOrThrow({
      where: { userId_key: { userId: bob.id, key: 'riskTolerance' } },
    });
    expect([a.value, b.value]).toEqual(['aggressive', 'conservative']);
  });
});
