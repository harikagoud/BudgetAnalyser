import { NextRequest, NextResponse } from 'next/server';
import { clearedSessionCookie } from '@/lib/auth/request';

/**
 * Clears the web cookie. Tokens are stateless, so a bearer token held by the
 * mobile app is simply discarded client-side; it stays technically valid
 * until it expires (7 days) if it was copied elsewhere.
 */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', clearedSessionCookie(req.nextUrl.protocol === 'https:'));
  return res;
}
