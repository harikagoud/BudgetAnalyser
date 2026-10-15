// Pure budget maths (no DB), shared by the API, import alerts and tests.

export const WARNING_THRESHOLD = 0.8; // warn at 80% of the limit
export type BudgetLevel = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  categoryId: string;
  name: string;
  limit: number;
  spent: number; // net of refunds, same as the dashboard
  remaining: number; // negative once over
  percent: number; // spent / limit * 100, 1 decimal
  level: BudgetLevel;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);

/**
 * Compares in whole cents so 79.99 vs an 80.00 threshold, or 100.00 vs a
 * 100.00 limit, is decided by money and never by floating-point noise.
 * "over" starts AT the limit ("notify once the limit is reached").
 */
export function levelFor(spent: number, limit: number): BudgetLevel {
  const s = cents(spent);
  const l = cents(limit);
  if (l <= 0) return 'ok';
  if (s >= l) return 'over';
  if (s >= Math.round(l * WARNING_THRESHOLD)) return 'warning';
  return 'ok';
}

export function evaluateLimits(
  limits: { categoryId: string; name: string; amount: number }[],
  spentByCategory: Record<string, number>,
): BudgetStatus[] {
  return limits.map(({ categoryId, name, amount }) => {
    const spent = Math.round(((spentByCategory[categoryId] ?? 0) + Number.EPSILON) * 100) / 100;
    return {
      categoryId,
      name,
      limit: amount,
      spent,
      remaining: Math.round((amount - spent + Number.EPSILON) * 100) / 100,
      percent: amount > 0 ? Math.round((spent / amount) * 1000) / 10 : 0,
      level: levelFor(spent, amount),
    };
  });
}

/** Only the statuses worth telling the user about, worst first. */
export function alertsFrom(statuses: BudgetStatus[]): BudgetStatus[] {
  return statuses
    .filter((s) => s.level !== 'ok')
    .sort((a, b) => (a.level === b.level ? b.percent - a.percent : a.level === 'over' ? -1 : 1));
}
