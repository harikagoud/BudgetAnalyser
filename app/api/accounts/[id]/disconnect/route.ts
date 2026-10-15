import { NextRequest, NextResponse } from 'next/server';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { disconnectOwnedAccount } from '@/lib/plaid/accounts';

export const dynamic = 'force-dynamic';

/** Revoke the bank connection; transactions already imported stay. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();
  const outcome = await disconnectOwnedAccount(userId, params.id);
  if (outcome === 'NOT_FOUND') {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Linked account not found.' }, { status: 404 });
  }
  if (outcome === 'REVOKE_FAILED') {
    return NextResponse.json(
      { error: 'REVOKE_FAILED', message: 'Could not reach the bank connection service. Nothing was changed; please try again.' },
      { status: 502 },
    );
  }
  return NextResponse.json({ disconnected: true });
}
