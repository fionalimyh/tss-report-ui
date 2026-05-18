# TSS Conversion Report — Session Handover

## What This Is

A Next.js dashboard showing **Inquiry→Lead** and **Lead→Trial Arranged** conversion rates for The Swim Starter, reading live data from Supabase. Built with shadcn/ui, Recharts, Supabase JS v2, Vitest.

**Working directory:** `/home/fionalyh/TSS/tss-report-ui`
**Full implementation plan:** `docs/superpowers/plans/2026-05-18-tss-conversion-report.md`

---

## Progress: Tasks 1–6 Complete ✅ — Tasks 7–12 Remaining 🔲

| Task | Status | What |
|---|---|---|
| 1 | ✅ | Next.js 16 scaffold, shadcn/ui, Vitest, Tailwind v4, `.env.local` |
| 2 | ✅ | `src/types/index.ts` — all shared TypeScript types |
| 3 | ✅ | `src/lib/utils.ts` — calcRate, formatMonthLabel, toISOMonth, getPrevPeriodDates, calcPeriodChange |
| 4 | ✅ | `src/lib/csv.ts` — rowsToCsv, buildExportFilename, downloadCsv |
| 5 | ✅ | `src/lib/supabase.ts`, SQL migration, 6 RPC functions deployed to Supabase |
| 6 | ✅ | `src/hooks/useFilterOptions.ts`, `useInqToLead.ts`, `useLeadToTrial.ts` |
| 7 | 🔲 | InfoTooltip, ConversionChart, ConversionTable (TDD) |
| 8 | 🔲 | GlobalFilterPanel (TDD) |
| 9 | 🔲 | InqToLeadCard |
| 10 | 🔲 | LeadToTrialCard |
| 11 | 🔲 | Root page + layout (wires everything) |
| 12 | 🔲 | End-to-end manual verification |

**Test baseline:** 15 tests pass (11 utils + 4 csv). All tasks must keep these passing.

---

## How to Continue in the Next Session

Use the **superpowers:subagent-driven-development** skill. Dispatch subagents for Tasks 7–12 in order. The full task code is embedded in this document below.

### Quick validation command (run after each task)
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v20.20.2 && npm test && npx tsc --noEmit
```

---

## Critical Notes — Read Before Starting

### 1. Node version: ALWAYS use v20
System default is Node 18. Vitest 4 requires Node 20. Every npm/npx call needs:
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v20.20.2
```

### 2. Tailwind v4 — DO NOT replace globals.css
The scaffold uses Tailwind v4. The plan's Task 11 Step 1 says to replace `globals.css` with v3 directives (`@tailwind base; @tailwind components; @tailwind utilities;`) — **this is wrong for v4 and will break styles**. Skip that step entirely. Only modify `globals.css` if adding custom CSS; otherwise leave it as-is.

### 3. shadcn uses @base-ui/react — do not remove it
shadcn v4.7.0 uses `@base-ui/react` as UI primitives. It is used by button, select, tooltip, and badge. Do not uninstall it.

### 4. All imports use `@/` alias → `src/`
shadcn components live in `src/components/ui/`.

---

## Supabase

- **Project:** TSS
- **URL:** `https://ratutwrunpjoitzcnseh.supabase.co`
- **Anon key:** in `.env.local` (gitignored, already created)

### Live tables (created + migrated this session)
| Table | Rows | Key columns |
|---|---|---|
| `families` | 1,408 | `family_id`, `family_date`, `country` (ID/MY/SG), `state`, `enquiry_status` ('Qualified'=23), `pipeline_status` |
| `learners` | 1,408 | `learner_id`, `family_id`, `is_qualified_learner` (true=23), `trial_status` |
| `trials` | 0 | `trial_id`, `learner_id`, `family_id`, `trial_date`, `coach_id`, `trial_status` |
| `coaches` | 0 | `coach_id`, `coach_name` |

