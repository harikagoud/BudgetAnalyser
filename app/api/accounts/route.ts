import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { isPlaidEnabled } from '@/lib/plaid/client';
import { getUserId, unauthorized } from '@/lib/auth/request';

export const dynamic = 'force-dynamic';

/**
 * Accounts list for the accounts page (also usable by the static mobile
 * build, which has no server components). Listing never calls Plaid: linked
 * accounts are refreshed by the daily cron and by POST /api/accounts/:id/sync.
 *
 * Only safe fields are selected: never accessTokenEncrypted.
 */
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const plaidEnabled = isPlaidEnabled();

  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      type: true,
      institutionName: true,
      lastSyncedAt: true,
      _count: { select: { transactions: true } },
    },
  });

  return NextResponse.json({
    plaidEnabled,
    plaidEnv: plaidEnabled ? (process.env.PLAID_ENV ?? 'sandbox') : null,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      institutionName: a.institutionName,
      lastSyncedAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null,
      transactionCount: a._count.transactions,
    })),
  });
}
