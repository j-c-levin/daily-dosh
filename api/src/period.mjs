const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** yyyy-mm-dd for a Date, in UTC. */
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** UTC-midnight Date from a yyyy-mm-dd string or ISO timestamp. */
function utcMidnight(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Find the most recent salary credit matching the employer name.
 *
 * Salary arrives as an inbound bank transfer (amount > 0, a `counterparty`,
 * and no `merchant`). We deliberately ignore card transactions: if your
 * employer is also a merchant you buy from - e.g. Deliveroo - an incoming
 * refund on a food order would otherwise be mistaken for payday.
 */
export function detectPayday(transactions, employerName) {
  if (!employerName) return null;
  const needle = employerName.trim().toLowerCase();

  const matches = transactions
    .filter((t) => t.amount > 0 && !t.merchant)
    .filter((t) => {
      const haystacks = [t.counterparty?.name, t.description];
      return haystacks.some((h) => h && h.toLowerCase().includes(needle));
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  return matches[0] ?? null;
}

/**
 * Recent inbound bank transfers, newest first - used to help the user pick an
 * employer. Card refunds (which carry a `merchant`) are excluded so the
 * suggestions are the senders that could plausibly be payroll.
 */
export function recentCredits(transactions) {
  return transactions
    .filter((t) => t.amount > 0 && !t.merchant)
    .sort((a, b) => new Date(b.created) - new Date(a.created))
    .map((t) => ({
      id: t.id,
      created: t.created,
      amount: t.amount,
      name: t.counterparty?.name || t.merchant?.name || t.description,
    }));
}

/**
 * Estimate the next payday. Nominally the 25th of the following month,
 * rolled back to the Friday before if it lands on a weekend (Monzo pays
 * early, and BACS settles the working day before).
 */
export function estimateNextPayday(paydayDate) {
  const d = utcMidnight(paydayDate);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 25));
  const dow = next.getUTCDay(); // 0 Sun .. 6 Sat
  if (dow === 6) next.setUTCDate(next.getUTCDate() - 1); // Sat -> Fri
  if (dow === 0) next.setUTCDate(next.getUTCDate() - 2); // Sun -> Fri
  return isoDate(next);
}

/** Build the financial-month descriptor from a detected payday date. */
export function buildPeriod(paydayDate, disposablePot) {
  const payday = isoDate(utcMidnight(paydayDate));
  const nextPaydayDate = estimateNextPayday(payday);
  const daysInPeriod = Math.round(
    (utcMidnight(nextPaydayDate) - utcMidnight(payday)) / MS_PER_DAY
  );
  return { paydayDate: payday, nextPaydayDate, daysInPeriod, disposablePot };
}

/** Days elapsed since payday, inclusive of today (day 1 is payday itself). */
export function daysElapsed(paydayDate, now = new Date()) {
  const diff = Math.floor((utcMidnight(now) - utcMidnight(paydayDate)) / MS_PER_DAY) + 1;
  return Math.max(1, diff);
}

export { isoDate };