### Deployed RPC functions (all SECURITY DEFINER)
- `get_report_countries()` → `{country}[]`
- `get_report_states(p_country)` → `{state}[]`
- `get_report_coaches()` → `{coach_id, coach_name}[]`
- `get_inq_to_lead_monthly(p_country, p_state, p_start_date, p_end_date)` → `{month, total_families, qualified_count}[]`
- `get_lead_to_trial_monthly(p_country, p_state, p_start_date, p_end_date, p_coach_id?, p_trial_start?, p_trial_end?)` → `{month, qualified_learners, trial_arranged_count}[]`
- `get_families_for_export(p_country, p_state, p_start_date, p_end_date)` → family rows

---

## File Map

```text
src/
├── types/index.ts              ✅
├── lib/
│   ├── supabase.ts             ✅
│   ├── utils.ts                ✅  (has cn helper from shadcn too)
│   └── csv.ts                  ✅
├── hooks/
│   ├── useFilterOptions.ts     ✅  useCountries, useStates, useCoaches
│   ├── useInqToLead.ts         ✅
│   └── useLeadToTrial.ts       ✅
├── components/
│   ├── ui/                     ✅  button, select, tooltip, badge
│   ├── InfoTooltip.tsx         🔲  Task 7
│   ├── ConversionChart.tsx     🔲  Task 7
│   ├── ConversionTable.tsx     🔲  Task 7
│   ├── GlobalFilterPanel.tsx   🔲  Task 8
│   ├── InqToLeadCard.tsx       🔲  Task 9
│   └── LeadToTrialCard.tsx     🔲  Task 10
├── app/
│   ├── globals.css             ✅  Tailwind v4 — DO NOT replace
│   ├── layout.tsx              🔲  Task 11
│   └── page.tsx                🔲  Task 11
└── __tests__/
    ├── utils.test.ts            ✅  11 tests
    ├── csv.test.ts              ✅  4 tests
    ├── ConversionTable.test.tsx 🔲  Task 7
    └── GlobalFilterPanel.test.tsx 🔲  Task 8
```

---

## Task 7: Shared components — InfoTooltip, ConversionChart, ConversionTable

**Files to create:**
- `src/components/InfoTooltip.tsx`
- `src/components/ConversionChart.tsx`
- `src/components/ConversionTable.tsx`
- `src/__tests__/ConversionTable.test.tsx`

**TDD order:** Write `ConversionTable` test first → run (fail) → create `ConversionTable` → run (pass). `InfoTooltip` and `ConversionChart` have no tests.

### `src/components/InfoTooltip.tsx`

```tsx
'use client'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'

export function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold cursor-pointer ml-1.5 shrink-0">
            ?
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-[270px] text-xs leading-relaxed bg-slate-800 text-slate-200 border-slate-700 p-3"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

### `src/components/ConversionChart.tsx`

```tsx
'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatMonthLabel } from '@/lib/utils'
import type { MonthlyRow } from '@/types'

type Props = { data: MonthlyRow[]; color: string; fillColor: string }

