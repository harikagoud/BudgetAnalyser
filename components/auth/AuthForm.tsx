'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiFetch, storeToken } from '@/lib/api-base';
import { useAuth } from '@/components/auth/AppShell';

const COPY = {
  login: {
    title: 'Welcome back',
    subtitle: 'Sign in to see your budget.',
    submit: 'Sign in',
    busy: 'Signing in…',
    endpoint: '/api/auth/login',
    altText: "Don't have an account?",
    altLink: '/register',
    altLabel: 'Create one',
    passwordAutocomplete: 'current-password',
  },
  register: {
    title: 'Create your account',
    subtitle: 'Your data stays private to your account.',
    submit: 'Create account',
    busy: 'Creating account…',
    endpoint: '/api/auth/register',
    altText: 'Already have an account?',
    altLink: '/login',
    altLabel: 'Sign in',
    passwordAutocomplete: 'new-password',
  },
} as const;

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const copy = COPY[mode];
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set after register, or when login is refused for an unverified email.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);

  async function handleResend() {
    if (!pendingEmail) return;
    setResendNote(null);
    try {
      const res = await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json().catch(() => ({}));
      setResendNote(data.message ?? 'Please try again later.');
    } catch {
      setResendNote('Could not reach the server. Try again.');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(copy.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? 'Something went wrong. Please try again.');
        if (data.error === 'EMAIL_NOT_VERIFIED') setPendingEmail(email.trim().toLowerCase());
        return;
      }
      if (data.pendingVerification) {
        setPendingEmail(data.email); // registered; waiting for the emailed link
        if (data.emailSent === false) {
          setError('Your account was created but we could not send the email. Use "Resend" below.');
        }
        return;
      }
      if (data.token) storeToken(data.token); // no-op on web (cookie is used)
      setUser(data.user); // AppShell then redirects to "/"
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'h-11 rounded-lg border border-slate-300 px-3 text-sm shadow-sm transition-colors hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

  if (pendingEmail && mode === 'register') {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 pt-6">
        <Card className="flex flex-col gap-3 p-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Check your email</h1>
          <p className="text-sm text-slate-600">
            We sent a verification link to <strong>{pendingEmail}</strong>. Click it, then sign in. The
            link expires in 24 hours.
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              {error}
            </p>
          )}
          <Button type="button" onClick={handleResend} className="h-11">
            Resend email
          </Button>
          {resendNote && <p className="text-xs text-slate-500">{resendNote}</p>}
          <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">
            Go to sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20V10" />
            <path d="M10 20V4" />
            <path d="M16 20v-7" />
            <path d="M22 20H2" />
          </svg>
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={copy.passwordAutocomplete}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {mode === 'register' && (
              <p className="text-xs text-slate-500">At least 8 characters.</p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              {error}
            </p>
          )}
          {pendingEmail && mode === 'login' && (
            <div className="flex flex-col gap-1 text-sm">
              <button type="button" onClick={handleResend} className="self-start font-medium text-brand-600 hover:underline">
                Resend verification email
              </button>
              {resendNote && <span className="text-xs text-slate-500">{resendNote}</span>}
            </div>
          )}

          <Button type="submit" disabled={busy || !email || !password} className="h-11">
            {busy ? copy.busy : copy.submit}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-slate-500">
        {copy.altText}{' '}
        <Link href={copy.altLink} className="font-medium text-brand-600 hover:underline">
          {copy.altLabel}
        </Link>
      </p>
    </div>
  );
}
