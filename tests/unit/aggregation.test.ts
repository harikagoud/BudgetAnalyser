import { describe, expect, it } from 'vitest';
import {
  computeMonthlySummary,
  computeMonthlySummaryWithDeltas,
  DEFAULT_INCREASE_THRESHOLD_PERCENT,
  summarizeMonth,
  type CategoryMeta,
  type TxLike,
} from '@/lib/aggregation/monthly-summary';

const CATEGORIES: CategoryMeta[] = [
  { id: 'cat_groceries', name: 'Groceries', isDiscretionary: false },
  { id: 'cat_dining', name: 'Dining', isDiscretionary: true },
];

describe('monthly aggregation', () => {
  it('sums per-category totals matching a known fixture total', () => {
    const transactions: TxLike[] = [
      { date: '2026-06-02', amount: 50, categoryId: 'cat_groceries' },
      { date: '2026-06-10', amount: 75.5, categoryId: 'cat_groceries' },
      { date: '2026-06-15', amount: 20, categoryId: 'cat_dining' },
    ];
    const result = summarizeMonth(transactions, CATEGORIES, '2026-06');
    const groceries = result.categories.find((c) => c.categoryId === 'cat_groceries');
    const dining = result.categories.find((c) => c.categoryId === 'cat_dining');
    expect(groceries?.total).toBe(125.5);
    expect(groceries?.transactionCount).toBe(2);
    expect(dining?.total).toBe(20);
    expect(dining?.transactionCount).toBe(1);
  });

  it('flags a month as partial when its earliest transaction starts mid-month', () => {
    const transactions: TxLike[] = [
      { date: '2026-06-15', amount: 30, categoryId: 'cat_groceries' },
      { date: '2026-07-01', amount: 40, categoryId: 'cat_groceries' },
    ];
    const summaries = computeMonthlySummary(transactions, CATEGORIES);
    const june = summaries.find((s) => s.yearMonth === '2026-06');
    const july = summaries.find((s) => s.yearMonth === '2026-07');
    expect(june?.isPartialMonth).toBe(true);
    expect(july?.isPartialMonth).toBe(false);
  });

  it('does not flag a month as partial when data starts on the 1st', () => {
    const transactions: TxLike[] = [
      { date: '2026-06-01', amount: 30, categoryId: 'cat_groceries' },
    ];
    const summaries = computeMonthlySummary(transactions, CATEGORIES);
    expect(summaries[0].isPartialMonth).toBe(false);
  });

  // spec.md Edge Case: a refund/reversal (negative amount) must REDUCE the
  // category's total, not be treated as a new expense (T061).
  it('reduces the category total for a refund (negative amount) instead of adding it', () => {
    const transactions: TxLike[] = [
      { date: '2026-06-02', amount: 100, categoryId: 'cat_dining' },
      { date: '2026-06-09', amount: -30.25, categoryId: 'cat_dining' },
    ];
    const dining = summarizeMonth(transactions, CATEGORIES, '2026-06').categories.find(
      (c) => c.categoryId === 'cat_dining',
    );
    expect(dining?.total).toBe(69.75);
    expect(dining?.transactionCount).toBe(2);
  });

  it('a refund bigger than the month\'s spend yields a negative total, not an error or abs()', () => {
    const transactions: TxLike[] = [
      { date: '2026-06-02', amount: 20, categoryId: 'cat_dining' },
      { date: '2026-06-09', amount: -50, categoryId: 'cat_dining' },
    ];
    const dining = summarizeMonth(transactions, CATEGORIES, '2026-06').categories.find(
      (c) => c.categoryId === 'cat_dining',
    );
    expect(dining?.total).toBe(-30);
  });

  // spec.md Edge Case: transactions outside the current calendar year (T061).
  // Aggregation is keyed by YYYY-MM, never by calendar year, so a Dec -> Jan
  // boundary must compare as consecutive months with a correct delta.
  it('computes the month-over-month delta across a calendar-year boundary (Dec -> Jan)', () => {
    const transactions: TxLike[] = [
      { date: '2025-12-01', amount: 100, categoryId: 'cat_dining' },
      { date: '2026-01-01', amount: 150, categoryId: 'cat_dining' },
    ];
    const summaries = computeMonthlySummaryWithDeltas(transactions, CATEGORIES);
    expect(summaries.map((s) => s.yearMonth)).toEqual(['2025-12', '2026-01']);
    const jan = summaries[1].categories.find((c) => c.categoryId === 'cat_dining');
    expect(jan?.momDeltaAmount).toBe(50);
    expect(jan?.momDeltaPercent).toBe(50);
    expect(jan?.flaggedIncrease).toBe(true);
  });
});