export function ConversionChart({ data, color, fillColor }: Props) {
  const chartData = data.map(r => ({ month: formatMonthLabel(r.month), rate: r.rate }))
  const gradId = `grad-${color.replace('#', '')}`

  return (
    <ResponsiveContainer width="100%" height={100}>
      <AreaChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fillColor} stopOpacity={0.8} />
            <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} domain={[0, 100]} />
        <Tooltip formatter={(v: number) => [`${v}%`, 'Rate']} />
        <Area
          type="monotone"
          dataKey="rate"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={{ fill: '#fff', stroke: color, strokeWidth: 2, r: 4 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

### `src/__tests__/ConversionTable.test.tsx` (write first — TDD)

```tsx
import { render, screen } from '@testing-library/react'
import { it, expect } from 'vitest'
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
```

### `src/components/ConversionTable.tsx`

```tsx
import { formatMonthLabel } from '@/lib/utils'
import type { MonthlyRow, PeriodSummary } from '@/types'

type Props = {
  rows: MonthlyRow[]
  summary: PeriodSummary
  col1Header: string
  col2Header: string
  accentColor: string
  startLabel: string
  endLabel: string
}

export function ConversionTable({
  rows,
  summary,
  col1Header,
  col2Header,
  accentColor,
  startLabel,
  endLabel,
}: Props) {
  const totalBg = `${accentColor}12`

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          {['Month', col1Header, col2Header, 'Rate'].map((h, i) => (
            <th
              key={h}
              className={`px-5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.month} className="border-b border-slate-100">
            <td className="px-5 py-2 text-slate-700">{formatMonthLabel(row.month)}</td>
            <td className="px-5 py-2 text-right text-slate-700">{row.col1}</td>
            <td className="px-5 py-2 text-right text-slate-700">{row.col2}</td>
            <td className="px-5 py-2 text-right font-semibold" style={{ color: accentColor }}>
              {row.rate}%
            </td>
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${accentColor}`, backgroundColor: totalBg }}>
          <td className="px-5 py-2.5 font-bold text-slate-900">
            Total ({startLabel}–{endLabel})
          </td>
          <td className="px-5 py-2.5 text-right font-bold text-slate-900">{summary.denominator}</td>
          <td className="px-5 py-2.5 text-right font-bold text-slate-900">{summary.numerator}</td>
          <td className="px-5 py-2.5 text-right font-bold" style={{ color: accentColor }}>
            {summary.rate}%
          </td>
        </tr>
      </tbody>
    </table>
  )
}
```

**Commit:**
```bash
git add src/components/InfoTooltip.tsx src/components/ConversionChart.tsx src/components/ConversionTable.tsx src/__tests__/ConversionTable.test.tsx
git commit -m "feat: add InfoTooltip, ConversionChart, ConversionTable shared components"
```

---

## Task 8: GlobalFilterPanel

**Files to create:**
- `src/components/GlobalFilterPanel.tsx`
- `src/__tests__/GlobalFilterPanel.test.tsx`

**TDD order:** Write tests first → run (fail) → create component → run (pass).

**Key design note:** `GlobalFilterPanel` calls `useStates(draft.country)` internally. The state dropdown re-fetches whenever the draft country changes. There is no `stateOptions` prop.

### `src/__tests__/GlobalFilterPanel.test.tsx` (write first — TDD)

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi } from 'vitest'
import { GlobalFilterPanel } from '@/components/GlobalFilterPanel'
import type { GlobalFilters, SelectOption } from '@/types'

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
```

### `src/components/GlobalFilterPanel.tsx`

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useStates } from '@/hooks/useFilterOptions'
import { formatMonthLabel, toISOMonth } from '@/lib/utils'
import type { GlobalFilters, SelectOption } from '@/types'

function buildMonthOptions(): SelectOption[] {
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (23 - i))
    const iso = toISOMonth(d)
    return { value: iso, label: formatMonthLabel(iso) }
  })
}

type Props = {
  filters: GlobalFilters
  countryOptions: SelectOption[]
  onApply: (f: GlobalFilters) => void
  onExport: () => void
}

export function GlobalFilterPanel({ filters, countryOptions, onApply, onExport }: Props) {
  const [draft, setDraft] = useState<GlobalFilters>(filters)
  const stateOptions = useStates(draft.country)
  const monthOptions = buildMonthOptions()

  function handleCountryChange(val: string) {
    setDraft(d => ({ ...d, country: val, state: 'all' }))
  }

  const activeChips = [
    draft.country,
    draft.state === 'all' ? 'All States' : draft.state,
    `${formatMonthLabel(toISOMonth(draft.startDate))}–${formatMonthLabel(toISOMonth(new Date(draft.endDate.getTime() - 86400000)))}`,
  ]

  return (
    <div className="bg-slate-700 px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Global Filters</span>
        <span className="text-[10px] text-slate-500 ml-1">- applies to both cards below</span>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Country</span>
          <Select value={draft.country} onValueChange={handleCountryChange}>
            <SelectTrigger className="bg-slate-900 border-slate-600 text-slate-200 min-w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {countryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">State</span>
          <Select value={draft.state} onValueChange={v => setDraft(d => ({ ...d, state: v }))}>
            <SelectTrigger className="bg-slate-900 border-slate-600 text-slate-200 min-w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stateOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">From</span>
          <Select
            value={toISOMonth(draft.startDate)}
            onValueChange={v => {
              const [y, m] = v.split('-').map(Number)
              setDraft(d => ({ ...d, startDate: new Date(y, m - 1, 1) }))
            }}
          >
            <SelectTrigger className="bg-slate-900 border-slate-600 text-slate-200 min-w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">To</span>
          <Select
            value={toISOMonth(new Date(draft.endDate.getTime() - 86400000))}
            onValueChange={v => {
              const [y, m] = v.split('-').map(Number)
              setDraft(d => ({ ...d, endDate: new Date(y, m, 1) }))
            }}
          >
            <SelectTrigger className="bg-slate-900 border-slate-600 text-slate-200 min-w-[110px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8" onClick={() => onApply(draft)}>
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={onExport} className="border-slate-500 text-slate-400 hover:text-slate-200 bg-transparent h-8">
            <svg className="w-3 h-3 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </Button>
        </div>

        <div className="ml-auto flex gap-1.5 flex-wrap items-center">
          {activeChips.map(c => (
            <span key={c} className="text-[10px] text-slate-500 px-2 py-1 bg-slate-900 rounded-full">{c}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add src/components/GlobalFilterPanel.tsx src/__tests__/GlobalFilterPanel.test.tsx
git commit -m "feat: add GlobalFilterPanel with dependent state dropdown and export button"
```

