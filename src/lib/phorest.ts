import { supabase } from './supabase'

// Lesender Zugriff auf Phorest über die Function `phorest` (Rechte prüft der Server).
export type Appt = { start: string; end: string; service: string; client: string; branch_id?: string; staff_id?: string }
export type MyDay = { ok: boolean; mapped: boolean; date: string; shifts: { branch_id: string; start: string; end: string }[]; appointments: Appt[]; error?: string }
export type BranchDay = { ok: boolean; date: string; columns: { staff_id: string; name: string; shift: { start: string; end: string } | null }[]; appointments: Appt[]; error?: string }
export type TeamToday = { ok: boolean; team: { name: string; start: string; end: string; appointments: number }[]; error?: string }

export async function phorest<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) return { ok: false, error: 'not_configured' } as T
  const { data, error } = await supabase.functions.invoke('phorest', { body })
  if (error) {
    // functions.invoke meldet Nicht-2xx als Fehler; die Antwort trägt trotzdem den Grund
    try { return await (error as { context?: Response }).context?.json() as T } catch { return { ok: false, error: 'phorest_unavailable' } as T }
  }
  return data as T
}
export const toHours = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h + (m || 0) / 60 }
