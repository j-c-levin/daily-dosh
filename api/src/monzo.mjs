const BASE = 'https://api.monzo.com';

export class MonzoError extends Error {
  constructor(status, body) {
    super(`Monzo API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

async function call(method, path, { token, form, query } = {}) {
  let url = `${BASE}${path}`;
  if (query) url += '?' + new URLSearchParams(query).toString();

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  if (!res.ok) throw new MonzoError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export function exchangeCode({ code, redirectUri, clientId, clientSecret }) {
  return call('POST', '/oauth2/token', {
    form: {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    },
  });
}

export function refreshTokens({ refreshToken, clientId, clientSecret }) {
  return call('POST', '/oauth2/token', {
    form: {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    },
  });
}

export function getAccounts(token) {
  return call('GET', '/accounts', { token });
}

export function getBalance(token, accountId) {
  return call('GET', '/balance', { token, query: { account_id: accountId } });
}

const TX_PAGE_LIMIT = 100; // Monzo's max page size (the unset default is only 30)
const TX_MAX_PAGES = 50; // safety cap: 5,000 transactions is far more than a financial month

function getTransactionsPage(token, accountId, since) {
  const query = { account_id: accountId, 'expand[]': 'merchant', limit: String(TX_PAGE_LIMIT) };
  if (since) query.since = since;
  return call('GET', '/transactions', { token, query });
}

/**
 * Fetch *every* transaction since `sinceIso`, following Monzo's cursor
 * pagination. Monzo returns transactions oldest-first from the `since` point
 * and caps each response at `limit` (default 30, max 100), so a single request
 * silently strands the most recent transactions - the salary credit we look for
 * and the current month's spending both fall off the end. We page forward,
 * using the last transaction's id as the next `since` cursor, until a short
 * page tells us we've caught up to the present.
 */
export async function getTransactions(token, accountId, sinceIso) {
  const transactions = [];
  let since = sinceIso;
  for (let page = 0; page < TX_MAX_PAGES; page++) {
    const { transactions: batch = [] } = await getTransactionsPage(token, accountId, since);
    transactions.push(...batch);
    if (batch.length < TX_PAGE_LIMIT) break; // short page => no more to fetch
    since = batch[batch.length - 1].id; // advance the cursor past the last tx
  }
  return { transactions };
}
