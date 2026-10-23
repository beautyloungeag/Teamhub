// Only the public application shell/assets are cached. Employee data remains live.
const SHELL='teamhub-shell-v3', DEVICE='teamhub-device-v1', DEVICE_KEY='/__teamhub_push_identity'
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(SHELL).then(c=>c.addAll(['/','/icon-192.png','/icon-512.png'])))})
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('teamhub-shell-')&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim())))
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url)
 if(req.method!=='GET'||url.origin!==self.location.origin)return
 if(req.mode==='navigate')e.respondWith(fetch(req).then(async r=>{if(r.ok)try{await (await caches.open(SHELL)).put('/',r.clone())}catch{}return r}).catch(()=>caches.match('/')))
 else if(url.pathname.startsWith('/assets/'))e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(async r=>{if(r.ok)try{await (await caches.open(SHELL)).put(req,r.clone())}catch{}return r})))
})
self.addEventListener('message',e=>{
 if(e.data?.type!=='push-identity')return
 const employeeId=typeof e.data.employeeId==='string'?e.data.employeeId:null
 e.waitUntil(caches.open(DEVICE).then(c=>c.put(DEVICE_KEY,new Response(JSON.stringify({employeeId}),{headers:{'Content-Type':'application/json'}}))).then(()=>e.ports?.[0]?.postMessage({ok:true})))
})
function safeUrl(value){try{const u=new URL(value,self.location.origin);return u.origin===self.location.origin?u.href:self.location.origin+'/'}catch{return self.location.origin+'/'}}
self.addEventListener('push',e=>{
 e.waitUntil((async()=>{
  let m={title:'TeamHub',body:'Neue Aktivität im TeamHub.',url:'/',tag:'teamhub'}
  try{m={...m,...e.data.json()}}catch{/* Always show a visible notification, including malformed payloads. */}
  const cached=await caches.open(DEVICE).then(c=>c.match(DEVICE_KEY))
  const bound=cached?await cached.json().catch(()=>({})):{}
  const own=!!m.employeeId&&bound.employeeId===m.employeeId
  // A delayed push after logout/account change must not expose the previous person's text.
  if(!own)m={title:'TeamHub',body:'Neue Aktivität im TeamHub. Öffne die App, um sie anzusehen.',url:'/',tag:'teamhub'}
  await self.registration.showNotification(String(m.title),{body:String(m.body??''),tag:String(m.tag??'teamhub'),icon:'/icon-192.png',badge:'/icon-192.png',data:{url:safeUrl(m.url)}})
  if(own&&Number.isFinite(m.badgeCount)&&'setAppBadge'in navigator)try{if(m.badgeCount>0)await navigator.setAppBadge(m.badgeCount);else await navigator.clearAppBadge()}catch{/* OS owns badge permission. */}
 })())
})
self.addEventListener('notificationclick',e=>{
 e.notification.close()
 const url=safeUrl(e.notification.data?.url||'/')
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{
  const open=list.find(c=>new URL(c.url).origin===self.location.origin)
  if(open){await open.focus();open.postMessage({type:'open',url});return}
  return self.clients.openWindow(url)
 }))
})
