'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { apiFetch } from '@/lib/api-base';
import { formatMonth, type BudgetReportResponse } from '@/lib/budget/types';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/trends', label: 'Trends' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/recommendations', label: 'Recommendations' },
  { href: '/investments', label: 'Investments' },
];

/** Bell with the number of limits that are over/near in the latest month. Refreshes on navigation. */
function BudgetBell({ pathname }: { pathname: string }) {
  const [report, setReport] = useState<BudgetReportResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/budgets')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setReport(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const count = report?.alerts.length ?? 0;
  if (!report || report.limits.length === 0) return null;
  const anyOver = report.alerts.some((a) => a.level === 'over');
  const label =
    count === 0
      ? 'All budgets on track'
      : `${count} budget alert${count === 1 ? '' : 's'} for ${report.month ? formatMonth(report.month) : 'this month'}`;
  return (
    <Link
      href="/budgets"
      aria-label={label}
      title={label}
      className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span
          className={clsx(
            'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white',
            anyOver ? 'bg-red-500' : 'bg-amber-500',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/** Avatar button with the email, Settings and Sign out. Closes on outside click, Escape and navigation. */
function AccountMenu({ email, pathname, onSignOut }: { email: string; pathname: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initial = email.trim().charAt(0).toUpperCase() || '?';
  const itemClass =
    'block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:outline-none';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${email}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
        >
          {initial}
        </span>
        <span className="hidden max-w-[9rem] truncate md:inline">{email}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <p className="truncate px-3 py-2 text-xs text-slate-500" title={email}>
            Signed in as <span className="font-medium text-slate-700">{email}</span>
          </p>
          <div className="my-1 h-px bg-slate-100" role="separator" />
          <Link href="/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function NavBar({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20V10" />
              <path d="M10 20V4" />
              <path d="M16 20v-7" />
              <path d="M22 20H2" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-tight text-slate-900">
            Budget Analyser
          </span>
        </Link>
        <nav aria-label="Primary" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <BudgetBell pathname={pathname} />
          <AccountMenu email={email} pathname={pathname} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
