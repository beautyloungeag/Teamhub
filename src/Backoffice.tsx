import { useRef, useState, type ReactNode } from 'react'
import { LayoutDashboard, Newspaper, ListChecks, Lightbulb, CalendarDays, Users, BookOpen, Sparkles, Plus, Check, Camera, Search, CalendarClock, Send, X } from 'lucide-react'
import { Terminbuch } from './Calendar'
import { useApp } from './store'
import { STAFF } from './staff'
import { NEWS, TASK_TEMPLATES, BRANCH_PROGRESS, EVENTS, WIKI, ASSIGNEES, BRANCHES, SKILL_CATALOG } from './data'
import { Status } from './Mobile'

type View = 'overview' | 'book' | 'news' | 'tasks' | 'tickets' | 'events' | 'team' | 'wiki'
const NAV: [View, string, typeof Users][] = [['overview', 'Übersicht', LayoutDashboard], ['book', 'Kundentermine', CalendarClock], ['news', 'News', Newspaper], ['tasks', 'Aufgaben', ListChecks], ['tickets', 'Meldungen & Ideen', Lightbulb], ['events', 'Schulungen & Events', CalendarDays], ['team', 'Team & Skills', Users], ['wiki', 'Wissen', BookOpen]]

// Lesestatus der Pflicht-News: fest verteilte Beispielwerte, Bea über den echten Klick.
const readers = (id: number, meRead: boolean) => STAFF.map((s, i) => ({ s, ok: s.first === 'Bea' ? meRead : (i * 7 + id) % 10 < 6 }))

