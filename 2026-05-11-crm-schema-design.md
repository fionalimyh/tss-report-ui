# CRM Schema Design

**Last updated:** 2026-05-17
**Status:** Ready for implementation plan — CRM-side scope ends at Trial Arranged. Covered: qualification state machine with Engagement Guard, AI extraction-only mode on Disqualified, cross-channel merge with family-level data preservation, per-family dispatch coalescing, dispatch routing across FB Messenger / IG inbox / WhatsApp, one-way Airtable push at trial arrangement. **All post-Trial-Arranged management — Missed Trial, Cancelled Trial, Trial Done, Pending Sign Up, Considering, Enrolled — is handled in Airtable by the ops team.** Package definitions / pricing / billing also Airtable-managed today. Schema fields for those flows (`missed_trial_heat`, `cancelled_trial_heat`, `packages`, `package_pricing`, `enrollments`, `invoices`, `invoice_items`, `payments`) stay defined so no schema restructuring is needed when CRM eventually absorbs the full lifecycle

---

## Naming Conventions

| Term | Definition |
|---|---|
| Family | Created automatically on first contact. The root record. Over time gains more contacts (household members) and more learners (siblings) |
| Contact | The person who messages us — parent for kids classes, the adult themselves for adult classes. Always belongs to a family |
| Learner | The person who will be swimming — child or adult. Created when ages collected. Belongs to a family, not a specific contact |
| Trial | A single trial session arranged for a learner |

---

## Core Table Relationships

```
families (root — auto-created on first contact)
    ├── contacts (who messages us — phone heat and phone qualification live here)
    │       └── is_primary_contact marks the main communication contact
    ├── learners (the swimmers — created when ages collected)
    └── trials (via learner_id — trials always arranged with primary contact)
```

- On first message → CREATE `families`, then CREATE `contacts` linked to that family
- Multiple contacts on one family = other household members messaging in later
- Multiple learners on one family = siblings
- Age and location qualification live on `families`. Phone qualification lives on `contacts`
- `families.enquiry_status` is derived from the three qualification fields. State machine, transitions, `pre_trial_heat` activation, and re-qualification outreach logic all live in **Qualification Rules** below
- Learner records created when AI collects ages — one per swimmer — linked to `family_id`
- Learner records are typically NOT created when family is location-disqualified before ages collected — the AI flow doesn't ask for ages after telling the contact we don't serve their area. If a contact volunteers ages anyway (rare edge case), learners are still created with `location_qualification = 'Disqualified'` copied from the family, and `is_qualified_learner` stays false
- At trial confirmation → learner record updated with trial info; trial record created
- CAC tracked via `contacts.contact_source` (first-touch, never updated)
- **Enrollment** is reserved exclusively for when a learner pays and signs up for class
- To send a push message: query `contacts` WHERE `family_id = X` AND `is_primary_contact = true`

---

## Table Definitions

### `families`

Auto-created on every first contact. The root grouping record. Qualification, heat, and pipeline state all live here. Grows over time as more household members message in (`contacts`) or more children's ages are provided (`learners`).

| Field | Type | Default | When populated |
|---|---|---|---|
| `family_id` | bigint PK IDENTITY | — | On creation |
| `family_name` | text | null | Set from contact name initially; can be updated |
| `family_date` | timestamptz | now() | On creation |
| `updated_at` | timestamptz | now() | Updated on any field change |
| `preferred_location` | text | null | During AI conversation — raw input from contact |
| `confirmed_location` | text | null | Set when AI matches preferred_location to a pool we service |
| `location_qualification` | text | 'Yet to Qualify' | `'Qualified'` when `confirmed_location` is set. `'Disqualified'` when no pool match. Can flip `'Disqualified'` → `'Qualified'` later via Location Expansion (admin sets `confirmed_location` when a new pool is added — see Location Expansion section) |
| `age_qualification` | text | 'Yet to Qualify' | `'Qualified'` if at least one learner ≥ 4. `'Disqualified'` if all learners < 4 |
| `enquiry_status` | text | 'Yet to Qualify' | Derived from `age_qualification`, `location_qualification`, and primary contact `phone_qualification`. See **Qualification Rules** section for the full state machine and re-evaluation triggers |
| `country` | text | null | Derived from inbound channel's country mapping (FB page region, IG account region, WhatsApp number prefix) on creation. Must match `contacts.country` for the same first-message event |
| `state` | text | null | Operational region/city the contact identifies with. Allowed values per country (the regions we currently service): SG → `'Singapore'`; MY → `'Kuala Lumpur'`; ID → `'Jakarta'` / `'Bali'` / `'Medan'`. Set during AI conversation. Not free text — if the contact's stated region doesn't match an allowed value, leave null (admin can correct later) |
| `pipeline_status` | text | 'Inquiry' | Overall CRM pipeline stage at family level. **Under current scope, only 'Inquiry' → 'Lead' → 'Trial Arranged' are auto-set by CRM scenarios.** The post-Trial-Arranged stages ('Trial Done', 'Pending Sign Up', 'Considering', 'Enrolled') are deferred and Airtable-managed — see Post-Trial Airtable Handoff. **Eventual happy path** (post-migration): 'Inquiry' → 'Lead' → 'Trial Arranged' → 'Trial Done' → 'Pending Sign Up' / 'Considering' → 'Enrolled'. **'Not Interested'** is terminal. Under current scope it's reached via Scenario 1 Step 6 (post-qualification contact decline, inherited by Scenarios 2/3) when family is at 'Lead' or 'Trial Arranged'. Admin can also direct-flip to 'Not Interested' from any stage via admin UI (including Inquiry, for "stop messaging me" cases) — see Engagement Guard. Future post-Trial-Arranged stages would also be able to transition to Not Interested when activated. See scenarios for exact transition triggers |
| `age_heat` | numeric | 5 | Drops while no learner ages collected. Snaps to 0 when `age_qualification` resolves (Qualified or Disqualified). Also snaps to 0 as terminal state after the heat = 1 follow-up dispatches and no further drops are scheduled — distinguishable from qualified-zero by checking `age_qualification = 'Yet to Qualify'` |
| `age_heat_date` | timestamptz | now() | Updated on every age_heat change |
| `location_heat` | numeric | 5 | Drops while location unresolved. Snaps to 0 when `location_qualification` resolves (Qualified or Disqualified). Also snaps to 0 as terminal state after the heat = 1 follow-up dispatches and no further drops are scheduled — distinguishable from qualified-zero by checking `location_qualification = 'Yet to Qualify'` |
| `location_heat_date` | timestamptz | now() | Updated on every location_heat change |

---

### `contacts`

The persistent adult contact record. Created on first message. Always linked to a family. Never duplicated — dedup logic resolves to this table. Channel IDs, phone, and messaging timestamps live here.

| Field | Type | Default | When populated |
|---|---|---|---|
| `contact_id` | bigint PK IDENTITY | — | On creation |
| `family_id` | bigint FK | — | On creation — links to `families` |
| `is_primary_contact` | boolean | true | Set `true` for the first contact created per family. Subsequent contacts on the same family default to `false` to preserve the "one primary per family" invariant. If primary needs to change (e.g. spouse takes over), admin manually flips both flags in one transaction (new primary → true AND old primary → false). Enforce as a partial unique constraint: `UNIQUE (family_id) WHERE is_primary_contact = true` |
| `contact_name` | text | null | During AI conversation |
| `phone_number` | text | null | During AI conversation or on creation if WhatsApp. **Normalized to digits-only E.164 format** (country code + national number, no `+`, no spaces, no leading zeros from national format). Examples: SG `+65 9123 4567` → `6591234567`; ID `0812-3456-789` → `6281234567` (leading `0` stripped, country code `62` prepended); MY `012-345-6789` → `60123456789`. WhatsApp's incoming phone is already E.164-normalized — the application layer must normalize manually-collected phone strings (from Facebook/Instagram conversation) before storing, otherwise WhatsApp dedup misses matches. WhatsApp contacts use this field as their platform identifier — no separate `wa_id` column |
| `phone_qualification` | text | 'Yet to Qualify' | `'Qualified'` when any phone number is collected. No disqualification |
| `phone_heat` | numeric | 5 | Set to 0 in INSERT logic when channel provides phone at entry (WhatsApp). Snaps to 0 when phone qualified. Snaps to 0 as terminal state after the heat = 1 follow-up dispatches and no further drops are scheduled — distinguishable from qualified-zero by checking `phone_qualification` |
| `phone_heat_date` | timestamptz | now() | Updated on every phone_heat change |
| `facebook_id` | text | null | On creation if Facebook |
| `instagram_id` | text | null | On creation if Instagram |
| `telegram_id` | text | null | **Reserved for future use** — no scenario currently supports Telegram contacts. Field exists so dedup logic can be extended without schema changes. If/when Telegram is added: must also extend `conversations.source` and `operation_logs.source` enums to include `'telegram'` |
| `tiktok_id` | text | null | **Reserved for future use** — no scenario currently supports TikTok contacts. Field exists so dedup logic can be extended without schema changes. If/when TikTok is added: must also extend `conversations.source` and `operation_logs.source` enums to include `'tiktok'` |
| `country` | text | null | Same value as `families.country` — derived from inbound channel's country mapping on creation. May also be updated during conversation if contact disambiguates |
| `state` | text | null | Operational region/city — same enum as `families.state`. Allowed values per country: SG → `'Singapore'`; MY → `'Kuala Lumpur'`; ID → `'Jakarta'` / `'Bali'` / `'Medan'`. Set on creation (from channel default for the country) or updated during conversation if the contact disambiguates. Not free text |
| `contact_source` | text | null | `'Facebook Messenger'` / `'Instagram Messenger'` / `'WhatsApp'` — same enum as `conversations.source`. Set once on first contact and never updated under normal flow. **Merge exception:** during cross-channel merge, if the duplicate (about-to-be-deleted) contact has an earlier `contact_created_date`, the surviving contact's `contact_source` is overwritten with the duplicate's value so first-touch attribution is preserved (see merge Step 2). Used for first-touch CAC attribution |
| `contact_created_date` | timestamptz | now() | On creation — date of first ever contact. **Merge exception:** overwritten on the surviving contact during cross-channel merge if the duplicate's value is earlier — preserves first-touch date across consolidation (see merge Step 2) |
| `last_customer_reply_time` | timestamptz | now() | Every inbound message |
| `last_message_sent_time` | timestamptz | null | Every outbound message |

---

### `learners`

One record per person swimming. Created when AI extracts ages during conversation. Belongs to a family — not a specific contact — so siblings share the same `family_id`. Tracks identity, pipeline state, and current enrollment state. Full enrollment history lives in `enrollments`.

| Field | Type | Default | When populated |
|---|---|---|---|
| `learner_id` | bigint PK IDENTITY | — | On creation |
| `family_id` | bigint FK | — | On creation — links to `families` |
| `learner_name` | text | null | During conversation or at trial confirmation |
| `learner_age` | integer | — | Set on creation — extracted from conversation. Updated to `4` by Age Eligibility Push when `learner_eligible_date` arrives (needed so `is_qualified_learner` re-evaluation sees the correct current age). Not auto-incremented on subsequent birthdays — pre-enrollment only needs ≥ 4; ongoing age tracking is out of scope |
| `learner_eligible_date` | date | null | Set at creation if `learner_age < 4` — estimated date learner turns 4. Cleared (set to null) by Age Eligibility Push when the date arrives, to prevent re-firing on subsequent eligible-date queries |
| `location_qualification` | text | — | Denormalized copy of `families.location_qualification` for query convenience and RLS. Copied at learner creation AND whenever `families.location_qualification` changes. **Not the source of truth** — `is_qualified_learner` reads `families.location_qualification` directly to avoid cascade-ordering issues |
| `learner_date` | timestamptz | now() | On creation |
| `is_qualified_learner` | boolean | false | true when `learner_age ≥ 4` AND `families.location_qualification = 'Qualified'` AND primary contact `phone_qualification = 'Qualified'`. Reads `families.location_qualification` directly (not the denormalized `learners.location_qualification` copy) to avoid cascade-ordering issues. Re-evaluated whenever any of the three conditions change |
| `trial_status` | text | 'Yet to Arrange' | **Under current scope, CRM writes these values:** `'Yet to Arrange'` (default), `'Trial Arranged'` (Scenario 1 Step 7 / Scenario 3 Step 6), `'Not Interested in Trial'` (learner-level decline — contact agrees to trial for one sibling but not another, or declines trial for THIS specific learner without going Not Interested at the family level), `'Future Trial'` (parent intends to book later — set when contact says "we'll do the trial in a few months" without committing to a specific date; distinct from the family-level `pre_trial_followup_date` callback, which is a short-term defer). **Deferred (Airtable-managed):** `'Trial Done'` / `'Missed Trial'` / `'Cancelled'` — not set by any active CRM scenario; see Post-Trial Airtable Handoff. **Eventual full state machine (when migration activates Scenarios 4/5/6):** 'Yet to Arrange' → 'Trial Arranged' → 'Trial Done' / 'Missed Trial' / 'Cancelled', with Missed / Cancelled looping back to 'Trial Arranged' when a new trial is booked. Trial completion is not a prerequisite for enrollment — a learner can enroll directly (e.g. walk-in customer) with trial_status remaining 'Yet to Arrange' |
| `pre_trial_heat` | numeric | null | Null at learner creation. Activates at 5 via either path: (a) Central Trigger flips `families.enquiry_status` to `'Qualified'` (Transition → 'Qualified' step 3), for all learners with `is_qualified_learner = true`, OR (b) Age Eligibility Push fires for an aging-in learner whose family was already `'Qualified'`. Drops 5→1 while pushing to arrange first trial. Snaps to 0 when: (a) the learner's `trial_status` transitions away from `'Yet to Arrange'` to any of `'Trial Arranged'` / `'Not Interested in Trial'` / `'Future Trial'` (learner-level — sibling heats untouched); (b) family-level Not Interested fires at any of the four trigger sites — contact decline, merge, admin direct flip, all snap ALL learner heats on the family per Engagement Guard; (c) `enquiry_status` reverts to `'Disqualified'` (Transition → Disqualified step 3) |
| `pre_trial_heat_date` | timestamptz | null | Updated on every pre_trial_heat change |
| `pre_trial_followup_date` | date | null | Set when contact defers during pre-trial follow-up (see Sub-case in Scenario 1). Two cases: contact gives an explicit callback date → use it; contact defers vaguely with no date ("discuss with spouse", "I'll think about it") → default to `current_date + 1 day`. Heat engine suppresses pre_trial_heat drops until this date |
| `missed_trial_heat` | numeric | null | **DEFERRED — not activated under current scope** (Scenario 4 is Airtable-managed; see Post-Trial Airtable Handoff). Stays null forever in current CRM. *Eventual behavior when activated:* Null until `learners.trial_status = 'Missed Trial'`. Starts at 5 immediately. Drops 5→1 while pushing re-engagement. Snaps to 0 when: new trial arranged, contact says Not Interested, or cross-channel merge results in `pipeline_status = 'Not Interested'` |
| `missed_trial_heat_date` | timestamptz | null | **DEFERRED** — see `missed_trial_heat`. Updated on every missed_trial_heat change when activated |
| `missed_trial_followup_date` | date | null | **DEFERRED** — see `missed_trial_heat`. *Eventual behavior:* Set when contact gives a callback date after missing trial. Heat engine suppresses missed_trial_heat drops until this date |
| `cancelled_trial_heat` | numeric | null | **DEFERRED — not activated under current scope** (Scenario 5 is Airtable-managed). Stays null forever in current CRM. *Eventual behavior:* Null until `learners.trial_status = 'Cancelled'`. Starts at 5 on `cancelled_followup_date` (or immediately if no date given). Snaps to 0 when: new trial arranged, contact says Not Interested, or cross-channel merge results in `pipeline_status = 'Not Interested'` |
| `cancelled_trial_heat_date` | timestamptz | null | **DEFERRED** — see `cancelled_trial_heat`. Updated on every cancelled_trial_heat change when activated |
| `cancelled_followup_date` | date | null | **DEFERRED** — see `cancelled_trial_heat`. *Eventual behavior:* Set during cancellation conversation if contact gives a preferred follow-up date. Heat engine uses this to delay cancelled_trial_heat start |
| `enrollment_status` | text | 'Yet to Enroll' | Mirrors current enrollment state. 'Yet to Enroll' / 'Pending Enrollment' / 'Successful Enrollment' / 'Paused' / 'Failed Enrollment' / 'Future Enrollment' / 'Quit' |
| `learner_level` | text | null | Set from parent self-report at inquiry, or assessed by coach after trial. Kids levels: Kinder / 25m / Stage 1 / Stage 2 / 200m / Stage 3 / 400m / Stage 4 (Bronze) / 1000m / Stage 5 (Silver) / 1500m / Stage 6 (Gold). Adults: null until level list defined |
| `updated_at` | timestamptz | now() | Updated on any field change |
| `airtable_id` | text | null | Most recent successful trial-arranged push's Airtable record ID. The CRM just sends the push — no dedup logic on our side. The ops team handles any cleanup on Airtable manually. Overwritten on every subsequent push. Null if sync not yet done or last attempt failed |

