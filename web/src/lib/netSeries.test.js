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
  // is attributed to the opening baseline, where the balance model puts it: walking
  // backward from safeToSpend, spentToday = 200 − (−6230) = 6430; offset-1 spend (−100)
  // peels off for index 1, leaving 6330 unexplained in the baseline: net(1) = 100 − 6330.
  assert.equal(series.at(-1), -6230);
  assert.deepEqual(series.slice(0, -1), [0, -6230]);
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

test('spend after the clamped period end still peels off the whole tail', () => {
  const series = buildNetSeries({
    ...base,
    daysInPeriod: 2,
    daysElapsed: 5,
    transactions: [tx('2026-07-01', -250), tx('2026-07-05', -100)], // offsets 0 and 4
    safeToSpend: -150, // spend to date = 2×100 − (−150) = 350
  });
  // Index 1 excludes everything at offset ≥ 1 — including the post-period −100 at
  // offset 4, which sits beyond lastDay: cumSpend(1) = 350 − 100 = 250 → net = −150.
  assert.deepEqual(series, [0, -150, -150]);
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
