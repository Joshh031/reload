// RELOAD service worker. Network-first, falling back to cache.
// Bump on every deploy that touches deployed files.
const CACHE_VERSION = 'reload-v6';

// Replaced at build time by scripts/inject-sw.mjs with the hashed dist assets,
// so the full app works offline from the very first visit.
const BUILD_ASSETS = [];

const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/inter-400.woff2',
  '/fonts/inter-500.woff2',
  '/fonts/inter-600.woff2',
  '/fonts/jbmono-400.woff2',
  '/fonts/jbmono-500.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL.concat(BUILD_ASSETS)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never intercept cross-origin requests (the Anthropic API call).
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        // ignoreVary: module scripts request with CORS headers that differ
        // from the install-time fetch; a Vary header must not defeat the match
        const cached = await caches.match(request, { ignoreVary: true });
        if (cached) return cached;
        // SPA navigation fallback
        if (request.mode === 'navigate') {
          const shell = await caches.match('/', { ignoreVary: true });
          if (shell) return shell;
        }
        return new Response('offline', { status: 503 });
      })
  );
});
