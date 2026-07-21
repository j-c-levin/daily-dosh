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