---

### `trials`

One record per trial attempt. Created when a trial is confirmed for a learner. If a new trial is arranged after cancellation or a missed trial, a new record is created — the old record stays as history. `learners.trial_status` is the current snapshot; this table is the full history.

| Field | Type | Default | When populated |
|---|---|---|---|
| `trial_id` | bigint PK IDENTITY | — | On creation |
| `learner_id` | bigint FK | — | On creation |
| `family_id` | bigint FK | — | On creation — for querying all trials per family |
| `learner_name` | text | null | Copied from `learners.learner_name` at trial creation — for attendance display |
| `trial_status` | text | 'Trial Arranged' | Mirrors `learners.trial_status` for THIS specific trial. **Active values written by CRM:** `'Trial Arranged'`. **Note:** the learner-level statuses `'Not Interested in Trial'` and `'Future Trial'` live on `learners.trial_status` only — they describe the learner's overall intent and don't produce a `trials` row (no trial was actually booked). **Deferred (Airtable-managed):** `'Trial Done'` / `'Missed Trial'` / `'Cancelled'` |
| `trial_date` | date | null | On creation |
| `trial_day` | text | null | On creation |
| `trial_timeslot` | text | null | On creation |
| `pool_id` | bigint FK | null | On creation — links to `pools` |
| `coach_id` | bigint FK | null | On creation — links to `coaches` |
| `trial_arranged_date` | timestamptz | now() | On creation |

---

### `enrollments` (DEFERRED — Airtable-managed)

**Not driven by any active CRM scenario** — enrollments are maintained in Airtable today. Schema kept for future migration. One record per enrollment period. Ends when learner pauses or quits. Re-enrollment creates a new record. `learners.enrollment_status` is the current snapshot; this table is the full history.

| Field | Type | Default | When populated |
|---|---|---|---|
| `enrollment_id` | bigint PK IDENTITY | — | On creation |
| `learner_id` | bigint FK | — | On creation |
| `family_id` | bigint FK | — | On creation |
| `learner_name` | text | null | Copied from `learners.learner_name` on creation — for attendance display |
| `enrollment_status` | text | 'Pending Enrollment' | Pending Enrollment / Future Enrollment / Successful Enrollment / Failed Enrollment / Paused / Quit |
| `package_id` | bigint FK | — | On creation — links to `packages` |
| `level_at_enrollment` | text | null | Snapshot of `learners.learner_level` on creation |
| `class_day` | text | null | Selected during enrollment |
| `class_timeslot` | text | null | Selected during enrollment |
| `pool_id` | bigint FK | null | Selected during enrollment — links to `pools` |
| `coach_id` | bigint FK | null | Selected during enrollment — links to `coaches` |
| `enrollment_start_date` | date | null | On creation — date of first lesson, matches invoice period_start |
| `enrollment_date` | timestamptz | now() | On creation |
| `enrollment_end_date` | date | null | When status becomes Paused or Quit — not tied to payment period |

---

### `packages` (DEFERRED — Airtable-managed)

**Not driven by any active CRM scenario** — package definitions are maintained in Airtable today alongside the rest of the post-trial flow (enrollments, invoices, payments). Schema kept for future migration. Defines credit rules per package type. Country-agnostic — pricing is in `package_pricing`.

| Field | Type | Default | When populated |
|---|---|---|---|
| `package_id` | bigint PK IDENTITY | — | On creation |
| `package_name` | text | — | 'Silver' / 'Gold' / 'Platinum' |
| `credits_per_week` | integer | null | Credits granted per week. Null for Platinum (unlimited) |
| `deduct_always` | boolean | true | true = Silver (deduct 1 credit per week regardless of attendance). false = Gold (deduct only when class attended). Irrelevant for Platinum |
| `is_unlimited` | boolean | false | true for Platinum — no credit tracking, unlimited classes for the period |
| `active` | boolean | true | Flag to retire old packages without deleting |
| `created_at` | timestamptz | now() | On creation |

---

### `package_pricing` (DEFERRED — Airtable-managed)

**Not driven by any active CRM scenario** — pricing is maintained in Airtable today. Schema kept for future migration. Price per package per country per duration. Supports bulk discounts.

| Field | Type | Default | When populated |
|---|---|---|---|
| `pricing_id` | bigint PK IDENTITY | — | On creation |
| `package_id` | bigint FK | — | Links to `packages` |
| `program` | text | — | 'kids' / 'adults' — kids and adults priced differently |
| `country` | text | — | e.g. 'SG', 'MY' |
| `duration_weeks` | integer | — | 4 / 8 / 12 / 16 / 20 / 52 |
| `price` | numeric | — | Total price for that duration |
| `currency` | text | — | e.g. 'SGD', 'MYR' |
| `valid_from` | date | — | Date this price became active. Required for historical price reconstruction |
| `active` | boolean | true | Retire old pricing without deleting |
| `created_at` | timestamptz | now() | On creation |

Credits granted on purchase = `packages.credits_per_week × duration_weeks`

> **Unique constraint:** `(package_id, program, country, duration_weeks, valid_from)` — prevents duplicate pricing rows for the same combination.

---

### `invoices`

One per billing event. Tracks the payment period covered. Enrollment status is independent — slot is not removed if invoice is unpaid.

| Field | Type | Default | When populated |
|---|---|---|---|
| `invoice_id` | bigint PK IDENTITY | — | On creation |
| `family_id` | bigint FK | — | On creation |
| `invoice_date` | timestamptz | now() | On creation |
| `due_date` | date | null | Payment deadline |
| `period_start` | date | null | First lesson date this invoice covers |
| `period_end` | date | null | Last date this payment period covers |
| `total_amount` | numeric | — | Sum of all line items |
| `currency` | text | — | e.g. 'SGD' |
| `invoice_status` | text | 'Unpaid' | Unpaid / Paid / Overdue |
| `payment_scheme` | text | 'Full' | 'Full' / 'BNPL' — for future schemes |
| `notes` | text | null | |

---

### `invoice_items`

Line items per invoice. Can cover packages, equipment, swim tests, or other charges.

| Field | Type | Default | When populated |
|---|---|---|---|
| `item_id` | bigint PK IDENTITY | — | On creation |
| `invoice_id` | bigint FK | — | On creation |
| `learner_id` | bigint FK NOT NULL | — | Always set — every item is attributable to a specific learner |
| `enrollment_id` | bigint FK | null | Set if item is a package purchase |
| `item_type` | text | — | 'Package' / 'Equipment' / 'Swim Test' / 'Other' |
| `description` | text | — | e.g. 'Gold 8 weeks', 'Swim goggles' |
| `quantity` | integer | 1 | |
| `unit_price` | numeric | — | |
| `total_price` | numeric | — | quantity × unit_price |

---

### `payments`

Payment records against invoices. One payment per invoice for full payment scheme. Multiple payments per invoice if BNPL.

| Field | Type | Default | When populated |
|---|---|---|---|
| `payment_id` | bigint PK IDENTITY | — | On creation |
| `invoice_id` | bigint FK | — | On creation |
| `payment_date` | timestamptz | null | When payment received |
| `amount` | numeric | — | |
| `payment_method` | text | null | e.g. 'Bank Transfer' / 'PayNow' / 'Card' |
| `payment_status` | text | 'Pending' | Pending / Completed / Failed |
| `transaction_ref` | text | null | External reference from payment gateway |

---

### `conversations`

Every inbound and outbound message across all channels. Created on every message send/receive. Used for conversation history, audit, and AI context.

| Field | Type | Default | When populated |
|---|---|---|---|
| `convo_id` | bigint PK IDENTITY | — | On creation |
| `contact_id` | bigint FK | — | On creation — links to `contacts`. Updated to surviving contact on merge |
| `family_id` | bigint FK | — | On creation — denormalized for fast family-level history queries |
| `source` | text | — | 'Facebook Messenger' / 'Instagram Messenger' / 'WhatsApp' |
| `source_id` | text | — | Platform-specific sender ID (Facebook PSID — Page-scoped ID; Instagram IGSID — Instagram-scoped ID from the Instagram Graph API; phone number for WhatsApp) |
| `direction` | text | — | 'inbound' (from customer) / 'outbound' (from system) |
| `customer_message_content` | text | null | Populated on inbound messages |
| `system_reply` | text | null | Populated on outbound messages |
| `template_id` | bigint FK | null | Set if outbound message used a template — links to `message_templates` |
| `status` | text | 'Success' | Delivery status: 'Success' / 'Failed' |
| `created_at` | timestamptz | now() | On creation |

---

### `heat_change_log`

Record of active heat events — heat starting (null→5) and heat drops (5→4→3→2→1). **Append-only with respect to row creation** (rows never deleted; the heat values `old_heat` and `new_heat` are never updated after insert). The `dispatched` and `dispatch_error` fields are the only mutable columns — updated once when the heat engine attempts dispatch (success → `dispatched = true`, failure → `dispatched = false` AND `dispatch_error = <message>`). **Snap-to-zero events are NOT logged here regardless of cause** (field qualification, terminal heat exhaustion after the heat = 1 dispatch, trial arranged, Not Interested declaration, merge-driven snap when result is Not Interested, `enquiry_status` reverting to Disqualified, etc.) — the current state is implied by the qualification, trial, and `pipeline_status` fields on `families`, `contacts`, and `learners`.

| Field | Type | Default | When populated |
|---|---|---|---|
| `id` | bigint PK IDENTITY | — | On creation |
| `family_id` | bigint FK | null | Populated for age and location channel changes |
| `learner_id` | bigint FK | null | Populated for pre_trial, missed_trial, cancelled_trial channel changes |
| `contact_id` | bigint FK | null | Populated for phone channel changes |
| `channel` | text | — | **Active:** 'age' / 'location' / 'phone' / 'pre_trial'. **Deferred** (defined for future migration, no rows under current scope): 'missed_trial' / 'cancelled_trial' — see Post-Trial Airtable Handoff |
| `old_heat` | numeric | — | Previous heat value |
| `new_heat` | numeric | — | New heat value after change |
| `dispatched` | boolean | false | true once the customer-facing follow-up message for this drop has been sent. For learner-level channels this includes coalesced sibling rows — see Per-family dispatch coalescing in Heat Mechanism: if learner A's row triggered the dispatch and learner B (same family, same channel, same `new_heat`, within the coalescing window) was in the group, BOTH rows get `dispatched = true` even though only one outbound message was actually sent. `false` has two distinct meanings — disambiguate by checking `dispatch_error`: `(false, null)` = either pending dispatch OR no matching `follow_up_triggers` row exists for `(channel, new_heat, country, platform)` (dead drop, no template configured for this resolved tuple); `(false, <error>)` = dispatch attempted and failed |
| `dispatch_error` | text | null | Error detail if dispatch failed. Null means no dispatch attempted yet OR dispatch succeeded |
| `changed_at` | timestamptz | now() | On creation |

> Exactly one of `family_id`, `learner_id`, `contact_id` is populated per row depending on `channel`.

---

### `operation_logs`

Audit trail for key workflow events. Created every time a workflow trigger fires. Never updated — append-only.

