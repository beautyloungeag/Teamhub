// Service Worker: macht TeamHub installierbar, hält die App-Hülle für schlechtes Netz vor
// und zeigt Push-Mitteilungen. Daten (Supabase) laufen immer live übers Netz.
const SHELL = 'teamhub-shell-v2'
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/']))) })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); return r }).catch(() => caches.match('/')))
  }
})
self.addEventListener('push', (e) => {
  let m = { title: 'TeamHub', body: '', url: '/', tag: 'teamhub' }
  try { m = { ...m, ...e.data.json() } } catch { if (e.data) m.body = e.data.text() }
  e.waitUntil(self.registration.showNotification(m.title, { body: m.body, tag: m.tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: m.url } }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin)
    if (open) { open.focus(); open.postMessage({ type: 'open', url }); return }
    return self.clients.openWindow(url)
  }))
})
