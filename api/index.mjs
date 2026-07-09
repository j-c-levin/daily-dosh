import { randomUUID } from 'node:crypto';
import { getUser, saveUser } from './src/store.mjs';
import {
  MonzoError,
  exchangeCode,
  refreshTokens,
  getAccounts,
  getBalance,
  getTransactions,
} from './src/monzo.mjs';
import {
  detectPayday,
  periodCutoff,
  recentCredits,
  buildPeriod,
  periodFromDates,
  daysElapsed,
} from './src/period.mjs';

const CLIENT_ID = process.env.MONZO_CLIENT_ID;
const CLIENT_SECRET = process.env.MONZO_CLIENT_SECRET;

// How far back we look to find the current payday + this month's spending.
// A financial month is ~30 days, comfortably inside Monzo's 90-day window.
const LOOKBACK_DAYS = 40;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function lookbackIso(days = LOOKBACK_DAYS) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Make sure the stored access token is valid, refreshing if needed.
 * Refresh tokens are single-use and rotated on every refresh, so we persist
 * the new pair immediately. Returns the user (possibly updated) or throws
 * `reauth` if the refresh token is no longer valid.
 */
async function ensureAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  if (user.accessToken && user.accessTokenExpiry && user.accessTokenExpiry > now + 60) {
    return user;
  }
  try {
    const t = await refreshTokens({
      refreshToken: user.refreshToken,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
    user.accessToken = t.access_token;
    user.refreshToken = t.refresh_token ?? user.refreshToken;
    user.accessTokenExpiry = now + (t.expires_in ?? 0);
    await saveUser(user);
    return user;
  } catch (e) {
    const err = new Error('reauth');
    err.code = 'reauth';
    throw err;
  }
}

/** Resolve (and cache) the user's personal current account id. */
async function ensureAccount(user) {
  if (user.accountId) return user;
  const { accounts = [] } = await getAccounts(user.accessToken);
  const open = accounts.filter((a) => !a.closed);
  const retail =
    open.find((a) => a.type === 'uk_retail') || open[0];
  if (!retail) throw new MonzoError(404, 'no account');
  user.accountId = retail.id;
  await saveUser(user);
  return user;
}

function mapTransaction(t, ignoredSet) {
  return {
    id: t.id,
    created: t.created,
    amount: t.amount,
    description: t.counterparty?.name || t.merchant?.name || t.description,
    emoji: t.merchant?.emoji || null,
    logo: t.merchant?.logo || null,
    category: t.category || null,
    ignored: ignoredSet.has(t.id),
  };
}

// ---- route handlers --------------------------------------------------------

function handleConfig() {
  return json(200, { clientId: CLIENT_ID, authUrl: 'https://auth.monzo.com/' });
}

async function handleAuth(event) {
  const { code, redirectUri } = parseBody(event);
  if (!code || !redirectUri) return json(400, { error: 'code and redirectUri required' });

  const t = await exchangeCode({ code, redirectUri, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: randomUUID(),
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    accessTokenExpiry: now + (t.expires_in ?? 0),
    ignoredTransactionIds: [],
  };
  await saveUser(user);
  return json(200, { storageKey: user.id });
}

/**
 * The single data endpoint. Returns one of a handful of statuses that drive
 * the whole UI state machine.
 */
async function handleState(user) {
  user = await ensureAccessToken(user);

  // The access token has no permissions until the user approves access in
  // their Monzo app (SCA). Until then Monzo answers 403.
  try {
    user = await ensureAccount(user);
  } catch (e) {
    if (e instanceof MonzoError && (e.status === 401 || e.status === 403)) {
      return json(200, { status: 'awaiting_approval' });
    }
    throw e;
  }

  const all = await getTransactions(user.accessToken, user.accountId, lookbackIso());
  const transactions = all.transactions ?? [];

  if (!user.employerName) {
    return json(200, { status: 'needs_employer', recentCredits: recentCredits(transactions) });
  }

  const payday = detectPayday(transactions, user.employerName, user.dismissedPaydayIds);
  const storedPayday = user.period?.paydayDate;
  const detectedDate = payday ? payday.created.slice(0, 10) : null;

  // A new financial month has landed if we see an employer credit newer than
  // the period we last snapshotted. We ask the user to confirm it's really pay
  // (and that they've swept money into pots) before snapshotting the balance.
  if (detectedDate && detectedDate !== storedPayday) {
    return json(200, {
      status: 'new_month',
      employerName: user.employerName,
      payday: { id: payday.id, date: detectedDate, amount: payday.amount },
      lastMonth: user.lastKnown ?? null,
    });
  }

  if (!user.period) {
    // Employer set but no payday found yet in the window.
    return json(200, { status: 'no_payday' });
  }

  return json(200, buildReadyState(user, transactions));
}

function buildReadyState(user, transactions) {
  const { paydayDate, nextPaydayDate, daysInPeriod, disposablePot } = user.period;
  const ignored = new Set(user.ignoredTransactionIds ?? []);
  const paydayId = user.period.paydayTransactionId ?? null;

  const cutoff = periodCutoff(user.period, transactions, user);
  // `>=` keeps the payday credit itself in the list as the bottom-of-list anchor;
  // anything before it still belongs to last month.
  const periodTx = transactions
    .filter((t) => new Date(t.created) >= new Date(cutoff))
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  // Identify the payday credit so the UI can mark it and keep it out of the
  // ignore toggle (it's income - ignoring it would corrupt the spend figure).
  const isPayday = (t) =>
    paydayId ? t.id === paydayId : t.created === cutoff && t.amount > 0;

  return {
    status: 'ready',
    period: {
      paydayDate,
      nextPaydayDate,
      daysInPeriod,
      disposablePot,
      paydayTransactionId: paydayId,
      paydayAt: user.period.paydayAt ?? null,
    },
    employerName: user.employerName,
    transactions: periodTx.map((t) => {
      const row = mapTransaction(t, ignored);
      if (isPayday(t)) {
        row.isPayday = true;
        row.ignored = false; // the payday credit is never counted as ignored spend
      }
      return row;
    }),
    // `currentBalance` and the derived numbers are filled in by the caller,
    // which has just fetched the live balance.
  };
}

/** Compute the live spend figures given the current main-account balance. */
function withBalance(state, currentBalance) {
  const { disposablePot, daysInPeriod, paydayDate } = state.period;
  const ignoredAdjustment = state.transactions
    .filter((t) => t.ignored)
    .reduce((sum, t) => sum + t.amount, 0); // ignored debits are negative -> reduces spend

  const spent = disposablePot - currentBalance + ignoredAdjustment;
  const elapsed = daysElapsed(paydayDate);
  const dailyAllowance = disposablePot / daysInPeriod;
  const allowedSoFar = Math.min(elapsed, daysInPeriod) * dailyAllowance;

  return {
    ...state,
    currentBalance,
    spent,
    dailyAllowance,
    daysElapsed: elapsed,
    daysRemaining: Math.max(0, daysInPeriod - elapsed),
    // Headline: the cumulative allowance accrued since payday minus everything
    // spent. Unspent days roll forward into a surplus; overspending shows as
    // negative and is pulled back as each new day adds another day's allowance.
    safeToSpend: allowedSoFar - spent,
    // Straight-line extrapolation of the average daily spend so far across the
    // whole period. Positive = on pace to finish with money left; negative = overshoot.
    projectedOutcome: Math.round(disposablePot - (spent / elapsed) * daysInPeriod),
  };
}

async function handleStateWithBalance(user) {
  const result = await handleState(user);
  const payload = JSON.parse(result.body);
  if (payload.status !== 'ready') return result;
  const balance = await getBalance(user.accessToken, user.accountId);
  const ready = withBalance(payload, balance.balance);

  // Persist the last-seen ready position so it can be played back once this
  // month rolls over and the balance-derived figures are no longer computable.
  const safeToSpend = Math.round(ready.safeToSpend);
  const date = new Date().toISOString().slice(0, 10);
  if (user.lastKnown?.safeToSpend !== safeToSpend || user.lastKnown?.date !== date) {
    user.lastKnown = { safeToSpend, date };
    await saveUser(user);
  }

  return json(200, ready);
}

async function handleConfirmBuckets(user) {
  user = await ensureAccessToken(user);
  user = await ensureAccount(user);

  const all = await getTransactions(user.accessToken, user.accountId, lookbackIso());
  const transactions = all.transactions ?? [];
  const payday = detectPayday(transactions, user.employerName, user.dismissedPaydayIds);
  if (!payday) return json(400, { error: 'no payday transaction found to confirm' });

  // Snapshot the main-account balance *now* - after the user has moved money
  // into pots, whatever remains is the disposable pot for this month.
  const balance = await getBalance(user.accessToken, user.accountId);
  user.period = buildPeriod(payday.created.slice(0, 10), balance.balance);
  await saveUser(user);

  return handleStateWithBalance(user);
}

async function handleReset(event, user) {
  const { startDate, endDate, potAmount, paydayTransactionId, paydayAt } = parseBody(event);
  if (!startDate || !endDate || potAmount == null) {
    return json(400, { error: 'startDate, endDate and potAmount are required' });
  }
  const pot = Math.round(Number(potAmount) * 100); // pounds -> pence
  if (!Number.isFinite(pot) || pot < 0) return json(400, { error: 'invalid potAmount' });
  if (new Date(endDate) <= new Date(startDate)) {
    return json(400, { error: 'end date must be after start date' });
  }
  // The user can mark the exact transaction that is their payday; we anchor the
  // financial month to its timestamp so same-day pre-pay spending is excluded.
  user.period = {
    ...periodFromDates(startDate, endDate, pot),
    paydayTransactionId: paydayTransactionId || null,
    paydayAt: paydayAt || null,
  };
  await saveUser(user);
  return handleStateWithBalance(user);
}

/** A single day's transactions, for the "pick your payday" selector. */
async function handleDay(event, user) {
  user = await ensureAccessToken(user);
  user = await ensureAccount(user);
  const date = (event.queryStringParameters ?? {}).date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json(400, { error: 'date (YYYY-MM-DD) required' });
  }
  const ignored = new Set(user.ignoredTransactionIds ?? []);
  const all = await getTransactions(user.accessToken, user.accountId, `${date}T00:00:00.000Z`);
  const dayTx = (all.transactions ?? [])
    .filter((t) => t.created.slice(0, 10) === date)
    .sort((a, b) => new Date(a.created) - new Date(b.created)) // chronological
    .map((t) => mapTransaction(t, ignored));
  return json(200, { date, transactions: dayTx });
}

async function handleDismissPayday(event, user) {
  const { transactionId } = parseBody(event);
  if (!transactionId) return json(400, { error: 'transactionId required' });
  const set = new Set(user.dismissedPaydayIds ?? []);
  set.add(transactionId);
  user.dismissedPaydayIds = [...set];
  await saveUser(user);
  return handleStateWithBalance(user);
}

async function handleSettings(event, user) {
  const { employerName } = parseBody(event);
  if (typeof employerName === 'string' && employerName.trim()) {
    user.employerName = employerName.trim();
  }
  await saveUser(user);
  return handleStateWithBalance(user);
}

async function handleIgnore(event, user) {
  const { transactionId } = parseBody(event);
  if (!transactionId) return json(400, { error: 'transactionId required' });
  const set = new Set(user.ignoredTransactionIds ?? []);
  set.has(transactionId) ? set.delete(transactionId) : set.add(transactionId);
  user.ignoredTransactionIds = [...set];
  await saveUser(user);
  return handleStateWithBalance(user);
}

// ---- router ----------------------------------------------------------------

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = (event.rawPath ?? '/').replace(/\/+$/, '') || '/';
  const query = event.queryStringParameters ?? {};

  try {
    if (method === 'OPTIONS') return { statusCode: 204 };
    if (path === '/api/config') return handleConfig();
    if (path === '/api/auth' && method === 'POST') return await handleAuth(event);

    // Everything past here needs a storage key.
    const routesNeedingUser = [
      '/api/state',
      '/api/day',
      '/api/confirm-buckets',
      '/api/dismiss-payday',
      '/api/reset',
      '/api/settings',
      '/api/ignore',
    ];
    if (routesNeedingUser.includes(path)) {
      const authHeader = event.headers?.authorization ?? '';
      const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
      const storageKey = bearerMatch?.[1] ?? query.storage_key;
      if (!storageKey) return json(400, { error: 'storage_key required' });
      const user = await getUser(storageKey);
      if (!user) return json(404, { error: 'unknown storage key' });

      try {
        if (path === '/api/state') return await handleStateWithBalance(user);
        if (path === '/api/day') return await handleDay(event, user);
        if (path === '/api/confirm-buckets' && method === 'POST') return await handleConfirmBuckets(user);
        if (path === '/api/dismiss-payday' && method === 'POST') return await handleDismissPayday(event, user);
        if (path === '/api/reset' && method === 'POST') return await handleReset(event, user);
        if (path === '/api/settings' && method === 'POST') return await handleSettings(event, user);
        if (path === '/api/ignore' && method === 'POST') return await handleIgnore(event, user);
      } catch (e) {
        if (e.code === 'reauth') return json(200, { status: 'reauth' });
        throw e;
      }
    }

    return json(404, { error: 'not found' });
  } catch (e) {
    console.error('handler error', e);
    const detail = e instanceof MonzoError ? e.body : e.message;
    return json(500, { error: 'internal error', detail });
  }
}
