import { NextRequest, NextResponse } from 'next/server';
import { computeMonthlySummaryFromDb } from '@/lib/aggregation/monthly-summary';
import { prisma } from '@/lib/db/client';
import { getUserId, unauthorized } from '@/lib/auth/request';

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const { searchParams } = new URL(req.url);
  const monthsParam = searchParams.get('months');
  const parsedMonths = monthsParam ? Number(monthsParam) : 6;
  // Clamp: NaN / negative / huge values must not reach the query.
  const months = Number.isFinite(parsedMonths) ? Math.min(Math.max(Math.trunc(parsedMonths), 1), 120) : 6;

  const summaries = await computeMonthlySummaryFromDb({ userId, months });
  // Every category, including non-spending ones (Payments/Transfers), so a transaction
  // can be moved into them from the dashboard even though they are not in the totals.
  const assignableCategories = await prisma.category.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  if (summaries.length === 0) {
    return NextResponse.json({ months: [], partialMonths: [], categories: [], insufficientHistory: true, assignableCategories });
  }

  const monthKeys = summaries.map((s) => s.yearMonth);
  const latest = summaries[summaries.length - 1];

  interface ResponseCategory {
    categoryId: string;
    name: string;
    isDiscretionary: boolean;
    byMonth: Record<string, number>;
    countByMonth: Record<string, number>;
    momDeltaAmount?: number;
    momDeltaPercent?: number;
    flaggedIncrease?: boolean;
  }

  const categories: ResponseCategory[] = latest.categories.map((cat) => {
    const byMonth: Record<string, number> = {};
    const countByMonth: Record<string, number> = {};
    for (const s of summaries) {
      const match = s.categories.find((c) => c.categoryId === cat.categoryId);
      byMonth[s.yearMonth] = match?.total ?? 0;
      countByMonth[s.yearMonth] = match?.transactionCount ?? 0;
    }

    // Deltas are already computed (and threshold-checked, and window-
    // consistency-checked) by computeMonthlySummaryFromDb; this route only
    // reshapes the per-month results into the category-centric
    // contracts/api.md response shape. `cat.momDeltaAmount` is undefined
    // when there's no previous month, the previous month was partial, or
    // the previous month fell outside the requested `months` window.
    return {
      categoryId: cat.categoryId,
      name: cat.name,
      isDiscretionary: cat.isDiscretionary,
      byMonth,
      countByMonth,
      momDeltaAmount: cat.momDeltaAmount,
      momDeltaPercent: cat.momDeltaPercent,
      flaggedIncrease: cat.flaggedIncrease,
    };
  });

  // insufficientHistory reflects whether the *latest* month actually got a
  // delta computed, not just `summaries.length < 2` — that length check
  // alone would be wrong once the window-consistency stripping above can
  // also remove a delta (e.g. `months=1` always has `summaries.length===1`
  // but for a different reason: the comparison month is out of window).
  const insufficientHistory = categories.every((c) => c.momDeltaAmount === undefined);

  return NextResponse.json({
    months: monthKeys,
    // Months whose data starts mid-month; comparisons against them are not like-for-like.
    partialMonths: summaries.filter((s) => s.isPartialMonth).map((s) => s.yearMonth),
    categories,
    insufficientHistory,
    assignableCategories,
  });
}
