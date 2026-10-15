import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import {
  exchangePublicToken,
  isPlaidEnabled,
  removePlaidItem,
  syncAccountTransactions,
} from '@/lib/plaid/client';
import { encrypt } from '@/lib/security/encryption';
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

  const body = await req.json().catch(() => null);
  const publicToken = body?.publicToken;
  const accountName = body?.accountName;
  const institutionName =
    typeof body?.institutionName === 'string' ? body.institutionName : null;

  if (typeof publicToken !== 'string' || typeof accountName !== 'string') {
    return NextResponse.json(
      { error: 'INVALID_BODY', message: 'Expected { publicToken, accountName }.' },
      { status: 400 },
    );
  }

  // Fail before talking to Plaid if we could not store the token safely (bad/missing ENCRYPTION_KEY),
  // so no bank connection is ever created that we cannot keep track of.
  try {
    encrypt('probe');
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'ENCRYPTION_KEY is not usable; refusing to link an account');
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Bank connections are not configured on this server.' },
      { status: 500 },
    );
  }

  let exchanged;
  try {
    exchanged = await exchangePublicToken(publicToken);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'exchange route failed');
    return NextResponse.json(
      { error: 'PLAID_ERROR', message: 'Failed to exchange Plaid public token.' },
      { status: 502 },
    );
  }

  if (!exchanged.enabled) {
    return NextResponse.json(
      { error: 'PLAID_DISABLED', message: 'Plaid is not enabled.' },
      { status: 404 },
    );
  }

  try {
    const account = await prisma.account.create({
      data: {
        userId,
        name: accountName,
        type: 'PLAID',
        plaidItemId: exchanged.data.itemId,
        accessTokenEncrypted: encrypt(exchanged.data.accessToken),
        institutionName,
      },
    });

    // Best-effort initial sync — a failure here is logged and reported, but
    // never blocks or undoes the just-created Account (Edge Case: sandbox
    // errors must not wipe/block existing or new data).
    const syncOutcome = await syncAccountTransactions(account.id);
    if (!syncOutcome.success) {
      logger.warn(
        { accountId: account.id, reason: syncOutcome.reason },
        'Initial Plaid sync did not complete',
      );
    }

    return NextResponse.json(
      { accountId: account.id, institutionName: account.institutionName },
      { status: 200 },
    );
  } catch (err) {
    // Do not leave an orphaned connection at Plaid that no account of ours points to.
    await removePlaidItem(exchanged.data.accessToken);
    // Covers encrypt() throwing (missing/malformed ENCRYPTION_KEY) and any
    // Account persistence failure — never leaks the token or raw error.
    logger.error({ err: (err as Error).message }, 'Unexpected error finishing Plaid exchange');
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred while linking the account.' },
      { status: 500 },
    );
  }
}
