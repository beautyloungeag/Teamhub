import { supabase } from './supabase'

// Push-Mitteilungen und Startbereitschaft (BLTH-27).
// Öffentlicher VAPID-Schlüssel (der private liegt nur als Supabase-Secret).
const VAPID = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || 'BMttSCxDC8TrjwjUdQrrZDdgodI6wmsfSjVMHtqZXxN844sgAn02NAMbDCuLlmFfMCvrM6Wv7y13_s3L_hH29yk'

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isAndroid = () => /android/i.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID

export type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'needs-install' | 'error'

let pushEpoch = 0, pushAccount: string | null | undefined
let identityWrites: Promise<void> = Promise.resolve()
async function writeDeviceIdentity(employeeId: string | null, reg?: ServiceWorkerRegistration) {
  const active = (reg ?? await navigator.serviceWorker.getRegistration())?.active
  if (!active) return
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const finish = (error?: Error) => { clearTimeout(timer); channel.port1.close(); if (error) reject(error); else resolve() }
    const timer = setTimeout(() => finish(new Error('push_worker_not_ready')), 2500)
    channel.port1.onmessage = e => e.data?.ok ? finish() : finish(new Error('push_worker_not_ready'))
    active.postMessage({ type: 'push-identity', employeeId }, [channel.port2])
  })
}
function bindDevice(employeeId: string | null, reg?: ServiceWorkerRegistration) {
  identityWrites = identityWrites.catch(() => {}).then(() => writeDeviceIdentity(employeeId, reg))
  return identityWrites
}
export function syncPushAccount(userId: string | null) {
  if (pushAccount === userId) return
  pushAccount = userId; pushEpoch++
  if ('serviceWorker' in navigator) void bindDevice(null).catch(() => {})
}
export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  const epoch = pushEpoch
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (epoch !== pushEpoch) return 'off'
    if (Notification.permission === 'denied') { await bindDevice(null, reg); return 'denied' }
    const sub = await reg?.pushManager.getSubscription()
    if (!sub || Notification.permission !== 'granted') { await bindDevice(null, reg); return 'off' }
    if (!supabase) return 'error'
    const { data: me, error: whoError } = await supabase.rpc('current_employee')
    if (whoError) throw whoError
    if (epoch !== pushEpoch) return 'off'
    if (!me?.id) { await bindDevice(null, reg); return 'off' }
    const { data, error } = await supabase.from('push_subscriptions').select('endpoint').eq('endpoint', sub.endpoint).eq('employee_id', me.id).maybeSingle()
    if (error) throw error
    if (epoch !== pushEpoch) return 'off'
    await bindDevice(data ? me.id : null, reg)
    return data ? 'on' : 'off'
  } catch { return 'error' }
}
const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)) }
export async function enablePush(employeeId: string): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!pushSupported() || !supabase) return 'unsupported'
  // Must be called directly from the user's tap, before any asynchronous work.
  const epoch = pushEpoch
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.register('/sw.js')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('push_worker_not_ready')), 15000)
    navigator.serviceWorker.ready.then(() => { clearTimeout(timer); resolve() }, () => { clearTimeout(timer); reject(new Error('push_worker_not_ready')) })
  })
  let sub = await reg.pushManager.getSubscription()
  const subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) })
  if (!sub) sub = await subscribe()
  const persist = async (subscription: PushSubscription) => {
    const j = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    return supabase!.from('push_subscriptions').upsert({ endpoint: j.endpoint, employee_id: employeeId, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }).select('endpoint').single()
  }
  if (epoch !== pushEpoch) throw new Error('push_account_changed')
  let result = await persist(sub)
  // A device inherited from a different account gets a fresh subscription, never an RLS bypass.
  if (result.error && ['42501', '23505'].includes(result.error.code)) { await bindDevice(null, reg); await sub.unsubscribe(); sub = await subscribe(); result = await persist(sub) }
  if (result.error || !result.data) { await bindDevice(null, reg); throw new Error('push_registration_failed') }
  if (epoch !== pushEpoch) throw new Error('push_account_changed')
  await bindDevice(employeeId, reg)
  await reportDevice(true)
  window.dispatchEvent(new Event('th-push-state'))
  return 'on'
}
export async function disablePush() {
  pushEpoch++
  const reg = await navigator.serviceWorker.getRegistration()
  let failure = false
  try { await bindDevice(null, reg) } catch { failure = true }
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    try { if (supabase) { const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); if (error) failure = true } } catch { failure = true }
    try { if (!await sub.unsubscribe()) failure = true } catch { failure = true }
  }
  for (const n of await reg?.getNotifications() ?? []) n.close()
  await setChatBadge(0)
  await reportDevice(false)
  window.dispatchEvent(new Event('th-push-state'))
  if (failure) throw new Error('push_disconnect_incomplete')
}
export async function reportDevice(push?: boolean) {
  if (!supabase) return
  const p = push ?? (await pushState()) === 'on'
  await supabase.rpc('report_device', { p_standalone: isStandalone(), p_push: p })
}
export async function testPush() {
  if (!supabase) return false
  const { data, error } = await supabase.functions.invoke('notify', { body: { action: 'test' } })
  return !error && (data?.sent ?? 0) > 0
}
export async function setChatBadge(n: number) {
  const api = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try { if (n > 0) await api.setAppBadge?.(n); else await api.clearAppBadge?.() } catch { /* OS owns badge permission. */ }
}
export async function refreshChatBadge() {
  if (!supabase) return
  const { data, error } = await supabase.rpc('my_chat_unread_count')
  if (!error && typeof data === 'number') await setChatBadge(data)
}
// Nach Veröffentlichen im Backoffice sofort melden statt auf den 2-Minuten-Takt zu warten
export const notifyNow = () => supabase?.functions.invoke('notify', { body: {} }).catch(() => null)

// Android/Chrome: eigener Installieren-Knopf
let deferred: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as typeof deferred })
export const canPromptInstall = () => !!deferred
export async function promptInstall() { if (!deferred) return false; await deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome === 'accepted' }
