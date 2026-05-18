# TSS Conversion Report UI — Design Spec

**Date:** 2026-05-18
**Status:** Approved

---

## Overview

A single-page, read-only dashboard that shows two sales conversion funnel metrics for The Swim Starter, filtered by country, state, and inquiry date range. No authentication required. Data is sourced from the CRM Supabase database (schema: `2026-05-11-crm-schema-design.md`).

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Rendering:** Client component (`"use client"`) — all filters are interactive and drive re-fetches
- **Data:** Supabase JS client (anon/public key, browser-side) — no API routes needed
- **UI components:** shadcn/ui
- **Charts:** Recharts (AreaChart)
- **No authentication**

---

## Data Source

The report queries the normalized CRM tables directly. No flat "inquiries" view is assumed.

### Tables used

| Table | Relevant columns |
|---|---|
| `families` | `family_id`, `family_date`, `country`, `state`, `enquiry_status`, `pipeline_status` |
| `learners` | `learner_id`, `family_id`, `trial_status`, `is_qualified_learner` |
| `trials` | `trial_id`, `learner_id`, `family_id`, `trial_date`, `trial_arranged_date`, `coach_id` |
| `coaches` *(TBC)* | `coach_id`, `coach_name` — table not yet in schema; filter shows `coach_id` until available |

### Key field mappings

| Report concept | DB field | Notes |
|---|---|---|
| Unique inquiry | `families.family_id` | One family = one inquiry |
| Inquiry date | `families.family_date` | Date family was first created (= first contact) |
| Country | `families.country` | e.g. `'SG'`, `'MY'`, `'ID'` |
| State | `families.state` | e.g. `'Singapore'`, `'Kuala Lumpur'`, `'Jakarta'` — dependent on country |
| Qualified (lead) | `families.enquiry_status = 'Qualified'` | Age + location + phone all passed. Stays `'Qualified'` even if family later goes `'Not Interested'` — correct for historical conversion tracking |
| Trial Arranged | `learners.trial_status = 'Trial Arranged'` | Learner-level — a family with 2 children counts as 2 in the numerator |
| Coach | `trials.coach_id` | FK to `coaches` table (TBC). Filter shows `coach_id` until `coaches` table is available |
| Trial date | `trials.trial_date` | The scheduled date of the trial session |

---

## Layout

### Page structure

```
┌─────────────────────────────────────────┐
│  Nav bar (dark #1e293b)                 │
├─────────────────────────────────────────┤
│  Global Filter Panel (dark slate #334155│
│  Country | State | Inquiry Date Range   │
│  [Apply]  [Export CSV]  active chips    │
├─────────────────────────────────────────┤
│  ↓ Filtered results shown in both cards │
├─────────────────────────────────────────┤
│  Card 1: Inquiry → Lead Conversion      │
│  Card 2: Lead → Trial Arranged          │
└─────────────────────────────────────────┘
```

### Nav bar
- Background: `#1e293b`
- Left: "TSS Conversion Report" (bold white)
- Right: "The Swim Starter" (muted)

### Global Filter Panel
- Background: `#334155` — visually distinct from white cards below
- Label: "Global Filters — applies to both cards below" with funnel icon
- Controls: Country dropdown, State dropdown (dependent on country), Inquiry Date Range picker
- Buttons: **Apply** (blue primary), **Export CSV** (outlined secondary, download icon)
- Active filter chips shown inline after buttons
- Thin divider below: "Filtered results shown in both cards"

---

## Global Filters

### Country
- `SELECT DISTINCT country FROM families ORDER BY country`
- Selecting a country resets and re-fetches the State dropdown

### State (dependent on Country)
- `SELECT DISTINCT state FROM families WHERE country = $country AND state IS NOT NULL ORDER BY state`
- Includes "All States" as the first option (no state filter applied)
- Resets to "All States" when country changes

### Inquiry Date Range
- Month-range picker (start month → end month)
- Filters by: `families.family_date >= start_of_start_month AND families.family_date < start_of_month_after_end`
- Default on load: last 6 months
- Applies to both cards (groups by month using `families.family_date`)

---

## Export CSV

- Downloads raw `families` rows matching active global filters (country, state, family_date range)
- Joins `learners` and `trials` to include qualification and trial status columns per family
- Returns individual rows, not aggregated
- File name: `tss-report-{country}-{state}-{start}-{end}.csv`

---

## Card 1 — Inquiry → Lead Conversion

### Formula
```
Rate = COUNT(DISTINCT family_id WHERE enquiry_status = 'Qualified')
       / COUNT(DISTINCT family_id)
```
Both numerator and denominator filtered by the active global filters (country, state, `family_date` range).

### Layout
1. **Header**
   - Title: "Inquiry → Lead Conversion" + `?` info icon (tooltip)
   - Headline rate (e.g. "68%") in blue `#3b82f6`
   - Raw counts: "120 qualified / 176 families" in muted text
   - Period-over-period badge: "↑ 4% vs prev period" (green badge) or "↓ X%" (red badge) or "—"

2. **Chart** — Recharts AreaChart
   - X-axis: month labels (from `family_date`)
   - Y-axis: conversion rate 0–100%
   - Area fill in blue tint

3. **Data table**

   | Month | Families | Qualified | Rate |
   |---|---|---|---|
   | Jan 2026 | 42 | 22 | 52% |
   | … | | | |
   | **Total** | **176** | **120** | **68%** |

   - One row per month in selected range
   - **Total row**: `SUM(qualified) / SUM(families)` — NOT average of monthly rates
   - Rate column in blue

### Tooltip content (`?` icon)
- **Formula:** `Qualified Families ÷ Total Families`
- **Families:** `COUNT(DISTINCT family_id)` grouped by `family_date` month
- **Qualified:** `families.enquiry_status = 'Qualified'`
- **Total row:** Aggregated across full selected date range

