/* Service worker for Daily Psalms and Canticles.

   The book is small enough to hold entirely, so the whole build is precached
   on install: once the app has been opened once it works with no network at
   all, which is the point of it.

   The version and the precache list below are filled in after the Vite
   build by tools/sw-build.mjs. */

const VERSION = '__VERSION__';
const CACHE = `dpc-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if any single request fails, so add
    // one at a time and tolerate a miss rather than leaving no cache at all.
    await Promise.all(PRECACHE.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
      } catch { /* a missing asset must not block installation */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k.startsWith('dpc-')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the shell from cache so a cold start works offline,
  // and refresh it in the background when the network is there.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./index.html');
      const network = fetch(request).then(res => {
        if (res.ok) cache.put('./index.html', res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || new Response(
        '<h1>Offline</h1><p>Open the app once while connected so it can store the book.</p>',
        { headers: { 'Content-Type': 'text/html' }, status: 503 });
    })());
    return;
  }

  // Everything else is content-hashed or a static asset: cache first.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    try {
      const res = await fetch(request);
      if (res.ok && res.type === 'basic') cache.put(request, res.clone());
      return res;
    } catch (err) {
      const fallback = await cache.match(request, { ignoreSearch: true });
      if (fallback) return fallback;
      throw err;
    }
  })());
});
