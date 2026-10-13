'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/trends', label: 'Trends' },
  { href: '/recommendations', label: 'Recommendations' },
  { href: '/investments', label: 'Investments' },
];

export function NavBar() {
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
      </div>
    </header>
  );
}
