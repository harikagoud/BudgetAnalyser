import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyUserCategoryChoice } from '@/lib/categorization/learn';
import { getUserId, unauthorized } from '@/lib/auth/request';

const PatchSchema = z.object({ categoryId: z.string().min(1) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: parsed.error.message },
      { status: 400 },
    );
  }

  // Ownership is enforced inside: someone else's transaction is a 404, not a 403.
  const result = await applyUserCategoryChoice(userId, params.id, parsed.data.categoryId);
  if (!result.transaction) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Transaction not found.' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    transaction: result.transaction,
    ruleUpdated: true,
    alsoUpdated: result.alsoUpdated,
  });
}
