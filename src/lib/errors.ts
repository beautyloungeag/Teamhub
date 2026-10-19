// Fehlerprotokoll: Abstürze und unbehandelte Fehler im Browser landen in `client_errors` (sieht nur das Büro,
// Einstellungen → System). Gleiche Meldung höchstens einmal je Sitzung, insgesamt höchstens 20.
import { supabase } from './supabase'

const seen = new Set<string>()
const VERSION = (import.meta.env.VITE_COMMIT as string | undefined) ?? 'lokal'

export async function reportError(message: string, stack?: string) {
  const key = message.slice(0, 200)
  if (!supabase || seen.has(key) || seen.size >= 20) return
  // Rauschen ohne Aussage (Browser-Erweiterungen, abgebrochene Ladevorgänge)
  if (/ResizeObserver loop|Script error\.?$|Load failed|Failed to fetch|NetworkError|AbortError/i.test(message)) return
  seen.add(key)
  try {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return
    const { data: me } = await supabase.rpc('current_employee')
    await supabase.from('client_errors').insert({ employee_id: me?.id ?? null, message: message.slice(0, 500), stack: (stack ?? '').slice(0, 2000), url: location.pathname + location.search, ua: navigator.userAgent.slice(0, 200), version: VERSION })
  } catch { /* nie selbst einen Fehler werfen */ }
}

window.addEventListener('error', (e) => { reportError(String(e.message || e.error?.message || 'Fehler'), e.error?.stack) })
window.addEventListener('unhandledrejection', (e) => { const r = e.reason; reportError(String(r?.message ?? r ?? 'Unbehandelte Ablehnung'), r?.stack) })
