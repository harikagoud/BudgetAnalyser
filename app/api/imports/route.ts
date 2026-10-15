import { NextRequest, NextResponse } from 'next/server';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { listImportsForUser } from '@/lib/import/manage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();
  return NextResponse.json({ imports: await listImportsForUser(userId) });
}
