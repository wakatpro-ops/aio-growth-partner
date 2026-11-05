# Current-month sales dashboard

Requested 2026-11-05. Shared UI changes apply to every store; only the removal
of transaction count and guest-based KPI label are restaurant-specific.

## Definitions

- Month-to-date is the stored JST `business_date`, current month day1 through
  today inclusive. Never choose the latest recorded month as a substitute.
- Headline sales are tax-inclusive net recorded sales, including refunds and
  excluding POS voids. Empty import periods are identified, not claimed to be
  zero-business days. Failed or incomplete reads do not become zero KPIs.
- Read only current/previous-month records, organization + store scoped, with
  complete 500-row pagination and a50,000-record guard. Read-limit, changing
  counts and duplicate IDs are explicit failures, not truncated totals.
- Guest average is month-to-date sales divided by confirmed guest counts from
  sales, not orders, customers, items or reservations. Every sales record needs
  an explicit positive integer `source_metadata.guest_count` and
  `guest_count_confirmed=true`. Refunds change sales but do not add guests.
  Existing connectors do not yet populate this guest contract; those stores
  therefore show `客数未取得`. No guest data is invented or backfilled here.
- Comparisons use the prior month through the same day, capped at month-end.
  Missing either denominator yields no comparison, not a guessed percentage.
- Payment composition uses exactly the current-month transaction population.
  Unknown methods remain unset. Negative categories use signed amounts rather
  than a mathematically invalid donut.
- Daily trend is default; monthly is selectable. Current-month monthly points
  use the same raw-record cutoff as the KPI, not a future-containing cache.
  Missing daily dates break lines. Exact values remain available in a table.
- Targets are a monthly store setting under `profile_data.sales_month_targets`.
  No default target is supplied. Manager/owner/platform-admin only; server-side
  store access, account state, origin and input checks are required. Atomic SQL
  locks the store, preserves unrelated profile keys and previous months, and
  retains before/after audit history on update/clear. Only service_role may call
  the function. No sales or POS/integration data are changed by target edits.

## Verification and release

`npm run test:monthly-sales-dashboard`, `npm run test:sales-target-sql`,
`npm run test:home-metrics`, `npm run test:hub-tabs`,
`npm run test:accounting-overview`, `npm run test:store-ai-import-context`,
`npm run check:sales-hub`, `npm run check:visual-first`,
`npm run check:command-center`, `npm run check:ux`, `npm run check:secrets`,
targeted ESLint, TypeScript and production build were run locally.

The SQL test creates a disposable local cluster, uses the actual existing
manager-authorization function, checks tenant/banned-user boundaries and audit
rollback, then stops and removes the cluster. It never connects to an existing DB.
The renderer/event/service/API tests use synthetic data and mocks, not a live
POS or authenticated hosted browser session. PC plus390/320px browser checks
covered layout, native target disclosure, empty/refund/non-restaurant states;
the local renderer is SSR-only, so React events are separately unit-tested.

Production/staging migrations, hosted target-save acceptance and live release
are not completed by these local checks. Apply the additive
`202611050001_sales_month_target.sql` before exposing target saves in an
approved environment. Preserve the unrelated unmerged Airレジ work/PR210.
