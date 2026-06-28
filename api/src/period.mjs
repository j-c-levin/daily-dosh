const MS_PER_DAY = 1000 * 60 * 60 * 24;

// What counts as a payday credit (vs. an expense reimbursement from the same
// employer). Salary is large and lands around the 25th; expenses are smaller
// and can arrive any time. These guard against treating a reimbursement as pay.
const PAYDAY_MIN_AMOUNT = 500000; // £5,000 in pence
const PAYDAY_DAY_MIN = 20;
const PAYDAY_DAY_MAX = 25;

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
 * A payday credit must be all of:
 *  - an inbound bank transfer (amount > 0, a `counterparty`, no `merchant`) -
 *    so a card refund from a same-named merchant (e.g. a Deliveroo food order)
 *    can't be mistaken for pay;
 *  - over £5,000 and dated the 20th-25th - so an expense reimbursement from the
 *    same employer, which is smaller and can arrive any time, is left alone;
 *  - not previously dismissed by the user as "not my pay".
 *
 * Even when one matches, the UI still asks the user to confirm before it's
 * treated as the start of a new financial month.
 */
export function detectPayday(transactions, employerName, dismissedIds = []) {
  if (!employerName) return null;
  const needle = employerName.trim().toLowerCase();
  const dismissed = new Set(dismissedIds);

  const matches = transactions
    .filter((t) => t.amount > PAYDAY_MIN_AMOUNT && !t.merchant)
    .filter((t) => !dismissed.has(t.id))
    .filter((t) => {
      const day = new Date(t.created).getUTCDate();
      return day >= PAYDAY_DAY_MIN && day <= PAYDAY_DAY_MAX;
    })
    .filter((t) => {
      const haystacks = [t.counterparty?.name, t.description];
      return haystacks.some((h) => h && h.toLowerCase().includes(needle));
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  return matches[0] ?? null;
}

/**
 * The exact instant the financial month begins on `paydayDate`: the timestamp
 * of the payday credit itself. Money spent earlier the same day came out of
 * last month's budget and must not count against the new month, so the period
 * starts when pay actually lands - not at midnight.
 *
 * We look for the employer's inbound credit on that date (largest wins if there
 * are several), then fall back to the largest inbound credit of the day, then -
 * if no credit is visible for that day - to the start of the day in UTC.
 */
export function paydayInstant(transactions, employerName, paydayDate, dismissedIds = []) {
  const dismissed = new Set(dismissedIds);
  const needle = employerName?.trim().toLowerCase();

  const creditsToday = transactions
    .filter((t) => t.amount > 0 && !t.merchant && !dismissed.has(t.id))
    .filter((t) => t.created.slice(0, 10) === paydayDate);

  const matched = needle
    ? creditsToday.filter((t) =>
        [t.counterparty?.name, t.description].some(
          (h) => h && h.toLowerCase().includes(needle)
        )
      )
    : [];

  const pool = matched.length ? matched : creditsToday;
  if (pool.length === 0) return `${paydayDate}T00:00:00.000Z`;
  return pool.sort((a, b) => b.amount - a.amount)[0].created;
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

/** Build a financial-month descriptor from explicit start/end dates (manual override). */
export function periodFromDates(startDate, endDate, disposablePot) {
  const paydayDate = isoDate(utcMidnight(startDate));
  const nextPaydayDate = isoDate(utcMidnight(endDate));
  const daysInPeriod = Math.max(
    1,
    Math.round((utcMidnight(nextPaydayDate) - utcMidnight(paydayDate)) / MS_PER_DAY)
  );
  return { paydayDate, nextPaydayDate, daysInPeriod, disposablePot };
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
