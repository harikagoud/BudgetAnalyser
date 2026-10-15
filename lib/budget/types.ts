// Client-side shapes of /api/budgets (type-only; no server imports).
export type { BudgetStatus, BudgetLevel } from '@/lib/budget/evaluate';

export interface BudgetReportResponse {
  categories: { categoryId: string; name: string }[];
  month: string | null;
  limits: { categoryId: string; name: string; amount: number }[];
  statuses: import('@/lib/budget/evaluate').BudgetStatus[];
  alerts: import('@/lib/budget/evaluate').BudgetStatus[];
}

/** "2026-09" -> "September 2026" */
export function formatMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
