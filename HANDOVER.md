# TSS Conversion Report — Session Handover

## What This Is

A Next.js dashboard for The Swim Starter showing:

- Inquiry → Lead conversion
- Lead → Trial Arranged conversion

It reads live aggregate data from Supabase RPC functions and supports:

- global country/state/date filters
- card-level coach/trial-date filters on Lead → Trial
- CSV export for the globally filtered family dataset

**Working directory:** `/home/fionalyh/TSS/tss-report-ui`  
**Implementation plan:** `docs/superpowers/plans/2026-05-18-tss-conversion-report.md`

---

## Current Status

Tasks 1–11 are complete. Task 12 remains.

| Task | Status | What |
|---|---|---|
| 1 | ✅ | Next.js scaffold, Tailwind v4, shadcn/ui, Vitest |
| 2 | ✅ | Shared TypeScript types |
| 3 | ✅ | Utility functions |
| 4 | ✅ | CSV helpers |
| 5 | ✅ | Supabase client + migrations + report RPCs |
| 6 | ✅ | `useFilterOptions`, `useInqToLead`, `useLeadToTrial` |
| 7 | ✅ | `InfoTooltip`, `ConversionChart`, `ConversionTable` |
| 8 | ✅ | `GlobalFilterPanel` + tests |
| 9 | ✅ | `InqToLeadCard` |
| 10 | ✅ | `LeadToTrialCard` |
| 11 | ✅ | `src/app/layout.tsx` and `src/app/page.tsx` wired |
| 12 | 🔲 | End-to-end manual verification |

**Validation status:** `npm test` and `npx tsc --noEmit` both pass on Node `v20.20.2`.  
**Current automated baseline:** 19 tests passing.

---

## What Changed This Session

Added:

- `src/components/InfoTooltip.tsx`
- `src/components/ConversionChart.tsx`
- `src/components/ConversionTable.tsx`
- `src/components/GlobalFilterPanel.tsx`
- `src/components/InqToLeadCard.tsx`
- `src/components/LeadToTrialCard.tsx`
- `src/__tests__/ConversionTable.test.tsx`
- `src/__tests__/GlobalFilterPanel.test.tsx`

Updated:

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `README.md`

---

## Critical Notes

### 1. Node version
Use Node `v20.20.2` for every `npm` / `npx` command:

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v20.20.2
```

### 2. Tailwind v4
Do **not** replace `src/app/globals.css` with Tailwind v3 directives. The current file is correct for v4.

### 3. shadcn / Base UI
`@base-ui/react` is required by the installed shadcn components. Do not remove it.

### 4. App Router / fonts
`src/app/layout.tsx` keeps the current `next/font` setup with CSS variables mapped into the Tailwind theme. If you change fonts, keep `--font-sans` and `--font-geist-mono` aligned with `globals.css`.

### 5. Global filter behavior
`GlobalFilterPanel` owns an internal draft state and calls `useStates(draft.country)` directly. Changing country resets `state` to `'all'`.

### 6. Default dashboard filters
`src/app/page.tsx` defaults to:

- country = `SG`
- state = `all`
- date range = last 6 months, with `endDate` as the first day of the current month (exclusive upper bound)

---

## Supabase

- **Project:** TSS
- **URL:** `https://ratutwrunpjoitzcnseh.supabase.co`
- **Anon key:** stored in `.env.local`

### Live tables

| Table | Rows | Notes |
|---|---|---|
| `families` | 1,408 | Source for Inquiry → Lead and export |
| `learners` | 1,408 | Source for Lead → Trial denominator |
| `trials` | 0 | Present but currently empty |
| `coaches` | 0 | Present but currently empty |

### RPC functions

- `get_report_countries()`
- `get_report_states(p_country)`
- `get_report_coaches()`
- `get_inq_to_lead_monthly(p_country, p_state, p_start_date, p_end_date)`
- `get_lead_to_trial_monthly(p_country, p_state, p_start_date, p_end_date, p_coach_id?, p_trial_start?, p_trial_end?)`
- `get_families_for_export(p_country, p_state, p_start_date, p_end_date)`

---

## File Map

```text
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ConversionChart.tsx
│   ├── ConversionTable.tsx
│   ├── GlobalFilterPanel.tsx
│   ├── InfoTooltip.tsx
│   ├── InqToLeadCard.tsx
│   ├── LeadToTrialCard.tsx
│   └── ui/
├── hooks/
│   ├── useFilterOptions.ts
│   ├── useInqToLead.ts
│   └── useLeadToTrial.ts
├── lib/
│   ├── csv.ts
│   ├── supabase.ts
│   └── utils.ts
├── types/
│   └── index.ts
└── __tests__/
    ├── ConversionTable.test.tsx
    ├── GlobalFilterPanel.test.tsx
    ├── csv.test.ts
    └── utils.test.ts
```

---

## Next Step: Task 12 Manual Verification

Run:

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v20.20.2 && npm test && npx tsc --noEmit
```

Then manually verify:

1. `npm run dev` starts cleanly.
2. Dashboard loads without runtime errors.
3. Default filters are `SG` and the last 6 months.
4. Country changes refetch state options through `useStates(draft.country)`.
5. Inquiry → Lead renders summary, trend chart, and table.
6. Lead → Trial renders summary, card filters, trend chart, and table.
7. CSV export downloads a file with the expected filename pattern.
8. Empty `trials` / `coaches` data does not break the page.
