import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useApp, isoDay, addDays, appliesOn, fmtDate, fmtTime } from '../store'
import { supabase } from '../lib/supabase'
import { pushState, enablePush, disablePush, testPush, type PushState } from '../lib/push'
import { downloadCsv, type Row } from '../lib/csv'
import { loadPollResults } from '../Poll'
import { toast } from '../Toast'
import { H, Seg, Select, Th, btn, btn2, real, inBranch, Section, isTest } from './kit'
import { ProtocolView } from './Protocol'
import { StudiosAdmin, DemoSwitch, MailSettings } from './Studios'
import { RoleSelect, ROLE } from './Team'
import { Avatar } from '../People'

// Einstellungen: Mitteilungen (eigene), Protokoll, Export für Filialleitung und Büro; Allgemein, Studios, System nur Büro.

type Tab = 'notify' | 'roles' | 'log' | 'export' | 'general' | 'studios' | 'system'
export function SettingsAdmin() {
  const { me } = useApp()
  const office = me.app_role === 'buero'
  const [tab, setTab] = useState<Tab>('notify')
  const tabs: [Tab, string][] = [['notify', 'Mitteilungen'], ['roles', 'Rollen'], ['log', 'Protokoll'], ['export', 'Export'], ...(office ? [['general', 'Allgemein'], ['studios', 'Studios'], ['system', 'System']] as [Tab, string][] : [])]
  return (<>
    <H info="Eigene Mitteilungen, wer welche Rechte hat, wer was geändert hat (Protokoll) und Listen zum Herunterladen. Das Büro stellt hier ausserdem Studios, E-Mail-Versand und Beispielinhalte ein.">Einstellungen</H>
    <div className="mb-6"><Seg value={tab} onChange={setTab} items={tabs} /></div>
    {tab === 'notify' && <NotifySettings />}
    {tab === 'roles' && <Roles />}
    {tab === 'log' && <ProtocolView />}
    {tab === 'export' && <Exports />}
    {tab === 'general' && office && <General />}
    {tab === 'studios' && office && <StudiosAdmin />}
    {tab === 'system' && office && <SystemLog />}
  </>)
}

