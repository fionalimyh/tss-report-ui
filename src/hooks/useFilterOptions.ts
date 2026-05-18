'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SelectOption } from '@/types'

export function useCountries(): SelectOption[] {
  const [options, setOptions] = useState<SelectOption[]>([])
  useEffect(() => {
    supabase.rpc('get_report_countries').then(({ data }) => {
      if (data) setOptions(data.map((r: { country: string }) => ({ value: r.country, label: r.country })))
    })
  }, [])
  return options
}

export function useStates(country: string): SelectOption[] {
  const [options, setOptions] = useState<SelectOption[]>([{ value: 'all', label: 'All States' }])
  useEffect(() => {
    if (!country) return
    supabase.rpc('get_report_states', { p_country: country }).then(({ data }) => {
      if (data) {
        setOptions([
          { value: 'all', label: 'All States' },
          ...data.map((r: { state: string }) => ({ value: r.state, label: r.state })),
        ])
      }
    })
  }, [country])
  return options
}

export function useCoaches(): SelectOption[] {
  const [options, setOptions] = useState<SelectOption[]>([{ value: 'all', label: 'All Coaches' }])
  useEffect(() => {
    supabase.rpc('get_report_coaches').then(({ data }) => {
      if (data) {
        setOptions([
          { value: 'all', label: 'All Coaches' },
          ...data.map((r: { coach_id: number; coach_name: string }) => ({
            value: String(r.coach_id),
            label: r.coach_name,  // use coach_name since it's now available
          })),
        ])
      }
    })
  }, [])
  return options
}
