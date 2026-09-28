// Minimaler Service Worker: macht TeamHub installierbar und hält die App-Hülle für
// schlechtes Netz vor. Daten (Supabase) laufen immer live übers Netz, nie aus dem Cache.
const SHELL = 'teamhub-shell-v1'
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/']))) })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  // Seiten: erst Netz, bei Ausfall die gespeicherte Hülle
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { caches.open(SHELL).then((c) => c.put('/', r.clone())); return r }).catch(() => caches.match('/')))
  }
})
