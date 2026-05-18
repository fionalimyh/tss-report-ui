# TSS Conversion Report — Session Handover

## What This Is

A Next.js dashboard showing Inquiry→Lead and Lead→Trial Arranged conversion rates for The Swim Starter, reading live data from Supabase. Built with shadcn/ui, Recharts, Supabase JS v2, Vitest.

Working directory: `/home/fionalyh/TSS/tss-report-ui`

---

## Progress: Tasks 1–6 Complete, Tasks 7–12 Remaining

### Done ✅
| Task | What was built |
|---|---|
| 1 | Next.js 16 scaffold, shadcn/ui, Vitest, Tailwind v4, `.env.local` |
| 2 | `src/types/index.ts` — all shared TypeScript types |
| 3 | `src/lib/utils.ts` — calcRate, formatMonthLabel, toISOMonth, getPrevPeriodDates, calcPeriodChange |
| 4 | `src/lib/csv.ts` — rowsToCsv, buildExportFilename, downloadCsv |
| 5 | `src/lib/supabase.ts`, SQL migration files, 6 RPC functions deployed to Supabase |
| 6 | `src/hooks/useFilterOptions.ts`, `useInqToLead.ts`, `useLeadToTrial.ts` |

### Remaining 🔲
| Task | What to build |
|---|---|
| 7 | `InfoTooltip.tsx`, `ConversionChart.tsx`, `ConversionTable.tsx` + tests (TDD) |
| 8 | `GlobalFilterPanel.tsx` + tests (TDD) |
| 9 | `InqToLeadCard.tsx` |
| 10 | `LeadToTrialCard.tsx` |
| 11 | Root page + layout (`src/app/page.tsx`, `layout.tsx`, `globals.css`) |
| 12 | End-to-end manual verification |

---

## Critical Notes for Next Session

### 1. Node version — ALWAYS use v20
The system default is Node 18. Always source v20 before any npm/npx command:
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v20.20.2
```

### 2. Tailwind v4 — globals.css is already correct
The scaffold uses Tailwind v4 with CSS-based config. The implementation plan's Task 11 Step 1 says to replace `globals.css` with Tailwind v3 directives (`@tailwind base; @tailwind components; @tailwind utilities;`) — **DO NOT follow that step**. The current `globals.css` with `@import "tailwindcss"` is correct for v4. Only add custom CSS if needed, don't replace the file.

### 3. shadcn uses @base-ui/react
shadcn v4.7.0 uses `@base-ui/react` as its primitives library. It IS a used dependency — do not remove it.

### 4. Test suite baseline
15 tests pass across 2 files: `utils.test.ts` (11) and `csv.test.ts` (4). All subsequent tasks must keep these passing.

---

## Supabase

- **Project:** TSS (`ratutwrunpjoitzcnseh`)
- **URL:** `https://ratutwrunpjoitzcnseh.supabase.co`
- **Anon key:** in `.env.local` (gitignored, already created)

### Schema (what's live)
The normalized tables were created and migrated from the flat `inquiries` table:
- `families` — 1,408 rows (migrated from `inquiries`). Key columns: `family_id`, `family_date`, `country`, `state`, `enquiry_status` ('Qualified'=23 rows), `pipeline_status`
- `learners` — 1,408 rows (1:1 with families). Key columns: `learner_id`, `family_id`, `is_qualified_learner` (true=23 rows), `trial_status`
- `trials` — 0 rows (empty, waiting for CRM to write)
- `coaches` — 0 rows (empty, waiting for CRM to write)
- `trials_legacy` — old empty trials table (renamed for safety)

### RPC functions deployed
All use `SECURITY DEFINER`:
- `get_report_countries()` → `{country}[]`
- `get_report_states(p_country)` → `{state}[]`
- `get_report_coaches()` → `{coach_id, coach_name}[]`
- `get_inq_to_lead_monthly(p_country, p_state, p_start_date, p_end_date)` → `{month, total_families, qualified_count}[]`
- `get_lead_to_trial_monthly(p_country, p_state, p_start_date, p_end_date, p_coach_id?, p_trial_start?, p_trial_end?)` → `{month, qualified_learners, trial_arranged_count}[]`
- `get_families_for_export(p_country, p_state, p_start_date, p_end_date)` → family rows

---

## How to Continue

The implementation plan is at:
`docs/superpowers/plans/2026-05-18-tss-conversion-report.md`

Use the **superpowers:subagent-driven-development** skill and dispatch subagents for Tasks 7–12 in order.

### Key context to give each subagent
- Node v20 via nvm (see command above)
- Tailwind v4 — don't replace globals.css with v3 directives
- All imports use `@/` alias (maps to `src/`)
- shadcn components are in `src/components/ui/`
- Existing tests: 15 passing in `src/__tests__/`
- For Task 8 (GlobalFilterPanel): the component calls `useStates(draft.country)` internally — state dropdown re-fetches when draft country changes (no need for stateOptions prop)
- For Task 11 (page.tsx): default country is 'SG', last 6 months date range

### Quick validation after each task
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v20.20.2 && npm test && npx tsc --noEmit
```

---

## File Map (completed files)
```
src/
├── types/index.ts              ✅ GlobalFilters, CardFilters, MonthlyRow, PeriodSummary, PeriodChange, SelectOption
├── lib/
│   ├── supabase.ts             ✅ Supabase client singleton
│   ├── utils.ts                ✅ calcRate, formatMonthLabel, toISOMonth, getPrevPeriodDates, calcPeriodChange, cn
│   └── csv.ts                  ✅ rowsToCsv, buildExportFilename, downloadCsv
├── hooks/
│   ├── useFilterOptions.ts     ✅ useCountries, useStates, useCoaches
│   ├── useInqToLead.ts         ✅ useInqToLead (with prev-period comparison)
│   └── useLeadToTrial.ts       ✅ useLeadToTrial (with prev-period + card-level filters)
├── components/
│   ├── ui/                     ✅ shadcn: button, select, tooltip, badge
│   ├── InfoTooltip.tsx         🔲 Task 7
│   ├── ConversionChart.tsx     🔲 Task 7
│   ├── ConversionTable.tsx     🔲 Task 7
│   ├── GlobalFilterPanel.tsx   🔲 Task 8
│   ├── InqToLeadCard.tsx       🔲 Task 9
│   └── LeadToTrialCard.tsx     🔲 Task 10
├── app/
│   ├── globals.css             ✅ Tailwind v4 (DO NOT replace with v3 directives)
│   ├── layout.tsx              🔲 Task 11
│   └── page.tsx                🔲 Task 11
└── __tests__/
    ├── utils.test.ts           ✅ 11 tests
    ├── csv.test.ts             ✅ 4 tests
    ├── ConversionTable.test.tsx 🔲 Task 7
    └── GlobalFilterPanel.test.tsx 🔲 Task 8
```
