import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useApp, isoDay, addDays, fmtDate, fmtTime, type Staff } from '../store'
import { supabase } from '../lib/supabase'
import { downloadCsv } from '../lib/csv'
import { Avatar } from '../People'
import { Select, Seg, Modal, Th } from './kit'

// Protokoll: wer hat wann was angelegt, geändert oder gelöscht (Trigger audit_row in der Datenbank).
// Büro sieht alles, Filialleitung was ihre Studios betrifft und was sie selbst getan hat.

export type Log = { id: number; at: string; actor_id: string | null; actor_name: string | null; action: 'insert' | 'update' | 'delete'; entity: string; entity_id: string | null; title: string | null; branch_ids: string[]; changes: Record<string, unknown> | null }

const AREA: Record<string, string> = {
  news: 'News', polls: 'Umfragen', quizzes: 'Quiz', events: 'Termine', event_registrations: 'Anmeldungen', task_templates: 'Checklisten', task_items: 'Checklisten',
  task_completions: 'Checklisten', todos: 'Aufgaben', tickets: 'Meldungen', employees: 'Personen', standby_requests: 'Aushilfe', wiki_articles: 'Wissen',
  onboarding_steps: 'Onboarding', branches: 'Studios', skills: 'Skills', app_settings: 'Einstellungen', goals: 'Ziele',
}
const THING: Record<string, string> = {
  news: 'die News', polls: 'eine Umfrage zu', quizzes: 'das Quiz', events: 'den Termin', task_templates: 'die Checkliste', task_items: 'die Aufgabe', todos: 'die Aufgabe',
  tickets: 'die Meldung', employees: '', standby_requests: 'die Anfrage', wiki_articles: 'den Artikel', onboarding_steps: 'den Onboarding-Schritt', branches: 'das Studio',
  skills: 'den Skill', app_settings: 'die Einstellung', goals: 'das Ziel',
}
const FIELD: Record<string, string> = {
  title: 'Titel', teaser: 'Kurzfassung', body: 'Text', tag: 'Kategorie', must_read: 'Pflicht', audience_branches: 'Studios', audience_groups: 'Gruppen', audience_skills: 'Skills',
  audience_people: 'Personen', publish_at: 'Veröffentlichung', wiki_category: 'Ins Wissen', image_path: 'Bild', kind: 'Art', description: 'Beschreibung', starts_at: 'Beginn', ends_at: 'Ende',
  place: 'Ort', link: 'Link', capacity: 'Plätze', register_until: 'Anmeldeschluss', name: 'Name', repeat: 'Wiederholung', weekday: 'Wochentag', monthday: 'Tag im Monat', branch_ids: 'Studios',
  active: 'Aktiv', proposed: 'Vorschlag', due_time: 'Fällig um', prio: 'Wichtig', proof_photo: 'Fotonachweis', note: 'Notiz', due_at: 'Frist', assignee_id: 'Für', branch_id: 'Studio',
  done_at: 'Erledigt', done_by_name: 'Erledigt von', status: 'Status', assignee: 'Zuständig', first_name: 'Vorname', last_name: 'Nachname', email: 'E-Mail', phone: 'Telefon',
  job_title: 'Funktion', app_role: 'Rechte', extra_branch_ids: 'Zusatzstudios', skills: 'Skills', day: 'Tag', start_time: 'Von', end_time: 'Bis', skill: 'Skill', to_all: 'An alle',
  filled_by: 'Eingeteilt', category: 'Kategorie', published: 'Freigegeben', access_level: 'Sichtbar für', minutes: 'Minuten', owner_id: 'Verantwortlich', review_due: 'Prüfen bis',
  value: 'Wert', coming: 'Kommt', waitlist: 'Warteliste', promoted_at: 'Nachgerückt', pass_pct: 'Bestanden ab', anonymous: 'Anonym', show_results: 'Ergebnis sichtbar', closes_at: 'Endet',
  metric: 'Kennzahl', target: 'Ziel', created_by: 'Angelegt von', author_id: 'Verfasst von', done_by: 'Erledigt von', employee_id: 'Person', scope: 'Art des Ziels', photo_path: 'Foto', via_ai: 'Über Marc', kind_: '', starts_on: 'Von', ends_on: 'Bis', phorest_branch_id: 'Phorest', facility_email: 'Facility-Mail', intro: 'Kurzfassung', media_kind: 'Medien', media_url: 'Datei',
}
const HIDE = new Set(['is_sample', 'created_by_name', 'author_name', 'done_by_name', 'news_id', 'poll_id', 'template_id', 'item_id', 'event_id', 'phorest_staff_id', 'audience_people_count'])
const SETTING: Record<string, string> = { demo_data: 'Beispielinhalte', mail_enabled: 'E-Mail-Versand', facility_email: 'zentrale Facility-Adresse', event_reminder_days: 'Erinnerung vor Schulungen', learn_questions: 'Kontrollfragen je Lektion', learn_min_correct: 'Kontrollfragen zum Bestehen', audit_days: 'Aufbewahrung Protokoll' }