export default function Backoffice() {
  const [v, setV] = useState<View>('overview')
  const [ai, setAi] = useState(false)
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null)
  return (
    <div className="flex h-full bg-white rounded-[20px] overflow-hidden border border-sage-200">
      <aside className="w-60 shrink-0 bg-sage-50 p-4 flex flex-col">
        <div className="flex items-center gap-2.5 px-2 py-2"><span className="w-9 h-9 rounded-xl bg-sage-400 text-white flex items-center justify-center font-semibold">bl</span><div><p className="font-semibold leading-tight">TeamHub</p><p className="text-xs text-mute">Backoffice</p></div></div>
        <nav className="mt-6 space-y-0.5">
          {NAV.map(([k, l, I]) => <button key={k} onClick={() => setV(k)} className={`w-full h-10 px-3 rounded-xl flex items-center gap-3 text-[14px] ${v === k ? 'bg-white text-ink font-medium' : 'text-sage-800 hover:bg-white/60'}`}><I size={18} />{l}</button>)}
        </nav>
        <button onClick={() => setAi(!ai)} className={`mt-auto h-11 rounded-xl flex items-center justify-center gap-2 text-[14px] font-medium ${ai ? 'bg-sage-800 text-white' : 'bg-ink text-white'}`}><Sparkles size={17} />Benni fragen</button>
      </aside>
      <main className={`flex-1 no-scrollbar p-8 ${v === 'book' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {v === 'book' && <><H>Kundentermine</H><div className="flex-1 min-h-0"><Terminbuch /></div></>}
        {v === 'overview' && <Overview go={setV} />}{v === 'news' && <NewsAdmin draft={draft} />}{v === 'tasks' && <TasksAdmin />}
        {v === 'tickets' && <TicketsAdmin />}{v === 'events' && <EventsAdmin />}{v === 'team' && <TeamAdmin />}{v === 'wiki' && <WikiAdmin />}
      </main>
      {ai && <AdminChat onClose={() => setAi(false)} onDraft={d => { setDraft(d); setV('news') }} go={setV} />}
    </div>
  )
}

const H = ({ children, action }: { children: ReactNode; action?: ReactNode }) => <div className="flex items-center justify-between mb-6"><h1 className="text-[26px] font-semibold tracking-tight">{children}</h1>{action}</div>
const Box = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`rounded-2xl border border-sage-100 ${className}`}>{children}</div>
const New = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button onClick={onClick} className="h-10 px-4 rounded-xl bg-ink text-white text-[14px] flex items-center gap-1.5"><Plus size={16} />{children}</button>
const Th = ({ children }: { children: ReactNode }) => <th className="text-left font-normal text-xs text-mute px-4 py-3">{children}</th>
const Bar = ({ p }: { p: number }) => <div className="h-1.5 w-full rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-sage-600 rounded-full" style={{ width: p + '%' }} /></div>

function Overview({ go }: { go: (v: View) => void }) {
  const { read, tickets } = useApp()
  const r = readers(1, read.has(1)); const pct = Math.round(r.filter(x => x.ok).length / r.length * 100)
  const open = tickets.filter(t => t.status !== 'Erledigt')
  const tasks = Math.round(BRANCH_PROGRESS.reduce((a, b) => a + b.done / b.total, 0) / BRANCH_PROGRESS.length * 100)
  const kpis: [string, string, string, View][] = [['Pflicht-News gelesen', pct + ' %', 'Hygienerichtlinie', 'news'], ['Tagesaufgaben', tasks + ' %', 'alle Studios heute', 'tasks'], ['Offene Meldungen', String(open.length), `${open.filter(t => t.status === 'Neu').length} ohne Zuweisung`, 'tickets'], ['Nächste Schulung', '05.10.', '5 von 8 Plätzen', 'events']]
  return (<>
    <H>Guten Morgen, Renée</H>
    <div className="grid grid-cols-4 gap-4">{kpis.map(([l, n, s, to]) => <button key={l} onClick={() => go(to)} className="text-left"><Box className="p-5 hover:border-sage-400 transition"><p className="text-xs text-mute">{l}</p><p className="text-[30px] font-semibold mt-1">{n}</p><p className="text-xs text-mute">{s}</p></Box></button>)}</div>
    <div className="grid grid-cols-2 gap-4 mt-4">
      <Box className="p-5"><p className="font-medium mb-4">Tagesaufgaben je Studio</p><div className="space-y-3">{BRANCH_PROGRESS.map(b => <div key={b.branch} className="grid grid-cols-[90px_1fr_40px] items-center gap-3 text-[14px]"><span>{b.branch}</span><Bar p={b.done / b.total * 100} /><span className="text-right text-mute">{b.done}/{b.total}</span></div>)}</div></Box>
      <Box className="p-5"><p className="font-medium mb-3">Neueste Meldungen</p><div className="divide-y divide-sage-50">{tickets.slice(0, 4).map(t => <div key={t.id} className="py-2.5 flex justify-between gap-3 text-[14px]"><span className="truncate">{t.title}{t.viaAI && <Sparkles size={12} className="inline ml-1.5 text-sage-600" />}</span><span className="text-xs shrink-0"><Status s={t.status} /></span></div>)}</div></Box>
    </div>
  </>)
}

function NewsAdmin({ draft }: { draft: { title: string; body: string } | null }) {
  const { read } = useApp()
  const [sel, setSel] = useState(1), [compose, setCompose] = useState(!!draft)
  const n = NEWS.find(x => x.id === sel)!
  const r = readers(n.id, read.has(n.id))
  return (<>
    <H action={<New onClick={() => setCompose(!compose)}>Neue News</New>}>News</H>
    {compose && <Box className="p-5 mb-6 grid grid-cols-[1fr_260px] gap-6">
      <div><input key={draft?.title} defaultValue={draft?.title} placeholder="Titel" className="w-full text-[20px] font-medium outline-none" /><textarea key={draft?.body} defaultValue={draft?.body} rows={5} placeholder="Text, Bilder oder Video einfügen …" className="mt-3 w-full resize-none outline-none text-[15px]" /></div>
      <div className="space-y-3 text-[14px]">
        {[['Zielgruppe', 'Alle Studios'], ['Veröffentlichen', 'Sofort'], ['Lesebestätigung', 'Pflicht'], ['Auch ins Wissen', 'Hygiene']].map(([a, b]) => <div key={a}><p className="text-xs text-mute mb-1">{a}</p><div className="h-10 rounded-xl border border-sage-200 px-3 flex items-center">{b}</div></div>)}
        <button className="w-full h-10 rounded-xl bg-ink text-white">Veröffentlichen</button>
      </div>
    </Box>}
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <Box><table className="w-full text-[14px]"><thead><tr><Th>Titel</Th><Th>Zielgruppe</Th><Th>Datum</Th><Th>Gelesen</Th></tr></thead>
        <tbody className="divide-y divide-sage-50">{NEWS.map(x => { const rr = readers(x.id, read.has(x.id)); const p = x.mustRead ? Math.round(rr.filter(y => y.ok).length / rr.length * 100) : null
          return <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${sel === x.id ? 'bg-sage-50' : ''}`}><td className="px-4 py-3">{x.title}{x.mustRead && <span className="ml-2 text-xs text-[#C0634B]">Pflicht</span>}</td><td className="px-4 text-mute">{x.audience}</td><td className="px-4 text-mute">{x.date}</td><td className="px-4 w-32">{p !== null ? <div className="flex items-center gap-2"><Bar p={p} /><span className="text-xs text-mute">{p}%</span></div> : <span className="text-xs text-mute">–</span>}</td></tr>
        })}</tbody></table></Box>
      <Box className="p-4"><p className="font-medium">{n.title}</p><p className="text-xs text-mute mt-1">{n.mustRead ? `${r.filter(x => x.ok).length} von ${r.length} bestätigt` : 'Ohne Lesebestätigung'}</p>
        {n.mustRead && <div className="mt-3 max-h-[420px] overflow-y-auto no-scrollbar divide-y divide-sage-50">{r.map(({ s, ok }) => <div key={s.id} className="py-2 flex items-center justify-between text-[13px]"><span>{s.first} {s.last} <span className="text-mute">· {s.branch}</span></span>{ok ? <Check size={15} className="text-sage-600" /> : <span className="text-xs text-[#C0634B]">offen</span>}</div>)}</div>}
      </Box>
    </div>
  </>)
}

