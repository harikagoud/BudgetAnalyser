import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/auth/verification';
import { createThrottle } from '@/lib/auth/throttle';
import { VerifyEmailSchema } from '@/lib/validation/auth';
import { logger } from '@/lib/logger';

// Wrong-password attempts per IP (in-memory, per process; see lib/auth/throttle.ts).
const throttle = createThrottle({ maxFailures: 10, windowMs: 60 * 60 * 1000 });

/**
 * POST (not GET) so mail scanners that prefetch links can't trigger anything.
 * Requires the account password along with the emailed token — see verifyEmailToken.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (throttle.isBlocked(ip)) {
    return NextResponse.json(
      { error: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Try again later.' },
      { status: 429 },
    );
  }
  const parsed = VerifyEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', message: 'Enter your password.' }, { status: 400 });
  }
  try {
    const outcome = await verifyEmailToken(undefined, parsed.data.token, parsed.data.password);
    if (outcome === 'OK') return NextResponse.json({ ok: true });
    throttle.recordFailure(ip);
    if (outcome === 'BAD_PASSWORD') {
      return NextResponse.json(
        {
          error: 'INVALID_PASSWORD',
          message:
            "That isn't the password this account was created with. If you didn't choose one, sign up again with your own password to get a new link.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: 'INVALID_OR_EXPIRED_TOKEN', message: 'This verification link is invalid or has expired.' },
      { status: 400 },
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Unexpected error during email verification');
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Could not verify the email.' }, { status: 500 });
  }
}
