import { NextRequest, NextResponse } from 'next/server';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { deleteManualAccount } from '@/lib/import/manage';

export const dynamic = 'force-dynamic';

/** Delete an uploaded account with its transactions. Linked (Plaid) accounts: disconnect first. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();
  const result = await deleteManualAccount(userId, params.id);
  if (result.status === 'NOT_FOUND') {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Account not found.' }, { status: 404 });
  }
  if (result.status === 'IS_LINKED') {
    return NextResponse.json(
      { error: 'DISCONNECT_FIRST', message: 'Disconnect this linked account first, then delete it.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ deletedTransactions: result.deletedTransactions });
}