function TasksAdmin() {
  return (<>
    <H action={<New>Neue Vorlage</New>}>Aufgaben</H>
    <div className="grid grid-cols-2 gap-4">
      <Box><p className="font-medium px-4 pt-4">Vorlagen</p><table className="w-full text-[14px]"><thead><tr><Th>Name</Th><Th>Punkte</Th><Th>Wiederholung</Th><Th>Gilt für</Th></tr></thead>
        <tbody className="divide-y divide-sage-50">{TASK_TEMPLATES.map(t => <tr key={t.name}><td className="px-4 py-3">{t.name}</td><td className="px-4 text-mute">{t.items}</td><td className="px-4 text-mute">{t.repeat}</td><td className="px-4 text-mute">{t.branches}</td></tr>)}</tbody></table></Box>
      <Box className="p-4"><p className="font-medium mb-4">Heute je Studio</p><div className="space-y-3">{BRANCH_PROGRESS.map(b => <div key={b.branch} className="grid grid-cols-[90px_1fr_40px] items-center gap-3 text-[14px]"><span>{b.branch}</span><Bar p={b.done / b.total * 100} /><span className="text-right text-mute">{b.done}/{b.total}</span></div>)}</div>
        <p className="mt-5 text-xs text-mute flex items-center gap-1.5"><Camera size={13} />Fotonachweise mit Person und Uhrzeit bleiben 12 Monate abrufbar.</p></Box>
    </div>
  </>)
}

