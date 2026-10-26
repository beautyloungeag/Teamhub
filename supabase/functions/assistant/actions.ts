// Marc als Copilot im Backoffice (26.10.): Marc schlägt Aktionen nur vor. Jeder Vorschlag wird als Karte im
// Chat gespeichert (benni_messages.data.actions) und erst ausgeführt, wenn die Person „Ausführen“ tippt.
// Ausgeführt wird mit dem Client der Person (ihr Login, RLS) und über dieselben Wege wie im Backoffice,
// also kann Marc nie mehr als die Person selbst. Fotos aus dem Chat liegen bis dahin als JSON im
// eigenen Ordner von assistant-context (der Bucket nimmt nur JSON).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.2'

export type Me = { id: string; app_role: string; branch_id: string; extra_branch_ids?: string[]; first_name: string; last_name: string }
export type Branch = { id: string; name: string; is_office: boolean }
export type Staged = { name: string; mime: string; data: string }
export type Action = { id: string; kind: string; title: string; lines: string[]; payload: Record<string, any>; status: 'offen' | 'laeuft' | 'ausgefuehrt' | 'verworfen' | 'fehler'; result?: string; at: string }
export type Ctx = { db: SupabaseClient; me: Me; branches: Branch[]; chatId: string | null; images: Staged[]; fn: (name: string, body: unknown) => Promise<any> }

const NEWS_TAGS = ['Wichtig', 'Schulung', 'Team', 'Salon']
const EVENT_KINDS = ['Schulung', 'Meeting', 'Team']
const GROUPS = ['Filialleitung', 'Kosmetikerinnen', 'Lernende', 'Büro']
const TICKET_STATUS = ['Neu', 'Zugewiesen', 'In Arbeit', 'Erledigt']
const ROLES: Record<string, string> = { mitarbeiterin: 'Mitarbeiterin', filialleitung: 'Filialleitung', buero: 'Büro' }
const EXPIRES_H = 24

const s = (x: unknown, n = 200) => String(x ?? '').trim().slice(0, n)
const arr = (x: unknown) => (Array.isArray(x) ? x : typeof x === 'string' && x ? [x] : []).map((y) => s(y, 80)).filter(Boolean)
const isDay = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const isTime = (x: unknown) => typeof x === 'string' && /^\d{2}:\d{2}$/.test(x)
const plain = (x: string) => x.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
/** Datum und Uhrzeit in Zürich als ISO (auch über die Zeitumstellung richtig). */
export const zIso = (d: string, t = '00:00') => {
  const guess = new Date(`${d}T${t}:00Z`)
  const z = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Zurich' })), u = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (z.getTime() - u.getTime())).toISOString()
}
const fmt = (iso: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const fmtDay = (d: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d + 'T12:00:00Z'))
const myStudios = (me: Me) => [me.branch_id, ...(me.extra_branch_ids ?? [])].filter((b) => b && b !== 'buero')

/* ---------- Werkzeuge für das Modell ---------- */
type Def = [string, string, Record<string, unknown>, string[]]
const ids = (d: string) => ({ type: 'array', items: { type: 'string' }, description: d })

