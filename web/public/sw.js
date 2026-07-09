// Minimal service worker for Daily Dosh.
//
// - Never touches /api or /oauth — those must always hit the network so the
//   OAuth redirect flow and live data are never served from cache.
// - Navigations: network-first, falling back to a cached copy of index.html
//   when offline.
// - Hashed static assets (/assets/*): cache-first, since their filenames
//   change on every build.
//
// Bump CACHE_VERSION whenever this file's caching behaviour changes so
// activate() can clean up the previous cache and nobody gets stranded on
// stale logic.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `daily-dosh-${CACHE_VERSION}`;
const OFFLINE_URL = '/index.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isExcludedPath(pathname) {
  return pathname.startsWith('/api') || pathname.startsWith('/oauth');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever handle plain GETs — anything else (POST/PUT/etc, including
  // OAuth callbacks) passes straight through untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Leave cross-origin requests alone entirely.
  if (url.origin !== self.location.origin) return;

  // Never intercept API or OAuth traffic.
  if (isExcludedPath(url.pathname)) return;

  // Navigations: network-first, falling back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(OFFLINE_URL, response.clone());
          return response;
        } catch (err) {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(OFFLINE_URL);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Hashed static assets: cache-first, since a given filename is immutable.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })()
    );
  }
});
