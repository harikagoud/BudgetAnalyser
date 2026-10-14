import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/token';
import { COOKIE_NAME, USER_ID_HEADER } from '@/lib/auth/request';

// Runs on the Edge runtime (no Prisma / Node APIs), which is why sessions are
// stateless signed tokens (lib/auth/token.ts, Web Crypto) rather than DB rows.
//
// Responsibilities, in order:
//  1. CORS for the Capacitor mobile WebView origins (an allowlist — not "*").
//     CORS is browser-side only and is NOT authentication.
//  2. Authentication: every /api/* route except login/register/logout needs a
//     valid token, via `Authorization: Bearer <token>` (mobile) or the
//     httpOnly cookie (web).
//  3. Identity propagation: any client-supplied x-user-id header is stripped
//     and replaced by the verified one, so handlers can trust it.
const ALLOWED_ORIGINS = new Set([
  'http://localhost', // Android WebView (androidScheme: http)
  'https://localhost', // Android WebView (androidScheme: https)
  'capacitor://localhost', // iOS WebView
]);

const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/health',
]);

function setCors(res: NextResponse, origin: string) {
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Vary', 'Origin');
}

function withCors(res: NextResponse, origin: string | null): NextResponse {
  if (origin !== null && ALLOWED_ORIGINS.has(origin)) setCors(res, origin);
  return res;
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim() || null;
  return req.cookies.get(COOKIE_NAME)?.value || null;
}

export async function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const originAllowed = origin !== null && ALLOWED_ORIGINS.has(origin);

  if (req.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: originAllowed ? 204 : 403 }), origin);
  }

  const headers = new Headers(req.headers);
  headers.delete(USER_ID_HEADER); // never trust an inbound value

  if (!PUBLIC_PATHS.has(req.nextUrl.pathname)) {
    let verified: { userId: string } | null;
    try {
      const token = extractToken(req);
      verified = token ? await verifyToken(token) : null;
    } catch {
      // AUTH_SECRET missing/weak: fail closed, and say nothing useful to the client.
      return withCors(
        NextResponse.json(
          { error: 'SERVER_MISCONFIGURED', message: 'Authentication is not configured.' },
          { status: 500 },
        ),
        origin,
      );
    }
    if (!verified) {
      return withCors(
        NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Sign in required.' },
          { status: 401 },
        ),
        origin,
      );
    }
    headers.set(USER_ID_HEADER, verified.userId);
  }

  return withCors(NextResponse.next({ request: { headers } }), origin);
}

export const config = { matcher: '/api/:path*' };
