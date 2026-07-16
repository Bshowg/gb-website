// /sw.js
const CACHE_NAME = 'pocket-poker-v2';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './three.module.js',
  './game/gameState.js',
  './game/evaluator.js',
  './game/input.js',
  './game/renderer.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './images/card_back.webp'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Stale-while-revalidate: serve from cache for speed/offline, but always
// refresh the cache from the network in the background so a deployed
// update reaches users on their next visit (cache-first alone kept users
// on the first version they ever loaded)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then(response => {
          if (response && response.ok && event.request.url.startsWith(self.location.origin)) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