export function actionDefs(me: Me): Def[] {
  const office = me.app_role === 'buero', lead = me.app_role === 'filialleitung'
  if (!office && !lead) return []
  const own = office ? 'Studio-ids (leer = alle Studios)' : 'Studio-ids, nur eigene Studios (leer = eigenes Studio)'
  const v = 'Schlägt vor. Ausgeführt wird erst, wenn die Person in der Karte auf „Ausführen“ tippt.'
  return [
    ['team_list', 'Personen im Team (id, Name, Funktion, Rolle, Studio, Skills, aktiv). Für Personen-ids in Vorschlägen.', { q: { type: 'string', description: 'Name oder Teil davon' }, studio: { type: 'string' } }, []],
    ['events_overview', 'Schulungen, Meetings und Team-Events mit Zusagen, Absagen, Warteliste und wer noch nicht geantwortet hat.', { event_id: { type: 'string' }, vergangene: { type: 'boolean' } }, []],
    ['tickets_list', 'Meldungen und Ideen (id, Art, Titel, Status, Studio, zugewiesen).', { status: { type: 'string', enum: TICKET_STATUS } }, []],
    ['vorschlag_news', `News veröffentlichen oder einplanen. ${v}`, {
      title: { type: 'string' }, body: { type: 'string', description: 'Text der News, Absätze mit Leerzeile' }, teaser: { type: 'string', description: 'kurzer Anriss, optional' },
      kategorie: { type: 'string', enum: NEWS_TAGS }, pflicht: { type: 'boolean', description: 'Pflicht-News (muss bestätigt werden)' },
      studios: ids(own), gruppen: { type: 'array', items: { type: 'string', enum: GROUPS } }, skills: ids('nur Personen mit diesen Skills'), personen: ids('einzelne Personen-ids statt Studios'),
      datum: { type: 'string', description: 'YYYY-MM-DD zum Einplanen, leer = sofort' }, uhrzeit: { type: 'string', description: 'HH:MM' },
      ...(office ? { bild: { type: 'boolean', description: 'angehängtes Foto aus dieser Nachricht als Titelbild' } } : {}),
    }, ['title', 'body']],
    ['vorschlag_event', `Schulung, Meeting oder Team-Event anlegen (die Zielgruppe bekommt eine Mitteilung). ${v}`, {
      title: { type: 'string' }, art: { type: 'string', enum: EVENT_KINDS }, beschreibung: { type: 'string' }, datum: { type: 'string', description: 'YYYY-MM-DD' },
      von: { type: 'string', description: 'HH:MM' }, bis: { type: 'string', description: 'HH:MM, optional' }, ort: { type: 'string' }, link: { type: 'string' },
      plaetze: { type: 'number', description: 'maximale Teilnehmerzahl, optional' }, anmeldeschluss: { type: 'string', description: 'YYYY-MM-DD, optional' },
      studios: ids(own), skills: ids('nur Personen mit diesen Skills'), personen: ids('einzelne Personen-ids'),
    }, ['title', 'datum', 'von']],
    ['vorschlag_event_erinnerung', `Erinnert alle, die zu einem Termin noch nicht geantwortet haben (oder nur bestimmte Personen). ${v}`, { event_id: { type: 'string' }, personen: ids('optional') }, ['event_id']],
    ['vorschlag_aufgabe', `Einzelaufgabe zuweisen (Aufgaben → Für mich, mit Mitteilung). ${v}`, {
      title: { type: 'string' }, notiz: { type: 'string' }, person: { type: 'string', description: 'Personen-id' }, studio: { type: 'string', description: 'Studio-id für das ganze Studio, oder "alle"' },
      datum: { type: 'string', description: 'Frist YYYY-MM-DD, optional' }, uhrzeit: { type: 'string', description: 'HH:MM, optional' },
    }, ['title']],
    ['vorschlag_aushilfe', `Aushilfe anfragen (wer kann an einem Tag einspringen). ${v}`, {
      studio: { type: 'string' }, datum: { type: 'string', description: 'YYYY-MM-DD' }, von: { type: 'string' }, bis: { type: 'string' }, skill: { type: 'string' }, notiz: { type: 'string' },
      an_alle: { type: 'boolean', description: 'true = an alle, false = nur an Personen, die sich für den Tag als Aushilfe eingetragen haben' },
    }, ['studio', 'datum']],
    ['vorschlag_person', `Person anlegen (Anmeldung mit ihrer Firmen-Mail und Code, es geht keine Einladung raus). ${v}`, {
      vorname: { type: 'string' }, nachname: { type: 'string' }, email: { type: 'string' }, funktion: { type: 'string', description: 'z. B. Kosmetikerin, Respo, Lehrling' },
      studio: { type: 'string' }, telefon: { type: 'string' }, skills: ids('Skills aus dem Katalog'),
      ...(office ? { rolle: { type: 'string', enum: Object.keys(ROLES) } } : {}),
    }, ['vorname', 'nachname', 'email', 'studio']],
    ['vorschlag_meldung', `Status einer Meldung oder Idee ändern. ${v}`, { ticket_id: { type: 'string' }, status: { type: 'string', enum: TICKET_STATUS }, zugewiesen: { type: 'string', description: 'Name, wer sich kümmert (optional)' } }, ['ticket_id', 'status']],
    ...(office ? [
      ['wiki_outline', 'Aufbau eines Wissensartikels (Überschriften, Schritte, Bilder mit Position), um Fotos oder Text an der richtigen Stelle einzufügen.', { id: { type: 'string' } }, ['id']] as Def,
      ['vorschlag_wissen', `Fügt in einen Wissensartikel ein angehängtes Foto, einen Absatz oder einen Hinweis ein, direkt nach einer Überschrift oder einem Schritt (Text aus wiki_outline). In der App wird ein Bild direkt nach einer Überschrift oder einem Schritt zum Foto dieser Folie. ${v}`, {
        article_id: { type: 'string' }, nach: { type: 'string', description: 'Überschrift oder Schritt, nach dem eingefügt wird; leer = am Ende' },
        art: { type: 'string', enum: ['bild', 'absatz', 'hinweis'] }, text: { type: 'string', description: 'bei absatz/hinweis' }, bild_nr: { type: 'number', description: 'welches angehängte Foto (1 = erstes)' },
      }, ['article_id', 'art']] as Def,
    ] : []),
  ]
}

