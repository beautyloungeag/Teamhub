// Phorest lesend für TeamHub (BLTH-21). Nur GET gegen die Third-Party-API.
// Secrets: PHOREST_AUTH (Basic-Header), PHOREST_BUSINESS_ID.
// Aktionen:
//   my_day      {date?}          eigene Schichten + Termine (alle eigenen Phorest-Spalten)
//   my_month    {from, to}       Anzahl eigener Termine je Tag (Kalender)
//   branch_day  {branch, date?}  Filialkalender: alle Studios für alle Angemeldeten (eigenes ist in der App voreingestellt)
//   team_today  {branch}         wer arbeitet heute: nur Filialleitung der Filiale oder Büro
//   staff_week  {employee_id?}   Schichten der nächsten 7 Tage einer Person (ohne Kundendaten; für Profil)
//   client_search {q}            Kundin suchen (Name, E-Mail oder Telefon), protokolliert
//   client_history {client_id, months?, summary?} Besuche + Notizen der letzten Monate, auf Wunsch mit KI-Zusammenfassung, protokolliert
//   services    {branch?, q?}    Behandlungskatalog (Dauer, Preis CHF, Kategorie), alle Rollen
//   performance {from, to, employee_id? | branch?, totals_only?} Kennzahlen + Bewertungen, Vergleich zum Vorzeitraum
//   read        {path}           freie GET-Abfrage für Marc (Filialleitung: eigene Filiale ohne Umsätze, Büro alles)
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
    ph(`/branch/${phorestBranch}/appointment?from_date=${date}&to_date=${date}&fetch_canceled=false&fetch_notes=true&size=500`),
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
  // Kontaktdaten von Kundinnen (Telefon, E-Mail, Adresse, Geburtstag) nur für Respo, Stv. Respo und Büro (Renée 20.10.)
  const seesContact = me.app_role !== 'mitarbeiterin'
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

    // Anzahl eigener Termine je Tag für einen Monat (Kalender-Punkte), höchstens 31 Tage
    if (body.action === 'my_month') {
      const ok = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
      if (!ok(body.from) || !ok(body.to) || (Date.parse(body.to) - Date.parse(body.from)) / 864e5 > 31) return json({ ok: false, error: 'bad_range' }, 400)
      const { data: maps } = await admin.from('employee_phorest').select('branch_id, staff_id').eq('employee_id', me.id)
      if (!maps?.length) return json({ ok: true, mapped: false, days: {} })
      const days: Record<string, number> = {}
      for (const m of maps) {
        const pbid = pb(m.branch_id); if (!pbid) continue
        const r = await ph(`/branch/${pbid}/appointment?from_date=${body.from}&to_date=${body.to}&staff_id=${encodeURIComponent(m.staff_id)}&fetch_canceled=false&size=500`)
        for (const a of r?._embedded?.appointments ?? []) if (!a.deleted && a.activationState !== 'CANCELED' && a.staffId === m.staff_id) days[a.appointmentDate] = (days[a.appointmentDate] ?? 0) + 1
      }
      return json({ ok: true, mapped: true, days })
    }

    if (body.action === 'branch_day' || body.action === 'team_today') {
      const b = String(body.branch ?? me.branch_id)
      // Kundentermine aller Studios darf jede angemeldete Person ansehen (Aleksa 20.10.), Team heute bleibt bei der Leitung
      const allowed = me.app_role === 'buero' || body.action === 'branch_day' || (me.app_role === 'filialleitung' && myBranches.includes(b))
      if (!allowed) return json({ ok: false, error: 'forbidden' }, 403)
      const pbid = pb(b); if (!pbid) return json({ ok: false, error: 'no_phorest_branch' }, 400)
      const [staff, d] = await Promise.all([ph(`/branch/${pbid}/staff?size=200`), dayData(pbid, date)])
      const cols = (staff?._embedded?.staffs ?? []).filter((s: any) => !s.archived && !s.hideFromAppointmentScreen)
        .map((s: any) => ({ staff_id: s.staffId, name: `${s.firstName ?? ''}`.trim(), shift: d.shifts.get(s.staffId) ?? null }))
      if (body.action === 'team_today') {
        return json({ ok: true, date, team: cols.filter((c: any) => c.shift).map((c: any) => ({ name: c.name, ...c.shift, appointments: d.list.filter((a: any) => a.staffId === c.staff_id).length })) })
      }
      const names = await clientNames(d.list.map((a: any) => a.clientId))
      // Freie Zeiten je Person: Schicht minus Termine, Lücken ab 15 Minuten
      const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)), fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      for (const c of cols as any[]) {
        if (!c.shift) { c.free = []; continue }
        const busy = d.list.filter((a: any) => a.staffId === c.staff_id).map((a: any) => [mins(hhmm(a.startTime)), mins(hhmm(a.endTime))]).sort((x: number[], y: number[]) => x[0] - y[0])
        let cur = mins(c.shift.start); const end = mins(c.shift.end), free: string[] = []
        for (const [a, b] of busy) { if (a - cur >= 15) free.push(`${fmt(cur)}–${fmt(a)}`); cur = Math.max(cur, b) }
        if (end - cur >= 15) free.push(`${fmt(cur)}–${fmt(end)}`)
        c.free = free
      }
      return json({ ok: true, date, columns: cols.filter((c: any) => c.shift || d.list.some((a: any) => a.staffId === c.staff_id)), appointments: d.list.map((a: any) => ({
        staff_id: a.staffId, start: hhmm(a.startTime), end: hhmm(a.endTime), service: a.serviceName ?? '', client: names.get(a.clientId) ?? 'Kundin', client_id: a.clientId ?? null, notes: String(a.notes ?? a.note ?? '').trim(), price: a.price ?? null, confirmed: !!a.confirmed,
      })) })
    }

    if (body.action === 'staff_week') {
      // Nur Arbeitszeiten, keine Termine: darf jede Kollegin sehen (z. B. um jemanden anzurufen)
      const who = typeof body.employee_id === 'string' ? body.employee_id : me.id
      const { data: maps } = await admin.from('employee_phorest').select('branch_id, staff_id').eq('employee_id', who)
      if (!maps?.length) return json({ ok: true, mapped: false, days: [] })
      // Phorest liefert den Dienstplan zuverlässig nur je Tag – deshalb sieben einzelne Abfragen
      const [y0, m0, d0] = today().split('-').map(Number)
      const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y0, m0 - 1, d0 + i)).toISOString().slice(0, 10))
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
      if (!seesContact && (q.includes('@') || digits.length >= 7)) return json({ ok: false, error: 'contact_search_forbidden' }, 403)
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
        phone_tail: seesContact ? String(c.mobile ?? c.landLine ?? '').replace(/\s/g, '').slice(-4) : '', since: String(c.createdAt ?? c.firstVisit ?? '').slice(0, 10),
      })) })
    }

    if (body.action === 'client_history') {
      const cid = String(body.client_id ?? '')
      if (!cid) return json({ ok: false, error: 'no_client' }, 400)
      const months = Math.min(24, Math.max(1, Number(body.months) || 12))
      const client = await ph(`/client/${encodeURIComponent(cid)}`)
      // Phorest liefert Termine nur in Zeitfenstern (max. ~31 Tage); je Studio und Monat eine Abfrage
      const f = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(d)
      const windows = Array.from({ length: months }, (_, i) => {
        const to = new Date(Date.now() - i * 30 * 864e5), from = new Date(to.getTime() - 30 * 864e5)
        return [f(from), f(to)]
      })
      // Kommende Termine: drei Fenster à 30 Tage voraus
      for (let i = 0; i < 3; i++) windows.push([f(new Date(Date.now() + (i * 30 + 1) * 864e5)), f(new Date(Date.now() + (i + 1) * 30 * 864e5))])
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
      const nowLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', 'T')
      const mapped = [...byId.values()].sort((a, b) => `${b.appointmentDate}${b.startTime}`.localeCompare(`${a.appointmentDate}${a.startTime}`)).map((a) => ({
        date: a.appointmentDate, time: hhmm(a.startTime), branch: a._branch, service: a.serviceName ?? '', staff: sName.get(a.staffId) ?? '',
        cancelled: !!(a.cancelled || a.activationState === 'CANCELED'), notes: String(a.notes ?? a.note ?? '').trim(),
      }))
      const visits = mapped.filter((v) => `${v.date}T${v.time}` < nowLocal)
      const upcoming = mapped.filter((v) => `${v.date}T${v.time}` >= nowLocal && !v.cancelled).reverse()
      await admin.from('client_lookups').insert({ employee_id: me.id, action: 'history', client_id: cid, result_count: visits.length })
      // Kategorien (z. B. Stammkundin), falls Phorest sie liefert
      let categories: string[] = []
      if ((client.clientCategoryIds ?? []).length) try {
        const cats = (await ph('/client-category?size=200'))?._embedded?.clientCategories ?? []
        categories = cats.filter((c: any) => client.clientCategoryIds.includes(c.clientCategoryId ?? c.id)).map((c: any) => String(c.name ?? '')).filter(Boolean)
      } catch { /* ohne Kategorien */ }
      const addr = client.address ?? {}
      const info = {
        name: `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(), since: String(client.clientSince ?? client.firstVisit ?? client.createdAt ?? '').slice(0, 10),
        last_visit: String(client.lastVisit ?? '').slice(0, 10), preferred: sName.get(client.preferredStaffId) ?? '',
        email: client.email ?? '', phone: String(client.mobile ?? client.landLine ?? '').trim(),
        landline: client.mobile && client.landLine ? String(client.landLine).trim() : '',
        gender: client.gender ?? '', birth_date: String(client.birthDate ?? client.dateOfBirth ?? '').slice(0, 10),
        address: [addr.streetAddress1, addr.streetAddress2, [addr.postalCode, addr.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        notes: String(client.notes ?? '').trim(), first_visit: String(client.firstVisit ?? '').slice(0, 10),
        last_branch: (branches ?? []).find((b) => b.phorest_branch_id === client.lastVisitedBranchId)?.name ?? '',
        loyalty_points: client.loyaltyCard?.points ?? null, balance: Number(client.creditAccount?.outstandingBalance ?? 0),
        membership: !!client.hasActiveMembership, banned: !!client.banned, categories,
        consent: { sms_marketing: !!client.smsMarketingConsent, email_marketing: !!client.emailMarketingConsent, sms_reminder: !!client.smsReminderConsent, email_reminder: !!client.emailReminderConsent },
      }
      if (!seesContact) Object.assign(info, { email: '', phone: '', landline: '', address: '', birth_date: '', contact_hidden: true })
      // Zusammenfassung: nur Besuche und Notizen, keine Kontaktdaten an das Sprachmodell
      let summary: string | null = null
      if (body.summary && hasAI() && visits.length) {
        try {
          const out = await aiJson<{ summary: string }>([
            'Du fasst für eine Mitarbeiterin eines Kosmetikstudios die Historie einer Kundin aus Phorest zusammen, damit sie gut vorbereitet in den Termin geht.',
            'Höchstens 6 kurze Zeilen, Schweizer Hochdeutsch, sachlich. Inhalt: seit wann Kundin, wie oft und welche Behandlungen meist, bei wem (nur wenn Namen vorhanden sind, sonst gar nicht erwähnen), letzter Besuch, Absagen nur wenn auffällig.',
            'Aus der Kundennotiz und den Terminnotizen nur, was für die Behandlung zählt (Allergien, Unverträglichkeiten, Reklamationen, Vorlieben, Wünsche), mit Datum. Nichts erfinden; gibt es keine Notizen, sag das in einem Halbsatz.',
            'Gib nur JSON zurück: {"summary": string}',
          ].join('\n'), JSON.stringify({ kundin_seit: info.since, letzter_besuch: info.last_visit, bevorzugt: info.preferred, kundennotiz: info.notes, besuche: visits.slice(0, 80) }))
          summary = String(out.summary ?? '').trim() || null
          await admin.from('client_lookups').insert({ employee_id: me.id, action: 'summary', client_id: cid, result_count: visits.length })
        } catch { summary = null }
      }
      return json({ ok: true, months, client: info, visits, upcoming, summary })
    }

    // Behandlungen mit Dauer, Preis (CHF), Kategorie und Online-Buchbarkeit, gefiltert nach Suchwörtern
    if (body.action === 'services') {
      const b = String(body.branch ?? (me.branch_id === 'buero' ? 'basel-1' : me.branch_id))
      const pbid = pb(b); if (!pbid) return json({ ok: false, error: 'no_phorest_branch' }, 400)
      const list = ((await ph(`/branch/${pbid}/service?size=500`))?._embedded?.services ?? []).filter((x: any) => !x.archived)
      const words = String(body.q ?? '').toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3)
      const hits = words.length ? list.filter((x: any) => words.some((w: string) => `${x.name} ${x.categoryName ?? ''}`.toLowerCase().includes(w))) : list
      return json({ ok: true, branch: b, total: hits.length, services: hits.slice(0, 60).map((x: any) => ({ name: String(x.name ?? '').trim(), minuten: x.duration, preis_chf: x.price, kategorie: x.categoryName ?? '', online_buchbar: !!x.internetEnabled, nur_zusatz: !!x.isAddonOnly })) })
    }

    // Meine Performance (Wunsch Renée 25.09., Vorbild „Meine Performance“ in PhorestGo).
    // Person: eigene Zahlen (Leitung: Personen ihres Studios, Büro: alle). Studio: je Person + gesamt (Leitung/Büro),
    // mit totals_only auch für Mitarbeiterinnen des Studios (Teamziele, ohne Einzelzahlen).
    if (body.action === 'performance') {
      const okd = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
      if (!okd(body.from) || !okd(body.to) || body.to < body.from || (Date.parse(body.to) - Date.parse(body.from)) / 864e5 > 92) return json({ ok: false, error: 'bad_range' }, 400)
      const from = body.from as string, to = body.to as string
      const studio = typeof body.branch === 'string' ? body.branch : null
      const { data: maps0 } = await admin.from('employee_phorest').select('employee_id, branch_id, staff_id')
      const maps = maps0 ?? []
      let targets: { branch_id: string; staff_id: string }[] = []
      if (studio) {
        const lead = me.app_role === 'buero' || (me.app_role === 'filialleitung' && myBranches.includes(studio))
        if (!lead && !(body.totals_only && myBranches.includes(studio))) return json({ ok: false, error: 'forbidden' }, 403)
        if (!pb(studio)) return json({ ok: false, error: 'no_phorest_branch' }, 400)
      } else {
        const who = typeof body.employee_id === 'string' ? body.employee_id : me.id
        if (who !== me.id && me.app_role !== 'buero') {
          const { data: emp } = await admin.from('employees').select('branch_id, extra_branch_ids').eq('id', who).maybeSingle()
          const theirs = emp ? [emp.branch_id, ...(emp.extra_branch_ids ?? [])] : []
          if (me.app_role !== 'filialleitung' || !theirs.some((b) => b !== 'buero' && myBranches.includes(b))) return json({ ok: false, error: 'forbidden' }, 403)
        }
        targets = maps.filter((m) => m.employee_id === who).map((m) => ({ branch_id: m.branch_id, staff_id: m.staff_id }))
        if (!targets.length) return json({ ok: true, mapped: false })
      }
      const branchesUsed = studio ? [studio] : [...new Set(targets.map((t) => t.branch_id))]
      // Vorzeitraum gleicher Länge direkt davor
      const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1
      const shift = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
      const pFrom = shift(from, -days), pTo = shift(from, -1)
      // Termine seitenweise, in Fenstern von höchstens 31 Tagen
      const fetchAppts = async (pbid: string, f: string, t: string) => {
        const out: any[] = []
        for (let s = f; s <= t; s = shift(s, 31)) {
          const e = shift(s, 30) < t ? shift(s, 30) : t
          for (let page = 0; page < 20; page++) {
            const r = await ph(`/branch/${pbid}/appointment?from_date=${s}&to_date=${e}&fetch_canceled=false&size=500&page=${page}`)
            out.push(...(r?._embedded?.appointments ?? []))
            if (page + 1 >= (r?.page?.totalPages ?? 1)) break
          }
        }
        return out.filter((a) => !a.deleted && a.activationState !== 'CANCELED')
      }
      const metrics = (list: any[]) => {
        const paid = list.filter((a) => a.state === 'PAID')
        const revenue = Math.round(paid.reduce((s, a) => s + Number(a.price ?? 0), 0) * 100) / 100
        const visits = new Set(paid.map((a) => `${a.clientId}|${a.appointmentDate}`)).size
        return {
          treatments: paid.length, revenue, clients: new Set(paid.map((a) => a.clientId)).size, visits,
          avg_ticket: visits ? Math.round(revenue / visits * 100) / 100 : 0,
          requested: paid.filter((a) => a.staffRequest).length, requested_pct: paid.length ? Math.round(paid.filter((a) => a.staffRequest).length / paid.length * 100) : 0,
          booked: list.length, online_pct: list.length ? Math.round(list.filter((a) => a.source === 'ECOMM_WEB_APP').length / list.length * 100) : 0,
        }
      }
      // Bewertungen: Phorest filtert weder nach Person noch nach Datum; neueste zuerst, bis vor den Zeitraum
      const fetchReviews = async (pbid: string) => {
        const out: any[] = []
        for (let page = 0; page < 12; page++) {
          const r = await ph(`/branch/${pbid}/review?size=100&page=${page}`)
          const list = r?._embedded?.reviews ?? []
          out.push(...list)
          if (!list.length || String(list[list.length - 1].reviewDate ?? '').slice(0, 10) < pFrom || page + 1 >= (r?.page?.totalPages ?? 1)) break
        }
        return out
      }
      const curA: any[] = [], prevA: any[] = [], revs: any[] = []
      const names = new Map<string, string>()
      await Promise.all(branchesUsed.map(async (b) => {
        const pbid = pb(b)!
        const [c, p, rv, st] = await Promise.all([fetchAppts(pbid, from, to), fetchAppts(pbid, pFrom, pTo), fetchReviews(pbid), studio ? ph(`/branch/${pbid}/staff?size=200`) : Promise.resolve(null)])
        curA.push(...c.map((a) => ({ ...a, _b: b }))); prevA.push(...p.map((a) => ({ ...a, _b: b }))); revs.push(...rv.map((r: any) => ({ ...r, _b: b })))
        for (const s of st?._embedded?.staffs ?? []) names.set(s.staffId, String(s.firstName ?? '').trim())  // Nachnamen tragen in Phorest oft Sprachkürzel wie (F/TR)
      }))
      const mine = (a: any) => studio ? true : targets.some((t) => t.branch_id === a._b && t.staff_id === a.staffId)
      const inRange = (d: string, f: string, t: string) => d >= f && d <= t
      const rvSum = (list: any[]) => ({ count: list.length, avg: list.length ? Math.round(list.reduce((s, r) => s + Number(r.rating ?? 0), 0) / list.length * 10) / 10 : null })
      const rvCur = revs.filter((r) => mine(r) && inRange(String(r.reviewDate ?? '').slice(0, 10), from, to))
      const rvPrev = revs.filter((r) => mine(r) && inRange(String(r.reviewDate ?? '').slice(0, 10), pFrom, pTo))
      const item = (r: any) => ({ date: String(r.reviewDate ?? '').slice(0, 10), rating: r.rating, text: String(r.text ?? '').trim(), client: `${(r.clientFirstName ?? '').trim()} ${(r.clientLastName ?? '').trim().slice(0, 1)}.`.trim(), staff: `${r.staffFirstName ?? ''}`.trim() })
      const cur = curA.filter(mine), prev = prevA.filter(mine)
      const total = { ...metrics(cur), reviews: rvSum(rvCur) }, prevTotal = { ...metrics(prev), reviews: rvSum(rvPrev) }
      // Werte je Tag für Verläufe (Termine = alle nicht abgesagten, Behandlungen/Umsatz = bezahlt)
      const perDay = (list: any[], f: string, t: string) => { const out: { date: string; booked: number; treatments: number; revenue: number }[] = []
        for (let d = f; d <= t; d = shift(d, 1)) { const x = list.filter((a) => a.appointmentDate === d), paid = x.filter((a) => a.state === 'PAID')
          out.push({ date: d, booked: x.length, treatments: paid.length, revenue: Math.round(paid.reduce((s, a) => s + Number(a.price ?? 0), 0)) }) }
        return out }
      const series = perDay(cur, from, to), prevSeries = perDay(prev, pFrom, pTo)
      if (!studio) return json({ ok: true, mapped: true, from, to, prev_from: pFrom, prev_to: pTo, metrics: total, prev: prevTotal, series, prev_series: prevSeries, reviews: rvCur.slice(0, 30).map(item) })
      const lead = me.app_role === 'buero' || (me.app_role === 'filialleitung' && myBranches.includes(studio))
      if (!lead) return json({ ok: true, from, to, metrics: total, prev: prevTotal, series, prev_series: prevSeries })
      const staffIds = [...new Set(cur.map((a) => a.staffId).concat(rvCur.map((r) => r.staffId)))].filter(Boolean)
      const people = staffIds.map((sid) => {
        const m = maps.find((x) => x.branch_id === studio && x.staff_id === sid)
        return { staff_id: sid, employee_id: m?.employee_id ?? null, name: names.get(sid) ?? 'Unbekannt', ...metrics(cur.filter((a) => a.staffId === sid)), reviews: rvSum(rvCur.filter((r) => r.staffId === sid)) }
      }).sort((a, b) => b.revenue - a.revenue)
      return json({ ok: true, from, to, prev_from: pFrom, prev_to: pTo, metrics: total, prev: prevTotal, series, prev_series: prevSeries, people, reviews: rvCur.slice(0, 30).map(item) })
    }

    // Freie Leseabfrage für Marc (nur Filialleitung und Büro). Nur GET, nur unterhalb des eigenen Business.
    // Filialleitung: nur eigene Filiale, keine Umsätze. Kundendaten werden protokolliert.
    if (body.action === 'read') {
      if (me.app_role === 'mitarbeiterin') return json({ ok: false, error: 'forbidden' }, 403)
      const raw = String(body.path ?? '').trim().replace(/^\/+/, '').replace(/^business\/[^/]+\//, '')
      if (!raw || raw.includes('..') || /^https?:/i.test(raw)) return json({ ok: false, error: 'bad_path' }, 400)
      const parts = raw.split('?')[0].split('/')
      const head = parts[0].toLowerCase()
      if (!['branch', 'client', 'voucher'].includes(head)) return json({ ok: false, error: 'path_not_allowed', allowed: 'branch, branch/{id}/…, client, client/{id}, voucher' }, 400)
      if (head === 'branch' && parts[1]) {
        const own = (branches ?? []).filter((b) => me.app_role === 'buero' || myBranches.includes(b.id)).map((b) => b.phorest_branch_id)
        if (!own.includes(parts[1])) return json({ ok: false, error: 'branch_not_allowed' }, 403)
        if (me.app_role !== 'buero' && /^(purchase|transaction|sale|report)/i.test(parts[2] ?? '')) return json({ ok: false, error: 'forbidden_for_role' }, 403)
      }
      if (head === 'client' || /client_id=/.test(raw)) await admin.from('client_lookups').insert({ employee_id: me.id, action: 'search', query: ('read ' + raw).slice(0, 120), result_count: null })
      try {
        const text = JSON.stringify(await ph('/' + raw))
        return json({ ok: true, truncated: text.length > 15000, body: text.slice(0, 15000) })
      } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : String(e) }) }
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
