# Net-Position Trail Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the burn-down sparkline with a net-position trail: a zero baseline where above = saving, below = overspending, today's dot pinned to the hero's `safeToSpend`, and a dotted projection to month-end.

**Architecture:** A pure ESM helper (`netSeries.js`) builds the per-day net series from the transaction list and pins the final point to the balance-derived `safeToSpend`. A renamed Svelte component (`NetTrail.svelte`) renders it as an inline SVG, split-coloured at the zero line with two `clipPath` rects. `App.svelte` passes two new props from state the server already returns.

**Tech Stack:** Svelte 4, Vite 5, inline SVG (no chart library), `node --test` for the helper's unit tests.

**Spec:** `docs/superpowers/specs/2026-07-21-net-trail-chart-design.md`

## Global Constraints

- Amounts are integer/float **pence** throughout; only `format.js money()` renders pounds.
- Day bucketing uses **UK civil dates** (`Europe/London` via `Intl.DateTimeFormat('en-CA')`) — must match the server's day boundary.
- `ignored` and `isPayday` transactions are excluded from the series; credits net against spend (transaction `amount` is negative for debits).
- No new runtime dependencies.
- No server-side changes.

---

### Task 1: `netSeries.js` helper with unit tests

**Files:**
- Create: `web/src/lib/netSeries.js`
- Create: `web/src/lib/netSeries.test.js`
- Modify: `web/package.json` (add test script)
- Modify: `.github/workflows/deploy.yml:25-27` (add web test step after API tests)

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `buildNetSeries({ transactions, paydayDate, daysInPeriod, daysElapsed, dailyAllowance, safeToSpend }) -> number[]` — element `d` is the net position in pence at the **end of calendar day-offset `d−1`** from payday (the server counts payday itself as day 1, so payday-day spend at offset 0 lands in index 1); index 0 is always the zero anchor; the **last** element is always exactly `safeToSpend`. Length is `min(daysElapsed, daysInPeriod) + 1`, minimum 1.

- [ ] **Step 1: Add the test script to `web/package.json`**

In `web/package.json`, add to `"scripts"`:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test src/lib"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `web/src/lib/netSeries.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetSeries } from './netSeries.js';

// Noon UTC is safely inside the same UK civil day year-round.
const tx = (dayIso, amount, extra = {}) => ({
  created: `${dayIso}T12:00:00Z`,
  amount,
  ...extra,
});

const base = {
  paydayDate: '2026-07-01',
  daysInPeriod: 30,
  dailyAllowance: 100, // £1/day keeps the maths readable
};

test('payday anchors at zero and each day earns its allowance', () => {
  const series = buildNetSeries({
    ...base,
    daysElapsed: 3,
    transactions: [],
    safeToSpend: 300,
  });
  // Day 0 = 0; with no spend, net(d) = d × allowance; last point pinned (here identical).
  assert.deepEqual(series, [0, 100, 200, 300]);
});

test('spending pulls the trail down and can go negative (no clamping)', () => {
  const series = buildNetSeries({
    ...base,
    daysElapsed: 3,
    transactions: [tx('2026-07-01', -250)],
    safeToSpend: 50,
  });
  // Day-0 spend rolls into day 1: net(1) = 100 − 250 = −150, net(2) = −50, net(3) pinned to 50.
  assert.deepEqual(series, [0, -150, -50, 50]);
});

test('credits net against spend', () => {
  const series = buildNetSeries({
    ...base,
    daysElapsed: 2,
    transactions: [tx('2026-07-02', -300), tx('2026-07-02', 100)],
    safeToSpend: 0,
  });
  // Day-1 (offset 1) net spend is 200, but it lands in index 2, not index 1: index 1
  // still shows the +100 the hero displayed at end of payday. Last point pinned to 0.
  assert.deepEqual(series, [0, 100, 0]);
});

test('ignored and payday transactions are excluded', () => {
  const series = buildNetSeries({
    ...base,
    daysElapsed: 2,
    transactions: [
      tx('2026-07-01', 150000, { isPayday: true }),
      tx('2026-07-02', -500, { ignored: true }),
    ],
    safeToSpend: 200,
  });
  assert.deepEqual(series, [0, 100, 200]);
});

test('last point is pinned to safeToSpend even when transactions disagree', () => {
  const series = buildNetSeries({
    ...base,
    daysElapsed: 2,
    transactions: [tx('2026-07-02', -100)],
    safeToSpend: -6230,
  });
  // Unexplained drift between the transaction list and the live balance (here £63.30)
  // is attributed to the opening baseline, where the balance model puts it.
  assert.equal(series.at(-1), -6230);
  assert.deepEqual(series.slice(0, -1), [0, -6230]);
});

