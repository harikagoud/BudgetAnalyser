import { NextRequest, NextResponse } from 'next/server';
import { computeMonthlySummaryFromDb } from '@/lib/aggregation/monthly-summary';
import { generate } from '@/lib/recommendations/engine';

/**
 * Cost-cutting recommendations derived from the current summary (US3,
 * FR-007/FR-008). `?months=` is accepted and passed straight through to
 * `computeMonthlySummaryFromDb`, same as `/api/summary` — mainly so a
 * `months=1` window (which strips all deltas) can be used to deterministically
 * exercise the "no cuts recommended" empty state.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const monthsParam = searchParams.get('months');
  const months = monthsParam ? Number(monthsParam) : 6;

  const summaries = await computeMonthlySummaryFromDb({ months });

  if (summaries.length === 0) {
    return NextResponse.json({
      recommendations: [],
      totalMonthlySavings: 0,
      projectedAnnualSavings: 0,
      hasTransactions: false,
    });
  }

  const latest = summaries[summaries.length - 1];
  const result = generate(latest.categories, latest.yearMonth);

  return NextResponse.json({ ...result, hasTransactions: true });
}
