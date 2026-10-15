'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlaidLink } from 'react-plaid-link';
import { PageHeader } from '@/components/ui/page-header';
import { finishLink, LINK_TOKEN_STORAGE_KEY } from '@/components/dashboard/ConnectAccountButton';

/**
 * Where OAuth banks (Bank of America, Chase, …) send the user back to. Plaid Link is re-opened
 * with the same link token and this page's URL so it can finish the login that started elsewhere.
 * This URL must match PLAID_REDIRECT_URI and be allow-listed in the Plaid dashboard.
 */
export default function PlaidOAuthPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState('Finishing your bank connection…');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LINK_TOKEN_STORAGE_KEY);
      if (saved) setToken(saved);
      else setMessage('This connection attempt expired. Go back to Accounts and press “Connect your bank” again.');
    } catch {
      setMessage('Could not resume the connection. Go back to Accounts and try again.');
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token,
    receivedRedirectUri: typeof window === 'undefined' ? undefined : window.location.href,
    onSuccess: async (publicToken: string | null, metadata) => {
      if (!publicToken) return;
      try {
        await finishLink(publicToken, metadata);
        window.localStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
        router.replace('/accounts');
      } catch {
        setMessage('Could not finish linking the account. Go back to Accounts and try again.');
      }
    },
    onExit: () => router.replace('/accounts'),
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Connecting your bank" description={message} />
    </div>
  );
}
