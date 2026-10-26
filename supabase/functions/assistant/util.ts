// Gemeinsame Helfer für den Copiloten (actions.ts, records.ts)
import type { Me } from './actions.ts'

export const s = (x: unknown, n = 200) => String(x ?? '').trim().slice(0, n)
export const arr = (x: unknown) => (Array.isArray(x) ? x : typeof x === 'string' && x ? [x] : []).map((y) => s(y, 80)).filter(Boolean)
export const isDay = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
export const isTime = (x: unknown) => typeof x === 'string' && /^\d{2}:\d{2}$/.test(x)
export const plain = (x: string) => x.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
/** Datum und Uhrzeit in Zürich als ISO (auch über die Zeitumstellung richtig). */
export const zIso = (d: string, t = '00:00') => {
  const guess = new Date(`${d}T${t}:00Z`)
  const z = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Zurich' })), u = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (z.getTime() - u.getTime())).toISOString()
}
export const fmt = (iso: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
export const fmtDay = (d: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d + 'T12:00:00Z'))
export const myStudios = (me: Me) => [me.branch_id, ...(me.extra_branch_ids ?? [])].filter((b) => b && b !== 'buero')
