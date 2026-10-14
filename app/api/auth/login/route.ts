import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/service';
import { signToken } from '@/lib/auth/token';
import { sessionCookie } from '@/lib/auth/request';
import { createThrottle } from '@/lib/auth/throttle';
import { validateCredentials } from '@/lib/validation/auth';
import { logger } from '@/lib/logger';

// Per-process; see lib/auth/throttle.ts for its limits.
const throttle = createThrottle();

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = validateCredentials(body);
  if (!parsed.success) {
    // Same wording as a wrong password: don't reveal which part was off.
    return NextResponse.json(
      { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      { status: 401 },
    );
  }

  const key = `${clientIp(req)}|${parsed.data.email}`;
  if (throttle.isBlocked(key)) {
    return NextResponse.json(
      { error: 'TOO_MANY_ATTEMPTS', message: 'Too many failed attempts. Try again later.' },
      { status: 429 },
    );
  }

  try {
    const user = await authenticateUser(undefined, parsed.data);
    if (!user) {
      throttle.recordFailure(key);
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
        { status: 401 },
      );
    }
    throttle.reset(key);
    const token = await signToken(user.id);
    const res = NextResponse.json({ user, token });
    res.headers.append('Set-Cookie', sessionCookie(token, req.nextUrl.protocol === 'https:'));
    return res;
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Unexpected error during login');
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Could not sign in.' },
      { status: 500 },
    );
  }
}