/* ---------- Rollen ---------- */
// Was jede Rolle darf (gleiche Regeln wie RLS und Functions) und wer sie hat. Rolle ändern: nur das Büro.
const RIGHTS: [string, string, string, string][] = [
  ['App: Mein Tag, Aufgaben, News, Melden, Events, Aushilfe, Lernen, Marc', 'ja', 'ja', 'ja'],
  ['Kundentermine ansehen', 'alle Studios', 'alle Studios', 'alle Studios'],
  ['Performance', 'eigene Zahlen', 'Team der eigenen Studios', 'alle Studios'],
  ['Backoffice öffnen', '–', 'ja', 'ja'],
  ['Personen anlegen und deaktivieren', '–', 'eigene Studios', 'alle Studios'],
  ['Aufgaben zuweisen, Checklisten anlegen', '–', 'eigene Studios', 'alle Studios'],
  ['News, Umfragen, Quiz und Events', '–', 'eigene Studios', 'alle Studios'],
  ['Meldungen', 'eigene sehen', 'eigene Studios bearbeiten', 'alle bearbeiten'],
  ['Lektionen anlegen', '–', 'eigene Studios', 'alle Studios'],
  ['Protokoll und Export', '–', 'eigene Studios', 'alle Studios'],
  ['Kontrollfragen, Studios, E-Mail-Versand, Systemfehler', '–', '–', 'ja'],
  ['Rollen vergeben, Personen endgültig löschen', '–', '–', 'ja'],
]
function Roles() {
  const { staff, me, branches } = useApp()
  const office = me.app_role === 'buero'
  const by = (r: string) => staff.filter(s => s.active && s.app_role === r).sort((a, b) => Number(a.email.includes('+')) - Number(b.email.includes('+')) || a.first.localeCompare(b.first))
  const cell = (v: string) => <td className={`px-4 py-2.5 ${v === '–' ? 'text-mute' : 'text-ink/85'}`}>{v}</td>
  const people = (r: string) => <table className="tbl w-full text-[14px] table-fixed"><tbody className="divide-y divide-line">{by(r).map(p => <tr key={p.id}>
    <td className="px-4 py-2.5"><span className="flex items-center gap-3 min-w-0"><Avatar s={p} photo={p.photo} size="w-7 h-7 text-[11px]" /><span className="truncate">{p.first} {p.last}</span>{isTest(p) && p.email.includes('+') && <span className="text-xs text-mute">Testkonto</span>}{p.id === me.id && <span className="text-xs text-mute">du</span>}</span></td>
    <td className="px-4 w-[260px] text-mute truncate">{r === 'buero' ? p.email : [p.branch, ...(p.extra ?? []).map(b => branches.find(x => x.id === b)?.name)].filter(Boolean).join(', ')}</td>
    <td className="px-4 w-[200px]">{office && p.id !== me.id ? <RoleSelect p={p} /> : <span className="text-mute">{ROLE[p.app_role]}</span>}</td>
  </tr>)}</tbody></table>
  return (<div className="max-w-[1000px] space-y-10">
    <Section title="Was jede Rolle darf">
      <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Bereich</Th><th className="w-[170px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Mitarbeiterin</th><th className="w-[200px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Filialleitung</th><th className="w-[150px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Büro</th></tr></thead>
        <tbody className="divide-y divide-line">{RIGHTS.map(([a, m, f, b]) => <tr key={a}><td className="px-4 py-2.5">{a}</td>{cell(m)}{cell(f)}{cell(b)}</tr>)}</tbody></table>
    </Section>
    <Section title="Büro" count={by('buero').length}>{people('buero')}</Section>
    <Section title="Filialleitung" count={by('filialleitung').length}>{people('filialleitung')}</Section>
    <p className="text-[13px] text-mute">{by('mitarbeiterin').length} Personen haben die Rolle Mitarbeiterin.{office ? ' Ändern lässt sich die Rolle auch auf der Personenseite unter Team.' : ' Rollen vergibt das Büro.'}</p>
  </div>)
}

/* ---------- Mitteilungen ---------- */
// Gleiche Standards wie in der Function notify
const PREFS: { key: string; label: string; hint: string; def: { filialleitung: boolean; buero: boolean } }[] = [
  { key: 'lead_tickets', label: 'Neue Meldung', hint: 'Wenn jemand in deinem Studio etwas meldet (Schaden, Anliegen).', def: { filialleitung: true, buero: true } },
  { key: 'lead_ideas', label: 'Neue Idee', hint: 'Wenn jemand eine Idee einreicht.', def: { filialleitung: false, buero: true } },
  { key: 'lead_standby', label: 'Zusage auf Aushilfe-Anfrage', hint: 'Wenn jemand auf deine Anfrage „Ich kann“ antwortet.', def: { filialleitung: true, buero: true } },
  { key: 'lead_events', label: 'Anmeldeschluss erreicht', hint: 'Bei deinen Terminen: wie viele kommen, absagen und nicht geantwortet haben.', def: { filialleitung: true, buero: true } },
  { key: 'lead_overdue', label: 'Checkliste überfällig', hint: '30 Minuten nach der letzten Fälligkeit, wenn noch etwas offen ist. Einmal je Liste und Tag.', def: { filialleitung: true, buero: false } },
]
function NotifySettings() {
  const { me } = useApp()
  const role = me.app_role as 'filialleitung' | 'buero'
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)
  const [push, setPush] = useState<PushState | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase!.from('employees').select('notify_prefs').eq('id', me.id).maybeSingle().then(({ data }) => setPrefs((data?.notify_prefs ?? {}) as Record<string, boolean>))
    pushState().then(setPush)
  }, [me.id])
  const val = (k: string) => typeof prefs?.[k] === 'boolean' ? prefs[k] : PREFS.find(p => p.key === k)!.def[role] ?? false
  const toggle = async (k: string) => {
    const next = { ...(prefs ?? {}), [k]: !val(k) }
    setPrefs(next)
    const { error } = await supabase!.rpc('set_notify_prefs', { p: next })
    if (error) { toast('Speichern hat nicht geklappt', 'error'); setPrefs(prefs) }
  }
  const pushText: Record<PushState, string> = { on: 'An auf diesem Gerät', off: 'Aus auf diesem Gerät', denied: 'Im Browser blockiert. In den Website-Einstellungen erlauben.', unsupported: 'Dieser Browser kann keine Mitteilungen.', 'needs-install': 'Am iPhone nur als App auf dem Home-Bildschirm.' }
  return <div className="max-w-[720px]">
    <div className="flex items-start justify-between gap-6 pb-5 border-b border-line">
      <div><p className="font-medium text-[15px]">Mitteilungen an diesem Gerät</p><p className="text-[13px] text-mute mt-1 inline-flex items-center gap-2"><span className={`w-[7px] h-[7px] rounded-full ${push === 'on' ? 'bg-ok' : 'bg-sage-400'}`} />{push ? pushText[push] : '…'}</p></div>
      <div className="flex gap-2 shrink-0">
        {push === 'on' && <button onClick={async () => { await testPush(); toast('Probe gesendet') }} className={btn2}>Probe</button>}
        {(push === 'on' || push === 'off') && <button disabled={busy} onClick={async () => { setBusy(true); if (push === 'on') { await disablePush(); setPush('off') } else setPush(await enablePush(me.id)); setBusy(false) }} className={push === 'on' ? btn2 : btn}>{push === 'on' ? 'Ausschalten' : 'Einschalten'}</button>}
      </div>
    </div>
    <p className="rubric text-ink/70 mt-6 mb-1">Als {role === 'buero' ? 'Büro' : 'Filialleitung'} möchte ich erfahren</p>
    <ul className="divide-y divide-line">{PREFS.map(p => <li key={p.key} className="py-3.5 flex items-center justify-between gap-6">
      <div><p className="text-[14.5px]">{p.label}</p><p className="text-[12.5px] text-mute mt-0.5">{p.hint}</p></div>
      <button role="switch" aria-checked={val(p.key)} aria-label={p.label} disabled={!prefs} onClick={() => toggle(p.key)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition disabled:opacity-50 ${val(p.key) ? 'bg-olive-700' : 'bg-sage-200'}`}><span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${val(p.key) ? 'left-[23px]' : 'left-[3px]'}`} /></button>
    </li>)}</ul>
    <p className="text-[12.5px] text-mute mt-3">Mitteilungen an das ganze Team (News, Termine, Aufgaben, Aushilfe) laufen unabhängig davon.</p>
  </div>
}

