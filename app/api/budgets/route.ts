import { NextRequest, NextResponse } from 'next/server';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { getBudgetReport, listLimits, removeLimit, setLimit, UnknownCategoryError } from '@/lib/budget/service';
import { MonthSchema, SetLimitSchema } from '@/lib/validation/budget';
import { logger } from '@/lib/logger';

/** GET /api/budgets?month=YYYY-MM -> the user's limits + how each is doing that month (default: latest month with data). */
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const monthParam = new URL(req.url).searchParams.get('month');
  if (monthParam !== null && !MonthSchema.safeParse(monthParam).success) {
    return NextResponse.json({ error: 'INVALID_MONTH', message: 'month must look like 2026-09.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getBudgetReport(undefined, userId, monthParam ?? undefined));
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Unexpected error loading budgets');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Could not load budgets.' }, { status: 500 });
  }
}

/** PUT /api/budgets { categoryId, amount } -> create or replace the monthly limit for a category. */
export async function PUT(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const parsed = SetLimitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', message: 'Enter a positive amount (up to $1,000,000, cents allowed) and a category.' },
      { status: 400 },
    );
  }
  try {
    await setLimit(undefined, userId, parsed.data.categoryId, parsed.data.amount);
    return NextResponse.json({ limits: await listLimits(undefined, userId) });
  } catch (err) {
    if (err instanceof UnknownCategoryError) {
      return NextResponse.json({ error: 'UNKNOWN_CATEGORY', message: 'Unknown category.' }, { status: 400 });
    }
    logger.error({ err: (err as Error).message }, 'Unexpected error saving budget limit');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Could not save the limit.' }, { status: 500 });
  }
}

/** DELETE /api/budgets?categoryId=... -> remove a limit (idempotent). */
export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const categoryId = new URL(req.url).searchParams.get('categoryId');
  if (!categoryId || categoryId.length > 64) {
    return NextResponse.json({ error: 'INVALID_BODY', message: 'categoryId is required.' }, { status: 400 });
  }
  await removeLimit(undefined, userId, categoryId);
  return NextResponse.json({ limits: await listLimits(undefined, userId) });
}
