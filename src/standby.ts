import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './lib/supabase'
import { addDays } from './store'

// Aushilfe-Anfragen (Tabelle standby_requests) und Antworten (standby_responses), geteilt von App und Backoffice.
export type SReq = {
  id: string; branch_id: string; day: string; start_time: string | null; end_time: string | null; skill: string | null; note: string
  to_all: boolean; status: 'offen' | 'besetzt' | 'abgesagt'; filled_by: string | null; created_by: string | null; created_by_name: string; created_at: string
}
export type SResp = { request_id: string; employee_id: string; answer: 'ja' | 'nein' }

const S = { requests: [] as SReq[], responses: [] as SResp[], loaded: false, ver: 0 }
const subs = new Set<() => void>()
export async function reloadStandby() {
  if (!supabase) return
  const [r, a] = await Promise.all([
    supabase.from('standby_requests').select('*').gte('day', addDays(-14)).order('day'),
    supabase.from('standby_responses').select('request_id, employee_id, answer'),
  ])
  S.requests = (r.data ?? []) as SReq[]; S.responses = (a.data ?? []) as SResp[]; S.loaded = true; S.ver++; subs.forEach(f => f())
}
export function useStandbyRequests() {
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => S.ver)
  useEffect(() => { if (!S.loaded) reloadStandby() }, [])
  return S
}
export async function answerStandby(requestId: string, employeeId: string, answer: 'ja' | 'nein' | null) {
  const q = answer ? supabase!.from('standby_responses').upsert({ request_id: requestId, employee_id: employeeId, answer, created_at: new Date().toISOString() })
    : supabase!.from('standby_responses').delete().match({ request_id: requestId, employee_id: employeeId })
  const { error } = await q
  await reloadStandby()
  return !error
}
export const timeSpan = (r: Pick<SReq, 'start_time' | 'end_time'>) => r.start_time ? `${r.start_time.slice(0, 5)}${r.end_time ? `–${r.end_time.slice(0, 5)}` : ''}` : ''
