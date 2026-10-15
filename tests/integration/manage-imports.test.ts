import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, createTestUser } from './setup';
import { importStatement } from '@/lib/import/importStatement';
import { computeMonthlySummaryFromDb } from '@/lib/aggregation/monthly-summary';
import { deleteImportBatch, deleteManualAccount, listImportsForUser } from '@/lib/import/manage';

const CSV1 = 'Date,Description,Amount\n2026-10-01,COSTCO WHSE #1,100.00\n2026-10-02,STARBUCKS,5.00';
const CSV2 = 'Date,Description,Amount\n2026-10-02,STARBUCKS,5.00\n2026-10-03,NETFLIX.COM,15.00'; // overlaps CSV1

describe('deleting uploads and accounts', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;
  let alice: string;
  let bob: string;
  let accountId: string;

  const upload = (content: string, name: string) =>
    importStatement({ userId: alice, accountId, fileName: name, fileContent: content, format: 'CSV' }, client);
  const total = async () => {
    const s = await computeMonthlySummaryFromDb({ userId: alice }, client);
    return s.flatMap((m) => m.categories).reduce((n, c) => n + c.total, 0);
  };

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    alice = (await createTestUser(client)).id;
    bob = (await createTestUser(client)).id;
    accountId = (await client.account.create({ data: { name: 'Visa', type: 'MANUAL', userId: alice } })).id;
  });
  afterAll(async () => {
    await cleanup();
  });

  it('deleting an upload removes its transactions (totals drop) and re-uploading restores them', async () => {
    const first = await upload(CSV1, 'a.csv');
    expect(first.transactionCount).toBe(2);
    expect(await total()).toBeCloseTo(105, 2);

    expect(await deleteImportBatch(bob, first.importBatchId, client)).toBeNull(); // someone else's
    expect(await total()).toBeCloseTo(105, 2);

    const gone = await deleteImportBatch(alice, first.importBatchId, client);
    expect(gone).toEqual({ deletedTransactions: 2 });
    expect(await total()).toBe(0);
    expect(await client.transaction.count({ where: { accountId } })).toBe(0); // none orphaned
    expect(await client.importBatch.count({ where: { accountId } })).toBe(0);

    const again = await upload(CSV1, 'a.csv');
    expect(again.transactionCount).toBe(2); // same rows come back
    expect(again.duplicateCount).toBe(0);
  });

  it('with overlapping uploads, rows belong to the first upload that added them', async () => {
    const second = await upload(CSV2, 'b.csv'); // STARBUCKS is a duplicate of the earlier batch
    expect(second.transactionCount).toBe(1);
    const list = await listImportsForUser(alice, client);
    expect(list.map((b) => b.transactionCount).sort()).toEqual([1, 2]); // live counts
    expect(await listImportsForUser(bob, client)).toEqual([]);

    const earlier = list.find((b) => b.fileName === 'a.csv')!;
    await deleteImportBatch(alice, earlier.id, client);
    expect(await client.transaction.count({ where: { accountId } })).toBe(1); // only NETFLIX remains
  });

  it('account delete: owner-only, linked accounts refused, everything removed in order', async () => {
    expect(await deleteManualAccount(bob, accountId, client)).toEqual({ status: 'NOT_FOUND' });
    const linked = await client.account.create({
      data: { name: 'Bank', type: 'PLAID', userId: alice, plaidItemId: 'i', accessTokenEncrypted: 'x' },
    });
    expect(await deleteManualAccount(alice, linked.id, client)).toEqual({ status: 'IS_LINKED' });
    expect(await client.account.count({ where: { id: linked.id } })).toBe(1);

    expect(await deleteManualAccount(alice, accountId, client)).toEqual({ status: 'DELETED', deletedTransactions: 1 });
    expect(await client.account.count({ where: { id: accountId } })).toBe(0);
    expect(await client.importBatch.count({ where: { accountId } })).toBe(0);
    expect(await client.transaction.count({ where: { accountId } })).toBe(0);
  });
});
