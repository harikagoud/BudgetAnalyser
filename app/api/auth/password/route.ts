import { NextRequest, NextResponse } from 'next/server';
import { changePassword, InvalidPasswordError } from '@/lib/auth/account-management';
import { getUserId, unauthorized } from '@/lib/auth/request';
import { ChangePasswordSchema } from '@/lib/validation/auth';
import { logger } from '@/lib/logger';

export async function PUT(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const parsed = ChangePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', message: 'The new password must be 8–128 characters.' },
      { status: 400 },
    );
  }

  try {
    await changePassword(undefined, userId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidPasswordError) {
      return NextResponse.json(
        { error: 'INVALID_PASSWORD', message: 'Your current password is incorrect.' },
        { status: 403 },
      );
    }
    logger.error({ err: (err as Error).message }, 'Unexpected error changing password');
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Could not change the password.' },
      { status: 500 },
    );
  }
}
