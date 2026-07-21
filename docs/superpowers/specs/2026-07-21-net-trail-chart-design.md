# Net-position trail chart

**Date:** 2026-07-21
**Status:** Approved

## Problem

The current chart (`web/src/lib/BurnDown.svelte`) plots cumulative spend against a
diagonal "allowance pace" line. Two problems:

1. **Unintuitive.** A user who front-loads spending (rent, bills) sees the spend
   line jump to the top on day 1 and sit above the pace line all month. Reading
   "line above diagonal = behind" takes two mental steps, and the picture never
   visibly recovers even as daily allowance accrues.
2. **Inconsistent with the hero.** The chart's points are transaction-derived
   while the hero's `safeToSpend` is balance-derived
   (`spent = pot − balance + ignoredAdjustment`, `api/index.mjs` `withBalance`).
   The two can disagree, so the chart's "today" doesn't match the headline.

## Design

### Semantics

Plot the **net position** — the same metric as the hero — for each day since
payday:

```
net(day) = day × dailyAllowance − cumulativeSpend(day)
```

`net(d)` at series index `d` covers spend through calendar day-offset `d−1` —
i.e. it is the end-of-previous-day position (the server counts payday itself
as day 1, so payday-day spend at offset 0 lands in index 1). This keeps
today's spend from retroactively dragging down yesterday's already-drawn dot.

History is reconstructed **backward** from the balance-derived `safeToSpend`,
not forward from zero. The hero's `spent` is snapshotted from the balance
*after* the user sweeps their salary into pots on payday
(`spent = pot − balance + ignoredAdjustment`), so a forward sum over the
transaction list would count that pot sweep as day-1 spend — a false trench
all month, cliffing back to the real value at the pinned endpoint. Walking
backward instead peels off each day's known transactions from the running
total; anything unexplained (the pot sweep, or any other balance/transaction
drift) rides down into the opening baseline — where the balance model puts
it — instead of being painted as spending on a day it never happened.

- Day 0 (payday) is 0 by definition — the opening baseline that absorbs
  unexplained pot sweeps and drift.
- The y-axis baseline is a horizontal **net-zero line**: above = saving,
  below = overspending. Ending the month at 0 means you spent exactly what you
  earned.
- The old diagonal allowance line is removed — pace is baked into the metric,
  so the zero line replaces it.
- No clamping to ≥ 0 (the old `Math.max(0, running)` goes away); negative
  values are the point.

### Today's dot (live)

The final point of the trail is pinned to the server's balance-derived
`state.safeToSpend` — both because that's the whole point of walking
backward from it, and as an explicit safety net (it also handles the
`daysElapsed === 0` single-point case, where the backward walk has nothing
to peel off). Historical days are derived by peeling transactions off that
endpoint, day by day, going backward: `ignored` and `isPayday` transactions
excluded, credits net against spend, UK civil dates for day bucketing.

### Colour

The trail is drawn twice and clipped at the zero line using two SVG
`<clipPath>` rects: green (`var(--good)`) above zero, red (`var(--bad)`)
below, with matching low-opacity area fills. Paths stay continuous, so
crossings have no seams.

### Projection

A faint dotted line continues from today's dot to `state.projectedOutcome` at
`x = daysInPeriod`. `projectedOutcome` is already the projected end-of-month
net position (`disposablePot − (spent / elapsed) × daysInPeriod`), so it lands
on this chart's scale natively.

### Scale

Y-domain is `[min(series, projection, 0) … max(series, projection, 0)]` with
padding; the zero line is always in view. X spans the full financial month, so
the untravelled right side shows the remaining days.

## Structure

- **`web/src/lib/netSeries.js`** — new pure helper that builds the per-day net
  series from `(transactions, paydayDate, daysInPeriod, daysElapsed,
  dailyAllowance, safeToSpend)`. Unit-tested with `node --test` (same approach
  as `api/src/period.test.mjs`; no new test framework).
- **`web/src/lib/NetTrail.svelte`** — renamed from `BurnDown.svelte` (it is no
  longer a burn-down chart). Consumes `netSeries.js`; takes new props
  `safeToSpend` and `projectedOutcome`.
- **`web/src/App.svelte`** — passes the two new props; component tag renamed.

## Edge cases

- Day 1 of a month (single point): the server's `daysElapsed` is never below
  1, so in practice day 1 renders as a two-point line (payday anchor plus
  today's dot); the single-point branch (`daysElapsed` 0) only exists as
  defence-in-depth and renders a dot pinned to `safeToSpend`.
- `projectedOutcome` division by `elapsed` is already guarded server-side.
- Period rolled over (`daysElapsed > daysInPeriod`): trail is clamped to the
  period end, as today.

## Out of scope

- Any change to server-side calculations.
- Axis labels, tooltips, or interactivity — this remains a sparkline.
