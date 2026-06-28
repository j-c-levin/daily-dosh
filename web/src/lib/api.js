const BASE = import.meta.env.VITE_API_BASE || '';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

const q = (key) => `storage_key=${encodeURIComponent(key)}`;

export const api = {
  config: () => req('/api/config'),
  auth: (code, redirectUri) =>
    req('/api/auth', { method: 'POST', body: JSON.stringify({ code, redirectUri }) }),
  state: (key) => req(`/api/state?${q(key)}`),
  confirmBuckets: (key) => req(`/api/confirm-buckets?${q(key)}`, { method: 'POST' }),
  dismissPayday: (key, transactionId) =>
    req(`/api/dismiss-payday?${q(key)}`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  setEmployer: (key, employerName) =>
    req(`/api/settings?${q(key)}`, { method: 'POST', body: JSON.stringify({ employerName }) }),
  toggleIgnore: (key, transactionId) =>
    req(`/api/ignore?${q(key)}`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
};
