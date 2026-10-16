'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-base';

function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
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
          <div className="flex flex-col gap-4 text-center">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Confirm your email</h1>
              <p className="mt-1 text-sm text-slate-600">Press the button to finish creating your account.</p>
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                {error}
              </p>
            )}
            <Button type="button" onClick={handleConfirm} disabled={busy} className="h-11">
              {busy ? 'Verifying…' : 'Confirm my email'}
            </Button>
          </div>
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