const q = (s: string | null) => s ? `„${s}“` : ''
/** Wer steht vorne? Beim Nachrücken die Person, die nachrückt (ausgelöst hat es die Absage einer anderen). */
export function subject(l: Log) {
  const c = (l.changes ?? {}) as Record<string, [unknown, unknown]>
  if (l.entity === 'event_registrations' && l.action === 'update' && c.waitlist?.[1] === false && c.promoted_at) return (l.title ?? '').split(' · ')[1] ?? l.actor_name ?? 'System'
  return l.actor_name ?? 'System'
}

/** Ein Satz pro Eintrag, ohne den Namen (der steht davor). */
export function sentence(l: Log, staff: Staff[]) {
  const c = (l.changes ?? {}) as Record<string, [unknown, unknown]>
  const has = (k: string) => l.action === 'update' && k in c
  const person = (id: unknown) => { const s = staff.find(x => x.id === id); return s ? `${s.first} ${s.last}` : 'jemanden' }
  switch (l.entity) {
    case 'event_registrations': {
      const [ev, who] = (l.title ?? '').split(' · ')
      const other = who && who !== l.actor_name ? ` (${who})` : ''
      if (l.action === 'delete') return `meldet sich von ${q(ev)} ab${other}`
      if (has('waitlist') && c.waitlist[1] === false && c.promoted_at) return `rückt bei ${q(ev)} von der Warteliste nach, weil ein Platz frei wurde`
      const snap = (l.changes ?? {}) as Record<string, unknown>
      const coming = l.action === 'insert' ? snap.coming ?? true : c.coming?.[1]
      if (coming !== false && (l.action === 'insert' ? snap.waitlist : c.waitlist?.[1])) return `steht auf der Warteliste für ${q(ev)}${other}`
      return coming === false ? `sagt ${q(ev)} ab${other}` : `meldet sich für ${q(ev)} an${other}`
    }
    case 'goals': {
      const snap = (l.changes ?? {}) as Record<string, unknown>
      const metric: Record<string, string> = { revenue: 'DL-Umsatz', treatments: 'Behandlungen', avg_ticket: 'Ø je Besuch', clients: 'Kunden', requested: 'Wunschtermine', rating: 'Bewertung Ø', reviews: 'Bewertungen' }
      const what = l.title ? q(l.title) : snap.metric ? `${metric[String(snap.metric)] ?? snap.metric} ${snap.target ?? ''}`.trim() : ''
      return `${{ insert: 'setzt', update: 'ändert', delete: 'löscht' }[l.action]} ${snap.scope === 'team' ? 'ein Teamziel' : 'ein Ziel'}${what ? `: ${what}` : ''}`
    }
    case 'task_completions': return `hat den Haken bei ${q(l.title)} zurückgenommen`
    case 'tickets':
      if (l.action === 'insert') return `hat gemeldet: ${q(l.title)}`
      if (has('status')) return `setzt ${q(l.title)} auf ${String(c.status[1])}`
      if (has('assignee')) return c.assignee[1] ? `weist ${q(l.title)} ${String(c.assignee[1])} zu` : `nimmt die Zuweisung bei ${q(l.title)} zurück`
      break
    case 'todos':
      if (l.action === 'insert') return `gibt eine Aufgabe: ${q(l.title)}`
      if (has('done_at')) return c.done_at[1] ? `hat ${q(l.title)} erledigt` : `öffnet ${q(l.title)} wieder`
      break
    case 'employees':
      if (l.action === 'insert') return `legt ${l.title} an`
      if (l.action === 'delete') return `löscht ${l.title}`
      if (has('active')) return c.active[1] ? `aktiviert ${l.title} wieder` : `deaktiviert ${l.title}`
      return `ändert ${Object.keys(c).map(k => FIELD[k] ?? k).join(', ')} von ${l.title}`
    case 'standby_requests':
      if (l.action === 'insert') return `fragt Aushilfe an: ${l.title}`
      if (has('status') && c.status[1] === 'besetzt') return `teilt ${person(c.filled_by?.[1])} ein: ${l.title}`
      if (has('status') && c.status[1] === 'abgesagt') return `braucht keine Aushilfe mehr: ${l.title}`
      if (has('status') && c.status[1] === 'offen') return `öffnet die Anfrage wieder: ${l.title}`
      break
    case 'app_settings': return `ändert ${SETTING[l.title ?? ''] ?? l.title}${has('value') ? ` auf ${show(c.value[1], staff)}` : ''}`
    case 'news': if (l.action === 'insert') return `veröffentlicht die News ${q(l.title)}`; break
    case 'polls': if (l.action === 'insert') return `hängt eine Umfrage an ${q(l.title)}`; break
  }
  const verb = { insert: 'legt', update: 'ändert', delete: 'löscht' }[l.action]
  const tail = l.action === 'insert' ? ' an' : ''
  const what = l.action === 'update' && Object.keys(c).length ? ` (${Object.keys(c).slice(0, 4).map(k => FIELD[k] ?? k).join(', ')})` : ''
  return `${verb} ${THING[l.entity] ?? ''} ${q(l.title)}${tail}${what}`.replace(/\s+/g, ' ').trim()
}

