import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, createTestUser } from './setup';
import { computeMonthlySummaryFromDb } from '@/lib/aggregation/monthly-summary';

describe('computeMonthlySummaryFromDb window consistency (US2)', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;
  let userId: string;

  beforeAll(async () => {
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
    userId = (await createTestUser(client)).id;

    const account = await client.account.create({
      data: { name: 'Window Test Account', type: 'MANUAL', userId },
    });
    const category = await client.category.findFirstOrThrow({ where: { name: 'Dining' } });

    // Three consecutive full (non-partial) months of Dining spend.
    const months = [
      { date: '2026-07-01', amount: 50 },
      { date: '2026-08-01', amount: 80 },
      { date: '2026-09-01', amount: 127.7 },
    ];
    for (const m of months) {
      await client.transaction.create({
        data: {
          accountId: account.id,
          date: new Date(m.date),
          amount: m.amount,
          merchantRaw: 'TEST DINING MERCHANT',
          merchantNormalized: 'test dining merchant',
          categoryId: category.id,
          categorySource: 'DEFAULT',
          dedupeKey: `window-test-${m.date}`,
        },
      });
    }
  });

  afterAll(async () => {
    await cleanup(); // drops the schema and disconnects
  });

  it('strips the delta from the earliest returned month when its comparison month is outside the window', async () => {
    // Full history has 3 months (Jul, Aug, Sep); request only the last 2.
    const summaries = await computeMonthlySummaryFromDb({ userId, months: 2 }, client);

    expect(summaries.map((s) => s.yearMonth)).toEqual(['2026-08', '2026-09']);

    const aug = summaries.find((s) => s.yearMonth === '2026-08');
    const sep = summaries.find((s) => s.yearMonth === '2026-09');
    const augDining = aug?.categories.find((c) => c.name === 'Dining');
    const sepDining = sep?.categories.find((c) => c.name === 'Dining');

    // Aug's true predecessor (Jul) is outside the 2-month window, so Aug's
    // delta must be stripped, not silently computed against Jul anyway.
    expect(augDining?.momDeltaAmount).toBeUndefined();
    expect(augDining?.momDeltaPercent).toBeUndefined();
    expect(augDining?.flaggedIncrease).toBeUndefined();

    // Sep's predecessor (Aug) IS inside the window, so its delta stands.
    expect(sepDining?.momDeltaAmount).toBe(47.7);
  });

  it('omits delta fields entirely for a single-month window (months=1)', async () => {
    const summaries = await computeMonthlySummaryFromDb({ userId, months: 1 }, client);

    expect(summaries.map((s) => s.yearMonth)).toEqual(['2026-09']);
    const sep = summaries[0];
    expect(sep.categories.every((c) => c.momDeltaAmount === undefined)).toBe(true);
  });

  it('keeps the true previous-month delta when the full window is requested', async () => {
    const summaries = await computeMonthlySummaryFromDb({ userId, months: 6 }, client);

    expect(summaries.map((s) => s.yearMonth)).toEqual(['2026-07', '2026-08', '2026-09']);
    const aug = summaries.find((s) => s.yearMonth === '2026-08');
    const augDining = aug?.categories.find((c) => c.name === 'Dining');
    expect(augDining?.momDeltaAmount).toBe(30);
  });
});
