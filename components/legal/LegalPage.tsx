import type { ReactNode } from 'react';

export const LEGAL_UPDATED = 'October 15, 2026';

/** Shown on the legal pages. Set NEXT_PUBLIC_CONTACT_EMAIL (build time) to a real mailbox. */
export function contactLine(): ReactNode {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return email ? (
    <a className="text-brand-700 underline" href={`mailto:${email}`}>
      {email}
    </a>
  ) : (
    'the operator of this site'
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4 text-sm leading-6 text-slate-700 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="text-xs text-slate-500">Last updated {LEGAL_UPDATED}</p>
      {children}
    </article>
  );
}
