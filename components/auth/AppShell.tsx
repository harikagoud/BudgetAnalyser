'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { PageSkeleton } from '@/components/ui/skeleton';
import { apiFetch, clearToken, UNAUTHORIZED_EVENT } from '@/lib/api-base';

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** Called by the login/register forms after a successful response. */
  setUser: (user: AuthUser) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AppShell>');
  return ctx;
}

const PUBLIC_PATHS = ['/login', '/register', '/verify-email'];
// Readable by everyone (signed in or out) and never redirected.
const LEGAL_PATHS = ['/privacy', '/terms'];

function isLegal(pathname: string): boolean {
  return LEGAL_PATHS.includes(pathname.replace(/\/+$/, '') || '/');
}

function isPublic(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_PATHS.includes(p);
}

/**
 * Client-side auth gate for the whole app. Protected pages are not rendered
 * (so they never fetch) until GET /api/auth/me confirms a session; anything
 * else redirects to /login. This is UX only — the real enforcement is the
 * server (middleware.ts), which rejects unauthenticated API calls with 401.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // undefined = still checking, null = signed out
  const [user, setUserState] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/auth/me')
      .then(async (res) => (res.ok ? ((await res.json()).user as AuthUser) : null))
      .catch(() => null)
      .then((u) => {
        if (!cancelled) setUserState(u);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any API call elsewhere in the app that hits a 401 (e.g. expired token).
  useEffect(() => {
    const onUnauthorized = () => setUserState(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const publicPage = isPublic(pathname);
  const legalPage = isLegal(pathname);

  useEffect(() => {
    if (user === undefined) return;
    if (legalPage) return;
    if (!user && !publicPage) router.replace('/login');
    if (user && publicPage) router.replace('/');
  }, [user, publicPage, legalPage, router]);

  const setUser = useCallback((u: AuthUser) => setUserState(u), []);
  const signOut = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearToken();
    setUserState(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo(
    () => ({ user: user ?? null, setUser, signOut }),
    [user, setUser, signOut],
  );

  let body: React.ReactNode;
  if (legalPage) {
    body = children;
  } else if (user === undefined) {
    body = <PageSkeleton />;
  } else if (publicPage) {
    body = user ? <PageSkeleton /> : children; // signed-in users are bounced to "/"
  } else {
    body = user ? children : <PageSkeleton />; // signed-out users are bounced to /login
  }

  return (
    <AuthContext.Provider value={value}>
      {user && !publicPage && <NavBar email={user.email} onSignOut={signOut} />}
      <main className="mx-auto max-w-6xl px-6 py-10">{body}</main>
      <footer className="mx-auto max-w-6xl px-6 pb-8 text-xs text-slate-400">
        <Link href="/privacy" className="hover:text-slate-600 hover:underline">
          Privacy
        </Link>
        <span aria-hidden> · </span>
        <Link href="/terms" className="hover:text-slate-600 hover:underline">
          Terms
        </Link>
      </footer>
    </AuthContext.Provider>
  );
}
