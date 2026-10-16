import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/auth/verification';
import { VerifyEmailSchema } from '@/lib/validation/auth';
import { logger } from '@/lib/logger';

/**
 * POST (not GET) so link prefetchers can't trigger anything; the page asks the
 * user to press a button. The token is signed and tied to the account's current
 * password, so it can't be guessed or reused after the password is replaced.
 */
export async function POST(req: NextRequest) {
  const parsed = VerifyEmailSchema.safeParse(await req.json().catch(() => null));
  const invalid = NextResponse.json(
    { error: 'INVALID_OR_EXPIRED_TOKEN', message: 'This verification link is invalid or has expired.' },
    { status: 400 },
  );
  if (!parsed.success) return invalid;
  try {
    return (await verifyEmailToken(undefined, parsed.data.token)) ? NextResponse.json({ ok: true }) : invalid;
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Unexpected error during email verification');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Could not verify the email.' }, { status: 500 });
  }
}
