'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageSkeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-base';

interface Recommendation {
  categoryId: string;
  categoryName: string;
  reason: string;
  estimatedMonthlySavings: number;
  basisMonth: string;
}

interface RecommendationsResponse {
  recommendations: Recommendation[];
  totalMonthlySavings: number;
  projectedAnnualSavings: number;
  hasTransactions: boolean;
}

export default function RecommendationsPage() {
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/recommendations?months=6')
      .then((res) => res.json())
      .then((payload: RecommendationsResponse) => {
        setData(payload);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <PageSkeleton />;
  }

  if (!data || !data.hasTransactions) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Recommendations" />
        <EmptyState title="No transactions yet" href="/accounts" cta="Import a statement">
          Import a statement and we&apos;ll look for discretionary spending you could trim.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Recommendations"
        description="Discretionary categories trending above last month, with an estimated monthly saving."
      />

      {data.recommendations.length === 0 ? (
        <EmptyState title="No cuts currently recommended">
          We&apos;ll flag a category here if its discretionary spend jumps notably above last
          month.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="Potential monthly savings"
              value={formatCurrency(data.totalMonthlySavings)}
            />
            <StatCard
              label="Projected annual savings"
              value={formatCurrency(data.projectedAnnualSavings)}
              note="Monthly savings × 12"
            />
          </div>

          <ul className="flex flex-col gap-3">
            {data.recommendations.map((rec) => (
              <li
                key={rec.categoryId}
                className="rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-amber-900">{rec.categoryName}</span>
                  <span className="tabular rounded-full bg-white px-3 py-1 text-sm font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                    Save {formatCurrency(rec.estimatedMonthlySavings)}/mo
                  </span>
                </div>
                <p className="mt-2 text-sm text-amber-900/90">{rec.reason}</p>
                <p className="mt-1 text-xs text-amber-800/80">Based on {rec.basisMonth}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
