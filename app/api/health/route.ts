import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/** Liveness + DB reachability for load balancers / uptime checks. Public; reveals nothing but status. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  }
}
