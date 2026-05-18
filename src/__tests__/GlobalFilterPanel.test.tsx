import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { GlobalFilterPanel } from '@/components/GlobalFilterPanel'
import type { GlobalFilters, SelectOption } from '@/types'

vi.mock('@/hooks/useFilterOptions', () => ({
  useStates: () => [{ value: 'all', label: 'All States' }],
}))

const countryOptions: SelectOption[] = [{ value: 'SG', label: 'SG' }]
const filters: GlobalFilters = {
  country: 'SG',
  state: 'all',
  startDate: new Date(2026, 0, 1),
  endDate: new Date(2026, 6, 1),
}

it('renders the panel label and both action buttons', () => {
  render(
    <GlobalFilterPanel
      filters={filters}
      countryOptions={countryOptions}
      onApply={vi.fn()}
      onExport={vi.fn()}
    />
  )

  expect(screen.getByText(/global filters/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
})

it('calls onExport when Export CSV is clicked', async () => {
  const onExport = vi.fn()

  render(
    <GlobalFilterPanel
      filters={filters}
      countryOptions={countryOptions}
      onApply={vi.fn()}
      onExport={onExport}
    />
  )

  await userEvent.click(screen.getByRole('button', { name: /export csv/i }))
  expect(onExport).toHaveBeenCalledOnce()
})