function TicketsAdmin() {
  const { tickets, assign, setStatus } = useApp()
  const [f, setF] = useState<'Alle' | 'Meldung' | 'Idee'>('Alle')
  return (<>
    <H action={<div className="flex gap-1 p-1 rounded-xl bg-sage-50">{(['Alle', 'Meldung', 'Idee'] as const).map(k => <button key={k} onClick={() => setF(k)} className={`h-8 px-3 rounded-lg text-[13px] ${f === k ? 'bg-white font-medium' : 'text-sage-800'}`}>{k}</button>)}</div>}>Meldungen & Ideen</H>
    <Box><table className="w-full text-[14px]"><thead><tr><Th>Art</Th><Th>Titel</Th><Th>Studio</Th><Th>Von</Th><Th>Zuständig</Th><Th>Status</Th></tr></thead>
      <tbody className="divide-y divide-sage-50">{tickets.filter(t => f === 'Alle' || t.kind === f).map(t => (
        <tr key={t.id}><td className="px-4 py-3 text-mute">{t.kind}</td>
          <td className="px-4">{t.title}<span className="ml-2 inline-flex gap-1.5 text-mute align-middle">{t.photo && <Camera size={13} />}{t.viaAI && <Sparkles size={13} className="text-sage-600" />}</span><p className="text-xs text-mute">{t.when}</p></td>
          <td className="px-4 text-mute">{t.branch}</td><td className="px-4 text-mute">{t.who}</td>
          <td className="px-4"><select value={t.assignee ?? ''} onChange={e => assign(t.id, e.target.value)} className="h-9 rounded-lg border border-sage-200 px-2 bg-white text-[13px]"><option value="">Zuweisen …</option>{ASSIGNEES.map(a => <option key={a}>{a}</option>)}</select></td>
          <td className="px-4"><select value={t.status} onChange={e => setStatus(t.id, e.target.value as typeof t.status)} className="h-9 rounded-lg border border-sage-200 px-2 bg-white text-[13px]">{['Neu', 'Zugewiesen', 'In Arbeit', 'Erledigt'].map(s => <option key={s}>{s}</option>)}</select></td></tr>
      ))}</tbody></table></Box>
    <p className="mt-3 text-xs text-mute">Meldungen gehen zusätzlich sofort per E-Mail an die Facility. Die Meldende sieht jeden Statuswechsel in der App.</p>
  </>)
}

