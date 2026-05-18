// Active filter state sent to Supabase
export type GlobalFilters = {
  country: string
  state: string     // 'all' means no state filter
  startDate: Date   // inclusive start (first day of selected start month)
  endDate: Date     // exclusive end (first day of month after selected end month)
}

// Card-level filters for Lead → TA card (applied on top of GlobalFilters)
export type CardFilters = {
  coachId: string | null      // null = all coaches
  trialStartDate: Date | null // null = no lower bound on trial_date
  trialEndDate: Date | null   // null = no upper bound on trial_date
}

// One row in the monthly breakdown table
export type MonthlyRow = {
  month: string  // 'YYYY-MM' e.g. '2026-01'
  col1: number   // denominator for that month (families or qualified learners)
  col2: number   // numerator for that month (qualified or trial arranged)
  rate: number   // 0–100 integer percentage
}

// Aggregated totals for the full selected date range
export type PeriodSummary = {
  numerator: number
  denominator: number
  rate: number   // 0–100 integer percentage
}

// Period-over-period comparison result
export type PeriodChange = {
  delta: number | null              // null when no prior period data
  direction: 'up' | 'down' | 'flat' | 'none'
}

// Generic dropdown option
export type SelectOption = {
  value: string
  label: string
}
