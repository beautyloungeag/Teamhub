// Zeit & Ferien aus Timebutler (API v2, https://app.timebutler.com/api/v2, Wunsch der Inhaberin 21.10.).
// v2 arbeitet immer für die angemeldete Person. Deshalb verbindet jede Mitarbeiterin ihr eigenes Timebutler-Konto einmal
// (Passwort-Grant mit client_id=public, bei 2FA zweiter Schritt mit Code). Gespeichert wird nur der rotierende Refresh-Token,
// verschlüsselt mit MAILBOX_KEY (Tabelle timebutler_accounts), nie das Passwort.
//   status     {}                                   verbunden? (+ ob die Firmen-Mail in Timebutler existiert, über TIMEBUTLER_API_KEY; Büro: Abdeckung)
//   connect    {email?, password} | {mfa_token, code}
//   disconnect {}
//   overview   {}                                   Profil, Ferienstand, Stempeluhr, heutige Arbeitszeit, Zeiteinträge, Anträge, Abwesenheitsarten
//   clock      {command: start|pause|resume|stop}
//   request    {absenceTypeId, startDate, endDate, halfDay?, comments?}   Ferien/Abwesenheit beantragen
//   withdraw   {id}                                 eigenen Antrag zurückziehen (offen) oder Stornierung anfragen
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clockResult } from './clock-result.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const API = 'https://app.timebutler.com/api/v2/'
const TZ = 'Europe/Zurich'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

/* ---------- Verschlüsselung (gleicher Schlüssel wie das Postfach) ---------- */
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
async function key() { const raw = Deno.env.get('MAILBOX_KEY'); if (!raw) throw new Error('not_configured'); return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']) }
async function seal(t: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); return b64(iv) + '.' + b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(t)))) }
async function open(s: string) { const [iv, ct] = s.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(ct))) }

async function tokenCall(params: Record<string, string>) {
  const r = await fetch(API + 'oauth2/token', { method: 'POST', body: new URLSearchParams({ ...params, client_id: 'public' }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000) })
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> }
}

// deno-lint-ignore no-explicit-any
type Admin = any
type Row = { refresh: string; access: string | null; access_exp: string | null; tb_email: string }
async function save(admin: Admin, empId: string, email: string, t: Record<string, unknown>) {
  await admin.from('timebutler_accounts').upsert({
    employee_id: empId, tb_email: email, refresh: await seal(String(t.refresh_token)), access: await seal(String(t.access_token)),
    access_exp: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000 - 60_000).toISOString(), last_error: null, updated_at: new Date().toISOString(),
  })
}
// Gültiges Zugriffstoken; der Refresh-Token ist einmalig, deshalb bei einem Fehlschlag erst nachsehen, ob eine parallele Anfrage schon erneuert hat
async function accessFor(admin: Admin, empId: string): Promise<string | null> {
  const load = async () => (await admin.from('timebutler_accounts').select('refresh, access, access_exp, tb_email').eq('employee_id', empId).maybeSingle()).data as Row | null
  let row = await load(); if (!row) return null
  if (row.access && row.access_exp && new Date(row.access_exp) > new Date()) return await open(row.access)
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: await open(row.refresh) })
  if (t.status === 200 && t.body.access_token) { await save(admin, empId, row.tb_email, t.body); return String(t.body.access_token) }
  row = await load()
  if (row?.access && row.access_exp && new Date(row.access_exp) > new Date()) return await open(row.access)
  await admin.from('timebutler_accounts').update({ last_error: 'reconnect' }).eq('employee_id', empId)
  throw new Error('reconnect')
}
async function api(tok: string, path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { ...init, headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(15000) })
  const text = await r.text(); let body: unknown = null; try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (r.status === 401) throw new Error('reconnect')
  return { status: r.status, body }
}

