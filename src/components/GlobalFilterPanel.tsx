'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStates } from '@/hooks/useFilterOptions'
import { buildRecentMonthOptions, formatMonthLabel, toISOMonth } from '@/lib/utils'
import type { GlobalFilters, SelectOption } from '@/types'

type Props = {
  filters: GlobalFilters
  countryOptions: SelectOption[]
  monthAnchorIso: string
  onApply: (filters: GlobalFilters) => void
  onExport: () => void
}

export function GlobalFilterPanel({
  filters,
  countryOptions,
  monthAnchorIso,
  onApply,
  onExport,
}: Props) {
  const [draft, setDraft] = useState<GlobalFilters>(filters)
  const stateOptions = useStates(draft.country)
  const monthOptions = buildRecentMonthOptions(new Date(monthAnchorIso))

  function handleCountryChange(value: string | null) {
    if (!value) return
    setDraft((current) => ({ ...current, country: value, state: 'all' }))
  }

  const activeChips = [
    { key: 'country', label: draft.country },
    { key: 'state', label: draft.state === 'all' ? 'All States' : draft.state },
    {
      key: 'date-range',
      label: `${formatMonthLabel(toISOMonth(draft.startDate))}-${formatMonthLabel(
        toISOMonth(new Date(draft.endDate.getTime() - 86400000))
      )}`,
    },
  ]

  return (
    <div className="bg-slate-700 px-6 py-4">
      <div className="mb-3 flex items-center gap-2">
        <svg
          className="h-3.5 w-3.5 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Global Filters
        </span>
        <span className="ml-1 text-[10px] text-slate-500">- applies to both cards below</span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Country
          </span>
          <Select value={draft.country} onValueChange={handleCountryChange}>
            <SelectTrigger className="min-w-[100px] border-slate-600 bg-slate-900 text-slate-200 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {countryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            State
          </span>
          <Select
            value={draft.state}
            onValueChange={(value) => {
              if (!value) return
              setDraft((current) => ({ ...current, state: value }))
            }}
          >
            <SelectTrigger className="min-w-[110px] border-slate-600 bg-slate-900 text-slate-200 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stateOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            From
          </span>
          <Select
            value={toISOMonth(draft.startDate)}
            onValueChange={(value) => {
              if (!value) return
              const [year, month] = value.split('-').map(Number)
              setDraft((current) => ({ ...current, startDate: new Date(year, month - 1, 1) }))
            }}
          >
            <SelectTrigger className="min-w-[110px] border-slate-600 bg-slate-900 text-slate-200 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            To
          </span>
          <Select
            value={toISOMonth(new Date(draft.endDate.getTime() - 86400000))}
            onValueChange={(value) => {
              if (!value) return
              const [year, month] = value.split('-').map(Number)
              setDraft((current) => ({ ...current, endDate: new Date(year, month, 1) }))
            }}
          >
            <SelectTrigger className="min-w-[110px] border-slate-600 bg-slate-900 text-slate-200 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-8 bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => onApply(draft)}
          >
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            className="h-8 border-slate-500 bg-transparent text-slate-400 hover:text-slate-200"
          >
            <svg
              className="mr-1.5 h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="rounded-full bg-slate-900 px-2 py-1 text-[10px] text-slate-500"
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
