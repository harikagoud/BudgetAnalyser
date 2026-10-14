import { NextResponse } from 'next/server';

/** Set ONLY by middleware.ts after verifying the token; stripped from inbound requests there. */
export const USER_ID_HEADER = 'x-user-id';
export const COOKIE_NAME = 'ba_token';
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

/**
 * The authenticated user's id for a request that has passed middleware.
 * Null means "not authenticated" — route handlers must 401. This is defense
 * in depth: even if middleware's matcher ever missed a route, a handler that
 * calls this still refuses to serve without a user.
 */
export function getUserId(req: Request): string | null {
  return req.headers.get(USER_ID_HEADER) || null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'UNAUTHORIZED', message: 'Sign in required.' },
    { status: 401 },
  );
}

export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  return [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}
