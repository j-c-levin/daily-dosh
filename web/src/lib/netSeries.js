// Per-day net position for the trail chart: net(d) = d × dailyAllowance − cumulativeSpend(d).
// Zero means "spent exactly what you've earned so far"; above zero is saving, below is
// overspending. The final (today) point is pinned to the balance-derived safeToSpend so
// the chart always ends exactly where the hero number says.
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

  // Net spend per day-offset from payday: credits net against spend, payday itself excluded.
  const byDay = new Map();
  for (const t of transactions) {
    if (t.ignored || t.isPayday) continue;
    const d = dayOffset(londonDate(t.created));
    byDay.set(d, (byDay.get(d) || 0) - t.amount);
  }

  // Index d covers spend through the end of calendar day-offset d−1, so we accumulate the
  // PREVIOUS day's bucket before pushing: today's spend must not retroactively move
  // yesterday's point. Day-0 spend (payday itself) rolls into index 1, not index 0.
  let spent = 0;
  const series = [0];
  for (let d = 1; d <= lastDay; d++) {
    spent += byDay.get(d - 1) || 0;
    series.push(d * dailyAllowance - spent);
  }

  // Today's point comes from the live balance, not the transaction list.
  series[series.length - 1] = safeToSpend;
  return series;
}
