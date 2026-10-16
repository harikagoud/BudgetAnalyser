'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-base';
import { linkedAccountName } from '@/lib/plaid/label';

/** Banks that use OAuth leave the app and come back to /plaid-oauth, which needs this token again. */
export const LINK_TOKEN_STORAGE_KEY = 'plaid_link_token';

/** Sends the one-time public token to the server, which stores the bank connection. */
export async function finishLink(publicToken: string, metadata: PlaidLinkOnSuccessMetadata): Promise<void> {
  const res = await apiFetch('/api/plaid/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicToken,
      accountName: linkedAccountName(metadata),
      institutionName: metadata.institution?.name ?? null,
    }),
  });
  if (!res.ok) throw new Error('exchange failed');
}

/**
 * "Connect your bank" flow (US5, FR-011). Only ever rendered by the parent page when the
 * server reports `ENABLE_PLAID=true` (GET /api/accounts -> `plaidEnabled`) — this component
 * itself does not re-check the flag (Constitution Principle IV).
 */
export function ConnectAccountButton({ onLinked, env }: { onLinked?: () => void; env?: string | null }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'linking' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/plaid/link-token', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setLinkToken(data.linkToken);
        try {
          window.localStorage.setItem(LINK_TOKEN_STORAGE_KEY, data.linkToken);
        } catch {
          /* private mode: OAuth banks will ask the user to start again */
        }
      })
      .catch(() => setError('Could not start the connection flow.'));
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!publicToken) return;
      setStatus('linking');
      setError(null);
      try {
        await finishLink(publicToken, metadata);
        setStatus('idle');
        router.refresh();
        onLinked?.();
      } catch {
        setStatus('error');
        setError('Could not finish linking the account.');
      }
    },
    [router, onLinked],
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => open()} disabled={!ready || status === 'linking'}>
        {status === 'linking' ? 'Linking…' : env && env !== 'production' ? `Connect your bank (${env})` : 'Connect your bank'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
