import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/client';
import { computeMonthlySummaryFromDb } from '@/lib/aggregation/monthly-summary';
import { alertsFrom, evaluateLimits, type BudgetStatus } from '@/lib/budget/evaluate';

export class UnknownCategoryError extends Error {
  constructor() {
    super('Unknown category.');
    this.name = 'UnknownCategoryError';
  }
}

export interface LimitRow {
  categoryId: string;
  name: string;
  amount: number;
}

export async function listLimits(client: PrismaClient = defaultPrisma, userId: string): Promise<LimitRow[]> {
  const rows = await client.budgetLimit.findMany({
    where: { userId },
    include: { category: { select: { name: true } } },
    orderBy: { category: { name: 'asc' } },
  });
  return rows.map((r) => ({ categoryId: r.categoryId, name: r.category.name, amount: r.amount }));
}

export async function setLimit(
  client: PrismaClient = defaultPrisma,
  userId: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const category = await client.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new UnknownCategoryError();
  const rounded = Math.round(amount * 100) / 100;
  await client.budgetLimit.upsert({
    where: { userId_categoryId: { userId, categoryId } },
    create: { userId, categoryId, amount: rounded },
    update: { amount: rounded },
  });
}

export async function removeLimit(
  client: PrismaClient = defaultPrisma,
  userId: string,
  categoryId: string,
): Promise<void> {
  await client.budgetLimit.deleteMany({ where: { userId, categoryId } });
}

export interface BudgetReport {
  /** Every category a limit can be set on (so a brand-new user with no data can still set limits). */
  categories: { categoryId: string; name: string }[];
  /** The month the statuses are for ("YYYY-MM"), or null when there is no data yet. */
  month: string | null;
  limits: LimitRow[];
  statuses: BudgetStatus[];
  alerts: BudgetStatus[];
}

/**
 * Limits plus how each is doing in `month` (default: the latest month that has
 * data, since people often import past statements and the calendar month is
 * empty). Uses the same net-of-refunds totals as the dashboard.
 */
export async function getBudgetReport(
  client: PrismaClient = defaultPrisma,
  userId: string,
  month?: string,
): Promise<BudgetReport> {
  const [limits, summaries, categoryRows] = await Promise.all([
    listLimits(client, userId),
    computeMonthlySummaryFromDb({ userId, months: 120 }, client),
    client.category.findMany({ where: { excludeFromSpending: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const months = summaries.map((s) => s.yearMonth);
  const chosen = month && months.includes(month) ? month : (months[months.length - 1] ?? null);
  const summary = summaries.find((s) => s.yearMonth === chosen);
  const spent: Record<string, number> = {};
  for (const c of summary?.categories ?? []) spent[c.categoryId] = c.total;
  const statuses = evaluateLimits(limits, spent);
  return {
    categories: categoryRows.map((c) => ({ categoryId: c.id, name: c.name })),
    month: chosen,
    limits,
    statuses,
    alerts: alertsFrom(statuses),
  };
}

/** Alerts, for each month that an import added transactions to. */
export async function alertsForImportBatch(
  client: PrismaClient = defaultPrisma,
  userId: string,
  importBatchId: string,
): Promise<{ month: string; alerts: BudgetStatus[] }[]> {
  const limits = await listLimits(client, userId);
  if (limits.length === 0) return [];
  const rows = await client.transaction.findMany({
    where: { importBatchId, account: { userId } },
    select: { date: true },
    distinct: ['date'],
  });
  const touched = Array.from(new Set(rows.map((r) => r.date.toISOString().slice(0, 7)))).sort();
  if (touched.length === 0) return [];
  const summaries = await computeMonthlySummaryFromDb({ userId, months: 120 }, client);
  const out: { month: string; alerts: BudgetStatus[] }[] = [];
  for (const month of touched) {
    const summary = summaries.find((s) => s.yearMonth === month);
    const spent: Record<string, number> = {};
    for (const c of summary?.categories ?? []) spent[c.categoryId] = c.total;
    const alerts = alertsFrom(evaluateLimits(limits, spent));
    if (alerts.length > 0) out.push({ month, alerts });
  }
  return out;
}
