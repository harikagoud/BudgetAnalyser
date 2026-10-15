import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, createTestUser } from './setup';
import { importStatement } from '@/lib/import/importStatement';
import { makePdf, makeXlsx } from '../helpers/make-files';

describe('importStatement: other statement formats', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    userId = (await createTestUser(client)).id;
    accountId = (await client.account.create({ data: { userId, name: 'A', type: 'MANUAL' } })).id;
  });
  afterAll(async () => {
    await cleanup();
  });

  it('imports an Excel statement and categorizes it', async () => {
    const fileBytes = await makeXlsx([
      ['Date', 'Description', 'Amount'],
      [new Date(Date.UTC(2026, 8, 3)), 'WHOLE FOODS MARKET', 42.1],
      [new Date(Date.UTC(2026, 8, 5)), 'NETFLIX.COM', 12],
    ]);
    const res = await importStatement({ userId, accountId, fileName: 's.xlsx', fileBytes, format: 'XLSX' }, client);
    expect(res.transactionCount).toBe(2);
    expect(res.categories).toMatchObject({ Groceries: 1, Subscriptions: 1 });
  });

  it('the same transactions arriving as CSV afterwards are recognised as duplicates', async () => {
    const fileContent = 'Date,Description,Amount\n2026-09-03,WHOLE FOODS MARKET,42.10\n2026-09-05,NETFLIX.COM,12.00\n';
    const res = await importStatement({ userId, accountId, fileName: 's.csv', fileContent, format: 'CSV' }, client);
    expect(res.transactionCount).toBe(0);
    expect(res.duplicateCount).toBe(2);
  });

  it('imports a PDF statement, records best-effort notes and unreadable lines', async () => {
    const fileBytes = await makePdf(
      [
        ['Statement Period 10/01/2026 - 10/31/2026'],
        ['10/02', '10/03', 'SAFEWAY #334', '$45.00'],
        ['10/04', '10/05', 'MYSTERY LINE WITH NO MONEY'],
        ['10/06', '10/07', 'SHELL OIL', '$38.20'],
      ],
      [40, 110, 180, 420],
    );
    const res = await importStatement({ userId, accountId, fileName: 's.pdf', fileBytes, format: 'PDF' }, client);
    expect(res.transactionCount).toBe(2);
    expect(res.errorCount).toBe(1);
    expect(res.notes.join(' ')).toMatch(/best-effort/i);
    const batch = await client.importBatch.findUniqueOrThrow({ where: { id: res.importBatchId } });
    expect(batch.format).toBe('PDF');
    expect(batch.errorCount).toBe(1);
  });

  it('a sign flip is reported in the result notes', async () => {
    const fileContent = [
      'Date,Description,Amount',
      '2026-11-01,SAFEWAY #334,-30.00',
      '2026-11-02,WHOLE FOODS MARKET,-20.00',
      '2026-11-03,SHELL OIL,-15.00',
      '2026-11-04,ACME PAYROLL,500.00',
    ].join('\n');
    const res = await importStatement({ userId, accountId, fileName: 'c.csv', fileContent, format: 'CSV' }, client);
    expect(res.notes.join(' ')).toMatch(/negative/i);
    const rows = await client.transaction.findMany({ where: { importBatchId: res.importBatchId }, orderBy: { date: 'asc' } });
    expect(rows.map((r) => r.amount)).toEqual([30, 20, 15, -500]);
  });

  it('QIF import uses the defined sign', async () => {
    const fileContent = ['!Type:CCard', "D12/3'26", 'T-9.99', 'PSPOTIFY', '^'].join('\n');
    const res = await importStatement({ userId, accountId, fileName: 'q.qif', fileContent, format: 'QIF' }, client);
    expect(res.transactionCount).toBe(1);
    const row = await client.transaction.findFirstOrThrow({ where: { importBatchId: res.importBatchId } });
    expect(row.amount).toBe(9.99);
  });
});
