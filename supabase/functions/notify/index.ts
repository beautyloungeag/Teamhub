// Push-Mitteilungen (BLTH-27). Läuft alle 2 Minuten per pg_cron und zusätzlich direkt
// nach dem Veröffentlichen im Backoffice. Meldet, was fällig und noch nicht gemeldet ist:
//   - News, sobald publish_at erreicht ist (auch zeitgesteuerte), an die Zielgruppe
//   - neue Schulungen/Events an Zielgruppe (Studio, Skills)
//   - Statuswechsel/Zuweisung einer Meldung an die meldende Person
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
  DE: { must: 'Bitte lesen: {t}', newsFallback: 'Neue News im TeamHub', ev: 'Neu: {k} „{t}“', join: 'jetzt anmelden', ticket: 'Deine Meldung', on: 'Mitteilungen sind eingeschaltet.' },
  EN: { must: 'Please read: {t}', newsFallback: 'New news in TeamHub', ev: 'New: {k} “{t}”', join: 'register now', ticket: 'Your report', on: 'Notifications are on.' },
  FR: { must: 'À lire : {t}', newsFallback: 'Nouvelle actualité dans TeamHub', ev: 'Nouveau : {k} « {t} »', join: 'inscris-toi', ticket: 'Ton signalement', on: 'Les notifications sont activées.' },
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

  const { data: emps } = await admin.from('employees').select('id, branch_id, extra_branch_ids, skills, app_role, lang').eq('active', true)
  const staff = emps ?? []
  const inBranches = (e: any, br: string[]) => br.length === 0 || br.includes(e.branch_id) || (e.extra_branch_ids ?? []).some((b: string) => br.includes(b))

  // Probe-Mitteilung an sich selbst (Knopf im Profil)
  if (body.action === 'test') {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: me } = await user.rpc('current_employee')
    if (!me?.id) return json({ ok: false, error: 'forbidden' }, 403)
    const lang = (staff.find((e) => e.id === me.id)?.lang ?? 'DE') as Lang
    const r = await send(admin, [me.id], { title: 'TeamHub', body: L[lang].on, url: '/', tag: 'test' })
    return json({ ok: true, ...r })
  }

  const now = new Date().toISOString()
  let sent = 0, failed = 0, removed = 0
  const add = (r: { sent: number; failed: number; removed: number }) => { sent += r.sent; failed += r.failed; removed += r.removed }

  // 1) News, die jetzt sichtbar sind
  const { data: news } = await admin.from('news').select('id, title, teaser, must_read, audience_branches').is('notified_at', null).lte('publish_at', now).limit(20)
  for (const n of news ?? []) {
    await admin.from('news').update({ notified_at: now }).eq('id', n.id)  // zuerst markieren: nie doppelt melden
    const ids = staff.filter((e) => inBranches(e, n.audience_branches ?? [])).map((e) => e.id)
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
    if (tk?.created_by) add(await sendByLang(admin, staff, [tk.created_by], (l) => ({ title: L[l].ticket, body: `${tk.title}: ${t.what}`, url: '/?open=tickets', tag: `ticket-${t.ticket_id}` })))
  }
  await admin.from('ticket_events').update({ notified_at: now }).is('notified_at', null).eq('what', 'Erfasst')
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
