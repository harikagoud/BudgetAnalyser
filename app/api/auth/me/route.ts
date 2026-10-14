import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getUserId, unauthorized } from '@/lib/auth/request';

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  // Valid token for a user that no longer exists (deleted DB, etc.): treat as signed out.
  if (!user) return unauthorized();
  return NextResponse.json({ user });
}
