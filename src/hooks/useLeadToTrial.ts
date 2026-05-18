'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calcRate, getPrevPeriodDates } from '@/lib/utils'
import type { GlobalFilters, CardFilters, MonthlyRow, PeriodSummary } from '@/types'

type RpcRow = { month: string; qualified_learners: number; trial_arranged_count: number }

function toMonthlyRows(rows: RpcRow[]): MonthlyRow[] {
  return rows.map(r => ({
    month: r.month,
    col1:  r.qualified_learners,
    col2:  r.trial_arranged_count,
    rate:  calcRate(r.trial_arranged_count, r.qualified_learners),
  }))
}

function toSummary(rows: RpcRow[]): PeriodSummary {
  const denominator = rows.reduce((s, r) => s + r.qualified_learners, 0)
  const numerator   = rows.reduce((s, r) => s + r.trial_arranged_count, 0)
  return { numerator, denominator, rate: calcRate(numerator, denominator) }
}

export type LeadToTrialData = {
  rows: MonthlyRow[]
  summary: PeriodSummary
  prevSummary: PeriodSummary | null
  loading: boolean
  error: string | null
}

export function useLeadToTrial(
  globalFilters: GlobalFilters,
  cardFilters: CardFilters
): LeadToTrialData {
  const [state, setState] = useState<LeadToTrialData>({
    rows: [], summary: { numerator: 0, denominator: 0, rate: 0 },
    prevSummary: null, loading: true, error: null,
  })

  useEffect(() => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { prevStart, prevEnd } = getPrevPeriodDates(
      globalFilters.startDate,
      globalFilters.endDate
    )
    const cardParams = {
      p_country:     globalFilters.country,
      p_state:       globalFilters.state,
      p_coach_id:    cardFilters.coachId ? Number(cardFilters.coachId) : null,
      p_trial_start: cardFilters.trialStartDate?.toISOString().split('T')[0] ?? null,
      p_trial_end:   cardFilters.trialEndDate?.toISOString().split('T')[0] ?? null,
    }
    Promise.all([
      supabase.rpc('get_lead_to_trial_monthly', {
        ...cardParams,
        p_start_date: globalFilters.startDate.toISOString(),
        p_end_date:   globalFilters.endDate.toISOString(),
      }),
      supabase.rpc('get_lead_to_trial_monthly', {
        ...cardParams,
        p_start_date: prevStart.toISOString(),
        p_end_date:   prevEnd.toISOString(),
      }),
    ]).then(([curr, prev]) => {
      if (curr.error) {
        setState(s => ({ ...s, loading: false, error: curr.error!.message }))
        return
      }
      setState({
        rows:        toMonthlyRows(curr.data ?? []),
        summary:     toSummary(curr.data ?? []),
        prevSummary: prev.data ? toSummary(prev.data) : null,
        loading: false,
        error:   null,
      })
    })
  }, [
    globalFilters.country, globalFilters.state,
    globalFilters.startDate, globalFilters.endDate,
    cardFilters.coachId, cardFilters.trialStartDate, cardFilters.trialEndDate,
  ])

  return state
}
