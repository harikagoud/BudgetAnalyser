'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { AllocationDonut } from '@/components/charts/AllocationDonut';
import { InvestmentDisclaimer } from '@/components/disclaimers/InvestmentDisclaimer';
import type { RiskTolerance } from '@/lib/investments/allocation';
import { apiFetch } from '@/lib/api-base';

interface Bucket {
  name: string;
  percent: number;
  amount: number;
}

interface InvestmentsResponse {
  projectedAnnualSavings: number;
  riskTolerance: RiskTolerance;
  buckets: Bucket[];
  disclaimer: string;
}

const RISK_LABELS: Record<RiskTolerance, string> = {
  conservative: 'Conservative',
  moderate: 'Moderate',
  aggressive: 'Aggressive',
};

export default function InvestmentsPage() {
  const [data, setData] = useState<InvestmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial load: no ?riskTolerance= param, so the server resolves and
  // echoes back the persisted UserSetting (defaulting to "moderate").
  useEffect(() => {
    apiFetch('/api/investments')
      .then((res) => res.json())
      .then((payload: InvestmentsResponse) => {
        setData(payload);
        setLoading(false);
      });
  }, []);

  async function handleChange(next: RiskTolerance) {
    const res = await apiFetch(`/api/investments?riskTolerance=${next}`);
    const payload: InvestmentsResponse = await res.json();
    setData(payload);
    // Persist for next visit; fire-and-forget — the UI already reflects the
    // new tier regardless of whether the write lands.
    apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'riskTolerance', value: next }),
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Investments"
        description="An educational breakdown of your projected annual savings across general investment buckets."
        action={
          <div className="flex items-center gap-3">
            <label htmlFor="risk-select" className="text-sm font-medium text-slate-700">
              Risk tolerance
            </label>
            <Select
              id="risk-select"
              value={data?.riskTolerance ?? ''}
              disabled={loading}
              onChange={(e) => handleChange(e.target.value as RiskTolerance)}
            >
              {(Object.keys(RISK_LABELS) as RiskTolerance[]).map((tier) => (
                <option key={tier} value={tier}>
                  {RISK_LABELS[tier]}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-5">
          {loading || !data ? (
            <div role="status" aria-label="Loading" className="flex items-center gap-6">
              <Skeleton className="h-56 w-56 rounded-full" />
              <Skeleton className="h-24 w-64" />
            </div>
          ) : (
            <AllocationDonut buckets={data.buckets} total={data.projectedAnnualSavings} />
          )}
        </CardContent>
      </Card>

      {/* FR-010: must render on every risk tier and every data state,
          including the loading/$0 state — no exceptions. */}
      <InvestmentDisclaimer />
    </div>
  );
}
