import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { upsertUserRule } from '@/lib/categorization/engine';

const PatchSchema = z.object({ categoryId: z.string().min(1) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: parsed.error.message },
      { status: 400 },
    );
  }

  const existing = await prisma.transaction.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Transaction not found.' },
      { status: 404 },
    );
  }

  const updated = await prisma.transaction.update({
    where: { id: params.id },
    data: { categoryId: parsed.data.categoryId, categorySource: 'USER_OVERRIDE' },
    include: { category: { select: { id: true, name: true } } },
  });

  await upsertUserRule(existing.merchantRaw, parsed.data.categoryId);

  return NextResponse.json({
    transaction: {
      id: updated.id,
      date: updated.date.toISOString().slice(0, 10),
      amount: updated.amount,
      merchantRaw: updated.merchantRaw,
      category: updated.category,
      categorySource: updated.categorySource,
    },
    ruleUpdated: true,
  });
}
