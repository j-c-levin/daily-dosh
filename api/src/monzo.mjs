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

export function getTransactions(token, accountId, sinceIso) {
  const query = { account_id: accountId, 'expand[]': 'merchant' };
  if (sinceIso) query.since = sinceIso;
  return call('GET', '/transactions', { token, query });
}
