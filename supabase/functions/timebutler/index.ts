// Zeit & Ferien aus Timebutler (API v2, https://app.timebutler.com/api/v2, Wunsch der Inhaberin 21.10.).
// v2 arbeitet immer für die angemeldete Person. Deshalb verbindet jede Mitarbeiterin ihr eigenes Timebutler-Konto einmal
// (Passwort-Grant mit client_id=public, bei 2FA zweiter Schritt mit Code). Gespeichert wird nur der rotierende Refresh-Token,
// verschlüsselt mit MAILBOX_KEY (Tabelle timebutler_accounts), nie das Passwort.
//   status     {}                                   verbunden? (+ ob die Firmen-Mail in Timebutler existiert, über TIMEBUTLER_API_KEY; Büro: Abdeckung)
//   connect    {email?, password} | {mfa_token, code}
//   disconnect {}
//   overview   {}                                   Profil, Ferienstand, Stempeluhr, heutige Arbeitszeit, Zeiteinträge, Anträge, Abwesenheitsarten
//   clock      {command: start|pause|resume|stop}
//   request    {absenceTypeId, startDate, endDate, halfDay?, comments?}   Ferien/Abwesenheit beantragen, auch Krankmeldung (Art mit „krank“ im Namen)
//   withdraw   {id}                                 eigenen Antrag zurückziehen (offen) oder Stornierung anfragen
//   balance_sync {}                                 nur Cron (x-notify-secret): Stundensaldo aller über API v1 nach timebutler_balances
//   company_status | company_set {token} | company_sync | company_remove   nur Büro: Firmen-Schlüssel v1 eintragen, prüfen, abgleichen
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { clockResult } from './clock-result.ts'
import { parseBalances, usersByEmail } from './balance.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
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

