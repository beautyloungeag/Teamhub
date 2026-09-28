import { supabase } from './supabase'

// Push-Mitteilungen und Startbereitschaft (BLTH-27).
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isAndroid = () => /android/i.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID

export type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'needs-install'
export async function pushState(): Promise<PushState> {
  // iPhone: Web-Push gibt es nur für die App auf dem Home-Bildschirm (ab iOS 16.4)
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)) }

export async function enablePush(employeeId: string): Promise<PushState> {
  if (!pushSupported() || !supabase) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID!) })
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, employee_id: employeeId, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) })
  await reportDevice(true)
  return 'on'
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub && supabase) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
  await reportDevice(false)
}
export async function reportDevice(push?: boolean) {
  if (!supabase) return
  const p = push ?? (await pushState()) === 'on'
  await supabase.rpc('report_device', { p_standalone: isStandalone(), p_push: p })
}
export async function testPush() {
  if (!supabase) return false
  const { data } = await supabase.functions.invoke('notify', { body: { action: 'test' } })
  return (data?.sent ?? 0) > 0
}
// Nach Veröffentlichen im Backoffice sofort melden statt auf den 2-Minuten-Takt zu warten
export const notifyNow = () => supabase?.functions.invoke('notify', { body: {} }).catch(() => null)

// Android/Chrome: eigener Installieren-Knopf
let deferred: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as typeof deferred })
export const canPromptInstall = () => !!deferred
export async function promptInstall() { if (!deferred) return false; await deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome === 'accepted' }
