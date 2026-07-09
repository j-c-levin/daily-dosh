const BASE = import.meta.env.VITE_API_BASE || '';

async function req(path, opts = {}) {
  const { headers, ...rest } = opts;
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...headers },
    ...rest,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

const auth = (key) => ({ Authorization: `Bearer ${key}` });

export const api = {
  config: () => req('/api/config'),
  auth: (code, redirectUri) =>
    req('/api/auth', { method: 'POST', body: JSON.stringify({ code, redirectUri }) }),
  state: (key) => req('/api/state', { headers: auth(key) }),
  day: (key, date) => req(`/api/day?date=${encodeURIComponent(date)}`, { headers: auth(key) }),
  confirmBuckets: (key) => req('/api/confirm-buckets', { method: 'POST', headers: auth(key) }),
  dismissPayday: (key, transactionId) =>
    req('/api/dismiss-payday', { method: 'POST', headers: auth(key), body: JSON.stringify({ transactionId }) }),
  reset: (key, body) =>
    req('/api/reset', { method: 'POST', headers: auth(key), body: JSON.stringify(body) }),
  setEmployer: (key, employerName) =>
    req('/api/settings', { method: 'POST', headers: auth(key), body: JSON.stringify({ employerName }) }),
  toggleIgnore: (key, transactionId) =>
    req('/api/ignore', { method: 'POST', headers: auth(key), body: JSON.stringify({ transactionId }) }),
};
