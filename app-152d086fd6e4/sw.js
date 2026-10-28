// Briefs service worker: app shell cached; feeds/transcripts network-first; audio never cached.
const VERSION = 'briefs-v1';
const SHELL = `${VERSION}-shell`, DATA = `${VERSION}-data`;
const SHELL_FILES = ['./', 'index.html', 'app.css?v=1', 'app.js?v=1', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png',
  'icons/x-thumb.jpg', 'icons/ma-thumb.jpg', 'fonts/BarlowCondensed-Black.ttf', 'fonts/BarlowCondensed-SemiBold.ttf'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function networkFirst(req) {
  const c = await caches.open(DATA);
  try { const r = await fetch(req, { cache: 'no-store' }); if (r.ok) c.put(req, r.clone()); return r; }
  catch (err) { const m = await c.match(req); if (m) return m; throw err; }
}
async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name);
  const m = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => m);
  return m || net;
}
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Audio: never intercept (range requests, large files, always fresh from network).
  if (/\.(mp3|m4a|aac|wav)$/i.test(url.pathname) || req.headers.has('range') || req.destination === 'audio') return;
  if (/\/feed\.xml$/.test(url.pathname) || /\.txt$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }
  const scope = new URL(self.registration.scope);
  if (url.pathname.startsWith(scope.pathname)) { e.respondWith(staleWhileRevalidate(req, SHELL)); return; }
  if (/\.(jpe?g|png|webp)$/i.test(url.pathname)) { e.respondWith(staleWhileRevalidate(req, DATA)); return; }
});
