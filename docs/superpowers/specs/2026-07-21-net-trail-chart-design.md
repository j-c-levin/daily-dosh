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

- Day 0 (payday) is 0 by definition.
- The y-axis baseline is a horizontal **net-zero line**: above = saving,
  below = overspending. Ending the month at 0 means you spent exactly what you
  earned.
- The old diagonal allowance line is removed — pace is baked into the metric,
  so the zero line replaces it.
- No clamping to ≥ 0 (the old `Math.max(0, running)` goes away); negative
  values are the point.

### Today's dot (live)

The final point of the trail is pinned to the server's balance-derived
`state.safeToSpend`, so the chart always ends exactly where the hero number
says. Historical days remain transaction-derived with unchanged rules:
`ignored` and `isPayday` transactions excluded, credits net against spend,
UK civil dates for day bucketing.

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

- Day 1 of a month (single point): renders a dot pinned to `safeToSpend`.
- `projectedOutcome` division by `elapsed` is already guarded server-side.
- Period rolled over (`daysElapsed > daysInPeriod`): trail is clamped to the
  period end, as today.

## Out of scope

- Any change to server-side calculations.
- Axis labels, tooltips, or interactivity — this remains a sparkline.
