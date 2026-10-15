import { NextRequest, NextResponse } from 'next/server';
import { findUnverifiedUser, sendVerificationEmail } from '@/lib/auth/verification';
import { createThrottle } from '@/lib/auth/throttle';
import { EmailOnlySchema } from '@/lib/validation/auth';
import { logger } from '@/lib/logger';

// Per-process, in-memory (see lib/auth/throttle.ts). Caps mail volume per address and per IP.
const perEmail = createThrottle({ maxFailures: 3, windowMs: 60 * 60 * 1000 });
const perIp = createThrottle({ maxFailures: 10, windowMs: 60 * 60 * 1000 });

// Identical for every outcome so this can't be used to discover which emails have accounts.
const GENERIC = { ok: true, message: 'If that address has an unverified account, a new link is on its way.' };

export async function POST(req: NextRequest) {
  const parsed = EmailOnlySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', message: 'Enter a valid email.' }, { status: 400 });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { email } = parsed.data;
  if (perIp.isBlocked(ip) || perEmail.isBlocked(email)) {
    return NextResponse.json(
      { error: 'TOO_MANY_ATTEMPTS', message: 'Too many requests. Try again later.' },
      { status: 429 },
    );
  }
  perIp.recordFailure(ip);
  perEmail.recordFailure(email);

  try {
    const user = await findUnverifiedUser(undefined, email);
    if (user) await sendVerificationEmail(user);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Could not resend verification email');
  }
  return NextResponse.json(GENERIC);
}
