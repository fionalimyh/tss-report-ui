import { describe, it, expect } from 'vitest'
import {
  calcRate,
  formatMonthLabel,
  toISOMonth,
  getPrevPeriodDates,
  calcPeriodChange,
} from '@/lib/utils'
import type { PeriodSummary } from '@/types'

describe('calcRate', () => {
  it('returns percentage rounded to integer', () => {
    expect(calcRate(120, 176)).toBe(68)
  })
  it('returns 0 when denominator is 0', () => {
    expect(calcRate(0, 0)).toBe(0)
  })
  it('rounds down', () => {
    expect(calcRate(1, 3)).toBe(33)
  })
})

describe('formatMonthLabel', () => {
  it('converts YYYY-MM to short month + year', () => {
    expect(formatMonthLabel('2026-01')).toBe('Jan 2026')
  })
  it('handles December', () => {
    expect(formatMonthLabel('2025-12')).toBe('Dec 2025')
  })
})

describe('toISOMonth', () => {
  it('formats a Date as YYYY-MM', () => {
    expect(toISOMonth(new Date(2026, 0, 15))).toBe('2026-01')
  })
  it('zero-pads single-digit months', () => {
    expect(toISOMonth(new Date(2026, 8, 1))).toBe('2026-09')
  })
})

describe('getPrevPeriodDates', () => {
  it('returns a period of the same length immediately before start', () => {
    const start = new Date(2026, 0, 1)   // Jan 1 2026
    const end   = new Date(2026, 6, 1)   // Jul 1 2026 (exclusive)
    const { prevStart, prevEnd } = getPrevPeriodDates(start, end)
    expect(prevStart).toEqual(new Date(2025, 6, 1))  // Jul 1 2025
    expect(prevEnd).toEqual(new Date(2026, 0, 1))    // Jan 1 2026
  })
})

describe('calcPeriodChange', () => {
  it('returns positive delta and direction=up when rate improved', () => {
    const curr: PeriodSummary = { numerator: 120, denominator: 176, rate: 68 }
    const prev: PeriodSummary = { numerator: 100, denominator: 160, rate: 63 }
    const result = calcPeriodChange(curr, prev)
    expect(result.delta).toBe(5)
    expect(result.direction).toBe('up')
  })
  it('returns negative delta and direction=down when rate dropped', () => {
    const curr: PeriodSummary = { numerator: 50, denominator: 100, rate: 50 }
    const prev: PeriodSummary = { numerator: 60, denominator: 100, rate: 60 }
    const result = calcPeriodChange(curr, prev)
    expect(result.delta).toBe(-10)
    expect(result.direction).toBe('down')
  })
  it('returns direction=none when prev has no data', () => {
    const curr: PeriodSummary = { numerator: 50, denominator: 100, rate: 50 }
    const prev: PeriodSummary = { numerator: 0, denominator: 0, rate: 0 }
    expect(calcPeriodChange(curr, prev).direction).toBe('none')
  })
})
