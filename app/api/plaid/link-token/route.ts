import { NextResponse } from 'next/server';
import { createLinkToken, isPlaidEnabled } from '@/lib/plaid/client';
import { logger } from '@/lib/logger';

export async function POST() {
  if (!isPlaidEnabled()) {
    return NextResponse.json(
      { error: 'PLAID_DISABLED', message: 'Plaid is not enabled.' },
      { status: 404 },
    );
  }

  try {
    const result = await createLinkToken();
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