---

## Task 9: InqToLeadCard

**File to create:** `src/components/InqToLeadCard.tsx`

```tsx
'use client'
import { ConversionChart } from '@/components/ConversionChart'
import { ConversionTable } from '@/components/ConversionTable'
import { InfoTooltip } from '@/components/InfoTooltip'
import { calcPeriodChange, formatMonthLabel, toISOMonth } from '@/lib/utils'
import type { MonthlyRow, PeriodSummary, GlobalFilters } from '@/types'

type Props = {
  rows: MonthlyRow[]
  summary: PeriodSummary
  prevSummary: PeriodSummary | null
  filters: GlobalFilters
  loading: boolean
  error: string | null
}

function ChangeBadge({ summary, prev }: { summary: PeriodSummary; prev: PeriodSummary | null }) {
  if (!prev) return null
  const { delta, direction } = calcPeriodChange(summary, prev)
  if (direction === 'none' || direction === 'flat' || delta === null) return null

  const up = direction === 'up'

  return (
    <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full ${up ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
      {up ? '↑' : '↓'} {Math.abs(delta)}% vs prev period
    </span>
  )
}

export function InqToLeadCard({ rows, summary, prevSummary, filters, loading, error }: Props) {
  const startLabel = formatMonthLabel(toISOMonth(filters.startDate))
  const endLabel = formatMonthLabel(toISOMonth(new Date(filters.endDate.getTime() - 86400000)))

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center text-xs font-medium text-slate-500 mb-1">
            Inquiry → Lead Conversion
            <InfoTooltip>
              <p className="font-semibold text-white mb-1.5">Inquiry → Lead Conversion</p>
              <code className="block bg-slate-700 rounded px-2 py-1 mb-2 text-sky-300 text-[10px]">Qualified Families ÷ Total Families</code>
              <p><span className="font-semibold text-slate-400">Families:</span> COUNT(DISTINCT family_id) by family_date</p>
              <p><span className="font-semibold text-slate-400">Qualified:</span> families.enquiry_status = &quot;Qualified&quot;</p>
              <p><span className="font-semibold text-slate-400">Total row:</span> Aggregated across full date range</p>
              <p className="mt-1.5 text-slate-500 text-[10px]">Grouped by family_date month</p>
            </InfoTooltip>
          </div>
          {loading ? (
            <div className="h-9 w-40 bg-slate-100 animate-pulse rounded" />
          ) : error ? (
            <p className="text-red-500 text-sm">{error}</p>
          ) : (
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-bold text-blue-500">{summary.rate}%</span>
              <span className="text-sm text-slate-400">{summary.numerator} qualified / {summary.denominator} families</span>
            </div>
          )}
        </div>
        <ChangeBadge summary={summary} prev={prevSummary} />
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-[11px] font-medium text-slate-400 mb-2">Monthly Trend</p>
        {loading ? <div className="h-24 bg-slate-50 animate-pulse rounded" /> : (
          <ConversionChart data={rows} color="#3b82f6" fillColor="#dbeafe" />
        )}
      </div>

      {!loading && !error && (
        <ConversionTable
          rows={rows}
          summary={summary}
          col1Header="Families"
          col2Header="Qualified"
          accentColor="#3b82f6"
          startLabel={startLabel}
          endLabel={endLabel}
        />
      )}
    </div>
  )
}
```

