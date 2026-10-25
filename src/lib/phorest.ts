import { captureAccountScope, isCurrentAccountScope } from './account-scope'
import { supabase } from './supabase'

// Lesender Zugriff auf Phorest über die Function `phorest` (Rechte prüft der Server).
export type Appt = { start: string; end: string; service: string; client: string; branch_id?: string; staff_id?: string; client_id?: string | null; notes?: string; price?: number | null; confirmed?: boolean }
export type MyDay = { ok: boolean; mapped: boolean; date: string; shifts: { branch_id: string; start: string; end: string }[]; appointments: Appt[]; error?: string }
export type BranchDay = { ok: boolean; date: string; columns: { staff_id: string; name: string; shift: { start: string; end: string } | null }[]; appointments: Appt[]; error?: string }
export type StaffWeek = { ok: boolean; mapped: boolean; days: { date: string; branch_id: string; start: string; end: string }[]; error?: string }
export type ClientHit = { client_id: string; name: string; phone_tail: string; since: string }
export type ClientHistory = { ok: boolean; months: number; client: { name: string; since: string; last_visit: string; preferred: string; contact_hidden?: boolean; email?: string; phone?: string; landline?: string; gender?: string; birth_date?: string; address?: string; notes?: string; first_visit?: string; last_branch?: string; loyalty_points?: number | null; balance?: number; membership?: boolean; banned?: boolean; categories?: string[]; consent?: { sms_marketing: boolean; email_marketing: boolean; sms_reminder: boolean; email_reminder: boolean } }; visits: { date: string; time: string; branch: string; service: string; staff: string; cancelled: boolean; notes: string }[]; upcoming?: { date: string; time: string; branch: string; service: string; staff: string }[]; summary: string | null; error?: string }
export type TeamToday = { ok: boolean; team: { name: string; start: string; end: string; appointments: number }[]; error?: string }

export async function phorest<T>(body: Record<string, unknown>): Promise<T> {
  const scope = captureAccountScope()
  if (!scope) return { ok: false, error: 'session_changed' } as T
  if (!supabase) return { ok: false, error: 'not_configured' } as T
  const { _eventSync, ...payload } = body
  const { data, error } = await supabase.functions.invoke(_eventSync ? 'phorest-events' : 'phorest', { body: payload, signal: scope.signal })
  if (!isCurrentAccountScope(scope)) return { ok: false, error: 'session_changed' } as T
  if (error) {
    // functions.invoke meldet Nicht-2xx als Fehler; die Antwort trägt trotzdem den Grund
    try { const failure = await (error as { context?: Response }).context?.json(); return (isCurrentAccountScope(scope) ? failure : { ok: false, error: 'session_changed' }) as T } catch { return { ok: false, error: 'phorest_unavailable' } as T }
  }
  return data as T
}
export const toHours = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h + (m || 0) / 60 }
