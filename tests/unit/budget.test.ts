import { describe, expect, it } from 'vitest';
import { alertsFrom, evaluateLimits, levelFor } from '@/lib/budget/evaluate';
import { compareMonths } from '@/lib/budget/compare';
import { SetLimitSchema } from '@/lib/validation/budget';

describe('levelFor (whole-cent boundaries)', () => {
  it.each([
    [79.99, 100, 'ok'],
    [80, 100, 'warning'],
    [99.99, 100, 'warning'],
    [100, 100, 'over'], // "reached" counts
    [100.01, 100, 'over'],
    [0, 100, 'ok'],
    [-25, 100, 'ok'], // net refunds
  ])('spent %s of %s -> %s', (spent, limit, level) => expect(levelFor(spent, limit)).toBe(level));

  it('is not fooled by floating-point noise (0.1 + 0.2 style sums)', () => {
    expect(levelFor(0.1 + 0.2, 0.3)).toBe('over');
    expect(levelFor(80.00000000001, 100)).toBe('warning');
    expect(levelFor(19.999999999, 20)).toBe('over'); // rounds to $20.00
  });
});

describe('evaluateLimits / alertsFrom', () => {
  const limits = [
    { categoryId: 'g', name: 'Groceries', amount: 600 },
    { categoryId: 'd', name: 'Dining', amount: 200 },
    { categoryId: 's', name: 'Subscriptions', amount: 50 },
  ];

  it('computes spent, remaining, percent and level', () => {
    const [g] = evaluateLimits(limits, { g: 450 });
    expect(g).toMatchObject({ spent: 450, remaining: 150, percent: 75, level: 'ok' });
  });

  it('a refund that pulls a category back under its limit clears the alert', () => {
    // $210 spent, then a $30 refund -> net $180 of a $200 limit
    expect(evaluateLimits(limits, { d: 210 })[1].level).toBe('over');
    expect(evaluateLimits(limits, { d: 210 - 30 })[1]).toMatchObject({ level: 'warning', remaining: 20 });
    expect(evaluateLimits(limits, { d: 150 })[1].level).toBe('ok');
  });

  it('no limit set -> nothing to alert about; unspent categories are fine', () => {
    expect(evaluateLimits([], { g: 9999 })).toEqual([]);
    expect(alertsFrom(evaluateLimits(limits, {}))).toEqual([]);
  });

  it('alerts are only warning/over, worst first', () => {
    const alerts = alertsFrom(evaluateLimits(limits, { g: 500, d: 250, s: 51 }));
    // over first (Dining 125% before Subscriptions 102%), then warnings (Groceries 83%)
    expect(alerts.map((a) => [a.name, a.level])).toEqual([
      ['Dining', 'over'],
      ['Subscriptions', 'over'],
      ['Groceries', 'warning'],
    ]);
  });
});

describe('compareMonths', () => {
  const cats: { categoryId: string; name: string; byMonth: Record<string, number> }[] = [
    { categoryId: 'g', name: 'Groceries', byMonth: { '2026-07': 400, '2026-08': 410, '2026-09': 650 } },
    { categoryId: 'd', name: 'Dining', byMonth: { '2026-07': 100, '2026-08': 104, '2026-09': 100 } },
    { categoryId: 'x', name: 'Empty', byMonth: {} },
  ];
  const months = ['2026-07', '2026-08', '2026-09'];

  it('flags a month clearly above that category\'s own average, and ranks the extra', () => {
    const { rows, excesses, monthTotals } = compareMonths(cats, months, { g: 500 });
    const g = rows.find((r) => r.categoryId === 'g')!;
    expect(g.average).toBe(486.67);
    expect(g.cells.map((c) => c.high)).toEqual([false, false, true]);
    expect(g.cells.map((c) => c.overLimit)).toEqual([false, false, true]);
    expect(rows.find((r) => r.categoryId === 'd')!.cells.some((c) => c.high)).toBe(false);
    expect(rows.some((r) => r.categoryId === 'x')).toBe(false); // all-zero rows are dropped
    expect(excesses[0]).toMatchObject({ month: '2026-09', name: 'Groceries', extra: 163.33 });
    expect(monthTotals['2026-09']).toBe(750);
  });

  it('needs two months: with one there is no "average" to be above', () => {
    const { excesses, rows } = compareMonths(cats, ['2026-09']);
    expect(excesses).toEqual([]);
    expect(rows[0].cells[0].high).toBe(false);
  });

  it('ignores small-dollar noise', () => {
    const tiny = [{ categoryId: 't', name: 'Tiny', byMonth: { a: 1, b: 4 } }];
    expect(compareMonths(tiny, ['a', 'b']).rows[0].cells.map((c) => c.high)).toEqual([false, false]);
  });
});

describe('SetLimitSchema', () => {
  it.each([[100], [0.01], [1_000_000], [12.5]])('accepts %s', (amount) =>
    expect(SetLimitSchema.safeParse({ categoryId: 'c1', amount }).success).toBe(true));
  it.each([[0], [-5], [1_000_000.01], [12.345], [NaN], [Infinity], ['100'], [null]])('rejects %s', (amount) =>
    expect(SetLimitSchema.safeParse({ categoryId: 'c1', amount }).success).toBe(false));
  it('requires a category', () => expect(SetLimitSchema.safeParse({ amount: 5 }).success).toBe(false));
});
