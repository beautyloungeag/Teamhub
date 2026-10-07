// E-Mail-Versand über Resend (BLTH-20, BLTH-23, BLTH-34). Läuft per pg_cron alle 5 Minuten
// (Header x-notify-secret) und auf Zuruf aus dem Backoffice (angemeldetes Büro):
//   - Facility-Meldungen an die Facility-Adresse des Studios (sonst zentrale Adresse)
//   - Einladung zu neuen Schulungen/Events an die Zielgruppe
//   - Erinnerung an Angemeldete X Tage vor Beginn
// Sperre: ohne Secret RESEND_API_KEY oder ohne app_settings.mail_enabled = true geht nichts raus.
// Secrets: RESEND_API_KEY, MAIL_FROM (optional), NOTIFY_SECRET, APP_URL (optional)
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
type Lang = 'DE' | 'EN' | 'FR'
type Mail = { kind: string; ref: string; to: string; subject: string; html: string; text: string }

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const LOC: Record<Lang, string> = { DE: 'de-CH', EN: 'en-GB', FR: 'fr-CH' }
const when = (iso: string, l: Lang) => new Intl.DateTimeFormat(LOC[l], { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

// Schlichtes, mailclient-festes HTML (Inline-Styles, eine Spalte)
function layout(title: string, rows: [string, string][], body: string, cta?: { label: string; url: string }, foot = 'TeamHub · Beautylounge') {
  const r = rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${v}</td></tr>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f4f5f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0b0d12">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f2;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;padding:28px">
<tr><td style="font-size:20px;font-weight:600;padding-bottom:14px">${esc(title)}</td></tr>
<tr><td><table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5">${r}</table></td></tr>
${body ? `<tr><td style="font-size:15px;line-height:1.6;padding-top:14px;white-space:pre-wrap">${esc(body)}</td></tr>` : ''}
${cta ? `<tr><td style="padding-top:20px"><a href="${esc(cta.url)}" style="display:inline-block;background:#0b0d12;color:#fff;text-decoration:none;padding:11px 18px;border-radius:12px;font-size:14px">${esc(cta.label)}</a></td></tr>` : ''}
<tr><td style="padding-top:24px;font-size:12px;color:#9ca3af">${esc(foot)}</td></tr>
</table></td></tr></table></body></html>`
}

const T: Record<Lang, Record<string, string>> = {
  DE: { invSub: 'Neu: {k} „{t}“', inv: 'Neue {k} im TeamHub', remSub: 'Erinnerung: {k} „{t}“', rem: 'Du bist angemeldet', when: 'Wann', where: 'Wo', until: 'Anmeldung bis', open: 'Im TeamHub öffnen', online: 'Online', foot: 'TeamHub · Beautylounge · Du bekommst diese Mail, weil du zur Zielgruppe gehörst.' },
  EN: { invSub: 'New: {k} “{t}”', inv: 'New {k} in TeamHub', remSub: 'Reminder: {k} “{t}”', rem: 'You are registered', when: 'When', where: 'Where', until: 'Register by', open: 'Open in TeamHub', online: 'Online', foot: 'TeamHub · Beautylounge · You receive this email because you are in the audience.' },
  FR: { invSub: 'Nouveau : {k} « {t} »', inv: 'Nouvelle {k} dans TeamHub', remSub: 'Rappel : {k} « {t} »', rem: 'Tu es inscrite', when: 'Quand', where: 'Où', until: "Inscription jusqu'au", open: 'Ouvrir dans TeamHub', online: 'En ligne', foot: 'TeamHub · Beautylounge · Tu reçois cet e-mail car tu fais partie du public visé.' },
}
const KIND: Record<Lang, Record<string, string>> = { DE: { Schulung: 'Schulung', Meeting: 'Meeting', Team: 'Team-Event' }, EN: { Schulung: 'training', Meeting: 'meeting', Team: 'team event' }, FR: { Schulung: 'formation', Meeting: 'réunion', Team: "événement d'équipe" } }
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))
  const viaCron = req.headers.get('x-notify-secret') === Deno.env.get('NOTIFY_SECRET')
  let me: any = null
  if (!viaCron) {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data } = await user.rpc('current_employee')
    if (!data?.id || data.app_role !== 'buero') return json({ ok: false, error: 'forbidden' }, 403)
    me = data
  }
  const key = Deno.env.get('RESEND_API_KEY') ?? ''
  const from = Deno.env.get('MAIL_FROM') ?? 'TeamHub Beautylounge <teamhub@teamhub.beautylounge.ch>'
  const appUrl = Deno.env.get('APP_URL') ?? ''
  const { data: settings } = await admin.from('app_settings').select('key, value')
  const S = Object.fromEntries((settings ?? []).map((r: any) => [r.key, r.value]))
  const enabled = S.mail_enabled === true

  if (body.action === 'status') {
    const { data: log } = await admin.from('mail_log').select('at, kind, recipient, subject, status, error').order('at', { ascending: false }).limit(20)
    return json({ ok: true, keySet: !!key, enabled, from, log: log ?? [] })
  }
  // Vorschau ohne Versand: so sähe eine Facility-Mail aus
  if (body.action === 'preview') {
    const m = facilityMail({ id: 'vorschau', title: 'Wachsgerät in Kabine 3 defekt', body: 'Das Gerät wird nicht mehr warm. Bitte vor Freitag prüfen.', created_by_name: me?.first_name ?? 'Mitarbeiterin', created_at: new Date().toISOString(), branch_id: 'basel-1' }, 'Basel 1', 'facility@beispiel.ch', null, appUrl)
    return json({ ok: true, subject: m.subject, html: m.html })
  }
  // Testversand nur an die angemeldete Büro-Person selbst (unabhängig vom Schalter, braucht aber den Schlüssel):
  //   test_facility: ihre jüngste eigene Meldung als Facility-Mail (mit echtem Foto-Link)
  //   test_invite:   Einladung zu einem Event (event_id)
  //   test_error:    Versand an eine ungültige Adresse, prüft die Fehlerprotokollierung
  if (['test_facility', 'test_invite', 'test_error'].includes(body.action)) {
    if (!me?.email) return json({ ok: false, error: 'forbidden' }, 403)
    if (!key) return json({ ok: false, error: 'no_key' })
    let m: Mail | null = null
    if (body.action === 'test_facility' || body.action === 'test_error') {
      const { data: t } = await admin.from('tickets').select('id, title, body, branch_id, created_by_name, created_at, photo_path').eq('created_by', me.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!t) return json({ ok: false, error: 'no_own_ticket' })
      const { data: b } = await admin.from('branches').select('name').eq('id', t.branch_id).maybeSingle()
      let photo: string | null = null
      if (t.photo_path) { const { data } = await admin.storage.from('ticket-photos').createSignedUrl(t.photo_path, 60 * 60 * 24 * 30); photo = data?.signedUrl ?? null }
      m = facilityMail(t, b?.name ?? t.branch_id, body.action === 'test_error' ? 'ungueltig@@adresse' : me.email, photo, appUrl)
    } else {
      const { data: e } = await admin.from('events').select('*').eq('id', body.event_id ?? '').maybeSingle()
      if (!e) return json({ ok: false, error: 'no_event' })
      m = eventMail('einladung', e, { email: me.email, lang: me.lang }, appUrl)
    }
    m = { ...m, kind: 'test', subject: `[Test] ${m.subject}` }
    const r = await sendResend(key, from, m)
    await admin.from('mail_log').insert({ kind: 'test', ref: m.ref, recipient: m.to, subject: m.subject, status: r.ok ? 'gesendet' : 'fehler', error: r.error ?? null, provider_id: r.id ?? null })
    return json({ ok: r.ok, error: r.error ?? null, to: m.to })
  }
  if (!key || !enabled) return json({ ok: true, skipped: !key ? 'no_key' : 'disabled', sent: 0 })

  const out: Mail[] = []
  // Beim Einschalten nichts Altes nachschicken: Meldungen > 24 h und Events > 48 h ohne Versand gelten als übersprungen
  const now0 = Date.now()
  await admin.from('tickets').update({ mail_status: 'uebersprungen', mailed_at: new Date().toISOString() }).is('mail_status', null).lt('created_at', new Date(now0 - 864e5).toISOString())
  await admin.from('events').update({ invite_mailed_at: new Date().toISOString() }).is('invite_mailed_at', null).lt('created_at', new Date(now0 - 2 * 864e5).toISOString())
  const { data: branches } = await admin.from('branches').select('id, name, facility_email')
  const bmap = new Map((branches ?? []).map((b: any) => [b.id, b]))

  // 1) Facility-Meldungen (nur Art „Meldung“; Ideen gehen ans Büro im Backoffice)
  const { data: tickets } = await admin.from('tickets').select('id, title, body, branch_id, created_by_name, created_at, photo_path').eq('kind', 'Meldung').is('mail_status', null).eq('is_sample', false).limit(20)
  for (const t of tickets ?? []) {
    const b: any = bmap.get(t.branch_id)
    const to = (b?.facility_email || S.facility_email || '').trim()
    if (!to) { await admin.from('tickets').update({ mail_status: 'uebersprungen', mailed_at: new Date().toISOString() }).eq('id', t.id); continue }
    let photo: string | null = null
    if (t.photo_path) { const { data } = await admin.storage.from('ticket-photos').createSignedUrl(t.photo_path, 60 * 60 * 24 * 30); photo = data?.signedUrl ?? null }
    out.push(facilityMail(t, b?.name ?? t.branch_id, to, photo, appUrl))
  }

  // 2) Einladungen zu neuen Events (nur künftige)
  const { data: staff } = await admin.from('employees').select('id, email, first_name, branch_id, extra_branch_ids, skills, lang').eq('active', true)
  const inB = (e: any, br: string[]) => br.length === 0 || br.includes(e.branch_id) || (e.extra_branch_ids ?? []).some((x: string) => br.includes(x))
  const { data: evs } = await admin.from('events').select('*').is('invite_mailed_at', null).eq('is_sample', false).limit(10)
  for (const e of evs ?? []) {
    if (new Date(e.starts_at) < new Date()) { await admin.from('events').update({ invite_mailed_at: new Date().toISOString() }).eq('id', e.id); continue }
    for (const p of (staff ?? []).filter((x) => inB(x, e.audience_branches ?? []) && ((e.audience_skills ?? []).length === 0 || (x.skills ?? []).some((s: string) => e.audience_skills.includes(s)))))
      out.push(eventMail('einladung', e, p, appUrl))
  }

  // 3) Erinnerungen an Angemeldete
  const days = Number(S.event_reminder_days ?? 2)
  const until = new Date(Date.now() + days * 864e5).toISOString()
  const { data: regs } = await admin.from('event_registrations').select('event_id, employee_id, events!inner(*), employees!inner(id, email, first_name, lang, active)').is('reminded_at', null).gt('events.starts_at', new Date().toISOString()).lte('events.starts_at', until).limit(100)
  for (const r of regs ?? []) {
    const e: any = Array.isArray(r.events) ? r.events[0] : r.events, p: any = Array.isArray(r.employees) ? r.employees[0] : r.employees
    if (p?.active) out.push({ ...eventMail('erinnerung', e, p, appUrl), ref: `${r.event_id}:${r.employee_id}` })
  }

  // Versand + Protokoll; Stand je Quelle erst nach dem Versuch setzen
  let sent = 0, failed = 0
  for (const m of out) {
    const r = await sendResend(key, from, m)
    await admin.from('mail_log').insert({ kind: m.kind, ref: m.ref, recipient: m.to, subject: m.subject, status: r.ok ? 'gesendet' : 'fehler', error: r.error ?? null, provider_id: r.id ?? null })
    r.ok ? sent++ : failed++
    const now = new Date().toISOString()
    if (m.kind === 'facility') await admin.from('tickets').update({ mail_status: r.ok ? 'gesendet' : 'fehler', mailed_at: now }).eq('id', m.ref)
    if (m.kind === 'erinnerung') { const [ev, emp] = m.ref.split(':'); await admin.from('event_registrations').update({ reminded_at: now }).match({ event_id: ev, employee_id: emp }) }
  }
  for (const e of evs ?? []) await admin.from('events').update({ invite_mailed_at: new Date().toISOString() }).eq('id', e.id).is('invite_mailed_at', null)
  return json({ ok: true, sent, failed })
})

function facilityMail(t: any, studio: string, to: string, photo: string | null, appUrl: string): Mail {
  const at = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t.created_at))
  const rows: [string, string][] = [['Studio', esc(studio)], ['Gemeldet von', esc(t.created_by_name || '–')], ['Zeit', at], ['Foto', photo ? `<a href="${esc(photo)}">Foto ansehen</a> (Link 30 Tage gültig)` : '']]
  const subject = `Facility · ${studio}: ${t.title}`
  return {
    kind: 'facility', ref: t.id, to, subject,
    html: layout(t.title, rows, t.body, appUrl ? { label: 'Im TeamHub ansehen', url: `${appUrl}/?open=tickets` } : undefined, 'TeamHub · Beautylounge · Meldung aus der Mitarbeiter-App. Bitte nicht auf diese Mail antworten, Status im TeamHub setzen.'),
    text: `${subject}\nStudio: ${studio}\nGemeldet von: ${t.created_by_name}\nZeit: ${at}\n\n${t.body}${photo ? `\n\nFoto: ${photo}` : ''}`,
  }
}

function eventMail(kind: 'einladung' | 'erinnerung', e: any, p: any, appUrl: string): Mail {
  const l: Lang = p.lang === 'EN' || p.lang === 'FR' ? p.lang : 'DE', t = T[l], k = KIND[l][e.kind] ?? e.kind
  const subject = fill(kind === 'einladung' ? t.invSub : t.remSub, { k: KIND[l][e.kind] ?? e.kind, t: e.title })
  const head = kind === 'einladung' ? fill(t.inv, { k }) : t.rem
  const rows: [string, string][] = [[t.when, esc(when(e.starts_at, l))], [t.where, e.link ? `<a href="${esc(e.link)}">${t.online}</a>` : esc(e.place)], [t.until, kind === 'einladung' && e.register_until ? esc(when(e.register_until, l)) : '']]
  return {
    kind, ref: e.id, to: p.email, subject,
    html: layout(e.title, [['', `<b>${esc(head)}</b>`], ...rows], e.description, appUrl ? { label: t.open, url: `${appUrl}/?open=events` } : undefined, t.foot),
    text: `${subject}\n${t.when}: ${when(e.starts_at, l)}\n${t.where}: ${e.link || e.place}\n\n${e.description ?? ''}`,
  }
}

async function sendResend(key: string, from: string, m: Mail): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }), signal: AbortSignal.timeout(20000) })
    const d = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, id: d.id } : { ok: false, error: `${r.status} ${d.message ?? ''}`.slice(0, 300) }
  } catch (e) { return { ok: false, error: String(e).slice(0, 300) } }
}
