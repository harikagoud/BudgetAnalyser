'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-base';

function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? 'Could not verify. Please try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'h-11 rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-6">
      <Card className="flex flex-col gap-3 p-6">
        {done ? (
          <div className="flex flex-col gap-3 text-center">
            <h1 className="text-xl font-semibold text-slate-900">Email verified</h1>
            <p className="text-sm text-slate-600">Your account is ready.</p>
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Sign in
            </Link>
          </div>
        ) : !token ? (
          <div className="flex flex-col gap-3 text-center">
            <h1 className="text-xl font-semibold text-slate-900">Link not valid</h1>
            <p className="text-sm text-slate-600">This verification link is incomplete. Use the link from your email.</p>
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-slate-900">Confirm your email</h1>
              <p className="mt-1 text-sm text-slate-600">Enter the password you chose when signing up.</p>
            </div>
            <input
              type="password"
              autoComplete="current-password"
              aria-label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !password} className="h-11">
              {busy ? 'Verifying…' : 'Verify email'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams needs a Suspense boundary for static export / prerender.
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}
