function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

export const RISK_TOLERANCE_VALUES: RiskTolerance[] = ['conservative', 'moderate', 'aggressive'];

export interface RiskTierBucket {
  name: string;
  percent: number;
}

/**
 * Static risk-tier config (US4, data-model.md RiskProfile) — not a database
 * table, not user-editable for v1. Each tier's percentages MUST sum to 100
 * (enforced by tests/unit/investments.test.ts, Constitution Principle II).
 */
export const RISK_TIERS: Record<RiskTolerance, RiskTierBucket[]> = {
  conservative: [
    { name: 'Emergency Fund', percent: 50 },
    { name: 'Retirement Account', percent: 35 },
    { name: 'Taxable Brokerage', percent: 15 },
  ],
  moderate: [
    { name: 'Emergency Fund', percent: 25 },
    { name: 'Retirement Account', percent: 45 },
    { name: 'Taxable Brokerage', percent: 30 },
  ],
  aggressive: [
    { name: 'Emergency Fund', percent: 10 },
    { name: 'Retirement Account', percent: 40 },
    { name: 'Taxable Brokerage', percent: 50 },
  ],
};

/**
 * Single source of truth for the FR-010 educational-only disclaimer, shared
 * by `GET /api/investments` (route.ts) and the `InvestmentDisclaimer`
 * component so the two copies can never drift apart.
 */
export const INVESTMENT_DISCLAIMER =
  'This is a general, educational breakdown — not personalized financial, legal, or tax advice.';

export interface AllocationBucket {
  name: string;
  percent: number;
  amount: number;
}

/**
 * Splits `projectedAnnualSavings` across a risk tier's buckets (US4,
 * FR-009). Every bucket but the last is independently rounded to cents;
 * the last bucket is set to `total - sum(others)` rather than its own
 * rounded share, so `amount` always sums EXACTLY to `projectedAnnualSavings`
 * regardless of penny-level rounding (Success Criterion SC-004) — naive
 * per-bucket rounding can be off by a cent (e.g. $433.33 conservative).
 */
export function allocate(projectedAnnualSavings: number, riskTolerance: RiskTolerance): AllocationBucket[] {
  const tiers = RISK_TIERS[riskTolerance];
  const buckets: AllocationBucket[] = [];
  let runningTotal = 0;

  tiers.forEach((tier, i) => {
    const isLast = i === tiers.length - 1;
    const amount = isLast
      ? round2(projectedAnnualSavings - runningTotal)
      : round2((projectedAnnualSavings * tier.percent) / 100);
    runningTotal = round2(runningTotal + amount);
    buckets.push({ name: tier.name, percent: tier.percent, amount });
  });

  return buckets;
}
