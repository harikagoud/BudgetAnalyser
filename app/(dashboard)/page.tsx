'use client';

import { useEffect, useState, useCallback } from 'react';
import { CategoryCard } from '@/components/dashboard/CategoryCard';
import { CategoryBarChart } from '@/components/charts/CategoryBarChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-base';
import { BudgetAlerts } from '@/components/budget/BudgetAlerts';
import type { BudgetStatus } from '@/lib/budget/types';

/** "2026-09" -> "September 2026" */
function formatMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface SummaryCategory {
  categoryId: string;
  name: string;
  isDiscretionary: boolean;
  byMonth: Record<string, number>;
  countByMonth: Record<string, number>;
}

interface SummaryResponse {
  months: string[];
  categories: SummaryCategory[];
  insufficientHistory: boolean;
  assignableCategories?: Array<{ id: string; name: string }>;
}

interface TransactionRow {
  id: string;
  date: string;
  amount: number;
  merchantRaw: string;
  category: { id: string; name: string };
  categorySource: string;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [uncategorized, setUncategorized] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  // null = "follow the latest month"; otherwise the user's explicit pick.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<BudgetStatus[]>([]);
  const [recategorizing, setRecategorizing] = useState(false);
  const [recategorizeNote, setRecategorizeNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Wide window so the month picker can reach all imported history.
    const summaryRes = await apiFetch('/api/summary?months=60');
    const summaryData: SummaryResponse = await summaryRes.json();
    setSummary(summaryData);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A pick that no longer exists in the data (e.g. after a re-import) falls
  // back to the latest month instead of rendering an empty/undefined month.
  const latestMonth = summary?.months[summary.months.length - 1];
  const selectedMonth =
    pickedMonth && summary?.months.includes(pickedMonth) ? pickedMonth : latestMonth;

  // Budget alerts for the same month as every other number on the page.
  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    apiFetch(`/api/budgets?month=${selectedMonth}`)
      .then((res) => (res.ok ? res.json() : { alerts: [] }))
      .then((data: { alerts: BudgetStatus[] }) => !cancelled && setAlerts(data.alerts))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, summary]);

  // Uncategorized rows are scoped to the selected month, matching every other
  // number on the page.
  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    apiFetch(`/api/transactions?month=${selectedMonth}`)
      .then((res) => res.json())
      .then((txData: { transactions: TransactionRow[] }) => {
        if (!cancelled) {
          setUncategorized(txData.transactions.filter((t) => t.category.name === 'Uncategorized'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, summary]);

  async function handleRecategorize(transactionId: string, categoryId: string) {
    await apiFetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId }),
    });
    load();
  }

  async function handleRecategorizeAll() {
    setRecategorizing(true);
    setRecategorizeNote(null);
    try {
      const res = await apiFetch('/api/transactions/recategorize', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      const data: { scanned: number; changed: number } = await res.json();
      setRecategorizeNote(
        data.changed === 0
          ? 'Nothing to update — categories are already current.'
          : `Updated ${data.changed} transaction${data.changed === 1 ? '' : 's'}.`,
      );
      await load();
    } catch {
      setRecategorizeNote('Could not re-categorize right now. Please try again.');
    } finally {
      setRecategorizing(false);
    }
  }

  if (loading) {
    return <PageSkeleton />;
  }

  if (!summary || summary.months.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Dashboard" />
        <EmptyState
          title="No transactions yet"
          href="/accounts"
          cta="Import a statement"
        >
          Upload a CSV or OFX statement to see your spending broken down by category.
        </EmptyState>
      </div>
    );
  }

  const month = selectedMonth ?? summary.months[summary.months.length - 1];
  const totals = summary.categories.map((c) => ({
    ...c,
    total: c.byMonth[month] ?? 0,
    transactionCount: c.countByMonth[month] ?? 0,
  }));
  const monthTotal = totals.reduce((sum, c) => sum + c.total, 0);
  const sorted = [...totals].sort((a, b) => b.total - a.total);
  const top = sorted[0];
  const chartData = sorted.filter((c) => c.total > 0).map((c) => ({ name: c.name, total: c.total }));
  const transactionTotal = totals.reduce((sum, c) => sum + c.transactionCount, 0);

  const allCategories =
    summary.assignableCategories ?? summary.categories.map((c) => ({ id: c.categoryId, name: c.name }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description={
          <>
            Spending for {formatMonth(month)}
            {summary.insufficientHistory &&
              ' — import at least one more month of data to see trends.'}
          </>
        }
        action={
          <div className="flex items-center gap-3">
            <label htmlFor="month-select" className="text-sm font-medium text-slate-700">
              Month
            </label>
            <Select
              id="month-select"
              value={month}
              onChange={(e) => setPickedMonth(e.target.value)}
            >
              {[...summary.months].reverse().map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <BudgetAlerts month={month} alerts={alerts} />

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <button
              type="button"
              onClick={handleRecategorizeAll}
              disabled={recategorizing}
              className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {recategorizing ? 'Re-categorizing…' : 'Re-categorize with latest rules'}
            </button>
            {recategorizeNote && <span role="status">{recategorizeNote}</span>}
          </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total spend"
          value={formatCurrency(monthTotal)}
          note={`${transactionTotal} transaction${transactionTotal === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Top category"
          value={top && top.total > 0 ? top.name : '—'}
          note={top && top.total > 0 ? formatCurrency(top.total) : undefined}
        />
        <StatCard
          label="Needs review"
          value={uncategorized.length}
          note={uncategorized.length === 0 ? 'All transactions categorized' : 'Uncategorized transactions'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sorted.map((c) => (
          <CategoryCard
            key={c.categoryId}
            name={c.name}
            total={c.total}
            transactionCount={c.transactionCount}
            isDiscretionary={c.isDiscretionary}
            sharePercent={monthTotal > 0 ? (c.total / monthTotal) * 100 : 0}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spending by category</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBarChart data={chartData} />
        </CardContent>
      </Card>

      {uncategorized.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uncategorized transactions ({uncategorized.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-slate-100">
              {uncategorized.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-800">{t.merchantRaw}</span>
                    <span className="tabular text-xs text-slate-500">
                      {t.date.slice(0, 10)} · {formatCurrency(t.amount)}
                    </span>
                  </div>
                  <Select
                    defaultValue=""
                    aria-label={`Recategorize ${t.merchantRaw}`}
                    onChange={(e) => e.target.value && handleRecategorize(t.id, e.target.value)}
                  >
                    <option value="" disabled>
                      Recategorize…
                    </option>
                    {allCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
