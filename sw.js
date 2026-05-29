// ICV Scout — Service Worker
// Strategia: cache-first per risorse statiche, network-only per API/Supabase
const CACHE = 'icv-v3';
const STATIC = ['/', '/index.html', '/grafiche.html'];

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
    url.includes('/api/') ||
    url.includes('supabase.co') ||
    url.includes('rss2json') ||
    url.includes('fonts.googleapis') ||
    url.includes('fonts.gstatic') ||
    url.includes('api-football') ||
    url.includes('football-data')
  ) return;

  if (e.request.mode === 'navigate' || reqUrl.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
