import { describe, expect, it } from 'vitest';
import { generate, type CategorySummaryInput } from '@/lib/recommendations/engine';

const BASIS_MONTH = '2026-09';

function cat(overrides: Partial<CategorySummaryInput>): CategorySummaryInput {
  return {
    categoryId: 'cat_default',
    name: 'Category',
    isDiscretionary: false,
    total: 0,
    ...overrides,
  };
}

describe('recommendation engine (US3)', () => {
  it('recommends a discretionary category flagged above-trend, with a non-zero saving', () => {
    const result = generate(
      [
        cat({
          categoryId: 'cat_dining',
          name: 'Dining',
          isDiscretionary: true,
          total: 127.7,
          momDeltaAmount: 36.7,
          momDeltaPercent: 40.3,
          flaggedIncrease: true,
        }),
      ],
      BASIS_MONTH,
    );

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].estimatedMonthlySavings).toBe(36.7);
    expect(result.recommendations[0].categoryId).toBe('cat_dining');
    expect(result.recommendations[0].basisMonth).toBe('2026-09');
  });

  it('includes an actionable recommendation, not just evidence', () => {
    const result = generate(
      [
        cat({
          categoryId: 'cat_dining',
          name: 'Dining',
          isDiscretionary: true,
          total: 127.7,
          momDeltaAmount: 36.7,
          momDeltaPercent: 40.3,
          flaggedIncrease: true,
        }),
      ],
      BASIS_MONTH,
    );

    const { reason } = result.recommendations[0];
    expect(reason).toMatch(/Dining/);
    expect(reason).toMatch(/40\.3%/);
    // Must name an action ("trim", "cut", "reduce", "save"), not just state the delta.
    expect(reason).toMatch(/trim|cut|reduce/i);
    expect(reason).toMatch(/\$36\.70/);
  });

  it('does not recommend a flagged increase in a non-discretionary category', () => {
    const result = generate(
      [
        cat({
          categoryId: 'cat_car',
          name: 'Car Insurance',
          isDiscretionary: false,
          total: 492.65,
          momDeltaAmount: 254.15,
          momDeltaPercent: 106.6,
          flaggedIncrease: true,
        }),
      ],
      BASIS_MONTH,
    );

    expect(result.recommendations).toHaveLength(0);
  });

  it('does not recommend a discretionary category that is not flagged as above-trend', () => {
    const result = generate(
      [
        cat({
          categoryId: 'cat_subs',
          name: 'Subscriptions',
          isDiscretionary: true,
          total: 62.44,
          momDeltaAmount: 2.0,
          momDeltaPercent: 3.3,
          flaggedIncrease: false,
        }),
      ],
      BASIS_MONTH,
    );

    expect(result.recommendations).toHaveLength(0);
  });

  it('totalMonthlySavings equals the sum of all recommendations, and annual = monthly * 12', () => {
    const result = generate(
      [
        cat({
          categoryId: 'cat_dining',
          name: 'Dining',
          isDiscretionary: true,
          total: 127.7,
          momDeltaAmount: 36.7,
          momDeltaPercent: 40.3,
          flaggedIncrease: true,
        }),
        cat({
          categoryId: 'cat_vacation',
          name: 'Vacations/Travel',
          isDiscretionary: true,
          total: 1521.5,
          momDeltaAmount: 321.5,
          momDeltaPercent: 26.8,
          flaggedIncrease: true,
        }),
      ],
      BASIS_MONTH,
    );

    expect(result.recommendations).toHaveLength(2);
    expect(result.totalMonthlySavings).toBe(358.2);
    expect(result.projectedAnnualSavings).toBe(4298.4);
  });

  it('returns an empty list and zero totals when no discretionary overspend is detected', () => {
    const result = generate(
      [
        cat({ categoryId: 'cat_groceries', name: 'Groceries', isDiscretionary: false, total: 811.77 }),
        cat({
          categoryId: 'cat_subs',
          name: 'Subscriptions',
          isDiscretionary: true,
          total: 62.44,
          momDeltaAmount: 0,
          momDeltaPercent: 0,
          flaggedIncrease: false,
        }),
      ],
      BASIS_MONTH,
    );

    expect(result.recommendations).toEqual([]);
    expect(result.totalMonthlySavings).toBe(0);
    expect(result.projectedAnnualSavings).toBe(0);
  });

  it('ignores a discretionary category with no delta data at all (insufficient history)', () => {
    const result = generate(
      [cat({ categoryId: 'cat_dining', name: 'Dining', isDiscretionary: true, total: 127.7 })],
      BASIS_MONTH,
    );

    expect(result.recommendations).toEqual([]);
  });
});
