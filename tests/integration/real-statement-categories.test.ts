import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, createTestUser } from './setup';
import { importStatement } from '@/lib/import/importStatement';
import { computeMonthlySummaryFromDb } from '@/lib/aggregation/monthly-summary';
import { applyUserCategoryChoice } from '@/lib/categorization/learn';
import { recategorizeUserTransactions } from '@/lib/categorization/recategorize';

const CSV = [
  'Date,Description,Amount',
  '2026-10-02,PAYMENT FROM CHK 1234,-1395.71',
  '2026-10-03,SAMS CLUB #8112 PLANO TX,132.68',
  '2026-10-04,SQ *MCGARRAGH FARMS,23.40',
  '2026-10-04,STARBUCKS STORE 12345 PLANO TX,6.75',
  '2026-10-05,INTEREST CHARGED ON PURCHASES,0.00',
  '2026-10-05,INTEREST CHARGED ON CASH ADVANCES,0.00',
  '2026-10-05,TOTALLY UNKNOWN VENDOR,10.00',
].join('\n');

describe('real-statement categorization (integration)', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;
  let userId: string;
  let otherUserId: string;
  let accountId: string;

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    userId = (await createTestUser(client)).id;
    otherUserId = (await createTestUser(client)).id;
    accountId = (await client.account.create({ data: { name: 'Visa', type: 'MANUAL', userId } })).id;
  });
  afterAll(async () => {
    await cleanup();
  });

  it('categorizes on import, skips $0 lines, and keeps payments out of spend', async () => {
    const result = await importStatement(
      { userId, accountId, fileName: 's.csv', fileContent: CSV, format: 'CSV' },
      client,
    );
    expect(result.transactionCount).toBe(5); // 7 rows minus 2 zero-amount
    expect(result.notes.join(' ')).toMatch(/2 zero-amount/);
    expect(result.categories['Groceries']).toBe(2);
    expect(result.categories['Dining']).toBe(1);
    expect(result.categories['Payments/Transfers']).toBe(1);
    expect(result.categories['Uncategorized']).toBe(1);

    const summary = await computeMonthlySummaryFromDb({ userId }, client);
    const oct = summary.find((s) => s.yearMonth === '2026-10')!;
    const total = oct.categories.reduce((n, c) => n + c.total, 0);
    expect(total).toBeCloseTo(132.68 + 23.4 + 6.75 + 10, 2); // positive, payment excluded
    expect(oct.categories.find((c) => c.name === 'Payments/Transfers')).toBeUndefined();
  });

  it('a merchant autopay is spending, not a card payment (loadRulesForUser sets the fallback flag)', async () => {
    const acct = await client.account.create({ data: { name: 'Auto', type: 'MANUAL', userId } });
    const r = await importStatement(
      {
        userId,
        accountId: acct.id,
        fileName: 'a.csv',
        fileContent: 'Date,Description,Amount\n2026-10-06,GEICO AUTOPAY,120.00\n2026-10-06,AUTOPAY,-300.00',
        format: 'CSV',
      },
      client,
    );
    expect(r.categories['Car Insurance']).toBe(1);
    expect(r.categories['Payments/Transfers']).toBe(1);
  });

  it('recategorize fixes stale rows, never touches USER_OVERRIDE or other users', async () => {
    const uncategorized = await client.category.findUniqueOrThrow({ where: { name: 'Uncategorized' } });
    const health = await client.category.findUniqueOrThrow({ where: { name: 'Health' } });
    const groceries = await client.category.findUniqueOrThrow({ where: { name: 'Groceries' } });

    const sams = await client.transaction.findFirstOrThrow({ where: { merchantRaw: { contains: 'SAMS' } } });
    const star = await client.transaction.findFirstOrThrow({ where: { merchantRaw: { contains: 'STARBUCKS' } } });
    // Simulate rows imported before the new rules: stale DEFAULT row + a manual override.
    await client.transaction.update({
      where: { id: sams.id },
      data: { categoryId: uncategorized.id, categorySource: 'DEFAULT' },
    });
    await client.transaction.update({
      where: { id: star.id },
      data: { categoryId: health.id, categorySource: 'USER_OVERRIDE' },
    });
    // Another user's stale row must stay as-is.
    const otherAccount = await client.account.create({ data: { name: 'Other', type: 'MANUAL', userId: otherUserId } });
    const foreign = await client.transaction.create({
      data: {
        accountId: otherAccount.id,
        date: new Date('2026-10-03'),
        amount: 50,
        merchantRaw: 'COSTCO WHSE #1',
        merchantNormalized: 'costco whse #1',
        categoryId: uncategorized.id,
        categorySource: 'DEFAULT',
        dedupeKey: 'foreign-key-1',
      },
    });

    const first = await recategorizeUserTransactions(userId, client);
    expect(first.changed).toBe(1);
    expect((await client.transaction.findUniqueOrThrow({ where: { id: sams.id } })).categoryId).toBe(groceries.id);
    const starAfter = await client.transaction.findUniqueOrThrow({ where: { id: star.id } });
    expect(starAfter.categoryId).toBe(health.id);
    expect(starAfter.categorySource).toBe('USER_OVERRIDE');
    expect((await client.transaction.findUniqueOrThrow({ where: { id: foreign.id } })).categoryId).toBe(
      uncategorized.id,
    );

    const second = await recategorizeUserTransactions(userId, client); // idempotent
    expect(second.changed).toBe(0);
  });

  it('learns from a manual choice: same merchant updates now and on the next import; others cannot touch it', async () => {
    const acct = await client.account.create({ data: { name: 'Learn', type: 'MANUAL', userId } });
    const csv = (rows: string[]) => ['Date,Description,Amount', ...rows].join('\n');
    await importStatement(
      {
        userId,
        accountId: acct.id,
        fileName: 'l1.csv',
        fileContent: csv([
          '2026-11-01,SQ *JOES UNKNOWN STAND 0912,12.00',
          '2026-11-02,JOES UNKNOWN STAND #55 PLANO TX,9.00',
          '2026-11-02,NETFLIX.COM 866-579-7172 CA,15.49',
        ]),
        format: 'CSV',
      },
      client,
    );
    const groceries = await client.category.findUniqueOrThrow({ where: { name: 'Groceries' } });
    const entertainment = await client.category.findUniqueOrThrow({ where: { name: 'Entertainment' } });
    const first = await client.transaction.findFirstOrThrow({
      where: { accountId: acct.id, merchantRaw: { contains: 'SQ *JOES' } },
    });

    const out = await applyUserCategoryChoice(userId, first.id, groceries.id, client);
    expect(out.transaction?.categorySource).toBe('USER_OVERRIDE');
    expect(out.alsoUpdated).toBe(1);
    const second = await client.transaction.findFirstOrThrow({
      where: { accountId: acct.id, merchantRaw: { contains: '#55' } },
    });
    expect(second.categoryId).toBe(groceries.id);

    // Next month's statement, different store number: learned.
    const next = await importStatement(
      { userId, accountId: acct.id, fileName: 'l2.csv', fileContent: csv(['2026-12-01,JOES UNKNOWN STAND 7777,5.00']), format: 'CSV' },
      client,
    );
    expect(next.categories['Groceries']).toBe(1);

    // A manual choice on a built-in merchant beats the seed rule, and survives a recategorize.
    const nf = await client.transaction.findFirstOrThrow({ where: { accountId: acct.id, merchantRaw: { contains: 'NETFLIX' } } });
    await applyUserCategoryChoice(userId, nf.id, entertainment.id, client);
    await recategorizeUserTransactions(userId, client);
    expect((await client.transaction.findUniqueOrThrow({ where: { id: nf.id } })).categoryId).toBe(entertainment.id);

    // Someone else's transaction: not found, nothing changes.
    const intruder = await applyUserCategoryChoice(otherUserId, first.id, entertainment.id, client);
    expect(intruder.transaction).toBeNull();
    expect((await client.transaction.findUniqueOrThrow({ where: { id: first.id } })).categoryId).toBe(groceries.id);
  });
});