---

## Card 2 — Lead → Trial Arranged Conversion

### Formula
```
Rate = COUNT(learner_id WHERE trial_status = 'Trial Arranged'
             AND family.family_date IN range
             [AND coach_id = $coach IF selected]
             [AND trial_date IN $trial_range IF selected])
       / COUNT(learner_id WHERE is_qualified_learner = true
               AND family.family_date IN range)
```

**Unit:** Learners (not families). A family with 2 children = 2 in both numerator and denominator.

**Card-level filter scope:**
- Coach and trial date filters apply to the **numerator only** (Trial Arranged count)
- The **denominator** (qualified learners) reflects the global filters only, unaffected by card-level filters

> **Open question:** Confirm whether card-level filters should also narrow the denominator. Current spec: denominator = global filters only.

### Card-level filters
Green-tinted strip (`#f0fdf4`) inside the card, between header and chart:
- **Coach** — `SELECT DISTINCT coach_id FROM trials` (shows `coach_id` until `coaches` table available; will switch to `coach_name` when table is ready)
- **Trial Date Range** — date range picker filtering `trials.trial_date`
- **Apply** button (green)

### Layout
1. **Header**
   - Title: "Lead → Trial Arranged Conversion" + `?` icon
   - Headline rate in green `#10b981`
   - Raw counts: "102 trial arranged / 120 qualified learners"
   - Period-over-period badge

2. **Card-level filter strip**

3. **Chart** — Recharts AreaChart (green), grouped by `families.family_date` month

4. **Data table**

   | Month | Qualified Learners | Trial Arranged | Rate |
   |---|---|---|---|
   | Jan 2026 | 22 | 16 | 73% |
   | … | | | |
   | **Total** | **120** | **102** | **85%** |

   - **Total row:** `SUM(trial_arranged) / SUM(qualified_learners)` — NOT average of monthly rates
   - Rate column in green

### Tooltip content (`?` icon)
- **Formula:** `Trial Arranged Learners ÷ Qualified Learners`
- **Qualified Learners:** `learners.is_qualified_learner = true`, grouped by `families.family_date` month
- **Trial Arranged:** `learners.trial_status = 'Trial Arranged'`
- **Coach filter:** applies to `trials.coach_id` (numerator only)
- **Trial date filter:** applies to `trials.trial_date` (numerator only)
- **Total row:** Aggregated across full selected date range

---

## Period-over-Period Change Badge

- Compares headline rate for the selected range against the immediately preceding equal-length period
- e.g., if range is Jan–May 2026 (5 months), compare against Aug–Dec 2025
- Shows "↑ X%", "↓ X%", or "—" (no prior data)
- Computed from a second Supabase query for the prior period, run in parallel with the main query

---

## Supabase Query Strategy

All queries run client-side via the Supabase JS anon key.

### Card 1 — monthly aggregation
```sql
SELECT
  DATE_TRUNC('month', f.family_date) AS month,
  COUNT(DISTINCT f.family_id) AS total_families,
  COUNT(DISTINCT f.family_id) FILTER (WHERE f.enquiry_status = 'Qualified') AS qualified_count
FROM families f
WHERE
  f.country = $country
  AND ($state = 'all' OR f.state = $state)
  AND f.family_date >= $start_date
  AND f.family_date < $end_date
GROUP BY 1
ORDER BY 1
```

### Card 2 — monthly aggregation
```sql
SELECT
  DATE_TRUNC('month', f.family_date) AS month,
  COUNT(l.learner_id) FILTER (WHERE l.is_qualified_learner = true) AS qualified_learners,
  COUNT(l.learner_id) FILTER (
    WHERE l.trial_status = 'Trial Arranged'
    AND ($coach_id IS NULL OR t.coach_id = $coach_id)
    AND ($trial_start IS NULL OR t.trial_date >= $trial_start)
    AND ($trial_end IS NULL OR t.trial_date <= $trial_end)
  ) AS trial_arranged_count
FROM families f
JOIN learners l ON l.family_id = f.family_id
LEFT JOIN trials t ON t.learner_id = l.learner_id AND t.trial_status = 'Trial Arranged'
WHERE
  f.country = $country
  AND ($state = 'all' OR f.state = $state)
  AND f.family_date >= $start_date
  AND f.family_date < $end_date
GROUP BY 1
ORDER BY 1
```

### Country dropdown
```sql
SELECT DISTINCT country FROM families WHERE country IS NOT NULL ORDER BY country
```

### State dropdown (dependent on country)
```sql
SELECT DISTINCT state FROM families
WHERE country = $country AND state IS NOT NULL ORDER BY state
```

### Coach dropdown
```sql
-- Temporary until coaches table is ready
SELECT DISTINCT coach_id FROM trials WHERE coach_id IS NOT NULL ORDER BY coach_id
-- Future: SELECT coach_id, coach_name FROM coaches ORDER BY coach_name
```

---

## Open Questions (resolve before implementation)

1. **Lead → TA denominator scope** — when card-level coach/trial date filters are applied, does the qualified learner denominator also narrow, or stay at the global-filter-only pool? Current spec: global only.
2. **Coaches table** — once the `coaches` table is created, update the coach dropdown query and display to use `coach_name` instead of `coach_id`.
3. **Date range picker library** — default choice: `react-day-picker` with `date-fns`. Confirm if preference differs.
4. **Default state on load** — page loads with "All States" pre-selected. Confirm if a specific default state is preferred.
5. **Export columns** — confirm exact columns to include in the CSV export (all `families` columns, or a specific subset joined with `learners`/`trials`).
