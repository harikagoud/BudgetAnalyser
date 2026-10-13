'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

export interface CategoryBarChartDatum {
  name: string;
  total: number;
}

// Chart chrome from the validated palette reference: gridline #e1e0d9,
// axis #c3c2b7, secondary ink #52514e; single series -> categorical slot 1.
const SERIES = '#2a78d6';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const INK = '#52514e';

export function CategoryBarChart({ data }: { data: CategoryBarChartDatum[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="name"
            angle={-35}
            textAnchor="end"
            interval={0}
            height={70}
            tickLine={false}
            axisLine={{ stroke: AXIS }}
            tick={{ fontSize: 12, fill: INK }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: INK }}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            cursor={{ fill: 'rgba(42,120,214,0.06)' }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e1e0d9', fontSize: 13 }}
            formatter={(value) => formatCurrency(Number(value))}
          />
          <Bar dataKey="total" fill={SERIES} radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
