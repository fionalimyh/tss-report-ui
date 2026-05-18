'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calcRate, getPrevPeriodDates } from '@/lib/utils'
import type { GlobalFilters, MonthlyRow, PeriodSummary } from '@/types'

type RpcRow = { month: string; total_families: number; qualified_count: number }

function toMonthlyRows(rows: RpcRow[]): MonthlyRow[] {
  return rows.map(r => ({
    month: r.month,
    col1: r.total_families,
    col2: r.qualified_count,
    rate: calcRate(r.qualified_count, r.total_families),
  }))
}

function toSummary(rows: RpcRow[]): PeriodSummary {
  const denominator = rows.reduce((s, r) => s + r.total_families, 0)
  const numerator   = rows.reduce((s, r) => s + r.qualified_count, 0)
  return { numerator, denominator, rate: calcRate(numerator, denominator) }
}

export type InqToLeadData = {
  rows: MonthlyRow[]
  summary: PeriodSummary
  prevSummary: PeriodSummary | null
  loading: boolean
  error: string | null
}

export function useInqToLead(filters: GlobalFilters): InqToLeadData {
  const [state, setState] = useState<InqToLeadData>({
    rows: [], summary: { numerator: 0, denominator: 0, rate: 0 },
    prevSummary: null, loading: true, error: null,
  })

  useEffect(() => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { prevStart, prevEnd } = getPrevPeriodDates(filters.startDate, filters.endDate)
    const base = {
      p_country: filters.country,
      p_state:   filters.state,
    }
    Promise.all([
      supabase.rpc('get_inq_to_lead_monthly', {
        ...base,
        p_start_date: filters.startDate.toISOString(),
        p_end_date:   filters.endDate.toISOString(),
      }),
      supabase.rpc('get_inq_to_lead_monthly', {
        ...base,
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
  }, [filters.country, filters.state, filters.startDate, filters.endDate])

  return state
}
