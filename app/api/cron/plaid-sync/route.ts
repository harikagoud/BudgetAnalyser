import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/plaid/cron-auth';
import { isPlaidEnabled } from '@/lib/plaid/client';
import { syncAllPlaidAccounts } from '@/lib/plaid/accounts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily refresh of every linked account. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Not allowed.' }, { status: 401 });
  }
  if (!isPlaidEnabled()) return NextResponse.json({ skipped: 'PLAID_DISABLED' });
  return NextResponse.json(await syncAllPlaidAccounts());
}
