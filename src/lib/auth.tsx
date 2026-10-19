import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { disablePush } from './push'

export type AppRole = 'mitarbeiterin' | 'filialleitung' | 'buero'
export type Employee = {
  id: string; email: string; first_name: string; last_name: string; job_title: string
  app_role: AppRole; branch_id: string; extra_branch_ids: string[]; skills: string[]
  lang: 'DE' | 'EN' | 'FR'; photo_path: string | null; branch_name: string
}

type AuthCtx = {
  ready: boolean
  session: Session | null
  employee: Employee | null
  // Angemeldet, aber (nicht mehr) als aktive Mitarbeiterin geführt
  orphan: boolean
  // Profil liess sich nicht laden (Netz weg): nicht abmelden, sondern erneut versuchen
  offline: boolean
  retry: () => void
  signOut: () => Promise<void>
}
const A = createContext<AuthCtx | null>(null)
export const useAuth = () => useContext(A)!

async function loadEmployee(): Promise<Employee | null | 'error'> {
  if (!supabase) return null
  // Bei schlechtem Empfang mehrmals versuchen; nur „kein Profil“ gilt als nicht mehr aktiv
  let res = await supabase.rpc('current_employee')
  for (let i = 0; res.error && i < 2; i++) { await new Promise(r => setTimeout(r, 1200 * (i + 1))); res = await supabase.rpc('current_employee') }
  const { data, error } = res
  if (error) return 'error'
  if (!data?.id) return null
  const { data: br } = await supabase.from('branches').select('name').eq('id', data.branch_id).maybeSingle()
  return { ...data, branch_name: br?.name ?? data.branch_id } as Employee
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [offline, setOffline] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    let alive = true
    const apply = async (s: Session | null) => {
      const e = s ? await loadEmployee() : null
      if (!alive) return
      setSession(s); setReady(true)
      if (e === 'error') { setOffline(true); return }
      setOffline(false); setEmployee(e)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    // Kein await im Callback: supabase-js hält dort eine Sperre, ein Folgeaufruf würde hängen.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => apply(s), 0) })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [tick])

  // Abmelden: Push dieses Geräts abmelden, sonst bekäme die nächste Person am geteilten Gerät fremde Mitteilungen
  const signOut = async () => { try { await disablePush() } catch { /* kein Push */ } await supabase?.auth.signOut(); setSession(null); setEmployee(null) }
  return <A.Provider value={{ ready, session, employee, orphan: !!session && !employee && !offline, offline, retry: () => setTick(x => x + 1), signOut }}>{children}</A.Provider>
}
