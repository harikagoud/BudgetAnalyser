import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import { formatMonth, type BudgetStatus } from '@/lib/budget/types';

/** Over/near-limit banner. Always names the month, so the numbers can be checked against the dashboard. */
export function BudgetAlerts({ month, alerts }: { month: string; alerts: BudgetStatus[] }) {
  if (alerts.length === 0) return null;
  return (
    <div role="alert" className="flex flex-col gap-2">
      {alerts.map((a) => {
        const over = a.level === 'over';
        return (
          <div
            key={a.categoryId}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
              over ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            <span>
              <strong>{a.name}</strong>{' '}
              {over
                ? `has reached its limit in ${formatMonth(month)}`
                : `is at ${a.percent}% of its limit in ${formatMonth(month)}`}
              : <span className="tabular font-semibold">{formatCurrency(a.spent)}</span> of{' '}
              <span className="tabular">{formatCurrency(a.limit)}</span>
              {over && a.remaining < 0 && ` (${formatCurrency(-a.remaining)} over)`}.
            </span>
            <Link href="/budgets" className="font-medium underline-offset-2 hover:underline">
              Manage limits
            </Link>
          </div>
        );
      })}
    </div>
  );
}
