import { NextRequest, NextResponse } from 'next/server';
import { createLinkToken, isPlaidEnabled } from '@/lib/plaid/client';
import { logger } from '@/lib/logger';
import { getUserId, unauthorized } from '@/lib/auth/request';

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  if (!isPlaidEnabled()) {
    return NextResponse.json(
      { error: 'PLAID_DISABLED', message: 'Plaid is not enabled.' },
      { status: 404 },
    );
  }

  try {
    const result = await createLinkToken(userId);
    if (!result.enabled) {
      return NextResponse.json(
        { error: 'PLAID_DISABLED', message: 'Plaid is not enabled.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ linkToken: result.data.linkToken }, { status: 200 });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'link-token route failed');
    return NextResponse.json(
      { error: 'PLAID_ERROR', message: 'Failed to create Plaid link token.' },
      { status: 502 },
    );
  }
}
