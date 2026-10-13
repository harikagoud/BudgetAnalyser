function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Minimal per-category shape the recommendation engine needs. Deliberately
 * not `MonthSummaryResult`/`CategoryMonthTotal` from
 * `lib/aggregation/monthly-summary.ts` — keeps this module pure and testable
 * without a DB-shaped fixture, matching that module's own
 * transactions-in/summary-out pattern.
 */
export interface CategorySummaryInput {
  categoryId: string;
  name: string;
  isDiscretionary: boolean;
  total: number;
  momDeltaAmount?: number;
  momDeltaPercent?: number;
  flaggedIncrease?: boolean;
}

export interface Recommendation {
  categoryId: string;
  categoryName: string;
  reason: string;
  estimatedMonthlySavings: number;
  basisMonth: string;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  totalMonthlySavings: number;
  projectedAnnualSavings: number;
}

/**
 * Generates cost-cutting recommendations (US3, FR-007/FR-008) from a single
 * month's category summaries. Reuses US2's month-over-month delta/threshold
 * mechanism (`computeMonthlySummaryWithDeltas` in
 * `lib/aggregation/monthly-summary.ts`) rather than computing a separate
 * trailing-average basis — a category qualifies when it is both
 * discretionary (`Category.isDiscretionary`) and already flagged
 * above-trend (`flaggedIncrease`) by that mechanism. `estimatedMonthlySavings`
 * is the category's `momDeltaAmount`: the amount spent above last month,
 * which trimming back to last month's level would recover.
 *
 * `basisMonth` is the `YYYY-MM` of the month these summaries describe
 * (data-model.md's Recommendation entity) — callers pass the month whose
 * categories they're handing in.
 */
export function generate(
  categorySummaries: CategorySummaryInput[],
  basisMonth: string,
): RecommendationResult {
  const recommendations: Recommendation[] = categorySummaries
    .filter(
      (c) =>
        c.isDiscretionary &&
        c.flaggedIncrease === true &&
        typeof c.momDeltaAmount === 'number' &&
        c.momDeltaAmount > 0,
    )
    .map((c) => {
      const amount = round2(c.momDeltaAmount as number);
      return {
        categoryId: c.categoryId,
        categoryName: c.name,
        reason: `${c.name} is up ${c.momDeltaPercent}% vs. last month — trimming back to last month's level saves $${amount.toFixed(2)}/mo`,
        estimatedMonthlySavings: amount,
        basisMonth,
      };
    });

  const totalMonthlySavings = round2(
    recommendations.reduce((sum, r) => sum + r.estimatedMonthlySavings, 0),
  );

  return {
    recommendations,
    totalMonthlySavings,
    projectedAnnualSavings: round2(totalMonthlySavings * 12),
  };
}
