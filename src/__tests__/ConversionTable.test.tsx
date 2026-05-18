import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ConversionTable } from '@/components/ConversionTable'
import type { MonthlyRow, PeriodSummary } from '@/types'

const rows: MonthlyRow[] = [
  { month: '2026-01', col1: 42, col2: 22, rate: 52 },
  { month: '2026-02', col1: 38, col2: 23, rate: 61 },
]

const summary: PeriodSummary = { numerator: 120, denominator: 176, rate: 68 }

it('renders a row per month', () => {
  render(
    <ConversionTable
      rows={rows}
      summary={summary}
      col1Header="Families"
      col2Header="Qualified"
      accentColor="#3b82f6"
      startLabel="Jan 2026"
      endLabel="Feb 2026"
    />
  )

  expect(screen.getByText('Jan 2026')).toBeInTheDocument()
  expect(screen.getByText('Feb 2026')).toBeInTheDocument()
  expect(screen.getByText('52%')).toBeInTheDocument()
  expect(screen.getByText('61%')).toBeInTheDocument()
})

it('renders total row with aggregated values', () => {
  render(
    <ConversionTable
      rows={rows}
      summary={summary}
      col1Header="Families"
      col2Header="Qualified"
      accentColor="#3b82f6"
      startLabel="Jan 2026"
      endLabel="Feb 2026"
    />
  )

  expect(screen.getByText('68%')).toBeInTheDocument()
  expect(screen.getByText('176')).toBeInTheDocument()
  expect(screen.getByText('120')).toBeInTheDocument()
})
