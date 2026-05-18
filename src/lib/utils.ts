import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PeriodSummary, PeriodChange } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calcRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100)
}

export function formatMonthLabel(isoMonth: string): string {
  const [year, month] = isoMonth.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[month - 1]} ${year}`
}

export function toISOMonth(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function getPrevPeriodDates(
  startDate: Date,
  endDate: Date
): { prevStart: Date; prevEnd: Date } {
  // Use calendar-month arithmetic to avoid DST skew
  const monthDiff =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth())
  const prevEnd = new Date(startDate)
  const prevStart = new Date(startDate)
  prevStart.setMonth(prevStart.getMonth() - monthDiff)
  return { prevStart, prevEnd }
}

export function calcPeriodChange(
  current: PeriodSummary,
  prev: PeriodSummary
): PeriodChange {
  if (prev.denominator === 0) return { delta: null, direction: 'none' }
  const delta = current.rate - prev.rate
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { delta, direction }
}