export const SYSTEM_NOTE = (me: Me) => me.app_role === 'mitarbeiterin' ? '' : [
  '\n## Backoffice-Copilot',
  `Du kannst für ${me.first_name} Dinge im Backoffice erledigen: News, Schulungen und Events, Erinnerungen an Termine, Aufgaben zuweisen, Aushilfe anfragen, Personen anlegen, Meldungen bearbeiten${me.app_role === 'buero' ? ', Fotos und Text in Wissensartikel einfügen' : ''}.`,
  '- Du führst nie selbst aus. Du rufst das passende vorschlag_-Werkzeug auf; die App zeigt eine Karte mit „Ausführen“ und „Verwerfen“. Sag im Text in einem Satz, was die Karte macht, und dass sie mit „Ausführen“ bestätigt.',
  `- Auch eigene To-dos und Erinnerungen laufen über eine Karte: vorschlag_aufgabe mit person = ${me.id} (die eigene Personen-id).`,
  '- Fehlt etwas Wesentliches (z. B. Datum, für wen), frag kurz nach, statt zu raten. Personen-ids holst du mit team_list, Termine mit events_overview, Meldungen mit tickets_list.',
  '- Du hast genau die Rechte dieser Person. Lehnt ein Werkzeug ab (keine_berechtigung), sag ehrlich, wer das machen kann.',
  `- Schreibstil für News und Aufgaben: wie Beautylounge selbst, kurz, per du, Schweizer Hochdeutsch (ss statt ß).`,
  me.app_role === 'filialleitung' ? `- Als Filialleitung: nur für das eigene Studio (${myStudios(me).join(', ')}), Personen nur als Mitarbeiterin, Wissen bearbeitet nur das Büro.` : '',
].filter(Boolean).join('\n')

/* ---------- Lesen ---------- */
export async function readTool(name: string, args: any, c: Ctx): Promise<unknown> {
  const { db, me } = c
  if (name === 'team_list') {
    let q = db.from('employees').select('id, first_name, last_name, job_title, app_role, branch_id, extra_branch_ids, skills, active').order('first_name').limit(200)
    if (args.studio) q = q.eq('branch_id', s(args.studio))
    const { data } = await q
    const x = s(args.q).toLowerCase()
    return { personen: (data ?? []).filter((p: any) => !x || `${p.first_name} ${p.last_name}`.toLowerCase().includes(x)).slice(0, 80)
      .map((p: any) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, funktion: p.job_title, rolle: ROLES[p.app_role] ?? p.app_role, studio: p.branch_id, zusatz: p.extra_branch_ids ?? [], skills: p.skills ?? [], aktiv: p.active })) }
  }
  if (name === 'events_overview') {
    let q = db.from('events').select('id, title, kind, starts_at, ends_at, place, capacity, register_until, audience_branches, audience_skills, audience_people').order('starts_at').limit(args.event_id ? 1 : 15)
    q = args.event_id ? q.eq('id', s(args.event_id)) : args.vergangene ? q.lt('starts_at', new Date().toISOString()) : q.gte('starts_at', new Date(Date.now() - 864e5).toISOString())
    const { data: evs } = await q
    if (!evs?.length) return { termine: [] }
    const [{ data: regs }, { data: staff }] = await Promise.all([
      db.from('event_registrations').select('event_id, employee_id, coming, waitlist_pos').in('event_id', evs.map((e: any) => e.id)),
      db.from('employees').select('id, first_name, last_name, branch_id, extra_branch_ids, skills, active').eq('active', true),
    ])
    const nm = new Map((staff ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]))
    return { termine: evs.map((e: any) => {
      const r = (regs ?? []).filter((x: any) => x.event_id === e.id)
      const answered = new Set(r.map((x: any) => x.employee_id))
      const audience = (staff ?? []).filter((p: any) => p.branch_id !== 'buero' && (!(e.audience_people ?? []).length ? ((e.audience_branches ?? []).length === 0 || [p.branch_id, ...(p.extra_branch_ids ?? [])].some((b: string) => e.audience_branches.includes(b))) && ((e.audience_skills ?? []).length === 0 || (p.skills ?? []).some((k: string) => e.audience_skills.includes(k))) : e.audience_people.includes(p.id)))
      return { id: e.id, titel: e.title, art: e.kind, beginn: fmt(e.starts_at), ort: e.place, plaetze: e.capacity, anmeldeschluss: e.register_until ? fmt(e.register_until) : null,
        kommen: r.filter((x: any) => x.coming && !x.waitlist_pos).map((x: any) => nm.get(x.employee_id) ?? '?'), warteliste: r.filter((x: any) => x.coming && x.waitlist_pos).map((x: any) => nm.get(x.employee_id) ?? '?'),
        kommen_nicht: r.filter((x: any) => x.coming === false).map((x: any) => nm.get(x.employee_id) ?? '?'), ohne_antwort: audience.filter((p: any) => !answered.has(p.id)).map((p: any) => `${p.first_name} ${p.last_name}`) }
    }) }
  }
  if (name === 'tickets_list') {
    let q = db.from('tickets').select('id, kind, title, status, branch_id, assignee, created_at').neq('kind', 'Anliegen').order('created_at', { ascending: false }).limit(40)
    if (args.status) q = q.eq('status', s(args.status))
    const { data } = await q
    return { meldungen: (data ?? []).map((t: any) => ({ id: t.id, art: t.kind, titel: t.title, status: t.status, studio: t.branch_id, zugewiesen: t.assignee, am: t.created_at.slice(0, 10) })) }
  }
  if (name === 'wiki_outline') {
    if (me.app_role !== 'buero') return { error: 'keine_berechtigung' }
    const { data: a } = await db.from('wiki_articles').select('id, title, blocks').eq('id', s(args.id)).maybeSingle()
    if (!a) return { error: 'nicht_gefunden' }
    return { titel: a.title, aufbau: ((a.blocks ?? []) as any[]).map((b, i) => b.t === 'h' ? `${i}: Überschrift „${b.text}“` : b.t === 'img' ? `${i}: Bild` : b.t === 'p' && /^\*\*[^*]+\*\*/.test(b.text ?? '') ? `${i}: Schritt „${plain(b.text).slice(0, 60)}“` : b.t === 'ol' ? `${i}: Nummerierte Liste (${(b.items ?? []).length} Schritte)` : null).filter(Boolean) }
  }
  return null
}

