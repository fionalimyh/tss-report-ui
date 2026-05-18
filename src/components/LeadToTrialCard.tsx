'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConversionChart } from '@/components/ConversionChart'
import { ConversionTable } from '@/components/ConversionTable'
import { InfoTooltip } from '@/components/InfoTooltip'
import { calcPeriodChange, formatMonthLabel, toISOMonth } from '@/lib/utils'
import type {
  CardFilters,
  GlobalFilters,
  MonthlyRow,
  PeriodSummary,
  SelectOption,
} from '@/types'

function buildMonthOptions(): SelectOption[] {
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (23 - index))
    const isoMonth = toISOMonth(date)

    return {
      value: isoMonth,
      label: formatMonthLabel(isoMonth),
    }
  })
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
        up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
      }`}
    >
      {up ? '↑' : '↓'} {Math.abs(delta)}% vs prev period
    </span>
  )
}

type Props = {
  rows: MonthlyRow[]
  summary: PeriodSummary
  prevSummary: PeriodSummary | null
  filters: GlobalFilters
  cardFilters: CardFilters
  coachOptions: SelectOption[]
  onCardFiltersApply: (filters: CardFilters) => void
  loading: boolean
  error: string | null
}

export function LeadToTrialCard({
  rows,
  summary,
  prevSummary,
  filters,
  cardFilters,
  coachOptions,
  onCardFiltersApply,
  loading,
  error,
}: Props) {
  const [draft, setDraft] = useState<CardFilters>(cardFilters)
  const monthOptions = buildMonthOptions()
  const startLabel = formatMonthLabel(toISOMonth(filters.startDate))
  const endLabel = formatMonthLabel(toISOMonth(new Date(filters.endDate.getTime() - 86400000)))

  useEffect(() => {
    setDraft(cardFilters)
  }, [cardFilters])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center text-xs font-medium text-slate-500">
            Lead → Trial Arranged Conversion
            <InfoTooltip>
              <p className="mb-1.5 font-semibold text-white">Lead → Trial Arranged Conversion</p>
              <code className="mb-2 block rounded bg-slate-700 px-2 py-1 text-[10px] text-sky-300">
                Trial Arranged Learners ÷ Qualified Learners
              </code>
              <p>
                <span className="font-semibold text-slate-400">Qualified:</span>{' '}
                learners.is_qualified_learner = true
              </p>
              <p>
                <span className="font-semibold text-slate-400">Trial Arr.:</span>{' '}
                learners.trial_status = &quot;Trial Arranged&quot;
              </p>
              <p>
                <span className="font-semibold text-slate-400">Coach:</span> filters
                trials.coach_id (numerator only)
              </p>
              <p>
                <span className="font-semibold text-slate-400">Trial date:</span> filters
                trials.trial_date (numerator only)
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
              <span className="text-4xl font-bold text-emerald-500">{summary.rate}%</span>
              <span className="text-sm text-slate-400">
                {summary.numerator} trial arranged / {summary.denominator} qualified learners
              </span>
            </div>
          )}
        </div>

        <ChangeBadge summary={summary} prev={prevSummary} />
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-3">
        <div className="flex items-center gap-1.5 self-end pb-0.5">
          <svg
            className="h-2.5 w-2.5 text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Card Filters
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Coach
          </span>
          <Select
            value={draft.coachId ?? 'all'}
            onValueChange={(value) => {
              if (!value) return
              setDraft((current) => ({ ...current, coachId: value === 'all' ? null : value }))
            }}
          >
            <SelectTrigger className="h-8 min-w-[130px] border-emerald-200 bg-white text-xs text-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {coachOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Trial From
          </span>
          <Select
            value={draft.trialStartDate ? toISOMonth(draft.trialStartDate) : 'any'}
            onValueChange={(value) => {
              if (!value) return
              if (value === 'any') {
                setDraft((current) => ({ ...current, trialStartDate: null }))
                return
              }
              const [year, month] = value.split('-').map(Number)
              setDraft((current) => ({
                ...current,
                trialStartDate: new Date(year, month - 1, 1),
              }))
            }}
          >
            <SelectTrigger className="h-8 min-w-[110px] border-emerald-200 bg-white text-xs text-slate-700">
              <SelectValue placeholder="Any date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any date</SelectItem>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Trial To
          </span>
          <Select
            value={draft.trialEndDate ? toISOMonth(draft.trialEndDate) : 'any'}
            onValueChange={(value) => {
              if (!value) return
              if (value === 'any') {
                setDraft((current) => ({ ...current, trialEndDate: null }))
                return
              }
              const [year, month] = value.split('-').map(Number)
              setDraft((current) => ({
                ...current,
                trialEndDate: new Date(year, month, 0),
              }))
            }}
          >
            <SelectTrigger className="h-8 min-w-[110px] border-emerald-200 bg-white text-xs text-slate-700">
              <SelectValue placeholder="Any date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any date</SelectItem>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => onCardFiltersApply(draft)}
        >
          Apply
        </Button>
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <p className="mb-2 text-[11px] font-medium text-slate-400">Monthly Trend</p>
        {loading ? (
          <div className="h-24 animate-pulse rounded bg-slate-50" />
        ) : (
          <ConversionChart data={rows} color="#10b981" fillColor="#d1fae5" />
        )}
      </div>

      {!loading && !error && (
        <ConversionTable
          rows={rows}
          summary={summary}
          col1Header="Qualified Learners"
          col2Header="Trial Arranged"
          accentColor="#10b981"
          startLabel={startLabel}
          endLabel={endLabel}
        />
      )}
    </div>
  )
}
