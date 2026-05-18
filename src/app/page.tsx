'use client'

import { useState } from 'react'
import { GlobalFilterPanel } from '@/components/GlobalFilterPanel'
import { InqToLeadCard } from '@/components/InqToLeadCard'
import { LeadToTrialCard } from '@/components/LeadToTrialCard'
import { useCoaches, useCountries } from '@/hooks/useFilterOptions'
import { useInqToLead } from '@/hooks/useInqToLead'
import { useLeadToTrial } from '@/hooks/useLeadToTrial'
import { buildExportFilename, downloadCsv, rowsToCsv } from '@/lib/csv'
import { supabase } from '@/lib/supabase'
import { toISOMonth } from '@/lib/utils'
import type { CardFilters, GlobalFilters } from '@/types'

function getDefaultFilters(): GlobalFilters {
  const now = new Date()
  const endDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  return {
    country: 'SG',
    state: 'all',
    startDate,
    endDate,
  }
}

const DEFAULT_CARD_FILTERS: CardFilters = {
  coachId: null,
  trialStartDate: null,
  trialEndDate: null,
}

export default function DashboardPage() {
  const [appliedFilters, setAppliedFilters] = useState<GlobalFilters>(() => getDefaultFilters())
  const [cardFilters, setCardFilters] = useState<CardFilters>(DEFAULT_CARD_FILTERS)

  const countryOptions = useCountries()
  const coachOptions = useCoaches()
  const inqToLead = useInqToLead(appliedFilters)
  const leadToTrial = useLeadToTrial(appliedFilters, cardFilters)

  async function handleExport() {
    const { data } = await supabase.rpc('get_families_for_export', {
      p_country: appliedFilters.country,
      p_state: appliedFilters.state,
      p_start_date: appliedFilters.startDate.toISOString(),
      p_end_date: appliedFilters.endDate.toISOString(),
    })

    if (!data || data.length === 0) return

    const filename = buildExportFilename(
      appliedFilters.country,
      appliedFilters.state,
      toISOMonth(appliedFilters.startDate),
      toISOMonth(new Date(appliedFilters.endDate.getTime() - 86400000))
    )

    downloadCsv(rowsToCsv(data), filename)
  }

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between bg-slate-900 px-6 py-3.5">
        <span className="text-base font-bold text-white">TSS Conversion Report</span>
        <span className="text-sm text-slate-400">The Swim Starter</span>
      </nav>

      <GlobalFilterPanel
        filters={appliedFilters}
        countryOptions={countryOptions}
        onApply={setAppliedFilters}
        onExport={handleExport}
      />

      <div className="flex items-center gap-2 bg-slate-200 px-6 py-2">
        <span className="text-xs font-medium text-slate-600">
          Global scope: {appliedFilters.country} /{' '}
          {appliedFilters.state === 'all' ? 'All States' : appliedFilters.state}
        </span>
      </div>

      <main className="grid gap-6 px-6 py-6 xl:grid-cols-2">
        <InqToLeadCard
          rows={inqToLead.rows}
          summary={inqToLead.summary}
          prevSummary={inqToLead.prevSummary}
          filters={appliedFilters}
          loading={inqToLead.loading}
          error={inqToLead.error}
        />

        <LeadToTrialCard
          rows={leadToTrial.rows}
          summary={leadToTrial.summary}
          prevSummary={leadToTrial.prevSummary}
          filters={appliedFilters}
          cardFilters={cardFilters}
          coachOptions={coachOptions}
          onCardFiltersApply={setCardFilters}
          loading={leadToTrial.loading}
          error={leadToTrial.error}
        />
      </main>
    </div>
  )
}
