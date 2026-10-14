'use client';

import { useCallback, useEffect, useState } from 'react';
import { UploadForm } from '@/components/dashboard/UploadForm';
import { ConnectAccountButton } from '@/components/dashboard/ConnectAccountButton';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { apiFetch } from '@/lib/api-base';

interface AccountRow {
  id: string;
  name: string;
  type: string;
  institutionName: string | null;
  transactionCount: number;
}

interface AccountsResponse {
  plaidEnabled: boolean;
  accounts: AccountRow[];
}

export default function AccountsPage() {
  const [data, setData] = useState<AccountsResponse | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/accounts');
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The flag is resolved server-side by /api/accounts; the Connect button is
  // not rendered at all (not just hidden) until the server says Plaid is on
  // (US5 scenario 3).
  const plaidEnabled = data?.plaidEnabled ?? false;
  const accounts = data?.accounts ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Accounts"
        description="Upload a CSV or OFX statement to import transactions. Nothing is sent anywhere outside this app — everything runs on your local machine."
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex-1">
          <UploadForm onImported={load} />
        </div>
        {plaidEnabled && (
          <Card className="p-5 lg:w-72">
            <p className="mb-3 text-sm text-slate-500">
              Or link an account directly through Plaid (sandbox).
            </p>
            <ConnectAccountButton onLinked={load} />
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-500">Existing accounts</h2>
        {data === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-slate-400">No accounts yet — import a statement above.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {accounts.map((a) => (
              <li key={a.id}>
                <Card className="flex items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
                  >
                    {a.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-500">
                      {a.transactionCount} transaction{a.transactionCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {a.type === 'PLAID' ? 'Linked' : 'Imported'}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
