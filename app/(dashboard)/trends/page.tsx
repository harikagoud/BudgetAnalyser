'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { TrendLineChart } from '@/components/charts/TrendLineChart';
import { formatCurrency } from '@/lib/utils';

interface SummaryCategory {
  categoryId: string;
  name: string;
  isDiscretionary: boolean;
  byMonth: Record<string, number>;
  momDeltaAmount?: number;
  momDeltaPercent?: number;
  flaggedIncrease?: boolean;
}

interface SummaryResponse {
  months: string[];
  categories: SummaryCategory[];
  insufficientHistory: boolean;
}

export default function TrendsPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/summary?months=6')
      .then((res) => res.json())
      .then((data: SummaryResponse) => {
        setSummary(data);
        if (data.categories.length > 0) {
          setSelectedCategoryId(data.categories[0].categoryId);
        }
        setLoading(false);
      });
  }, []);

  const selectedCategory = useMemo(
    () => summary?.categories.find((c) => c.categoryId === selectedCategoryId) ?? null,
    [summary, selectedCategoryId],
  );

  const chartData = useMemo(() => {
    if (!summary || !selectedCategory) return [];
    return summary.months.map((month) => ({
      month,
      total: selectedCategory.byMonth[month] ?? 0,
    }));
  }, [summary, selectedCategory]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (!summary || summary.months.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Trends" />
        <EmptyState title="No transactions yet" href="/accounts" cta="Import a statement">
          Import two or more months of statements to compare spending over time.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Trends"
        description={
          summary.insufficientHistory
            ? 'Import at least one more month of data to see month-over-month trends.'
            : 'Month-over-month spend per category.'
        }
        action={
          <div className="flex items-center gap-3">
            <label htmlFor="category-select" className="text-sm font-medium text-slate-700">
              Category
            </label>
            <Select
              id="category-select"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
            >
              {summary.categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {selectedCategory && (
        <>
          {selectedCategory.momDeltaAmount !== undefined && (
            <div
              role="status"
              className={`rounded-xl border px-4 py-3 text-sm ${
                selectedCategory.flaggedIncrease
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {selectedCategory.name} changed by{' '}
              <span className="tabular font-semibold">
                {selectedCategory.momDeltaAmount >= 0 ? '+' : ''}
                {formatCurrency(selectedCategory.momDeltaAmount)}
              </span>{' '}
              ({selectedCategory.momDeltaPercent! >= 0 ? '+' : ''}
              {selectedCategory.momDeltaPercent}%) vs. the previous month.
              {selectedCategory.flaggedIncrease && ' Flagged as a notable increase.'}
            </div>
          )}

          <Card>
            <CardContent className="pt-5">
              <TrendLineChart data={chartData} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
