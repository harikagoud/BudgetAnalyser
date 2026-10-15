import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, createTestUser } from './setup';
import { importStatement } from '@/lib/import/importStatement';
import {
  alertsForImportBatch,
  getBudgetReport,
  listLimits,
  removeLimit,
  setLimit,
  UnknownCategoryError,
} from '@/lib/budget/service';
import { deleteAccount } from '@/lib/auth/account-management';
import { hashPassword } from '@/lib/auth/password';

describe('budget limits', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;
  let groceries: string;
  let dining: string;

  const csv = (rows: [string, string, number][]) =>
    ['Date,Description,Amount', ...rows.map(([d, m, a]) => `${d},${m},${a.toFixed(2)}`)].join('\n');

  async function userWithAccount() {
    const { id: userId } = await createTestUser(client);
    const account = await client.account.create({ data: { userId, name: 'A', type: 'MANUAL' } });
    return { userId, accountId: account.id };
  }

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    groceries = (await client.category.findUniqueOrThrow({ where: { name: 'Groceries' } })).id;
    dining = (await client.category.findUniqueOrThrow({ where: { name: 'Dining' } })).id;
  });
  afterAll(async () => {
    await cleanup();
  });

  it('set, replace, list and remove a limit', async () => {
    const { id: userId } = await createTestUser(client);
    await setLimit(client, userId, groceries, 600);
    await setLimit(client, userId, groceries, 650.5); // replaces, not duplicates
    expect(await listLimits(client, userId)).toEqual([{ categoryId: groceries, name: 'Groceries', amount: 650.5 }]);
    await removeLimit(client, userId, groceries);
    await removeLimit(client, userId, groceries); // idempotent
    expect(await listLimits(client, userId)).toEqual([]);
  });

  it('an unknown category is rejected', async () => {
    const { id: userId } = await createTestUser(client);
    await expect(setLimit(client, userId, 'nope', 10)).rejects.toBeInstanceOf(UnknownCategoryError);
  });

  it("users cannot see or change each other's limits", async () => {
    const alice = await createTestUser(client);
    const bob = await createTestUser(client);
    await setLimit(client, alice.id, dining, 200);
    expect(await listLimits(client, bob.id)).toEqual([]);
    await removeLimit(client, bob.id, dining); // Bob "deleting" Alice's category limit touches only Bob's rows
    expect(await listLimits(client, alice.id)).toHaveLength(1);
    await setLimit(client, bob.id, dining, 50);
    expect((await listLimits(client, alice.id))[0].amount).toBe(200);
  });

  it('report defaults to the latest month with data and uses net-of-refund totals', async () => {
    const { userId, accountId } = await userWithAccount();
    await importStatement(
      {
        userId, accountId, fileName: 'a.csv', format: 'CSV',
        fileContent: csv([
          ['2026-08-05', 'WHOLE FOODS', 100],
          ['2026-09-02', 'WHOLE FOODS', 300],
          ['2026-09-09', 'SAFEWAY', 240],
          ['2026-09-12', 'WHOLE FOODS', -40], // refund
        ]),
      },
      client,
    );
    await setLimit(client, userId, groceries, 500);

    const latest = await getBudgetReport(client, userId);
    expect(latest.month).toBe('2026-09');
    expect(latest.statuses[0]).toMatchObject({ spent: 500, level: 'over' }); // 300+240-40 = 500 = limit, "reached"
    const august = await getBudgetReport(client, userId, '2026-08');
    expect(august.statuses[0]).toMatchObject({ spent: 100, level: 'ok' });
    expect(august.alerts).toEqual([]);
    expect((await getBudgetReport(client, userId, '2030-01')).month).toBe('2026-09'); // unknown month -> latest
  });

  it('no data, no limits -> empty report, no error', async () => {
    const { id } = await createTestUser(client);
    const report = await getBudgetReport(client, id);
    expect(report).toMatchObject({ month: null, limits: [], statuses: [], alerts: [] });
    // a brand-new user (no imports yet) can still pick a category to set a limit on
    expect(report.categories.map((c) => c.name)).toEqual(expect.arrayContaining(['Groceries', 'Dining']));
    await setLimit(client, id, report.categories[0].categoryId, 50);
    expect((await getBudgetReport(client, id)).statuses[0]).toMatchObject({ spent: 0, level: 'ok' });
  });

  it('an import that crosses a limit reports it, labelled with its month', async () => {
    const { userId, accountId } = await userWithAccount();
    await setLimit(client, userId, dining, 100);
    const res = await importStatement(
      {
        userId, accountId, fileName: 'd.csv', format: 'CSV',
        fileContent: csv([['2026-03-04', 'STARBUCKS', 60], ['2026-03-20', 'CHIPOTLE', 45]]),
      },
      client,
    );
    const alerts = await alertsForImportBatch(client, userId, res.importBatchId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].month).toBe('2026-03');
    expect(alerts[0].alerts[0]).toMatchObject({ name: 'Dining', spent: 105, level: 'over' });

    // another user's batch id reveals nothing
    const other = await createTestUser(client);
    expect(await alertsForImportBatch(client, other.id, res.importBatchId)).toEqual([]);
  });

  it('deleting the account removes its limits (and only its limits)', async () => {
    const keep = await createTestUser(client);
    await setLimit(client, keep.id, groceries, 100);
    const { id: userId } = await createTestUser(client);
    await client.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword('delete-me-pw-1') } });
    await setLimit(client, userId, groceries, 300);
    await setLimit(client, userId, dining, 100);

    await deleteAccount(client, userId, { password: 'delete-me-pw-1' });
    expect(await client.budgetLimit.count({ where: { userId } })).toBe(0);
    expect(await listLimits(client, keep.id)).toHaveLength(1);
  });
});