/* ---------- Vorschlagen ---------- */
type Err = { error: string; [k: string]: unknown }
type Proposal = { kind: string; title: string; lines: string[]; payload: Record<string, any> } | Err

export async function propose(name: string, a: any, c: Ctx): Promise<Proposal> {
  const { db, me, branches } = c
  const office = me.app_role === 'buero', lead = me.app_role === 'filialleitung'
  if (!office && !lead) return { error: 'keine_berechtigung' }
  const studios = branches.filter((b) => !b.is_office)
  const bName = (id: string) => branches.find((b) => b.id === id)?.name ?? id
  const checkStudios = (list: string[]): Err | null => {
    const bad = list.filter((b) => !studios.some((x) => x.id === b))
    if (bad.length) return { error: 'unbekanntes_studio', erlaubt: studios.map((b) => b.id) }
    if (lead && list.some((b) => !myStudios(me).includes(b))) return { error: 'keine_berechtigung', grund: 'nur eigenes Studio' }
    return null
  }
  const people = async (list: string[]): Promise<{ names: string[] } | Err> => {
    if (!list.length) return { names: [] }
    const { data } = await db.from('employees').select('id, first_name, last_name').in('id', list)
    if ((data ?? []).length !== list.length) return { error: 'unbekannte_person', hinweis: 'ids mit team_list holen' }
    return { names: (data ?? []).map((p: any) => `${p.first_name} ${p.last_name}`) }
  }
  const audienceLine = (br: string[], groups: string[], skills: string[], names: string[]) => names.length ? `Für: ${names.join(', ')}`
    : `Für: ${br.length ? br.map(bName).join(', ') : 'alle Studios'}${groups.length ? ` · ${groups.join(', ')}` : ''}${skills.length ? ` · Skill ${skills.join(', ')}` : ''}`

  if (name === 'vorschlag_news') {
    const title = s(a.title, 160), body = s(a.body, 8000)
    if (!title || !body) return { error: 'titel_und_text_noetig' }
    const br = arr(a.studios), groups = arr(a.gruppen).filter((g) => GROUPS.includes(g)), skills = arr(a.skills), pp = arr(a.personen)
    const e1 = checkStudios(br); if (e1) return e1
    const p = await people(pp); if ('error' in p) return p
    if (a.datum && !isDay(a.datum)) return { error: 'datum_YYYY-MM-DD' }
    const when = a.datum ? zIso(a.datum, isTime(a.uhrzeit) ? a.uhrzeit : '07:00') : null
    const img = office && a.bild && c.images.length ? 0 : null
    const tag = NEWS_TAGS.includes(a.kategorie) ? a.kategorie : 'Salon'
    return { kind: 'news', title: when ? 'News einplanen' : 'News veröffentlichen', payload: { title, body, teaser: s(a.teaser, 200), tag, must: a.pflicht === true, br, groups, skills, people: pp, when, img },
      lines: [`„${title}“`, `${tag}${a.pflicht ? ' · Pflicht-News' : ''}`, audienceLine(lead && !br.length && !pp.length ? [me.branch_id] : br, groups, skills, p.names), when ? `Erscheint ${fmt(when)}` : 'Erscheint sofort, mit Mitteilung', ...(img != null ? ['Mit angehängtem Foto als Bild'] : []), body.slice(0, 220) + (body.length > 220 ? ' …' : '')] }
  }
  if (name === 'vorschlag_event') {
    const title = s(a.title, 160)
    if (!title || !isDay(a.datum) || !isTime(a.von)) return { error: 'titel_datum_von_noetig' }
    if (a.bis && (!isTime(a.bis) || a.bis <= a.von)) return { error: 'bis_nach_von' }
    const br = arr(a.studios), skills = arr(a.skills), pp = arr(a.personen)
    const e1 = checkStudios(br); if (e1) return e1
    const p = await people(pp); if ('error' in p) return p
    const kind = EVENT_KINDS.includes(a.art) ? a.art : 'Schulung'
    const starts = zIso(a.datum, a.von), ends = a.bis ? zIso(a.datum, a.bis) : null
    const until = isDay(a.anmeldeschluss) ? zIso(a.anmeldeschluss, '23:59') : null
    const cap = Number(a.plaetze) > 0 ? Math.round(Number(a.plaetze)) : null
    return { kind: 'event', title: kind === 'Team' ? 'Team-Event anlegen' : `${kind} anlegen`, payload: { title, kind, description: s(a.beschreibung, 4000), starts, ends, place: s(a.ort, 160), link: s(a.link, 400) || null, cap, until, br, skills, people: pp },
      lines: [`„${title}“`, `${fmt(starts)}${a.bis ? `–${a.bis}` : ''}${a.ort ? ` · ${s(a.ort, 80)}` : ''}`, audienceLine(lead && !br.length ? [me.branch_id] : br, [], skills, p.names), ...(cap ? [`${cap} Plätze`] : []), ...(until ? [`Anmeldung bis ${fmtDay(a.anmeldeschluss)}`] : []), 'Die Zielgruppe bekommt eine Mitteilung'] }
  }
  if (name === 'vorschlag_event_erinnerung') {
    const { data: e } = await db.from('events').select('id, title, starts_at').eq('id', s(a.event_id)).maybeSingle()
    if (!e) return { error: 'termin_nicht_gefunden' }
    const pp = arr(a.personen); const p = await people(pp); if ('error' in p) return p
    return { kind: 'event_remind', title: 'An Termin erinnern', payload: { event_id: e.id, people: pp }, lines: [`„${e.title}“ am ${fmt(e.starts_at)}`, p.names.length ? `Erinnert: ${p.names.join(', ')}` : 'Erinnert alle, die noch nicht geantwortet haben'] }
  }
  if (name === 'vorschlag_aufgabe') {
    const title = s(a.title, 200)
    if (!title) return { error: 'titel_noetig' }
    const person = s(a.person), studio = s(a.studio)
    if (!person && !studio) return { error: 'fuer_wen', hinweis: 'person oder studio' }
    let who = ''
    if (person) { const p = await people([person]); if ('error' in p) return p; who = p.names[0] }
    else if (studio === 'alle') who = office ? 'alle Studios (je Studio eine Aufgabe)' : myStudios(me).map(bName).join(', ')
    else { const e1 = checkStudios([studio]); if (e1) return e1; who = `ganzes Studio ${bName(studio)}` }
    if (a.datum && !isDay(a.datum)) return { error: 'datum_YYYY-MM-DD' }
    const due = a.datum ? zIso(a.datum, isTime(a.uhrzeit) ? a.uhrzeit : '23:59') : null
    return { kind: 'todo', title: 'Aufgabe zuweisen', payload: { title, note: s(a.notiz, 1000), person: person || null, studio: person ? null : studio, due },
      lines: [`„${title}“`, `Für: ${who}`, due ? `Bis ${fmt(due)}` : 'Ohne Frist', ...(a.notiz ? [s(a.notiz, 160)] : [])] }
  }
  if (name === 'vorschlag_aushilfe') {
    const studio = s(a.studio)
    const e1 = checkStudios([studio]); if (e1) return e1
    if (!isDay(a.datum)) return { error: 'datum_YYYY-MM-DD' }
    if (a.von && !isTime(a.von) || a.bis && !isTime(a.bis) || (a.von && a.bis && a.bis <= a.von)) return { error: 'zeit_HH:MM' }
    return { kind: 'standby', title: 'Aushilfe anfragen', payload: { studio, day: a.datum, from: a.von || null, to: a.bis || null, skill: s(a.skill, 80) || null, note: s(a.notiz, 500), all: a.an_alle !== false },
      lines: [`${bName(studio)} am ${fmtDay(a.datum)}${a.von ? `, ${a.von}${a.bis ? `–${a.bis}` : ''}` : ''}`, ...(a.skill ? [`Skill: ${s(a.skill, 80)}`] : []), a.an_alle === false ? 'Nur an eingetragene Aushilfen' : 'An alle', ...(a.notiz ? [s(a.notiz, 160)] : [])] }
  }
  if (name === 'vorschlag_person') {
    const email = s(a.email, 120).toLowerCase(), studio = s(a.studio)
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) || !s(a.vorname) || !s(a.nachname)) return { error: 'name_und_email_noetig' }
    if (studio !== 'buero' || !office) { const e1 = checkStudios([studio]); if (e1) return e1 }
    const role = office && ROLES[a.rolle] ? a.rolle : 'mitarbeiterin'
    return { kind: 'person', title: 'Person anlegen', payload: { email, first_name: s(a.vorname, 80), last_name: s(a.nachname, 80), job_title: s(a.funktion, 80), branch_id: studio, phone: s(a.telefon, 40) || null, skills: arr(a.skills), app_role: role },
      lines: [`${s(a.vorname, 80)} ${s(a.nachname, 80)}${a.funktion ? `, ${s(a.funktion, 80)}` : ''}`, email, `${bName(studio)} · Rolle ${ROLES[role]}`, ...(arr(a.skills).length ? [`Skills: ${arr(a.skills).join(', ')}`] : []), 'Meldet sich mit dieser Mail und Code an, es geht keine Einladung raus'] }
  }
  if (name === 'vorschlag_meldung') {
    const { data: t } = await db.from('tickets').select('id, kind, title, status').eq('id', s(a.ticket_id)).maybeSingle()
    if (!t) return { error: 'meldung_nicht_gefunden' }
    if (!TICKET_STATUS.includes(a.status)) return { error: 'status', erlaubt: TICKET_STATUS }
    return { kind: 'ticket', title: `${t.kind} bearbeiten`, payload: { id: t.id, status: a.status, assignee: a.zugewiesen === undefined ? undefined : s(a.zugewiesen, 80) || null },
      lines: [`„${t.title}“`, `Status ${t.status} → ${a.status}`, ...(a.zugewiesen ? [`Zuständig: ${s(a.zugewiesen, 80)}`] : [])] }
  }
  if (name === 'vorschlag_wissen') {
    if (!office) return { error: 'keine_berechtigung', grund: 'Wissen bearbeitet nur das Büro' }
    const { data: art } = await db.from('wiki_articles').select('id, title, blocks').eq('id', s(a.article_id)).maybeSingle()
    if (!art) return { error: 'artikel_nicht_gefunden' }
    const kind = ['bild', 'absatz', 'hinweis'].includes(a.art) ? a.art : 'bild'
    const n = Math.max(1, Math.round(Number(a.bild_nr) || 1))
    if (kind === 'bild' && !c.images[n - 1]) return { error: 'kein_foto_angehaengt', hinweis: 'Die Person soll das Foto in dieser Nachricht anhängen.' }
    if (kind !== 'bild' && !s(a.text)) return { error: 'text_noetig' }
    const after = s(a.nach, 160)
    const at = findAfter(art.blocks ?? [], after)
    if (after && at < 0) return { error: 'stelle_nicht_gefunden', hinweis: 'Text aus wiki_outline übernehmen' }
    return { kind: 'wiki', title: kind === 'bild' ? 'Foto in Artikel einfügen' : 'Text in Artikel einfügen', payload: { id: art.id, after, kind, text: s(a.text, 4000), img: kind === 'bild' ? n - 1 : null },
      lines: [`„${art.title}“`, after ? `Nach „${after}“` : 'Am Ende', kind === 'bild' ? `Foto: ${c.images[n - 1].name}` : s(a.text, 220)] }
  }
  return { error: 'unbekanntes_werkzeug' }
}