function EventsAdmin() {
  const { joined } = useApp()
  const [sel, setSel] = useState(1)
  const e = EVENTS.find(x => x.id === sel)!
  const people = [...e.people, ...(joined.has(e.id) ? ['Bea M.'] : [])]
  return (<>
    <H action={<New>Neue Schulung</New>}>Schulungen & Events</H>
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <Box><table className="w-full text-[14px]"><thead><tr><Th>Termin</Th><Th>Datum</Th><Th>Zielgruppe</Th><Th>Plätze</Th></tr></thead>
        <tbody className="divide-y divide-sage-50">{EVENTS.map(x => <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${sel === x.id ? 'bg-sage-50' : ''}`}><td className="px-4 py-3">{x.title}<p className="text-xs text-mute">{x.deadline}</p></td><td className="px-4 text-mute">{x.date}, {x.time}</td><td className="px-4 text-mute">{x.audience}</td><td className="px-4 text-mute">{x.taken + (joined.has(x.id) ? 1 : 0)}/{x.seats}</td></tr>)}</tbody></table></Box>
      <Box className="p-4"><p className="font-medium">{e.title}</p><p className="text-xs text-mute mt-1">{people.length} Anmeldungen · {e.place}</p>
        <div className="mt-3 divide-y divide-sage-50">{people.map(p => <p key={p} className="py-2 text-[13px]">{p}</p>)}</div>
        <button className="mt-4 w-full h-10 rounded-xl border border-sage-200 text-[14px]">Erinnerung an Zielgruppe senden</button></Box>
    </div>
  </>)
}

function TeamAdmin() {
  const [q, setQ] = useState(''), [b, setB] = useState('Alle')
  const list = STAFF.filter(s => (b === 'Alle' || s.branch === b) && `${s.first} ${s.last} ${s.role} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  return (<>
    <H action={<New>Person anlegen</New>}>Team & Skills</H>
    <div className="flex gap-3 mb-4"><div className="h-10 flex-1 rounded-xl border border-sage-200 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, Rolle oder Skill" className="flex-1 outline-none text-[14px]" /></div>
      <select value={b} onChange={e => setB(e.target.value)} className="h-10 rounded-xl border border-sage-200 px-3 text-[14px] bg-white">{['Alle', ...BRANCHES].map(x => <option key={x}>{x}</option>)}</select></div>
    <div className="grid grid-cols-[1fr_260px] gap-4">
      <Box><table className="w-full text-[14px]"><thead><tr><Th>Name</Th><Th>Rolle</Th><Th>Studio</Th><Th>Skills</Th></tr></thead>
        <tbody className="divide-y divide-sage-50">{list.map(s => <tr key={s.id}><td className="px-4 py-2.5">{s.first} {s.last}</td><td className="px-4 text-mute">{s.role}</td><td className="px-4 text-mute">{s.branch}</td><td className="px-4 text-mute text-[13px]">{s.skills.join(', ')}</td></tr>)}</tbody></table></Box>
      <Box className="p-4 self-start"><p className="font-medium">Skill-Katalog</p><p className="text-xs text-mute mt-1">Mitarbeiterinnen wählen daraus.</p><div className="mt-3 flex flex-wrap gap-1.5">{SKILL_CATALOG.map(k => <span key={k} className="px-2.5 h-7 rounded-full bg-sage-50 text-[12px] flex items-center">{k}</span>)}</div></Box>
    </div>
  </>)
}

function WikiAdmin() {
  return (<>
    <H action={<New>Neuer Artikel</New>}>Wissen</H>
    <Box><table className="w-full text-[14px]"><thead><tr><Th>Artikel</Th><Th>Kategorie</Th><Th>Medien</Th><Th>Aktualisiert</Th></tr></thead>
      <tbody className="divide-y divide-sage-50">{WIKI.map(a => <tr key={a.id}><td className="px-4 py-3">{a.title}</td><td className="px-4 text-mute">{a.cat}</td><td className="px-4 text-mute">{a.video ? 'Video' : 'Foto'}</td><td className="px-4 text-mute">{a.updated}</td></tr>)}</tbody></table></Box>
    <p className="mt-3 text-xs text-mute">Artikel in Deutsch, Englisch und Französisch. Benni beantwortet Fragen nur aus freigegebenen Artikeln.</p>
  </>)
}

/* ---------- Benni im Backoffice ---------- */
type M = { me: boolean; t: string; card?: ReactNode }
function AdminChat({ onClose, onDraft, go }: { onClose: () => void; onDraft: (d: { title: string; body: string }) => void; go: (v: View) => void }) {
  const { read, tickets, assign } = useApp()
  const [msgs, setMsgs] = useState<M[]>([]), [v, setV] = useState(''), [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const ideas = ['Schreib eine News zur neuen Hygieneregel', 'Wer hat die Hygienerichtlinie noch nicht bestätigt?', 'Welche Meldungen sind noch offen?', 'Wie ausgelastet ist Basel 1 heute?']
  const answer = (q: string): M => {
    const s = q.toLowerCase()
    if (/news|schreib|entwurf/.test(s)) {
      const d = { title: 'Neue Hygienerichtlinie ab 1. Oktober', body: 'Liebes Team, ab dem 1. Oktober desinfizieren wir Liegen und Kopfstützen nach jeder Behandlung, nicht mehr stündlich. Die Checkliste in euren Tagesaufgaben ist schon angepasst. Bitte lest die Richtlinie im Wissen und bestätigt kurz.' }
      return { me: false, t: 'Hier ein Entwurf. Zielgruppe: alle Studios, mit Lesebestätigung.', card: <div className="mt-2 rounded-xl bg-sage-50 p-3"><p className="text-[13px] font-medium">{d.title}</p><p className="text-[13px] text-mute mt-1">{d.body}</p><button onClick={() => onDraft(d)} className="mt-2.5 h-8 px-3 rounded-full bg-ink text-white text-[12px]">Als Entwurf öffnen</button></div> }
    }
    if (/bestätigt|gelesen/.test(s)) {
      const open = readers(1, read.has(1)).filter(x => !x.ok)
      return { me: false, t: `${open.length} von ${STAFF.length} haben noch nicht bestätigt. Am meisten fehlen in ${['Basel 1', 'Oberwil'].join(' und ')}.`, card: <div className="mt-2 rounded-xl bg-sage-50 p-3 text-[13px]"><p>{open.slice(0, 6).map(x => `${x.s.first} ${x.s.last[0]}.`).join(', ')} …</p><button className="mt-2.5 h-8 px-3 rounded-full bg-ink text-white text-[12px]">Erinnerung an alle offenen senden</button></div> }
    }
    if (/meldung|offen|ticket/.test(s)) {
      const open = tickets.filter(t => t.status !== 'Erledigt')
      const neu = open.find(t => !t.assignee)
      return { me: false, t: `${open.length} offen, davon ${open.filter(t => !t.assignee).length} ohne Zuständige.`, card: <div className="mt-2 rounded-xl bg-sage-50 divide-y divide-white text-[13px]">{open.map(t => <p key={t.id} className="px-3 py-2">{t.title} <span className="text-mute">· {t.branch} · {t.assignee ?? 'offen'}</span></p>)}{neu && <div className="px-3 py-2"><button onClick={() => { assign(neu.id, 'Facility'); go('tickets') }} className="h-8 px-3 rounded-full bg-ink text-white text-[12px]">„{neu.title.slice(0, 24)}…“ der Facility zuweisen</button></div>}</div> }
    }
    if (/auslast|basel|termin|heute/.test(s)) return { me: false, t: 'Basel 1 heute: 5 Mitarbeiterinnen im Dienst, 31 Termine, Auslastung 84 %. Freie Lücken: Alma 14:00–15:00, Gina ab 17:00.', card: <p className="mt-2 text-xs text-mute">Quelle: Phorest, Kundentermine Basel 1</p> }
    return { me: false, t: 'Dazu habe ich keine Daten. Ich kann News entwerfen, Lesestatus prüfen, Meldungen zuweisen oder Termine aus Phorest auswerten.' }
  }
  const send = (q = v) => { if (!q.trim() || busy) return; setMsgs(m => [...m, { me: true, t: q }]); setV(''); setBusy(true)
    setTimeout(() => { setMsgs(m => [...m, answer(q)]); setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50) }, 700) }
  return (
    <aside className="w-[380px] shrink-0 border-l border-sage-100 flex flex-col bg-paper">
      <div className="h-16 px-5 flex items-center justify-between border-b border-sage-100"><p className="font-medium flex items-center gap-2"><Sparkles size={17} />Benni</p><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-50 flex items-center justify-center"><X size={17} /></button></div>
      <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-3">
        {msgs.length === 0 && <><p className="text-[14px] text-mute">Benni hat hier dieselben Zugriffe wie in der App, plus die Verwaltung: News, Lesestatus, Meldungen, Aufgaben und die Kundentermine aller Studios.</p>
          {ideas.map(i => <button key={i} onClick={() => send(i)} className="w-full text-left rounded-2xl bg-white px-4 py-3 text-[14px]">{i}</button>)}</>}
        {msgs.map((m, i) => <div key={i} className={m.me ? 'flex justify-end' : ''}><div className={`max-w-[92%] rounded-[18px] px-4 py-3 text-[14px] leading-snug ${m.me ? 'bg-ink text-white' : 'bg-white'}`}>{m.t}{m.card}</div></div>)}
        {busy && <div className="w-16 rounded-[18px] bg-white px-4 py-3 flex gap-1">{[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-sage-400 animate-pulse" />)}</div>}
        <div ref={end} />
      </div>
      <div className="p-4 flex gap-2 border-t border-sage-100"><input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Frag Benni …" className="flex-1 h-11 rounded-xl bg-white border border-sage-200 px-3 text-[14px] outline-none" /><button onClick={() => send()} className="w-11 h-11 rounded-xl bg-ink text-white flex items-center justify-center"><Send size={16} /></button></div>
    </aside>
  )
}
