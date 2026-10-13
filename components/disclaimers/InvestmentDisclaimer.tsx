import { INVESTMENT_DISCLAIMER } from '@/lib/investments/allocation';

/**
 * FR-010 (non-negotiable): a visible disclaimer stating the investment
 * allocation view is educational/informational only, not personalized
 * financial, legal, or tax advice. Must render on every risk tier and every
 * data state (including $0 projected savings) — no exceptions. Text is
 * imported from `lib/investments/allocation.ts` rather than duplicated here
 * so the API response and this component can never drift apart.
 */
export function InvestmentDisclaimer() {
  return (
    <p
      role="note"
      className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-600"
    >
      {INVESTMENT_DISCLAIMER}
    </p>
  );
}