// Existiert die Firmen-Mail in Timebutler? (über den Admin-Token, nur zur Hilfe beim Verbinden)
let staffCache: { at: number; mails: Set<string> } | null = null
async function knownInTimebutler(email: string): Promise<boolean | null> {
  const k = Deno.env.get('TIMEBUTLER_API_KEY'); if (!k) return null
  try {
    if (!staffCache || Date.now() - staffCache.at > 10 * 60_000) {
      const { status, body } = await api(k.trim(), 'employees'); if (status !== 200 || !Array.isArray(body)) return null
      staffCache = { at: Date.now(), mails: new Set((body as { email?: string; active?: boolean }[]).filter(e => e.active !== false).map(e => String(e.email ?? '').toLowerCase())) }
    }
    return staffCache.mails.has(email.toLowerCase())
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userDb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await userDb.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const admin = createClient(url, service)
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? 'overview')
  try {
    if (action === 'status') {
      const { data: row } = await admin.from('timebutler_accounts').select('tb_email, last_error').eq('employee_id', me.id).maybeSingle()
      // Büro: wie viele aktive Personen haben unter ihrer Firmen-Mail ein Timebutler-Konto (ohne Namen)
      let coverage = null
      if (me.app_role === 'buero' && await knownInTimebutler(me.email) !== null) {
        const { data: emps } = await admin.from('employees').select('email, app_role').eq('active', true)
        const staff = (emps ?? []).filter((e: { email: string }) => !/@aleksa\.ai$/i.test(e.email))
        coverage = { matched: staff.filter((e: { email: string }) => staffCache!.mails.has(String(e.email).toLowerCase())).length, total: staff.length, timebutler: staffCache!.mails.size }
      }
      return json({ ok: true, configured: true, connected: !!row && row.last_error !== 'reconnect', reconnect: row?.last_error === 'reconnect', email: row?.tb_email ?? me.email, known: await knownInTimebutler(me.email), coverage })
    }
    if (action === 'connect') {
      const email = String(body.email || me.email).trim()
      const t = body.mfa_token ? await tokenCall({ grant_type: 'mfa_totp', mfa_token: String(body.mfa_token), totp_code: String(body.code ?? '').replace(/\s/g, '') })
        : await tokenCall({ grant_type: 'password', username: email, password: String(body.password ?? '') })
      if (t.body.mfa_required) return json({ ok: true, mfa: true, mfa_token: t.body.mfa_token })
      if (t.status !== 200 || !t.body.access_token) return json({ ok: false, error: t.status === 429 ? 'too_many' : body.mfa_token ? 'code_wrong' : 'login_failed' })
      await save(admin, me.id, email, t.body)
      return json({ ok: true, connected: true })
    }
    if (action === 'disconnect') { await admin.from('timebutler_accounts').delete().eq('employee_id', me.id); return json({ ok: true, connected: false }) }

    const tok = await accessFor(admin, me.id)
    if (!tok) return json({ ok: true, configured: true, connected: false, email: me.email, known: await knownInTimebutler(me.email) })

    if (action === 'clock') {
      const command = String(body.command ?? '')
      if (!['start', 'pause', 'resume', 'stop'].includes(command)) return json({ ok: false, error: 'bad_command' }, 400)
      const r = await api(tok, 'time-clock/' + command, { method: 'POST' })
      return json(await clockResult(r.status, r.body, async () => (await api(tok, 'time-clock/status')).body))
    }
    if (action === 'request') {
      const iso = (x: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? String(x) : null
      const start = iso(body.startDate), end = iso(body.endDate) ?? start
      if (!body.absenceTypeId || !start || !end || end < start) return json({ ok: false, error: 'bad_request' }, 400)
      const payload: Record<string, unknown> = { absenceTypeId: String(body.absenceTypeId), startDate: start, endDate: body.halfDay ? start : end }
      if (body.halfDay === 'morning' || body.halfDay === 'afternoon') payload.halfDay = body.halfDay
      if (body.comments) payload.comments = String(body.comments).slice(0, 500)
      const r = await api(tok, 'absence-requests', { method: 'POST', body: JSON.stringify(payload) })
      const err = r.body as { message?: string; error?: string } | null
      return json({ ok: r.status === 200, status: r.status, request: r.status === 200 ? r.body : null, error: r.status === 200 ? null : err?.message ?? err?.error ?? null })
    }
    if (action === 'withdraw') {
      const r = await api(tok, 'absence-requests/' + encodeURIComponent(String(body.id ?? '')), { method: 'DELETE' })
      return json({ ok: r.status >= 200 && r.status < 300, status: r.status })
    }

    // overview: alles für den Bildschirm in einem Zug; der Wochenbalken braucht am Monatsanfang auch den Vormonat
    const d = today(), y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7))
    const mon = new Date(Date.UTC(y, m - 1, Number(d.slice(8, 10)) - ((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7)))
    const months = [[y, m]]; if (mon.getUTCMonth() + 1 !== m) months.push([mon.getUTCFullYear(), mon.getUTCMonth() + 1])
    const get = (p: string) => api(tok, p).then(r => r.status === 200 ? r.body : null).catch(e => { if (e instanceof Error && e.message === 'reconnect') throw e; return null })
    const [profile, summary, clock, work, requests, types, ...entries] = await Promise.all([
      get('user/profile'), get('time-tracking/time-off-summary'), get('time-clock/status'), get('time-tracking/work-summary'),
      get('absence-requests/my'), get('absence-types'), ...months.map(([yy, mm]) => get(`time-entries/my?year=${yy}&month=${mm}`)),
    ])
    const p = profile as { name?: string; email?: string; isTimeTrackingEnabled?: boolean } | null
    return json({
      ok: true, configured: true, connected: true, today: d,
      profile: p ? { name: p.name, email: p.email, timeTracking: p.isTimeTrackingEnabled !== false } : null,
      summary, clock, work, requests: Array.isArray(requests) ? requests : [],
      types: Array.isArray(types) ? (types as { id: string; name: string; halfDaysAllowed?: boolean; needsApproval?: boolean }[]).map(x => ({ id: x.id, name: x.name, half: !!x.halfDaysAllowed, approval: !!x.needsApproval })) : [],
      entries: entries.flatMap(x => Array.isArray(x) ? x : []),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'reconnect') return json({ ok: true, configured: true, connected: false, reconnect: true, email: me.email })
    return json({ ok: false, error: msg === 'not_configured' ? msg : 'timebutler_unreachable', detail: msg.slice(0, 120) })
  }
})
