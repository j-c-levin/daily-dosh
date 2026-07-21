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
  // Day 1 net spend is 200: net(1) = 100 − 200 = −100; last point pinned to 0.
  assert.deepEqual(series, [0, -100, 0]);
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
  // Transaction-derived net(2) would be 100; the live balance says −6230. Hero wins.
  assert.equal(series.at(-1), -6230);
  assert.deepEqual(series.slice(0, -1), [0, 0]);
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