describe('month-over-month deltas (US2)', () => {
  it('computes momDeltaAmount/momDeltaPercent correctly across two known months', () => {
    const transactions: TxLike[] = [
      { date: '2026-08-01', amount: 91, categoryId: 'cat_dining' },
      { date: '2026-09-05', amount: 127.7, categoryId: 'cat_dining' },
    ];
    const summaries = computeMonthlySummaryWithDeltas(transactions, CATEGORIES);
    const sept = summaries.find((s) => s.yearMonth === '2026-09');
    const dining = sept?.categories.find((c) => c.categoryId === 'cat_dining');
    expect(dining?.momDeltaAmount).toBe(36.7);
    expect(dining?.momDeltaPercent).toBeCloseTo(40.3, 1);
  });

  it('flags a category as increased when it crosses the configured threshold', () => {
    const transactions: TxLike[] = [
      { date: '2026-08-01', amount: 100, categoryId: 'cat_dining' },
      { date: '2026-09-05', amount: 140, categoryId: 'cat_dining' },
    ];
    const summaries = computeMonthlySummaryWithDeltas(transactions, CATEGORIES, {
      increaseThresholdPercent: 20,
    });
    const sept = summaries.find((s) => s.yearMonth === '2026-09');
    const dining = sept?.categories.find((c) => c.categoryId === 'cat_dining');
    expect(dining?.flaggedIncrease).toBe(true);
  });

  it('does not flag a category increase below the configured threshold', () => {
    const transactions: TxLike[] = [
      { date: '2026-08-01', amount: 100, categoryId: 'cat_dining' },
      { date: '2026-09-05', amount: 105, categoryId: 'cat_dining' },
    ];
    const summaries = computeMonthlySummaryWithDeltas(transactions, CATEGORIES, {
      increaseThresholdPercent: DEFAULT_INCREASE_THRESHOLD_PERCENT,
    });
    const sept = summaries.find((s) => s.yearMonth === '2026-09');
    const dining = sept?.categories.find((c) => c.categoryId === 'cat_dining');
    expect(dining?.flaggedIncrease).toBe(false);
  });

  it('omits delta fields on the first month (no previous month to compare)', () => {
    const transactions: TxLike[] = [{ date: '2026-08-05', amount: 100, categoryId: 'cat_dining' }];
    const summaries = computeMonthlySummaryWithDeltas(transactions, CATEGORIES);
    const aug = summaries.find((s) => s.yearMonth === '2026-08');
    const dining = aug?.categories.find((c) => c.categoryId === 'cat_dining');
    expect(dining?.momDeltaAmount).toBeUndefined();
    expect(dining?.momDeltaPercent).toBeUndefined();
    expect(dining?.flaggedIncrease).toBeUndefined();
  });

  it('treats a $0-previous-month category as a 100% increase, not divide-by-zero garbage', () => {
    const transactions: TxLike[] = [
      { date: '2026-08-01', amount: 50, categoryId: 'cat_groceries' },
      { date: '2026-09-05', amount: 100, categoryId: 'cat_groceries' },
      { date: '2026-09-06', amount: 42, categoryId: 'cat_dining' },
    ];
    const summaries = computeMonthlySummaryWithDeltas(transactions, CATEGORIES);
    const sept = summaries.find((s) => s.yearMonth === '2026-09');
    const dining = sept?.categories.find((c) => c.categoryId === 'cat_dining');
    expect(dining?.momDeltaPercent).toBe(100);
    expect(Number.isFinite(dining!.momDeltaPercent)).toBe(true);
  });

  it('suppresses the delta when the previous month is only a partial month', () => {
    const transactions: TxLike[] = [
      { date: '2026-08-20', amount: 20, categoryId: 'cat_dining' }, // partial Aug (starts on 20th)
      { date: '2026-09-05', amount: 127.7, categoryId: 'cat_dining' },
    ];
    const summaries = computeMonthlySummaryWithDeltas(transactions, CATEGORIES);
    const sept = summaries.find((s) => s.yearMonth === '2026-09');
    const dining = sept?.categories.find((c) => c.categoryId === 'cat_dining');
    expect(dining?.momDeltaAmount).toBeUndefined();
    expect(dining?.flaggedIncrease).toBeUndefined();
  });

  it('reports insufficientHistory-equivalent state: fewer than 2 months means no deltas anywhere', () => {
    const transactions: TxLike[] = [{ date: '2026-09-05', amount: 42, categoryId: 'cat_dining' }];
    const summaries = computeMonthlySummaryWithDeltas(transactions, CATEGORIES);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].categories.every((c) => c.momDeltaAmount === undefined)).toBe(true);
  });
});
