/**
 * Base URL for API calls. Empty on the web (same-origin relative URLs keep
 * working exactly as before). The Capacitor mobile build is a static bundle
 * served from the device, so it sets NEXT_PUBLIC_API_BASE at build time to
 * the server that hosts the /api routes (e.g. http://<lan-ip>:3000).
 */
export function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_BASE ?? ''}${path}`;
}

// --- Auth-aware fetch -------------------------------------------------------
// Web: the session lives in an httpOnly cookie the browser sends itself; no
// token is ever readable from JS. Mobile (cross-origin WebView, where cookies
// don't fit): the token returned by login is kept in localStorage and sent as
// a Bearer header. `isMobileClient` is true only in the Capacitor build.

const TOKEN_KEY = 'ba_token';
export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

export const isMobileClient = Boolean(process.env.NEXT_PUBLIC_API_BASE);

export function storeToken(token: string): void {
  if (isMobileClient && typeof window !== 'undefined') window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
}

function readToken(): string | null {
  if (!isMobileClient || typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/**
 * fetch() for our own API: prefixes the base URL, attaches the mobile bearer
 * token, and on any 401 (outside /api/auth/*) clears local credentials and
 * fires UNAUTHORIZED_EVENT so the app shell can send the user to /login.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(apiUrl(path), { ...init, headers });

  if (res.status === 401 && !path.startsWith('/api/auth/') && typeof window !== 'undefined') {
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  return res;
}