**Commit:**
```bash
git add src/components/InqToLeadCard.tsx
git commit -m "feat: add InqToLeadCard with header, trend chart, and monthly table"
```

---

## Task 10: LeadToTrialCard

**File to create:** `src/components/LeadToTrialCard.tsx`

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ConversionChart } from '@/components/ConversionChart'
import { ConversionTable } from '@/components/ConversionTable'
import { InfoTooltip } from '@/components/InfoTooltip'
import { calcPeriodChange, formatMonthLabel, toISOMonth } from '@/lib/utils'
import type { MonthlyRow, PeriodSummary, GlobalFilters, CardFilters, SelectOption } from '@/types'

function buildMonthOptions(): SelectOption[] {
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (23 - i))
    const iso = toISOMonth(d)
    return { value: iso, label: formatMonthLabel(iso) }
  })
}

function ChangeBadge({ summary, prev }: { summary: PeriodSummary; prev: PeriodSummary | null }) {
  if (!prev) return null
  const { delta, direction } = calcPeriodChange(summary, prev)
  if (direction === 'none' || direction === 'flat' || delta === null) return null

  const up = direction === 'up'

  return (
    <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
      {up ? '↑' : '↓'} {Math.abs(delta)}% vs prev period
    </span>
  )
}

type Props = {
  rows: MonthlyRow[]
  summary: PeriodSummary
  prevSummary: PeriodSummary | null
  filters: GlobalFilters
  cardFilters: CardFilters
  coachOptions: SelectOption[]
  onCardFiltersApply: (f: CardFilters) => void
  loading: boolean
  error: string | null
}

