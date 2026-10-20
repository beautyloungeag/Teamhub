// Push-Mitteilungen (BLTH-27). Läuft alle 2 Minuten per pg_cron und zusätzlich direkt
// nach dem Veröffentlichen im Backoffice. Meldet, was fällig und noch nicht gemeldet ist:
//   - News, sobald publish_at erreicht ist (auch zeitgesteuerte), an die Zielgruppe
//   - neue Schulungen/Events an Zielgruppe (Studio, Skills)
//   - Statuswechsel/Zuweisung einer Meldung an die meldende Person
//   - neue Aufgabe von Filialleitung/Büro an die Person bzw. das ganze Studio
//   - Aushilfe gesucht (an Eingetragene oder alle) und „du bist eingeteilt“
//   - für Filialleitung/Büro (abschaltbar unter Einstellungen → Mitteilungen, employees.notify_prefs):
//     neue Meldung/Idee im Studio, Zusage auf eine Aushilfe-Anfrage, Zusammenfassung zum Anmeldeschluss,
//     überfällige Checkliste (einmal je Studio, Liste und Tag)
//   - von der Warteliste nachgerückt
// Dazu auf Knopfdruck: remind_event (alle ohne Antwort zu einem Termin), remind_poll (alle ohne Antwort zu einer Umfrage)
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, NOTIFY_SECRET
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
type Msg = { title: string; body: string; url: string; tag: string }
type Lang = 'DE' | 'EN' | 'FR'
// Rahmentexte je Sprache der Empfängerin; Inhalte (Titel, Teaser) bleiben wie erfasst.
const L: Record<Lang, Record<string, string>> = {
  DE: { must: 'Bitte lesen: {t}', newsFallback: 'Neue News im TeamHub', ev: 'Neu: {k} „{t}“', join: 'jetzt anmelden', ticket: 'Deine Meldung', on: 'Mitteilungen sind eingeschaltet.', todo: 'Neue Aufgabe von {n}', until: 'bis', sb: 'Aushilfe gesucht · {b}', sbOk: 'Du hilfst aus · {b}', evRem: 'Bitte antworten: {t}', evRemBody: 'Kommst du? Kurz zu- oder absagen.', tkNew: 'Neue Meldung · {b}', ideaNew: 'Neue Idee · {b}', sbYes: '{n} kann aushelfen', evSum: 'Anmeldeschluss: {t}', evSumBody: '{a} kommen · {b} nicht · {c} ohne Antwort', promoted: 'Du bist nachgerückt: {t}', promotedBody: 'Ein Platz ist frei geworden, du bist dabei.', overdue: '{b} · {t} noch offen', overdueBody: '{n} von {m} offen, fällig bis {h}', poll: 'Bitte mitmachen: {t}', pollBody: 'Kurze Umfrage, dauert eine Minute.' },
  EN: { must: 'Please read: {t}', newsFallback: 'New news in TeamHub', ev: 'New: {k} “{t}”', join: 'register now', ticket: 'Your report', on: 'Notifications are on.', todo: 'New task from {n}', until: 'by', sb: 'Cover needed · {b}', sbOk: 'You are covering · {b}', evRem: 'Please reply: {t}', evRemBody: 'Are you coming? Quick yes or no.', tkNew: 'New report · {b}', ideaNew: 'New idea · {b}', sbYes: '{n} can cover', evSum: 'Registration closed: {t}', evSumBody: '{a} coming · {b} not · {c} no reply', promoted: 'You moved up: {t}', promotedBody: 'A place became free, you are in.', overdue: '{b} · {t} still open', overdueBody: '{n} of {m} open, due by {h}', poll: 'Please take part: {t}', pollBody: 'Short survey, takes a minute.' },
  FR: { must: 'À lire : {t}', newsFallback: 'Nouvelle actualité dans TeamHub', ev: 'Nouveau : {k} « {t} »', join: 'inscris-toi', ticket: 'Ton signalement', on: 'Les notifications sont activées.', todo: 'Nouvelle tâche de {n}', until: 'avant', sb: 'Remplacement recherché · {b}', sbOk: 'Tu remplaces · {b}', evRem: 'Merci de répondre : {t}', evRemBody: 'Tu viens ? Réponds oui ou non.', tkNew: 'Nouveau signalement · {b}', ideaNew: 'Nouvelle idée · {b}', sbYes: '{n} peut remplacer', evSum: 'Inscriptions closes : {t}', evSumBody: '{a} viennent · {b} non · {c} sans réponse', promoted: 'Tu as une place : {t}', promotedBody: 'Une place s’est libérée, tu en fais partie.', overdue: '{b} · {t} pas terminé', overdueBody: '{n} sur {m} ouverts, à faire avant {h}', poll: 'Merci de participer : {t}', pollBody: 'Petit sondage, une minute.' },
}
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
const LOC: Record<Lang, string> = { DE: 'de-CH', EN: 'en-GB', FR: 'fr-CH' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // Aufruf durch den Cron (Geheimnis) oder durch eine angemeldete Person (nur „jetzt prüfen“)
  const secretOk = req.headers.get('x-notify-secret') === Deno.env.get('NOTIFY_SECRET')
  if (!secretOk) {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: me } = await user.rpc('current_employee')
    if (!me?.id) return json({ ok: false, error: 'forbidden' }, 403)
  }
  const body = await req.json().catch(() => ({}))
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@aleksa.ai', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

  const { data: emps } = await admin.from('employees').select('id, first_name, branch_id, extra_branch_ids, skills, app_role, lang, job_title, notify_prefs').eq('active', true)
  const staff = emps ?? []
  const inBranches = (e: any, br: string[]) => br.length === 0 || br.includes(e.branch_id) || (e.extra_branch_ids ?? []).some((b: string) => br.includes(b))
  // Gleiche Regel wie public.job_groups() / news_for_me() in der Datenbank
  const groupsOf = (t: string) => [/(respo|stv\.?\s*r|filialleit)/i.test(t) && 'Filialleitung', /kosmetik/i.test(t) && 'Kosmetikerinnen', /(lehrling|lernend|praktik|berufsbild)/i.test(t) && 'Lernende', /(büro|buero|\bhr\b|fibu|office)/i.test(t) && 'Büro'].filter(Boolean) as string[]
  const forNews = (e: any, n: any) => (n.audience_people ?? []).length ? n.audience_people.includes(e.id)
    : inBranches(e, n.audience_branches ?? []) && ((n.audience_groups ?? []).length === 0 || groupsOf(e.job_title ?? '').some((g) => n.audience_groups.includes(g)))
      && ((n.audience_skills ?? []).length === 0 || (e.skills ?? []).some((k: string) => n.audience_skills.includes(k)))
  // Mitteilungen für Leitung: Standard je Rolle, abschaltbar in den Einstellungen (gleiche Standards wie im Backoffice)
  const DEF: Record<string, { filialleitung: boolean; buero: boolean }> = {
    lead_tickets: { filialleitung: true, buero: true }, lead_ideas: { filialleitung: false, buero: true }, lead_standby: { filialleitung: true, buero: true },
    lead_events: { filialleitung: true, buero: true }, lead_overdue: { filialleitung: true, buero: false },
  }
  const pref = (e: any, k: string) => { const v = (e.notify_prefs ?? {})[k]; return typeof v === 'boolean' ? v : (DEF[k]?.[e.app_role as 'filialleitung' | 'buero'] ?? false) }
  const leadsOf = (branch: string, k: string) => staff.filter((e) => (e.app_role === 'buero' || (e.app_role === 'filialleitung' && inBranches(e, [branch]))) && pref(e, k))

  // Probe-Mitteilung an sich selbst (Knopf im Profil)
  if (body.action === 'test') {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: me } = await user.rpc('current_employee')
    if (!me?.id) return json({ ok: false, error: 'forbidden' }, 403)
    const lang = (staff.find((e) => e.id === me.id)?.lang ?? 'DE') as Lang
    const r = await send(admin, [me.id], { title: 'TeamHub', body: L[lang].on, url: '/', tag: 'test' })
    return json({ ok: true, ...r })
  }

  // Erinnerung an alle ohne Antwort zu einem Termin (Knopf im Backoffice)
  if (body.action === 'remind_event') {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: me } = await user.rpc('current_employee')
    const { data: ev } = await admin.from('events').select('id, title, starts_at, audience_branches, audience_skills, created_by').eq('id', String(body.event_id ?? '')).maybeSingle()
    if (!me?.id || !ev) return json({ ok: false, error: 'not_found' }, 404)
    const mine = [me.branch_id, ...(me.extra_branch_ids ?? [])]
    const allowed = me.app_role === 'buero' || (me.app_role === 'filialleitung' && (ev.created_by === me.id || (ev.audience_branches ?? []).some((b: string) => mine.includes(b)) || !(ev.audience_branches ?? []).length))
    if (!allowed) return json({ ok: false, error: 'forbidden' }, 403)
    const { data: regs } = await admin.from('event_registrations').select('employee_id').eq('event_id', ev.id)
    const answered = new Set((regs ?? []).map((r: any) => r.employee_id))
    const ids = staff.filter((e) => e.branch_id !== 'buero' && !answered.has(e.id) && inBranches(e, ev.audience_branches ?? [])
      && ((ev.audience_skills ?? []).length === 0 || (e.skills ?? []).some((k: string) => ev.audience_skills.includes(k)))
      && (me.app_role === 'buero' || mine.some((b) => e.branch_id === b || (e.extra_branch_ids ?? []).includes(b)))).map((e) => e.id)
      // Einzelne Personen: nur wer davon wirklich noch offen ist
      .filter((id) => !Array.isArray(body.employee_ids) || body.employee_ids.includes(id))
    const r = await sendByLang(admin, staff, ids, (l) => ({ title: fill(L[l].evRem, { t: ev.title }), body: L[l].evRemBody, url: '/?open=events', tag: `event-${ev.id}` }))
    return json({ ok: true, people: ids.length, ...r })
  }

  // Erinnerung an alle ohne Antwort zu einer Umfrage (Knopf im Backoffice)
  if (body.action === 'remind_poll') {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: me } = await user.rpc('current_employee')
    const { data: poll } = await admin.from('polls').select('id, closes_at, news(id, title, author_id, audience_branches, audience_groups, audience_skills, audience_people)').eq('id', String(body.poll_id ?? '')).maybeSingle()
    const n: any = poll ? (Array.isArray(poll.news) ? poll.news[0] : poll.news) : null
    if (!me?.id || !n) return json({ ok: false, error: 'not_found' }, 404)
    if (poll!.closes_at && new Date(poll!.closes_at) < new Date()) return json({ ok: false, error: 'closed' }, 400)
    const mine = [me.branch_id, ...(me.extra_branch_ids ?? [])]
    const lead = me.app_role === 'buero' || (me.app_role === 'filialleitung' && (n.author_id === me.id || (n.audience_branches ?? []).some((b: string) => mine.includes(b))))
    if (!lead) return json({ ok: false, error: 'forbidden' }, 403)
    const { data: ans } = await admin.from('poll_answers').select('employee_id').eq('poll_id', poll!.id)
    const done = new Set((ans ?? []).map((a: any) => a.employee_id))
    const ids = staff.filter((e) => !done.has(e.id) && forNews(e, n) && (me.app_role === 'buero' || mine.some((b) => e.branch_id === b || (e.extra_branch_ids ?? []).includes(b)))).map((e) => e.id)
    const r = await sendByLang(admin, staff, ids, (l) => ({ title: fill(L[l].poll, { t: n.title }), body: L[l].pollBody, url: `/?open=news:${n.id}`, tag: `poll-${poll!.id}` }))
    return json({ ok: true, people: ids.length, ...r })
  }

  const now = new Date().toISOString()
  let sent = 0, failed = 0, removed = 0
  const add = (r: { sent: number; failed: number; removed: number }) => { sent += r.sent; failed += r.failed; removed += r.removed }

  // 1) News, die jetzt sichtbar sind
  const { data: news } = await admin.from('news').select('id, title, teaser, must_read, audience_branches, audience_groups, audience_skills, audience_people').is('notified_at', null).lte('publish_at', now).limit(20)
  for (const n of news ?? []) {
    await admin.from('news').update({ notified_at: now }).eq('id', n.id)  // zuerst markieren: nie doppelt melden
    const ids = staff.filter((e) => forNews(e, n)).map((e) => e.id)
    add(await sendByLang(admin, staff, ids, (l) => ({ title: n.must_read ? fill(L[l].must, { t: n.title }) : n.title, body: n.teaser || L[l].newsFallback, url: `/?open=news:${n.id}`, tag: `news-${n.id}` })))
  }
  // 2) Neue Schulungen und Events
  const { data: evs } = await admin.from('events').select('id, title, kind, starts_at, place, audience_branches, audience_skills').is('notified_at', null).limit(20)
  for (const e of evs ?? []) {
    await admin.from('events').update({ notified_at: now }).eq('id', e.id)
    if (new Date(e.starts_at) < new Date()) continue
    const ids = staff.filter((x) => inBranches(x, e.audience_branches ?? []) && ((e.audience_skills ?? []).length === 0 || (x.skills ?? []).some((s: string) => e.audience_skills.includes(s)))).map((x) => x.id)
    add(await sendByLang(admin, staff, ids, (l) => {
      const when = new Intl.DateTimeFormat(LOC[l], { timeZone: 'Europe/Zurich', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(e.starts_at))
      return { title: fill(L[l].ev, { k: e.kind, t: e.title }), body: `${when}${e.place ? ' · ' + e.place : ''} · ${L[l].join}`, url: '/?open=events', tag: `event-${e.id}` }
    }))
  }
  // 3) Stand der eigenen Meldung
  const { data: tev } = await admin.from('ticket_events').select('id, ticket_id, what, tickets(title, created_by)').is('notified_at', null).neq('what', 'Erfasst').limit(50)
  for (const t of tev ?? []) {
    await admin.from('ticket_events').update({ notified_at: now }).eq('id', t.id)
    const tk: any = Array.isArray(t.tickets) ? t.tickets[0] : t.tickets
    if (tk?.created_by) add(await sendByLang(admin, staff, [tk.created_by], (l) => ({ title: L[l].ticket, body: `${tk.title}: ${t.what}`, url: `/?open=ticket:${t.ticket_id}`, tag: `ticket-${t.ticket_id}` })))
  }
  await admin.from('ticket_events').update({ notified_at: now }).is('notified_at', null).eq('what', 'Erfasst')
  // 4) Neue Aufgaben, die jemand anderem gegeben wurden (eigene To-dos still markieren)
  const { data: tds } = await admin.from('todos').select('id, title, due_at, assignee_id, branch_id, created_by, created_by_name').is('notified_at', null).is('done_at', null).limit(50)
  for (const x of tds ?? []) {
    await admin.from('todos').update({ notified_at: now }).eq('id', x.id)
    if (x.assignee_id && x.assignee_id === x.created_by) continue
    const ids = x.assignee_id ? [x.assignee_id] : staff.filter((e) => e.id !== x.created_by && inBranches(e, [x.branch_id])).map((e) => e.id)
    add(await sendByLang(admin, staff, ids, (l) => {
      let until = ''
      if (x.due_at) {
        const d = new Date(x.due_at), hm = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(d)
        until = ` · ${L[l].until} ${new Intl.DateTimeFormat(LOC[l], { timeZone: 'Europe/Zurich', weekday: 'short', day: '2-digit', month: '2-digit', ...(hm === '23:59' ? {} : { hour: '2-digit', minute: '2-digit' }) }).format(d)}`
      }
      return { title: fill(L[l].todo, { n: x.created_by_name || 'TeamHub' }), body: x.title + until, url: '/?open=todos', tag: `todo-${x.id}` }
    }))
  }
  // 5) Aushilfe gesucht: an alle, die sich für den Tag eingetragen haben (oder an alle), passend zum Skill
  const { data: brs } = await admin.from('branches').select('id, name')
  const bName = (id: string) => (brs ?? []).find((b: any) => b.id === id)?.name ?? id
  const sbWhen = (x: any, l: Lang) => `${new Intl.DateTimeFormat(LOC[l], { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(x.day + 'T12:00:00Z'))}${x.start_time ? ` · ${String(x.start_time).slice(0, 5)}${x.end_time ? `–${String(x.end_time).slice(0, 5)}` : ''}` : ''}`
  const { data: sreq } = await admin.from('standby_requests').select('*').is('notified_at', null).eq('status', 'offen').limit(20)
  for (const x of sreq ?? []) {
    await admin.from('standby_requests').update({ notified_at: now }).eq('id', x.id)
    const { data: days } = await admin.from('standby_days').select('employee_id').eq('day', x.day)
    const avail = new Set((days ?? []).map((d: any) => d.employee_id))
    const ids = staff.filter((e) => e.id !== x.created_by && e.branch_id !== 'buero' && (x.to_all || avail.has(e.id)) && (!x.skill || (e.skills ?? []).includes(x.skill))).map((e) => e.id)
    add(await sendByLang(admin, staff, ids, (l) => ({ title: fill(L[l].sb, { b: bName(x.branch_id) }), body: [sbWhen(x, l), x.skill, x.note].filter(Boolean).join(' · '), url: '/?open=standby', tag: `standby-${x.id}` })))
  }
  // 6) Eingeteilt: Mitteilung an die Person, die aushilft
  const { data: filled } = await admin.from('standby_requests').select('*').eq('status', 'besetzt').is('filled_notified_at', null).not('filled_by', 'is', null).limit(20)
  for (const x of filled ?? []) {
    await admin.from('standby_requests').update({ filled_notified_at: now }).eq('id', x.id)
    add(await sendByLang(admin, staff, [x.filled_by], (l) => ({ title: fill(L[l].sbOk, { b: bName(x.branch_id) }), body: [sbWhen(x, l), x.note].filter(Boolean).join(' · '), url: '/?open=standby', tag: `standby-${x.id}` })))
  }
  // 7) Neue Meldung oder Idee: an die Leitung des Studios und das Büro (je nach Einstellung)
  const { data: tnew } = await admin.from('tickets').select('id, kind, title, branch_id, created_by').is('lead_notified_at', null).limit(30)
  for (const t of tnew ?? []) {
    await admin.from('tickets').update({ lead_notified_at: now }).eq('id', t.id)
    const ids = leadsOf(t.branch_id, t.kind === 'Idee' ? 'lead_ideas' : 'lead_tickets').filter((e) => e.id !== t.created_by).map((e) => e.id)
    add(await sendByLang(admin, staff, ids, (l) => ({ title: fill(t.kind === 'Idee' ? L[l].ideaNew : L[l].tkNew, { b: bName(t.branch_id) }), body: t.title, url: `/?open=ticket:${t.id}`, tag: `ticket-${t.id}` })))
  }
  // 8) Zusage auf eine Aushilfe-Anfrage: an die Person, die angefragt hat
  const { data: sres } = await admin.from('standby_responses').select('request_id, employee_id, answer').is('notified_at', null).limit(50)
  for (const r of sres ?? []) {
    await admin.from('standby_responses').update({ notified_at: now }).match({ request_id: r.request_id, employee_id: r.employee_id })
    if (r.answer !== 'ja') continue
    const { data: x } = await admin.from('standby_requests').select('*').eq('id', r.request_id).maybeSingle()
    const who = staff.find((e) => e.id === r.employee_id), boss = staff.find((e) => e.id === x?.created_by)
    if (!x || x.status !== 'offen' || !boss || !pref(boss, 'lead_standby')) continue
    add(await sendByLang(admin, staff, [boss.id], (l) => ({ title: fill(L[l].sbYes, { n: who?.first_name ?? '' }), body: `${bName(x.branch_id)} · ${sbWhen(x, l)}`, url: '/?open=standby', tag: `standby-${x.id}` })))
  }
  // 9) Anmeldeschluss erreicht: Zusammenfassung an die Person, die den Termin angelegt hat
  const { data: evsum } = await admin.from('events').select('id, title, starts_at, register_until, audience_branches, audience_skills, created_by').is('summary_notified_at', null).gt('starts_at', now).limit(30)
  for (const e of evsum ?? []) {
    const due = e.register_until ? new Date(e.register_until) : new Date(new Date(e.starts_at).getTime() - 864e5)
    if (due > new Date()) continue
    await admin.from('events').update({ summary_notified_at: now }).eq('id', e.id)
    const boss = staff.find((x) => x.id === e.created_by)
    if (!boss || !pref(boss, 'lead_events')) continue
    const { data: regs } = await admin.from('event_registrations').select('employee_id, coming, waitlist').eq('event_id', e.id)
    const yes = (regs ?? []).filter((r: any) => r.coming && !r.waitlist).length, no = (regs ?? []).filter((r: any) => !r.coming).length
    const answered = new Set((regs ?? []).map((r: any) => r.employee_id))
    const open = staff.filter((x) => x.branch_id !== 'buero' && !answered.has(x.id) && inBranches(x, e.audience_branches ?? []) && ((e.audience_skills ?? []).length === 0 || (x.skills ?? []).some((k: string) => e.audience_skills.includes(k)))).length
    add(await sendByLang(admin, staff, [boss.id], (l) => ({ title: fill(L[l].evSum, { t: e.title }), body: fill(L[l].evSumBody, { a: String(yes), b: String(no), c: String(open) }), url: '/?open=events', tag: `event-${e.id}` })))
  }
  // 10) Von der Warteliste nachgerückt
  const { data: prom } = await admin.from('event_registrations').select('event_id, employee_id, events(title)').not('promoted_at', 'is', null).is('promoted_notified_at', null).limit(50)
  for (const r of prom ?? []) {
    await admin.from('event_registrations').update({ promoted_notified_at: now }).match({ event_id: r.event_id, employee_id: r.employee_id })
    const ev: any = Array.isArray(r.events) ? r.events[0] : r.events
    add(await sendByLang(admin, staff, [r.employee_id], (l) => ({ title: fill(L[l].promoted, { t: ev?.title ?? '' }), body: L[l].promotedBody, url: '/?open=events', tag: `event-${r.event_id}` })))
  }
  // 11) Checkliste überfällig: 30 Minuten nach der letzten Fälligkeit, einmal je Studio, Liste und Tag (06–21 Uhr)
  const zp = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const zg = (t: string) => zp.find((x) => x.type === t)?.value ?? '00'
  const day = `${zg('year')}-${zg('month')}-${zg('day')}`, mins = (Number(zg('hour')) % 24) * 60 + Number(zg('minute'))
  if (mins >= 6 * 60 && mins <= 21 * 60) {
    const [{ data: tpls }, { data: items }, { data: alerts }, { data: comp }, { data: demo }] = await Promise.all([
      admin.from('task_templates').select('id, name, repeat, weekday, monthday, branch_ids, active, proposed, is_sample'),
      admin.from('task_items').select('id, template_id, due_time'),
      admin.from('lead_alerts').select('branch_id, template_id').eq('day', day),
      admin.from('task_completions').select('item_id, branch_id').eq('day', day),
      admin.from('app_settings').select('value').eq('key', 'demo_data').maybeSingle(),
    ])
    const showSample = demo?.value !== false
    const dow = ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1, last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate()
    const applies = (t: any, b: string) => t.active && !t.proposed && (showSample || !t.is_sample) && ((t.branch_ids ?? []).length === 0 || t.branch_ids.includes(b))
      && (t.repeat === 'daily' || (t.repeat === 'weekly' && t.weekday === dow) || (t.repeat === 'monthly' && Math.min(t.monthday ?? 1, last) === Number(day.slice(8, 10))))
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    for (const b of (brs ?? []).filter((x: any) => x.id !== 'buero')) {
      for (const t of (tpls ?? []).filter((x: any) => applies(x, b.id))) {
        if ((alerts ?? []).some((a: any) => a.branch_id === b.id && a.template_id === t.id)) continue
        const its = (items ?? []).filter((i: any) => i.template_id === t.id)
        const dues = its.map((i: any) => i.due_time).filter(Boolean).map((x: string) => String(x).slice(0, 5)).sort()
        if (!its.length || !dues.length || mins < toMin(dues[dues.length - 1]) + 30) continue
        const open = its.filter((i: any) => !(comp ?? []).some((c: any) => c.item_id === i.id && c.branch_id === b.id)).length
        await admin.from('lead_alerts').insert({ day, branch_id: b.id, template_id: t.id })
        if (!open) continue
        const ids = staff.filter((e) => e.app_role === 'filialleitung' && inBranches(e, [b.id]) && pref(e, 'lead_overdue')).concat(staff.filter((e) => e.app_role === 'buero' && pref(e, 'lead_overdue'))).map((e) => e.id)
        add(await sendByLang(admin, staff, ids, (l) => ({ title: fill(L[l].overdue, { b: b.name, t: t.name }), body: fill(L[l].overdueBody, { n: String(open), m: String(its.length), h: dues[dues.length - 1] }), url: '/?open=tasks', tag: `overdue-${b.id}-${t.id}` })))
      }
    }
  }
  return json({ ok: true, sent, failed, removed })
})

