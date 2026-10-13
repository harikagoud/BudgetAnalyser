'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

export interface TrendLineChartDatum {
  month: string;
  total: number;
}

const SERIES = '#2a78d6';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const INK = '#52514e';

export function TrendLineChart({ data }: { data: TrendLineChartDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="month"
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
            contentStyle={{ borderRadius: 12, border: '1px solid #e1e0d9', fontSize: 13 }}
            formatter={(value) => formatCurrency(Number(value))}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke={SERIES}
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#fcfcfb', stroke: SERIES, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: SERIES, stroke: '#fcfcfb', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
