import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { setAccountScope, permissionFingerprint } from './account-scope'
import { disablePush, syncPushAccount } from './push'

export type AppRole = 'mitarbeiterin' | 'filialleitung' | 'buero'
export type Employee = {
  id: string; email: string; first_name: string; last_name: string; job_title: string
  app_role: AppRole; branch_id: string; extra_branch_ids: string[]; skills: string[]
  lang: 'DE' | 'EN' | 'FR'; photo_path: string | null; branch_name: string
}

type AuthCtx = {
  ready: boolean
  /** Changes for a new session or changed authorization scope. Never contains a token. */
  scopeKey: string | null
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

// Token claims are used only to identify a cache lifetime, never to grant access.
function sessionId(s: Session): string | null {
  try { const part = s.access_token.split('.')[1]; const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))); return typeof claims.session_id === 'string' ? claims.session_id : null } catch { return null }
}
async function loadEmployee(s: Session, signal: AbortSignal, previous: Employee | null): Promise<Employee | null | 'error'> {
  if (!supabase) return null
  // Pin the request token: a later login must not change which identity this
  // profile request represents. setHeader/abortSignal are PostgREST modifiers.
  const request = () => supabase!.rpc('current_employee').setHeader('Authorization', `Bearer ${s.access_token}`).abortSignal(signal)
  let res = await request()
  for (let i = 0; res.error && !signal.aborted && i < 2; i++) {
    await new Promise(r => setTimeout(r, 400 * (i + 1)))
    if (signal.aborted) return 'error'
    res = await request()
  }
  const { data, error } = res
  if (error || signal.aborted) return 'error'
  if (!data?.id) return null
  if (previous && previous.branch_id === data.branch_id) return { ...data, branch_name: previous.branch_name } as Employee
  const { data: br, error: branchError } = await supabase.from('branches').select('name').eq('id', data.branch_id).setHeader('Authorization', `Bearer ${s.access_token}`).abortSignal(signal).maybeSingle()
  if (branchError || signal.aborted) return 'error'
  return { ...data, branch_name: br?.name ?? data.branch_id } as Employee
}

const sameEmployee = (a: Employee | null, b: Employee): boolean => !!a && ['id', 'email', 'first_name', 'last_name', 'job_title', 'app_role', 'branch_id', 'lang', 'photo_path', 'branch_name', 'extra_branch_ids', 'skills'].every(k => JSON.stringify(a[k as keyof Employee]) === JSON.stringify(b[k as keyof Employee]))

type State = { ready: boolean; session: Session | null; employee: Employee | null; offline: boolean; scopeKey: string | null }
const initial: State = { ready: false, session: null, employee: null, offline: false, scopeKey: null }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial)
  const latest = useRef<State>(initial)
  const refreshRef = useRef<() => void>(() => {})
  const stopAuthRef = useRef<() => void>(() => {})
  const logoutBusy = useRef(false)
  const signOut = async () => {
    if (logoutBusy.current) return
    logoutBusy.current = true
    // Hide/revoke cached client data immediately, before waiting on transport.
    stopAuthRef.current()
    setAccountScope(null)
    syncPushAccount(null)
    latest.current = { ...initial, ready: false }
    setState(latest.current)
    try { try { await disablePush() } catch { /* local identity still cleared */ } await supabase?.auth.signOut() }
    catch { /* the local boundary remains closed even if transport throws */ }
    finally { logoutBusy.current = false; latest.current = { ...initial, ready: true }; setState(latest.current) }
  }

  useEffect(() => {
    if (!supabase) { const next = { ...initial, ready: true }; latest.current = next; setState(next); return }
    let alive = true, revision = 0, eventCount = 0, identity: string | null = null
    let activeSession: Session | null = null, profileRequest: AbortController | null = null, queued: ReturnType<typeof setTimeout> | null = null
    let fallbackToken = '', fallbackId = 0
    const identityOf = (s: Session) => { const id = sessionId(s); if (id) return s.user.id + ':' + id; if (s.access_token !== fallbackToken) { fallbackToken = s.access_token; fallbackId++ } return s.user.id + ':opaque-' + fallbackId }
    const commit = (next: State) => { if (!alive) return; latest.current = next; setState(next) }
    const cancel = () => { revision++; profileRequest?.abort(); profileRequest = null; if (queued) clearTimeout(queued); queued = null; activeSession = null; identity = null }
    stopAuthRef.current = cancel
    const checkProfile = async (s: Session, key: string, generation: number) => {
      profileRequest?.abort()
      const abort = new AbortController(); profileRequest = abort
      const previous = latest.current.session?.user.id === s.user.id ? latest.current.employee : null
      const e = await loadEmployee(s, abort.signal, previous).catch(() => 'error' as const)
      if (!alive || logoutBusy.current || abort.signal.aborted || generation !== revision || key !== identity) return
      profileRequest = null
      if (e === 'error') {
        setAccountScope(null); syncPushAccount(null)
        commit({ ready: true, session: s, employee: null, offline: true, scopeKey: null })
        return
      }
      if (!e) {
        setAccountScope(null); syncPushAccount(null)
        commit({ ready: true, session: s, employee: null, offline: false, scopeKey: null })
        return
      }
      const scope = setAccountScope(key + ':' + permissionFingerprint(e), e.id)!
      syncPushAccount(scope.key + ':' + scope.version)
      commit({ ready: true, session: s, employee: sameEmployee(previous, e) ? previous : e, offline: false, scopeKey: scope.key + ':' + scope.version })
    }
    const apply = (s: Session | null) => {
      if (logoutBusy.current) return
      const generation = ++revision
      profileRequest?.abort(); profileRequest = null
      if (queued) clearTimeout(queued)
      const key = s ? identityOf(s) : null, changed = key !== identity
      identity = key; activeSession = s
      if (!s || changed) {
        setAccountScope(null); syncPushAccount(s?.user.id ?? null)
        commit({ ready: !s, session: s, employee: null, offline: false, scopeKey: null })
      }
      if (!s || !key) return
      // No async Supabase work inside the auth callback: its internal auth lock
      // must be released first. Invalidation above is deliberately synchronous.
      queued = setTimeout(() => { queued = null; void checkProfile(s, key, generation) }, 0)
    }
    const refresh = () => { if (activeSession) apply(activeSession) }
    refreshRef.current = refresh
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => { eventCount++; apply(s) })
    const observedEvents = eventCount
    supabase.auth.getSession().then(({ data }) => { if (alive && eventCount === observedEvents) apply(data.session) })
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    const interval = window.setInterval(visible, 30000)
    return () => { alive = false; cancel(); sub.subscription.unsubscribe(); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); window.clearInterval(interval); setAccountScope(null) }
  }, [])

  useEffect(() => {
    if (!supabase || !state.employee) return
    // Revoked SELECT can suppress a realtime event; the visible heartbeat above
    // is the bounded fallback; focus also triggers revalidation.
    const channel = supabase.channel('own-profile:' + state.employee.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter: `id=eq.${state.employee.id}` }, () => refreshRef.current()).subscribe()
    return () => { void supabase!.removeChannel(channel) }
  }, [state.employee?.id])

  const orphan = !!state.session && !state.employee && state.ready && !state.offline
  useEffect(() => { if (orphan) void signOut() }, [orphan]) // eslint-disable-line react-hooks/exhaustive-deps
  return <A.Provider value={{ ...state, orphan, retry: () => refreshRef.current(), signOut }}>{children}</A.Provider>
}
