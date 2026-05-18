'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMonthLabel } from '@/lib/utils'
import type { MonthlyRow } from '@/types'

type Props = {
  data: MonthlyRow[]
  color: string
  fillColor: string
}

export function ConversionChart({ data, color, fillColor }: Props) {
  const chartData = data.map((row) => ({
    month: formatMonthLabel(row.month),
    rate: row.rate,
  }))
  const gradId = `grad-${color.replace('#', '')}`

  function formatTooltipValue(value: unknown) {
    const displayValue = Array.isArray(value) ? value[0] : value
    return [`${displayValue ?? 0}%`, 'Rate'] as const
  }

  return (
    <ResponsiveContainer width="100%" height={100}>
      <AreaChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fillColor} stopOpacity={0.8} />
            <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(value: number) => `${value}%`}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          domain={[0, 100]}
        />
        <Tooltip formatter={formatTooltipValue} />
        <Area
          type="monotone"
          dataKey="rate"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={{ fill: '#fff', stroke: color, strokeWidth: 2, r: 4 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