const findAfter = (blocks: any[], after: string) => {
  if (!after) return blocks.length - 1
  const x = plain(after).toLowerCase()
  const i = blocks.findIndex((b) => (b.t === 'h' || b.t === 'p') && plain(b.text ?? '').toLowerCase().includes(x))
  if (i < 0) return -1
  // Nach einem Schritt-Absatz direkt danach; nach einer Überschrift auch direkt danach (wird Folienfoto)
  return i
}

/** Vorschlag als Karte ablegen; ein angehängtes Foto wird für die Ausführung gesichert. */
export async function stage(p: { kind: string; title: string; lines: string[]; payload: Record<string, any> }, c: Ctx): Promise<Action | { error: string }> {
  const id = crypto.randomUUID(), payload = { ...p.payload }
  if (payload.img != null) {
    const f = c.images[payload.img]
    if (!f || !c.chatId) return { error: 'foto_nur_im_chat' }
    const path = `${c.me.id}/${c.chatId}/${id}.json`
    const { error } = await c.db.storage.from('assistant-context').upload(path, new Blob([JSON.stringify(f)], { type: 'application/json' }), { contentType: 'application/json', upsert: false })
    if (error) return { error: 'foto_nicht_gesichert' }
    payload.staged = path; delete payload.img
  }
  return { id, kind: p.kind, title: p.title, lines: p.lines.filter(Boolean).slice(0, 8), payload, status: 'offen', at: new Date().toISOString() }
}

