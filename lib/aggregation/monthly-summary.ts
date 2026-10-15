import { prisma as defaultPrisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';

export interface TxLike {
  date: string; // YYYY-MM-DD
  amount: number;
  categoryId: string;
}

export interface CategoryMeta {
  id: string;
  name: string;
  isDiscretionary: boolean;
}

export interface CategoryMonthTotal {
  categoryId: string;
  name: string;
  isDiscretionary: boolean;
  total: number;
  transactionCount: number;
  byMonth?: Record<string, number>;
  momDeltaAmount?: number;
  momDeltaPercent?: number;
  flaggedIncrease?: boolean;
}

export interface MonthSummaryResult {
  yearMonth: string;
  isPartialMonth: boolean;
  categories: CategoryMonthTotal[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Default percentage increase (month-over-month) at or above which a
 * category is flagged as `flaggedIncrease: true`. Shared with US3's
 * recommendation engine, which flags the same "above-trend" categories.
 */
export const DEFAULT_INCREASE_THRESHOLD_PERCENT = 20;

export interface CategoryDelta {
  momDeltaAmount: number;
  momDeltaPercent: number;
  flaggedIncrease: boolean;
}

/**
 * Computes the month-over-month delta for one category given its current
 * and previous month totals. A `previousTotal` of 0 is treated as a 100%
 * increase when `currentTotal > 0` (not a divide-by-zero/Infinity), and as
 * a flat 0% when both are 0.
 */
export function computeCategoryDelta(
  currentTotal: number,
  previousTotal: number,
  thresholdPercent: number = DEFAULT_INCREASE_THRESHOLD_PERCENT,
): CategoryDelta {
  const momDeltaAmount = round2(currentTotal - previousTotal);
  const momDeltaPercent =
    previousTotal === 0
      ? currentTotal > 0
        ? 100
        : 0
      : Math.round((momDeltaAmount / previousTotal) * 1000) / 10;
  return {
    momDeltaAmount,
    momDeltaPercent,
    flaggedIncrease: momDeltaPercent >= thresholdPercent,
  };
}

/** Sums transactions for a single category/month into a { total, count } pair. */
function aggregateOne(transactions: TxLike[], categoryId: string, yearMonth: string) {
  const matches = transactions.filter(
    (t) => t.categoryId === categoryId && t.date.slice(0, 7) === yearMonth,
  );
  return {
    total: round2(matches.reduce((sum, t) => sum + t.amount, 0)),
    count: matches.length,
  };
}

/** Summarizes a single month's transactions per category. */
export function summarizeMonth(
  transactions: TxLike[],
  categories: CategoryMeta[],
  yearMonth: string,
): MonthSummaryResult {
  const categoryTotals = categories.map((c) => {
    const { total, count } = aggregateOne(transactions, c.id, yearMonth);
    return {
      categoryId: c.id,
      name: c.name,
      isDiscretionary: c.isDiscretionary,
      total,
      transactionCount: count,
    };
  });

  return {
    yearMonth,
    isPartialMonth: false, // set by computeMonthlySummary, which has cross-month context
    categories: categoryTotals,
  };
}

/**
 * Computes one MonthSummaryResult per distinct calendar month present in
 * `transactions`, sorted ascending. The earliest month is flagged
 * `isPartialMonth: true` if its earliest transaction falls after the 1st of
 * the month (per data-model.md: "earliest available data for the account
 * starts mid-month").
 */
export function computeMonthlySummary(
  transactions: TxLike[],
  categories: CategoryMeta[],
): MonthSummaryResult[] {
  if (transactions.length === 0) return [];

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const earliestDate = sorted[0].date;
  const earliestYearMonth = earliestDate.slice(0, 7);
  const earliestDay = Number(earliestDate.slice(8, 10));

  const monthsPresent = Array.from(new Set(transactions.map((t) => t.date.slice(0, 7)))).sort();

  return monthsPresent.map((yearMonth) => {
    const result = summarizeMonth(transactions, categories, yearMonth);
    result.isPartialMonth = yearMonth === earliestYearMonth && earliestDay > 1;
    return result;
  });
}

/**
 * Extends `computeMonthlySummary` with month-over-month deltas per category
 * (US2, FR-005/FR-006). The first month in the series never gets delta
 * fields (no prior month to compare against). A month is also left without
 * deltas when its immediately preceding month is `isPartialMonth`, since
 * comparing a full month against a partial one would be a misleading
 * comparison (the spec's "no misleading empty comparison" edge case).
 */
export function computeMonthlySummaryWithDeltas(
  transactions: TxLike[],
  categories: CategoryMeta[],
  options: { increaseThresholdPercent?: number } = {},
): MonthSummaryResult[] {
  const summaries = computeMonthlySummary(transactions, categories);
  const threshold = options.increaseThresholdPercent ?? DEFAULT_INCREASE_THRESHOLD_PERCENT;

  return summaries.map((summary, i) => {
    const previous = i > 0 ? summaries[i - 1] : null;
    if (!previous || previous.isPartialMonth) {
      return summary;
    }
    return {
      ...summary,
      categories: summary.categories.map((cat) => {
        const prevTotal = previous.categories.find((c) => c.categoryId === cat.categoryId)?.total ?? 0;
        return { ...cat, ...computeCategoryDelta(cat.total, prevTotal, threshold) };
      }),
    };
  });
}

/**
 * DB-backed monthly summary for the app's API routes. Loads transactions
 * (optionally scoped to one account) and all categories, then delegates to
 * `computeMonthlySummaryWithDeltas` above. Deltas are initially computed
 * against the full transaction history, then the `months` window is
 * applied; if that window would cut off the comparison month for the
 * earliest month returned, that month's delta fields are stripped so the
 * response never cites a "previous month" absent from its own `byMonth`
 * (e.g. `months=1` always returns a single month with no delta fields).
 */
export async function computeMonthlySummaryFromDb(
  options: {
    userId: string;
    accountId?: string;
    months?: number;
    increaseThresholdPercent?: number;
  },
  client: PrismaClient = defaultPrisma,
): Promise<MonthSummaryResult[]> {
  const [transactions, categories] = await Promise.all([
    client.transaction.findMany({
      where: {
        account: { userId: options.userId },
        // Card payments / transfers are money moving, not spending.
        category: { excludeFromSpending: false },
        ...(options.accountId ? { accountId: options.accountId } : {}),
      },
      select: { date: true, amount: true, categoryId: true },
      orderBy: { date: 'asc' },
    }),
    client.category.findMany({
      where: { excludeFromSpending: false },
      select: { id: true, name: true, isDiscretionary: true },
    }),
  ]);

  const txLike: TxLike[] = transactions.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount,
    categoryId: t.categoryId,
  }));

  const fullHistory = computeMonthlySummaryWithDeltas(txLike, categories, {
    increaseThresholdPercent: options.increaseThresholdPercent,
  });
  let summaries = fullHistory;
  if (options.months) {
    summaries = fullHistory.slice(-options.months);
  }

  // If the window cut off the month immediately preceding the first month
  // we're returning, that first month's deltas (if any) were computed
  // against a month the caller can't see in `months`/`byMonth`. Strip them
  // so the response is never internally inconsistent (a delta citing a
  // "previous month" that isn't present anywhere in the payload).
  if (summaries.length > 0 && fullHistory.length > summaries.length) {
    const [first, ...rest] = summaries;
    summaries = [
      {
        ...first,
        categories: first.categories.map((c) => ({
          categoryId: c.categoryId,
          name: c.name,
          isDiscretionary: c.isDiscretionary,
          total: c.total,
          transactionCount: c.transactionCount,
        })),
      },
      ...rest,
    ];
  }

  return summaries;
}