const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+([+-]\d\d:?\d\d|Z)?)?$/
export function show(v: unknown, staff: Staff[], branches: { id: string; name: string }[] = []): string {
  if (v === null || v === undefined || v === '') return '–'
  if (typeof v === 'boolean') return v ? 'ja' : 'nein'
  if (Array.isArray(v)) return v.length ? v.map(x => show(x, staff, branches)).join(', ') : '–'
  if (typeof v === 'string') {
    const s = staff.find(x => x.id === v); if (s) return `${s.first} ${s.last}`
    const b = branches.find(x => x.id === v); if (b) return b.name
    if (ISO.test(v)) return v.length > 10 ? `${fmtDate(v, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${fmtTime(v)}` : fmtDate(v + 'T12:00:00Z', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return v
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

type Span = '1' | '7' | '30' | '365'
export function ProtocolView() {
  const { me, staff, branches } = useApp()
  const office = me.app_role === 'buero'
  const [span, setSpan] = useState<Span>('7'), [area, setArea] = useState(''), [who, setWho] = useState(''), [studio, setStudio] = useState(''), [text, setText] = useState('')
  const [rows, setRows] = useState<Log[] | null>(null), [sel, setSel] = useState<Log | null>(null)
  useEffect(() => {
    let alive = true; setRows(null)
    let qy = supabase!.from('audit_log').select('*').gte('at', new Date(addDays(-Number(span) + 1) + 'T00:00:00').toISOString()).order('at', { ascending: false }).limit(800)
    if (area) qy = qy.in('entity', Object.entries(AREA).filter(([, a]) => a === area).map(([e]) => e))
    if (who) qy = who === 'system' ? qy.is('actor_id', null) : qy.eq('actor_id', who)
    if (studio) qy = qy.contains('branch_ids', [studio])
    qy.then(({ data }) => { if (alive) setRows((data ?? []) as Log[]) })
    return () => { alive = false }
  }, [span, area, who, studio])
  const list = (rows ?? []).filter(l => !text.trim() || `${l.actor_name} ${l.title} ${sentence(l, staff)}`.toLowerCase().includes(text.toLowerCase()))
  const days = useMemo(() => { const m = new Map<string, Log[]>(); for (const l of list) { const d = isoDay(new Date(l.at)); m.set(d, [...(m.get(d) ?? []), l]) } return [...m.entries()] }, [list]) // eslint-disable-line react-hooks/exhaustive-deps
  const people = [...new Map(staff.filter(s => s.app_role !== 'mitarbeiterin' || (rows ?? []).some(r => r.actor_id === s.id)).map(s => [s.id, s])).values()]
  const bname = (id: string) => branches.find(b => b.id === id)?.name ?? id
  const dayLabel = (d: string) => d === isoDay() ? 'Heute' : d === addDays(-1) ? 'Gestern' : fmtDate(d + 'T12:00:00Z', { weekday: 'long', day: 'numeric', month: 'long' })
  const exportCsv = () => downloadCsv(`Protokoll ${addDays(-Number(span) + 1)} bis ${isoDay()}`, list.map(l => ({ Zeit: `${fmtDate(l.at, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${fmtTime(l.at)}`, Person: subject(l), Bereich: AREA[l.entity] ?? l.entity, Was: sentence(l, staff), Studios: l.branch_ids.map(bname).join(', '), Details: l.changes ? JSON.stringify(l.changes) : '' })))
  return <div>
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <Seg value={span} onChange={setSpan} items={[['1', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage'], ['365', '12 Monate']]} />
      <Select className="w-44" tone="stone" value={area} onChange={setArea} options={[{ value: '', label: 'Alle Bereiche' }, ...[...new Set(Object.values(AREA))].sort().map(a => ({ value: a, label: a }))]} />
      <Select className="w-52" tone="stone" value={who} onChange={setWho} options={[{ value: '', label: 'Alle Personen' }, { value: 'system', label: 'System' }, ...people.map(s => ({ value: s.id, label: `${s.first} ${s.last}`, hint: s.branch }))]} />
      {office && <Select className="w-40" tone="stone" value={studio} onChange={setStudio} options={[{ value: '', label: 'Alle Studios' }, ...branches.map(b => ({ value: b.id, label: b.name }))]} />}
      <div className="h-10 flex-1 min-w-[180px] rounded-[10px] bg-sage-50 px-3 flex items-center gap-2"><Search size={15} className="text-mute" /><input value={text} onChange={e => setText(e.target.value)} placeholder="Suchen" className="flex-1 bg-transparent outline-none text-[14px]" /></div>
      <button onClick={exportCsv} disabled={!list.length} className="text-[13px] text-olive-700 disabled:opacity-40">Als CSV</button>
    </div>
    {!rows ? <p className="text-[14px] text-mute">Lädt …</p> : !list.length ? <p className="text-[14px] text-mute">In diesem Zeitraum hat niemand etwas geändert.</p>
      : days.map(([d, ls]) => <div key={d} className="mb-6">
        <p className="rubric text-ink/70 mb-1">{dayLabel(d)}</p>
        <ul className="divide-y divide-line">{ls.map(l => { const promo = subject(l) !== (l.actor_name ?? 'System'), s = staff.find(x => x.id === (promo ? l.entity_id?.split(':')[1] : l.actor_id))
          return <li key={l.id}><button onClick={() => setSel(l)} className="w-full text-left py-2.5 flex items-center gap-3 text-[14px] hover:bg-sage-50/70 rounded-[8px] px-1">
            <span className="w-12 shrink-0 text-[12.5px] text-mute tabular-nums">{fmtTime(l.at)}</span>
            {s ? <Avatar s={s} photo={s.photo} size="w-6 h-6 text-[10px]" /> : <span className="w-6 h-6 rounded-full bg-sage-100 shrink-0" />}
            <span className="flex-1 min-w-0 truncate"><span className="font-medium">{subject(l)}</span> {sentence(l, staff)}</span>
            <span className="text-[12px] text-mute shrink-0">{AREA[l.entity] ?? l.entity}{l.branch_ids.length ? ` · ${l.branch_ids.slice(0, 2).map(bname).join(', ')}${l.branch_ids.length > 2 ? ' …' : ''}` : ''}</span>
          </button></li> })}</ul>
      </div>)}
    {sel && <Modal width={640} title={`${subject(sel)} ${sentence(sel, staff)}`} onClose={() => setSel(null)}>
      <p className="text-[13px] text-mute">{fmtDate(sel.at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, {fmtTime(sel.at)} · {AREA[sel.entity] ?? sel.entity}{sel.branch_ids.length ? ` · ${sel.branch_ids.map(bname).join(', ')}` : ''}</p>
      {sel.changes && Object.keys(sel.changes).length > 0 ? <table className="tbl w-full text-[13.5px] mt-4"><thead><tr><Th>Feld</Th>{sel.action === 'update' ? <><Th>Vorher</Th><Th>Nachher</Th></> : <Th>Wert</Th>}</tr></thead>
        <tbody className="divide-y divide-line">{Object.entries(sel.changes).filter(([k]) => !HIDE.has(k)).map(([k, v]) => <tr key={k}><td className="px-4 py-2 text-mute align-top whitespace-nowrap">{FIELD[k] ?? k}</td>
          {sel.action === 'update' && Array.isArray(v) ? <><td className="px-4 py-2 align-top break-words">{show(v[0], staff, branches)}</td><td className="px-4 py-2 align-top break-words">{show(v[1], staff, branches)}</td></> : <td className="px-4 py-2 align-top break-words">{show(v, staff, branches)}</td>}</tr>)}</tbody></table>
        : <p className="mt-4 text-[13.5px] text-mute">{sel.action === 'insert' ? 'Neu angelegt.' : 'Keine weiteren Angaben.'}</p>}
    </Modal>}
  </div>
}
