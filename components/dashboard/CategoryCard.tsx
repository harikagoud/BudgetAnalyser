import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

export interface CategoryCardProps {
  name: string;
  total: number;
  transactionCount: number;
  isDiscretionary: boolean;
  /** This category's share of the month's total spend, 0-100. */
  sharePercent: number;
}

export function CategoryCard({
  name,
  total,
  transactionCount,
  isDiscretionary,
  sharePercent,
}: CategoryCardProps) {
  const empty = total === 0;
  return (
    <Card className={empty ? 'p-5 opacity-60' : 'p-5 transition-shadow hover:shadow-md'}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-600">{name}</h3>
        {isDiscretionary && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            discretionary
          </span>
        )}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {formatCurrency(total)}
      </p>
      <div
        role="img"
        aria-label={`${Math.round(sharePercent)}% of this month's spending`}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${Math.max(0, Math.min(100, sharePercent))}%` }}
        />
      </div>
      <p className="mt-2 flex justify-between text-xs text-slate-500">
        <span>
          {transactionCount} transaction{transactionCount === 1 ? '' : 's'}
        </span>
        <span className="tabular">{Math.round(sharePercent)}%</span>
      </p>
    </Card>
  );
}