export function LeadToTrialCard({
  rows,
  summary,
  prevSummary,
  filters,
  cardFilters,
  coachOptions,
  onCardFiltersApply,
  loading,
  error,
}: Props) {
  const [draft, setDraft] = useState<CardFilters>(cardFilters)
  const monthOptions = buildMonthOptions()
  const startLabel = formatMonthLabel(toISOMonth(filters.startDate))
  const endLabel = formatMonthLabel(toISOMonth(new Date(filters.endDate.getTime() - 86400000)))

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center text-xs font-medium text-slate-500 mb-1">
            Lead → Trial Arranged Conversion
            <InfoTooltip>
              <p className="font-semibold text-white mb-1.5">Lead → Trial Arranged Conversion</p>
              <code className="block bg-slate-700 rounded px-2 py-1 mb-2 text-sky-300 text-[10px]">Trial Arranged Learners ÷ Qualified Learners</code>
              <p><span className="font-semibold text-slate-400">Qualified:</span> learners.is_qualified_learner = true</p>
              <p><span className="font-semibold text-slate-400">Trial Arr.:</span> learners.trial_status = &quot;Trial Arranged&quot;</p>
              <p><span className="font-semibold text-slate-400">Coach:</span> filters trials.coach_id (numerator only)</p>
              <p><span className="font-semibold text-slate-400">Trial date:</span> filters trials.trial_date (numerator only)</p>
              <p><span className="font-semibold text-slate-400">Total row:</span> Aggregated across full date range</p>
              <p className="mt-1.5 text-slate-500 text-[10px]">Grouped by family_date month</p>
            </InfoTooltip>
          </div>
          {loading ? (
            <div className="h-9 w-40 bg-slate-100 animate-pulse rounded" />
          ) : error ? (
            <p className="text-red-500 text-sm">{error}</p>
          ) : (
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-bold text-emerald-500">{summary.rate}%</span>
              <span className="text-sm text-slate-400">{summary.numerator} trial arranged / {summary.denominator} qualified learners</span>
            </div>
          )}
        </div>
        <ChangeBadge summary={summary} prev={prevSummary} />
      </div>

      <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex gap-3 items-end flex-wrap">
        <div className="flex items-center gap-1.5 self-end pb-0.5">
          <svg className="w-2.5 h-2.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Card Filters</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Coach</span>
          <Select value={draft.coachId ?? 'all'} onValueChange={v => setDraft(d => ({ ...d, coachId: v === 'all' ? null : v }))}>
            <SelectTrigger className="bg-white border-emerald-200 min-w-[130px] h-8 text-xs text-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {coachOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Trial From</span>
          <Select
            value={draft.trialStartDate ? toISOMonth(draft.trialStartDate) : 'any'}
            onValueChange={v => {
              if (v === 'any') {
                setDraft(d => ({ ...d, trialStartDate: null }))
                return
              }
              const [y, m] = v.split('-').map(Number)
              setDraft(d => ({ ...d, trialStartDate: new Date(y, m - 1, 1) }))
            }}
          >
            <SelectTrigger className="bg-white border-emerald-200 min-w-[110px] h-8 text-xs text-slate-700">
              <SelectValue placeholder="Any date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any date</SelectItem>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Trial To</span>
          <Select
            value={draft.trialEndDate ? toISOMonth(draft.trialEndDate) : 'any'}
            onValueChange={v => {
              if (v === 'any') {
                setDraft(d => ({ ...d, trialEndDate: null }))
                return
              }
              const [y, m] = v.split('-').map(Number)
              setDraft(d => ({ ...d, trialEndDate: new Date(y, m, 0) }))
            }}
          >
            <SelectTrigger className="bg-white border-emerald-200 min-w-[110px] h-8 text-xs text-slate-700">
              <SelectValue placeholder="Any date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any date</SelectItem>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8" onClick={() => onCardFiltersApply(draft)}>
          Apply
        </Button>
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-[11px] font-medium text-slate-400 mb-2">Monthly Trend</p>
        {loading ? <div className="h-24 bg-slate-50 animate-pulse rounded" /> : (
          <ConversionChart data={rows} color="#10b981" fillColor="#d1fae5" />
        )}
      </div>

      {!loading && !error && (
        <ConversionTable
          rows={rows}
          summary={summary}
          col1Header="Qualified Learners"
          col2Header="Trial Arranged"
          accentColor="#10b981"
          startLabel={startLabel}
          endLabel={endLabel}
        />
      )}
    </div>
  )
}
```

**Commit:**
```bash
git add src/components/LeadToTrialCard.tsx
git commit -m "feat: add LeadToTrialCard with card-level coach and trial date filters"
```

---

## Task 11: Root page + layout

**Files to modify:** `src/app/layout.tsx`, `src/app/page.tsx`

> ⚠️ **DO NOT touch `src/app/globals.css`**. It already uses correct Tailwind v4 syntax.

### `src/app/layout.tsx` (replace entire file)

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TSS Conversion Report',
  description: 'The Swim Starter — Sales Conversion Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-100 min-h-screen`}>{children}</body>
    </html>
  )
}
```

### `src/app/page.tsx` (replace entire file)

```tsx
'use client'
import { useState, useCallback } from 'react'
import { GlobalFilterPanel } from '@/components/GlobalFilterPanel'
import { InqToLeadCard } from '@/components/InqToLeadCard'
import { LeadToTrialCard } from '@/components/LeadToTrialCard'
import { useCountries, useCoaches } from '@/hooks/useFilterOptions'
import { useInqToLead } from '@/hooks/useInqToLead'
import { useLeadToTrial } from '@/hooks/useLeadToTrial'
import { supabase } from '@/lib/supabase'
import { rowsToCsv, buildExportFilename, downloadCsv } from '@/lib/csv'
import { toISOMonth } from '@/lib/utils'
import type { GlobalFilters, CardFilters } from '@/types'

