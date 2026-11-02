const V='ls-v6',SHELL=['./','index.html','manifest.webmanifest','icons/icon-192.png','fonts/BarlowCondensed-Black.ttf','fonts/BarlowCondensed-SemiBold.ttf','log.js','log.css','log-config.js','supabase.js','typical.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!=V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!='GET'||u.origin!=location.origin||/\.mp3$/.test(u.pathname)||r.headers.has('range'))return;
e.respondWith(fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(V).then(k=>k.put(r,c))}return x}).catch(()=>caches.match(r,{ignoreSearch:true})))});
