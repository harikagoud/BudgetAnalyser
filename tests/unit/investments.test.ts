import { describe, expect, it } from 'vitest';
import { allocate, RISK_TIERS, INVESTMENT_DISCLAIMER, type RiskTolerance } from '@/lib/investments/allocation';

const TIERS: RiskTolerance[] = ['conservative', 'moderate', 'aggressive'];

describe('investment allocation (US4)', () => {
  it('each risk tier config sums to exactly 100 percent', () => {
    for (const tier of TIERS) {
      const total = RISK_TIERS[tier].reduce((sum, b) => sum + b.percent, 0);
      expect(total).toBe(100);
    }
  });

  it('matches the exact data-model.md percentages per tier', () => {
    expect(RISK_TIERS.conservative.map((b) => b.percent)).toEqual([50, 35, 15]);
    expect(RISK_TIERS.moderate.map((b) => b.percent)).toEqual([25, 45, 30]);
    expect(RISK_TIERS.aggressive.map((b) => b.percent)).toEqual([10, 40, 50]);
  });

  it('bucket amounts sum exactly to projectedAnnualSavings for a clean total', () => {
    for (const tier of TIERS) {
      const buckets = allocate(540, tier);
      const sum = buckets.reduce((s, b) => s + b.amount, 0);
      expect(sum).toBeCloseTo(540, 2);
    }
  });

  it('bucket amounts sum exactly to projectedAnnualSavings for an adversarial total (naive per-bucket rounding would miss by a cent)', () => {
    // 433.33 * 50% = 216.665 -> rounds to 216.67
    // 433.33 * 35% = 151.6655 -> rounds to 151.67
    // 433.33 * 15% = 64.9995  -> rounds to 65.00
    // Naive per-bucket rounding sums to 433.34, one cent over 433.33 -
    // this is exactly the case the last-bucket-absorbs-remainder logic
    // must correct for.
    const naiveSum = 216.67 + 151.67 + 65.0;
    expect(naiveSum).not.toBe(433.33); // sanity: confirms this total is adversarial

    const buckets = allocate(433.33, 'conservative');
    const sum = buckets.reduce((s, b) => s + b.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(433.33);
  });

  it('returns one amount per bucket, each individually rounded to cents', () => {
    const buckets = allocate(433.33, 'moderate');
    expect(buckets).toHaveLength(3);
    for (const b of buckets) {
      expect(Math.round(b.amount * 100)).toBe(b.amount * 100);
    }
  });

  it('exposes a single disclaimer constant for both the API and UI to share', () => {
    expect(INVESTMENT_DISCLAIMER.length).toBeGreaterThan(0);
    expect(INVESTMENT_DISCLAIMER).toMatch(/educational/i);
    expect(INVESTMENT_DISCLAIMER).toMatch(/not.*(personalized|financial)/i);
  });

  it('handles a zero projectedAnnualSavings without error (all buckets $0)', () => {
    for (const tier of TIERS) {
      const buckets = allocate(0, tier);
      expect(buckets.every((b) => b.amount === 0)).toBe(true);
    }
  });
});
