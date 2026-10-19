// Phorest lesend für TeamHub (BLTH-21). Nur GET gegen die Third-Party-API.
// Secrets: PHOREST_AUTH (Basic-Header), PHOREST_BUSINESS_ID.
// Aktionen:
//   my_day      {date?}          eigene Schichten + Termine (alle eigenen Phorest-Spalten)
//   branch_day  {branch, date?}  Filialkalender: nur eigene Filiale(n), Büro alle
//   team_today  {branch}         wer arbeitet heute: nur Filialleitung der Filiale oder Büro
//   staff_week  {employee_id?}   Schichten der nächsten 7 Tage einer Person (ohne Kundendaten; für Profil)
//   client_search {q}            Kundin suchen (Name, E-Mail oder Telefon), protokolliert
//   client_history {client_id, months?, summary?} Besuche + Notizen der letzten Monate, auf Wunsch mit KI-Zusammenfassung, protokolliert
//   sync_staff  {}               Zuordnung per Firmen-Mail neu aufbauen (nur Büro)
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { aiJson, hasAI } from '../_shared/openai.ts'

const BASE = 'https://api-gateway-eu.phorest.com/third-party-api-server/api/business/'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date())
const hhmm = (t?: string) => (t ?? '').slice(0, 5)

async function ph(path: string) {
  const auth = Deno.env.get('PHOREST_AUTH'), bid = Deno.env.get('PHOREST_BUSINESS_ID')
  if (!auth || !bid) throw new Error('phorest_not_configured')
  const r = await fetch(BASE + bid + path, { headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`phorest_${r.status}`)
  return await r.json()
}

// Kundennamen nur als „Vorname N.“ — mehr braucht die Behandelnde nicht.
async function clientNames(ids: string[]) {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, 60)
  for (let i = 0; i < uniq.length; i += 8) {
    await Promise.all(uniq.slice(i, i + 8).map(async (id) => {
      try {
        const c = await ph(`/client/${encodeURIComponent(id)}`)
        out.set(id, `${(c.firstName ?? '').trim()} ${(c.lastName ?? '').trim().slice(0, 1)}.`.trim())
      } catch { out.set(id, 'Kundin') }
    }))
  }
  return out
}