/* ---------- Export ---------- */
// Monate in Zürcher Zeit (toISOString rechnet in UTC und springt kurz nach Mitternacht in den Vormonat)
const months = () => { const [y, m] = isoDay().split('-').map(Number); return Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 15)); return d.toISOString().slice(0, 7) }) }
const monthName = (m: string) => new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric' }).format(new Date(m + '-15T12:00:00Z'))
function Exports() {
  const { me, branches, templates, events, news, newsReads, registrations, staff, polls } = useApp()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])]
  const studios = branches.filter(b => !b.is_office && (office || mine.includes(b.id)))
  const inScope = (s: { branch_id: string; extra?: string[] }) => office || mine.some(b => inBranch(s as never, b))
  const [b, setB] = useState(studios[0]?.id ?? ''), [m, setM] = useState(months()[0])
  const [ev, setEv] = useState(events[0]?.id ?? ''), [nw, setNw] = useState(news.find(n => n.mustRead)?.id ?? news[0]?.id ?? ''), [pl, setPl] = useState(polls[0]?.id ?? '')
  const [busy, setBusy] = useState('')
  const bname = (id: string) => branches.find(x => x.id === id)?.name ?? id

  // Aufgaben-Nachweis eines Monats: jede fällige Aufgabe je Tag, erledigt (wer, wann, Foto) oder offen
  const tasks = async () => {
    setBusy('tasks')
    const from = m + '-01', last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10), to = last < isoDay() ? last : isoDay()
    const { data } = await supabase!.from('task_completions').select('item_id, day, done_by_name, done_at, photo_path').eq('branch_id', b).gte('day', from).lte('day', to)
    const rows: Row[] = []
    for (let d = from; d <= to; d = addDays(1, d)) for (const t of templates.filter(x => x.active && !x.proposed && appliesOn(x, d, b))) for (const it of t.items) {
      const c = (data ?? []).find(x => x.item_id === it.id && x.day === d)
      rows.push({ Datum: fmtDate(d + 'T12:00:00Z', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }), Liste: t.name, Aufgabe: it.title, 'Fällig um': it.time, Status: c ? 'erledigt' : 'offen', 'Erledigt von': c?.done_by_name ?? '', Uhrzeit: c ? fmtTime(c.done_at) : '', Fotonachweis: c?.photo_path ? 'ja' : it.proof ? 'fehlt' : '' })
    }
    downloadCsv(`Aufgaben ${bname(b)} ${monthName(m)}`, rows); setBusy('')
  }
  const participants = () => {
    const e = events.find(x => x.id === ev); if (!e) return
    const aud = staff.filter(s => real(s) && s.branch_id !== 'buero' && inScope(s) && (e.audienceBranches.length === 0 || e.audienceBranches.some(x => inBranch(s, x))) && (e.audienceSkills.length === 0 || s.skills.some(k => e.audienceSkills.includes(k))))
    const regs = registrations.filter(r => r.event_id === e.id)
    const ids = new Set([...aud.map(s => s.id), ...regs.map(r => r.employee_id)])
    downloadCsv(`Teilnehmende ${e.title} ${isoDay(new Date(e.startsAt))}`, [...ids].map(id => { const s = staff.find(x => x.id === id), r = regs.find(x => x.employee_id === id)
      return { Name: s ? `${s.first} ${s.last}` : id, Studio: s?.branch ?? '', Funktion: s?.role ?? '', Antwort: !r ? 'keine Antwort' : !r.coming ? 'kommt nicht' : r.waitlist ? 'Warteliste' : 'kommt' } }).sort((a, z) => String(a.Antwort).localeCompare(String(z.Antwort))))
  }
  const reads = () => {
    const n = news.find(x => x.id === nw); if (!n) return
    const aud = staff.filter(s => real(s) && inScope(s) && (n.audiencePeople.length ? n.audiencePeople.includes(s.id) : (n.audienceBranches.length === 0 || n.audienceBranches.some(x => inBranch(s, x)))))
    downloadCsv(`Lesebestätigungen ${n.title}`, aud.map(s => { const r = newsReads.find(x => x.news_id === n.id && x.employee_id === s.id)
      return { Name: `${s.first} ${s.last}`, Studio: s.branch, Geöffnet: r ? 'ja' : 'nein', Bestätigt: r?.confirmed_at ? `${fmtDate(r.confirmed_at, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${fmtTime(r.confirmed_at)}` : '' } }))
  }
  const poll = async () => {
    const p = polls.find(x => x.id === pl); if (!p) return
    setBusy('poll')
    const r = await loadPollResults(p.id); setBusy('')
    if (!r) { toast('Ergebnisse nicht verfügbar', 'error'); return }
    const rows: Row[] = r.questions.flatMap(q => q.answers.map(a => ({ Frage: q.prompt, Antwort: Array.isArray(a.value) ? a.value.map(i => q.options[i]).join(', ') : q.kind === 'single' ? q.options[Number(a.value)] : String(a.value), Name: a.name ?? (p.anonymous ? 'anonym' : ''), Studio: a.branch ? bname(a.branch) : '' })))
    downloadCsv(`Umfrage ${news.find(n => n.id === p.newsId)?.title ?? ''}`, rows)
  }
  const team = () => downloadCsv(`Team ${isoDay()}`, staff.filter(s => s.active && inScope(s)).map(s => ({ Vorname: s.first, Nachname: s.last, Funktion: s.role, Studio: s.branch, Zusatzstudios: (s.extra ?? []).map(bname).join(', '), 'E-Mail': s.email, Telefon: s.phone ?? '', Skills: s.skills.join(', '), Rechte: s.app_role, 'App installiert': !!s.appInstalled, Mitteilungen: !!s.pushEnabled })))
  const myNews = news.filter(n => office || n.authorId === me.id || n.audienceBranches.length === 0 || n.audienceBranches.some(x => mine.includes(x)))
  const myEvents = events.filter(e => office || e.audienceBranches.length === 0 || e.audienceBranches.some(x => mine.includes(x)))
  const myPolls = polls.filter(p => myNews.some(n => n.id === p.newsId))
  const card = (title: string, hint: string, controls: React.ReactNode, run: () => void, key: string, disabled = false) =>
    <div className="py-5 border-b border-line grid grid-cols-[1fr_auto] gap-6 items-center">
      <div><p className="font-medium text-[15px]">{title}</p><p className="text-[12.5px] text-mute mt-0.5">{hint}</p><div className="mt-3 flex flex-wrap gap-2">{controls}</div></div>
      <button disabled={disabled || busy === key} onClick={run} className={`${btn} flex items-center gap-2`}><Download size={15} />{busy === key ? 'Erstellt …' : 'CSV'}</button>
    </div>
  return <div className="max-w-[860px]">
    <p className="text-[13px] text-mute mb-2">Dateien öffnen sich in Excel. {office ? '' : 'Du bekommst nur Daten deines Studios.'}</p>
    {card('Aufgaben-Nachweis', 'Jede fällige Aufgabe je Tag: erledigt von wem und wann, Fotonachweis, oder offen. Für Hygiene- und Qualitätskontrollen.',
      <>{studios.length > 1 && <Select className="w-40" tone="stone" value={b} onChange={setB} options={studios.map(x => ({ value: x.id, label: x.name }))} />}<Select className="w-48" tone="stone" value={m} onChange={setM} options={months().map(x => ({ value: x, label: monthName(x) }))} /></>, tasks, 'tasks', !b)}
    {card('Teilnehmende eines Termins', 'Wer kommt, wer nicht, wer auf der Warteliste steht und wer nicht geantwortet hat.',
      <Select className="w-80" tone="stone" value={ev} onChange={setEv} placeholder="Termin wählen" options={myEvents.map(e => ({ value: e.id, label: e.title, hint: fmtDate(e.startsAt, { day: '2-digit', month: '2-digit', year: 'numeric' }) }))} />, participants, 'ev', !ev)}
    {card('Lesebestätigungen einer News', 'Wer geöffnet und wer bestätigt hat, mit Zeitpunkt.',
      <Select className="w-80" tone="stone" value={nw} onChange={setNw} placeholder="News wählen" options={myNews.map(n => ({ value: n.id, label: n.title, hint: `${n.date}${n.mustRead ? ' · Pflicht' : ''}` }))} />, reads, 'news', !nw)}
    {card('Umfrage-Ergebnisse', 'Alle Antworten, bei nicht anonymen Umfragen mit Namen.',
      myPolls.length ? <Select className="w-80" tone="stone" value={pl} onChange={setPl} options={myPolls.map(p => ({ value: p.id, label: news.find(n => n.id === p.newsId)?.title ?? 'Umfrage' }))} /> : <span className="text-[13px] text-mute">Noch keine Umfragen.</span>, poll, 'poll', !myPolls.length)}
    {card('Team-Liste', 'Name, Funktion, Studio, Kontakt, Skills, Rechte, App installiert, Mitteilungen.', null, team, 'team')}
  </div>
}

