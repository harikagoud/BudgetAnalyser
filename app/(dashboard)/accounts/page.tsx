'use client';

import { useCallback, useEffect, useState } from 'react';
import { UploadForm } from '@/components/dashboard/UploadForm';
import { ConnectAccountButton } from '@/components/dashboard/ConnectAccountButton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { apiFetch } from '@/lib/api-base';

interface AccountRow {
  id: string;
  name: string;
  type: string;
  institutionName: string | null;
  lastSyncedAt: string | null;
  transactionCount: number;
}

interface ImportRow {
  id: string;
  fileName: string;
  format: string;
  accountName: string;
  createdAt: string;
  transactionCount: number;
}

interface AccountsResponse {
  plaidEnabled: boolean;
  plaidEnv?: string | null;
  accounts: AccountRow[];
}

export default function AccountsPage() {
  const [data, setData] = useState<AccountsResponse | null>(null);

  const [imports, setImports] = useState<ImportRow[]>([]);

  const load = useCallback(async () => {
    const [res, importsRes] = await Promise.all([apiFetch('/api/accounts'), apiFetch('/api/imports')]);
    setData(await res.json());
    if (importsRes.ok) setImports((await importsRes.json()).imports);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Opening the page refreshes linked accounts that have not been updated for an hour
  // (the server also skips accounts synced in the last few minutes).
  useEffect(() => {
    if (!data?.plaidEnabled) return;
    const stale = data.accounts.filter(
      (a) =>
        a.type === 'PLAID' &&
        // A freshly linked bank can report no history for a few minutes, so an empty account stays "stale".
        (!a.lastSyncedAt || a.transactionCount === 0 || Date.now() - Date.parse(a.lastSyncedAt) > 60 * 60 * 1000),
    );
    if (stale.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const a of stale) {
        await apiFetch(`/api/accounts/${a.id}/sync`, { method: 'POST' }).catch(() => undefined);
      }
      if (!cancelled) load();
    })();
    return () => {
      cancelled = true;
    };
    // Only on first load of the list, not after every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null]);

  async function syncNow(a: AccountRow) {
    setBusyId(a.id);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/accounts/${a.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) throw new Error('sync failed');
      const out: { transactionCount: number } = await res.json();
      setNotice(
        out.transactionCount > 0
          ? `${a.name}: ${out.transactionCount} new transaction${out.transactionCount === 1 ? '' : 's'}.`
          : `${a.name} is up to date.`,
      );
      await load();
    } catch {
      setNotice(`Could not refresh ${a.name} right now. Your existing data is unchanged.`);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteImport(b: ImportRow) {
    const n = b.transactionCount;
    if (
      !window.confirm(
        `Delete “${b.fileName}”? This removes the ${n} transaction${n === 1 ? '' : 's'} this upload added` +
          ' (including any category changes you made to them). You can upload the file again later.',
      )
    )
      return;
    setBusyId(b.id);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/imports/${b.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setNotice(`Deleted “${b.fileName}”.`);
      await load();
    } catch {
      setNotice(`Could not delete “${b.fileName}” right now. Nothing was changed; please try again.`);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccountRow(a: AccountRow) {
    if (
      !window.confirm(
        `Delete the account “${a.name}” with its ${a.transactionCount} transaction${a.transactionCount === 1 ? '' : 's'} and all its uploads? This can't be undone.`,
      )
    )
      return;
    setBusyId(a.id);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/accounts/${a.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setNotice(`Deleted ${a.name}.`);
      await load();
    } catch {
      setNotice(`Could not delete ${a.name} right now. Nothing was changed; please try again.`);
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(a: AccountRow) {
    if (!window.confirm(`Disconnect ${a.name}? Transactions already imported stay; no new ones will be pulled.`)) return;
    setBusyId(a.id);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/accounts/${a.id}/disconnect`, { method: 'POST' });
      if (!res.ok) throw new Error('disconnect failed');
      setNotice(`${a.name} disconnected.`);
      await load();
    } catch {
      setNotice(`Could not disconnect ${a.name} right now. Nothing was changed; please try again.`);
    } finally {
      setBusyId(null);
    }
  }

  // The flag is resolved server-side by /api/accounts; the Connect button is
  // not rendered at all (not just hidden) until the server says Plaid is on
  // (US5 scenario 3).
  const plaidEnabled = data?.plaidEnabled ?? false;
  const accounts = data?.accounts ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Accounts"
        description={
          plaidEnabled
            ? 'Add your transactions either way: upload a statement file, or connect your bank so they arrive automatically.'
            : 'Upload a statement (CSV, OFX/QFX, QIF, Excel, PDF) to import transactions.'
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex-1">
          <UploadForm onImported={load} />
        </div>
        {plaidEnabled && (
          <Card className="p-5 lg:w-72">
            <p className="mb-1 text-sm font-medium text-slate-800">Or connect your bank</p>
            <p className="mb-3 text-sm text-slate-500">
              Securely link a card or account through Plaid and new transactions arrive on their own.
            </p>
            <ConnectAccountButton onLinked={load} env={data?.plaidEnv} />
            <p className="mt-3 text-xs text-slate-500">
              Don&apos;t also upload statements for a card you connect here, or purchases will be counted twice.
            </p>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-500">Existing accounts</h2>
        {notice && (
          <p role="status" className="mb-3 text-sm text-slate-600">
            {notice}
          </p>
        )}
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
                      {a.type === 'PLAID' && (a.lastSyncedAt ? ` · synced ${new Date(a.lastSyncedAt).toLocaleString()}` : ' · not synced yet')}
                    </p>
                    {a.type !== 'PLAID' && (
                      <div className="mt-2">
                        <Button type="button" size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => deleteAccountRow(a)}>
                          Delete account
                        </Button>
                      </div>
                    )}
                    {a.type === 'PLAID' && (
                      <div className="mt-2 flex gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={busyId === a.id} onClick={() => syncNow(a)}>
                          {busyId === a.id ? 'Working…' : 'Sync now'}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => disconnect(a)}>
                          Disconnect
                        </Button>
                      </div>
                    )}
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

      {imports.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-slate-500">Uploaded statements</h2>
          <Card>
            <ul className="divide-y divide-slate-100">
              {imports.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{b.fileName}</p>
                    <p className="text-xs text-slate-500">
                      {b.accountName} · {b.format} · {new Date(b.createdAt).toLocaleDateString()} · {b.transactionCount} transaction
                      {b.transactionCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={busyId === b.id} onClick={() => deleteImport(b)}>
                    {busyId === b.id ? 'Deleting…' : 'Delete'}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
