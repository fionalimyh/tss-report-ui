'use client'

import { ConversionChart } from '@/components/ConversionChart'
import { ConversionTable } from '@/components/ConversionTable'
import { InfoTooltip } from '@/components/InfoTooltip'
import { calcPeriodChange, formatMonthLabel, toISOMonth } from '@/lib/utils'
import type { GlobalFilters, MonthlyRow, PeriodSummary } from '@/types'

type Props = {
  rows: MonthlyRow[]
  summary: PeriodSummary
  prevSummary: PeriodSummary | null
  filters: GlobalFilters
  loading: boolean
  error: string | null
}

function ChangeBadge({
  summary,
  prev,
}: {
  summary: PeriodSummary
  prev: PeriodSummary | null
}) {
  if (!prev) return null

  const { delta, direction } = calcPeriodChange(summary, prev)
  if (direction === 'none' || direction === 'flat' || delta === null) return null

  const up = direction === 'up'

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
        up ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'
      }`}
    >
      {up ? '↑' : '↓'} {Math.abs(delta)}% vs prev period
    </span>
  )
}

export function InqToLeadCard({ rows, summary, prevSummary, filters, loading, error }: Props) {
  const startLabel = formatMonthLabel(toISOMonth(filters.startDate))
  const endLabel = formatMonthLabel(toISOMonth(new Date(filters.endDate.getTime() - 86400000)))

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center text-xs font-medium text-slate-500">
            Inquiry → Lead Conversion
            <InfoTooltip>
              <p className="mb-1.5 font-semibold text-white">Inquiry → Lead Conversion</p>
              <code className="mb-2 block rounded bg-slate-700 px-2 py-1 text-[10px] text-sky-300">
                Qualified Families ÷ Total Families
              </code>
              <p>
                <span className="font-semibold text-slate-400">Families:</span>{' '}
                COUNT(DISTINCT family_id) by family_date
              </p>
              <p>
                <span className="font-semibold text-slate-400">Qualified:</span>{' '}
                families.enquiry_status = &quot;Qualified&quot;
              </p>
              <p>
                <span className="font-semibold text-slate-400">Total row:</span> Aggregated across
                full date range
              </p>
              <p className="mt-1.5 text-[10px] text-slate-500">Grouped by family_date month</p>
            </InfoTooltip>
          </div>

          {loading ? (
            <div className="h-9 w-40 animate-pulse rounded bg-slate-100" />
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-bold text-blue-500">{summary.rate}%</span>
              <span className="text-sm text-slate-400">
                {summary.numerator} qualified / {summary.denominator} families
              </span>
            </div>
          )}
        </div>

        <ChangeBadge summary={summary} prev={prevSummary} />
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <p className="mb-2 text-[11px] font-medium text-slate-400">Monthly Trend</p>
        {loading ? (
          <div className="h-24 animate-pulse rounded bg-slate-50" />
        ) : (
          <ConversionChart data={rows} color="#3b82f6" fillColor="#dbeafe" />
        )}
      </div>

      {!loading && !error && (
        <ConversionTable
          rows={rows}
          summary={summary}
          col1Header="Families"
          col2Header="Qualified"
          accentColor="#3b82f6"
          startLabel={startLabel}
          endLabel={endLabel}
        />
      )}
    </div>
  )
}