/* ---------- Ausführen (nach „Ausführen“ in der App) ---------- */
const ext = (mime: string) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif' } as Record<string, string>)[mime] ?? 'jpg'
async function loadStaged(c: Ctx, path: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const { data } = await c.db.storage.from('assistant-context').download(path)
  if (!data) return null
  const f = JSON.parse(await data.text()) as Staged
  const raw = atob(f.data.replace(/^data:[^,]+,/, ''))
  return { bytes: Uint8Array.from(raw, (ch) => ch.charCodeAt(0)), mime: f.mime }
}
const denied = (e: { message?: string; code?: string } | null) => !!e && (/row-level security|permission|not allowed|forbidden/i.test(e.message ?? '') || e.code === '42501')

export async function execute(act: Action, c: Ctx): Promise<{ ok: boolean; text: string }> {
  const { db, me } = c, p = act.payload
  const office = me.app_role === 'buero'
  const by = `${me.first_name} ${String(me.last_name ?? '').slice(0, 1)}.`
  const fail = (e: any, what: string) => ({ ok: false, text: denied(e) ? `Dafür fehlen dir die Rechte (${what}).` : `${what} hat nicht geklappt.` })
  if (act.kind === 'news') {
    let image: string | null = null
    if (p.staged && office) {
      const f = await loadStaged(c, p.staged)
      if (f) { const path = `news/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.${ext(f.mime)}`; const { error } = await db.storage.from('media').upload(path, f.bytes, { contentType: f.mime }); if (!error) image = path }
    }
    const br = me.app_role === 'filialleitung' && !p.br.length ? [me.branch_id] : p.br
    const { error } = await db.from('news').insert({ title: p.title, teaser: p.teaser || p.body.slice(0, 140), body: p.body, tag: p.tag, must_read: p.must, audience_branches: br, audience_groups: p.groups, audience_skills: p.skills, audience_people: p.people,
      image_path: image, author_id: me.id, author_name: `${me.first_name} ${me.last_name}`, publish_at: p.when ?? new Date().toISOString() })
    if (error) return fail(error, 'News')
    await Promise.all([c.fn('notify', {}), c.fn('translate', { action: 'sync' })])
    return { ok: true, text: p.when ? `News eingeplant für ${fmt(p.when)}.` : 'News veröffentlicht.' }
  }
  if (act.kind === 'event') {
    const br = me.app_role === 'filialleitung' && !p.br.length ? [me.branch_id] : p.br
    const { error } = await db.from('events').insert({ title: p.title, kind: p.kind, description: p.description, starts_at: p.starts, ends_at: p.ends, place: p.place, link: p.link, capacity: p.cap, register_until: p.until,
      audience_branches: br, audience_skills: p.skills, audience_people: p.people, phorest_sync: false, phorest_paid: true, created_by: me.id })
    if (error) return fail(error, 'Termin')
    await Promise.all([c.fn('notify', {}), c.fn('translate', { action: 'sync' })])
    return { ok: true, text: 'Termin angelegt, die Zielgruppe bekommt eine Mitteilung.' }
  }
  if (act.kind === 'event_remind') {
    const r = await c.fn('notify', { action: 'remind_event', event_id: p.event_id, ...(p.people.length ? { employee_ids: p.people } : {}) })
    if (!r?.ok) return { ok: false, text: r?.error === 'forbidden' ? 'Dafür fehlen dir die Rechte (Erinnerung).' : 'Die Erinnerung hat nicht geklappt.' }
    return { ok: true, text: r.people ? `Erinnerung an ${r.people} ${r.people === 1 ? 'Person' : 'Personen'} geschickt.` : 'Alle haben schon geantwortet, es ging keine Erinnerung raus.' }
  }
  if (act.kind === 'todo') {
    const row = { title: p.title, note: p.note, due_at: p.due, created_by: me.id, created_by_name: by }
    const targets = p.person ? [{ assignee_id: p.person, branch_id: null }]
      : p.studio === 'alle' ? (office ? c.branches.filter((b) => !b.is_office).map((b) => b.id) : myStudios(me)).map((b) => ({ assignee_id: null, branch_id: b }))
      : [{ assignee_id: null, branch_id: p.studio }]
    const { error } = await db.from('todos').insert(targets.map((t) => ({ ...row, ...t })))
    if (error) return fail(error, 'Aufgabe')
    await c.fn('notify', {})
    return { ok: true, text: targets.length > 1 ? `Aufgabe an ${targets.length} Studios zugewiesen.` : 'Aufgabe zugewiesen.' }
  }
  if (act.kind === 'standby') {
    const { error } = await db.from('standby_requests').insert({ branch_id: p.studio, day: p.day, start_time: p.from, end_time: p.to, skill: p.skill, note: p.note, to_all: p.all, created_by: me.id, created_by_name: by })
    if (error) return fail(error, 'Aushilfe-Anfrage')
    await c.fn('notify', {})
    return { ok: true, text: 'Aushilfe angefragt.' }
  }
  if (act.kind === 'person') {
    const r = await c.fn('admin-employee', { action: 'create', ...p })
    if (!r?.ok) return { ok: false, text: r?.error === 'forbidden' ? 'Dafür fehlen dir die Rechte (Person anlegen).' : r?.error === 'exists' ? 'Diese E-Mail gibt es schon im Team.' : 'Anlegen hat nicht geklappt.' }
    return { ok: true, text: `${p.first_name} ${p.last_name} ist angelegt und kann sich mit ${p.email} anmelden.` }
  }
  if (act.kind === 'ticket') {
    const upd: Record<string, unknown> = { status: p.status }
    if (p.assignee !== undefined) upd.assignee = p.assignee
    const { data, error } = await db.from('tickets').update(upd).eq('id', p.id).select('id')
    if (error || !data?.length) return fail(error ?? { message: 'permission' }, 'Meldung')
    return { ok: true, text: `Status ist jetzt „${p.status}“.` }
  }
  if (act.kind === 'wiki') {
    if (!office) return { ok: false, text: 'Wissen bearbeitet nur das Büro.' }
    const { data: art } = await db.from('wiki_articles').select('id, intro, blocks, body, access_level').eq('id', p.id).maybeSingle()
    if (!art) return { ok: false, text: 'Den Artikel gibt es nicht mehr.' }
    const blocks = [...((art.blocks ?? []) as any[])]
    const at = findAfter(blocks, p.after)
    if (p.after && at < 0) return { ok: false, text: `Die Stelle „${p.after}“ gibt es im Artikel nicht mehr.` }
    let block: Record<string, unknown>
    if (p.kind === 'bild') {
      const f = p.staged ? await loadStaged(c, p.staged) : null
      if (!f) return { ok: false, text: 'Das Foto ist nicht mehr da. Bitte noch einmal anhängen.' }
      const path = `wiki/${art.access_level}/${Date.now()}-marc.${ext(f.mime)}`
      const { error } = await db.storage.from('media').upload(path, f.bytes, { contentType: f.mime })
      if (error) return fail(error, 'Foto hochladen')
      block = { t: 'img', src: path }
    } else block = { t: p.kind === 'hinweis' ? 'quote' : 'p', text: p.text }
    blocks.splice(at + 1, 0, block)
    const body = p.kind === 'bild' ? art.body : [art.body, p.text].filter(Boolean).join('\n\n')
    const words = String(body ?? '').split(/\s+/).filter(Boolean).length + blocks.filter((b) => b.t === 'img').length * 15
    const { data, error } = await db.from('wiki_articles').update({ blocks, body, minutes: Math.max(1, Math.round(words / 180)), updated_at: new Date().toISOString() }).eq('id', art.id).select('id')
    if (error || !data?.length) return fail(error ?? { message: 'permission' }, 'Artikel speichern')
    await c.fn('translate', { action: 'sync' })
    return { ok: true, text: p.kind === 'bild' ? 'Foto ist im Artikel.' : 'Text ist im Artikel.' }
  }
  return { ok: false, text: 'Unbekannte Aktion.' }
}

