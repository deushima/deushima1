'use strict';

const SVG_CACHE = 'deushima-local-svg-v1';
const SVG_PREFIX = '/__deushima_local_media/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SVG_PREFIX)) return;

  event.respondWith((async () => {
    const cache = await caches.open(SVG_CACHE);
    const cached = await cache.match(event.request, { ignoreVary: true });
    if (cached) return cached;
    return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>', {
      status: 404,
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    });
  })());
});
