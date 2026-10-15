'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { BudgetAlerts } from '@/components/budget/BudgetAlerts';
import { apiFetch } from '@/lib/api-base';
import { formatCurrency } from '@/lib/utils';
import { formatMonth, type BudgetReportResponse } from '@/lib/budget/types';

interface CategoryOption {
  categoryId: string;
  name: string;
}

const BAR = { ok: 'bg-brand-500', warning: 'bg-amber-500', over: 'bg-red-500' } as const;

export default function BudgetsPage() {
  const [report, setReport] = useState<BudgetReportResponse | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (forMonth: string | null) => {
    const [budgetRes, summaryRes] = await Promise.all([
      apiFetch(`/api/budgets${forMonth ? `?month=${forMonth}` : ''}`),
      apiFetch('/api/summary?months=60'),
    ]);
    const budget: BudgetReportResponse = await budgetRes.json();
    const summary: { months: string[] } = await summaryRes.json();
    setReport(budget);
    setMonths(summary.months);
    // Categories come from the budget report (not the summary) so a new user with no data can still set limits.
    setCategories(budget.categories);
  }, []);

  useEffect(() => {
    load(month);
  }, [load, month]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!categoryId || !Number.isFinite(value) || value <= 0) {
      setError('Choose a category and enter an amount greater than 0.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, amount: value }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).message ?? 'Could not save the limit.');
        return;
      }
      setAmount('');
      await load(month);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    await apiFetch(`/api/budgets?categoryId=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load(month);
  }

  if (!report) return <PageSkeleton />;

  const shownMonth = report.month;
  const limited = new Set(report.limits.map((l) => l.categoryId));
  const available = categories.filter((c) => !limited.has(c.categoryId) || c.categoryId === categoryId);
  const inputClass =
    'h-10 w-36 rounded-lg border border-slate-300 px-3 text-sm shadow-sm transition-colors hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Budgets"
        description="Set a monthly limit for any category. You'll see a warning at 80% and an alert once it's reached. The same limit applies to every month."
        action={
          months.length > 0 && shownMonth ? (
            <div className="flex items-center gap-3">
              <label htmlFor="budget-month" className="text-sm font-medium text-slate-700">
                Month
              </label>
              <Select id="budget-month" value={shownMonth} onChange={(e) => setMonth(e.target.value)}>
                {[...months].reverse().map((m) => (
                  <option key={m} value={m}>
                    {formatMonth(m)}
                  </option>
                ))}
              </Select>
            </div>
          ) : undefined
        }
      />

      {shownMonth && <BudgetAlerts month={shownMonth} alerts={report.alerts} />}

      <Card>
        <CardHeader>
          <CardTitle>Add or change a limit</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="limit-category" className="text-sm font-medium text-slate-700">
                Category
              </label>
              <Select id="limit-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="" disabled>
                  Choose…
                </option>
                {categories.map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    {c.name}
                    {limited.has(c.categoryId) ? ' (has a limit)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="limit-amount" className="text-sm font-medium text-slate-700">
                Monthly limit ($)
              </label>
              <input
                id="limit-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 600"
                className={inputClass}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save limit'}
            </Button>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          {available.length === 0 && categories.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">Every category has a limit. Pick one above to change it.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Your limits{shownMonth ? ` — ${formatMonth(shownMonth)}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.statuses.length === 0 ? (
            <p className="text-sm text-slate-500">
              No limits yet. Add one above, for example Groceries $600 or Dining $200.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {report.statuses.map((s) => (
                <li key={s.categoryId} className="flex flex-col gap-2 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-slate-800">{s.name}</span>
                    <span className="tabular text-sm text-slate-600">
                      {formatCurrency(s.spent)} of {formatCurrency(s.limit)}{' '}
                      <span className="text-xs text-slate-400">({s.percent}%)</span>
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-label={`${s.name} spending against its limit`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(s.percent))}
                  >
                    <div className={`h-full ${BAR[s.level]}`} style={{ width: `${Math.max(0, Math.min(100, s.percent))}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {s.remaining >= 0
                        ? `${formatCurrency(s.remaining)} left`
                        : `${formatCurrency(-s.remaining)} over`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(s.categoryId)}
                      className="font-medium text-slate-500 hover:text-red-600"
                    >
                      Remove limit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
