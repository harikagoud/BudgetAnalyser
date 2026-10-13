import Link from 'next/link';
import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

/** Friendly zero-data card with an optional call to action. */
export function EmptyState({
  title,
  children,
  href,
  cta,
}: {
  title: string;
  children?: ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <div
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="m7 15 4-4 3 3 5-6" />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {children && <p className="max-w-md text-sm text-slate-500">{children}</p>}
      {href && cta && (
        <Link
          href={href}
          className="mt-1 inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-600"
        >
          {cta}
        </Link>
      )}
    </Card>
  );
}