/** Karte ausführen oder verwerfen: beansprucht sie zuerst, damit ein Doppeltipp nichts doppelt anlegt. */
export async function decide(c: Ctx, messageId: string, actionId: string, run: boolean) {
  const { db } = c
  const { data: msg } = await db.from('benni_messages').select('id, chat_id, data').eq('id', messageId).maybeSingle()
  const acts = ((msg?.data as any)?.actions ?? []) as Action[]
  const i = acts.findIndex((x) => x.id === actionId)
  if (!msg || i < 0) return { ok: false, error: 'not_found' }
  const act = acts[i]
  if (act.status !== 'offen') return { ok: false, error: 'already', action: act }
  const expired = Date.now() - new Date(act.at).getTime() > EXPIRES_H * 3600e3
  const write = async (next: Partial<Action>, from: Action['status']) => {
    const { data: cur } = await db.from('benni_messages').select('data').eq('id', messageId).maybeSingle()
    const list = (((cur?.data as any)?.actions ?? []) as Action[])
    const j = list.findIndex((x) => x.id === actionId)
    if (j < 0 || list[j].status !== from) return null
    list[j] = { ...list[j], ...next }
    const { data } = await db.from('benni_messages').update({ data: { ...(cur!.data as any), actions: list } }).eq('id', messageId).eq(`data->actions->${j}->>status`, from).select('id')
    return data?.length ? list[j] : null
  }
  if (!run || expired) {
    const done = await write({ status: 'verworfen', result: expired && run ? 'Abgelaufen, bitte Marc noch einmal fragen.' : 'Verworfen.' }, 'offen')
    if (act.payload.staged) await db.storage.from('assistant-context').remove([act.payload.staged])
    return { ok: !!done, action: done ?? act }
  }
  const claimed = await write({ status: 'laeuft' }, 'offen')
  if (!claimed) return { ok: false, error: 'already' }
  let r: { ok: boolean; text: string }
  try { r = await execute(act, c) } catch (e) { r = { ok: false, text: 'Das hat nicht geklappt.' }; console.error(e) }
  const done = await write({ status: r.ok ? 'ausgefuehrt' : 'fehler', result: r.text }, 'laeuft')
  if (act.payload.staged && r.ok) await db.storage.from('assistant-context').remove([act.payload.staged])
  return { ok: r.ok, action: done ?? { ...act, status: r.ok ? 'ausgefuehrt' : 'fehler', result: r.text } }
}
