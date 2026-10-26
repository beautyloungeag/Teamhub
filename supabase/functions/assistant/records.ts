// Copilot, Teil 2 (26.10. abends, Aleksa: „alles, was man im Backoffice selbst kann“). Alle übrigen Schreibaktionen aus
// Backoffice und App, Bereich für Bereich mit denselben Feldern und Rollenregeln wie die Oberfläche (Katalog im HANDOFF).
// Gleiches Muster wie actions.ts: Vorschlag als Karte, ausgeführt erst nach „Ausführen“, mit dem Login der Person (RLS).
// Nicht abgedeckt: Timebutler und Postfach verbinden (brauchen Passwörter), Chats schreiben.
import type { Action, Ctx, Me } from './actions.ts'
import { arr, fmt, fmtDay, isDay, isTime, myStudios, plain, s, zIso } from './util.ts'

type Def = [string, string, Record<string, unknown>, string[]]
type Err = { error: string; [k: string]: unknown }
export type Proposal = { kind: string; title: string; lines: string[]; payload: Record<string, any> } | Err
type Res = { ok: boolean; text: string }

const NEWS_TAGS = ['Wichtig', 'Schulung', 'Team', 'Salon']
const GROUPS = ['Filialleitung', 'Kosmetikerinnen', 'Lernende', 'Büro']
const EVENT_KINDS = ['Schulung', 'Meeting', 'Team']
const REPEAT: Record<string, string> = { daily: 'täglich', weekly: 'wöchentlich', monthly: 'monatlich' }
const WEEKDAYS = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const METRICS: Record<string, string> = { revenue: 'Umsatz CHF', treatments: 'Behandlungen', avg_ticket: 'Durchschnittsbon CHF', clients: 'Kunden', requested: 'Wunschtermine', rating: 'Bewertung', reviews: 'Bewertungen' }
const SETTINGS: Record<string, { label: string; type: 'bool' | 'int' | 'text'; min?: number; max?: number; allowed?: number[] }> = {
  mail_enabled: { label: 'E-Mails allgemein', type: 'bool' },
  facility_mail_enabled: { label: 'Meldungen an Facility mailen', type: 'bool' },
  event_mail_enabled: { label: 'Einladungen und Erinnerungen per Mail', type: 'bool' },
  facility_email: { label: 'Facility-Adresse', type: 'text' },
  event_reminder_days: { label: 'Erinnerung Tage vor dem Termin', type: 'int', min: 1, max: 14 },
  demo_data: { label: 'Beispieldaten zeigen', type: 'bool' },
  learn_questions: { label: 'Kontrollfragen je Lektion', type: 'int', min: 3, max: 10 },
  learn_min_correct: { label: 'Mindestens richtig', type: 'int', min: 1, max: 10 },
  audit_days: { label: 'Protokoll aufbewahren (Tage)', type: 'int', allowed: [90, 180, 365, 730] },
}
const PREFS: Record<string, string> = { lead_tickets: 'Neue Meldungen', lead_ideas: 'Neue Ideen', lead_standby: 'Antworten auf Aushilfe', lead_events: 'Zusagen zu Terminen', lead_overdue: 'Überfällige Aufgaben' }
const LEVELS: Record<string, string> = { alle: 'Alle', filialleitung: 'Leitung und Büro', buero: 'Nur Büro' }
const DELETABLE = ['news', 'termin', 'aufgabe', 'checkliste', 'lektion', 'quiz', 'umfrage', 'aushilfe', 'meldung', 'ziel', 'studio', 'person', 'skill'] as const

const ids = (d: string) => ({ type: 'array', items: { type: 'string' }, description: d })
const bool = (d: string) => ({ type: 'boolean', description: d })
const str = (d?: string) => (d ? { type: 'string', description: d } : { type: 'string' })
const isOffice = (me: Me) => me.app_role === 'buero'
const by = (me: Me) => `${me.first_name} ${String(me.last_name ?? '').slice(0, 1)}.`
const full = (me: Me) => `${me.first_name} ${me.last_name}`
const yes = (x: boolean) => (x ? 'ja' : 'nein')
/** Datum und Uhrzeit eines Zeitpunkts in Zürich */
const zParts = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { d: `${p.year}-${p.month}-${p.day}`, t: `${p.hour}:${p.minute}` }
}
const has = (a: any, k: string) => a[k] !== undefined && a[k] !== null
const same = (x: unknown, y: unknown) => JSON.stringify([...((x ?? []) as string[])].sort()) === JSON.stringify([...((y ?? []) as string[])].sort())
const denied = (e: { message?: string; code?: string } | null) => !!e && (/row-level security|permission|not allowed|forbidden/i.test(e.message ?? '') || e.code === '42501')
const fail = (e: any, what: string): Res => ({ ok: false, text: denied(e) ? `Dafür fehlen dir die Rechte (${what}).` : `${what} hat nicht geklappt.` })
const rows = (r: { data: any[] | null; error: any }, what: string): Res | null => (r.error || !r.data?.length ? fail(r.error ?? { message: 'permission' }, what) : null)