| Field | Type | Default | When populated |
|---|---|---|---|
| `id` | bigint PK IDENTITY | — | On creation |
| `family_id` | bigint FK | null | Set for family-level operations |
| `learner_id` | bigint FK | null | Set for learner-level operations |
| `contact_id` | bigint FK | null | Set for contact-level operations |
| `source` | text | null | Channel that triggered the operation: 'Facebook Messenger' / 'Instagram Messenger' / 'WhatsApp' |
| `source_id` | text | null | Platform-specific ID of the triggering message |
| `operation` | text | — | **Active under current scope** (CRM emits these): 'family_created' / 'family_qualified' / 'family_disqualified' / 'trial_arranged' / 'not_interested' / 'cross_channel_merge' / 'age_eligible_push' / 'age_requalified_push' / 'location_requalified_push'. **Deferred** (defined for future migration, never emitted under current scope — Scenarios 4/5/6 are Airtable-managed): 'trial_done' / 'missed_trial' / 'trial_cancelled'. See Post-Trial Airtable Handoff |
| `status` | text | — | 'Success' / 'Failed' / 'Skipped' (Skipped used when the Engagement Guard or another business rule prevented the action from running — see `detail` for the reason) |
| `detail` | text | null | Additional context or error message |
| `created_at` | timestamptz | now() | On creation |

---

### `follow_up_triggers`

Defines which message template to send when heat drops to a specific value on a specific channel. Decoupled from timing — changing `heat_schedule_config` changes when it fires, not what fires.

| Field | Type | Default | When populated |
|---|---|---|---|
| `id` | bigint PK IDENTITY | — | On creation |
| `channel` | text | — | **Active:** 'age' / 'location' / 'phone' / 'pre_trial'. **Deferred** (defined for future migration, no rows under current scope): 'missed_trial' / 'cancelled_trial' — see Post-Trial Airtable Handoff |
| `heat_value` | integer | — | The heat value that triggers this message. Valid range: **1, 2, 3, or 4** — corresponds to the drop target (5→4 dispatches at `heat_value = 4`, 4→3 at 3, 3→2 at 2, 2→1 at 1). `heat_value = 5` is invalid — activation events (null→5) are explicitly skipped per Heat Mechanism, so a row at 5 would never fire |
| `country` | text | — | 'SG' / 'MY' / 'ID' — one row per country. Allows different templates per country at the same heat level |
| `platform` | text | — | `'Facebook Messenger'` / `'Instagram Messenger'` / `'WhatsApp'` — which delivery API this trigger dispatches through. The dispatcher derives the target platform from contact state per Dispatch Routing in Heat Mechanism (pre-phone → contact's source channel; post-phone → WhatsApp), then matches a trigger row on `(channel, heat_value, country, platform)`. Pre-phone qualification heats (`age`, `location`, `phone`) need rows for `'Facebook Messenger'`, `'Instagram Messenger'`, AND `'WhatsApp'` (the qualification heat can fire on any entry channel). Learner-level channels (`pre_trial`, `missed_trial`, `cancelled_trial`) only need `'WhatsApp'` rows — they fire post-qualification, when phone is always present |
| `template_id` | bigint FK | — | Links to `message_templates` — the message to send. The linked template's `platform` should match this row's `platform` (template content differs across APIs — WhatsApp requires pre-approved templates, FB Messenger / IG inbox have different format constraints) |
| `active` | boolean | true | Disable without deleting |

> When `heat_change_log.new_heat = follow_up_triggers.heat_value` for matching `channel`, `country`, AND `platform` (resolved per Dispatch Routing in Heat Mechanism) → dispatch the linked template. **Activation events (`old_heat = null`) are skipped** — only drop events (5→4 down to 2→1) dispatch templates. `heat_change_log` has no `country` field — resolve country by JOINing to `families` (age/location channels), `contacts` (phone channel), or `learners → families` (pre_trial/missed_trial/cancelled_trial channels). **For learner-level channels, coalesce per family before dispatch** — see Per-family dispatch coalescing in Heat Mechanism. The dispatcher groups pending drops by `(family_id, channel, new_heat)` within the coalescing window and sends ONE message per group via the primary contact. **Dispatch is implicitly safe with respect to Not Interested families** — heats are never activated for them, and any path that would acquire heat on a Not Interested family snaps it to 0 (see Engagement Guard in Qualification Rules).

> **Unique constraint:** `(channel, heat_value, country, platform)` — one trigger per channel/heat level/country/platform combination.

---

### `heat_schedule_config`

Controls the timing of heat drops per channel. Change `wait_minutes` here to adjust follow-up cadence without touching any workflow logic.

| Field | Type | Default | When populated |
|---|---|---|---|
| `id` | bigint PK IDENTITY | — | On creation |
| `channel` | text | — | **Active:** 'age' / 'location' / 'phone' / 'pre_trial'. **Deferred** (defined for future migration, no rows under current scope): 'missed_trial' / 'cancelled_trial' — see Post-Trial Airtable Handoff |
| `from_heat` | integer | — | Current heat value to schedule the next drop from. Valid range: **5, 4, 3, or 2** — schedules drops 5→4, 4→3, 3→2, 2→1 respectively. `from_heat = 1` is invalid — after the `heat = 1` follow-up dispatches, heat snaps to 0 as terminal state (no further drop scheduled). E.g. `from_heat = 5, wait_minutes = 60` means "wait 60 minutes after heat is set to 5 before dropping to 4" |
| `wait_minutes` | integer | — | Minutes to wait before dropping heat by 1 |
| `country` | text | — | 'SG' / 'MY' / 'ID' — allows different follow-up timing per country |
| `active` | boolean | true | Disable without deleting |
| `updated_at` | timestamptz | now() | Updated when config changes |

> **Unique constraint:** `(channel, from_heat, country)` — one timing config per channel/heat level/country combination.

---

### `message_templates`

Library of message templates used by the heat engine and manual sends.

| Field | Type | Default | When populated |
|---|---|---|---|
| `template_id` | bigint PK IDENTITY | — | On creation |
| `content` | text | — | Message body |
| `explanation` | text | null | Internal note on when/why to use this template |
| `category` | text | null | Organizational tag for filtering. Categories used in the spec: **active** heat-engine channels (`'age'` / `'location'` / `'phone'` / `'pre_trial'`), re-qualification outreach (`'age_requalification'` / `'location_requalification'`), age eligibility push (`'age_eligible_push'`). **Deferred** categories (defined for future migration; templates may exist but are never dispatched under current scope): `'missed_trial'` / `'cancelled_trial'`. New categories can be added as the system grows |
| `country` | text | null | null = applies to all countries. Set to restrict to specific country |
| `platform` | text | null | null = all platforms. 'WhatsApp' / 'Facebook Messenger' / 'Instagram Messenger' if platform-specific |

---

### `pools`

Lookup table for all swimming pool locations. Referenced by `trials` and `enrollments`. Malaysia and Indonesia entries to be added when lists are provided.

| Field | Type | Default | Notes |
|---|---|---|---|
| `pool_id` | bigint PK IDENTITY | — | On creation |
| `pool_name` | text | — | e.g. 'Bishan', 'Sengkang' |
| `country` | text | — | 'SG' / 'MY' / 'ID' |
| `active` | boolean | true | Retire without deleting |

**Singapore pools (current):** Bishan, Sengkang, Pasir Ris, Jurong West, Clementi, Bukit Canberra

---

### `coaches`

Lookup table for all coaches. Referenced by `trials` and `enrollments`. Malaysia and Indonesia entries to be added when lists are provided.

| Field | Type | Default | Notes |
|---|---|---|---|
| `coach_id` | bigint PK IDENTITY | — | On creation |
| `coach_name` | text | — | e.g. 'Don', 'Ben' |
| `country` | text | — | 'SG' / 'MY' / 'ID' |
| `active` | boolean | true | Retire without deleting |

**Singapore coaches (current):** Don, Ben, Sky, Derek, Fabian, Fredy

---

## Multi-Country Architecture

This platform serves multiple countries from a single backend with per-country front-ends.

- `country` on `families` and `contacts` identifies the customer's country. `country` also appears on `pools`, `coaches`, `follow_up_triggers`, `heat_schedule_config`, `package_pricing`, and `message_templates` as a filter/config dimension. `message_templates.country` has special "null = all countries" semantic for cross-country templates
- Enables row-level security (RLS) per country in Supabase via `families.country`
- Pricing is managed per country in `package_pricing`
- Reporting and analytics filter by country via `families.country`

---

## Heat Mechanism

- **Family/contact heats** (`age_heat`, `location_heat`, `phone_heat`): start at **5** on contact creation (or **0** if already resolved — e.g. WhatsApp phone). No `heat_change_log` entry for the initial set to 5
- **Learner heats** (`pre_trial_heat`, `missed_trial_heat`, `cancelled_trial_heat`): start at **null** — activated at specific lifecycle events. **Under current scope, only `pre_trial_heat` is ever activated** — via Central Trigger → 'Qualified' transition OR Age Eligibility Push (when an aging-in learner joins a family that was already Qualified). `missed_trial_heat` and `cancelled_trial_heat` are **deferred** (Scenarios 4 / 5 are Airtable-managed — see Post-Trial Airtable Handoff); their eventual activation triggers would be: `missed_trial_heat` activates when trial marked missed, `cancelled_trial_heat` activates when trial cancelled (immediately or on `cancelled_followup_date`). A `heat_change_log` entry (null→5) is created when each activates
- Heat engine drops active heats: **5 → 4 → 3 → 2 → 1** based on time elapsed (configured in `heat_schedule_config`)
- Every drop creates a `heat_change_log` record and checks `follow_up_triggers` for a matching template to send
- **Activation events (null→5) do NOT trigger `follow_up_triggers` matches** — only drop events (5→4, 4→3, etc.) do. Activation is purely a state change; the first follow-up always fires on the first drop. This prevents double-messaging when re-qualification outreach fires alongside `pre_trial_heat` activation
- **Per-family dispatch coalescing for learner-level channels:** `pre_trial_heat`, `missed_trial_heat`, and `cancelled_trial_heat` are tracked per learner (each learner has independent state — callback dates, trial arrangements, twin handling) but **dispatched per family**. If multiple learners in the same family drop on the same channel to the same heat value within a short window (default 5 minutes — coalescing window, separate from `heat_schedule_config.wait_minutes`), only ONE outbound message is sent to the primary contact. This prevents a parent with two qualified kids receiving two identical pre-trial follow-ups. Implementation: the dispatcher's idempotency key for learner-level channels is `(family_id, channel, new_heat)` — derived via `heat_change_log.learner_id → learners.family_id`. The first row in the coalesced group dispatches; all other rows in the group are marked `dispatched = true` as well (the dispatched semantic is "the customer-facing message for this drop event went out, possibly via a sibling's row"). Family-level channels (`age`, `location`, `phone`) already have one row per family/contact and don't need coalescing
- **Heat snaps to 0** (no `heat_change_log` entry, push stops on that channel) in multiple cases: (a) field qualifies — `age_qualification` / `location_qualification` / `phone_qualification` resolves; (b) terminal exhaustion — see Terminal snap-to-0 below; (c) **learner-level trial-status transition away from `'Yet to Arrange'`** — `pre_trial_heat` snaps for the affected learner only (not the family): `'Trial Arranged'` (Step 7), `'Not Interested in Trial'` (learner-level decline sub-case), `'Future Trial'` (long-term defer sub-case). Sibling learners' `pre_trial_heat` is untouched. The deferred missed/cancelled re-trial snap rules would apply if/when Scenarios 4/5 are activated; (d) contact says Not Interested — family qualification heats (`age_heat`, `location_heat`), ALL active learner heats, AND ALL contact `phone_heat` rows on the family snap (per Engagement Guard, Scenario 1 Step 6; the deferred Scenarios 4/5 Not-Interested branches would do the same when activated); (e) cross-channel merge resulting in Not Interested — same snap set on surviving family (`age_heat`, `location_heat`, all learner heats, all contact `phone_heat` — per merge Step 6); (f) `enquiry_status` flips to Disqualified — `pre_trial_heat` snaps for previously-qualified learners, and qualification heats (`age_heat`, `location_heat`, ALL contacts' `phone_heat`) snap to halt the heat engine on the now-Disqualified family per Transition → Disqualified step 4; (g) admin direct flip of `pipeline_status` to `'Not Interested'` via admin UI — same snap set as case (d), implemented at the admin UI layer or via DB trigger (see Engagement Guard)
- **Terminal snap-to-0:** After the `heat = 1` follow-up dispatches and no further drops are scheduled, heat snaps to 0 as a terminal state. This makes `heat = 0` the unified "no more follow-ups" signal across all channels (whether reached via qualification or via exhausted follow-up sequence). Disambiguate by checking the corresponding qualification or status field
- `follow_up_triggers` defines which message template to send per channel per heat level per country

### Dispatch Routing — which push API to use

Every outbound push (heat-engine follow-up, Re-qualification Outreach, Age Eligibility Push) targets the primary contact of the family. The delivery API is determined by contact state at dispatch time:

- **`contacts.phone_number IS NOT NULL`** (phone collected) → dispatch via **WhatsApp Business API**. Under current scope this covers `pre_trial_heat` follow-ups, Re-qualification Outreach, and Age Eligibility Push. (When the deferred `missed_trial_heat` / `cancelled_trial_heat` re-engagement flows are eventually activated post-Airtable-migration, they also route via WhatsApp by the same rule.) WhatsApp entry contacts (Scenario 3) qualify here from first message.
- **`contacts.phone_number IS NULL`** (phone not yet collected — only possible on Facebook or Instagram entry, Scenarios 1 / 2) → dispatch via the contact's `contact_source` channel:
  - `contact_source = 'Facebook Messenger'` → **Facebook Messenger push API** (using `contacts.facebook_id` as recipient)
  - `contact_source = 'Instagram Messenger'` → **Instagram inbox push API** (using `contacts.instagram_id` as recipient)
  
  This covers pre-phone qualification heats only — `age_heat`, `location_heat`, and `phone_heat` follow-ups while the family is still in Inquiry / Yet to Qualify.

