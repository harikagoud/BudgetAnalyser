import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { isPlaidEnabled, syncAccountTransactions } from '@/lib/plaid/client';
import { getUserId, unauthorized } from '@/lib/auth/request';

export const dynamic = 'force-dynamic';

/**
 * Accounts list for the accounts page (also usable by the static mobile
 * build, which has no server components). When Plaid is enabled this also
 * re-syncs every linked account first (US5 Acceptance Scenario 2) — a sync
 * failure is logged inside syncAccountTransactions and never thrown, so the
 * list always returns whatever was last persisted.
 *
 * Only safe fields are selected: never accessTokenEncrypted.
 */
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const plaidEnabled = isPlaidEnabled();

  if (plaidEnabled) {
    const plaidAccounts = await prisma.account.findMany({
      where: { type: 'PLAID', userId },
      select: { id: true },
    });
    await Promise.all(plaidAccounts.map((a) => syncAccountTransactions(a.id)));
  }

  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      type: true,
      institutionName: true,
      _count: { select: { transactions: true } },
    },
  });

  return NextResponse.json({
    plaidEnabled,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      institutionName: a.institutionName,
      transactionCount: a._count.transactions,
    })),
  });
}
