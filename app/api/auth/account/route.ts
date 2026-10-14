import { NextRequest, NextResponse } from 'next/server';
import { deleteAccount, InvalidPasswordError } from '@/lib/auth/account-management';
import { clearedSessionCookie, getUserId, unauthorized } from '@/lib/auth/request';
import { DeleteAccountSchema } from '@/lib/validation/auth';
import { logger } from '@/lib/logger';

/** Permanently deletes the signed-in user and all their data (Play Store account-deletion requirement). */
export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const parsed = DeleteAccountSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', message: 'Enter your password to confirm.' },
      { status: 400 },
    );
  }

  try {
    await deleteAccount(undefined, userId, parsed.data);
    logger.info({ userId }, 'Account deleted');
    const res = NextResponse.json({ ok: true });
    res.headers.append('Set-Cookie', clearedSessionCookie(req.nextUrl.protocol === 'https:'));
    return res;
  } catch (err) {
    if (err instanceof InvalidPasswordError) {
      return NextResponse.json(
        { error: 'INVALID_PASSWORD', message: 'Your password is incorrect.' },
        { status: 403 },
      );
    }
    logger.error({ err: (err as Error).message }, 'Unexpected error deleting account');
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Could not delete the account.' },
      { status: 500 },
    );
  }
}