async function dayData(phorestBranch: string, date: string, staffIds?: string[]) {
  const [appts, wt] = await Promise.all([
    ph(`/branch/${phorestBranch}/appointment?from_date=${date}&to_date=${date}&fetch_canceled=false&size=500`),
    ph(`/branch/${phorestBranch}/staff/worktimetable?from_date=${date}&to_date=${date}&size=200`),
  ])
  let list = (appts?._embedded?.appointments ?? []).filter((a: any) => !a.deleted && a.activationState !== 'CANCELED')
  if (staffIds) list = list.filter((a: any) => staffIds.includes(a.staffId))
  const shifts = new Map<string, { start: string; end: string } | null>()
  for (const w of wt?._embedded?.workTimeTables ?? []) {
    const work = (w.timeSlots ?? []).filter((s: any) => s.type === 'WORKING')
    shifts.set(w.staffId, work.length ? { start: hhmm(work[0].startTime), end: hhmm(work[work.length - 1].endTime) } : null)
  }
  return { list, shifts }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userDb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await userDb.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const admin = createClient(url, service)
  const body = await req.json().catch(() => ({}))
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date : today()
  const myBranches: string[] = [me.branch_id, ...(me.extra_branch_ids ?? [])]
  const { data: branches } = await admin.from('branches').select('id, name, phorest_branch_id')
  const pb = (id: string) => branches?.find((b) => b.id === id)?.phorest_branch_id

  try {
    if (body.action === 'my_day') {
      const { data: maps } = await admin.from('employee_phorest').select('branch_id, staff_id').eq('employee_id', me.id)
      if (!maps?.length) return json({ ok: true, mapped: false, date, shifts: [], appointments: [] })
      const shifts: any[] = [], appts: any[] = []
      for (const m of maps) {
        const pbid = pb(m.branch_id); if (!pbid) continue
        const d = await dayData(pbid, date, [m.staff_id])
        const s = d.shifts.get(m.staff_id); if (s) shifts.push({ branch_id: m.branch_id, ...s })
        for (const a of d.list) appts.push({ ...a, _branch: m.branch_id })
      }
      const names = await clientNames(appts.map((a) => a.clientId))
      return json({ ok: true, mapped: true, date, shifts, appointments: appts.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((a) => ({
        start: hhmm(a.startTime), end: hhmm(a.endTime), service: a.serviceName ?? '', client: names.get(a.clientId) ?? 'Kundin', client_id: a.clientId ?? null, branch_id: a._branch, state: a.state,
      })) })
    }

    if (body.action === 'branch_day' || body.action === 'team_today') {
      const b = String(body.branch ?? me.branch_id)
      const allowed = me.app_role === 'buero' || (body.action === 'branch_day' ? myBranches.includes(b) : (me.app_role === 'filialleitung' && myBranches.includes(b)))
      if (!allowed) return json({ ok: false, error: 'forbidden' }, 403)
      const pbid = pb(b); if (!pbid) return json({ ok: false, error: 'no_phorest_branch' }, 400)
      const [staff, d] = await Promise.all([ph(`/branch/${pbid}/staff?size=200`), dayData(pbid, date)])
      const cols = (staff?._embedded?.staffs ?? []).filter((s: any) => !s.archived && !s.hideFromAppointmentScreen)
        .map((s: any) => ({ staff_id: s.staffId, name: `${s.firstName ?? ''}`.trim(), shift: d.shifts.get(s.staffId) ?? null }))
      if (body.action === 'team_today') {
        return json({ ok: true, date, team: cols.filter((c: any) => c.shift).map((c: any) => ({ name: c.name, ...c.shift, appointments: d.list.filter((a: any) => a.staffId === c.staff_id).length })) })
      }
      const names = await clientNames(d.list.map((a: any) => a.clientId))
      return json({ ok: true, date, columns: cols.filter((c: any) => c.shift || d.list.some((a: any) => a.staffId === c.staff_id)), appointments: d.list.map((a: any) => ({
        staff_id: a.staffId, start: hhmm(a.startTime), end: hhmm(a.endTime), service: a.serviceName ?? '', client: names.get(a.clientId) ?? 'Kundin',
      })) })
    }

    if (body.action === 'staff_week') {
      // Nur Arbeitszeiten, keine Termine: darf jede Kollegin sehen (z. B. um jemanden anzurufen)
      const who = typeof body.employee_id === 'string' ? body.employee_id : me.id
      const { data: maps } = await admin.from('employee_phorest').select('branch_id, staff_id').eq('employee_id', who)
      if (!maps?.length) return json({ ok: true, mapped: false, days: [] })
      // Phorest liefert den Dienstplan zuverlässig nur je Tag – deshalb sieben einzelne Abfragen
      const dates = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(Date.now() + i * 864e5)))
      const days: { date: string; branch_id: string; start: string; end: string }[] = []
      for (const m of maps) {
        const pbid = pb(m.branch_id); if (!pbid) continue
        await Promise.all(dates.map(async (d) => {
          const wt = await ph(`/branch/${pbid}/staff/worktimetable?from_date=${d}&to_date=${d}&size=200`)
          for (const w of wt?._embedded?.workTimeTables ?? []) {
            if (w.staffId !== m.staff_id) continue
            const work = (w.timeSlots ?? []).filter((s: any) => s.type === 'WORKING')
            if (work.length) days.push({ date: d, branch_id: m.branch_id, start: hhmm(work[0].startTime), end: hhmm(work[work.length - 1].endTime) })
          }
        }))
      }
      return json({ ok: true, mapped: true, days: days.sort((a, b) => a.date.localeCompare(b.date)) })
    }

    if (body.action === 'client_search') {
      const q = String(body.q ?? '').trim()
      if (q.length < 3) return json({ ok: false, error: 'too_short' }, 400)
      const digits = q.replace(/[^0-9]/g, '')
      const paths: string[] = []
      if (q.includes('@')) paths.push(`/client?email=${encodeURIComponent(q.toLowerCase())}&size=20`)
      else if (digits.length >= 7) { const d = digits.replace(/^00/, '').replace(/^0/, '41'); paths.push(`/client?phone=${d}&size=20`, `/client?phone=${digits}&size=20`) }
      else {
        const parts = q.split(/\s+/)
        if (parts.length >= 2) paths.push(`/client?firstName=${encodeURIComponent(parts[0])}&lastName=${encodeURIComponent(parts.slice(1).join(' '))}&size=20`)
        paths.push(`/client?lastName=${encodeURIComponent(parts[parts.length - 1])}&size=20`, `/client?firstName=${encodeURIComponent(parts[0])}&size=20`)
      }
      const seen = new Map<string, any>()
      for (const p of paths) { try { for (const c of (await ph(p))?._embedded?.clients ?? []) if (!c.archived && !c.deleted) seen.set(c.clientId, c) } catch { /* nächste Variante */ } }
      await admin.from('client_lookups').insert({ employee_id: me.id, action: 'search', query: q.slice(0, 120), result_count: seen.size })
      return json({ ok: true, clients: [...seen.values()].slice(0, 15).map((c) => ({
        client_id: c.clientId, name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
        phone_tail: String(c.mobile ?? c.landLine ?? '').replace(/\s/g, '').slice(-4), since: String(c.createdAt ?? c.firstVisit ?? '').slice(0, 10),
      })) })
    }

    if (body.action === 'client_history') {
      const cid = String(body.client_id ?? '')
      if (!cid) return json({ ok: false, error: 'no_client' }, 400)
      const months = Math.min(24, Math.max(1, Number(body.months) || 12))
      const client = await ph(`/client/${encodeURIComponent(cid)}`)
      // Phorest liefert Termine nur in Zeitfenstern (max. ~31 Tage); je Studio und Monat eine Abfrage
      const windows = Array.from({ length: months }, (_, i) => {
        const to = new Date(Date.now() - i * 30 * 864e5), from = new Date(to.getTime() - 30 * 864e5)
        const f = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(d)
        return [f(from), f(to)]
      })
      // Namen der Behandelnden direkt aus Phorest (alle Studios), nicht nur zugeordnete Konten
      const sName = new Map<string, string>()
      await Promise.all((branches ?? []).filter((b) => b.phorest_branch_id).map(async (b) => {
        try { for (const x of (await ph(`/branch/${b.phorest_branch_id}/staff?size=200`))?._embedded?.staffs ?? []) sName.set(x.staffId, `${x.firstName ?? ''}`.trim()) } catch { /* ohne Namen weiter */ }
      }))
      const jobs: (() => Promise<any[]>)[] = []
      for (const b of branches ?? []) {
        if (!b.phorest_branch_id) continue
        for (const [f, t] of windows) jobs.push(async () => {
          try { const r = await ph(`/branch/${b.phorest_branch_id}/appointment?from_date=${f}&to_date=${t}&client_id=${encodeURIComponent(cid)}&fetch_canceled=true&fetch_notes=true&size=100`)
            return (r?._embedded?.appointments ?? []).map((a: any) => ({ ...a, _branch: b.name })) } catch { return [] }
        })
      }
      const all: any[] = []
      for (let i = 0; i < jobs.length; i += 8) (await Promise.all(jobs.slice(i, i + 8).map((j) => j()))).forEach((x) => all.push(...x))
      const byId = new Map(all.map((a) => [a.appointmentId, a]))
      const visits = [...byId.values()].sort((a, b) => `${b.appointmentDate}${b.startTime}`.localeCompare(`${a.appointmentDate}${a.startTime}`)).map((a) => ({
        date: a.appointmentDate, time: hhmm(a.startTime), branch: a._branch, service: a.serviceName ?? '', staff: sName.get(a.staffId) ?? '',
        cancelled: !!(a.cancelled || a.activationState === 'CANCELED'), notes: String(a.notes ?? a.note ?? '').trim(),
      }))
      await admin.from('client_lookups').insert({ employee_id: me.id, action: 'history', client_id: cid, result_count: visits.length })
      const info = {
        name: `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(), since: String(client.clientSince ?? client.firstVisit ?? client.createdAt ?? '').slice(0, 10),
        last_visit: String(client.lastVisit ?? '').slice(0, 10), preferred: sName.get(client.preferredStaffId) ?? '',
      }
      // Zusammenfassung: nur Besuche und Notizen, keine Kontaktdaten an das Sprachmodell
      let summary: string | null = null
      if (body.summary && hasAI() && visits.length) {
        try {
          const out = await aiJson<{ summary: string }>([
            'Du fasst für eine Mitarbeiterin eines Kosmetikstudios die Historie einer Kundin aus Phorest zusammen, damit sie gut vorbereitet in den Termin geht.',
            'Höchstens 6 kurze Zeilen, Schweizer Hochdeutsch, sachlich. Inhalt: seit wann Kundin, wie oft und welche Behandlungen meist, bei wem (nur wenn Namen vorhanden sind, sonst gar nicht erwähnen), letzter Besuch, Absagen nur wenn auffällig.',
            'Aus den Notizen nur, was für die Behandlung zählt (Allergien, Unverträglichkeiten, Reklamationen, Vorlieben, Wünsche), mit Datum. Nichts erfinden; gibt es keine Notizen, sag das in einem Halbsatz.',
            'Gib nur JSON zurück: {"summary": string}',
          ].join('\n'), JSON.stringify({ kundin_seit: info.since, letzter_besuch: info.last_visit, bevorzugt: info.preferred, besuche: visits.slice(0, 80) }))
          summary = String(out.summary ?? '').trim() || null
          await admin.from('client_lookups').insert({ employee_id: me.id, action: 'summary', client_id: cid, result_count: visits.length })
        } catch { summary = null }
      }
      return json({ ok: true, months, client: info, visits, summary })
    }

    if (body.action === 'sync_staff') {
      if (me.app_role !== 'buero') return json({ ok: false, error: 'forbidden' }, 403)
      const { data: emps } = await admin.from('employees').select('id, email').eq('active', true)
      const byMail = new Map((emps ?? []).map((e) => [e.email, e.id]))
      const rows: any[] = []
      for (const b of branches ?? []) {
        if (!b.phorest_branch_id) continue
        const st = await ph(`/branch/${b.phorest_branch_id}/staff?size=200`)
        for (const s of st?._embedded?.staffs ?? []) {
          const id = byMail.get(String(s.email ?? '').toLowerCase())
          if (id && !s.archived) rows.push({ employee_id: id, branch_id: b.id, staff_id: s.staffId, display_name: `${s.firstName ?? ''}`.trim(), synced_at: new Date().toISOString() })
        }
      }
      await admin.from('employee_phorest').delete().neq('staff_id', '')
      if (rows.length) await admin.from('employee_phorest').insert(rows)
      const mapped = new Set(rows.map((r) => r.employee_id))
      return json({ ok: true, rows: rows.length, employees_mapped: mapped.size, employees_total: emps?.length ?? 0 })
    }
    return json({ ok: false, error: 'unknown_action' }, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ ok: false, error: msg === 'phorest_not_configured' ? msg : 'phorest_unavailable', detail: msg }, 502)
  }
})
