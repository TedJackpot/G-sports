/* G-Sports Gabon – Service Worker : cache intelligent pour connexions limitées */
const VERSION = 'gs-v1.1.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const IMAGES = `${VERSION}-images`;
const API = `${VERSION}-api`;
const PRECACHE = [
  '/', '/offline.html', '/css/app.css', '/js/app.js', '/js/core.js', '/js/pages-public.js', '/js/pages-account.js', '/js/pages-admin.js',
  '/manifest.webmanifest', '/img/icons/icon-192.png', '/img/icons/icon-512.png', '/img/icons/favicon-32.png',
  '/img/photos/basket-joie.jpg', '/img/photos/basket-joie-sm.jpg',
];
const PUBLIC_API = /^\/api\/(meta|home|listings|profiles|calendar|map|templates|posts)(\/|$|\?)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k);
}
async function networkFirst(req, cacheName, { timeout = 6000, mark = false } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout))]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) {
      if (!mark) return hit;
      const headers = new Headers(hit.headers); headers.set('X-GS-Cache', '1');
      return new Response(await hit.blob(), { status: hit.status, headers });
    }
    throw err;
  }
}
async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trim(cacheName, max); }
  return res;
}
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) {
      if (PUBLIC_API.test(url.pathname)) e.respondWith(networkFirst(req, API, { mark: true }).then(r => { trim(API, 80); return r; }));
      return; // les données privées ne sont jamais mises en cache
    }
    if (req.mode === 'navigate') {
      e.respondWith(networkFirst(req, RUNTIME, { timeout: 8000 }).catch(async () =>
        (await caches.match('/', { ignoreSearch: true })) || caches.match('/offline.html')));
      return;
    }
    if (url.pathname.startsWith('/img/') || url.pathname.startsWith('/uploads/')) { e.respondWith(cacheFirst(req, IMAGES, 150).catch(() => new Response('', { status: 404 }))); return; }
    if (/\.(js|css|webmanifest)$/.test(url.pathname)) { e.respondWith(staleWhileRevalidate(req, SHELL)); return; }
    return;
  }
  if (url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com') || url.host === 'cdnjs.cloudflare.com') {
    e.respondWith(cacheFirst(req, RUNTIME, 40)); return;
  }
  if (url.host.endsWith('tile.openstreetmap.org')) { e.respondWith(cacheFirst(req, IMAGES, 300).catch(() => new Response('', { status: 404 }))); }
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
