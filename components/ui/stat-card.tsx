import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

/** Label + big figure + optional footnote; used for KPI strips. */
export function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </Card>
  );
}
