'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';

export interface AllocationDonutBucket {
  name: string;
  percent: number;
  amount: number;
}

// First three slots of the validated categorical palette (blue/orange/aqua) -
// the only three-slot ordering that clears the all-pairs CVD and
// normal-vision floors in light mode (dataviz skill, references/palette.md).
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];

/**
 * Donut chart of the risk-tier buckets (US4). Charts by `percent`, not
 * `amount` — percentages are always defined and sum to 100 regardless of
 * `projectedAnnualSavings`, so a $0 total still renders the real tier
 * breakdown instead of a degenerate all-zero pie. Dollar amounts (which
 * genuinely can be $0) are shown in the tooltip and the text legend below,
 * never color-only (the aqua slot sits under 3:1 contrast on the light
 * surface, so the palette's relief rule requires visible labels here).
 */
export function AllocationDonut({
  buckets,
  total,
}: {
  buckets: AllocationDonutBucket[];
  total: number;
}) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={buckets}
              dataKey="percent"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              startAngle={90}
              endAngle={-270}
              stroke="#fcfcfb"
              strokeWidth={2}
            >
              {buckets.map((b, i) => (
                <Cell key={b.name} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(_value, _name, entry) => {
                const b = entry?.payload as AllocationDonutBucket;
                return [`${formatCurrency(b.amount)} (${b.percent}%)`, b.name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-slate-500">Total</span>
          <span className="text-lg font-semibold text-slate-900">{formatCurrency(total)}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {buckets.map((b, i) => (
          <li key={b.name} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-slate-900">{b.name}</span>
            <span className="text-slate-500">
              {b.percent}% · {formatCurrency(b.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
