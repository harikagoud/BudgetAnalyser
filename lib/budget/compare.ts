// Multi-month comparison: where is spending above normal?

export interface CompareCategoryInput {
  categoryId: string;
  name: string;
  byMonth: Record<string, number>;
}

export interface CompareCell {
  month: string;
  amount: number;
  /** amount - the category's average across the compared months (can be negative). */
  vsAverage: number;
  /** True when clearly above that category's own average (see HIGH_SHARE). */
  high: boolean;
  /** True when a limit exists and this month reached it. */
  overLimit: boolean;
}

export interface CompareRow {
  categoryId: string;
  name: string;
  average: number;
  limit: number | null;
  cells: CompareCell[];
}

export interface Excess {
  month: string;
  categoryId: string;
  name: string;
  amount: number;
  average: number;
  extra: number; // amount above the average
}

export const HIGH_SHARE = 0.2; // 20% above a category's average counts as "high"
export const MIN_HIGH_DOLLARS = 10; // ignore tiny categories' noise

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * "Extra" spending = a category's spend in a month ABOVE that category's
 * average over the months being compared (so it needs at least two months).
 * Limits, when set, are shown separately: a month can be over its limit
 * without being unusual, and vice versa.
 */
export function compareMonths(
  categories: CompareCategoryInput[],
  months: string[],
  limits: Record<string, number> = {},
): { rows: CompareRow[]; excesses: Excess[]; monthTotals: Record<string, number> } {
  const rows: CompareRow[] = [];
  const excesses: Excess[] = [];
  const monthTotals: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));

  for (const c of categories) {
    const values = months.map((m) => c.byMonth[m] ?? 0);
    if (values.every((v) => v === 0)) continue;
    const average = round2(values.reduce((a, b) => a + b, 0) / months.length);
    const limit = limits[c.categoryId] ?? null;
    const cells = months.map((month, i) => {
      const amount = round2(values[i]);
      monthTotals[month] = round2(monthTotals[month] + amount);
      const vsAverage = round2(amount - average);
      const high =
        months.length >= 2 && vsAverage >= MIN_HIGH_DOLLARS && amount >= average * (1 + HIGH_SHARE);
      if (months.length >= 2 && vsAverage > 0) {
        excesses.push({ month, categoryId: c.categoryId, name: c.name, amount, average, extra: vsAverage });
      }
      return {
        month,
        amount,
        vsAverage,
        high,
        overLimit: limit !== null && Math.round(amount * 100) >= Math.round(limit * 100),
      };
    });
    rows.push({ categoryId: c.categoryId, name: c.name, average, limit, cells });
  }

  rows.sort((a, b) => b.average - a.average);
  excesses.sort((a, b) => b.extra - a.extra);
  return { rows, excesses, monthTotals };
}
