'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/components/auth/AppShell';
import { apiFetch, clearToken } from '@/lib/api-base';

const inputClass =
  'h-10 rounded-lg border border-slate-300 px-3 text-sm shadow-sm transition-colors hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: 'Password updated.' });
        setCurrent('');
        setNext('');
      } else {
        setMessage({ ok: false, text: data.message ?? 'Could not change the password.' });
      }
    } catch {
      setMessage({ ok: false, text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="current-password" className="text-sm font-medium text-slate-700">
              Current password
            </label>
            <input id="current-password" type="password" autoComplete="current-password" required
              value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-password" className="text-sm font-medium text-slate-700">
              New password
            </label>
            <input id="new-password" type="password" autoComplete="new-password" required minLength={8}
              value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
            <p className="text-xs text-slate-500">At least 8 characters.</p>
          </div>
          {message && (
            <p role={message.ok ? 'status' : 'alert'}
              className={message.ok
                ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200'
                : 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200'}>
              {message.text}
            </p>
          )}
          <Button type="submit" disabled={busy || !current || !next} className="self-start">
            {busy ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteAccountCard() {
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        clearToken();
        await signOut();
        return;
      }
      setError(data.message ?? 'Could not delete the account.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-red-700">Delete account</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="max-w-xl text-sm text-slate-600">
          Permanently deletes your account and everything in it — accounts, transactions, imported
          statements, category rules and settings. This cannot be undone.
        </p>
        {!confirming ? (
          <Button type="button" variant="outline" className="mt-4 border-red-300 text-red-700 hover:bg-red-50"
            onClick={() => setConfirming(true)}>
            Delete my account…
          </Button>
        ) : (
          <form onSubmit={handleDelete} className="mt-4 flex max-w-sm flex-col gap-3">
            <label htmlFor="delete-password" className="text-sm font-medium text-slate-700">
              Enter your password to confirm
            </label>
            <input id="delete-password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !password} className="bg-red-600 hover:bg-red-700">
                {busy ? 'Deleting…' : 'Permanently delete'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setConfirming(false); setPassword(''); setError(null); }}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" description={user ? `Signed in as ${user.email}` : undefined} />
      <ChangePasswordCard />
      <DeleteAccountCard />
    </div>
  );
}
