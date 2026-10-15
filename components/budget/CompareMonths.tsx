'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { compareMonths } from '@/lib/budget/compare';
import { formatMonth } from '@/lib/budget/types';

interface Category {
  categoryId: string;
  name: string;
  byMonth: Record<string, number>;
}

/**
 * Pick any months and see each category side by side. "Extra" is spending above
 * that category's own average over the picked months; a limit, if set, is
 * flagged separately. Partial months (data starts mid-month) are marked.
 */
export function CompareMonths({
  months,
  partialMonths,
  categories,
  limits,
}: {
  months: string[];
  partialMonths: string[];
  categories: Category[];
  limits: Record<string, number>;
}) {
  const [picked, setPicked] = useState<string[]>(() => months.slice(-3));
  const selected = months.filter((m) => picked.includes(m)); // keep chronological order

  const { rows, excesses, monthTotals } = useMemo(
    () => compareMonths(categories, selected, limits),
    [categories, selected, limits],
  );
  const topExtra = excesses.slice(0, 5);
  const partialPicked = selected.filter((m) => partialMonths.includes(m));

  function toggle(m: string) {
    setPicked((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compare months</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm text-slate-600">Choose two or more months to compare</legend>
          <div className="flex flex-wrap gap-2">
            {months.map((m) => {
              const on = picked.includes(m);
              return (
                <label
                  key={m}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    on
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggle(m)}
                  />
                  {formatMonth(m)}
                  {partialMonths.includes(m) && <span className="ml-1 text-xs text-slate-400">(partial)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        {selected.length < 2 ? (
          <p className="text-sm text-slate-500">Select at least two months to see where spending is above normal.</p>
        ) : (
          <>
            {partialPicked.length > 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {partialPicked.map(formatMonth).join(', ')} only has data from part of the month, so its
                totals look lower than they really are and pull the averages down.
              </p>
            )}

            {topExtra.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Where the extra spending is</h3>
                <ul className="flex flex-col gap-1.5 text-sm text-slate-700">
                  {topExtra.map((e) => (
                    <li key={`${e.month}-${e.categoryId}`}>
                      <strong>{e.name}</strong> in {formatMonth(e.month)}:{' '}
                      <span className="tabular font-semibold text-amber-700">+{formatCurrency(e.extra)}</span> above its{' '}
                      {formatCurrency(e.average)} average ({formatCurrency(e.amount)}).
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Category</th>
                    {selected.map((m) => (
                      <th key={m} className="px-3 py-2 text-right font-medium">
                        {formatMonth(m).replace(' ', ' ')}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Average</th>
                    <th className="py-2 pl-3 text-right font-medium">Limit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.categoryId} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{r.name}</td>
                      {r.cells.map((c) => (
                        <td
                          key={c.month}
                          className={`tabular px-3 py-2 text-right ${
                            c.overLimit
                              ? 'bg-red-50 font-semibold text-red-700'
                              : c.high
                                ? 'bg-amber-50 font-semibold text-amber-800'
                                : 'text-slate-700'
                          }`}
                          title={
                            c.overLimit
                              ? 'Reached the limit'
                              : c.high
                                ? `${formatCurrency(c.vsAverage)} above average`
                                : undefined
                          }
                        >
                          {formatCurrency(c.amount)}
                        </td>
                      ))}
                      <td className="tabular px-3 py-2 text-right text-slate-500">{formatCurrency(r.average)}</td>
                      <td className="tabular py-2 pl-3 text-right text-slate-500">
                        {r.limit !== null ? formatCurrency(r.limit) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-slate-900">
                    <td className="py-2 pr-3">Total</td>
                    {selected.map((m) => (
                      <td key={m} className="tabular px-3 py-2 text-right">
                        {formatCurrency(monthTotals[m] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2" />
                    <td className="py-2 pl-3" />
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-200 align-middle" /> at least 20% (and
              $10) above the category&apos;s average for the months chosen{' '}
              <span className="mx-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-200 align-middle" /> reached your limit.
              Totals are net of refunds.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
