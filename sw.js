// ICV Scout — Service Worker
// Strategia: cache-first per risorse statiche, network-only per API/Supabase
const CACHE = 'icv-v24';
const STATIC = [
  '/',
  '/index.html',
  '/grafiche.html',
  '/quiz.html',
  '/community.html',
  '/calendario-juventus.html',
  '/manifest.json',
  '/icon-192.png',
  '/assets/icv-logo-160.jpg',
  '/assets/home-20261025.min.css',
  '/assets/fonts.css',
  '/assets/vb-motion-effects.css?v=20261003-1',
  '/assets/vince-hero.css?v=20261003-1',
  '/assets/vince-hero.js?v=20261003-1'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  const reqUrl = new URL(url);
  // Lascia passare normalmente API, Supabase, RSS, font Google
  if (
    e.request.method !== 'GET' || reqUrl.origin !== self.location.origin ||
    url.includes('/api/') ||
    url.includes('supabase.co') ||
    url.includes('rss2json') ||
    url.includes('api-football') ||
    url.includes('football-data')
  ) return;

  if (e.request.mode === 'navigate' || reqUrl.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then(cached => cached || caches.match('/index.html'))
      )
    );
    return;
  }

  // Cache requested static assets, not every device's images during installation.
  if (!/^\/assets\/.*\.(?:css|js|woff2|png|jpe?g|webp|svg|ico)$/.test(reqUrl.pathname)) return;
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
    if (response.ok && !/text\/html/i.test(response.headers.get('content-type') || '')) {
      const copy = response.clone();
      e.waitUntil(caches.open(CACHE).then(async cache => {
        await cache.put(e.request, copy);
        const keys = await cache.keys();
        const runtime = keys.filter(key => !STATIC.includes(new URL(key.url).pathname + new URL(key.url).search));
        await Promise.all(runtime.slice(0, Math.max(0, runtime.length - 80)).map(key => cache.delete(key)));
      }));
    }
    return response;
  })));
});
