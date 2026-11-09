// La Ventanita service worker: app shell cached; episode list network-first; audio never cached.
const VERSION = 'ventanita-v1';
const SHELL = `${VERSION}-shell`, DATA = `${VERSION}-data`;
const SHELL_FILES = ['./', 'index.html', 'app.css?v=1', 'app.js?v=1', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png', 'icons/cover-600.jpg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\.(mp3|m4a)$/i.test(url.pathname) || req.headers.has('range')) return;
  if (/(episodes\.json|feed\.xml)$/.test(url.pathname)) {
    e.respondWith((async () => { const c = await caches.open(DATA);
      try { const r = await fetch(req, { cache: 'no-store' }); if (r.ok) c.put(req, r.clone()); return r; }
      catch (err) { const m = await c.match(req); if (m) return m; throw err; } })());
    return;
  }
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('index.html', { ignoreSearch: true }))); return; }
  e.respondWith(caches.match(req).then(m => m || fetch(req)));
});
