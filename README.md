# TSS Conversion Report UI

Dashboard UI for The Swim Starter sales funnel, focused on two conversion views:

- Inquiry → Lead
- Lead → Trial Arranged

The app is intended to read live aggregate data from Supabase CRM tables through RPC functions, with client-side filters for country, state, inquiry date range, and card-level trial filters.

## Status

This repo is **implemented through the dashboard shell and data wiring**.

Completed:
- Next.js app scaffold
- Supabase client wiring
- shared TypeScript types
- utility functions and tests
- CSV export helpers and tests
- filter/data hooks
- Supabase migrations and report RPCs
- shared dashboard components
- global filter panel
- Inquiry → Lead card
- Lead → Trial Arranged card
- dashboard layout and root page wiring

Not yet completed:
- end-to-end manual verification

The most current task-by-task handoff is in [HANDOVER.md](./HANDOVER.md).  
The original implementation plan is in [docs/superpowers/plans/2026-05-18-tss-conversion-report.md](./docs/superpowers/plans/2026-05-18-tss-conversion-report.md).

## Current Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Recharts
- Supabase JS v2
- date-fns
- Vitest + React Testing Library

## Important Notes

- Use Node `v20.20.2` for all `npm` and `npx` commands.
- Tailwind is on v4. Do **not** replace `src/app/globals.css` with Tailwind v3 directives.
- shadcn depends on `@base-ui/react` in this project. Do not remove it.
- The implementation plan references older framework versions in places; prefer the repo’s actual installed versions from `package.json`.

## Project Structure

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

Supabase SQL lives under:

```text
supabase/migrations/
├── 20260518000000_report_rpc.sql
└── 20260518000001_crm_tables.sql
```

## Setup

1. Use Node 20:

```bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use v20.20.2
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. Start the dev server:

```bash
npm run dev
```

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run test:watch
```

## Validation

Current test baseline:
- `src/__tests__/ConversionTable.test.tsx`: 2 tests
- `src/__tests__/GlobalFilterPanel.test.tsx`: 2 tests
- `src/__tests__/utils.test.ts`: 11 tests
- `src/__tests__/csv.test.ts`: 4 tests

Run validation with:

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v20.20.2 && npm test && npx tsc --noEmit
```

## Supabase Reporting Model

The dashboard is designed to query aggregated data through RPC functions rather than pulling raw CRM rows into the browser.

Expected report RPCs:
- `get_report_countries()`
- `get_report_states(p_country)`
- `get_report_coaches()`
- `get_inq_to_lead_monthly(p_country, p_state, p_start_date, p_end_date)`
- `get_lead_to_trial_monthly(p_country, p_state, p_start_date, p_end_date, p_coach_id?, p_trial_start?, p_trial_end?)`
- `get_families_for_export(p_country, p_state, p_start_date, p_end_date)`

## Planned Dashboard Behavior

- Root App Router page owns applied global filters.
- Global filters apply to both conversion cards.
- Inquiry → Lead uses family-level inquiry data.
- Lead → Trial Arranged adds card-level coach and trial-date filters.
- Monthly tables show per-month rows plus an aggregated total row.
- CSV export uses the currently applied global filters.

## Current Gaps

The main remaining gap is Task 12 manual verification against the live Supabase-backed UI.

If you are continuing implementation or QA, start with [HANDOVER.md](./HANDOVER.md).
