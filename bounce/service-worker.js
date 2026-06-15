/* ============================================================
   Bounce — service worker
   Cache-first offline support. Bump CACHE_VERSION on release to
   invalidate the old cache.
   ============================================================ */

const CACHE_VERSION = 'bounce-v1';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/game.js',
  './js/input.js',
  './js/levels.js',
  './js/physics.js',
  './js/level.js',
  './js/renderer.js',
  './js/storage.js',
  './js/audio.js',
  './js/ui.js',
  './js/utils.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// Install: pre-cache the app shell so it works offline after first load.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: drop stale caches from previous versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for same-origin GET requests, with a network fallback
// that also refreshes the cache (stale-while-revalidate-ish).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      // Serve cache immediately if present, refresh in the background.
      return cached || network;
    })
  );
});
