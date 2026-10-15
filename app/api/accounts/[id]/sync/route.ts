import { NextRequest, NextResponse } from 'next/server';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { isPlaidEnabled } from '@/lib/plaid/client';
import { syncOwnedAccount } from '@/lib/plaid/accounts';

export const dynamic = 'force-dynamic';

/** Pull the latest transactions for one linked account. Body: `{ force?: boolean }`. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();
  if (!isPlaidEnabled()) {
    return NextResponse.json({ error: 'PLAID_DISABLED', message: 'Plaid is not enabled.' }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const outcome = await syncOwnedAccount(userId, params.id, { force: body?.force === true });

  if (!outcome.success && outcome.reason === 'NOT_FOUND') {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Linked account not found.' }, { status: 404 });
  }
  if (!outcome.success) {
    return NextResponse.json(
      { error: 'SYNC_FAILED', message: 'Could not refresh this account right now. Your existing data is unchanged.' },
      { status: 502 },
    );
  }
  if ('throttled' in outcome) return NextResponse.json({ throttled: true, transactionCount: 0 });
  return NextResponse.json({ throttled: false, transactionCount: outcome.transactionCount });
}