The dispatcher resolves target `platform` from this rule, then selects the matching template via `follow_up_triggers.platform` (see that table's field def). Templates need platform-specific variants because the APIs have different format constraints (WhatsApp requires pre-approved templates; FB Messenger and IG inbox have their own message structures).

**Why phone presence is the switch, not `contact_source`:** A Facebook contact who provides phone in Step 5 has `contact_source = 'Facebook Messenger'` AND `phone_number IS NOT NULL`. Per this rule they route via WhatsApp from that point onward — which matches the fact that `enquiry_status` flips to Qualified at the same moment and all subsequent outreach (Re-qualification Outreach, `pre_trial_heat`) is WhatsApp-only by template definition. First-touch attribution stays on `contact_source` for CAC; routing follows current channel reachability.

---

## Cross-Channel Deduplication

### At point of contact

Every inbound message triggers a dedup check on `contacts` before any record is created:

| Step | Check | Action if found |
|---|---|---|
| 1 | `contacts.facebook_id` / `instagram_id` = [platform ID] (telegram_id and tiktok_id are reserved for future channels — see contacts field defs) | Known contact — UPDATE `last_customer_reply_time`, CREATE `conversations` (inbound), then route per Returning Contacts policies (Not Interested → pause AI, surface to admin → Disqualified → AI extraction-only mode → default → reset YtoQ heats and proceed) |
| 2 | `contacts.phone_number` = [phone] (WhatsApp entry) | Known contact — UPDATE `last_customer_reply_time`, CREATE `conversations` (inbound), then route per Returning Contacts policies (Not Interested → pause AI, surface to admin → Disqualified → AI extraction-only mode → default → reset YtoQ heats and proceed) |
| 3 | No match | New contact — CREATE `families` + `contacts` + `conversations` + `operation_logs` per Step 1 of the matching scenario |

### During conversation — phone number collected (Facebook / Instagram)

When AI collects a phone number already in `contacts.phone_number`:

> **Transactional boundary:** Steps 1–10 below execute as ONE atomic database transaction. Partial merge state (e.g. learners moved but family-level fields not yet merged) would leave the data model inconsistent and break downstream queries. Step 11 (admin notification) runs after commit. External side effects from Step 9's Central Trigger run (Re-qualification Outreach push, if applicable) also happen after commit, following the standard scenario-step rule.

1. Identify surviving contact (existing record with matching phone) and its family
2. UPDATE surviving contact — add new channel ID (e.g. `facebook_id`) if not present. **Preserve first-touch attribution:** if `duplicate.contact_created_date < surviving.contact_created_date`, also UPDATE surviving SET `contact_created_date = duplicate.contact_created_date`, `contact_source = duplicate.contact_source`. This handles the case where the earlier contact is the one currently collecting the phone (e.g. Facebook touch on Day 1 → WhatsApp touch on Day 5 → Facebook collects phone on Day 7; without this rule, the WhatsApp Day 5 contact would survive and the original Day 1 Facebook first-touch would be lost). The surviving `contact_id` stays as the existing record (to avoid restructuring FK relinking), but the attribution metadata reflects the earlier touch
3. UPDATE `conversations` WHERE `contact_id` = [duplicate contact_id] → set `contact_id` = [surviving contact_id], `family_id` = [surviving family_id]
4. **Merge learners** — both families represent the same household:
   - Match learners across both families by `learner_age` (and `learner_name` if both sides have it set — names break ties for same-age siblings)
   - **Ambiguous match guard:** if either side has 2+ learners at the same age AND `learner_name` is null on at least one of those records (so name can't break the tie), do NOT auto-match those learners. Move ALL duplicate-side learners at that age to surviving via `UPDATE learners.family_id = [surviving family_id]` (treating them as unmatched) and surface to admin to manually consolidate twins/siblings post-merge. This prevents silent fusion of distinct same-age siblings (e.g. twins) into one record
   - For each matched pair: keep the record with more complete information (more fields populated, more recent `updated_at`). UPDATE any learner-level FK references (`trials.learner_id`, `heat_change_log.learner_id`, `operation_logs.learner_id`, `enrollments.learner_id`, `invoice_items.learner_id`) to point to the surviving learner. DELETE the other learner record
   - For unmatched learners (no age match in surviving family, or skipped by the ambiguous-match guard above): UPDATE `learners.family_id` = [surviving family_id]
   - **Edge case — both records have unique non-null fields** (e.g. surviving has `pre_trial_heat = 3`, duplicate has `learner_name = 'Bob'` and `trial_status = 'Trial Arranged'`): record-level keep would drop data. Surface to admin for cell-level merge — keep the auto-chosen record but flag the conflicting fields for manual reconciliation
5. **Snapshot the surviving family's pre-merge state** — capture `previous_age_qualification`, `previous_location_qualification`, and `previous_pipeline_status` BEFORE any family-level writes. These feed Re-qualification Outreach template selection in Step 9 (the diff between pre-merge and post-merge qualifications tells us which field flipped from `'Disqualified'` to `'Qualified'`) and pipeline_status max-stage merge in Step 6. Also capture `previous_enquiry_status` for the `operation_logs` detail field — useful for debugging merge-driven qualifications.
6. **Merge family-level fields onto the surviving family.** Fields covered: `family_name`, `preferred_location`, `confirmed_location`, `location_qualification`, `age_qualification`, `state`. For each field, apply exactly one of these rules:
   - Surviving is null or `'Yet to Qualify'` → copy the duplicate's value onto the surviving family
   - Surviving and duplicate have the same value → no-op
   - Surviving is `'Qualified'` / `'Disqualified'` AND duplicate has a different non-null value (e.g. surviving `'Disqualified'`, duplicate `'Qualified'`) → keep the surviving family's value and surface to admin for review

   **This prevents silent loss of data the AI collected on the duplicate side** (e.g. a location given on Facebook before merging with a WhatsApp-side surviving family that had no location).

   **`pipeline_status` merge (max-stage rule):** stage ordering is `'Inquiry'` → `'Lead'` → `'Trial Arranged'` → `'Trial Done'` → `'Pending Sign Up'` / `'Considering'` → `'Enrolled'`. Set surviving `pipeline_status` to the further-along stage across both sides (e.g. surviving `'Inquiry'`, duplicate `'Trial Arranged'` → surviving becomes `'Trial Arranged'` to reflect the merged-in trial record). **`'Not Interested'` wins:** if either side has `pipeline_status = 'Not Interested'`, set surviving to `'Not Interested'` (it's a terminal signal — the contact said no, and we respect that across the merge). The heat-activation guard in Transition → 'Qualified' step 3 prevents any pre_trial_heat activation while pipeline is `'Not Interested'`. **AND if surviving's final pipeline_status is `'Not Interested'` (whether newly set by this merge or already was), snap ALL active heats on the surviving family to 0:** family qualification heats (`age_heat`, `location_heat`) on the surviving family if still non-zero, all learner heats (`pre_trial_heat`, `missed_trial_heat`, `cancelled_trial_heat`) on every learner under the surviving family, AND all contact-level `phone_heat` on every contact under the surviving family (covers duplicate-side contacts moved over in Step 8 with their phone_heat still ticking). Snap to 0, no `heat_change_log` entries. This is critical because the duplicate's learners might have had active missed_trial_heat / cancelled_trial_heat tickers (when those scenarios are eventually activated) that carry over via Step 4's keep-most-complete rule, AND duplicate-side non-primary contacts may bring their own ticking `phone_heat` — without these snaps, the heat engine would continue dispatching re-engagement messages and phone-collection prompts to a Not Interested family.

   **Cascade to learners:** after the family-level write, UPDATE `learners.location_qualification = families.location_qualification` for ALL learners under the surviving family (both pre-existing and merged-in). This keeps the denormalized copy in sync.

   **Heat field handling:**
   - Family-level heats on the surviving family (`age_heat`, `location_heat` and their `_date` companions) are intentionally NOT merged — they reflect engagement state on the surviving family's channel and shouldn't be inherited from the duplicate
   - `contacts.phone_heat` is preserved on the surviving contact (no merge needed — it lives on `contacts`, not `families`)
   - Learner-level heats (`pre_trial_heat`, `missed_trial_heat`, `cancelled_trial_heat`) follow the surviving learner record per Step 4's keep-most-complete rule

   **Central Trigger is suppressed during these writes** — even though `age_qualification` and `location_qualification` change here, do not fire Central Trigger automatically per-field. It runs explicitly in Step 9 with `reason = 'merge'` and the captured snapshot.
7. **Relink family-level and contact-level FK references on the duplicate** — before deletion, repoint these to the surviving counterparts so audit history is preserved:
   - `heat_change_log.family_id` = [surviving family_id] WHERE family_id = [duplicate]
   - `heat_change_log.contact_id` = [surviving contact_id] WHERE contact_id = [duplicate]
   - `operation_logs.family_id` = [surviving family_id] WHERE family_id = [duplicate]
   - `operation_logs.contact_id` = [surviving contact_id] WHERE contact_id = [duplicate]
   - `trials.family_id` = [surviving family_id] WHERE family_id = [duplicate]
   - `invoices.family_id` = [surviving family_id] WHERE family_id = [duplicate]
   - `enrollments.family_id` = [surviving family_id] WHERE family_id = [duplicate] (not exercised by current CRM scenarios — `enrollments` is Airtable-driven today — but the relink must exist now so the merge flow stays correct after Airtable migration)

   `invoice_items` and `payments` have no direct `family_id` — they reach family transitively through `invoices.family_id` (relinked above) and don't need a separate UPDATE.

   Without this relinking, Step 8's deletes would either cascade-delete the audit history or leave dangling FK references.
8. **Move any OTHER contacts on the duplicate family to surviving family** — `UPDATE contacts.family_id = [surviving family_id] WHERE family_id = [duplicate] AND contact_id != [merging duplicate contact_id]`. Handles the case where the duplicate family already had additional household members (e.g. spouse messaged earlier on the duplicate side). For each moved contact, also `UPDATE contacts.is_primary_contact = false` if surviving family already has a primary contact (preserves the partial unique constraint `UNIQUE (family_id) WHERE is_primary_contact = true`). **Also relink their conversations:** `UPDATE conversations.family_id = [surviving family_id] WHERE contact_id IN (<the moved contacts' IDs>)` — the denormalized `family_id` on `conversations` must reflect their new family for family-level history queries to remain correct. (Conversations for the merging duplicate contact were already relinked in Step 3.) Then DELETE the merging duplicate contact record, then DELETE the duplicate family record (now empty after moves and deletes)
9. **Re-evaluate qualification state on surviving family** — run Central Trigger with `reason = 'merge'`, passing the Step 5 snapshot. Central Trigger uses the current `families.enquiry_status` (unchanged by Step 6 writes) as its "previous" value for the transition check. Re-qualification Outreach fires per the standard rule (previous was `'Disqualified'`, current is `'Qualified'`) and reads `previous_age_qualification` / `previous_location_qualification` from the snapshot to pick the template.
10. CREATE `operation_logs` (`cross_channel_merge`, `family_id = surviving_family_id`, `detail = "{previous_enquiry_status} → {current enquiry_status}"` using the Step 5 snapshot value — gives queryable audit of which merges drove qualification changes)
11. Surface admin notification

**Edge case:** Two people sharing a phone number, or ambiguous learner matching — admin can manually review and undo.

### Returning contacts

- Do NOT create a new `families` or `contacts` record
- Only reset heat for fields with `qualification = 'Yet to Qualify'`. Reset both the heat value (to 5) AND the `_date` companion (to `now()`) so the heat engine schedules drops fresh from this moment. Do not reset heats for fields that are `'Qualified'` (they stay at 0) or `'Disqualified'` (they stay at 0)
- Typically at most one field will be unresolved when a contact returns — contacts who dropped off very early may have multiple unresolved fields (a Facebook lead who only sent one message could have age, location, AND phone all unresolved). Reset heats for all of them
- **Trial heats (`pre_trial_heat`, `missed_trial_heat`, `cancelled_trial_heat`) are NOT reset on return** — even if they previously exhausted to terminal 0. The inbound conversation IS the engagement; the AI handles trial-arranging in real time, and any active `pre_trial_heat` snaps to 0 when a trial is arranged (per Scenario 1 Step 7, inherited by Scenarios 2/3). The same rule would apply to `missed_trial_heat` / `cancelled_trial_heat` under the deferred Scenarios 4/5. Resetting a terminal-zero trial heat would re-fire already-sent templates that overlap with the live AI conversation
- `contacts.contact_source` and `contacts.contact_created_date` never updated under ordinary returning-contact flow — first-touch preserved. (Cross-channel merge has a separate first-touch rule that can overwrite these on the surviving contact if the duplicate is older — see merge Step 2)

**Returning contact with `enquiry_status = 'Disqualified'`:** AI runs in **extraction-only mode** (defined in Transition → Disqualified step 6). Log the inbound to `conversations` per the dedup rule. Do NOT reset any heats (they all stayed at 0 since Disqualification). AI parses the inbound for re-qualification signals only — no conversational reply by default. Two outcomes:

- **Re-qualification signal found** — two sub-cases:
  - *Older sibling mentioned* (e.g. *"I have an older daughter, she's 8"*): CREATE `learners` row with `learner_age = 8` AND UPDATE `families.age_qualification` per the field's recompute rule (`'Qualified'` if at least one learner ≥ 4) — same pattern as Scenario 1 Step 3, but happening on a returning Disqualified inbound rather than the original ages-collection step.
  - *Location now serviced* (e.g. *"we moved to Bishan"* and Bishan matches an active pool): UPDATE `families` SET `preferred_location`, `confirmed_location`, `location_qualification = 'Qualified'`, and cascade `learners.location_qualification` for every learner under this family — same pattern as Scenario 1 Step 4.

  Either write fires Central Trigger, which may flip `enquiry_status` back to `'Qualified'` (or `'Yet to Qualify'` if only some conditions resolved). When the flip happens, AI re-enables full conversational mode. **Two outbound sub-cases per the double-message guard** (defined in Transition → Disqualified step 6): if flip was `Disqualified → Qualified` → Re-qualification Outreach templated push goes out, AI's own composed reply is SUPPRESSED for this turn (to avoid two back-to-back messages); AI resumes normal replies on the NEXT inbound. If flip was `Disqualified → Yet to Qualify` (only some conditions resolved, no Re-qualification Outreach fires) → AI composes and sends its reply this turn.
- **No re-qualification signal** (just a generic message, a question, or info that doesn't change qualification state): AI stays silent. Inbound is logged; no reply.

This automatic detection handles the common re-qualification cases (older sibling mentioned, location moved to a serviced area) without requiring admin intervention. The date-driven re-qualification paths (Age Eligibility Push, Location Expansion) continue to fire independently of inbound messages.

**Returning contact with `pipeline_status = 'Not Interested'`:** do NOT auto-engage. The contact previously gave an explicit "no" — respecting that requires human judgment. Pause the AI for this conversation, log the inbound message in `conversations` per the dedup rule, and surface to admin for review. Admin decides whether to re-open the lead (manually bump `pipeline_status` back to an active stage like `'Lead'` or `'Trial Arranged'`, depending on context) or leave it as-is. **If admin re-opens**, admin should also manually re-activate `pre_trial_heat = 5` on all qualified learners (`is_qualified_learner = true`) in the family — this is the inverse of the snap-when-Not-Interested rule (the Engagement Guard snapped heats to 0; admin re-open un-pauses engagement). Implement as an admin UI button that does both updates atomically.

---

## Qualification Rules

This section defines the central state machine for `families.enquiry_status` and the downstream effects on `pipeline_status` and `pre_trial_heat`. **All scenarios reference this section rather than repeating the logic.**

### Engagement Guard: `pipeline_status = 'Not Interested'`

> **Related gate — Disqualified state:** the spec defines a separate engagement gate for `enquiry_status = 'Disqualified'` (AI runs in extraction-only mode; all qualification heats snapped; no heat-engine pushes can fire because there's nothing for the engine to dispatch). The two gates are distinct: Not Interested = contact explicitly declined → full AI pause + admin surfacing; Disqualified = structural ineligibility → AI extraction-only mode + heat snap. See **Transition → Disqualified** for the Disqualified gate's full mechanics. Both gates may apply simultaneously to the same family (rare); the Step 1 dedup precedence in each scenario handles Not Interested first.

**All engagement triggers MUST check `families.pipeline_status != 'Not Interested'` before firing any customer-facing action:**
- `pre_trial_heat` activation (Transition → 'Qualified' step 3, Age Eligibility Push heat activation)
- Re-qualification Outreach push (Transition → 'Qualified' step 4)
- Age Eligibility Push send (`age_eligible_push` template)
- Heat-engine-dispatched follow-ups (implicit for scenario-driven and merge-driven Not Interested — `pre_trial_heat` is gated at activation, and the "contact says Not Interested" branch of Scenario 1 Step 6 (inherited by Scenarios 2/3) snaps the full set: family qualification heats (`age_heat`, `location_heat`), all active learner heats across ALL learners, AND all contact `phone_heat` rows. The deferred Scenarios 4 (post-missed-trial Not Interested) and 5 (post-cancellation Not Interested) would do the same when activated. Merge Step 6 does the same when result is Not Interested. **Admin direct updates of `pipeline_status` to `'Not Interested'` via admin UI MUST also snap all active heats on affected families** — family qualification heats (`age_heat`, `location_heat`) on the family if non-zero (catches Inquiry-stage admin flips where qualification was unresolved), all learner heats (`pre_trial_heat` plus `missed_trial_heat` / `cancelled_trial_heat` once activated) AND all contact `phone_heat` rows under the family. Implement at the admin UI layer or via DB trigger)

State transitions still happen (enquiry_status flips are recorded for audit) — **only the customer-facing action is suppressed.** This respects an explicit "no" from the contact while keeping the data model consistent.

**Skip logging:** when the Guard blocks a push, CREATE an `operation_logs` entry with the matching push operation value (e.g. `'age_requalified_push'`, `'location_requalified_push'`, `'age_eligible_push'`), `status = 'Skipped'`, and `detail = 'guard: pipeline_status = Not Interested'`. Populate the same FK fields as the successful version of that operation:
- `age_eligible_push` skip: `learner_id` + `family_id`
- `age_requalified_push` / `location_requalified_push` skip: `family_id`

This makes guard-blocked events queryable — ops can count "how many pushes did this Location Expansion would have sent vs. actually sent" without parsing application logs.

Each guard site below repeats the check inline for local clarity, but they all enforce this single rule.

### Central trigger

**When to evaluate:** After any change to any of:
- `families.age_qualification`
- `families.location_qualification`
- primary `contacts.phone_qualification` (WHERE `family_id = X AND is_primary_contact = true`)

**Contract:** the calling context passes a `reason` parameter identifying which field's change is firing the trigger. Values: `'age'`, `'location'`, `'phone'`, `'merge'` (cross-channel merge). The reason is forwarded to Re-qualification Outreach when applicable so it can pick the right template. For ordinary message-driven flows (e.g. Facebook Step 3 fires reason = 'age'), the reason is the field that just changed.

**Suppression:** callers performing batch writes that change multiple qualification fields in one transaction (e.g. cross-channel merge Step 6) MUST suppress automatic per-field firing and instead call Central Trigger explicitly once at the end of the transaction. Don't wire an after-update DB trigger that fires unconditionally — that would misfire during batch operations.

**Re-evaluation:** compute the new `enquiry_status` from the three inputs by checking these rules in order — the first matching rule wins:

1. **`'Qualified'`** — if `age_qualification = 'Qualified'` AND `location_qualification = 'Qualified'` AND primary `phone_qualification = 'Qualified'`
2. **`'Disqualified'`** — if `age_qualification = 'Disqualified'` OR `location_qualification = 'Disqualified'`
3. **`'Yet to Qualify'`** — default (any other combination, e.g. one or more fields still pending collection)

(Phone has no `'Disqualified'` state — only `'Yet to Qualify'` or `'Qualified'`.)

If the newly computed `enquiry_status` differs from the current value, apply the matching transition below:

### Transition: → `'Qualified'`

Fired when all 3 qualifications are met (from either `'Yet to Qualify'` or `'Disqualified'`).

1. UPDATE `families` SET `enquiry_status = 'Qualified'`. Also SET `pipeline_status = 'Lead'` only if current `pipeline_status = 'Inquiry'` — otherwise leave it (e.g. a re-qualified family at `'Trial Arranged'` stays there)
2. For each learner in the family, re-evaluate `is_qualified_learner`:
   - true if `learner_age ≥ 4` AND `families.location_qualification = 'Qualified'` AND primary contact `phone_qualification = 'Qualified'`
   - false otherwise (e.g. `learner_age < 4` — `learner_eligible_date` is set for future activation via Age Eligibility Push)
3. For each learner whose `is_qualified_learner` JUST became true (was false → true) — AND `families.pipeline_status != 'Not Interested'` (guard: if the family is `'Not Interested'`, the qualification flip is recorded but heat does NOT activate; respects the contact's prior "no" even when later signals would re-qualify them):
   - UPDATE `learners` SET `pre_trial_heat = 5`, `pre_trial_heat_date = now()`
   - CREATE `heat_change_log` (`learner_id`, `channel = 'pre_trial'`, `old_heat = null`, `new_heat = 5`)
4. If the previous `enquiry_status` was `'Disqualified'` AND `families.pipeline_status != 'Not Interested'` (Engagement Guard) → fire **Re-qualification Outreach** (see below) BEFORE the heat engine sends its first follow-up. If `pipeline_status = 'Not Interested'`, the enquiry_status flip is still recorded for audit but no outreach push is sent — critical for cases like Location Expansion blasting a newly-opened pool to all previously-disqualified families, which could include ones who said "not interested".
5. CREATE `operation_logs` (`family_qualified`, `family_id`)

### Transition: → `'Disqualified'`

Fired when age becomes Disqualified (all learners < 4) or location becomes Disqualified (not served). **Policy: end conversational engagement with the customer.** AI sends one final explanatory message during the step that caused the Disqualification (e.g. *"Sorry, we don't serve Tampines yet"*) and then switches to extraction-only mode. The heat engine is silenced by snapping every remaining active heat. **Three re-engagement paths exist**, all of which automatically re-enable full AI mode and may fire Re-qualification Outreach: (1) **Age Eligibility Push** — date-driven, when a previously-under-4 stored learner ages in; (2) **Location Expansion** — admin-driven, when a new pool opens and admin updates affected families' `location_qualification`; (3) **AI extraction-only mode on returning inbound** — when the contact volunteers info that re-qualifies the family (older sibling mentioned, location now serviced) on a future message, the AI's narrow extraction scan picks it up and flips state automatically. None of these require admin intervention.

1. UPDATE `families` SET `enquiry_status = 'Disqualified'`
2. If `pipeline_status = 'Lead'` (i.e. we had previously qualified) → SET `pipeline_status = 'Inquiry'`
3. **If any learners had `is_qualified_learner = true`** (i.e. family was previously `'Qualified'` and `pre_trial_heat` was active): UPDATE those learners SET `is_qualified_learner = false`, `pre_trial_heat = 0`, `pre_trial_heat_date = now()` (snap to 0 — no `heat_change_log` entry). This stops the heat engine from continuing to send pre-trial follow-ups to a now-disqualified family. **Most disqualifications fire from `'Yet to Qualify'` (e.g. ages come in and all are < 4), where no learner had `is_qualified_learner = true` and this step is a no-op.**
4. **Snap all remaining family/contact qualification heats to 0.** UPDATE `families` SET `age_heat = 0` (if non-zero), `location_heat = 0` (if non-zero). UPDATE **all** `contacts` rows under this family (not just primary) SET `phone_heat = 0` (if non-zero) — non-primary contacts can exist via prior cross-channel merge and may have their own ticking `phone_heat` that the heat engine would otherwise keep dispatching to. The triggering qualification field's heat was already snapped at the field-write step (e.g. Scenario 1 Step 3 snaps `age_heat` when `age_qualification` is set), but the OTHER qualification heats may still be active and would otherwise keep dispatching templates (e.g. `phone_heat` ticking down with "can I get your number?" follow-ups on a now-Disqualified family). All snaps are silent — no `heat_change_log` entries
5. No outreach push — we stop engagement until re-qualification
6. **AI switches to extraction-only mode** — the AI orchestrator MUST check `families.enquiry_status` at the START of each inbound's processing turn to determine its starting mode. The transitions between modes are **asymmetric** within a turn:
   - **Full → extraction-only does NOT happen mid-turn.** If the turn STARTED in full mode (state was `'Yet to Qualify'` or `'Qualified'`) and the AI's mid-turn writes flip state to `'Disqualified'` (the disqualifying step itself — e.g. Scenario 1 Step 3 or 4), AI still composes the final explanatory reply for THIS turn (e.g. *"Sorry, we don't serve Tampines yet"*). Mode-switch to extraction-only takes effect on the NEXT inbound.
   - **Extraction-only → full CAN happen mid-turn.** If the turn STARTED in extraction-only mode (state was `'Disqualified'`) and extraction yields a re-qualifying write that flips state to `'Qualified'` / `'Yet to Qualify'`, AI re-enables full mode and composes a reply on THIS turn (subject to the double-message guard below). This is the auto-re-engagement path.
   
   While in extraction-only mode, AI does NOT compose conversational replies, but it DOES still process every inbound through **extraction-only mode**: parse the inbound for re-qualification signals only (new learner mentions with age, location mentions, age updates on existing learners). If extraction yields a re-qualifying write (e.g. CREATE a new `learners` row with age ≥ 4, or UPDATE `families.confirmed_location` + `location_qualification = 'Qualified'`), the write fires Central Trigger normally; if `enquiry_status` flips back to `'Qualified'` or `'Yet to Qualify'`, AI re-enables full conversational mode for the SAME inbound turn and composes a reply. **Double-message guard:** if Re-qualification Outreach is about to fire on this same turn (i.e. the state flipped from `'Disqualified'` → `'Qualified'`, triggering a templated outreach push), the AI orchestrator MUST suppress its own composed reply to avoid two back-to-back messages. The templated outreach IS the customer-facing acknowledgment; AI resumes full replies on the NEXT inbound. If the flip is to `'Yet to Qualify'` (only some conditions resolved, no Re-qualification Outreach fires), AI composes a normal reply this turn. If extraction yields no re-qualifying signal, AI stays silent and the inbound just sits in `conversations`. The final outbound message of the triggering step (e.g. Scenario 1 Step 3's outbound) is the last full conversational message; subsequent inbounds get extraction-only treatment until re-qualification flips the state. **Prompt-layer concern:** the extraction-only AI prompt MUST be tightened against false positives — only extract first-person learner mentions (*"my daughter"*, *"my son"*, *"my kids"*), not third-party references (*"my friend has a 5-year-old"* shouldn't create a learner). False-positive extraction would silently re-qualify a family that shouldn't be re-qualified and re-engage them with a Re-qualification Outreach push
7. CREATE `operation_logs` (`family_disqualified`, `family_id`, `detail = reason` — the `reason` parameter passed to Central Trigger, e.g. `'age'` or `'location'`)

### Transition: → `'Yet to Qualify'`

Reached only by reverting from `'Disqualified'` when the disqualifying condition resolves but another condition is still unresolved (e.g. location qualified but age still pending). Just update the field — no learner state changes, no push:

1. UPDATE `families` SET `enquiry_status = 'Yet to Qualify'`

### Re-qualification Outreach

Fired by Central Trigger step 4 — only when `enquiry_status` flips from `'Disqualified'` → `'Qualified'`. A single WhatsApp push is sent to the primary contact. Template is chosen from the `reason` parameter passed into Central Trigger:

| `reason` | Template category | Operation logged |
|---|---|---|
| `'age'` (child turned 4 or new older learner added) | `'age_requalification'` | `'age_requalified_push'` |
| `'location'` (new pool added by admin) | `'location_requalification'` | `'location_requalified_push'` |
| `'phone'` | — (phone has no Disqualified state, so this combination never occurs) | — |
| `'merge'` | Use the snapshot captured in merge Step 5 (`previous_age_qualification`, `previous_location_qualification`): if `previous_age_qualification = 'Disqualified'` AND current = `'Qualified'` → age flipped, use `'age_requalification'`. Same logic for location. If BOTH flipped → use `'location_requalification'` (more material change) | `'age_requalified_push'` or `'location_requalified_push'` as chosen |

Both templates are WhatsApp-specific (`platform = 'WhatsApp'`). Template IDs to be assigned when templates are written.

**After successful push:** CREATE `operation_logs` entry with `operation = '<value from "Operation logged" column>'`, `family_id` set, `status = 'Success'`. On dispatch failure: `status = 'Failed'` with `detail = <error message>`. On Engagement Guard block: see Skip logging in the Engagement Guard section above.

After the push is sent, the heat engine takes over via the `pre_trial_heat = 5` activated in step 3.

### Age Eligibility Push (learner-level trigger)

Fires when a learner's `learner_eligible_date` arrives (child turns 4). Distinct from the Central Trigger — this is a learner-level engagement push that handles both the heat activation for the newly-eligible learner AND the appropriate template send:

- Query `learners` WHERE `learner_eligible_date = today` → get `family_id` and the aging-in `learner_id`
- Lookup primary contact and CHECK `families.location_qualification = 'Qualified'` AND primary `contacts.phone_qualification = 'Qualified'`
- If both met:
  - Capture `previous_age_qualification = families.age_qualification` (before update)
  - **UPDATE `learners` SET `learner_age = 4`, `learner_eligible_date = null`** for the aging-in learner (the stored age was 3 at creation; the kid is now 4 in real life — without this update, `is_qualified_learner` check would still see `learner_age = 3` and stay false). Clearing `learner_eligible_date` prevents re-firing on subsequent date checks
  - UPDATE `families` SET `age_qualification = 'Qualified'` (a learner is now ≥ 4)
  - This change triggers Central Trigger with `reason = 'age'` → which handles `enquiry_status` flip and re-evaluates `is_qualified_learner` (now correctly sees `learner_age = 4`) + activates `pre_trial_heat` for all eligible learners (only if `enquiry_status` actually flips)
  - **Always activate heat for the aging-in learner** (handles the case where Central Trigger didn't flip `enquiry_status` because the family was already `'Qualified'` via an older sibling): re-evaluate the aging-in learner's `is_qualified_learner`. If it just became `true` AND `learners.pre_trial_heat IS NULL` AND `families.pipeline_status != 'Not Interested'` (idempotency check + Engagement Guard) → UPDATE `learners` SET `is_qualified_learner = true`, `pre_trial_heat = 5`, `pre_trial_heat_date = now()` AND CREATE `heat_change_log` (`learner_id`, `channel = 'pre_trial'`, `old_heat = null`, `new_heat = 5`).
  - **Push precedence** (subject to Engagement Guard — skip ALL pushes below if `families.pipeline_status = 'Not Interested'`):
    - If `previous_age_qualification = 'Disqualified'` → Central Trigger → Re-qualification Outreach sends `age_requalified_push` (this learner aging in is what unblocked the family; the Re-qualification Outreach guard also enforces the Not Interested check). Do NOT also send `age_eligible_push`.
    - Else (family was already qualified — e.g. an older sibling already meets age + location + phone, so `families.age_qualification` was already `'Qualified'`) → send `age_eligible_push` (template explains "your child is now old enough"). After successful push, CREATE `operation_logs` entry with `operation = 'age_eligible_push'`, `learner_id` + `family_id` set, `status = 'Success'`. On dispatch failure: `status = 'Failed'` with `detail = <error message>`. On Engagement Guard block: see Skip logging in the Engagement Guard section.
- If location or phone not yet qualified → no push and no heat activation, learner stays `is_qualified_learner = false` until those conditions resolve

### Location Expansion (admin trigger)

New pool openings are rare — handled manually by admin. Admin updates `location_qualification = 'Qualified'` and `confirmed_location` on affected families. This change triggers Central Trigger with `reason = 'location'`. If `enquiry_status` was previously `'Disqualified'`, Re-qualification Outreach fires with the `location_requalification` template — **subject to the Engagement Guard.** Families with `pipeline_status = 'Not Interested'` get the qualification flip recorded for audit but no push is sent. Since Location Expansion can affect many families at once, this guard is critical to avoid blasting unsolicited messages to leads who previously declined.

---

## Data Flow Scenarios

**Transactional boundary:** each numbered step in every scenario is one transaction. All writes within a step — `families` / `contacts` / `learners` / `conversations` / `operation_logs` / `heat_change_log` updates, plus any Central Trigger transition writes the step fires — succeed or roll back together. External side effects (Airtable push, outbound message dispatch) happen AFTER the transaction commits and have their own retry/error handling.

---

### Scenario 1: Facebook Messenger — New Contact, Full Qualification

**Channel:** Facebook Messenger (no phone at entry).

#### Step 1 — First message received

**Dedup check:** Query `contacts` WHERE `facebook_id` = [PSID]
- Found → UPDATE `last_customer_reply_time`, CREATE `conversations` (inbound). No new `families`/`contacts` records. **Then route per the Returning Contacts policies, checking in this precedence order:**
  1. If `pipeline_status = 'Not Interested'` → pause AI, surface to admin. Do NOT proceed to Step 2. (Most restrictive — takes precedence even if also Disqualified.)
  2. Else if `enquiry_status = 'Disqualified'` → AI runs in **extraction-only mode** (per Transition → Disqualified policy). Inbound logged to `conversations`. AI parses for re-qualification signals (new older learner, location now serviced). If extraction flips `enquiry_status` back: `Disqualified → Qualified` → Re-qualification Outreach templated push goes out, AI's own reply is suppressed this turn per double-message guard; `Disqualified → Yet to Qualify` → AI re-enables and composes a reply this turn (no Re-qualification Outreach fires). If no re-qualifying signal → AI stays silent, do NOT proceed to Step 2.
  3. Else → reset heats for any `'Yet to Qualify'` fields per the standard Returning Contacts rule, then proceed to Step 2.
- Not found → CREATE.

**CREATE `families`:**

| Field | Value |
|---|---|
| `family_id` | auto-generated |
| `family_name` | null |
| `family_date` | now() |
| `country` | derived from inbound channel's country mapping (FB page region for Facebook, IG account region for Instagram, WhatsApp number prefix for WhatsApp). Must match `contacts.country` for the same first-message event |
| `preferred_location` | null |
| `confirmed_location` | null |
| `location_qualification` | `'Yet to Qualify'` |
| `age_qualification` | `'Yet to Qualify'` |
| `enquiry_status` | `'Yet to Qualify'` |
| `pipeline_status` | `'Inquiry'` |
| `age_heat` | `5` |
| `age_heat_date` | now() |
| `location_heat` | `5` |
| `location_heat_date` | now() |

**CREATE `contacts`:**

| Field | Value |
|---|---|
| `contact_id` | auto-generated |
| `family_id` | [family_id] |
| `is_primary_contact` | `true` |
| `contact_name` | null |
| `phone_number` | null |
| `phone_qualification` | `'Yet to Qualify'` |
| `phone_heat` | `5` |
| `phone_heat_date` | now() |
| `facebook_id` | [FB sender PSID] |
| `country` | same value as `families.country` — derived from the same inbound channel mapping |
| `contact_source` | `'Facebook Messenger'` |
| `contact_created_date` | now() |
| `last_customer_reply_time` | now() |
| `last_message_sent_time` | null |

**CREATE `conversations`** (inbound):

| Field | Value |
|---|---|
| `contact_id` | [contact_id] |
| `family_id` | [family_id] |
| `source` | `'Facebook Messenger'` |
| `source_id` | [facebook_id] |
| `direction` | `'inbound'` |
| `customer_message_content` | [message text] |
| `status` | `'Success'` |

**CREATE `operation_logs`:**

| Field | Value |
|---|---|
| `family_id` | [family_id] |
| `source` | `'Facebook Messenger'` |
| `source_id` | [facebook_id] |
| `operation` | `'family_created'` |
| `status` | `'Success'` |

---

#### Step 2 — AI processes and responds

**UPDATE `contacts.last_message_sent_time` = now()**

**CREATE `conversations`** (outbound):

| Field | Value |
|---|---|
| `contact_id` | [contact_id] |
| `family_id` | [family_id] |
| `source` | `'Facebook Messenger'` |
| `source_id` | [facebook_id] |
| `direction` | `'outbound'` |
| `system_reply` | [AI response text] |
| `template_id` | [if template used, else null] |
| `status` | `'Success'` |

---

#### Step 3 — Contact provides learner age(s)

**UPDATE `contacts.last_customer_reply_time` = now()**

**CREATE `conversations`** (inbound).

**AI extracts ages → CREATE one `learners` record per learner:**

| Field | Value |
|---|---|
| `family_id` | [family_id] |
| `learner_name` | null |
| `learner_age` | [extracted age] |
| `learner_eligible_date` | set if age < 4, else null |
| `location_qualification` | copied from `families.location_qualification` (current value at time of learner creation — typically `'Yet to Qualify'` if ages come before location, or `'Qualified'` if location was collected first) |
| `learner_date` | now() |
| `is_qualified_learner` | false (table default at CREATE — Central Trigger re-evaluates it later in this step after the families UPDATE) |
| `trial_status` | `'Yet to Arrange'` |
| `enrollment_status` | `'Yet to Enroll'` |

**UPDATE `families`:**

| Field | Value | Logic |
|---|---|---|
| `age_qualification` | `'Qualified'` or `'Disqualified'` | At least one learner ≥ 4 → Qualified. All < 4 → Disqualified |
| `age_heat` | `0` | Snapped to 0 once ages collected — no heat_change_log entry |

**Fires Central Trigger** with `reason = 'age'` (Qualification Rules) — re-evaluates `enquiry_status` from the three qualification fields. May flip to `'Disqualified'` if all learners < 4 (location still pending).

**AI responds → UPDATE `contacts.last_message_sent_time` = now(). CREATE `conversations`** (outbound).

---

#### Step 4 — Contact provides location

**UPDATE `contacts.last_customer_reply_time` = now()**

**CREATE `conversations`** (inbound).

**AI extracts and matches location → UPDATE `families`:**

| Field | Value | Logic |
|---|---|---|
| `preferred_location` | e.g. `'near Bishan'` | Raw input |
| `confirmed_location` | e.g. `'Bishan'` or null | AI matches against pool_name values in `pools` table |
| `location_qualification` | `'Qualified'` or `'Disqualified'` | confirmed_location set → Qualified. No match → Disqualified |
| `location_heat` | `0` | Snapped to 0 — no heat_change_log entry |

**Fires Central Trigger** with `reason = 'location'` (Qualification Rules) — the `families.location_qualification` change is the triggering input. For a typical Facebook lead, phone is still `'Yet to Qualify'`, so `enquiry_status` will not flip to `'Qualified'` yet. It may flip to `'Disqualified'` if location not served. `pre_trial_heat` does NOT activate here — it activates when Central Trigger flips `enquiry_status` to `'Qualified'` (typically during Step 5 when phone is collected).

**UPDATE `learners`** (all learners WHERE `family_id = X`) — cascade the location_qualification value to each learner as a denormalized copy for query and RLS use (not the source of truth — `is_qualified_learner` reads `families.location_qualification` directly):

| Field | Value | Logic |
|---|---|---|
| `location_qualification` | copied from `families.location_qualification` | Always |

**AI responds → UPDATE `contacts.last_message_sent_time` = now(). CREATE `conversations`** (outbound).

---

#### Step 5 — Contact provides phone number

**UPDATE `contacts.last_customer_reply_time` = now()**

**CREATE `conversations`** (inbound).

**Normalize and dedup-check:** AI extracts phone string from message → application normalizes to E.164 format per `contacts.phone_number` field rules (digits only, country code prepended, no leading zeros) → query `contacts WHERE phone_number = [normalized]`. Result determines Path A or Path B.

**Path A: Phone not seen before** (dedup query returned no rows)

UPDATE `contacts`:

| Field | Value |
|---|---|
| `phone_number` | e.g. `6591234567` |
| `phone_qualification` | `'Qualified'` |
| `phone_heat` | `0` |
| `phone_heat_date` | now() |

`phone_heat` snaps to 0 — no heat_change_log entry.

**Fires Central Trigger** with `reason = 'phone'` (Qualification Rules). If age + location were already qualified, `enquiry_status` flips to `'Qualified'` → `pipeline_status = 'Lead'` (if was `'Inquiry'`) → `pre_trial_heat = 5` activates on all learners whose `is_qualified_learner` just flipped to true (typically all `age ≥ 4` learners in this scenario; see Transition → 'Qualified' step 3 for the exact condition) → `heat_change_log` entries created → `operation_logs` (`family_qualified`) created. If age or location is still unresolved or disqualified, no flip yet. (Re-qualification Outreach never fires from a phone change, since phone has no Disqualified state.)

**Path B: Phone already exists on another contact** (dedup query returned the existing matching contact)

Trigger cross-channel merge. Existing contact (the dedup match) is the surviving contact; current contact is the duplicate. Merge re-evaluates qualification state on surviving family (Step 9 of merge flow). Admin notified after merge completes.

**AI responds → UPDATE `contacts.last_message_sent_time` = now(). CREATE `conversations`** (outbound).

---

#### Sub-case: Contact defers during pre-trial follow-up

Fires after the family has qualified (`pre_trial_heat` active) but before a trial is arranged, when the contact responds to a pre-trial follow-up with any kind of deferral — either an explicit callback date ("I'll get back to you next week") OR a vague deferral ("let me discuss with my spouse", "I'll think about it", "get back to you").

**UPDATE `learners`** WHERE `family_id = X` AND `pre_trial_heat BETWEEN 1 AND 5` (the learner(s) currently in active pre-trial follow-up — excludes terminal-zero and null):

| Field | Value |
|---|---|
| `pre_trial_followup_date` | **Explicit deferral:** [date given by contact]. **Vague deferral (no date provided):** `current_date + 1 day` — default to a 1-day cooldown so the AI stops pushing today but resumes tomorrow. This converts every "soft no" into a soft re-engagement instead of letting `pre_trial_heat` continue dropping today and firing another template hours later (which would feel pushy after a deferral) |

Heat engine suppresses `pre_trial_heat` drops until `pre_trial_followup_date` is reached, then resumes from the current heat value per `heat_schedule_config` (so the next drop fires `wait_minutes` after the followup date, not exactly at the followup moment). No `heat_change_log` entry — this is a timing adjustment, not a heat change.

**AI deferral detection** is a prompt-layer concern, not a schema concern — the spec just defines the resulting UPDATE. The AI should classify the contact's reply as "explicit date / vague deferral / neither" and emit the appropriate write.

Applies equally to Scenarios 2 (Instagram) and 3 (WhatsApp) — the pre-trial follow-up phase is identical across channels.

---

#### Sub-case: Contact declines trial for a specific learner ('Not Interested in Trial')

Fires when the contact wants to proceed with SOME learners in the family but not others (e.g. *"I'll book the trial for my older daughter but not for my son — he's too shy"*). This is **learner-level**, distinct from family-level Not Interested (which would end engagement entirely).

**UPDATE `learners`** WHERE `learner_id = [the declined learner]`:

| Field | Value |
|---|---|
| `trial_status` | `'Not Interested in Trial'` |
| `pre_trial_heat` | `0` (snap, no `heat_change_log` entry) |
| `pre_trial_heat_date` | `now()` |
| `pre_trial_followup_date` | null (clear if previously set) |

`families.pipeline_status` stays at `'Lead'` (or wherever it was) — only this learner is declined. Sibling learners' state is untouched: their own `pre_trial_heat` continues ticking, they can still be booked for trials via Step 7. The per-family dispatch coalescing rule means subsequent heat drops on sibling learners still produce one outbound message (this declined learner just doesn't contribute to the coalesced group anymore).

**CREATE `operation_logs`** (`not_interested`, `learner_id`, `family_id`, `detail = 'learner-level — trial decline'`).

Applies equally to Scenarios 2 and 3.

---

#### Sub-case: Contact wants a 'Future Trial' (committed but distant)

Fires when the contact has committed to doing a trial but wants to do it at a vague future time (e.g. *"we'll do it when school holidays start in June"*, *"let's revisit in a few months"*). Distinct from `pre_trial_followup_date` (which is short-term — days or weeks, with heat suppression and an automated follow-up). `'Future Trial'` is for committed-but-distant intent where no specific callback date is given and we don't want to keep pushing in the meantime.

**Distinguishing rule for the AI:**
- Specific near-term date ("next Wednesday", "in 2 weeks") → set `pre_trial_followup_date`, keep `trial_status = 'Yet to Arrange'`, heat suppressed
- Vague short-term defer ("discuss with spouse", "I'll think about it") → set `pre_trial_followup_date = current_date + 1 day`, heat suppressed
- Vague long-term commit ("in a few months", "when holidays start") → set `trial_status = 'Future Trial'`, heat snaps (contact comes back when ready)

**UPDATE `learners`** WHERE `learner_id = [the committing learner]`:

| Field | Value |
|---|---|
| `trial_status` | `'Future Trial'` |
| `pre_trial_heat` | `0` (snap, no `heat_change_log` entry) |
| `pre_trial_heat_date` | `now()` |
| `pre_trial_followup_date` | null |

`families.pipeline_status` stays at `'Lead'`. Sibling learners' state untouched.

**When the contact eventually returns** to book the future trial (returning contact via Phase A dedup): the trial-arranging conversation resumes. `trial_status` is updated to `'Trial Arranged'` per Step 7 when the booking happens. Trial heats are NOT reset on return (per the Returning Contacts rule), so `pre_trial_heat` stays at 0 — the live AI conversation IS the engagement.

No `operation_logs` entry — `'Future Trial'` is a soft state, not a strong audit event. The audit is the `conversations` row that triggered the AI to set it.

Applies equally to Scenarios 2 and 3.

---

#### Step 6 — Contact says "Not Interested" (before trial arranged)

When contact explicitly declines during the pre-trial follow-up phase:

**UPDATE `families`:**

| Field | Value |
|---|---|
| `pipeline_status` | `'Not Interested'` |

**UPDATE `families`** — snap qualification heats if still active (defensive — under normal Lead-onward flow these are already 0, but admin direct flip via UI from Inquiry stage is allowed and would otherwise leave qualification heats ticking):

| Field | Value | Logic |
|---|---|---|
| `age_heat` | `0` | Snap if currently non-zero |
| `age_heat_date` | now() | If age_heat changed |
| `location_heat` | `0` | Snap if currently non-zero |
| `location_heat_date` | now() | If location_heat changed |

**UPDATE `learners` WHERE `family_id = X`** — snap ALL active heats across ALL learners (covers multi-learner families where siblings may have heats on multiple channels), per the Engagement Guard:

| Field | Value | Logic |
|---|---|---|
| `pre_trial_heat` | `0` | Snap if currently non-null |
| `pre_trial_heat_date` | now() | If pre_trial_heat changed |
| `missed_trial_heat` | `0` | Snap if currently non-null (defensive — deferred field, currently always null) |
| `missed_trial_heat_date` | now() | If missed_trial_heat changed |
| `cancelled_trial_heat` | `0` | Snap if currently non-null (defensive — deferred field, currently always null) |
| `cancelled_trial_heat_date` | now() | If cancelled_trial_heat changed |

**UPDATE `contacts` WHERE `family_id = X`** — snap any active `phone_heat` on ALL contacts under the family, not just primary. Non-primary contacts may exist from a prior cross-channel merge and may have their own ticking `phone_heat` that the heat engine would otherwise keep dispatching to:

| Field | Value | Logic |
|---|---|---|
| `phone_heat` | `0` | Snap if currently non-null/non-zero |
| `phone_heat_date` | now() | If phone_heat changed |

All snaps to 0 — no heat_change_log entries.

**CREATE `operation_logs`** (`not_interested`, `family_id`).

Heat engine stops. No further follow-up sent on any channel.

---

#### Step 7 — Trial arranged

> **Implicit trial-arranging conversation between Step 5 and Step 7:** AI conducts a multi-message exchange collecting trial logistics — learner name(s) if not yet known, preferred trial day/time, pool preference, coach preference (or random assignment). Each message goes through the same inbound/outbound flow as earlier steps (UPDATE `contacts` timestamps, CREATE `conversations`) but doesn't change qualification state — Central Trigger doesn't fire. Step 7 below fires once all details are confirmed and the trial is booked.

**UPDATE `families`:**

| Field | Value |
|---|---|
| `pipeline_status` | `'Trial Arranged'` |

**UPDATE `learners`:**

| Field | Value |
|---|---|
| `learner_name` | [name collected during trial-arranging conversation, if not already set] |
| `trial_status` | `'Trial Arranged'` |
| `pre_trial_heat` | `0` |
| `pre_trial_heat_date` | now() |

**CREATE `trials`:**

| Field | Value |
|---|---|
| `learner_id` | [learner_id] |
| `family_id` | [family_id] |
| `learner_name` | copied from `learners.learner_name` |
| `trial_status` | `'Trial Arranged'` |
| `trial_date` | [date] |
| `trial_day` | [day] |
| `trial_timeslot` | [timeslot] |
| `pool_id` | [pool_id from `pools`] |
| `coach_id` | [coach_id from `coaches`] |
| `trial_arranged_date` | now() |

`pre_trial_heat` snaps to 0 — no heat_change_log entry.

**POST trial details to Airtable** (one-way push — Airtable only receives):
- On success → **UPDATE `learners.airtable_id`** = [returned Airtable record ID]
- On failure → `airtable_id` stays null

**CREATE `operation_logs`:**

| Field | Value |
|---|---|
| `learner_id` | [learner_id] |
| `family_id` | [family_id] |
| `operation` | `'trial_arranged'` |
| `status` | `'Success'` or `'Failed'` |
| `detail` | Airtable record ID on success, error message on failure |

---

### Scenario 2: Instagram — New Contact, Full Qualification

Identical to Facebook (Steps 1–7). Only differences:
- `source = 'Instagram Messenger'`
- `contacts.instagram_id` populated instead of `facebook_id`
- `contacts.contact_source = 'Instagram Messenger'`
- Dedup check on `contacts.instagram_id`

---

### Scenario 3: WhatsApp — New Contact, Full Qualification

**Channel:** WhatsApp (phone known at entry). Key difference: `phone_qualification = 'Qualified'` and `phone_heat = 0` on creation.

#### Step 1 — First message received

**Dedup check:** Query `contacts` WHERE `phone_number` = [sender phone]
- Found → UPDATE `last_customer_reply_time`, CREATE `conversations` (inbound). No new `families`/`contacts` records. **Then route per the Returning Contacts policies, checking in this precedence order:**
  1. If `pipeline_status = 'Not Interested'` → pause AI, surface to admin. Do NOT proceed to Step 2. (Most restrictive — takes precedence even if also Disqualified.)
  2. Else if `enquiry_status = 'Disqualified'` → AI runs in **extraction-only mode** (per Transition → Disqualified policy). Inbound logged to `conversations`. AI parses for re-qualification signals (new older learner, location now serviced). If extraction flips `enquiry_status` back: `Disqualified → Qualified` → Re-qualification Outreach templated push goes out, AI's own reply is suppressed this turn per double-message guard; `Disqualified → Yet to Qualify` → AI re-enables and composes a reply this turn (no Re-qualification Outreach fires). If no re-qualifying signal → AI stays silent, do NOT proceed to Step 2.
  3. Else → reset heats for any `'Yet to Qualify'` fields per the standard Returning Contacts rule, then proceed to Step 2.
- Not found → CREATE.

**CREATE `families`:**

| Field | Value |
|---|---|
| `family_id` | auto-generated |
| `family_name` | null |
| `family_date` | now() |
| `country` | derived from inbound channel's country mapping (WhatsApp number prefix for this scenario). Must match `contacts.country` for the same first-message event |
| `preferred_location` | null |
| `confirmed_location` | null |
| `location_qualification` | `'Yet to Qualify'` |
| `age_qualification` | `'Yet to Qualify'` |
| `enquiry_status` | `'Yet to Qualify'` |
| `pipeline_status` | `'Inquiry'` |
| `age_heat` | `5` |
| `age_heat_date` | now() |
| `location_heat` | `5` |
| `location_heat_date` | now() |

**CREATE `contacts`:**

| Field | Value |
|---|---|
| `contact_id` | auto-generated |
| `family_id` | [family_id] |
| `is_primary_contact` | `true` |
| `contact_name` | null |
| `phone_number` | [sender phone] |
| `phone_qualification` | `'Qualified'` |
| `phone_heat` | `0` |
| `phone_heat_date` | now() |
| `country` | same value as `families.country` — derived from the WhatsApp number prefix |
| `contact_source` | `'WhatsApp'` |
| `contact_created_date` | now() |
| `last_customer_reply_time` | now() |
| `last_message_sent_time` | null |

`phone_heat` starts at 0 (phone known at entry) — no heat_change_log entry.

**CREATE `conversations`** (inbound).

**CREATE `operation_logs`:**

| Field | Value |
|---|---|
| `family_id` | [family_id] |
| `source` | `'WhatsApp'` |
| `source_id` | [phone_number] |
| `operation` | `'family_created'` |
| `status` | `'Success'` |

---

#### Step 2 — AI processes and responds

**UPDATE `contacts.last_message_sent_time` = now().** CREATE `conversations` (outbound).

---

#### Step 3 — Contact provides learner age(s)

Same as Facebook Step 3.

---

#### Step 4 — Contact provides location

**UPDATE `contacts.last_customer_reply_time` = now()**

**CREATE `conversations`** (inbound).

**AI extracts and matches location → UPDATE `families`:**

| Field | Value | Logic |
|---|---|---|
| `preferred_location` | e.g. `'near Bishan'` | Raw input |
| `confirmed_location` | e.g. `'Bishan'` or null | AI matches against pool_name values in `pools` table |
| `location_qualification` | `'Qualified'` or `'Disqualified'` | confirmed_location set → Qualified. No match → Disqualified |
| `location_heat` | `0` | Snapped to 0 — no heat_change_log entry |

**Fires Central Trigger** with `reason = 'location'` (Qualification Rules) — the `families.location_qualification` change is the triggering input. For WhatsApp, phone was already qualified at entry. If age was also qualified before this step, location resolving Qualified will flip `enquiry_status` to `'Qualified'` → `pipeline_status = 'Lead'` (if was `'Inquiry'`) → `pre_trial_heat = 5` activates on all learners whose `is_qualified_learner` just flipped to true (see Transition → 'Qualified' step 3) → `heat_change_log` entries → `operation_logs` (`family_qualified`) created.

**UPDATE `learners`** (all learners WHERE `family_id = X`) — cascade the location_qualification value to each learner as a denormalized copy for query and RLS use (not the source of truth — `is_qualified_learner` reads `families.location_qualification` directly):

| Field | Value | Logic |
|---|---|---|
| `location_qualification` | copied from `families.location_qualification` | Always |

**AI responds → UPDATE `contacts.last_message_sent_time` = now(). CREATE `conversations`** (outbound).

---

#### Step 5 — Contact says "Not Interested" (before trial arranged)

Same as Facebook Step 6.

---

#### Step 6 — Trial arranged

Same as Facebook Step 7.

---

### Scenarios 4, 5, 6: Post-Trial-Arranged outcomes — DEFERRED to Airtable

**Current policy:** every trial outcome — Trial Done, Missed Trial, Cancelled — is managed by the ops team in Airtable. The CRM's responsibility ends the moment the trial-arrangement step commits (Scenario 1 Step 7 / Scenario 3 Step 6) and the subsequent Airtable POST returns.

**What this means concretely:**
- `trials.trial_status` and `learners.trial_status` are set to `'Trial Arranged'` at booking and **never updated by the CRM thereafter.** Ops marks attendance / cancellation / no-shows directly in Airtable; that does NOT sync back to the CRM.
- `learners.missed_trial_heat`, `learners.cancelled_trial_heat`, and the `missed_trial_followup_date` / `cancelled_followup_date` fields stay defined in the schema for future use but are **never activated** under the current scope.
- The `'missed_trial'`, `'cancelled_trial'`, `'pre_trial'` channels in `heat_change_log`, `follow_up_triggers`, `heat_schedule_config` similarly stay defined but `'missed_trial'` and `'cancelled_trial'` channels never get rows under current scope.
- The `'missed_trial'`, `'trial_cancelled'`, `'trial_done'` values in `operation_logs.operation` enum stay defined but are never emitted by the CRM.
- `families.pipeline_status` values `'Trial Done'`, `'Pending Sign Up'`, `'Considering'`, `'Enrolled'`, `'Not Interested'` stay defined; only `'Inquiry'` → `'Lead'` → `'Trial Arranged'` are reached automatically by CRM scenarios. Admin direct flip to `'Not Interested'` via admin UI is still supported (Engagement Guard fires per the existing rule).

**Why kept in schema:** the original "complete lifecycle" intent stands — when the migration moves these flows from Airtable into the CRM, the schema is ready and no restructuring is needed. The flows below are the eventual designs once migration happens.

<details>
<summary>Original Scenario 4 / 5 / 6 designs (for migration reference — NOT currently implemented)</summary>

> **Migration note:** the deferred designs below were written before the Engagement Guard's snap rules were extended to include `age_heat` / `location_heat` / all-contacts-`phone_heat`. When activating these scenarios post-migration, update each "Not Interested" branch (Scenario 4 post-missed-trial, Scenario 5 post-cancellation) to match the current Scenario 1 Step 6 snap set: family qualification heats + all learner heats + all contact `phone_heat`. The current designs only show the learner-heat snap.

### Scenario 4 (deferred): Missed Trial

**Trigger:** Coach marks trial as missed after the session via **CRM admin UI** (which updates `trials.trial_status` and `learners.trial_status`). Admin selects the specific `trial_id` to update — typically the most recent `'Trial Arranged'` record for the learner. Airtable has parallel attendance tracking for ops convenience, but the CRM trial_status update is what fires this scenario — Airtable does not sync back to CRM.

**UPDATE `trials`** WHERE `trial_id = [selected]`:

| Field | Value |
|---|---|
| `trial_status` | `'Missed Trial'` |

**UPDATE `learners`** WHERE `learner_id = trials.learner_id` (from the updated row):

| Field | Value |
|---|---|
| `trial_status` | `'Missed Trial'` |
| `missed_trial_heat` | `5` |
| `missed_trial_heat_date` | now() |

**CREATE `heat_change_log`:**

| Field | Value |
|---|---|
| `learner_id` | [learner_id] |
| `channel` | `'missed_trial'` |
| `old_heat` | null |
| `new_heat` | `5` |
| `dispatched` | `false` |
| `changed_at` | now() |

**CREATE `operation_logs`** (`missed_trial`, `learner_id`, `family_id`, `status = 'Success'`).

`families.pipeline_status` stays `'Trial Arranged'` — no update needed. Family remains in the trial pipeline during re-engagement.

Heat engine begins dropping `missed_trial_heat` 5 → 4 → 3 → 2 → 1 per `heat_schedule_config`. Each drop creates a `heat_change_log` record and checks `follow_up_triggers` for a matching template to send.

---

#### Sub-case: Contact gives callback date during re-engagement

When contact responds and gives a preferred follow-up date:

**UPDATE `learners`:**

| Field | Value |
|---|---|
| `missed_trial_followup_date` | [date given by contact] |

Heat engine suppresses `missed_trial_heat` drops until `missed_trial_followup_date` is reached.

---

#### When contact says "Not Interested" (after missed trial)

**UPDATE `families`:**

| Field | Value |
|---|---|
| `pipeline_status` | `'Not Interested'` |

**UPDATE `learners` WHERE `family_id = X`** — snap ALL active heats across ALL learners in the family (not just the missed-trial learner), per the Engagement Guard:

| Field | Value | Logic |
|---|---|---|
| `pre_trial_heat` | `0` | Snap if currently non-null |
| `pre_trial_heat_date` | now() | If pre_trial_heat changed |
| `missed_trial_heat` | `0` | Snap if currently non-null |
| `missed_trial_heat_date` | now() | If missed_trial_heat changed |
| `cancelled_trial_heat` | `0` | Snap if currently non-null |
| `cancelled_trial_heat_date` | now() | If cancelled_trial_heat changed |

All snaps to 0 — no heat_change_log entries. Covers the multi-learner case where siblings might have active heats on other channels (e.g. one learner missed their trial while another still has active pre_trial_heat).

**CREATE `operation_logs`** (`not_interested`, `family_id`).

Heat engine stops. No further follow-up sent on any channel.

---

#### When new trial arranged (after missed trial)

> Same implicit trial-arranging conversation as Scenario 1 Step 7 — AI collects updated trial logistics (day, time, pool, coach). Then this flow fires.

**UPDATE `families`:**

| Field | Value |
|---|---|
| `pipeline_status` | `'Trial Arranged'` |

**UPDATE `learners`:**

| Field | Value |
|---|---|
| `trial_status` | `'Trial Arranged'` |
| `missed_trial_heat` | `0` |
| `missed_trial_heat_date` | now() |

**CREATE `trials`** (new record — rescheduled trial).

`missed_trial_heat` snaps to 0 — no heat_change_log entry.

**POST trial details to Airtable** (one-way push):
- On success → **UPDATE `learners.airtable_id`** = [returned Airtable record ID]
- On failure → `airtable_id` stays null

**CREATE `operation_logs`** (`trial_arranged`, `learner_id`, `family_id`, `status = 'Success'` or `'Failed'`, `detail = <Airtable record ID on success, error message on failure>`).

---

### Scenario 5 (deferred): Cancelled Trial


**Trigger:** Admin updates `trials.trial_status` and `learners.trial_status` to `'Cancelled'` via **CRM admin UI**. Admin selects the specific `trial_id` to cancel — typically the most recent `'Trial Arranged'` record for the learner. Typically prompted by an inbound cancellation message from the contact — that message is logged via the standard Step 1 flow of the underlying scenario (Facebook/Instagram/WhatsApp) before admin sees it and acts. Same CRM source-of-truth as Scenario 4 — Airtable doesn't sync back.

**UPDATE `trials`** WHERE `trial_id = [selected]`:

| Field | Value |
|---|---|
| `trial_status` | `'Cancelled'` |

**UPDATE `learners.trial_status`** = `'Cancelled'` (WHERE `learner_id = trials.learner_id` from the updated row)

`families.pipeline_status` stays `'Trial Arranged'` — no update needed. Family remains in the trial pipeline pending re-engagement.

**CREATE `operation_logs`** (`trial_cancelled`, `learner_id`, `family_id`, `status = 'Success'`).

Two paths depending on whether contact gives a follow-up date:

---

#### Path A: Contact gives a follow-up date ("I'll come next week")

**UPDATE `learners`:**

| Field | Value |
|---|---|
| `cancelled_followup_date` | [date given by contact] |

`cancelled_trial_heat` stays **null** until `cancelled_followup_date` arrives. On that date, heat engine sets:

**UPDATE `learners`:**

| Field | Value |
|---|---|
| `cancelled_trial_heat` | `5` |
| `cancelled_trial_heat_date` | now() |

**CREATE `heat_change_log`:**

| Field | Value |
|---|---|
| `learner_id` | [learner_id] |
| `channel` | `'cancelled_trial'` |
| `old_heat` | null |
| `new_heat` | `5` |
| `dispatched` | `false` |
| `changed_at` | now() |

Heat engine begins dropping `cancelled_trial_heat` 5 → 4 → 3 → 2 → 1 per `heat_schedule_config`.

---

#### Path B: No follow-up date given

**UPDATE `learners`:**

| Field | Value |
|---|---|
| `cancelled_trial_heat` | `5` |
| `cancelled_trial_heat_date` | now() |

**CREATE `heat_change_log`:**

| Field | Value |
|---|---|
| `learner_id` | [learner_id] |
| `channel` | `'cancelled_trial'` |
| `old_heat` | null |
| `new_heat` | `5` |
| `dispatched` | `false` |
| `changed_at` | now() |

Heat engine begins dropping `cancelled_trial_heat` 5 → 4 → 3 → 2 → 1 per `heat_schedule_config`.

---

#### When contact says "Not Interested" (after cancellation)

**UPDATE `families`:**

| Field | Value |
|---|---|
| `pipeline_status` | `'Not Interested'` |

**UPDATE `learners` WHERE `family_id = X`** — snap ALL active heats across ALL learners in the family (not just the cancelled-trial learner), per the Engagement Guard:

| Field | Value | Logic |
|---|---|---|
| `pre_trial_heat` | `0` | Snap if currently non-null |
| `pre_trial_heat_date` | now() | If pre_trial_heat changed |
| `missed_trial_heat` | `0` | Snap if currently non-null |
| `missed_trial_heat_date` | now() | If missed_trial_heat changed |
| `cancelled_trial_heat` | `0` | Snap if currently non-null |
| `cancelled_trial_heat_date` | now() | If cancelled_trial_heat changed |

All snaps to 0 — no heat_change_log entries. Covers the multi-learner case where siblings might have active heats on other channels.

**CREATE `operation_logs`** (`not_interested`, `family_id`).

Heat engine stops. No further follow-up sent on any channel.

---

#### When new trial arranged (after cancellation)

> Same implicit trial-arranging conversation as Scenario 1 Step 7 — AI collects updated trial logistics (day, time, pool, coach). Then this flow fires.

**UPDATE `families`:**

| Field | Value |
|---|---|
| `pipeline_status` | `'Trial Arranged'` |

**UPDATE `learners`:**

| Field | Value |
|---|---|
| `trial_status` | `'Trial Arranged'` |
| `cancelled_trial_heat` | `0` |
| `cancelled_trial_heat_date` | now() |

**CREATE `trials`** (new record).

`cancelled_trial_heat` snaps to 0 — no heat_change_log entry.

**POST trial details to Airtable** (one-way push):
- On success → **UPDATE `learners.airtable_id`** = [returned Airtable record ID]
- On failure → `airtable_id` stays null

**CREATE `operation_logs`** (`trial_arranged`, `learner_id`, `family_id`, `status = 'Success'` or `'Failed'`, `detail = <Airtable record ID on success, error message on failure>`).

---

### Scenario 6 (deferred): Trial Done

**Trigger:** Coach marks trial as attended/done via CRM admin UI after the session. Admin selects the specific `trial_id` to update — typically the most recent `'Trial Arranged'` record for the learner.

**UPDATE `trials`** WHERE `trial_id = [selected]`:

| Field | Value |
|---|---|
| `trial_status` | `'Trial Done'` |

**UPDATE `learners`** WHERE `learner_id = trials.learner_id` (from the updated row):

| Field | Value |
|---|---|
| `trial_status` | `'Trial Done'` |

**CREATE `operation_logs`** (`trial_done`, `learner_id`, `family_id`, `status = 'Success'`).

`families.pipeline_status` is **NOT automatically updated to `'Trial Done'`** — that progression is currently handled in Airtable (per the Airtable Handoff section). No CRM-side follow-ups fire. No heats activate. No re-engagement.

This scenario exists for completeness — it's a status flip with no automation today. Future migration off Airtable will add the post-Trial-Done flow (transitions to Pending Sign Up / Considering / Enrolled).

</details>

---

## Post-Trial: Airtable Handoff

**Long-term intent:** this schema is designed to cover the complete lifecycle from first contact through enrollment and beyond. The tables and statuses below are defined so no schema restructuring is needed when the CRM eventually becomes the system of record for the full journey.

**Current implementation:** the CRM's responsibility ends at Trial Arranged. The CRM pushes trial details to Airtable via a one-way API on every trial-arranged event (see `learners.airtable_id` and the trial-arranged steps in Scenarios 1, 2, 3 — Scenario 2 inherits its trial-arranged step from Facebook). **From that point on, the ops team manages everything in Airtable** — attendance tracking, missed-trial follow-up, cancellation handling, payment, enrollment. None of this syncs back to the CRM.

**What the CRM currently handles end-to-end:** pre-enrollment qualification through trial arrangement (Scenarios 1–3 only). All post-Trial-Arranged automation (Scenarios 4 / 5 / 6 designs above) is deferred. The CRM-side `trials.trial_status` and `learners.trial_status` are written once at booking (`'Trial Arranged'`) and never updated again under current scope.

**Defined but not yet driven by CRM scenarios** (handled in Airtable today; will be activated when migration happens):

Tables (kept for future migration):
- `packages` — package type definitions (Silver / Gold / Platinum credit rules)
- `package_pricing` — price per package per country per duration
- `enrollments` — one record per enrollment period
- `invoices` — one per billing event
- `invoice_items` — line items per invoice
- `payments` — payment records against invoices

Fields kept for future migration (currently dormant):
- `learners.missed_trial_heat`, `missed_trial_heat_date`, `missed_trial_followup_date`
- `learners.cancelled_trial_heat`, `cancelled_trial_heat_date`, `cancelled_followup_date`

Enum values kept for future migration (currently never set/emitted):
- `families.pipeline_status` values beyond `'Inquiry'` / `'Lead'` / `'Trial Arranged'`: `'Trial Done'`, `'Pending Sign Up'`, `'Considering'`, `'Enrolled'`. (`'Not Interested'` IS active — set by Scenario 1 Step 6 and admin direct flip per Engagement Guard.)
- `learners.trial_status` values beyond `'Trial Arranged'`: `'Missed Trial'`, `'Cancelled'`, `'Trial Done'` (and the default `'Yet to Arrange'` before booking).
- `operation_logs.operation` values: `'missed_trial'`, `'trial_cancelled'`, `'trial_done'`.
- `heat_change_log.channel` / `follow_up_triggers.channel` / `heat_schedule_config.channel` values: `'missed_trial'`, `'cancelled_trial'`.

When the migration occurs, scenarios for these stages will be added to this spec (the deferred designs are preserved above for reference) and the dormant fields will be activated. No schema restructuring required — the foundation is in place.