function getDefaultFilters(): GlobalFilters {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  return { country: 'SG', state: 'all', startDate: start, endDate: end }
}

const DEFAULT_CARD_FILTERS: CardFilters = {
  coachId: null,
  trialStartDate: null,
  trialEndDate: null,
}

export default function DashboardPage() {
  const [appliedFilters, setAppliedFilters] = useState<GlobalFilters>(getDefaultFilters)
  const [cardFilters, setCardFilters] = useState<CardFilters>(DEFAULT_CARD_FILTERS)

  const countryOptions = useCountries()
  const coachOptions = useCoaches()
  const inqToLead = useInqToLead(appliedFilters)
  const leadToTrial = useLeadToTrial(appliedFilters, cardFilters)

  const handleExport = useCallback(async () => {
    const { data } = await supabase.rpc('get_families_for_export', {
      p_country: appliedFilters.country,
      p_state: appliedFilters.state,
      p_start_date: appliedFilters.startDate.toISOString(),
      p_end_date: appliedFilters.endDate.toISOString(),
    })

    if (!data) return

    const filename = buildExportFilename(
      appliedFilters.country,
      appliedFilters.state,
      toISOMonth(appliedFilters.startDate),
      toISOMonth(new Date(appliedFilters.endDate.getTime() - 86400000))
    )

    downloadCsv(rowsToCsv(data), filename)
  }, [appliedFilters])

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-slate-900 px-6 py-3.5 flex items-center justify-between">
        <span className="text-white font-bold text-base">TSS Conversion Report</span>
        <span className="text-slate-400 text-sm">The Swim Starter</span>
      </nav>

      <GlobalFilterPanel
        filters={appliedFilters}
        countryOptions={countryOptions}
        onApply={setAppliedFilters}
        onExport={handleExport}
      />

      <div className="bg-slate-200 px-6 py-2 flex items-center gap-2">
        <span className="text-xs font-medium text-slate-600">
          Global scope:
          {' '}
          {appliedFilters.country}
          {' / '}
          {appliedFilters.state === 'all' ? 'All States' : appliedFilters.state}
        </span>
      </div>

      <main className="flex-1 px-6 py-6 grid gap-6 xl:grid-cols-2">
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
```

**Commit:**
```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: wire dashboard page with global filters, export, and conversion cards"
```

---

## Task 12: Manual verification

Run:

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v20.20.2 && npm test && npx tsc --noEmit
```

Then manually verify:
- Dashboard loads without runtime errors.
- Default global filters are country `SG` and last 6 months.
- Inquiry → Lead card renders summary, chart, and table.
- Lead → Trial card renders summary, chart, table, and card filters.
- Export button downloads CSV.
- Country changes trigger state option refetch through `useStates(draft.country)`.
