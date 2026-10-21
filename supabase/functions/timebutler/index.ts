// Timebutler (API v1, Firmen-Schlüssel als Secret TIMEBUTLER_TOKEN): eigener Ferienstand, Abwesenheiten, Arbeitszeit, Stempeluhr.
//   overview {}                       Ferien, Abwesenheiten (dieses + nächstes Jahr), Arbeitszeit des Monats, Stand der Stempeluhr
//   clock    {command}                start | pause | resume | stop für die angemeldete Person
// Zuordnung über die Firmen-Mail (Timebutler „E-mail address“). Ferien beantragt man weiter in Timebutler,
// API v1 kann keine Abwesenheiten anlegen. Ohne Secret: { ok: true, configured: false }.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const BASE = (Deno.env.get('TIMEBUTLER_BASE') ?? 'https://timebutler.de/api/v1/').replace(/\/?$/, '/')
const TZ = 'Europe/Zurich'

async function tb(endpoint: string, params: Record<string, string> = {}) {
  const token = Deno.env.get('TIMEBUTLER_TOKEN')
  if (!token) throw new Error('not_configured')
  const body = new URLSearchParams({ ...params, auth: token })
  const r = await fetch(BASE + endpoint, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000) })
  const text = await r.text()
  if (!r.ok) throw new Error(`timebutler_${r.status}`)
  return text
}
// Timebutler liefert CSV mit Semikolon und Kopfzeile
function csv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === ';') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = [] }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); if (row.some(x => x.trim())) rows.push(row) }
  const [head, ...rest] = rows
  return head ? rest.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()]))) : []
}
const isoFromDmy = (s: string) => { const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

let usersCache: { at: number; list: Record<string, string>[] } | null = null
async function userIdFor(email: string): Promise<string | null> {
  if (!usersCache || Date.now() - usersCache.at > 10 * 60_000) usersCache = { at: Date.now(), list: csv(await tb('users')) }
  const u = usersCache.list.find(x => (x['E-mail address'] ?? '').toLowerCase() === email.toLowerCase() && x['User account locked'] !== 'true')
  return u?.['User ID'] ?? null
}

async function clockStatus(uid: string) {
  const [result, state, start, pause] = (await tb('timeclock', { command: 'status', userid: uid })).trim().split(';')
  const ms = (x?: string) => { const n = Number(x); return n > 0 ? new Date(n).toISOString() : null }
  return { result, state: (state || 'IDLE') as 'IDLE' | 'RUNNING' | 'PAUSED', since: ms(start), pauseSince: ms(pause) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const userDb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await userDb.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const body = await req.json().catch(() => ({}))
  if (!Deno.env.get('TIMEBUTLER_TOKEN')) return json({ ok: true, configured: false })
  try {
    const uid = await userIdFor(me.email)
    if (!uid) return json({ ok: true, configured: true, linked: false })

    if (body.action === 'clock') {
      const command = String(body.command ?? '')
      if (!['start', 'pause', 'resume', 'stop'].includes(command)) return json({ ok: false, error: 'bad_command' }, 400)
      const result = (await tb('timeclock', { command, userid: uid })).trim().split(';')[0]
      return json({ ok: !result.startsWith('RESULT_ERR'), result, clock: await clockStatus(uid) })
    }

    // overview
    const now = today(), year = Number(now.slice(0, 4)), month = Number(now.slice(5, 7))
    const [ent, absNow, absNext, work, clock] = await Promise.all([
      tb('holidayentitlement', { year: String(year) }).then(csv),
      tb('absences', { year: String(year) }).then(csv),
      tb('absences', { year: String(year + 1) }).then(csv).catch(() => []),
      tb('worktime', { year: String(year), month: String(month) }).then(csv).catch(() => []),
      clockStatus(uid).catch(() => null),
    ])
    const e = ent.find(x => x['User ID'] === uid)
    const num = (x?: string) => Number(String(x ?? '0').replace(',', '.')) || 0
    const absences = [...absNow, ...absNext].filter(x => x['User ID'] === uid).map(x => ({
      id: x.ID, from: isoFromDmy(x.From), to: isoFromDmy(x.To), type: x.Type, state: x.State, days: num(x.Workdays),
      half: x['Half a day'] === 'true', morning: x.Morning === 'true',
    })).filter(x => x.from && x.to).sort((a, b) => a.from!.localeCompare(b.from!))
    const mine = work.filter(x => x['User ID'] === uid)
    const days = new Map<string, number>()
    for (const w of mine) { const d = isoFromDmy(w['Date (dd/mm/yyyy)'] ?? ''); if (d) days.set(d, (days.get(d) ?? 0) + num(w['Working time in seconds'])) }
    return json({
      ok: true, configured: true, linked: true, today: now,
      vacation: e ? { contingent: num(e['Vacation contingent']) + num(e['Extra vacation days']) + num(e['Further vacation contingent']), remaining: num(e['Remaining vacation']) } : null,
      absences,
      work: [...days.entries()].map(([date, seconds]) => ({ date, seconds })).sort((a, b) => a.date.localeCompare(b.date)),
      clock,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ ok: false, error: msg === 'not_configured' ? msg : 'timebutler_unreachable', detail: msg })
  }
})