/* ---------- Allgemein (Büro) ---------- */
function General() {
  const [days, setDays] = useState<string>('365')
  useEffect(() => { supabase!.from('app_settings').select('value').eq('key', 'audit_days').maybeSingle().then(({ data }) => setDays(String(data?.value ?? 365))) }, [])
  const save = async (v: string) => { setDays(v); const { error } = await supabase!.from('app_settings').upsert({ key: 'audit_days', value: Number(v), updated_at: new Date().toISOString() }); toast(error ? 'Speichern hat nicht geklappt' : 'Gespeichert', error ? 'error' : 'ok') }
  return <div className="max-w-[860px]">
    <DemoSwitch />
    <div className="py-6 border-b border-line flex items-start justify-between gap-6">
      <div><p className="rubric text-ink/70">Protokoll aufbewahren</p><p className="text-[14px] mt-3">Ältere Einträge werden jede Nacht gelöscht.</p><p className="text-xs text-mute mt-1">Fehler der App bleiben 90 Tage.</p></div>
      <Select className="w-44" tone="stone" value={days} onChange={save} options={[['90', '3 Monate'], ['180', '6 Monate'], ['365', '12 Monate'], ['730', '2 Jahre']].map(([v, l]) => ({ value: v, label: l }))} />
    </div>
    <MailSettings />
  </div>
}

