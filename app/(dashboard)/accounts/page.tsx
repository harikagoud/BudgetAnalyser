import { UploadForm } from '@/components/dashboard/UploadForm';
import { ConnectAccountButton } from '@/components/dashboard/ConnectAccountButton';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { prisma } from '@/lib/db/client';
import { isPlaidEnabled, syncAccountTransactions } from '@/lib/plaid/client';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  // Server-side check so a disabled flag never reaches the client bundle
  // (US5 scenario 3: button must be entirely absent, not just hidden, when
  // ENABLE_PLAID=false).
  const plaidEnabled = isPlaidEnabled();

  if (plaidEnabled) {
    // No dedicated re-sync API route/button exists (plan.md's file tree
    // intentionally omits one, Constitution Principle IV). Acceptance
    // Scenario 2 ("new sandbox transactions pulled in on repeated syncs")
    // is instead satisfied here: every visit to this already-dynamic page
    // re-syncs each linked Plaid account before rendering. A sync failure
    // is logged by syncAccountTransactions and never thrown — the page
    // still renders with whatever was last persisted (sync-failure Edge
    // Case: keep showing last-known-good data, don't blank the page).
    const plaidAccounts = await prisma.account.findMany({
      where: { type: 'PLAID' },
      select: { id: true },
    });
    await Promise.all(plaidAccounts.map((a) => syncAccountTransactions(a.id)));
  }

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      type: true,
      institutionName: true,
      _count: { select: { transactions: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Accounts"
        description="Upload a CSV or OFX statement to import transactions. Nothing is sent anywhere outside this app — everything runs on your local machine."
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex-1">
          <UploadForm />
        </div>
        {plaidEnabled && (
          <Card className="p-5 lg:w-72">
            <p className="mb-3 text-sm text-slate-500">
              Or link an account directly through Plaid (sandbox).
            </p>
            <ConnectAccountButton />
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-slate-500">Existing accounts</h2>
        {accounts.length === 0 ? (
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
                      {a._count.transactions} transaction{a._count.transactions === 1 ? '' : 's'}
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