test('payday-day pot sweeps land in the baseline, not painted as spending', () => {
  // The user sweeps £1400 into pots right after payday lands, then the pot is
  // snapshotted. The hero never counts the sweep as spend — the trail must not either.
  const series = buildNetSeries({
    ...base,
    daysElapsed: 3,
    transactions: [
      tx('2026-07-01', 150000, { isPayday: true }),
      tx('2026-07-01', -140000), // pot sweep, same day as payday
      tx('2026-07-03', -250), // real spend today
    ],
    safeToSpend: 50,
  });
  // Hero history: nothing spent until today. [0, 100, 200, 50] — no £1400 trench.
  assert.deepEqual(series, [0, 100, 200, 50]);
});

test('payday itself (daysElapsed 0) is a single point pinned to safeToSpend', () => {
  const series = buildNetSeries({
    ...base,
    daysElapsed: 0,
    transactions: [tx('2026-07-01', -400)],
    safeToSpend: -400,
  });
  assert.deepEqual(series, [-400]);
});

test('daysElapsed past the period end clamps to daysInPeriod', () => {
  const series = buildNetSeries({
    ...base,
    daysInPeriod: 2,
    daysElapsed: 5,
    transactions: [],
    safeToSpend: 200,
  });
  assert.equal(series.length, 3); // days 0, 1, 2
  assert.equal(series.at(-1), 200);
});