/* ---------- Werkzeuge ---------- */
export function recordDefs(me: Me): Def[] {
  const office = isOffice(me), lead = me.app_role === 'filialleitung'
  if (!office && !lead) return []
  const v = 'Schlägt vor. Ausgeführt wird erst, wenn die Person in der Karte auf „Ausführen“ tippt.'
  const own = office ? 'Studio-ids (leer = alle Studios)' : 'Studio-ids, nur eigene Studios (leer = eigenes Studio)'
  const keep = 'Nur angeben, was sich ändert.'
  const question = { type: 'object', properties: { art: { type: 'string', enum: ['single', 'multi', 'text'] }, frage: str(), optionen: { type: 'array', items: { type: 'string' } }, richtig: { type: 'array', items: { type: 'number' }, description: '0-basierte Nummern der richtigen Optionen' }, lernziel: str('bei text: woran Marc die Antwort misst') }, required: ['art', 'frage'] }
  const defs: Def[] = [
    ['daten_liste', 'Datensätze im Backoffice finden, mit id (nur was diese Person sehen darf). Mit id: ein Datensatz ganz, z. B. News-Text, Checklistenpunkte, Quizfragen, Umfrage.', {
      bereich: { type: 'string', enum: ['news', 'termine', 'aufgaben', 'checklisten', 'lektionen', 'quiz', 'umfragen', 'aushilfe', 'ziele', 'skills', 'mitteilungen', ...(office ? ['studios', 'einstellungen'] : [])] },
      q: str('Suchwort im Titel/Namen'), id: str('ein bestimmter Datensatz'),
    }, ['bereich']],
    ['vorschlag_news_aendern', `Bestehende News ändern (Text, Titel, Kategorie, Pflicht, Zielgruppe, Erscheinen). ${keep} ${v}`, {
      news_id: str(), title: str(), body: str('ganzer neuer Text'), teaser: str(), kategorie: { type: 'string', enum: NEWS_TAGS }, pflicht: bool('Pflicht-News mit Lesebestätigung'),
      studios: ids(own), gruppen: { type: 'array', items: { type: 'string', enum: office ? GROUPS : GROUPS.filter((g) => g !== 'Büro') } }, skills: ids('Skills'), personen: ids('Personen-ids'),
      datum: str('nur wenn das Erscheinen verschoben werden soll: YYYY-MM-DD'), uhrzeit: str('HH:MM'), wissen_thema: str('auch im Wissen unter diesem Thema zeigen; leer = nicht'),
    }, ['news_id']],
    ['vorschlag_termin_aendern', `Schulung, Meeting oder Team-Event ändern. ${keep} ${v}`, {
      event_id: str(), title: str(), art: { type: 'string', enum: EVENT_KINDS }, beschreibung: str(), datum: str('YYYY-MM-DD'), von: str('HH:MM'), bis: str('HH:MM'), ort: str(), link: str(),
      plaetze: { type: 'number', description: '0 = unbegrenzt' }, anmeldeschluss: str('YYYY-MM-DD, leer = keiner'), studios: ids(own), skills: ids('Skills'), personen: ids('Personen-ids'),
      phorest_eintragen: bool('in Phorest als Termin blockieren (braucht Endzeit)'), phorest_bezahlt: bool('in Phorest als bezahlte Zeit'),
    }, ['event_id']],
    ['vorschlag_termin_phorest', `Termin erneut mit Phorest abgleichen (wenn der Eintrag in Phorest fehlt oder alt ist). ${v}`, { event_id: str() }, ['event_id']],
    ['vorschlag_teilnahme', `Eigene Antwort auf eine Schulung, ein Meeting oder Event (ich komme, ich komme nicht, abmelden). ${v}`, { event_id: str(), antwort: { type: 'string', enum: ['komme', 'komme_nicht', 'abmelden'] } }, ['event_id', 'antwort']],
    ['vorschlag_aufgabe_aendern', `Einzelaufgabe ändern, erledigt setzen oder wieder öffnen. ${keep} ${v}`, {
      todo_id: str(), title: str(), notiz: str(), datum: str('neue Frist YYYY-MM-DD'), uhrzeit: str('HH:MM'), ohne_frist: bool('Frist entfernen'), status: { type: 'string', enum: ['erledigt', 'offen'] },
    }, ['todo_id']],
    ['vorschlag_checkliste', `Studio-Checkliste (feste Abläufe, jeden Tag/Woche/Monat neu) anlegen oder ändern, ein- oder ausschalten. Punkte ersetzen die bisherigen Punkte in dieser Reihenfolge. ${v}`, {
      checkliste_id: str('leer = neue Checkliste'), name: str(), rhythmus: { type: 'string', enum: Object.keys(REPEAT) }, wochentag: { type: 'number', description: '1 = Montag … 7 = Sonntag, bei weekly' }, monatstag: { type: 'number', description: '1–31, bei monthly' },
      studios: ids(own), aktiv: bool('eingeschaltet'),
      punkte: { type: 'array', items: { type: 'object', properties: { titel: str(), bis: str('HH:MM, optional'), foto: bool('Foto als Nachweis nötig'), wichtig: bool('als wichtig markieren'), artikel_id: str('Wissensartikel „So geht es“'), link: str('Link oder Video') }, required: ['titel'] } },
    }, []],
    ['vorschlag_lektion', `Onboarding-Lektion anlegen oder ändern. ${v}`, {
      lektion_id: str('leer = neu'), titel: str(), minuten: { type: 'number' }, artikel_id: str('Wissensartikel dazu; leer = Marc sucht selbst'), studios: ids(own),
    }, []],
    ['vorschlag_quiz', `Quiz anlegen oder ändern (3–10 Fragen, bestanden ab Prozent). ziel neu = neuer Lerninhalt als Pflicht-News mit Quiz; news = an bestehende News${office ? '; artikel = an Wissensartikel' : ' (nur eigene)'}. Fragen ersetzen die bisherigen. ${v}`, {
      quiz_id: str('leer = neu'), ziel: { type: 'string', enum: office ? ['neu', 'news', 'artikel'] : ['neu', 'news'] }, news_id: str(), artikel_id: str(), titel: str(), bestehen_prozent: { type: 'number' },
      lerntext: str('bei ziel neu: der Lerninhalt'), studios: ids(own + ', bei ziel neu'), fragen: { type: 'array', items: question },
    }, []],
    ['vorschlag_umfrage', `Umfrage an einer News anlegen, ändern oder entfernen. Sobald jemand geantwortet hat, bleiben die Fragen fest. ${v}`, {
      news_id: str(), anonym: bool('anonym'), ergebnisse_zeigen: bool('Ergebnisse für alle sichtbar'), schluss: str('YYYY-MM-DD, leer = offen'), entfernen: bool('Umfrage löschen'),
      fragen: { type: 'array', items: { type: 'object', properties: { art: { type: 'string', enum: ['single', 'multi', 'scale', 'text'] }, frage: str(), optionen: { type: 'array', items: { type: 'string' }, description: 'single/multi: Antworten; scale: [Beschriftung 1, Beschriftung 5]' } }, required: ['art', 'frage'] } },
    }, ['news_id']],
    ['vorschlag_umfrage_erinnerung', `Erinnert alle, die eine Umfrage noch nicht beantwortet haben. ${v}`, { news_id: str() }, ['news_id']],
    ['vorschlag_aushilfe_aendern', `Aushilfe-Anfrage: nicht mehr nötig (abgesagt), wieder öffnen oder eine Person einteilen (besetzt). ${v}`, { anfrage_id: str(), status: { type: 'string', enum: ['abgesagt', 'offen', 'besetzt'] }, person_id: str('bei besetzt') }, ['anfrage_id', 'status']],
    ['vorschlag_person_aendern', `Person ändern: Funktion, Skills (ganze neue Liste)${office ? ', Studio, Rolle' : ''}, aktiv/deaktiviert. ${keep} ${v}`, {
      person_id: str(), funktion: str(), skills: ids('ganze Skill-Liste'), aktiv: bool('false = deaktivieren'), ...(office ? { studio: str('Studio-id'), rolle: { type: 'string', enum: ['mitarbeiterin', 'filialleitung', 'buero'] } } : {}),
    }, ['person_id']],
    ['vorschlag_ziel', `Ziel setzen (Performance), für eine Person oder ein Studio. ${v}`, {
      umfang: { type: 'string', enum: ['person', 'team'] }, person_id: str(), studio: str(), kennzahl: { type: 'string', enum: Object.keys(METRICS) }, ziel: { type: 'number' },
      von: str('YYYY-MM-DD'), bis: str('YYYY-MM-DD, höchstens 92 Tage'), titel: str(),
    }, ['umfang', 'kennzahl', 'ziel', 'von', 'bis']],
    ['vorschlag_kommentar', `Kommentar zu einer Meldung oder Idee schreiben. ${v}`, { ticket_id: str(), text: str() }, ['ticket_id', 'text']],
    ['vorschlag_mitteilungen', `Eigene Mitteilungen für die Leitung ein- oder ausschalten (${Object.values(PREFS).join(', ')}). Nur die Schalter angeben, die sich ändern sollen. ${v}`, Object.fromEntries(Object.entries(PREFS).map(([k, l]) => [k, bool(l)])), []],
    ['vorschlag_loeschen', `Löscht einen Datensatz endgültig. Nur auf ausdrücklichen Wunsch. ${v}`, { bereich: { type: 'string', enum: office ? [...DELETABLE] : DELETABLE.filter((x) => !['studio', 'person', 'skill'].includes(x)) }, id: str('id, bei skill der Name') }, ['bereich', 'id']],
  ]
  if (office) defs.push(
    ['vorschlag_skill', `Skill im Katalog anlegen. Löschen über vorschlag_loeschen. ${v}`, { name: str() }, ['name']],
    ['vorschlag_studio', `Studio anlegen oder ändern (Name, Phorest-Filial-ID, eigene Facility-Adresse). ${v}`, { studio_id: str('leer = neu'), name: str(), phorest_id: str('freiwillig, kann später ergänzt werden'), facility_email: str('freiwillig, leer = zentrale Adresse') }, []],
    ['vorschlag_einstellung', `Einstellung ändern: ${Object.entries(SETTINGS).map(([k, x]) => `${k} (${x.label})`).join(', ')}. ${v}`, { schluessel: { type: 'string', enum: Object.keys(SETTINGS) }, wert: { description: 'true/false, Zahl oder Text' } }, ['schluessel', 'wert']],
    ['vorschlag_vorschlaege_freigeben', `Alle Vorschläge aus dem Wissen auf einmal freigeben: Checklisten oder Lektionen. ${v}`, { art: { type: 'string', enum: ['checklisten', 'lektionen'] } }, ['art']],
    ['vorschlag_thema', `Wissens-Thema neu anlegen, umbenennen (alle Artikel ziehen mit) oder Symbol (Emoji) ändern. ${v}`, { aktion: { type: 'string', enum: ['neu', 'umbenennen', 'symbol'] }, name: str(), neuer_name: str(), symbol: str('ein Emoji') }, ['aktion', 'name']],
  )
  return defs
}

export const RECORD_READ = new Set(['daten_liste'])

/* ---------- Lesen ---------- */
export async function recordRead(name: string, a: any, c: Ctx): Promise<unknown> {
  const { db, me } = c, office = isOffice(me)
  if (name !== 'daten_liste') return null
  const q = s(a.q, 80), id = s(a.id, 80)
  const like = (x: any, col: string) => (q ? x.ilike(col, `%${q}%`) : x)
  const staff = async () => new Map(((await db.from('employees').select('id, first_name, last_name')).data ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]))
  switch (a.bereich) {
    case 'news': {
      if (id) { const { data } = await db.from('news').select('id, title, teaser, body, tag, must_read, publish_at, author_name, audience_branches, audience_groups, audience_skills, audience_people, wiki_category, image_path').eq('id', id).maybeSingle(); return data ?? { error: 'nicht_gefunden' } }
      const { data } = await like(db.from('news').select('id, title, tag, must_read, publish_at, author_name, author_id, audience_branches').order('publish_at', { ascending: false }).limit(40), 'title')
      return { news: (data ?? []).map((n: any) => ({ id: n.id, titel: n.title, kategorie: n.tag, pflicht: n.must_read, erscheint: fmt(n.publish_at), von: n.author_name, eigene: n.author_id === me.id, studios: n.audience_branches })) }
    }
    case 'termine': {
      if (id) { const { data } = await db.from('events').select('*').eq('id', id).maybeSingle(); return data ? { ...data, i18n: undefined } : { error: 'nicht_gefunden' } }
      const { data } = await like(db.from('events').select('id, title, kind, starts_at, place, created_by, audience_branches').order('starts_at', { ascending: false }).limit(40), 'title')
      return { termine: (data ?? []).map((e: any) => ({ id: e.id, titel: e.title, art: e.kind, beginn: fmt(e.starts_at), ort: e.place, eigene: e.created_by === me.id, studios: e.audience_branches })) }
    }
    case 'aufgaben': {
      const nm = await staff()
      let x = db.from('todos').select('id, title, note, due_at, assignee_id, branch_id, created_by, created_by_name, done_at, done_by_name').order('created_at', { ascending: false }).limit(60)
      if (id) x = x.eq('id', id)
      const { data } = await like(x, 'title')
      return { aufgaben: (data ?? []).map((t: any) => ({ id: t.id, titel: t.title, notiz: t.note, fuer: t.assignee_id ? nm.get(t.assignee_id) ?? '?' : `Studio ${t.branch_id}`, frist: t.due_at ? fmt(t.due_at) : null, von: t.created_by_name, erledigt: t.done_at ? `${fmt(t.done_at)} von ${t.done_by_name}` : null })) }
    }
    case 'checklisten': {
      let x = db.from('task_templates').select('id, name, repeat, weekday, monthday, branch_ids, active, proposed, task_items(id, title, due_time, prio, proof_photo, sort, article_id, link_url)').order('sort').limit(80)
      if (id) x = x.eq('id', id)
      const { data } = await like(x, 'name')
      return { checklisten: (data ?? []).map((t: any) => ({ id: t.id, name: t.name, rhythmus: REPEAT[t.repeat] ?? t.repeat, wochentag: t.weekday ? WEEKDAYS[t.weekday] : null, monatstag: t.monthday, studios: t.branch_ids?.length ? t.branch_ids : 'alle', aktiv: t.active, vorschlag: t.proposed,
        punkte: id || q ? (t.task_items ?? []).sort((x: any, y: any) => x.sort - y.sort).map((i: any) => ({ titel: i.title, bis: i.due_time?.slice(0, 5) ?? null, foto: i.proof_photo, wichtig: i.prio, artikel_id: i.article_id, link: i.link_url })) : `${(t.task_items ?? []).length} Punkte` })) }
    }
    case 'lektionen': {
      const { data } = await like(db.from('onboarding_steps').select('id, title, minutes, article_id, branch_ids, proposed, sort').order('sort').limit(100), 'title')
      return { lektionen: (data ?? []).map((l: any) => ({ id: l.id, titel: l.title, minuten: l.minutes, artikel_id: l.article_id, studios: l.branch_ids?.length ? l.branch_ids : 'alle', vorschlag: l.proposed })) }
    }
    case 'quiz': {
      let x = db.from('quizzes').select('id, title, news_id, article_id, pass_pct, quiz_questions(sort, kind, prompt, options, correct, rubric)').order('updated_at', { ascending: false }).limit(40)
      if (id) x = x.eq('id', id)
      const { data } = await like(x, 'title')
      return { quiz: (data ?? []).map((z: any) => ({ id: z.id, titel: z.title, news_id: z.news_id, artikel_id: z.article_id, bestehen_prozent: z.pass_pct,
        fragen: id ? (z.quiz_questions ?? []).sort((x: any, y: any) => x.sort - y.sort).map((f: any) => ({ art: f.kind, frage: f.prompt, optionen: f.options, richtig: f.correct, lernziel: f.rubric })) : (z.quiz_questions ?? []).length })) }
    }
    case 'umfragen': {
      let x = db.from('polls').select('id, news_id, anonymous, show_results, closes_at, news(title), poll_questions(sort, kind, prompt, options)').order('created_at', { ascending: false }).limit(30)
      if (id) x = x.eq('id', id)
      const { data } = await x
      return { umfragen: (data ?? []).map((p: any) => ({ id: p.id, news_id: p.news_id, news: p.news?.title, anonym: p.anonymous, ergebnisse_zeigen: p.show_results, schluss: p.closes_at ? fmt(p.closes_at) : null, fragen: (p.poll_questions ?? []).sort((x: any, y: any) => x.sort - y.sort).map((f: any) => ({ art: f.kind, frage: f.prompt, optionen: f.options })) })) }
    }
    case 'aushilfe': {
      const nm = await staff()
      const { data } = await db.from('standby_requests').select('id, branch_id, day, start_time, end_time, skill, note, status, filled_by, created_by_name, standby_responses(employee_id, answer)').order('day', { ascending: false }).limit(40)
      return { anfragen: (data ?? []).map((r: any) => ({ id: r.id, studio: r.branch_id, tag: fmtDay(r.day), zeit: r.start_time ? `${r.start_time.slice(0, 5)}–${r.end_time?.slice(0, 5) ?? ''}` : null, skill: r.skill, notiz: r.note, status: r.status, eingeteilt: r.filled_by ? nm.get(r.filled_by) : null, von: r.created_by_name,
        zusagen: (r.standby_responses ?? []).filter((x: any) => x.answer === 'ja').map((x: any) => ({ id: x.employee_id, name: nm.get(x.employee_id) })), absagen: (r.standby_responses ?? []).filter((x: any) => x.answer === 'nein').map((x: any) => nm.get(x.employee_id)) })) }
    }
    case 'ziele': {
      const nm = await staff()
      const { data } = await db.from('goals').select('*').order('starts_on', { ascending: false }).limit(60)
      return { ziele: (data ?? []).map((g: any) => ({ id: g.id, fuer: g.scope === 'person' ? nm.get(g.employee_id) : `Studio ${g.branch_id}`, kennzahl: METRICS[g.metric] ?? g.metric, ziel: g.target, von: g.starts_on, bis: g.ends_on, titel: g.title })) }
    }
    case 'studios': {
      if (!office) return { error: 'keine_berechtigung' }
      const { data } = await db.from('branches').select('id, name, is_office, sort, phorest_branch_id, facility_email').order('sort')
      return { studios: data ?? [] }
    }
    case 'skills': {
      const { data } = await db.from('skills').select('name').order('sort')
      return { skills: (data ?? []).map((x: any) => x.name) }
    }
    case 'einstellungen': {
      if (!office) return { error: 'keine_berechtigung' }
      const { data } = await db.from('app_settings').select('key, value')
      const m = new Map((data ?? []).map((x: any) => [x.key, x.value]))
      return { einstellungen: Object.fromEntries(Object.entries(SETTINGS).map(([k, x]) => [k, { bezeichnung: x.label, wert: m.get(k) ?? null }])) }
    }
    case 'mitteilungen': {
      const { data } = await db.from('employees').select('notify_prefs').eq('id', me.id).maybeSingle()
      return { mitteilungen: Object.fromEntries(Object.entries(PREFS).map(([k, l]) => [l, (data?.notify_prefs ?? {})[k] ?? 'Standard'])) }
    }
  }
  return { error: 'unbekannter_bereich' }
}

