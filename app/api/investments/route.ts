import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { computeMonthlySummaryFromDb } from '@/lib/aggregation/monthly-summary';
import { generate } from '@/lib/recommendations/engine';
import {
  allocate,
  INVESTMENT_DISCLAIMER,
  RISK_TOLERANCE_VALUES,
  type RiskTolerance,
} from '@/lib/investments/allocation';

const DEFAULT_RISK_TOLERANCE: RiskTolerance = 'moderate';

function isRiskTolerance(value: string): value is RiskTolerance {
  return (RISK_TOLERANCE_VALUES as string[]).includes(value);
}

/**
 * Educational investment allocation breakdown (US4, FR-009/FR-010) for the
 * current `projectedAnnualSavings` (same month-over-month/recommendation
 * pipeline as `GET /api/recommendations`, not re-fetched over HTTP).
 *
 * `?riskTolerance=` is optional. When omitted, the persisted
 * `UserSetting.riskTolerance` is used (defaulting to "moderate" if never
 * set) and echoed back in the response so the UI knows which tier to show
 * as selected. An explicit but unrecognized `riskTolerance` is rejected
 * with 400 rather than silently falling back to a default.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('riskTolerance');

  if (requested !== null && !isRiskTolerance(requested)) {
    return NextResponse.json(
      {
        error: 'INVALID_RISK_TOLERANCE',
        message: `riskTolerance must be one of: ${RISK_TOLERANCE_VALUES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  let riskTolerance: RiskTolerance;
  if (requested) {
    riskTolerance = requested;
  } else {
    const saved = await prisma.userSetting.findUnique({ where: { key: 'riskTolerance' } });
    riskTolerance = saved && isRiskTolerance(saved.value) ? saved.value : DEFAULT_RISK_TOLERANCE;
  }

  const summaries = await computeMonthlySummaryFromDb({ months: 6 });
  let projectedAnnualSavings = 0;
  if (summaries.length > 0) {
    const latest = summaries[summaries.length - 1];
    projectedAnnualSavings = generate(latest.categories, latest.yearMonth).projectedAnnualSavings;
  }

  const buckets = allocate(projectedAnnualSavings, riskTolerance);

  return NextResponse.json({
    projectedAnnualSavings,
    riskTolerance,
    buckets,
    disclaimer: INVESTMENT_DISCLAIMER,
  });
}
