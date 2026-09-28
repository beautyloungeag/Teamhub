// Phorest lesend für TeamHub (BLTH-21). Nur GET gegen die Third-Party-API.
// Secrets: PHOREST_AUTH (Basic-Header), PHOREST_BUSINESS_ID.
// Aktionen:
//   my_day      {date?}          eigene Schichten + Termine (alle eigenen Phorest-Spalten)
//   branch_day  {branch, date?}  Filialkalender: nur eigene Filiale(n), Büro alle
//   team_today  {branch}         wer arbeitet heute: nur Filialleitung der Filiale oder Büro
//   sync_staff  {}               Zuordnung per Firmen-Mail neu aufbauen (nur Büro)
import { createClient } from 'jsr:@supabase/supabase-js@2'

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
        start: hhmm(a.startTime), end: hhmm(a.endTime), service: a.serviceName ?? '', client: names.get(a.clientId) ?? 'Kundin', branch_id: a._branch, state: a.state,
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
