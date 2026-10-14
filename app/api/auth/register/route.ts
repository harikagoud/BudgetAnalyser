import { NextRequest, NextResponse } from 'next/server';
import { registerUser, EmailTakenError } from '@/lib/auth/service';
import { signToken } from '@/lib/auth/token';
import { sessionCookie } from '@/lib/auth/request';
import { validateCredentials } from '@/lib/validation/auth';
import { createThrottle } from '@/lib/auth/throttle';
import { logger } from '@/lib/logger';

// 10 registration attempts per IP per hour. Per-process, in-memory (see lib/auth/throttle.ts).
const throttle = createThrottle({ maxFailures: 10, windowMs: 60 * 60 * 1000 });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (throttle.isBlocked(ip)) {
    return NextResponse.json(
      { error: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-up attempts. Try again later.' },
      { status: 429 },
    );
  }
  // Every attempt counts (success or not), so this also caps bulk sign-ups.
  throttle.recordFailure(ip);

  const body = await req.json().catch(() => null);
  const parsed = validateCredentials(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'INVALID_BODY',
        message: 'Enter a valid email and a password of 8–128 characters.',
      },
      { status: 400 },
    );
  }

  try {
    const user = await registerUser(undefined, parsed.data);
    const token = await signToken(user.id);
    const res = NextResponse.json({ user, token }, { status: 201 });
    res.headers.append('Set-Cookie', sessionCookie(token, req.nextUrl.protocol === 'https:'));
    return res;
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return NextResponse.json(
        { error: 'EMAIL_TAKEN', message: 'An account with that email already exists.' },
        { status: 409 },
      );
    }
    logger.error({ err: (err as Error).message }, 'Unexpected error during registration');
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Could not create the account.' },
      { status: 500 },
    );
  }
}
