import { NextRequest, NextResponse } from 'next/server';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { recategorizeUserTransactions } from '@/lib/categorization/recategorize';

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();
  const result = await recategorizeUserTransactions(userId);
  return NextResponse.json(result);
}