/* ---------- Stundensaldo über API v1 (Firmen-Token) ---------- */
// Schlüssel: vom Büro in TeamHub eingetragen (verschlüsselt in timebutler_company), sonst Secret TIMEBUTLER_V1_TOKEN
// deno-lint-ignore no-explicit-any
async function companyToken(admin: any): Promise<string | null> {
  const { data } = await admin.from('timebutler_company').select('token_sealed').eq('id', 1).maybeSingle()
  if (data?.token_sealed) return await open(data.token_sealed)
  return Deno.env.get('TIMEBUTLER_V1_TOKEN')?.trim() || null
}
async function v1(action: string, params: Record<string, string> = {}, token?: string | null) {
  const k = token; if (!k) throw new Error('not_configured')
  const r = await fetch('https://app.timebutler.com/api/v1/' + action, { method: 'POST', body: new URLSearchParams({ auth: k.trim(), ...params }), signal: AbortSignal.timeout(60000) })
  const text = await r.text()
  if (/MAX_REQUESTS_PER_DAY_LIMIT_EXCEEDED/.test(text)) throw new Error('limit')
  if (r.status === 401) throw new Error('key_invalid')
  if (r.status !== 200) throw new Error(`v1_${action}_${r.status}`)
  return text
}
// Ein Lauf für alle: E-Mail aus TeamHub (bzw. die beim Verbinden benutzte) → Timebutler-userid → Saldo zum heutigen Tag
// deno-lint-ignore no-explicit-any
async function syncBalances(admin: any) {
  const day = today(), key = 'timebutler_balance_sync'
  const { data: st } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  const prev = (st?.value ?? {}) as { day?: string; calls?: number }
  const calls = prev.day === day ? prev.calls ?? 0 : 0
  // Timebutler erlaubt 12 Abrufe je Kalendertag, wir lassen Luft für einen Abruf von Hand
  if (calls >= 10) return { ok: false, error: 'limit_guard', calls }
  const note = async (v: Record<string, unknown>) => { await admin.from('app_settings').upsert({ key, value: { day, calls: calls + 1, at: new Date().toISOString(), ...v }, updated_at: new Date().toISOString() }) }
  try {
    const k = await companyToken(admin)
    const users = usersByEmail(await v1('users', {}, k))
    const { header, rows } = parseBalances(await v1('worktimeaccountbalance', { date: day, minutes: 'true' }, k))
    const { data: emps } = await admin.from('employees').select('id, email').eq('active', true)
    const { data: accts } = await admin.from('timebutler_accounts').select('employee_id, tb_email')
    const byUser = new Map(rows.map(r => [r.userid, r]))
    const out: Record<string, unknown>[] = []
    for (const e of (emps ?? []) as { id: string; email: string }[]) {
      const mails = [e.email, ...((accts ?? []) as { employee_id: string; tb_email: string }[]).filter(a => a.employee_id === e.id).map(a => a.tb_email)]
      const uid = mails.map(m => users.get(String(m ?? '').toLowerCase())).find(Boolean)
      const r = uid ? byUser.get(uid) : undefined
      if (uid && r) out.push({ employee_id: e.id, tb_userid: uid, balance_minutes: r.minutes, as_of: day, row: r.row, fetched_at: new Date().toISOString() })
    }
    if (out.length) { const { error } = await admin.from('timebutler_balances').upsert(out); if (error) throw new Error('save_failed') }
    await note({ ok: true, header, users: users.size, rows: rows.length, matched: out.length })
    return { ok: true, matched: out.length, rows: rows.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Ohne Token ist das kein Fehler, nur noch nicht eingerichtet; dann zählt der Lauf auch nicht als Abruf
    if (msg === 'not_configured') return { ok: true, configured: false }
    await note({ ok: false, error: msg.slice(0, 120) })
    return { ok: false, error: msg.slice(0, 120) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const secret = Deno.env.get('NOTIFY_SECRET')
  if (secret && req.headers.get('x-notify-secret') === secret) {
    const b = await req.json().catch(() => ({}))
    if (b.action !== 'balance_sync') return json({ ok: false, error: 'bad_action' }, 400)
    return json(await syncBalances(createClient(url, service)))
  }
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

    // Firmen-Schlüssel für den Stundensaldo (nur Büro). Der Schlüssel selbst verlässt den Server nie wieder.
    if (action.startsWith('company_')) {
      if (me.app_role !== 'buero') return json({ ok: false, error: 'forbidden' }, 403)
      const status = async () => {
        const { data: row } = await admin.from('timebutler_company').select('set_at, set_by').eq('id', 1).maybeSingle()
        const { data: st } = await admin.from('app_settings').select('value').eq('key', 'timebutler_balance_sync').maybeSingle()
        const { count } = await admin.from('employees').select('id', { count: 'exact', head: true }).eq('active', true)
        let by: string | null = null
        if (row?.set_by) { const { data: e } = await admin.from('employees').select('first_name, last_name').eq('id', row.set_by).maybeSingle(); by = e ? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() : null }
        const v = (st?.value ?? {}) as Record<string, unknown>
        return { ok: true, configured: !!row || !!Deno.env.get('TIMEBUTLER_V1_TOKEN'), setAt: row?.set_at ?? null, setBy: by, employees: count ?? 0,
          sync: st ? { at: v.at ?? null, ok: v.ok ?? null, matched: v.matched ?? null, error: v.error ?? null, callsToday: v.day === today() ? v.calls ?? 0 : 0 } : null }
      }
      if (action === 'company_status') return json(await status())
      if (action === 'company_remove') { await admin.from('timebutler_company').delete().eq('id', 1); await admin.from('timebutler_balances').delete().not('employee_id', 'is', null); return json(await status()) }
      if (action === 'company_sync') return json({ ...(await status()), result: await syncBalances(admin) })
      if (action === 'company_set') {
        const token = String(body.token ?? '').trim()
        if (token.length < 8 || /\s/.test(token)) return json({ ok: false, error: 'key_empty' })
        // Erst prüfen, dann speichern: users kostet keinen der 12 Saldo-Abrufe
        try {
          const users = usersByEmail(await v1('users', {}, token))
          if (!users.size) return json({ ok: false, error: 'key_no_users' })
        } catch (err) {
          const m = err instanceof Error ? err.message : ''
          // tb_… ist der persönliche Token der neueren Schnittstelle (v2), nicht der Firmen-Schlüssel
          return json({ ok: false, error: m === 'key_invalid' ? (/^tb_/.test(token) ? 'key_is_v2' : 'key_invalid') : 'unreachable' })
        }
        await admin.from('timebutler_company').upsert({ id: 1, token_sealed: await seal(token), set_by: me.id, set_at: new Date().toISOString() })
        return json({ ...(await status()), result: await syncBalances(admin) })
      }
      return json({ ok: false, error: 'bad_action' }, 400)
    }

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
    // Stundensaldo aus dem letzten v1-Abgleich (nur der eigene)
    const { data: bal } = await admin.from('timebutler_balances').select('balance_minutes, as_of, fetched_at').eq('employee_id', me.id).maybeSingle()
    const p = profile as { name?: string; email?: string; isTimeTrackingEnabled?: boolean } | null
    return json({
      ok: true, configured: true, connected: true, today: d,
      profile: p ? { name: p.name, email: p.email, timeTracking: p.isTimeTrackingEnabled !== false } : null,
      summary, clock, work, requests: Array.isArray(requests) ? requests : [],
      types: Array.isArray(types) ? (types as { id: string; name: string; halfDaysAllowed?: boolean; needsApproval?: boolean; requiresMedicalCertificate?: boolean }[]).map(x => ({ id: x.id, name: x.name, half: !!x.halfDaysAllowed, approval: !!x.needsApproval, cert: !!x.requiresMedicalCertificate })) : [],
      entries: entries.flatMap(x => Array.isArray(x) ? x : []),
      balance: bal && bal.balance_minutes != null ? { minutes: bal.balance_minutes, asOf: bal.as_of, fetchedAt: bal.fetched_at } : null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'reconnect') return json({ ok: true, configured: true, connected: false, reconnect: true, email: me.email })
    return json({ ok: false, error: msg === 'not_configured' ? msg : 'timebutler_unreachable', detail: msg.slice(0, 120) })
  }
})
