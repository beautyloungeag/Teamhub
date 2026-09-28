import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

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
  signOut: () => Promise<void>
}
const A = createContext<AuthCtx | null>(null)
export const useAuth = () => useContext(A)!

async function loadEmployee(): Promise<Employee | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('current_employee')
  if (error || !data?.id) return null
  const { data: br } = await supabase.from('branches').select('name').eq('id', data.branch_id).maybeSingle()
  return { ...data, branch_name: br?.name ?? data.branch_id } as Employee
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    let alive = true
    const apply = async (s: Session | null) => {
      const e = s ? await loadEmployee() : null
      if (!alive) return
      setSession(s); setEmployee(e); setReady(true)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    // Kein await im Callback: supabase-js hält dort eine Sperre, ein Folgeaufruf würde hängen.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => apply(s), 0) })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signOut = async () => { await supabase?.auth.signOut(); setSession(null); setEmployee(null) }
  return <A.Provider value={{ ready, session, employee, orphan: !!session && !employee, signOut }}>{children}</A.Provider>
}