test("today's spend does not alter yesterday's point", () => {
  const series = buildNetSeries({
    ...base,
    daysElapsed: 3,
    transactions: [tx('2026-07-03', -250)], // spent today (offset 2)
    safeToSpend: 50,
  });
  // Yesterday (index 2) still shows the position the hero showed that day: +200.
  assert.deepEqual(series, [0, 100, 200, 50]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && npm test`
Expected: FAIL — `Cannot find module '.../netSeries.js'`

- [ ] **Step 4: Write the implementation**

Create `web/src/lib/netSeries.js`:

```js
// Per-day net position for the trail chart: net(d) = d × dailyAllowance − cumulativeSpend(d).
// Zero means "spent exactly what you've earned so far"; above zero is saving, below is
// overspending.
//
// History is reconstructed BACKWARD from the live balance-derived position, not forward
// from zero. The hero's spend figure comes from the balance (`spent = pot − balance +
// ignoredAdjustment`, see api/index.mjs `withBalance`), whose baseline is snapshotted
// AFTER the user sweeps their salary into pots on payday. A forward sum over the
// transaction list would count that pot sweep (and any other payday-day transfers) as
// day-1 spend, painting a false trench that the pinned final point then cliffs back out
// of. Walking backward from `safeToSpend` instead peels off each day's known spend as we
// go, so anything unexplained — the pot sweep, or any other balance/transaction drift —
// is left sitting in the opening baseline, exactly where the balance model puts it,
// rather than being painted as spending on a day it never happened.
//
// Index d is the position at the END of calendar day-offset d−1 from payday (the server
// counts payday itself as day 1). So payday-day spend (offset 0) lands in index 1, and
// index 0 is always the zero anchor before any spend has been attributed.

// UK civil date (matches the server's day boundary), not the transaction's UTC date.
const londonDate = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso));

export function buildNetSeries({
  transactions,
  paydayDate,
  daysInPeriod,
  daysElapsed,
  dailyAllowance,
  safeToSpend,
}) {
  const lastDay = Math.max(0, Math.min(daysElapsed, daysInPeriod));
  const dayOffset = (dateStr) =>
    Math.round((new Date(dateStr) - new Date(paydayDate)) / 86400000);

  // Raw amount per day-offset from payday (negative for debits), payday itself and
  // ignored transactions excluded. Credits net against spend within a day.
  const byOffset = new Map();
  for (const t of transactions) {
    if (t.ignored || t.isPayday) continue;
    const d = dayOffset(londonDate(t.created));
    byOffset.set(d, (byOffset.get(d) || 0) + t.amount);
  }

  // What the balance model says was spent since payday, in total: safeToSpend =
  // lastDay × dailyAllowance − spentToday, so spentToday is the residual regardless of
  // how the transaction list's day-by-day shape lines up with it.
  const spentToday = lastDay * dailyAllowance - safeToSpend;

  // Walk backward from "now" (index lastDay): index d excludes everything at day-offset
  // ≥ d, so each step down peels that day-offset's transactions off the running spend
  // total. Whatever can't be peeled off — a payday-day pot sweep, or any other drift —
  // simply rides all the way down into index 0, the opening baseline.
  const series = new Array(lastDay + 1).fill(0);
  let tailSum = byOffset.get(lastDay) || 0; // Σ amount for offset ≥ lastDay
  series[lastDay] = lastDay * dailyAllowance - (spentToday + tailSum);
  for (let d = lastDay - 1; d >= 1; d--) {
    tailSum += byOffset.get(d) || 0; // now Σ amount for offset ≥ d
    series[d] = d * dailyAllowance - (spentToday + tailSum);
  }

  // Today's point comes from the live balance, not the transaction list (also covers the
  // lastDay === 0 single-point case, where the loop above never runs).
  series[series.length - 1] = safeToSpend;
  return series;
}
```

Note: when `lastDay` is 0 the series is the single element `[safeToSpend]` — the pin overwrites the zero anchor, which is what the "single dot" edge case in the spec wants.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npm test`
Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 6: Add the web test step to CI**

In `.github/workflows/deploy.yml`, directly after the "Run API tests" step (lines 25–27), add:

```yaml
      - name: Run web tests
        working-directory: web
        run: npm test
```

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/netSeries.js web/src/lib/netSeries.test.js web/package.json .github/workflows/deploy.yml
git commit -m "Add net-position series helper with tests

net(d) = d × dailyAllowance − cumulativeSpend(d), final point pinned to
the balance-derived safeToSpend so the chart and hero always agree.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `NetTrail.svelte` component, wire into `App.svelte`, remove `BurnDown.svelte`

**Files:**
- Create: `web/src/lib/NetTrail.svelte`
- Delete: `web/src/lib/BurnDown.svelte`
- Modify: `web/src/App.svelte:6` (import), `web/src/App.svelte:325-334` (usage), `web/src/App.svelte:397-399` (CSS class rename)

**Interfaces:**
- Consumes: `buildNetSeries({ transactions, paydayDate, daysInPeriod, daysElapsed, dailyAllowance, safeToSpend }) -> number[]` from Task 1.
- Produces: `<NetTrail daysInPeriod paydayDate daysElapsed dailyAllowance transactions safeToSpend projectedOutcome />` — all pence values come straight off the server `state` object.

- [ ] **Step 1: Create the component**

Create `web/src/lib/NetTrail.svelte`:

```svelte
<script>
  import { money } from './format.js';
  import { buildNetSeries } from './netSeries.js';

  export let daysInPeriod; // total days in the financial month
  export let paydayDate; // yyyy-mm-dd
  export let daysElapsed; // days since payday (today = daysElapsed)
  export let dailyAllowance; // pence per day
  export let transactions; // this month's transactions, newest first
  export let safeToSpend; // pence, balance-derived — today's dot is pinned to this
  export let projectedOutcome; // pence, projected end-of-month net position

  const H = 64;
  const PAD = 6; // room for the end-dot ring and stroke width without clipping

  let width = 0; // measured card width in px; viewBox tracks it 1:1 so nothing distorts

  $: series = buildNetSeries({
    transactions,
    paydayDate,
    daysInPeriod,
    daysElapsed,
    dailyAllowance,
    safeToSpend,
  });

  // Zero is always in the domain so the baseline stays on screen; the projection
  // endpoint is included so the dotted line is never clipped.
  $: yMin = Math.min(0, projectedOutcome, ...series);
  $: yMax = Math.max(0, projectedOutcome, ...series);
  $: span = Math.max(yMax - yMin, 1);

  $: plotW = width - PAD * 2;
  $: plotH = H - PAD * 2;
  $: x = (day) => PAD + (day / daysInPeriod) * plotW;
  $: y = (pence) => PAD + ((yMax - pence) / span) * plotH;

  $: zeroY = y(0);
  $: points = series.map((v, d) => ({ x: x(d), y: y(v) }));
  $: lastDay = points.length - 1;
  $: trailPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  $: areaPath =
    points.length > 1
      ? `M${points[0].x},${zeroY} L${points.map((p) => `${p.x},${p.y}`).join(' L')} L${points[points.length - 1].x},${zeroY} Z`
      : '';
  $: dot = points[points.length - 1];
  $: projPath =
    dot && lastDay < daysInPeriod
      ? `M${dot.x},${dot.y} L${x(daysInPeriod)},${y(projectedOutcome)}`
      : '';

  $: ariaLabel =
    `Net position, day ${lastDay} of ${daysInPeriod}: ` +
    `${money(Math.abs(safeToSpend))} ${safeToSpend < 0 ? 'behind' : 'ahead'}, ` +
    `on pace to finish ${money(Math.abs(projectedOutcome))} ${projectedOutcome < 0 ? 'down' : 'up'}.`;
</script>

<div class="nettrail" bind:clientWidth={width}>
  {#if width > 0}
    <svg viewBox="0 0 {width} {H}" width="100%" height={H} preserveAspectRatio="none"
      role="img" aria-label={ariaLabel}>
      <defs>
        <!-- The trail is drawn twice, clipped at the zero line: green above, red below. -->
        <clipPath id="nt-above"><rect x="0" y={-H} width={width} height={zeroY + H} /></clipPath>
        <clipPath id="nt-below"><rect x="0" y={zeroY} width={width} height={H * 2} /></clipPath>
      </defs>
      <line class="zero" x1={PAD} y1={zeroY} x2={width - PAD} y2={zeroY} />
      {#if areaPath}
        <path class="area" d={areaPath} fill="var(--good)" clip-path="url(#nt-above)" />
        <path class="area" d={areaPath} fill="var(--bad)" clip-path="url(#nt-below)" />
      {/if}
      {#if points.length > 1}
        <path class="trail" d={trailPath} stroke="var(--good)" clip-path="url(#nt-above)" />
        <path class="trail" d={trailPath} stroke="var(--bad)" clip-path="url(#nt-below)" />
      {/if}
      {#if projPath}
        <path class="proj" d={projPath}
          stroke={projectedOutcome < 0 ? 'var(--bad)' : 'var(--good)'} />
      {/if}
      {#if dot}
        <circle cx={dot.x} cy={dot.y} r="4"
          fill={safeToSpend < 0 ? 'var(--bad)' : 'var(--good)'}
          stroke="var(--surface)" stroke-width="2" />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .nettrail {
    width: 100%;
    height: 64px;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .zero {
    stroke: var(--muted);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
    opacity: 0.6;
  }
  .area {
    stroke: none;
    fill-opacity: 0.12;
  }
  .trail {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .proj {
    fill: none;
    stroke-width: 1.5;
    stroke-dasharray: 2 4;
    stroke-linecap: round;
    opacity: 0.55;
  }
</style>
```

- [ ] **Step 2: Wire into `App.svelte`**

Change line 6 from:

```js
  import BurnDown from './lib/BurnDown.svelte';
```

to:

```js
  import NetTrail from './lib/NetTrail.svelte';
```

Replace lines 325–334:

```svelte
    <section class="card burndown-card">
      <BurnDown
        daysInPeriod={state.period.daysInPeriod}
        paydayDate={state.period.paydayDate}
        disposablePot={state.period.disposablePot}
        daysElapsed={state.daysElapsed}
        transactions={state.transactions}
        over={state.safeToSpend < 0}
      />
    </section>
```

with:

```svelte
    <section class="card trail-card">
      <NetTrail
        daysInPeriod={state.period.daysInPeriod}
        paydayDate={state.period.paydayDate}
        daysElapsed={state.daysElapsed}
        dailyAllowance={state.dailyAllowance}
        transactions={state.transactions}
        safeToSpend={state.safeToSpend}
        projectedOutcome={state.projectedOutcome}
      />
    </section>
```

In the `<style>` block (lines 397–399), rename the selector:

```css
  .trail-card {
    margin-bottom: 18px;
  }
```

- [ ] **Step 3: Delete the old component**

```bash
git rm web/src/lib/BurnDown.svelte
```

- [ ] **Step 4: Verify the build and tests**

Run: `cd web && npm test && npm run build`
Expected: tests PASS; `vite build` completes with no errors and no "BurnDown" references remain (`rg -n BurnDown web/src` returns nothing).

- [ ] **Step 5: Visual smoke check**

Run: `cd web && npm run dev` and open the app (or use the run skill / browser tooling).
Expected: the card shows a horizontal dashed zero line; the trail dips below it when overspent (red) and rises above it when saving (green); the end dot sits at the hero value's side of the line; a faint dotted line continues to the right edge.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.svelte web/src/lib/NetTrail.svelte
git commit -m "Replace burn-down sparkline with net-position trail

The y-axis baseline is now net zero: above the line you're saving,
below it you're overspending. Today's dot is pinned to the hero's
balance-derived safeToSpend, and a faint dotted line projects the
end-of-month outcome.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
