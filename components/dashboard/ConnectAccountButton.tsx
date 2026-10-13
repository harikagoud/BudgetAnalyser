'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { Button } from '@/components/ui/button';

/**
 * Sandbox "Connect an account" flow (US5, FR-011). Only ever rendered by
 * the parent page when `ENABLE_PLAID=true` (app/(dashboard)/accounts/page.tsx,
 * T057) — this component itself does not re-check the flag, since that
 * check must happen server-side to avoid leaking the flag's state to the
 * client bundle either way (Constitution Principle IV).
 */
export function ConnectAccountButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'linking' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/plaid/link-token', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => setLinkToken(data.linkToken))
      .catch(() => setError('Could not start the connection flow.'));
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!publicToken) return;
      setStatus('linking');
      setError(null);
      try {
        const res = await fetch('/api/plaid/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken,
            accountName: metadata.institution?.name ?? 'Linked Account',
            institutionName: metadata.institution?.name ?? null,
          }),
        });
        if (!res.ok) throw new Error('exchange failed');
        setStatus('idle');
        router.refresh();
      } catch {
        setStatus('error');
        setError('Could not finish linking the account.');
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => open()} disabled={!ready || status === 'linking'}>
        {status === 'linking' ? 'Linking…' : 'Connect an account (sandbox)'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