// Empfängerinnen nach Sprache bündeln, je Sprache eine Nachricht
async function sendByLang(admin: any, staff: any[], ids: string[], make: (l: Lang) => Msg) {
  const groups = new Map<Lang, string[]>()
  for (const id of ids) { const l = ((staff.find((e) => e.id === id)?.lang) ?? 'DE') as Lang; groups.set(l, [...(groups.get(l) ?? []), id]) }
  const tot = { sent: 0, failed: 0, removed: 0 }
  for (const [l, g] of groups) { const r = await send(admin, g, make(l)); tot.sent += r.sent; tot.failed += r.failed; tot.removed += r.removed }
  return tot
}

async function send(admin: any, employeeIds: string[], msg: Msg) {
  let sent = 0, failed = 0, removed = 0
  if (!employeeIds.length) return { sent, failed, removed }
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('employee_id', employeeIds)
  await Promise.all((subs ?? []).map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 24 })
      sent++
    } catch (e: any) {
      // 404/410: Gerät hat das Abo verworfen → aufräumen
      if (e?.statusCode === 404 || e?.statusCode === 410) { await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); removed++ }
      else { failed++; await admin.from('push_subscriptions').update({ last_error: String(e?.statusCode ?? e?.message ?? e).slice(0, 200) }).eq('endpoint', s.endpoint) }
    }
  }))
  return { sent, failed, removed }
}
