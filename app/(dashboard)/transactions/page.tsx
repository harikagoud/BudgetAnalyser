'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-base';

interface TransactionRow {
  id: string;
  date: string;
  amount: number;
  merchantRaw: string;
  category: { id: string; name: string };
  categorySource: string;
}

interface SummaryResponse {
  months: string[];
  assignableCategories?: Array<{ id: string; name: string }>;
}

const MAX_ROWS = 300;

function formatMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function TransactionsPage() {
  const [months, setMonths] = useState<string[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [month, setMonth] = useState<string>(''); // '' = all months
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/summary?months=120')
      .then((res) => res.json())
      .then((s: SummaryResponse) => {
        setMonths([...s.months].reverse());
        setCategories(s.assignableCategories ?? []);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/transactions${month ? `?month=${month}` : ''}`);
    const data: { transactions: TransactionRow[] } = await res.json();
    setRows(data.transactions);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function choose(t: TransactionRow, categoryId: string) {
    if (categoryId === t.category.id) return;
    setNote(null);
    const res = await apiFetch(`/api/transactions/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId }),
    });
    if (!res.ok) {
      setNote('Could not save that change. Please try again.');
      return;
    }
    const data: { alsoUpdated: number } = await res.json();
    const name = categories.find((c) => c.id === categoryId)?.name ?? 'that category';
    setNote(
      `Saved. "${t.merchantRaw}" is now ${name}, and I'll use that for this merchant from now on` +
        (data.alsoUpdated > 0
          ? ` (${data.alsoUpdated} other transaction${data.alsoUpdated === 1 ? '' : 's'} updated too).`
          : '.'),
    );
    await load();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.merchantRaw.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        description="Change a category and the app learns it for that merchant — future imports and your other transactions from the same merchant follow."
        action={
          <div className="flex items-center gap-3">
            <label htmlFor="tx-month" className="text-sm font-medium text-slate-700">
              Month
            </label>
            <Select id="tx-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No transactions yet" href="/accounts" cta="Import a statement">
          Import a statement to see and categorize your transactions.
        </EmptyState>
      ) : (
        <Card>
          <CardContent>
            <div className="mb-3 flex flex-col gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search merchant…"
                aria-label="Search merchant"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
              />
              {note && (
                <p role="status" className="text-sm text-slate-600">
                  {note}
                </p>
              )}
            </div>
            <ul className="flex flex-col divide-y divide-slate-100">
              {visible.slice(0, MAX_ROWS).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-slate-800">{t.merchantRaw}</span>
                    <span className="tabular text-xs text-slate-500">
                      {t.date} · {formatCurrency(t.amount)}
                      {t.categorySource === 'USER_OVERRIDE' && ' · set by you'}
                    </span>
                  </div>
                  <Select
                    value={t.category.id}
                    aria-label={`Category for ${t.merchantRaw}`}
                    onChange={(e) => choose(t, e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
            {visible.length > MAX_ROWS && (
              <p className="mt-3 text-xs text-slate-500">
                Showing the first {MAX_ROWS} of {visible.length}. Pick a month or search to narrow down.
              </p>
            )}
            {visible.length === 0 && <p className="text-sm text-slate-500">No matching transactions.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