/* ---------- System (Büro): Fehler der App, Zugriffe auf Kundendaten ---------- */
type Err = { id: number; at: string; employee_id: string | null; message: string; url: string; ua: string; version: string; stack: string }
type Lookup = { id: number; at: string; employee_id: string; action: string; query: string | null; client_id: string | null; result_count: number | null }
function SystemLog() {
  const { staff } = useApp()
  const [errs, setErrs] = useState<Err[] | null>(null), [looks, setLooks] = useState<Lookup[] | null>(null), [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    supabase!.from('client_errors').select('*').order('at', { ascending: false }).limit(60).then(({ data }) => setErrs((data ?? []) as Err[]))
    supabase!.from('client_lookups').select('*').order('at', { ascending: false }).limit(150).then(({ data }) => setLooks((data ?? []) as Lookup[]))
  }, [])
  const name = (id: string | null) => { const s = staff.find(x => x.id === id); return s ? `${s.first} ${s.last}` : '–' }
  const when = (s: string) => `${fmtDate(s, { day: '2-digit', month: '2-digit' })} ${fmtTime(s)}`
  const kind: Record<string, string> = { search: 'Suche', history: 'Historie geöffnet', summary: 'Zusammenfassung' }
  const perPerson = useMemo(() => { const m = new Map<string, number>(); for (const l of looks ?? []) if (l.at >= addDays(-30)) m.set(l.employee_id, (m.get(l.employee_id) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]) }, [looks])
  return <div className="grid grid-cols-2 gap-10">
    <div><p className="rubric text-ink/70 mb-2">Fehler in der App</p>
      {!errs ? <p className="text-[14px] text-mute">Lädt …</p> : !errs.length ? <p className="text-[14px] text-mute">Keine Fehler gemeldet.</p>
        : <ul className="divide-y divide-line">{errs.map(e => <li key={e.id}><button onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full text-left py-2.5 text-[13.5px]">
          <span className="flex justify-between gap-3"><span className="truncate">{e.message}</span><span className="text-mute shrink-0">{when(e.at)}</span></span>
          <span className="block text-[12px] text-mute">{name(e.employee_id)} · {e.url}</span>
          {open === e.id && <pre className="mt-2 text-[11px] whitespace-pre-wrap break-all bg-sage-50 rounded-[8px] p-2 max-h-48 overflow-auto">{e.stack || 'kein Stack'}{'\n'}{e.ua} · {e.version}</pre>}
        </button></li>)}</ul>}
    </div>
    <div><p className="rubric text-ink/70 mb-2">Zugriffe auf Kundendaten</p>
      <p className="text-[12.5px] text-mute mb-3">Jede Kundensuche und jede geöffnete Kundenhistorie wird protokolliert (Datenschutz).</p>
      {perPerson.length > 0 && <p className="text-[13px] mb-3">Letzte 30 Tage: {perPerson.slice(0, 5).map(([id, n]) => `${name(id)} ${n}`).join(' · ')}</p>}
      {!looks ? <p className="text-[14px] text-mute">Lädt …</p> : <table className="tbl w-full text-[13px]"><thead><tr><Th>Zeit</Th><Th>Person</Th><Th>Was</Th><Th>Treffer</Th></tr></thead>
        <tbody className="divide-y divide-line">{looks.slice(0, 80).map(l => <tr key={l.id}><td className="px-4 py-2 text-mute whitespace-nowrap">{when(l.at)}</td><td className="px-4">{name(l.employee_id)}</td>
          <td className="px-4 text-mute truncate max-w-[220px]">{kind[l.action] ?? l.action}{l.query ? ` · ${l.query}` : ''}</td><td className="px-4 text-mute">{l.result_count ?? '–'}</td></tr>)}</tbody></table>}
    </div>
  </div>
}