/* ---------- Vorschlagen ---------- */
export async function recordPropose(name: string, a: any, c: Ctx): Promise<Proposal | null> {
  const { db, me, branches } = c
  const office = isOffice(me), lead = me.app_role === 'filialleitung'
  if (!office && !lead) return { error: 'keine_berechtigung' }
  const mine = myStudios(me)
  const studios = branches.filter((b) => !b.is_office)
  const bName = (id: string) => branches.find((b) => b.id === id)?.name ?? id
  const checkStudios = (list: string[]): Err | null => {
    const bad = list.filter((b) => !studios.some((x) => x.id === b))
    if (bad.length) return { error: 'unbekanntes_studio', erlaubt: studios.map((b) => b.id) }
    if (lead && list.some((b) => !mine.includes(b))) return { error: 'keine_berechtigung', grund: 'nur eigene Studios' }
    return null
  }
  const leadStudios = (list: string[]) => (lead && !list.length ? [me.branch_id] : list)
  const people = async (list: string[]): Promise<string[] | Err> => {
    if (!list.length) return []
    const { data } = await db.from('employees').select('id, first_name, last_name').in('id', list)
    if ((data ?? []).length !== list.length) return { error: 'unbekannte_person', hinweis: 'ids mit team_list holen' }
    return (data ?? []).map((p: any) => `${p.first_name} ${p.last_name}`)
  }
  const studioLine = (list: string[]) => (list.length ? list.map(bName).join(', ') : 'alle Studios')

  if (name === 'vorschlag_news_aendern') {
    const { data: n } = await db.from('news').select('*').eq('id', s(a.news_id)).maybeSingle()
    if (!n) return { error: 'news_nicht_gefunden' }
    if (lead && n.author_id !== me.id) return { error: 'keine_berechtigung', grund: 'Filialleitung ändert nur eigene News' }
    const upd: Record<string, unknown> = {}, lines = [`„${n.title}“`]
    if (s(a.title, 160) && s(a.title, 160) !== n.title) { upd.title = s(a.title, 160); lines.push(`Titel → „${upd.title}“`) }
    if (s(a.body, 8000) && s(a.body, 8000) !== n.body) { upd.body = s(a.body, 8000); lines.push(`Neuer Text: ${s(a.body, 160)}…`) }
    if (has(a, 'teaser') && s(a.teaser, 200) !== n.teaser) { upd.teaser = s(a.teaser, 200) || String(upd.body ?? n.body).slice(0, 140); lines.push(`Anriss → ${upd.teaser}`) }
    else if (upd.body && n.teaser === String(n.body).slice(0, 140)) upd.teaser = String(upd.body).slice(0, 140)
    if (NEWS_TAGS.includes(a.kategorie) && a.kategorie !== n.tag) { upd.tag = a.kategorie; lines.push(`Kategorie ${n.tag} → ${a.kategorie}`) }
    if (typeof a.pflicht === 'boolean' && a.pflicht !== n.must_read) { upd.must_read = a.pflicht; lines.push(a.pflicht ? 'Wird Pflicht-News' : 'Keine Pflicht-News mehr') }
    if (has(a, 'studios') && !same(leadStudios(arr(a.studios)), n.audience_branches)) { const br = arr(a.studios), e = checkStudios(br); if (e) return e; upd.audience_branches = leadStudios(br); lines.push(`Studios → ${studioLine(upd.audience_branches as string[])}`) }
    if (has(a, 'gruppen') && !same(arr(a.gruppen), n.audience_groups)) { upd.audience_groups = arr(a.gruppen).filter((g) => GROUPS.includes(g) && (office || g !== 'Büro')); lines.push(`Gruppen → ${(upd.audience_groups as string[]).join(', ') || 'alle'}`) }
    if (has(a, 'skills') && !same(arr(a.skills), n.audience_skills)) { upd.audience_skills = arr(a.skills); lines.push(`Skills → ${(upd.audience_skills as string[]).join(', ') || 'alle'}`) }
    if (has(a, 'personen') && !same(arr(a.personen), n.audience_people)) { const pp = arr(a.personen), p = await people(pp); if ('error' in p) return p; upd.audience_people = pp; lines.push(p.length ? `Nur für: ${p.join(', ')}` : 'Nicht mehr an einzelne Personen') }
    if (a.datum) {
      if (!isDay(a.datum)) return { error: 'datum_YYYY-MM-DD' }
      const at = zIso(a.datum, isTime(a.uhrzeit) ? a.uhrzeit : '07:00')
      // Schon erschienene News nicht stillschweigend neu datieren: nur ein echtes Verschieben in die Zukunft zählt
      const past = Date.parse(n.publish_at) <= Date.now(), now = Math.abs(Date.parse(at) - Date.now()) < 3600e3
      if (Math.abs(Date.parse(at) - Date.parse(n.publish_at)) >= 60e3 && !(past && now)) { upd.publish_at = at; lines.push(`Erscheint ${fmt(at)}`) }
    }
    if (has(a, 'wissen_thema') && (s(a.wissen_thema, 60) || null) !== n.wiki_category) { upd.wiki_category = s(a.wissen_thema, 60) || null; lines.push(upd.wiki_category ? `Auch im Wissen unter ${upd.wiki_category}` : 'Nicht mehr im Wissen') }
    if (lead && !(n.audience_people ?? []).length && !((upd.audience_branches ?? n.audience_branches) as string[]).length) return { error: 'studio_noetig' }
    if (lines.length === 1) return { error: 'nichts_zu_aendern' }
    return { kind: 'news_update', title: 'News ändern', payload: { id: n.id, upd }, lines }
  }

  if (name === 'vorschlag_termin_aendern') {
    const { data: e } = await db.from('events').select('*').eq('id', s(a.event_id)).maybeSingle()
    if (!e) return { error: 'termin_nicht_gefunden' }
    if (lead && e.created_by !== me.id) return { error: 'keine_berechtigung', grund: 'Filialleitung ändert nur eigene Termine' }
    const upd: Record<string, unknown> = {}, lines = [`„${e.title}“`]
    if (s(a.title, 160) && s(a.title, 160) !== e.title) { upd.title = s(a.title, 160); lines.push(`Titel → „${upd.title}“`) }
    if (EVENT_KINDS.includes(a.art) && a.art !== e.kind) { upd.kind = a.art; lines.push(`Art → ${a.art}`) }
    if (has(a, 'beschreibung') && s(a.beschreibung, 4000) !== (e.description ?? '')) { upd.description = s(a.beschreibung, 4000); lines.push('Neue Beschreibung') }
    const cur = zParts(e.starts_at), end = e.ends_at ? zParts(e.ends_at).t : null
    if (a.datum || a.von || has(a, 'bis')) {
      const d = a.datum || cur.d, from = a.von || cur.t, to = has(a, 'bis') ? s(a.bis) : end
      if (!isDay(d) || !isTime(from) || (to && (!isTime(to) || to <= from))) return { error: 'datum_YYYY-MM-DD_zeit_HH:MM_bis_nach_von' }
      const st = zIso(d, from), en = to ? zIso(d, to) : null
      if (Date.parse(st) !== Date.parse(e.starts_at) || (en ? Date.parse(en) : null) !== (e.ends_at ? Date.parse(e.ends_at) : null)) {
        upd.starts_at = st; upd.ends_at = en
        lines.push(`Neu: ${fmt(st)}${to ? `–${to}` : ''}`)
      }
    }
    if (has(a, 'ort') && s(a.ort, 160) !== (e.place ?? '')) { upd.place = s(a.ort, 160); lines.push(`Ort → ${upd.place || '(leer)'}`) }
    if (has(a, 'link') && (s(a.link, 400) || null) !== e.link) { upd.link = s(a.link, 400) || null; lines.push(`Link → ${upd.link ?? '(keiner)'}`) }
    if (has(a, 'plaetze') && (Number(a.plaetze) > 0 ? Math.round(Number(a.plaetze)) : null) !== e.capacity) { upd.capacity = Number(a.plaetze) > 0 ? Math.round(Number(a.plaetze)) : null; lines.push(`Plätze → ${upd.capacity ?? 'unbegrenzt'}`) }
    if (has(a, 'anmeldeschluss') && (a.anmeldeschluss ? Date.parse(zIso(a.anmeldeschluss, '23:59')) : null) !== (e.register_until ? Date.parse(e.register_until) : null)) { if (a.anmeldeschluss && !isDay(a.anmeldeschluss)) return { error: 'anmeldeschluss_YYYY-MM-DD' }; upd.register_until = a.anmeldeschluss ? zIso(a.anmeldeschluss, '23:59') : null; lines.push(`Anmeldeschluss → ${a.anmeldeschluss ? fmtDay(a.anmeldeschluss) : 'keiner'}`) }
    if (has(a, 'studios') && !same(leadStudios(arr(a.studios)), e.audience_branches)) { const br = arr(a.studios), x = checkStudios(br); if (x) return x; upd.audience_branches = leadStudios(br); lines.push(`Studios → ${studioLine(upd.audience_branches as string[])}`) }
    if (has(a, 'skills') && !same(arr(a.skills), e.audience_skills)) { upd.audience_skills = arr(a.skills); lines.push(`Skills → ${(upd.audience_skills as string[]).join(', ') || 'alle'}`) }
    if (has(a, 'personen') && !same(arr(a.personen), e.audience_people)) { const pp = arr(a.personen), p = await people(pp); if ('error' in p) return p; upd.audience_people = pp; lines.push(p.length ? `Nur für: ${p.join(', ')}` : 'Nicht mehr an einzelne Personen') }
    if (typeof a.phorest_eintragen === 'boolean' && a.phorest_eintragen !== e.phorest_sync) {
      if (a.phorest_eintragen && !(upd.ends_at ?? e.ends_at)) return { error: 'phorest_braucht_endzeit' }
      upd.phorest_sync = a.phorest_eintragen; lines.push(a.phorest_eintragen ? 'Wird in Phorest eingetragen' : 'Nicht mehr in Phorest') }
    if (typeof a.phorest_bezahlt === 'boolean' && a.phorest_bezahlt !== e.phorest_paid) { upd.phorest_paid = a.phorest_bezahlt; lines.push(`Phorest bezahlte Zeit: ${yes(a.phorest_bezahlt)}`) }
    if (lines.length === 1) return { error: 'nichts_zu_aendern' }
    return { kind: 'event_update', title: 'Termin ändern', payload: { id: e.id, upd }, lines }
  }

  if (name === 'vorschlag_termin_phorest') {
    const { data: e } = await db.from('events').select('id, title, starts_at, created_by, phorest_sync').eq('id', s(a.event_id)).maybeSingle()
    if (!e) return { error: 'termin_nicht_gefunden' }
    if (lead && e.created_by !== me.id) return { error: 'keine_berechtigung' }
    if (!e.phorest_sync) return { error: 'termin_nicht_fuer_phorest', hinweis: 'zuerst mit vorschlag_termin_aendern phorest_eintragen' }
    return { kind: 'event_phorest', title: 'Mit Phorest abgleichen', payload: { id: e.id }, lines: [`„${e.title}“ am ${fmt(e.starts_at)}`] }
  }

  if (name === 'vorschlag_teilnahme') {
    const { data: e } = await db.from('events').select('id, title, starts_at').eq('id', s(a.event_id)).maybeSingle()
    if (!e) return { error: 'termin_nicht_gefunden' }
    const t = ['komme', 'komme_nicht', 'abmelden'].includes(a.antwort) ? a.antwort : 'komme'
    return { kind: 'event_answer', title: t === 'komme' ? 'Zusagen' : t === 'komme_nicht' ? 'Absagen' : 'Abmelden', payload: { id: e.id, answer: t }, lines: [`„${e.title}“ am ${fmt(e.starts_at)}`] }
  }

  if (name === 'vorschlag_aufgabe_aendern') {
    const { data: t } = await db.from('todos').select('*').eq('id', s(a.todo_id)).maybeSingle()
    if (!t) return { error: 'aufgabe_nicht_gefunden' }
    const upd: Record<string, unknown> = {}, lines = [`„${t.title}“`]
    if (s(a.title, 200) && s(a.title, 200) !== t.title) { upd.title = s(a.title, 200); lines.push(`Titel → „${upd.title}“`) }
    if (has(a, 'notiz')) { upd.note = s(a.notiz, 1000); lines.push(`Notiz → ${upd.note || '(leer)'}`) }
    if (a.ohne_frist === true) { upd.due_at = null; lines.push('Ohne Frist') }
    else if (a.datum) { if (!isDay(a.datum)) return { error: 'datum_YYYY-MM-DD' }; upd.due_at = zIso(a.datum, isTime(a.uhrzeit) ? a.uhrzeit : '23:59'); lines.push(`Frist → ${fmt(upd.due_at as string)}`) }
    const done = a.status === 'erledigt' ? true : a.status === 'offen' ? false : null
    if (done === true && t.done_at) return { error: 'schon_erledigt' }
    if (done !== null) lines.push(done ? 'Als erledigt abhaken' : 'Wieder öffnen')
    if (lines.length === 1) return { error: 'nichts_zu_aendern' }
    return { kind: 'todo_update', title: 'Aufgabe ändern', payload: { id: t.id, upd, done }, lines }
  }

  if (name === 'vorschlag_checkliste') {
    const id = s(a.checkliste_id)
    const old = id ? (await db.from('task_templates').select('id, name, repeat, weekday, monthday, branch_ids, active, proposed, task_items(id, title, sort)').eq('id', id).maybeSingle()).data : null
    if (id && !old) return { error: 'checkliste_nicht_gefunden' }
    if (old && lead && !(old.branch_ids?.length && old.branch_ids.every((b: string) => mine.includes(b)))) return { error: 'keine_berechtigung', grund: 'Checkliste gilt auch für andere Studios, ändert nur das Büro' }
    const head: Record<string, unknown> = {}, lines: string[] = []
    const nm = s(a.name, 120) || old?.name || ''
    if (!nm) return { error: 'name_noetig' }
    if (!old || nm !== old.name) head.name = nm
    const rep = REPEAT[a.rhythmus] ? a.rhythmus : old?.repeat ?? 'daily'
    if (!old || rep !== old.repeat || has(a, 'wochentag') || has(a, 'monatstag')) {
      head.repeat = rep
      head.weekday = rep === 'weekly' ? Math.min(7, Math.max(1, Math.round(Number(a.wochentag ?? old?.weekday) || 1))) : null
      head.monthday = rep === 'monthly' ? Math.min(31, Math.max(1, Math.round(Number(a.monatstag ?? old?.monthday) || 1))) : null
    }
    if (!old || (has(a, 'studios') && !same(leadStudios(arr(a.studios)), old.branch_ids))) { const br = arr(a.studios), x = checkStudios(br); if (x) return x; head.branch_ids = leadStudios(br) }
    if (typeof a.aktiv === 'boolean' && a.aktiv !== old?.active) { head.active = a.aktiv; if (a.aktiv && old?.proposed) head.proposed = false }
    let items: any[] | null = null
    if (Array.isArray(a.punkte)) {
      items = a.punkte.map((p: any, i: number) => ({ title: s(p.titel, 200), due_time: isTime(p.bis) ? p.bis : null, proof_photo: p.foto === true, prio: p.wichtig === true, sort: i, article_id: s(p.artikel_id, 60) || null, link_url: s(p.artikel_id) ? null : s(p.link, 400) ? (/^https?:\/\//.test(s(p.link, 400)) ? s(p.link, 400) : `https://${s(p.link, 400)}`) : null })).filter((p: any) => p.title)
      if (!items!.length) return { error: 'mindestens_ein_punkt' }
    } else if (!old) return { error: 'punkte_noetig' }
    const when = `${REPEAT[rep]}${rep === 'weekly' ? `, ${WEEKDAYS[head.weekday as number ?? old?.weekday] ?? ''}` : rep === 'monthly' ? `, am ${head.monthday ?? old?.monthday}.` : ''}`
    lines.push(`„${nm}“${old && head.name ? ` (vorher „${old.name}“)` : ''}`, `${when} · ${studioLine((head.branch_ids ?? old?.branch_ids ?? []) as string[])}${old && head.branch_ids ? ' (neu)' : ''}`)
    if (head.active !== undefined) lines.push(head.active ? 'Wird eingeschaltet' : 'Wird ausgeschaltet')
    else if (!old) lines.push('Sofort eingeschaltet')
    if (items) lines.push(`${items.length} Punkte: ${items.slice(0, 4).map((p) => p.title).join(', ')}${items.length > 4 ? ' …' : ''}${old ? ' (ersetzen die bisherigen)' : ''}`)
    if (old && !Object.keys(head).length && !items) return { error: 'nichts_zu_aendern' }
    return { kind: 'checklist', title: old ? 'Checkliste ändern' : 'Checkliste anlegen', payload: { id: old?.id ?? null, head, items, oldItems: (old?.task_items ?? []).sort((x: any, y: any) => x.sort - y.sort).map((i: any) => i.id) }, lines }
  }

  if (name === 'vorschlag_lektion') {
    const id = s(a.lektion_id)
    const old = id ? (await db.from('onboarding_steps').select('id, title, minutes, article_id, branch_ids').eq('id', id).maybeSingle()).data : null
    if (id && !old) return { error: 'lektion_nicht_gefunden' }
    if (old && lead && !(old.branch_ids?.length && old.branch_ids.every((b: string) => mine.includes(b)))) return { error: 'keine_berechtigung', grund: 'Lektion gilt auch für andere Studios' }
    const title = s(a.titel, 160) || old?.title || ''
    if (!title) return { error: 'titel_noetig' }
    let art: { id: string; title: string } | null = null
    const artId = has(a, 'artikel_id') ? s(a.artikel_id) : old?.article_id ?? ''
    if (artId) { art = (await db.from('wiki_articles').select('id, title').eq('id', artId).eq('published', true).maybeSingle()).data; if (!art) return { error: 'artikel_nicht_gefunden_oder_entwurf' } }
    let br = old?.branch_ids ?? []
    if (!old || (has(a, 'studios') && !same(leadStudios(arr(a.studios)), old.branch_ids))) { const x = arr(a.studios), e = checkStudios(x); if (e) return e; br = leadStudios(x) }
    const row = { title, minutes: Math.round(Number(a.minuten ?? old?.minutes) || 10), article_id: art?.id ?? null, branch_ids: br }
    return { kind: 'lesson', title: old ? 'Lektion ändern' : 'Lektion anlegen', payload: { id: old?.id ?? null, row },
      lines: [`„${title}“ · ${row.minutes} Min.`, art ? `Artikel: ${art.title}` : 'Marc sucht den passenden Artikel selbst', studioLine(br)] }
  }

  if (name === 'vorschlag_quiz') {
    const id = s(a.quiz_id)
    const old = id ? (await db.from('quizzes').select('id, title, news_id, article_id, pass_pct, news(author_id)').eq('id', id).maybeSingle()).data as any : null
    if (id && !old) return { error: 'quiz_nicht_gefunden' }
    if (old && lead && old.news?.author_id !== me.id) return { error: 'keine_berechtigung', grund: 'nur Quiz zu eigenen News' }
    const target = old ? (old.article_id ? 'artikel' : 'news') : ['neu', 'news', 'artikel'].includes(a.ziel) ? a.ziel : 'neu'
    if (target === 'artikel' && !office) return { error: 'keine_berechtigung', grund: 'Quiz zu Wissensartikeln nur Büro' }
    let label = ''
    let newsId = old?.news_id ?? null, artId = old?.article_id ?? null
    if (!old && target === 'news') {
      const { data: n } = await db.from('news').select('id, title, author_id').eq('id', s(a.news_id)).maybeSingle()
      if (!n) return { error: 'news_nicht_gefunden' }
      if (lead && n.author_id !== me.id) return { error: 'keine_berechtigung', grund: 'nur eigene News' }
      newsId = n.id; label = `An News „${n.title}“`
    }
    if (!old && target === 'artikel') {
      const { data: w } = await db.from('wiki_articles').select('id, title').eq('id', s(a.artikel_id)).maybeSingle()
      if (!w) return { error: 'artikel_nicht_gefunden' }
      artId = w.id; label = `An Artikel „${w.title}“`
    }
    if (!old && (newsId || artId)) {
      const { data: dup } = await db.from('quizzes').select('id').eq(newsId ? 'news_id' : 'article_id', newsId ?? artId).maybeSingle()
      if (dup) return { error: 'dazu_gibt_es_schon_ein_quiz', quiz_id: dup.id }
    }
    const title = s(a.titel, 160) || old?.title || ''
    if (!title) return { error: 'titel_noetig' }
    let text = '', br: string[] = []
    if (target === 'neu') { text = s(a.lerntext, 8000); if (!text) return { error: 'lerntext_noetig' }; const x = arr(a.studios), e = checkStudios(x); if (e) return e; br = leadStudios(x); label = `Neuer Lerninhalt als Pflicht-News · ${studioLine(br)}` }
    let qs: any[] | null = null
    if (Array.isArray(a.fragen)) {
      qs = []
      for (const [i, f] of a.fragen.entries()) {
        const kind = ['single', 'multi', 'text'].includes(f.art) ? f.art : 'single', prompt = s(f.frage, 500)
        if (!prompt) return { error: `frage_${i + 1}_leer` }
        if (kind === 'text') { if (!s(f.lernziel, 600)) return { error: `frage_${i + 1}_lernziel_noetig` }; qs.push({ sort: i, kind, prompt, options: [], correct: [], rubric: s(f.lernziel, 600) }); continue }
        const raw = Array.isArray(f.optionen) ? f.optionen.map((o: unknown) => s(o, 200)) : []
        const keep = raw.map((o: string, j: number) => (o ? j : -1)).filter((j: number) => j >= 0)
        const options = keep.map((j: number) => raw[j]), correct = (Array.isArray(f.richtig) ? f.richtig : []).map(Number).filter((j: number) => keep.includes(j)).map((j: number) => keep.indexOf(j))
        if (options.length < 2 || !correct.length) return { error: `frage_${i + 1}_braucht_2_optionen_und_eine_richtige` }
        qs.push({ sort: i, kind, prompt, options, correct, rubric: '' })
      }
      if (qs.length < 3 || qs.length > 10) return { error: '3_bis_10_fragen' }
    } else if (!old) return { error: 'fragen_noetig' }
    const pct = Math.min(100, Math.max(1, Math.round(Number(a.bestehen_prozent ?? old?.pass_pct) || 80)))
    return { kind: 'quiz', title: old ? 'Quiz ändern' : 'Quiz anlegen', payload: { id: old?.id ?? null, target, newsId, artId, title, pct, text, br, qs },
      lines: [`„${title}“ · bestanden ab ${pct} %`, ...(label ? [label] : []), qs ? `${qs.length} Fragen${old ? ' (ersetzen die bisherigen)' : ''}: ${qs.slice(0, 2).map((q) => q.prompt).join(' / ')}${qs.length > 2 ? ' …' : ''}` : 'Fragen bleiben'] }
  }

  if (name === 'vorschlag_umfrage' || name === 'vorschlag_umfrage_erinnerung') {
    const { data: n } = await db.from('news').select('id, title, author_id, audience_branches').eq('id', s(a.news_id)).maybeSingle()
    if (!n) return { error: 'news_nicht_gefunden' }
    const { data: poll } = await db.from('polls').select('id, anonymous, show_results, closes_at').eq('news_id', n.id).maybeSingle()
    if (name === 'vorschlag_umfrage_erinnerung') {
      if (!poll) return { error: 'keine_umfrage' }
      if (lead && n.author_id !== me.id && !(n.audience_branches ?? []).some((b: string) => mine.includes(b))) return { error: 'keine_berechtigung' }
      return { kind: 'poll_remind', title: 'An Umfrage erinnern', payload: { poll: poll.id }, lines: [`Umfrage in „${n.title}“`, 'Erinnert alle, die noch nicht geantwortet haben'] }
    }
    if (lead && n.author_id !== me.id) return { error: 'keine_berechtigung', grund: 'Umfragen nur an eigenen News' }
    if (a.entfernen === true) { if (!poll) return { error: 'keine_umfrage' }; return { kind: 'poll', title: 'Umfrage entfernen', payload: { news: n.id, poll: poll.id, remove: true }, lines: [`Umfrage in „${n.title}“`, 'Wird mit allen Antworten gelöscht'] } }
    const { count } = poll ? await db.from('poll_answers').select('poll_id', { count: 'exact', head: true }).eq('poll_id', poll.id) : { count: 0 }
    const locked = (count ?? 0) > 0
    let qs: any[] | null = null
    if (Array.isArray(a.fragen)) {
      if (locked) return { error: 'fragen_fest', hinweis: 'Es gibt schon Antworten, nur Einstellungen änderbar.' }
      qs = []
      for (const [i, f] of a.fragen.entries()) {
        const kind = ['single', 'multi', 'scale', 'text'].includes(f.art) ? f.art : 'single', prompt = s(f.frage, 500)
        if (!prompt) return { error: `frage_${i + 1}_leer` }
        const opts = (Array.isArray(f.optionen) ? f.optionen : []).map((o: unknown) => s(o, 120)).filter(Boolean)
        if ((kind === 'single' || kind === 'multi') && (opts.length < 2 || opts.length > 10)) return { error: `frage_${i + 1}_2_bis_10_optionen` }
        qs.push({ sort: i, kind, prompt, options: kind === 'text' ? [] : kind === 'scale' ? opts.slice(0, 2) : opts })
      }
      if (qs.length < 1 || qs.length > 10) return { error: '1_bis_10_fragen' }
    } else if (!poll) return { error: 'fragen_noetig' }
    if (a.schluss && !isDay(a.schluss)) return { error: 'schluss_YYYY-MM-DD' }
    const settings = { anonymous: typeof a.anonym === 'boolean' ? a.anonym : poll?.anonymous ?? false, show_results: typeof a.ergebnisse_zeigen === 'boolean' ? a.ergebnisse_zeigen : poll?.show_results ?? true, closes_at: has(a, 'schluss') ? (a.schluss ? zIso(a.schluss, '23:59') : null) : poll?.closes_at ?? null }
    return { kind: 'poll', title: poll ? 'Umfrage ändern' : 'Umfrage anlegen', payload: { news: n.id, poll: poll?.id ?? null, settings, qs },
      lines: [`An News „${n.title}“`, `${settings.anonymous ? 'Anonym' : 'Mit Namen'} · Ergebnisse ${settings.show_results ? 'sichtbar' : 'verborgen'} · ${settings.closes_at ? `bis ${fmt(settings.closes_at)}` : 'ohne Schluss'}`, qs ? `${qs.length} Fragen: ${qs.slice(0, 2).map((q) => q.prompt).join(' / ')}` : 'Fragen bleiben'] }
  }

  if (name === 'vorschlag_aushilfe_aendern') {
    const { data: r } = await db.from('standby_requests').select('id, branch_id, day, status').eq('id', s(a.anfrage_id)).maybeSingle()
    if (!r) return { error: 'anfrage_nicht_gefunden' }
    if (lead && !mine.includes(r.branch_id)) return { error: 'keine_berechtigung' }
    const st = ['abgesagt', 'offen', 'besetzt'].includes(a.status) ? a.status : 'offen'
    let who = ''
    if (st === 'besetzt') { const p = await people([s(a.person_id)]); if ('error' in p) return p; who = p[0] }
    return { kind: 'standby_update', title: st === 'besetzt' ? 'Aushilfe einteilen' : st === 'abgesagt' ? 'Aushilfe nicht mehr nötig' : 'Anfrage wieder öffnen', payload: { id: r.id, status: st, person: st === 'besetzt' ? s(a.person_id) : null },
      lines: [`${bName(r.branch_id)} am ${fmtDay(r.day)}`, who ? `Eingeteilt: ${who} (bekommt eine Mitteilung)` : `Status ${r.status} → ${st}`] }
  }

  if (name === 'vorschlag_person_aendern') {
    const { data: p } = await db.from('employees').select('id, first_name, last_name, job_title, app_role, branch_id, skills, active').eq('id', s(a.person_id)).maybeSingle()
    if (!p) return { error: 'person_nicht_gefunden' }
    const self = p.id === me.id
    if (lead && (self || p.app_role === 'buero' || p.branch_id === 'buero' || !mine.includes(p.branch_id))) return { error: 'keine_berechtigung', grund: 'Filialleitung ändert nur Personen im eigenen Studio' }
    const upd: Record<string, unknown> = {}, lines = [`${p.first_name} ${p.last_name}`]
    let active: boolean | null = null, role: string | null = null
    if (s(a.funktion, 80) && s(a.funktion, 80) !== p.job_title) { upd.job_title = s(a.funktion, 80); lines.push(`Funktion ${p.job_title || '–'} → ${upd.job_title}`) }
    if (has(a, 'skills') && !same(arr(a.skills), p.skills)) {
      const { data: cat } = await db.from('skills').select('name')
      const ok = new Set((cat ?? []).map((x: any) => x.name)), next = arr(a.skills)
      const bad = next.filter((x) => !ok.has(x)); if (bad.length) return { error: 'unbekannter_skill', erlaubt: [...ok] }
      upd.skills = next; lines.push(`Skills → ${next.join(', ') || 'keine'}`)
    }
    if (office && s(a.studio) && s(a.studio) !== p.branch_id) { if (self) return { error: 'eigenes_studio_nicht' }; if (!branches.some((b) => b.id === s(a.studio))) return { error: 'unbekanntes_studio' }; upd.branch_id = s(a.studio); lines.push(`Studio ${bName(p.branch_id)} → ${bName(s(a.studio))}`) }
    if (typeof a.aktiv === 'boolean' && a.aktiv !== p.active) { if (self && !a.aktiv) return { error: 'sich_selbst_nicht_deaktivieren' }; active = a.aktiv; lines.push(a.aktiv ? 'Wird wieder aktiv' : 'Wird deaktiviert (kann sich nicht mehr anmelden)') }
    if (office && a.rolle && a.rolle !== p.app_role) { if (self) return { error: 'eigene_rolle_nicht' }; if (!['mitarbeiterin', 'filialleitung', 'buero'].includes(a.rolle)) return { error: 'rolle' }; role = a.rolle; lines.push(`Rolle ${p.app_role} → ${a.rolle}`) }
    if (lines.length === 1) return { error: 'nichts_zu_aendern' }
    return { kind: 'person_update', title: 'Person ändern', payload: { id: p.id, upd, base: { job_title: p.job_title, branch_id: p.branch_id }, active, role }, lines }
  }

  if (name === 'vorschlag_ziel') {
    const scope = a.umfang === 'team' ? 'team' : 'person'
    if (!METRICS[a.kennzahl]) return { error: 'kennzahl', erlaubt: Object.keys(METRICS) }
    const target = Number(String(a.ziel).replace(/['’\s]/g, '').replace(',', '.'))
    if (!(target > 0)) return { error: 'ziel_groesser_0' }
    if (!isDay(a.von) || !isDay(a.bis) || a.bis < a.von) return { error: 'von_bis_YYYY-MM-DD' }
    if ((Date.parse(a.bis) - Date.parse(a.von)) / 864e5 > 92) return { error: 'hoechstens_92_tage' }
    let who = ''
    if (scope === 'person') { const pid = s(a.person_id) || me.id, p = await people([pid]); if ('error' in p) return p; who = p[0]; a.person_id = pid }
    else { const e = checkStudios([s(a.studio)]); if (e) return e; who = `Studio ${bName(s(a.studio))}` }
    return { kind: 'goal', title: 'Ziel setzen', payload: { row: { scope, employee_id: scope === 'person' ? s(a.person_id) : null, branch_id: scope === 'team' ? s(a.studio) : null, metric: a.kennzahl, target, starts_on: a.von, ends_on: a.bis, title: s(a.titel, 120) || null } },
      lines: [who, `${METRICS[a.kennzahl]}: ${target}`, `${fmtDay(a.von)} bis ${fmtDay(a.bis)}`, ...(a.titel ? [s(a.titel, 120)] : [])] }
  }

  if (name === 'vorschlag_kommentar') {
    const { data: t } = await db.from('tickets').select('id, kind, title').eq('id', s(a.ticket_id)).maybeSingle()
    if (!t) return { error: 'meldung_nicht_gefunden' }
    if (!s(a.text)) return { error: 'text_noetig' }
    return { kind: 'comment', title: 'Kommentar schreiben', payload: { id: t.id, body: s(a.text, 2000) }, lines: [`${t.kind} „${t.title}“`, s(a.text, 200)] }
  }

  if (name === 'vorschlag_mitteilungen') {
    const { data } = await db.from('employees').select('notify_prefs').eq('id', me.id).maybeSingle()
    const next = { ...(data?.notify_prefs ?? {}) }, lines: string[] = []
    for (const k of Object.keys(PREFS)) if (typeof a[k] === 'boolean' && a[k] !== next[k]) { next[k] = a[k]; lines.push(`${PREFS[k]}: ${a[k] ? 'an' : 'aus'}`) }
    if (!lines.length) return { error: 'nichts_zu_aendern' }
    return { kind: 'prefs', title: 'Mitteilungen einstellen', payload: { next }, lines }
  }

  if (name === 'vorschlag_loeschen') {
    const kind = DELETABLE.includes(a.bereich) ? a.bereich as typeof DELETABLE[number] : null
    const id = s(a.id, 120)
    if (!kind || !id) return { error: 'bereich_und_id' }
    if (['studio', 'person', 'skill'].includes(kind) && !office) return { error: 'keine_berechtigung', grund: 'nur Büro' }
    const one = async (table: string, cols: string) => (await db.from(table).select(cols).eq('id', id).maybeSingle()).data as any
    let label = '', extra = ''
    if (kind === 'news') { const n = await one('news', 'title, author_id'); if (!n) return { error: 'nicht_gefunden' }; if (lead && n.author_id !== me.id) return { error: 'keine_berechtigung' }; label = `News „${n.title}“`; extra = 'Mit Quiz, Umfrage und Lesebestätigungen' }
    if (kind === 'termin') { const e = await one('events', 'title, starts_at, created_by'); if (!e) return { error: 'nicht_gefunden' }; if (lead && e.created_by !== me.id) return { error: 'keine_berechtigung' }; label = `Termin „${e.title}“ am ${fmt(e.starts_at)}`; extra = 'Mit allen Anmeldungen' }
    if (kind === 'aufgabe') { const t = await one('todos', 'title'); if (!t) return { error: 'nicht_gefunden' }; label = `Aufgabe „${t.title}“` }
    if (kind === 'checkliste') { const t = await one('task_templates', 'name, branch_ids'); if (!t) return { error: 'nicht_gefunden' }; if (lead && !(t.branch_ids?.length && t.branch_ids.every((b: string) => mine.includes(b)))) return { error: 'keine_berechtigung' }; label = `Checkliste „${t.name}“`; extra = 'Mit allen Punkten und Abhak-Einträgen' }
    if (kind === 'lektion') { const l = await one('onboarding_steps', 'title, branch_ids'); if (!l) return { error: 'nicht_gefunden' }; if (lead && !(l.branch_ids?.length && l.branch_ids.every((b: string) => mine.includes(b)))) return { error: 'keine_berechtigung' }; label = `Lektion „${l.title}“` }
    if (kind === 'quiz') { const z = await one('quizzes', 'title, news(author_id)'); if (!z) return { error: 'nicht_gefunden' }; if (lead && z.news?.author_id !== me.id) return { error: 'keine_berechtigung' }; label = `Quiz „${z.title}“`; extra = 'Mit allen Versuchen' }
    if (kind === 'umfrage') { const p = await one('polls', 'news(title, author_id)'); if (!p) return { error: 'nicht_gefunden', hinweis: 'id der Umfrage aus daten_liste umfragen' }; if (lead && p.news?.author_id !== me.id) return { error: 'keine_berechtigung' }; label = `Umfrage in „${p.news?.title}“`; extra = 'Mit allen Antworten' }
    if (kind === 'aushilfe') { const r = await one('standby_requests', 'branch_id, day'); if (!r) return { error: 'nicht_gefunden' }; if (lead && !mine.includes(r.branch_id)) return { error: 'keine_berechtigung' }; label = `Aushilfe-Anfrage ${bName(r.branch_id)} am ${fmtDay(r.day)}` }
    if (kind === 'meldung') { const t = await one('tickets', 'kind, title, branch_id, photo_path'); if (!t) return { error: 'nicht_gefunden' }; if (lead && (t.kind === 'Anliegen' || !mine.includes(t.branch_id))) return { error: 'keine_berechtigung' }; label = `${t.kind} „${t.title}“`; extra = 'Mit Foto, Kommentaren und Stimmen' }
    if (kind === 'ziel') { const g = await one('goals', 'metric, target, starts_on'); if (!g) return { error: 'nicht_gefunden' }; label = `Ziel ${METRICS[g.metric] ?? g.metric} ${g.target} ab ${fmtDay(g.starts_on)}` }
    if (kind === 'studio') { const b = await one('branches', 'name, is_office'); if (!b) return { error: 'nicht_gefunden' }; if (b.is_office) return { error: 'buero_nicht_loeschbar' }; const { count } = await db.from('employees').select('id', { count: 'exact', head: true }).eq('branch_id', id); if (count) return { error: 'studio_hat_noch_personen', anzahl: count }; label = `Studio ${b.name}` }
    if (kind === 'person') { const p = await one('employees', 'first_name, last_name, email'); if (!p) return { error: 'nicht_gefunden' }; if (id === me.id) return { error: 'sich_selbst_nicht' }; label = `${p.first_name} ${p.last_name} (${p.email})`; extra = 'Person und Login werden endgültig gelöscht' }
    if (kind === 'skill') { const { data } = await db.from('skills').select('name').eq('name', id).maybeSingle(); if (!data) return { error: 'nicht_gefunden' }; label = `Skill „${id}“`; extra = 'Wird auch bei allen Personen, News und Terminen entfernt' }
    return { kind: 'delete', title: 'Endgültig löschen', payload: { what: kind, id }, lines: [label, ...(extra ? [extra] : [])] }
  }

  if (name === 'vorschlag_skill') {
    if (!office) return { error: 'keine_berechtigung' }
    const n = s(a.name, 60); if (!n) return { error: 'name_noetig' }
    const { data } = await db.from('skills').select('name'); if ((data ?? []).some((x: any) => x.name.toLowerCase() === n.toLowerCase())) return { error: 'gibt_es_schon' }
    return { kind: 'skill', title: 'Skill anlegen', payload: { name: n, sort: (data ?? []).length }, lines: [n] }
  }
  if (name === 'vorschlag_studio') {
    if (!office) return { error: 'keine_berechtigung' }
    const id = s(a.studio_id)
    const old = id ? branches.find((b) => b.id === id) : null
    if (id && !old) return { error: 'studio_nicht_gefunden' }
    const nm = s(a.name, 80) || (old as any)?.name
    if (!nm) return { error: 'name_noetig' }
    if (a.facility_email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s(a.facility_email, 120))) return { error: 'facility_email_ungueltig' }
    return { kind: 'studio', title: old ? 'Studio ändern' : 'Studio anlegen', payload: { id: old?.id ?? null, name: nm, phorest: has(a, 'phorest_id') ? s(a.phorest_id, 80) || null : undefined, facility: has(a, 'facility_email') ? s(a.facility_email, 120) || null : undefined },
      lines: [nm, ...(has(a, 'phorest_id') ? [`Phorest-ID: ${s(a.phorest_id, 80) || '(keine)'}`] : []), ...(has(a, 'facility_email') ? [`Facility: ${s(a.facility_email, 120) || 'zentrale Adresse'}`] : [])] }
  }
  if (name === 'vorschlag_einstellung') {
    if (!office) return { error: 'keine_berechtigung' }
    const def = SETTINGS[a.schluessel]; if (!def) return { error: 'unbekannte_einstellung' }
    let value: unknown = a.wert
    if (def.type === 'bool') value = a.wert === true || a.wert === 'true' || a.wert === 'an'
    if (def.type === 'int') { const n = Math.round(Number(a.wert)); if (!Number.isFinite(n) || (def.min && n < def.min) || (def.max && n > def.max) || (def.allowed && !def.allowed.includes(n))) return { error: 'wert_ungueltig', erlaubt: def.allowed ?? `${def.min}–${def.max}` }; value = n }
    if (def.type === 'text') { value = s(a.wert, 200); if (value && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(value as string)) return { error: 'email_ungueltig' } }
    if (a.schluessel === 'learn_min_correct') { const { data } = await db.from('app_settings').select('value').eq('key', 'learn_questions').maybeSingle(); if ((value as number) > Number(data?.value ?? 3)) return { error: 'mehr_als_kontrollfragen' } }
    return { kind: 'setting', title: 'Einstellung ändern', payload: { key: a.schluessel, value }, lines: [`${def.label}: ${def.type === 'bool' ? (value ? 'an' : 'aus') : value || '(leer)'}`] }
  }
  if (name === 'vorschlag_vorschlaege_freigeben') {
    if (!office) return { error: 'keine_berechtigung' }
    const k = a.art === 'lektionen' ? 'onboarding' : 'tasks'
    const { count } = k === 'tasks' ? await db.from('task_templates').select('id', { count: 'exact', head: true }).eq('proposed', true) : await db.from('onboarding_steps').select('id', { count: 'exact', head: true }).eq('proposed', true)
    if (!count) return { error: 'keine_offenen_vorschlaege' }
    return { kind: 'approve', title: k === 'tasks' ? 'Checklisten-Vorschläge freigeben' : 'Lektions-Vorschläge freigeben', payload: { kind: k }, lines: [`${count} Vorschläge aus dem Wissen`, k === 'tasks' ? 'Werden eingeschaltet, Beispiel-Checklisten aus' : 'Werden übernommen, Beispiel-Lektionen gelöscht'] }
  }
  if (name === 'vorschlag_thema') {
    if (!office) return { error: 'keine_berechtigung' }
    const nm = s(a.name, 60); if (!nm) return { error: 'name_noetig' }
    if (a.aktion === 'umbenennen') { const to = s(a.neuer_name, 60); if (!to) return { error: 'neuer_name_noetig' }
      const { count } = await db.from('wiki_articles').select('id', { count: 'exact', head: true }).ilike('category', nm)
      if (!count) return { error: 'thema_nicht_gefunden' }
      return { kind: 'topic', title: 'Thema umbenennen', payload: { action: 'rename', name: nm, to }, lines: [`${nm} → ${to}`, `${count} Artikel ziehen mit`] } }
    const emoji = s(a.symbol, 16) || (a.aktion === 'neu' ? '📄' : '')
    if (!emoji) return { error: 'symbol_noetig' }
    return { kind: 'topic', title: a.aktion === 'neu' ? 'Thema anlegen' : 'Symbol ändern', payload: { action: 'emoji', name: nm, emoji }, lines: [`${emoji} ${nm}`, ...(a.aktion === 'neu' ? ['Erscheint in der App, sobald ein sichtbarer Artikel darin ist'] : [])] }
  }
  return null
}

/* ---------- Ausführen ---------- */
export async function recordExecute(act: Action, c: Ctx): Promise<Res | null> {
  const { db, me } = c, p = act.payload, office = isOffice(me)
  const sync = () => (office ? c.fn('translate', { action: 'sync' }) : Promise.resolve())
  const now = () => new Date().toISOString()
  switch (act.kind) {
    case 'news_update': {
      const e = rows(await db.from('news').update(p.upd).eq('id', p.id).select('id'), 'News'); if (e) return e
      await sync(); return { ok: true, text: 'Die News ist geändert.' }
    }
    case 'event_update': {
      const e = rows(await db.from('events').update(p.upd).eq('id', p.id).select('id'), 'Termin'); if (e) return e
      await sync(); return { ok: true, text: 'Der Termin ist geändert.' }
    }
    case 'event_phorest': {
      const r = await c.fn('phorest-events', { action: 'retry', event_id: p.id })
      return r?.ok === false ? { ok: false, text: 'Der Abgleich mit Phorest hat nicht geklappt.' } : { ok: true, text: 'Abgleich mit Phorest angestossen.' }
    }
    case 'event_answer': {
      if (p.answer === 'abmelden') { const { error } = await db.from('event_registrations').delete().match({ event_id: p.id, employee_id: me.id }); return error ? fail(error, 'Abmelden') : { ok: true, text: 'Du bist abgemeldet.' } }
      const { data, error } = await db.rpc(p.answer === 'komme' ? 'register_event' : 'decline_event', { p_event: p.id })
      if (error) return { ok: false, text: /full|voll/i.test(error.message) ? 'Der Termin ist voll.' : /closed|schluss/i.test(error.message) ? 'Die Anmeldung ist geschlossen.' : 'Das hat nicht geklappt.' }
      return { ok: true, text: p.answer === 'komme' ? (typeof data === 'string' && /wait|warte/i.test(data) ? 'Du stehst auf der Warteliste.' : 'Du bist angemeldet.') : 'Du hast abgesagt.' }
    }
    case 'todo_update': {
      if (Object.keys(p.upd).length) { const e = rows(await db.from('todos').update(p.upd).eq('id', p.id).select('id'), 'Aufgabe'); if (e) return e }
      if (p.done !== null) { const { error } = await db.rpc('todo_done', { p_id: p.id, p_done: p.done }); if (error) return /already/.test(error.message) ? { ok: false, text: 'Die Aufgabe ist schon erledigt.' } : fail(error, 'Abhaken') }
      return { ok: true, text: p.done === true ? 'Erledigt.' : p.done === false ? 'Die Aufgabe ist wieder offen.' : 'Die Aufgabe ist geändert.' }
    }
    case 'checklist': {
      let id = p.id as string | null
      if (!id) {
        const { count } = await db.from('task_templates').select('id', { count: 'exact', head: true })
        const r = await db.from('task_templates').insert({ ...p.head, sort: count ?? 0 }).select('id')
        const e = rows(r, 'Checkliste'); if (e) return e
        id = r.data![0].id
      } else if (Object.keys(p.head).length) { const e = rows(await db.from('task_templates').update(p.head).eq('id', id).select('id'), 'Checkliste'); if (e) return e }
      if (p.items) {
        const old = (p.oldItems ?? []) as string[]
        for (const [i, it] of (p.items as any[]).entries()) {
          const r = i < old.length ? await db.from('task_items').update(it).eq('id', old[i]).select('id') : await db.from('task_items').insert({ template_id: id, ...it }).select('id')
          const e = rows(r, 'Checklistenpunkt'); if (e) return e
        }
        if (old.length > p.items.length) { const { error } = await db.from('task_items').delete().in('id', old.slice(p.items.length)); if (error) return fail(error, 'Punkte entfernen') }
      }
      await sync(); return { ok: true, text: p.id ? 'Die Checkliste ist geändert.' : p.head.active === false ? 'Die Checkliste ist angelegt (ausgeschaltet).' : 'Die Checkliste ist angelegt und eingeschaltet.' }
    }
    case 'lesson': {
      const r = p.id ? await db.from('onboarding_steps').update(p.row).eq('id', p.id).select('id')
        : await db.from('onboarding_steps').insert({ ...p.row, sort: (await db.from('onboarding_steps').select('id', { count: 'exact', head: true })).count ?? 0, proposed: false }).select('id')
      const e = rows(r, 'Lektion'); if (e) return e
      await sync(); return { ok: true, text: p.id ? 'Die Lektion ist geändert.' : 'Die Lektion ist angelegt.' }
    }
    case 'quiz': {
      let newsId = p.newsId as string | null
      if (!p.id && p.target === 'neu') {
        const r = await db.from('news').insert({ title: p.title, teaser: String(p.text).slice(0, 140), body: p.text, tag: 'Pflicht', must_read: true, audience_branches: p.br, author_id: me.id, author_name: full(me), publish_at: now() }).select('id')
        const e = rows(r, 'Lerninhalt'); if (e) return e
        newsId = r.data![0].id
      }
      const row = { news_id: newsId, article_id: p.target === 'artikel' ? p.artId : null, title: p.title, pass_pct: p.pct, updated_at: now() }
      const r = p.id ? await db.from('quizzes').update({ title: p.title, pass_pct: p.pct, updated_at: now() }).eq('id', p.id).select('id') : await db.from('quizzes').insert(row).select('id')
      const e = rows(r, 'Quiz'); if (e) return e
      const qid = r.data![0].id
      if (p.qs) {
        const { error: d } = await db.from('quiz_questions').delete().eq('quiz_id', qid); if (d) return fail(d, 'Fragen ersetzen')
        const { error } = await db.from('quiz_questions').insert((p.qs as any[]).map((q) => ({ quiz_id: qid, ...q }))); if (error) return fail(error, 'Fragen speichern')
      }
      if (!p.id && p.target === 'neu') await c.fn('notify', {})
      await sync(); return { ok: true, text: p.id ? 'Das Quiz ist geändert.' : p.target === 'neu' ? 'Lerninhalt mit Quiz ist veröffentlicht.' : 'Das Quiz ist angelegt.' }
    }
    case 'poll': {
      if (p.remove) { const { error } = await db.from('polls').delete().eq('id', p.poll); return error ? fail(error, 'Umfrage entfernen') : { ok: true, text: 'Die Umfrage ist entfernt.' } }
      let id = p.poll as string | null
      if (id) { const e = rows(await db.from('polls').update(p.settings).eq('id', id).select('id'), 'Umfrage'); if (e) return e }
      else { const r = await db.from('polls').insert({ ...p.settings, news_id: p.news, created_by: me.id }).select('id'); const e = rows(r, 'Umfrage'); if (e) return e; id = r.data![0].id }
      if (p.qs) {
        const { error: d } = await db.from('poll_questions').delete().eq('poll_id', id); if (d) return fail(d, 'Fragen ersetzen')
        const { error } = await db.from('poll_questions').insert((p.qs as any[]).map((q) => ({ poll_id: id, ...q }))); if (error) return fail(error, 'Fragen speichern')
      }
      await sync(); return { ok: true, text: p.poll ? 'Die Umfrage ist geändert.' : 'Die Umfrage hängt an der News.' }
    }
    case 'poll_remind': {
      const r = await c.fn('notify', { action: 'remind_poll', poll_id: p.poll })
      if (!r?.ok) return { ok: false, text: r?.error === 'closed' ? 'Die Umfrage ist schon geschlossen.' : r?.error === 'forbidden' ? 'Dafür fehlen dir die Rechte.' : 'Die Erinnerung hat nicht geklappt.' }
      return { ok: true, text: r.people ? `Erinnerung an ${r.people} ${r.people === 1 ? 'Person' : 'Personen'} geschickt.` : 'Alle haben schon geantwortet.' }
    }
    case 'standby_update': {
      const patch = p.status === 'besetzt' ? { status: 'besetzt', filled_by: p.person } : p.status === 'offen' ? { status: 'offen', filled_by: null } : { status: 'abgesagt' }
      const e = rows(await db.from('standby_requests').update(patch).eq('id', p.id).select('id'), 'Aushilfe'); if (e) return e
      if (p.status === 'besetzt') await c.fn('notify', {})
      return { ok: true, text: p.status === 'besetzt' ? 'Eingeteilt, die Person bekommt eine Mitteilung.' : p.status === 'abgesagt' ? 'Die Anfrage ist abgesagt.' : 'Die Anfrage ist wieder offen.' }
    }
    case 'person_update': {
      if (Object.keys(p.upd).length) {
        let q = db.from('employees').update({ ...p.upd, updated_at: now() }).eq('id', p.id)
        // Nur ändern, was seit dem Vorschlag niemand sonst geändert hat (wie das Backoffice)
        if (p.upd.job_title !== undefined) q = q.eq('job_title', p.base.job_title ?? '')
        if (p.upd.branch_id !== undefined) q = q.eq('branch_id', p.base.branch_id)
        const r = await q.select('id')
        if (r.error) return fail(r.error, 'Person ändern')
        if (!r.data?.length) return { ok: false, text: 'Die Person wurde inzwischen geändert. Bitte Marc noch einmal fragen.' }
      }
      if (p.active !== null) { const r = await c.fn('admin-employee', { action: 'set_active', employee_id: p.id, active: p.active }); if (!r?.ok) return { ok: false, text: r?.error === 'forbidden' ? 'Dafür fehlen dir die Rechte (aktivieren).' : 'Aktivieren/Deaktivieren hat nicht geklappt.' } }
      if (p.role) { const r = await c.fn('admin-employee', { action: 'set_role', employee_id: p.id, app_role: p.role }); if (!r?.ok) return { ok: false, text: 'Die Rolle konnte nicht geändert werden.' } }
      return { ok: true, text: 'Die Person ist geändert.' }
    }
    case 'goal': {
      const { error } = await db.from('goals').insert({ ...p.row, created_by: me.id, created_by_name: full(me) })
      return error ? fail(error, 'Ziel') : { ok: true, text: 'Das Ziel ist gesetzt.' }
    }
    case 'comment': {
      const { error } = await db.from('ticket_comments').insert({ id: crypto.randomUUID(), ticket_id: p.id, author_id: me.id, author_name: full(me), body: p.body })
      return error ? fail(error, 'Kommentar') : { ok: true, text: 'Kommentar ist gespeichert.' }
    }
    case 'prefs': {
      const { error } = await db.rpc('set_notify_prefs', { p: p.next })
      return error ? fail(error, 'Mitteilungen') : { ok: true, text: 'Deine Mitteilungen sind eingestellt.' }
    }
    case 'skill': {
      const { error } = await db.from('skills').insert({ name: p.name, sort: p.sort })
      return error ? fail(error, 'Skill') : { ok: true, text: `Skill „${p.name}“ ist im Katalog.` }
    }
    case 'studio': {
      if (p.id) {
        const upd: Record<string, unknown> = { name: p.name }
        if (p.phorest !== undefined) upd.phorest_branch_id = p.phorest
        if (p.facility !== undefined) upd.facility_email = p.facility
        const e = rows(await db.from('branches').update(upd).eq('id', p.id).select('id'), 'Studio'); if (e) return e
        return { ok: true, text: 'Das Studio ist geändert.' }
      }
      const id = p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const { data: all } = await db.from('branches').select('id, sort, is_office')
      const sort = Math.max(0, ...(all ?? []).filter((b: any) => !b.is_office).map((b: any) => b.sort)) + 1
      const { error } = await db.from('branches').insert({ id, name: p.name, sort, phorest_branch_id: p.phorest ?? null, facility_email: p.facility ?? null })
      if (error) return /duplicate/.test(error.message) ? { ok: false, text: 'Dieses Studio gibt es schon.' } : fail(error, 'Studio')
      for (const b of (all ?? []).filter((x: any) => x.is_office && x.sort <= sort)) await db.from('branches').update({ sort: sort + 1 }).eq('id', b.id)
      return { ok: true, text: `Studio ${p.name} ist angelegt.` }
    }
    case 'setting': {
      const { error } = await db.from('app_settings').upsert({ key: p.key, value: p.value, updated_at: now() })
      return error ? fail(error, 'Einstellung') : { ok: true, text: 'Die Einstellung ist gespeichert.' }
    }
    case 'approve': {
      const { data, error } = await db.rpc('approve_wiki_proposals', { p_kind: p.kind })
      if (error) return fail(error, 'Freigeben')
      await sync(); return { ok: true, text: `${data ?? 0} Vorschläge freigegeben.` }
    }
    case 'topic': {
      if (p.action === 'rename') { const { error } = await db.rpc('rename_wiki_category', { p_old: p.name, p_new: p.to }); if (error) return fail(error, 'Umbenennen'); await sync(); return { ok: true, text: `Das Thema heisst jetzt ${p.to}.` } }
      const { error } = await db.from('wiki_categories').upsert({ key: p.name.trim().toLowerCase(), emoji: p.emoji, updated_at: now() })
      return error ? fail(error, 'Thema') : { ok: true, text: 'Gespeichert.' }
    }
    case 'delete': {
      const id = p.id as string
      if (p.what === 'person') { const r = await c.fn('admin-employee', { action: 'delete', employee_id: id }); return r?.ok ? { ok: true, text: 'Die Person ist gelöscht.' } : { ok: false, text: 'Löschen hat nicht geklappt.' } }
      if (p.what === 'skill') { const { error } = await db.rpc('delete_skill', { p_name: id }); return error ? fail(error, 'Skill löschen') : { ok: true, text: 'Der Skill ist gelöscht.' } }
      if (p.what === 'meldung') {
        const { data: t } = await db.from('tickets').select('photo_path').eq('id', id).maybeSingle()
        if (t?.photo_path) await db.storage.from('ticket-photos').remove([t.photo_path])
      }
      const table = ({ news: 'news', termin: 'events', aufgabe: 'todos', checkliste: 'task_templates', lektion: 'onboarding_steps', quiz: 'quizzes', umfrage: 'polls', aushilfe: 'standby_requests', meldung: 'tickets', ziel: 'goals', studio: 'branches' } as Record<string, string>)[p.what]
      const e = rows(await db.from(table).delete().eq('id', id).select('id'), 'Löschen'); if (e) return e
      return { ok: true, text: 'Gelöscht.' }
    }
  }
  return null
}

/** Kurzbeschreibung für den Systemhinweis */
export const RECORD_NOTE = (me: Me) => isOffice(me)
  ? 'Ausserdem: News und Termine ändern oder löschen, Termine mit Phorest abgleichen, Aufgaben ändern/abhaken, Studio-Checklisten, Lektionen, Quiz, Umfragen (mit Erinnerung), Aushilfe einteilen/absagen, Personen ändern (Funktion, Skills, Studio, Rolle, aktiv) und löschen, Skills, Studios, Einstellungen, Ziele, Kommentare, eigene Mitteilungen, Vorschläge freigeben, Wissens-Themen. Für ids zuerst daten_liste.'
  : 'Ausserdem für die eigenen Studios: eigene News und Termine ändern oder löschen, Aufgaben ändern/abhaken, Studio-Checklisten, Lektionen, Quiz und Umfragen an eigenen News, Aushilfe einteilen/absagen, Personen im Studio ändern (Funktion, Skills, aktiv), Ziele, Kommentare, eigene Mitteilungen. Für ids zuerst daten_liste.'
