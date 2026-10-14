import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, createTestUser } from './setup';
import { importStatement } from '@/lib/import/importStatement';

describe('import flow integration', () => {
  let client: PrismaClient;
  let cleanup: () => void;
  let userId: string;

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    userId = (await createTestUser(client)).id;
  });

  afterAll(async () => {
    await client.$disconnect();
    cleanup();
  });

  it('imports sample-statement.csv into a persisted ImportBatch matching the file row count', async () => {
    const account = await client.account.create({
      data: { name: 'Test Account', type: 'MANUAL', userId },
    });

    const csvPath = path.resolve(__dirname, '../fixtures/sample-statement.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const expectedRowCount = fileContent.trim().split('\n').length - 1; // minus header

    const result = await importStatement(
      { userId, accountId: account.id, fileName: 'sample-statement.csv', fileContent, format: 'CSV' },
      client,
    );

    expect(result.errorCount).toBe(0);
    expect(result.duplicateCount).toBe(1); // fixture contains one exact duplicate pair
    expect(result.transactionCount).toBe(expectedRowCount - result.duplicateCount);

    const batch = await client.importBatch.findUnique({ where: { id: result.importBatchId } });
    expect(batch).not.toBeNull();
    expect(batch?.transactionCount).toBe(result.transactionCount);
    expect(batch?.errorCount).toBe(0);

    const persistedCount = await client.transaction.count({ where: { accountId: account.id } });
    expect(persistedCount).toBe(result.transactionCount);
  });

  // spec.md Edge Case (T061): the same statement uploaded twice must not
  // double-count toward spend totals.
  it('re-uploading the same statement creates zero new transactions', async () => {
    const account = await client.account.create({ data: { name: 'Reupload', type: 'MANUAL', userId } });
    const fileContent = fs.readFileSync(
      path.resolve(__dirname, '../fixtures/sample-statement.csv'),
      'utf8',
    );
    const params = {
      userId,
      accountId: account.id,
      fileName: 'sample-statement.csv',
      fileContent,
      format: 'CSV' as const,
    };
    const first = await importStatement(params, client);
    const second = await importStatement(params, client);

    expect(second.transactionCount).toBe(0);
    expect(second.duplicateCount).toBe(first.transactionCount + first.duplicateCount);
    expect(await client.transaction.count({ where: { accountId: account.id } })).toBe(
      first.transactionCount,
    );
  });

  // spec.md Edge Case (T061): a refund row in an imported statement is
  // persisted as a negative amount and reduces its category's total.
  it('persists a negative-amount refund row and nets it against its category', async () => {
    const account = await client.account.create({ data: { name: 'Refunds', type: 'MANUAL', userId } });
    const fileContent = [
      'Date,Description,Amount',
      '2026-03-02,STARBUCKS #1,40.00',
      '2026-03-09,STARBUCKS #1,-15.00',
    ].join('\n');
    const result = await importStatement(
      { userId, accountId: account.id, fileName: 'refund.csv', fileContent, format: 'CSV' },
      client,
    );
    expect(result.transactionCount).toBe(2);
    const rows = await client.transaction.findMany({ where: { accountId: account.id } });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(25);
    expect(rows.some((r) => r.amount === -15)).toBe(true);
  });
});
