import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LayoutDashboard, LifeBuoy, Phone, GraduationCap, Smartphone, Store, ArrowUp, ArrowDown, Newspaper, ListChecks, Lightbulb, CalendarDays, Users, BookOpen, Plus, Check, Search, CalendarClock, X, Trash2, Pencil } from 'lucide-react'
import { Terminbuch } from './Calendar'
import { useApp, isoDay, appliesOn, fmtDate, fmtTime, zurichHour, inNewsAudience, GROUPS, type Ticket, type News, type Quiz, type Staff } from './store'
import { supabase } from './lib/supabase'
import { Status, ASSISTANT } from './Mobile'
import { notifyNow } from './lib/push'
import { Logo, BMark } from './Logo'
import { BenniChat } from './BenniChat'
import { toast } from './Toast'
import { Comments, Media } from './TicketParts'

type View = 'overview' | 'book' | 'news' | 'tasks' | 'tickets' | 'events' | 'standby' | 'learn' | 'team' | 'studios' | 'wiki'
const NAV: [View, string, typeof Users][] = [['overview', 'Übersicht', LayoutDashboard], ['book', 'Kundentermine', CalendarClock], ['news', 'News', Newspaper], ['tasks', 'Aufgaben', ListChecks], ['tickets', 'Meldungen & Ideen', Lightbulb], ['events', 'Schulungen & Events', CalendarDays], ['standby', 'Aushilfe', LifeBuoy], ['learn', 'Lernen', GraduationCap], ['team', 'Team & Skills', Users], ['studios', 'Studios', Store], ['wiki', 'Wissen', BookOpen]]

export default function Backoffice({ onSwitch }: { onSwitch?: () => void }) {
  const { me } = useApp()
  const [v, setV] = useState<View>('overview')
  const [ai, setAi] = useState(false)
  // Filialleitung verwaltet nur ihre Filiale; Inhalte (News, Wissen, Vorlagen, Team) pflegt das Büro.
  const nav = me.app_role === 'buero' ? NAV : NAV.filter(([k]) => ['overview', 'book', 'tasks', 'tickets', 'events', 'standby', 'learn', 'team'].includes(k))
  const allowed = new Set(nav.map(([k]) => k))
  const go = (k: View) => { if (allowed.has(k)) setV(k) }
  return (
    <div className="flex h-full bg-white overflow-hidden">
      <aside className="w-60 shrink-0 bg-olive-800 p-4 flex flex-col">
        <Logo className="w-32 text-white mx-2 mt-1" />
        <nav className="mt-6 space-y-0.5">
          {nav.map(([k, l, I]) => <button key={k} onClick={() => setV(k)} className={`w-full h-10 px-3 rounded-[10px] flex items-center gap-3 text-[14px] ${v === k ? 'bg-white/10 text-white' : 'text-sage-200 hover:bg-white/5'}`}><I size={18} strokeWidth={1.6} />{l}</button>)}
        </nav>
        {onSwitch && <button onClick={onSwitch} className="mt-auto mb-1 h-10 px-3 rounded-[10px] flex items-center gap-3 text-[14px] text-sage-200 hover:bg-white/5"><Smartphone size={18} strokeWidth={1.6} />Mitarbeiterin-App</button>}
        <button onClick={() => setAi(!ai)} className={`${onSwitch ? '' : 'mt-auto '}h-10 px-3 rounded-[10px] flex items-center gap-3 text-[14px] ${ai ? 'bg-white/10 text-white' : 'text-sage-200 hover:bg-white/5'}`}><BMark className="w-[18px] h-[18px] text-[10px]" inverse />Frag {ASSISTANT}</button>
      </aside>
      <main className={`flex-1 no-scrollbar p-8 ${v === 'book' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {v === 'book' && <><H>Kundentermine</H><div className="flex-1 min-h-0"><Terminbuch /></div></>}
        {v === 'overview' && <Overview go={go} can={k => allowed.has(k)} />}{allowed.has('news') && v === 'news' && <NewsAdmin />}{v === 'tasks' && <TasksAdmin />}
        {v === 'tickets' && <TicketsAdmin />}{v === 'standby' && <StandbyAdmin />}{v === 'learn' && <LearnAdmin />}{v === 'events' && <EventsAdmin />}{allowed.has('team') && v === 'team' && <TeamAdmin />}{allowed.has('studios') && v === 'studios' && <StudiosAdmin />}{allowed.has('wiki') && v === 'wiki' && <WikiAdmin />}
      </main>
      {ai && <BenniChat variant="panel" onClose={() => setAi(false)} />}
    </div>
  )
}

const H = ({ children, action }: { children: ReactNode; action?: ReactNode }) => <div className="flex items-center justify-between mb-6"><h1 className="text-[28px]">{children}</h1>{action}</div>
const New = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button onClick={onClick} className="h-10 px-4 rounded-[10px] bg-olive-700 hover:bg-olive-800 transition text-white text-[14px] flex items-center gap-1.5"><Plus size={16} />{children}</button>
// Fläche für Formulare und Vorschläge: Stein ohne Rahmen
const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`rounded-[16px] bg-sage-50 ${className}`}>{children}</div>
// Seitenspalte neben einer Tabelle: keine Box, nur Linie
const Side = ({ children }: { children: ReactNode }) => <div className="border-l border-line pl-6 self-start min-w-0">{children}</div>
const Sec = ({ children, action }: { children: ReactNode; action?: ReactNode }) => <div className="flex items-baseline justify-between mb-2"><p className="rubric text-ink/70">{children}</p>{action}</div>
const Th = ({ children }: { children: ReactNode }) => <th className="text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">{children}</th>
const Bar = ({ p }: { p: number }) => <div className="h-1 w-full rounded-full bg-line overflow-hidden"><div className="h-full bg-olive-700 rounded-full" style={{ width: p + '%' }} /></div>
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="block"><span className="block text-xs text-mute mb-1">{label}</span>{children}</label>
const inp = 'w-full h-10 rounded-[10px] border border-transparent focus:border-sage-400 px-3 text-[14px] bg-white outline-none transition'
const btn = 'h-10 px-4 rounded-[10px] bg-olive-700 hover:bg-olive-800 transition text-white text-[14px] disabled:opacity-60'
const btn2 = 'h-10 px-4 rounded-[10px] bg-sage-50 hover:bg-sage-100 transition text-[14px]'
// Neue oder geänderte Inhalte sofort übersetzen lassen (sonst übernimmt der 10-Minuten-Takt)
const retranslate = () => { supabase?.functions.invoke('translate', { body: { action: 'sync' } }) }
// Testkonten der Entwicklung zählen in Zielgruppen, Quoten und Ranglisten nicht mit
const real = (s: Staff) => s.active && !/@aleksa\.ai$/i.test(s.email)
const inBranch = (s: Staff, b: string) => s.branch_id === b || (s.extra ?? []).includes(b)
const Err = ({ m }: { m: string }) => m ? <p className="text-[13px] text-alert">{m}</p> : null

/* Wer gehört zur Zielgruppe (leer = alle aktiven)? */
function useAudience() {
  const { staff } = useApp()
  return (n: Pick<News, 'audienceBranches' | 'audienceGroups' | 'audienceSkills' | 'audiencePeople'>) =>
    staff.filter(s => real(s) && (n.audiencePeople.length || n.audienceGroups.includes('Büro') ? true : s.branch_id !== 'buero') && inNewsAudience(s, n))
}
/* Fortschritt der Tagesaufgaben je Studio heute */
function useTaskProgress() {
  const { templates, completionsToday, branches } = useApp()
  const day = isoDay()
  return branches.filter(b => !b.is_office).map(b => {
    const items = templates.filter(t => t.active && appliesOn(t, day, b.id)).flatMap(t => t.items)
    const done = completionsToday.filter(c => c.branch_id === b.id && items.some(i => i.id === c.item_id)).length
    return { branch: b.name, id: b.id, done, total: items.length }
  })
}

function Overview({ go, can }: { go: (v: View) => void; can: (v: View) => boolean }) {
  const { tickets, news, newsReads, events, me } = useApp()
  const audience = useAudience(), progress = useTaskProgress()
  const must = news.find(n => n.mustRead && new Date(n.publishAt) <= new Date())
  // Filialleitung: Kennzahlen nur für das eigene Studio
  const mine = (bid: string) => me.app_role === 'buero' || bid === me.branch_id || (me.extra ?? []).includes(bid)
  const mustPeople = must ? audience(must).filter(p => mine(p.branch_id)) : []
  const mustPct = must && mustPeople.length ? Math.round(mustPeople.filter(p => newsReads.some(r => r.news_id === must.id && r.employee_id === p.id && r.confirmed_at)).length / mustPeople.length * 100) : 0
  const open = tickets.filter(t => t.status !== 'Erledigt' && (me.app_role === 'buero' || t.branchId === me.branch_id || (me.extra ?? []).includes(t.branchId)))
  const rows = progress.filter(b => mine(b.id))
  const tot = rows.reduce((a, b) => a + b.total, 0), dn = rows.reduce((a, b) => a + b.done, 0)
  const nextEv = events.find(e => new Date(e.startsAt) > new Date())
  const kpis: [string, string, string, View][] = [
    ['Pflicht-News gelesen', must ? mustPct + ' %' : '–', must?.title ?? 'keine Pflicht-News', 'news'],
    ['Tagesaufgaben', tot ? Math.round(dn / tot * 100) + ' %' : '–', me.app_role === 'buero' ? 'alle Studios heute' : `${rows[0]?.branch ?? ''} heute`, 'tasks'],
    ['Offene Meldungen', String(open.length), `${open.filter(t => !t.assignee).length} ohne Zuweisung`, 'tickets'],
    ['Nächster Termin', nextEv ? fmtDate(nextEv.startsAt, { day: '2-digit', month: '2-digit' }) : '–', nextEv ? `${nextEv.title.slice(0, 26)}${nextEv.capacity ? ` · ${nextEv.taken}/${nextEv.capacity}` : ''}` : 'nichts geplant', 'events'],
  ]
  const hour = zurichHour()
  return (<>
    <p className="rubric text-olive-700">{fmtDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1 className="text-[28px] mt-2 mb-7">{hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : 'Guten Abend'}, {me.first}</h1>
    <div className="grid grid-cols-4 border-t border-line">{kpis.map(([l, n, s2, to], i) => <button key={l} disabled={!can(to)} onClick={() => go(to)} className={`text-left pt-4 pb-2 pr-4 group disabled:cursor-default ${i ? 'pl-5 border-l border-line' : ''}`}><p className="font-display text-[30px] leading-tight group-hover:text-olive-700 transition">{n}</p><p className="text-[13px] text-ink/80 mt-1">{l}</p><p className="text-xs text-mute truncate">{s2}</p></button>)}</div>
    <div className="grid grid-cols-[1.2fr_1fr] gap-10 mt-10">
      <div><p className="rubric text-ink/70 mb-2">Tagesaufgaben {rows.length > 1 ? 'je Studio' : rows[0]?.branch ?? ''}</p>{rows.map(b => <div key={b.id} className="grid grid-cols-[90px_1fr_44px] items-center gap-3 text-[14px] py-2.5 border-b border-line"><span>{b.branch}</span><Bar p={b.total ? b.done / b.total * 100 : 0} /><span className="text-right text-mute tabular-nums text-[13px]">{b.done}/{b.total}</span></div>)}</div>
      <div><div className="flex justify-between items-baseline mb-2"><p className="rubric text-ink/70">Neueste Meldungen</p><button onClick={() => go('tickets')} className="text-[13px] text-olive-700">Alle</button></div>{tickets.length === 0 && <p className="text-[14px] text-mute py-2.5">Keine Meldungen.</p>}{tickets.slice(0, 5).map(t => <div key={t.id} className="py-2.5 flex justify-between gap-3 text-[14px] border-b border-line"><span className="truncate">{t.title}{t.viaAI && <span className="text-mute"> · über {ASSISTANT}</span>}</span><span className="text-[13px] shrink-0"><Status s={t.status} /></span></div>)}</div>
    </div>
    <div className="mt-10"><Readiness /></div>
  </>)
}

/* Startbereitschaft je Studio (BLTH-27): App installiert, Mitteilungen an */
function Readiness() {
  const { staff, branches, me } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const rows = branches.filter(b => !b.is_office && (me.app_role === 'buero' || b.id === me.branch_id || (me.extra ?? []).includes(b.id))).map(b => {
    const p = staff.filter(s => real(s) && inBranch(s, b.id))
    return { b, p, inst: p.filter(s => s.appInstalled).length, push: p.filter(s => s.pushEnabled).length }
  })
  return <div><div className="grid grid-cols-[90px_1fr_1fr_24px] gap-3 items-baseline mb-2"><p className="rubric text-ink/70 col-span-2">Startbereitschaft</p></div>
    <div className="grid grid-cols-[90px_1fr_1fr_24px] gap-3 text-xs text-mute mb-1"><span /><span>App installiert</span><span>Mitteilungen an</span><span /></div>
    <div>{rows.map(r => <div key={r.b.id}>
      <button onClick={() => setOpen(open === r.b.id ? null : r.b.id)} className="w-full grid grid-cols-[90px_1fr_1fr_24px] items-center gap-3 text-[14px] text-left py-2.5 border-b border-line"><span>{r.b.name}</span>
        <span className="flex items-center gap-2"><Bar p={r.p.length ? r.inst / r.p.length * 100 : 0} /><span className="text-xs text-mute w-10">{r.inst}/{r.p.length}</span></span>
        <span className="flex items-center gap-2"><Bar p={r.p.length ? r.push / r.p.length * 100 : 0} /><span className="text-xs text-mute w-10">{r.push}/{r.p.length}</span></span><span className="text-mute text-xs">{open === r.b.id ? '–' : '+'}</span></button>
      {open === r.b.id && <div className="mt-2 mb-3 ml-[102px] grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">{r.p.map(s => <span key={s.id} className="flex justify-between"><span>{s.first} {s.last}</span><span className="text-mute">{s.appInstalled ? 'App' : '–'} · {s.pushEnabled ? 'Push' : '–'}</span></span>)}</div>}
    </div>)}</div></div>
}

/* ---------- News ---------- */
function NewsAdmin() {
  const { news, newsReads, branches, me, reload, skillCatalog, staff, quizzes } = useApp()
  const audience = useAudience()
  const [sel, setSel] = useState<string | null>(news[0]?.id ?? null), [compose, setCompose] = useState(false)
  const blank = { title: '', teaser: '', body: '', tag: 'Studio', must: false, branches: [] as string[], groups: [] as string[], skills: [] as string[], people: [] as string[], when: '', wiki: '', image: '' }
  // Benni: Entwurf aus Stichworten, Bild auf Wunsch (Function newsdraft, nur Büro)
  const [brief, setBrief] = useState(''), [imgPrompt, setImgPrompt] = useState(''), [ai, setAi] = useState<'' | 'text' | 'image'>(''), [preview, setPreview] = useState<string | null>(null)
  const draft = async () => {
    if (!brief.trim() || ai) return
    setAi('text'); setErr('')
    const { data, error } = await supabase!.functions.invoke('newsdraft', { body: { action: 'text', brief } })
    setAi('')
    if (error || !data?.ok) { setErr('Benni konnte gerade keinen Entwurf schreiben.'); return }
    setF(v => ({ ...v, title: data.title, teaser: data.teaser, body: data.body })); setImgPrompt(data.image_prompt || data.title)
  }
  const image = async () => {
    const prompt = imgPrompt || f.title
    if (!prompt.trim() || ai) return
    setAi('image'); setErr('')
    const { data, error } = await supabase!.functions.invoke('newsdraft', { body: { action: 'image', prompt } })
    setAi('')
    if (error || !data?.ok) { setErr('Das Bild konnte gerade nicht erzeugt werden.'); return }
    setF(v => ({ ...v, image: data.path }))
    const { data: u } = await supabase!.storage.from('media').createSignedUrl(data.path, 3600); setPreview(u?.signedUrl ?? null)
  }
  const [f, setF] = useState(blank)
  const [pq, setPq] = useState('')
  const reach = audience({ audienceBranches: f.branches, audienceGroups: f.groups, audienceSkills: f.skills, audiencePeople: f.people }).length
  const tog = (k: 'branches' | 'groups' | 'skills' | 'people', v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] })
  const chip = (on: boolean) => `px-2.5 h-7 rounded-[8px] text-[12px] ${on ? 'bg-olive-700 text-white' : 'bg-white text-ink/80'}`
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const n = news.find(x => x.id === sel)
  const pctOf = (n: News) => { const id = n.id, p = audience(n); return p.length ? Math.round(p.filter(s => newsReads.some(r => r.news_id === id && r.employee_id === s.id && r.confirmed_at)).length / p.length * 100) : 0 }
  const publish = async () => {
    if (!f.title.trim() || !f.body.trim()) { setErr('Titel und Text sind nötig.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase!.from('news').insert({
      title: f.title.trim(), teaser: f.teaser.trim() || f.body.trim().slice(0, 140), body: f.body.trim(), tag: f.must ? 'Pflicht' : f.tag, must_read: f.must,
      audience_branches: f.branches, audience_groups: f.groups, audience_skills: f.skills, audience_people: f.people, image_path: f.image || null, author_id: me.id, author_name: `${me.first} ${me.last}`, publish_at: f.when ? new Date(f.when).toISOString() : new Date().toISOString(), wiki_category: f.wiki || null,
    })
    setBusy(false)
    if (error) { setErr('Veröffentlichen hat nicht geklappt.'); return }
    setCompose(false); setF(blank); setPq(''); setBrief(''); setImgPrompt(''); setPreview(null); await reload(); notifyNow(); retranslate()
  }
  const people = n ? audience(n) : []
  return (<>
    <H action={<New onClick={() => setCompose(!compose)}>Neue News</New>}>News</H>
    {compose && <Panel className="p-6 mb-8 grid grid-cols-[1fr_280px] gap-6">
      <div className="space-y-3">
        <div className="flex gap-2 items-center pb-3 border-b border-line"><BMark className="w-7 h-7" working={!!ai} />
          <input value={brief} onChange={e => setBrief(e.target.value)} onKeyDown={e => e.key === 'Enter' && draft()} placeholder="Worum geht es? Benni schreibt einen Entwurf" className="flex-1 h-9 rounded-[8px] bg-white px-3 text-[14px] outline-none" />
          <button disabled={!brief.trim() || !!ai} onClick={draft} className="h-9 px-3 rounded-[8px] bg-olive-700 text-white text-[13px] disabled:opacity-40">{ai === 'text' ? 'Schreibt …' : 'Entwurf schreiben'}</button></div>
        <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Titel" className="w-full text-[20px] font-medium outline-none bg-transparent" />
        <input value={f.teaser} onChange={e => setF({ ...f, teaser: e.target.value })} placeholder="Kurzfassung für die Karte (optional)" className="w-full text-[15px] outline-none text-mute" />
        <textarea value={f.body} onChange={e => setF({ ...f, body: e.target.value })} rows={8} placeholder="Text. Absätze mit einer Leerzeile trennen." className="w-full resize-none outline-none text-[15px] bg-transparent" />
        {preview ? <div className="relative"><img src={preview} alt="" className="w-full aspect-[3/2] object-cover rounded-[12px]" /><button onClick={() => { setF({ ...f, image: '' }); setPreview(null) }} className="absolute top-2 right-2 h-8 px-3 rounded-[8px] bg-white/90 text-[13px]">Bild entfernen</button></div>
          : <div className="flex gap-2"><input value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} placeholder="Bild beschreiben (optional)" className="flex-1 h-9 rounded-[8px] bg-white px-3 text-[14px] outline-none" />
            <button disabled={!(imgPrompt || f.title).trim() || !!ai} onClick={image} className="h-9 px-3 rounded-[8px] bg-white text-[13px] disabled:opacity-40">{ai === 'image' ? 'Bild entsteht …' : 'Bild erzeugen'}</button></div>}
      </div>
      <div className="space-y-3 text-[14px]">
        <div>
          <div className="flex items-baseline justify-between mb-1.5"><span className="text-xs text-mute">Zielgruppe</span><span className="text-xs text-olive-700">{reach} {reach === 1 ? 'Person' : 'Personen'}</span></div>
          {f.people.length === 0 ? <div className="space-y-2">
            <p className="text-[11px] text-mute">Studios</p>
            <div className="flex flex-wrap gap-1.5">{branches.filter(b => !b.is_office).map(b => <button key={b.id} onClick={() => tog('branches', b.id)} className={chip(f.branches.includes(b.id))}>{b.name}</button>)}</div>
            <p className="text-[11px] text-mute pt-1">Gruppen</p>
            <div className="flex flex-wrap gap-1.5">{GROUPS.map(g => <button key={g} onClick={() => tog('groups', g)} className={chip(f.groups.includes(g))}>{g}</button>)}</div>
            {skillCatalog.length > 0 && <p className="text-[11px] text-mute pt-1">Skills</p>}
            {skillCatalog.length > 0 && <div className="flex flex-wrap gap-1.5">{skillCatalog.map(k => <button key={k} onClick={() => tog('skills', k)} className={chip(f.skills.includes(k))}>{k}</button>)}</div>}
            <p className="text-[11px] text-mute pt-1">Nichts gewählt = alle.</p>
          </div> : <div className="flex flex-wrap gap-1.5">{f.people.map(id => { const p = staff.find(x => x.id === id); return <button key={id} onClick={() => tog('people', id)} className={`${chip(true)} flex items-center gap-1`}>{p ? `${p.first} ${p.last}` : id}<X size={11} /></button> })}</div>}
          <div className="mt-2 relative"><input value={pq} onChange={e => setPq(e.target.value)} placeholder="Oder einzelne Personen …" className={inp} />
            {pq.trim().length > 1 && <div className="absolute z-10 left-0 right-0 mt-1 rounded-[10px] bg-white shadow-[0_8px_24px_-12px_rgba(29,34,28,.35)] max-h-48 overflow-y-auto">{staff.filter(s => s.active && !f.people.includes(s.id) && `${s.first} ${s.last}`.toLowerCase().includes(pq.toLowerCase())).slice(0, 8).map(s => <button key={s.id} onClick={() => { tog('people', s.id); setPq('') }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-sage-50">{s.first} {s.last} <span className="text-mute">· {s.branch}</span></button>)}</div>}</div>
        </div>
        <Field label="Kategorie"><select value={f.tag} onChange={e => setF({ ...f, tag: e.target.value })} className={inp}>{['Studio', 'Marketing', 'Team', 'Hygiene'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.must} onChange={e => setF({ ...f, must: e.target.checked })} />Pflicht mit Lesebestätigung</label>
        <Field label="Veröffentlichen"><input type="datetime-local" value={f.when} onChange={e => setF({ ...f, when: e.target.value })} className={inp} /><span className="text-[11px] text-mute">Leer = sofort</span></Field>
        <Field label="Auch ins Wissen (Kategorie)"><input value={f.wiki} onChange={e => setF({ ...f, wiki: e.target.value })} placeholder="z. B. Hygiene" className={inp} /></Field>
        <Err m={err} /><button disabled={busy} onClick={publish} className={`${btn} w-full`}>{f.when ? 'Einplanen' : 'Veröffentlichen'}</button>
      </div>
    </Panel>}
    <div className="grid grid-cols-[1fr_320px] gap-8">
      <div><table className="tbl w-full text-[14px]"><thead><tr><Th>Titel</Th><Th>Zielgruppe</Th><Th>Datum</Th><Th>Gelesen</Th></tr></thead>
        <tbody className="divide-y divide-line">{news.map(x => { const p = x.mustRead ? pctOf(x) : null, planned = new Date(x.publishAt) > new Date()
          return <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${sel === x.id ? 'bg-sage-50' : ''}`}><td className="px-4 py-3">{x.title}{x.mustRead && <span className="ml-2 text-xs text-brass">Pflicht</span>}{planned && <span className="ml-2 text-xs text-mute">geplant</span>}</td><td className="px-4 text-mute">{x.audience}</td><td className="px-4 text-mute">{x.date}</td><td className="px-4 w-32">{p !== null ? <div className="flex items-center gap-2"><Bar p={p} /><span className="text-xs text-mute">{p}%</span></div> : <span className="text-xs text-mute">–</span>}</td></tr>
        })}</tbody></table></div>
      {n && <Side><p className="font-medium">{n.title}</p><p className="text-xs text-mute mt-1">{n.mustRead ? `${people.filter(s => newsReads.some(r => r.news_id === n.id && r.employee_id === s.id && r.confirmed_at)).length} von ${people.length} bestätigt` : 'Ohne Lesebestätigung'}</p>
        {n.mustRead && <div className="mt-3 max-h-[420px] overflow-y-auto no-scrollbar divide-y divide-line">{people.map(s => { const r = newsReads.find(x => x.news_id === n.id && x.employee_id === s.id)
          return <div key={s.id} className="py-2 flex items-center justify-between text-[13px]"><span>{s.first} {s.last} <span className="text-mute">· {s.branch}</span></span>{r?.confirmed_at ? <Check size={15} className="text-ok" /> : <span className="text-xs text-mute">{r ? 'geöffnet' : 'offen'}</span>}</div> })}</div>}
        <button onClick={async () => { if (confirm(`„${n.title}“ löschen?${quizzes.some(q => q.newsId === n.id) ? ' Das Quiz dazu und alle Ergebnisse werden mit gelöscht.' : ''} Lesebestätigungen gehen verloren.`)) { const { error } = await supabase!.from('news').delete().eq('id', n.id); if (error) { alert('Löschen hat nicht geklappt.'); return } setSel(null); await reload() } }} className="mt-4 text-[13px] text-mute flex items-center gap-1"><Trash2 size={13} />Löschen</button>
      </Side>}
    </div>
  </>)
}

/* ---------- Aufgaben ---------- */
const REP = { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' } as const
const WD = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
function TasksAdmin() {
  const { templates, branches, me, reload } = useApp()
  const progress = useTaskProgress().filter(b => me.app_role === 'buero' || b.id === me.branch_id)
  const [form, setForm] = useState(false), [editId, setEditId] = useState<string | null>(null)
  const EMPTY = { name: '', repeat: 'daily' as 'daily' | 'weekly' | 'monthly', weekday: 1, monthday: 1, branches: [] as string[], items: '' }
  const [f, setF] = useState(EMPTY)
  const [err, setErr] = useState('')
  const openEdit = (t: (typeof templates)[number]) => {
    setF({ name: t.name, repeat: t.repeat, weekday: t.weekday ?? 1, monthday: t.monthday ?? 1, branches: t.branchIds,
      items: t.items.map(i => `${i.time ? i.time + ' ' : ''}${i.title}${i.proof ? ' !foto' : ''}${i.prio ? ' !wichtig' : ''}`).join('\n') })
    setEditId(t.id); setForm(true); setErr(''); document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reactivate = async (id: string) => { await supabase!.from('task_templates').update({ active: true }).eq('id', id); await reload() }
  const proposals = templates.filter(t => t.proposed)
  const approve = async () => { if (confirm('Vorschläge freigeben? Die Beispielvorlagen aus dem Prototyp werden dabei abgeschaltet.')) { await supabase!.rpc('approve_wiki_proposals', { p_kind: 'tasks' }); await reload(); retranslate() } }
  const save = async () => {
    const lines = f.items.split('\n').map(l => l.trim()).filter(Boolean)
    if (!f.name.trim() || !lines.length) { setErr('Name und mindestens ein Punkt sind nötig.'); return }
    const parse = (l: string) => { const m = l.match(/^(\d{1,2}:\d{2})\s+(.*)$/); const text = (m ? m[2] : l)
      return { title: text.replace(/!foto|!wichtig/gi, '').trim(), due_time: m ? m[1] : null, proof_photo: /!foto/i.test(text), prio: /!wichtig/i.test(text) } }
    if (editId) {
      // Bearbeiten: Punkte der Reihe nach aktualisieren, neue anhängen, überzählige entfernen (deren Nachweise gehen mit)
      const tpl = templates.find(x => x.id === editId)!
      const removed = tpl.items.slice(lines.length)
      if (removed.length && !confirm(`${removed.length} Punkt(e) werden entfernt, ihre bisherigen Nachweise auch. Fortfahren?`)) return
      const { error } = await supabase!.from('task_templates').update({ name: f.name.trim(), repeat: f.repeat, weekday: f.repeat === 'weekly' ? f.weekday : null, monthday: f.repeat === 'monthly' ? f.monthday : null, branch_ids: f.branches }).eq('id', editId)
      if (error) { setErr('Speichern hat nicht geklappt.'); return }
      const results = await Promise.all([
        ...lines.map((l, i) => tpl.items[i] ? supabase!.from('task_items').update({ ...parse(l), sort: i }).eq('id', tpl.items[i].id) : supabase!.from('task_items').insert({ template_id: editId, ...parse(l), sort: i })),
        ...removed.map(r => supabase!.from('task_items').delete().eq('id', r.id)),
      ])
      if (results.some(r => r.error)) { setErr('Nicht alle Punkte liessen sich speichern. Bitte noch einmal speichern.'); return }
      setForm(false); setEditId(null); setErr(''); setF(EMPTY); await reload(); retranslate(); return
    }
    const { data, error } = await supabase!.from('task_templates').insert({ name: f.name.trim(), repeat: f.repeat, weekday: f.repeat === 'weekly' ? f.weekday : null, monthday: f.repeat === 'monthly' ? f.monthday : null, branch_ids: f.branches, sort: templates.length }).select('id').single()
    if (error || !data) { setErr('Speichern hat nicht geklappt.'); return }
    // Zeile: "07:45 Kabinen desinfizieren !foto !wichtig"
    const rows = lines.map((l, i) => { const m = l.match(/^(\d{1,2}:\d{2})\s+(.*)$/); const text = (m ? m[2] : l)
      return { template_id: data.id, title: text.replace(/!foto|!wichtig/gi, '').trim(), due_time: m ? m[1] : null, proof_photo: /!foto/i.test(text), prio: /!wichtig/i.test(text), sort: i } })
    const { error: ie } = await supabase!.from('task_items').insert(rows)
    if (ie) { await supabase!.from('task_templates').delete().eq('id', data.id); setErr('Die Punkte liessen sich nicht speichern.'); return }
    setForm(false); setErr(''); setF(EMPTY); await reload(); retranslate()
  }
  return (<>
    <H action={me.app_role === 'buero' && <New onClick={() => { setEditId(null); setF(EMPTY); setErr(''); setForm(!form || !!editId) }}>Neue Vorlage</New>}>Aufgaben</H>
    {form && <Panel className="p-6 mb-8 grid grid-cols-[1fr_260px] gap-6">
      <div className="space-y-3"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Name der Vorlage, z. B. Öffnung" className="w-full text-[18px] font-medium outline-none" />
        <textarea value={f.items} onChange={e => setF({ ...f, items: e.target.value })} rows={7} placeholder={'Ein Punkt pro Zeile, optional mit Uhrzeit:\n07:45 Studio aufschliessen\n07:50 Kabinen desinfizieren !foto !wichtig'} className="w-full resize-none outline-none text-[14px] font-mono" /></div>
      <div className="space-y-3 text-[14px]">
        <Field label="Wiederholung"><select value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value as typeof f.repeat })} className={inp}><option value="daily">Täglich</option><option value="weekly">Wöchentlich</option><option value="monthly">Monatlich</option></select></Field>
        {f.repeat === 'weekly' && <Field label="Wochentag"><select value={f.weekday} onChange={e => setF({ ...f, weekday: Number(e.target.value) })} className={inp}>{WD.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Field>}
        {f.repeat === 'monthly' && <Field label="Tag im Monat"><input type="number" min={1} max={31} value={f.monthday} onChange={e => setF({ ...f, monthday: Number(e.target.value) })} className={inp} /></Field>}
        <Field label="Gilt für"><div className="flex flex-wrap gap-1.5">{branches.filter(b => !b.is_office).map(b => <button key={b.id} onClick={() => setF({ ...f, branches: f.branches.includes(b.id) ? f.branches.filter(x => x !== b.id) : [...f.branches, b.id] })} className={`px-2.5 h-8 rounded-[8px] text-[13px] ${f.branches.includes(b.id) ? 'bg-olive-700 text-white' : 'bg-white text-ink/80'}`}>{b.name}</button>)}</div><span className="text-[11px] text-mute">{f.branches.length ? '' : 'Keine Auswahl = alle Studios'}</span></Field>
        <Err m={err} /><button onClick={save} className={`${btn} w-full`}>{editId ? 'Änderungen speichern' : 'Speichern'}</button>
        {editId && <button onClick={() => { setForm(false); setEditId(null); setF(EMPTY) }} className="w-full h-9 text-[13px] text-mute hover:text-ink">Abbrechen</button>}
      </div>
    </Panel>}
    {me.app_role === 'buero' && proposals.length > 0 && <Panel className="p-6 mb-8">
      <div className="flex items-start justify-between gap-4"><div><p className="rubric text-brass">Vorschlag aus dem Wiki</p><p className="font-medium mt-2">{proposals.length} Vorlagen, {proposals.reduce((a, t) => a + t.items.length, 0)} Punkte</p></div>
        <button onClick={approve} className={`${btn} shrink-0`}>Freigeben</button></div>
      <div className="mt-4 grid grid-cols-2 gap-4">{proposals.map(t => <div key={t.id}><p className="text-[14px] font-medium">{t.name} <span className="text-xs text-mute font-normal">· {REP[t.repeat]}{t.repeat === 'weekly' && t.weekday ? `, ${WD[t.weekday]}` : ''}</span> <button onClick={() => openEdit(t)} className="ml-1 text-xs text-olive-700 font-normal">Bearbeiten</button></p><ul className="mt-1 text-[13px] text-mute list-disc pl-4 space-y-0.5">{t.items.map(i => <li key={i.id}>{i.title}{i.prio && <span className="text-brass"> · wichtig</span>}</li>)}</ul></div>)}</div>
    </Panel>}
    <div className="grid grid-cols-[1.4fr_1fr] gap-8">
      <div><Sec>Vorlagen</Sec><table className="tbl w-full text-[14px]"><thead><tr><Th>Name</Th><Th>Punkte</Th><Th>Wiederholung</Th><Th>Gilt für</Th><Th> </Th></tr></thead>
        <tbody className="divide-y divide-line">{templates.filter(t => t.active).map(t => <tr key={t.id}><td className="px-4 py-3">{t.name}{t.sample && <span className="ml-2 text-xs text-mute">Beispiel</span>}</td><td className="px-4 text-mute">{t.items.length}</td><td className="px-4 text-mute">{REP[t.repeat]}{t.repeat === 'weekly' && t.weekday ? `, ${WD[t.weekday]}` : ''}{t.repeat === 'monthly' && t.monthday ? `, ${t.monthday}.` : ''}</td><td className="px-4 text-mute">{t.branchIds.length ? t.branchIds.map(id => branches.find(b => b.id === id)?.name).join(', ') : 'Alle Studios'}</td>
          <td className="px-2 whitespace-nowrap">{me.app_role === 'buero' && <button title="Bearbeiten" onClick={() => openEdit(t)} className="text-mute hover:text-ink mr-2"><Pencil size={14} /></button>}{me.app_role === 'buero' && <button title="Deaktivieren" onClick={async () => { if (confirm(`Vorlage „${t.name}“ deaktivieren? Alte Nachweise bleiben.`)) { await supabase!.from('task_templates').update({ active: false }).eq('id', t.id); await reload() } }} className="text-mute"><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></div>
        {me.app_role === 'buero' && templates.some(t => !t.active && !t.proposed) && <div className="mt-8"><Sec>Ausgeschaltet</Sec><div className="divide-y divide-line">{templates.filter(t => !t.active && !t.proposed).map(t => <div key={t.id} className="py-2.5 flex items-center justify-between text-[14px]"><span className="text-mute">{t.name} · {t.items.length} Punkte</span><button onClick={() => reactivate(t.id)} className="text-[13px] text-olive-700">Wieder einschalten</button></div>)}</div></div>}
      <Side><Sec>Heute je Studio</Sec><div>{progress.map(b => <div key={b.id} className="grid grid-cols-[90px_1fr_44px] items-center gap-3 text-[14px] py-2.5 border-b border-line"><span>{b.branch}</span><Bar p={b.total ? b.done / b.total * 100 : 0} /><span className="text-right text-mute tabular-nums text-[13px]">{b.done}/{b.total}</span></div>)}</div></Side>
    </div>
  </>)
}

/* ---------- Meldungen & Ideen ---------- */
function TicketsAdmin() {
  const { tickets, assign, setStatus, staff, me } = useApp()
  const [f, setF] = useState<'Alle' | 'Meldung' | 'Idee'>('Alle'), [st, setSt] = useState<'offen' | 'erledigt'>('offen'), [sel, setSel] = useState<string | null>(null)
  const assignees = ['Facility', ...new Set(staff.filter(s => real(s) && s.app_role !== 'mitarbeiterin').map(s => `${s.first} ${s.last}`))]
  const canEdit = (tk: Ticket) => me.app_role === 'buero' || (me.app_role === 'filialleitung' && tk.branchId !== 'buero' && (tk.branchId === me.branch_id || (me.extra ?? []).includes(tk.branchId)))
  const list = tickets.filter(t => (f === 'Alle' || t.kind === f) && (st === 'offen' ? t.status !== 'Erledigt' : t.status === 'Erledigt'))
    .sort((a, b) => (f === 'Idee' ? b.votes - a.votes : 0))
  const tk = tickets.find(x => x.id === sel)
  const seg = (on: boolean) => `h-8 px-3 rounded-[8px] text-[13px] transition ${on ? 'bg-white text-ink shadow-[0_1px_2px_rgba(29,34,28,.08)]' : 'text-ink/60'}`
  return (<>
    <H action={<div className="flex gap-3">
      <div className="flex gap-1 p-1 rounded-[10px] bg-sage-50">{(['offen', 'erledigt'] as const).map(k => <button key={k} onClick={() => setSt(k)} className={seg(st === k)}>{k === 'offen' ? `Offen · ${tickets.filter(t => t.status !== 'Erledigt').length}` : 'Erledigt'}</button>)}</div>
      <div className="flex gap-1 p-1 rounded-[10px] bg-sage-50">{(['Alle', 'Meldung', 'Idee'] as const).map(k => <button key={k} onClick={() => setF(k)} className={seg(f === k)}>{k}</button>)}</div>
    </div>}>Meldungen & Ideen</H>
    <div className={`grid gap-8 ${tk ? 'grid-cols-[1fr_340px]' : 'grid-cols-1'}`}>
      <div><table className="tbl w-full text-[14px]"><thead><tr><Th>Art</Th><Th>Titel</Th><Th>Studio</Th><Th>Von</Th><Th>Zuständig</Th><Th>Status</Th></tr></thead>
        <tbody className="divide-y divide-line">{list.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-mute">{st === 'offen' ? 'Nichts offen.' : 'Noch nichts erledigt.'}</td></tr>}
          {list.map(t => (
          <tr key={t.id} onClick={() => setSel(t.id === sel ? null : t.id)} className={`cursor-pointer ${sel === t.id ? 'bg-sage-50' : 'hover:bg-sage-50/70'}`}><td className="px-4 py-3 text-mute">{t.kind}</td>
            <td className="px-4">{t.title}<p className="text-xs text-mute">{t.when}{t.photo && ` · ${t.mediaKind === 'video' ? 'Video' : 'Foto'}`}{t.comments.length > 0 && ` · ${t.comments.length} Kommentar${t.comments.length > 1 ? 'e' : ''}`}{t.kind === 'Idee' && t.votes > 0 && ` · ${t.votes} unterstützen`}{t.viaAI && ` · über ${ASSISTANT}`}</p></td>
            <td className="px-4 text-mute">{t.branch}</td><td className="px-4 text-mute">{t.who}</td>
            <td className="px-4" onClick={e => e.stopPropagation()}>{canEdit(t) ? <select value={t.assignee ?? ''} onChange={e => assign(t.id, e.target.value)} className="h-8 rounded-[8px] bg-sage-50 px-2 text-[13px] outline-none"><option value="">Zuweisen …</option>{assignees.map(a => <option key={a}>{a}</option>)}</select> : <span className="text-mute">{t.assignee ?? '–'}</span>}</td>
            <td className="px-4" onClick={e => e.stopPropagation()}>{canEdit(t) ? <select value={t.status} onChange={e => setStatus(t.id, e.target.value as Ticket['status'])} className="h-8 rounded-[8px] bg-sage-50 px-2 text-[13px] outline-none">{['Neu', 'Zugewiesen', 'In Arbeit', 'Erledigt'].map(s => <option key={s}>{s}</option>)}</select> : <Status s={t.status} />}</td></tr>
        ))}</tbody></table></div>
      {tk && <Side><p className="rubric text-ink/70">{tk.kind} · {tk.branch}</p><p className="font-medium mt-2">{tk.title}</p>{tk.body && <p className="text-[13px] mt-1 whitespace-pre-wrap">{tk.body}</p>}
        <p className="text-xs text-mute mt-1">{tk.who} · {tk.when}</p>
        <div className="mt-3"><Media tk={tk} /></div>
        <div className="mt-4"><Sec>Verlauf</Sec><Comments tk={tk} /></div>
      </Side>}
    </div>
  </>)
}

/* ---------- Schulungen & Events ---------- */
const EMPTY_EVENT = { title: '', kind: 'Schulung', description: '', date: '', from: '09:00', to: '12:00', place: '', link: '', capacity: '', until: '', branches: [] as string[], skills: [] as string[] }
function EventsAdmin() {
  const { events, registrations, staff, branches, skillCatalog, me, reload } = useApp()
  const [sel, setSel] = useState<string | null>(events[0]?.id ?? null), [form, setForm] = useState(false), [err, setErr] = useState('')
  const [f, setF] = useState(EMPTY_EVENT)
  const e = events.find(x => x.id === sel)
  const regs = e ? registrations.filter(r => r.event_id === e.id) : []
  const who = (coming: boolean) => regs.filter(r => r.coming === coming).map(r => staff.find(s => s.id === r.employee_id)).filter(Boolean)
  const people = who(true), nope = who(false)
  // Noch keine Antwort: Zielgruppe (Studio + Skill) ohne Zu- oder Absage; Filialleitung sieht nur ihr Studio
  const open = e ? staff.filter(s => real(s) && s.branch_id !== 'buero' && (e.audienceBranches.length === 0 || e.audienceBranches.some(b => inBranch(s, b)))
    && (e.audienceSkills.length === 0 || s.skills.some(k => e.audienceSkills.includes(k))) && !regs.some(r => r.employee_id === s.id)
    && (me.app_role === 'buero' || s.branch_id === me.branch_id)) : []
  const save = async () => {
    if (!f.title.trim() || !f.date) { setErr('Titel und Datum sind nötig.'); return }
    if (f.to && f.to <= f.from) { setErr('„Bis“ muss nach „Von“ liegen.'); return }
    const at = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString()
    const { error } = await supabase!.from('events').insert({
      title: f.title.trim(), kind: f.kind, description: f.description.trim(), starts_at: at(f.date, f.from), ends_at: f.to ? at(f.date, f.to) : null,
      place: f.place.trim(), link: f.link.trim() || null, capacity: f.capacity ? Number(f.capacity) : null, register_until: f.until ? new Date(f.until + 'T23:59:00').toISOString() : null,
      audience_branches: f.branches, audience_skills: f.skills,
    })
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    setForm(false); setErr(''); setF(EMPTY_EVENT); await reload(); notifyNow(); retranslate()
  }
  const tog = (k: 'branches' | 'skills', v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] })
  return (<>
    <H action={me.app_role === 'buero' && <New onClick={() => setForm(!form)}>Neue Schulung</New>}>Schulungen & Events</H>
    {form && <Panel className="p-6 mb-8 grid grid-cols-[1fr_300px] gap-6">
      <div className="space-y-3"><input value={f.title} onChange={x => setF({ ...f, title: x.target.value })} placeholder="Titel" className="w-full text-[18px] font-medium outline-none" />
        <textarea value={f.description} onChange={x => setF({ ...f, description: x.target.value })} rows={4} placeholder="Beschreibung: Inhalt, was mitbringen, für wen" className="w-full resize-none outline-none text-[14px]" />
        <div className="grid grid-cols-3 gap-2"><Field label="Datum"><input type="date" value={f.date} onChange={x => setF({ ...f, date: x.target.value })} className={inp} /></Field><Field label="Von"><input type="time" value={f.from} onChange={x => setF({ ...f, from: x.target.value })} className={inp} /></Field><Field label="Bis"><input type="time" value={f.to} onChange={x => setF({ ...f, to: x.target.value })} className={inp} /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Ort"><input value={f.place} onChange={x => setF({ ...f, place: x.target.value })} placeholder="Studio Basel 1" className={inp} /></Field><Field label="Meeting-Link (optional)"><input value={f.link} onChange={x => setF({ ...f, link: x.target.value })} placeholder="https://…" className={inp} /></Field></div>
      </div>
      <div className="space-y-3 text-[14px]">
        <Field label="Art"><select value={f.kind} onChange={x => setF({ ...f, kind: x.target.value })} className={inp}>{['Schulung', 'Meeting', 'Team'].map(k => <option key={k}>{k}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Max. Plätze"><input type="number" min={1} value={f.capacity} onChange={x => setF({ ...f, capacity: x.target.value })} placeholder="unbegrenzt" className={inp} /></Field><Field label="Anmeldung bis"><input type="date" value={f.until} onChange={x => setF({ ...f, until: x.target.value })} className={inp} /></Field></div>
        <Field label="Studios"><div className="flex flex-wrap gap-1.5">{branches.filter(b => !b.is_office).map(b => <button key={b.id} onClick={() => tog('branches', b.id)} className={`px-2.5 h-7 rounded-[8px] text-[12px] ${f.branches.includes(b.id) ? 'bg-olive-700 text-white' : 'bg-white text-ink/80'}`}>{b.name}</button>)}</div></Field>
        <Field label="Skills (Zielgruppe)"><div className="flex flex-wrap gap-1.5">{skillCatalog.map(s => <button key={s} onClick={() => tog('skills', s)} className={`px-2.5 h-7 rounded-[8px] text-[12px] ${f.skills.includes(s) ? 'bg-olive-700 text-white' : 'bg-white text-ink/80'}`}>{s}</button>)}</div></Field>
        <Err m={err} /><button onClick={save} className={`${btn} w-full`}>Anlegen</button>
      </div>
    </Panel>}
    <div className="grid grid-cols-[1fr_320px] gap-8">
      <div><table className="tbl w-full text-[14px]"><thead><tr><Th>Termin</Th><Th>Datum</Th><Th>Zielgruppe</Th><Th>Plätze</Th></tr></thead>
        <tbody className="divide-y divide-line">{events.map(x => <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${sel === x.id ? 'bg-sage-50' : ''}`}><td className="px-4 py-3">{x.title}<p className="text-xs text-mute">{x.registerUntil ? `Anmeldung bis ${fmtDate(x.registerUntil, { day: '2-digit', month: '2-digit' })}` : x.kind}</p></td>
          <td className="px-4 text-mute">{fmtDate(x.startsAt)}, {fmtTime(x.startsAt)}{x.endsAt ? `–${fmtTime(x.endsAt)}` : ''}</td>
          <td className="px-4 text-mute">{[...x.audienceBranches.map(id => branches.find(b => b.id === id)?.name), ...x.audienceSkills].filter(Boolean).join(', ') || 'Alle'}</td>
          <td className="px-4 text-mute">{x.taken}{x.capacity ? `/${x.capacity}` : ''}</td></tr>)}</tbody></table></div>
      {e && <Side><p className="font-medium">{e.title}</p><p className="text-xs text-mute mt-1">{e.taken} Anmeldungen · {e.link ? 'Online' : e.place}</p>
        {e.description && <p className="mt-2 text-[13px]">{e.description}</p>}
        {([['Zusagen', people], ['Absagen', nope], ['Noch keine Antwort', open]] as const).map(([l, ps]) => <div key={l} className="mt-4"><Sec>{`${l} · ${ps.length}`}</Sec><div className="divide-y divide-line">{ps.length === 0 && <p className="py-2 text-[13px] text-mute">Niemand.</p>}{ps.map(p => <p key={p!.id} className="py-2 text-[13px]">{p!.first} {p!.last} <span className="text-mute">· {p!.branch}</span></p>)}</div></div>)}
        {me.app_role === 'buero' && <button onClick={async () => { if (confirm('Diesen Termin löschen? Anmeldungen gehen verloren.')) { await supabase!.from('events').delete().eq('id', e.id); setSel(null); await reload() } }} className="mt-3 text-[13px] text-mute flex items-center gap-1"><Trash2 size={13} />Löschen</button>}
      </Side>}
    </div>
  </>)
}

/* ---------- Aushilfe (Pikett): wer kann an welchem Tag einspringen? ---------- */
function StandbyAdmin() {
  const { standby, staff, skillCatalog, me } = useApp()
  const days = Array.from({ length: 14 }, (_, i) => isoDay(new Date(Date.now() + i * 864e5)))
  const [day, setDay] = useState(days[0]), [sk, setSk] = useState<string[]>([])
  const label = (d: string, o: Intl.DateTimeFormatOptions) => fmtDate(d + 'T12:00:00Z', o)
  const on = (d: string) => standby.filter(x => x.day === d).map(x => staff.find(s => s.id === x.employee_id)).filter((s): s is NonNullable<typeof s> => !!s && s.active)
    .filter(s => sk.length === 0 || s.skills.some(k => sk.includes(k)))
  const list = on(day)
  const in60 = (id: string) => standby.filter(x => x.employee_id === id && x.day <= isoDay(new Date(Date.now() + 60 * 864e5))).length
  const ranking = staff.filter(s => real(s) && s.branch_id !== 'buero' && (me.app_role === 'buero' || inBranch(s, me.branch_id) || (me.extra ?? []).some(b => inBranch(s, b)))).map(s => ({ s, n: in60(s.id) })).sort((a, b) => b.n - a.n)
  return (<>
    <H>Aushilfe</H>
    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">{days.map(d => { const n = on(d).length
      return <button key={d} onClick={() => setDay(d)} className={`shrink-0 w-[60px] py-2 rounded-[10px] text-center transition ${d === day ? 'bg-olive-700 text-white' : 'bg-sage-50 hover:bg-sage-100'}`}>
        <span className={`block text-[11px] ${d === day ? 'text-sage-200' : 'text-mute'}`}>{label(d, { weekday: 'short' })}</span><span className="block font-display text-[16px]">{label(d, { day: 'numeric' })}</span>
        <span className={`block text-[11px] ${d === day ? 'text-sage-200' : n ? 'text-olive-700' : 'text-mute'}`}>{n || '–'}</span></button> })}</div>
    {skillCatalog.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{skillCatalog.map(k => <button key={k} onClick={() => setSk(sk.includes(k) ? sk.filter(x => x !== k) : [...sk, k])} className={`px-2.5 h-7 rounded-[8px] text-[12px] ${sk.includes(k) ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/80'}`}>{k}</button>)}</div>}
    <div className="grid grid-cols-[1fr_300px] gap-8 mt-6">
      <div><Sec>{`${label(day, { weekday: 'long', day: 'numeric', month: 'long' })} · ${list.length} verfügbar`}</Sec>
        {list.length === 0 && <p className="py-3 text-[14px] text-mute">Niemand hat sich für diesen Tag eingetragen.</p>}
        {list.map(s => <div key={s.id} className="py-3 border-b border-line grid grid-cols-[1fr_auto] gap-3 items-center">
          <div><p className="text-[14px]">{s.first} {s.last} <span className="text-mute">· {s.role} · {s.branch}</span></p>{s.skills.length > 0 && <p className="text-xs text-mute mt-0.5">{s.skills.join(', ')}</p>}</div>
          {s.phone ? <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="h-8 px-3 rounded-[8px] bg-sage-50 hover:bg-sage-100 text-[13px] flex items-center gap-1.5"><Phone size={13} />{s.phone}</a> : <span className="text-xs text-mute">keine Nummer</span>}
        </div>)}
      </div>
      <Side><Sec>Eingetragene Tage · nächste 60</Sec><div>{ranking.map(({ s, n }) => <div key={s.id} className="py-2 border-b border-line flex justify-between text-[13px]"><span>{s.first} {s.last} <span className="text-mute">· {s.branch}</span></span><span className={n ? 'tabular-nums' : 'text-mute'}>{n}</span></div>)}</div></Side>
    </div>
  </>)
}

/* ---------- Lernen: Quiz zu News oder Wissensartikel, Nachweis je Person ---------- */
type QEdit = { kind: 'single' | 'multi' | 'text'; prompt: string; options: string[]; correct: number[]; rubric: string }
type QuizEdit = { id?: string; target: 'news' | 'article'; newsId: string; articleId: string; title: string; passPct: number; qs: QEdit[] }
const emptyQ = (): QEdit => ({ kind: 'single', prompt: '', options: ['', ''], correct: [], rubric: '' })
function LearnAdmin() {
  const { quizzes, attempts, news, wiki, staff, me, reload } = useApp()
  const audience = useAudience()
  const isBuero = me.app_role === 'buero'
  const [sel, setSel] = useState<string | null>(null), [edit, setEdit] = useState<QuizEdit | null>(null)
  const [aq, setAq] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => { if (isBuero) supabase!.from('quiz_questions').select('quiz_id').then(({ data }) => { const c: Record<string, number> = {}; for (const r of data ?? []) c[r.quiz_id] = (c[r.quiz_id] ?? 0) + 1; setCounts(c) }) }, [quizzes, isBuero])
  const target = (q: Quiz) => q.newsId ? { kind: 'News', title: news.find(n => n.id === q.newsId)?.title ?? '–' } : { kind: 'Wissen', title: wiki.find(a => a.id === q.articleId)?.title ?? '–' }
  // Wer soll das Quiz machen? News: deren Zielgruppe. Artikel: wer ihn lesen darf. Filialleitung sieht nur ihr Studio.
  const people = (q: Quiz) => {
    let list = q.newsId ? (() => { const n = news.find(x => x.id === q.newsId); return n ? audience(n) : [] })()
      : (() => { const lvl = wiki.find(a => a.id === q.articleId)?.accessLevel ?? 'alle'
        return staff.filter(s => real(s) && (lvl === 'alle' ? s.branch_id !== 'buero' : lvl === 'filialleitung' ? s.app_role !== 'mitarbeiterin' : s.app_role === 'buero')) })()
    if (!isBuero) list = list.filter(s => s.branch_id === me.branch_id)
    return list
  }
  const best = (qid: string, eid: string) => { const a = attempts.filter(x => x.quizId === qid && x.employeeId === eid); return { n: a.length, max: a.length ? Math.max(...a.map(x => x.scorePct)) : null, passedAt: a.find(x => x.passed)?.at ?? null } }
  const passedCount = (q: Quiz) => people(q).filter(p => best(q.id, p.id).passedAt).length

  const openEdit = async (q?: Quiz) => {
    setErr(''); setAq('')
    if (!q) { setEdit({ target: 'news', newsId: '', articleId: '', title: '', passPct: 80, qs: [emptyQ()] }); return }
    const { data } = await supabase!.from('quiz_questions').select('kind, prompt, options, correct, rubric').eq('quiz_id', q.id).order('sort')
    setEdit({ id: q.id, target: q.newsId ? 'news' : 'article', newsId: q.newsId ?? '', articleId: q.articleId ?? '', title: q.title, passPct: q.passPct,
      qs: (data ?? []).map((x: any) => ({ kind: x.kind, prompt: x.prompt, options: x.kind === 'text' ? ['', ''] : x.options, correct: x.correct ?? [], rubric: x.rubric ?? '' })) })
  }
  const setQ = (i: number, patch: Partial<QEdit>) => edit && setEdit({ ...edit, qs: edit.qs.map((q, j) => j === i ? { ...q, ...patch } : q) })
  const save = async () => {
    if (!edit) return
    const ref = edit.target === 'news' ? edit.newsId : edit.articleId
    const qs = edit.qs.map(q => ({ ...q, options: q.options.map(o => o.trim()) })).filter(q => q.prompt.trim())
    if (!ref) { setErr(edit.target === 'news' ? 'Bitte eine News wählen.' : 'Bitte einen Artikel wählen.'); return }
    if (!qs.length) { setErr('Mindestens eine Frage ist nötig.'); return }
    const bad = qs.findIndex(q => q.kind === 'text' ? !q.rubric.trim() : q.options.filter(Boolean).length < 2 || q.correct.length === 0 || q.correct.some(c => !q.options[c]))
    if (bad >= 0) { setErr(qs[bad].kind === 'text' ? `Frage ${bad + 1}: bitte beschreiben, woran eine richtige Antwort zu erkennen ist.` : `Frage ${bad + 1}: mindestens zwei Antworten und eine richtige markieren.`); return }
    setBusy(true); setErr('')
    const row = { news_id: edit.target === 'news' ? ref : null, article_id: edit.target === 'article' ? ref : null, title: edit.title.trim(), pass_pct: Math.min(100, Math.max(1, edit.passPct)), updated_at: new Date().toISOString() }
    const { data, error } = edit.id ? await supabase!.from('quizzes').update(row).eq('id', edit.id).select('id').single() : await supabase!.from('quizzes').insert(row).select('id').single()
    if (error || !data) { setBusy(false); setErr(/duplicate|unique/.test(error?.message ?? '') ? 'Dazu gibt es schon ein Quiz.' : 'Speichern hat nicht geklappt.'); return }
    const { error: de } = await supabase!.from('quiz_questions').delete().eq('quiz_id', data.id)
    if (de) { setBusy(false); setErr('Speichern hat nicht geklappt.'); return }
    // Leere Antworten entfernen und die markierten Indizes nachziehen
    const { error: qe } = await supabase!.from('quiz_questions').insert(qs.map((q, i) => {
      if (q.kind === 'text') return { quiz_id: data.id, sort: i, kind: 'text', prompt: q.prompt.trim(), options: [], correct: [], rubric: q.rubric.trim() }
      const keep = q.options.map((o, j) => o ? j : -1).filter(j => j >= 0)
      return { quiz_id: data.id, sort: i, kind: q.kind, prompt: q.prompt.trim(), options: keep.map(j => q.options[j]), correct: q.correct.filter(c => keep.includes(c)).map(c => keep.indexOf(c)), rubric: '' } }))
    if (qe) { setBusy(false); setErr('Die Fragen liessen sich nicht speichern. Bitte noch einmal speichern.'); return }
    setBusy(false); setEdit(null); setSel(data.id); await reload(); retranslate()
  }
  const taken = new Set(quizzes.filter(q => q.id !== edit?.id).map(q => q.newsId ?? q.articleId))
  const q = quizzes.find(x => x.id === sel)
  const arts = wiki.filter(a => !a.fromNews && !taken.has(a.id) && aq.trim().length > 1 && `${a.title} ${a.cat}`.toLowerCase().includes(aq.toLowerCase())).slice(0, 8)
  const seg = (on: boolean) => `h-8 px-3 rounded-[8px] text-[13px] transition ${on ? 'bg-white text-ink shadow-[0_1px_2px_rgba(29,34,28,.08)]' : 'text-ink/60'}`
  return (<>
    <H action={isBuero && <New onClick={() => openEdit()}>Neues Quiz</New>}>Lernen</H>
    {edit && <Panel className="p-6 mb-8">
      <div className="grid grid-cols-[1fr_280px] gap-8">
        <div className="space-y-4">
          {edit.qs.map((x, i) => <div key={i} className="rounded-[12px] bg-white p-4">
            <div className="flex items-start gap-3"><span className="text-mute text-[13px] pt-2.5">{i + 1}.</span>
              <input value={x.prompt} onChange={e => setQ(i, { prompt: e.target.value })} placeholder="Frage" className={`${inp} !bg-sage-50 font-medium`} />
              <div className="flex gap-1 p-1 rounded-[10px] bg-sage-50 shrink-0">{(['single', 'multi', 'text'] as const).map(k => <button key={k} onClick={() => setQ(i, { kind: k, correct: k === 'single' ? x.correct.slice(0, 1) : x.correct })} className={seg(x.kind === k)}>{k === 'single' ? 'Eine richtig' : k === 'multi' ? 'Mehrere richtig' : 'Freitext'}</button>)}</div>
              <button onClick={() => setEdit({ ...edit, qs: edit.qs.filter((_, j) => j !== i) })} title="Frage entfernen" className="pt-2.5 text-mute hover:text-ink"><Trash2 size={15} /></button></div>
            {x.kind === 'text' ? <div className="mt-3 pl-6"><textarea value={x.rubric} onChange={e => setQ(i, { rubric: e.target.value })} rows={2} placeholder="Woran erkennt die KI eine richtige Antwort? z. B. „Schutz vor Keimen, keine Übertragung zwischen Kundinnen“" className="w-full rounded-[8px] bg-sage-50 px-3 py-2 text-[14px] outline-none resize-none" /></div>
            : <div className="mt-3 pl-6 space-y-1.5">{x.options.map((o, j) => { const on = x.correct.includes(j)
              return <div key={j} className="flex items-center gap-2">
                <button title="Als richtig markieren" onClick={() => setQ(i, { correct: x.kind === 'single' ? [j] : on ? x.correct.filter(c => c !== j) : [...x.correct, j] })} className={`w-5 h-5 shrink-0 flex items-center justify-center ${x.kind === 'single' ? 'rounded-full' : 'rounded-[6px]'} ${on ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92]'}`}>{on && <Check size={12} strokeWidth={3} />}</button>
                <input value={o} onChange={e => setQ(i, { options: x.options.map((y, k) => k === j ? e.target.value : y) })} placeholder={`Antwort ${j + 1}`} className="flex-1 h-9 rounded-[8px] bg-sage-50 px-3 text-[14px] outline-none" />
                {x.options.length > 2 && <button onClick={() => setQ(i, { options: x.options.filter((_, k) => k !== j), correct: x.correct.filter(c => c !== j).map(c => c > j ? c - 1 : c) })} className="text-mute hover:text-ink"><X size={14} /></button>}
              </div> })}
              <button onClick={() => setQ(i, { options: [...x.options, ''] })} className="text-[13px] text-olive-700 pt-1">Antwort hinzufügen</button></div>}
          </div>)}
          <button onClick={() => setEdit({ ...edit, qs: [...edit.qs, emptyQ()] })} className={btn2}>Frage hinzufügen</button>
        </div>
        <div className="space-y-3 text-[14px]">
          <Field label="Gehört zu"><div className="flex gap-1 p-1 rounded-[10px] bg-white">{(['news', 'article'] as const).map(k => <button key={k} onClick={() => setEdit({ ...edit, target: k })} className={`flex-1 ${seg(edit.target === k)} ${edit.target === k ? '!bg-olive-700 !text-white' : ''}`}>{k === 'news' ? 'News' : 'Artikel'}</button>)}</div></Field>
          {edit.target === 'news' ? <Field label="News"><select value={edit.newsId} onChange={e => setEdit({ ...edit, newsId: e.target.value, title: edit.title || (news.find(n => n.id === e.target.value)?.title ?? '') })} className={inp}><option value="">Wählen …</option>{news.filter(n => !taken.has(n.id)).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></Field>
            : <Field label="Artikel">{edit.articleId ? <div className="flex items-center gap-2 h-10 px-3 rounded-[10px] bg-white"><span className="flex-1 truncate">{wiki.find(a => a.id === edit.articleId)?.title}</span><button onClick={() => setEdit({ ...edit, articleId: '' })} className="text-mute"><X size={14} /></button></div>
              : <div className="relative"><input value={aq} onChange={e => setAq(e.target.value)} placeholder="Artikel suchen …" className={inp} />
                {arts.length > 0 && <div className="absolute z-10 left-0 right-0 mt-1 rounded-[10px] bg-white shadow-[0_8px_24px_-12px_rgba(29,34,28,.35)] max-h-56 overflow-y-auto">{arts.map(a => <button key={a.id} onClick={() => { setEdit({ ...edit, articleId: a.id, title: edit.title || a.title }); setAq('') }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-sage-50">{a.title} <span className="text-mute">· {a.cat}</span></button>)}</div>}</div>}</Field>}
          <Field label="Titel"><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} className={inp} /></Field>
          <Field label="Bestanden ab (%)"><input type="number" min={1} max={100} value={edit.passPct} onChange={e => setEdit({ ...edit, passPct: Number(e.target.value) })} className={inp} /></Field>
          <Err m={err} />
          <div className="flex gap-2"><button disabled={busy} onClick={save} className={`${btn} flex-1`}>Speichern</button><button onClick={() => setEdit(null)} className="h-10 px-3 rounded-[10px] text-mute hover:text-ink">Abbrechen</button></div>
        </div>
      </div>
    </Panel>}
    <div className={`grid gap-8 ${q ? 'grid-cols-[1fr_340px]' : 'grid-cols-1'}`}>
      <div><table className="tbl w-full text-[14px]"><thead><tr><Th>Quiz</Th><Th>Gehört zu</Th>{isBuero && <Th>Fragen</Th>}<Th>Bestanden</Th></tr></thead>
        <tbody className="divide-y divide-line">{quizzes.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-mute">Noch kein Quiz.</td></tr>}
          {quizzes.map(x => { const tg = target(x), ps = people(x).length, pc = passedCount(x)
            return <tr key={x.id} onClick={() => setSel(x.id === sel ? null : x.id)} className={`cursor-pointer ${sel === x.id ? 'bg-sage-50' : 'hover:bg-sage-50/70'}`}>
              <td className="px-4 py-3">{x.title || tg.title}{x.sample && <span className="ml-2 text-xs text-mute">Beispiel</span>}<p className="text-xs text-mute">ab {x.passPct} %</p></td>
              <td className="px-4 text-mute">{tg.kind} · {tg.title}</td>{isBuero && <td className="px-4 text-mute">{counts[x.id] ?? '–'}</td>}
              <td className="px-4 w-44"><div className="flex items-center gap-2"><Bar p={ps ? pc / ps * 100 : 0} /><span className="text-xs text-mute tabular-nums whitespace-nowrap">{pc}/{ps}</span></div></td></tr> })}</tbody></table></div>
      {q && <Side><p className="font-medium">{q.title || target(q).title}</p><p className="text-xs text-mute mt-1">{target(q).kind} · bestanden ab {q.passPct} %</p>
        {isBuero && <div className="mt-3 flex gap-3 text-[13px]"><button onClick={() => openEdit(q)} className="text-olive-700">Bearbeiten</button>
          <button onClick={async () => { if (confirm('Dieses Quiz löschen? Die Ergebnisse gehen verloren.')) { await supabase!.from('quizzes').delete().eq('id', q.id); setSel(null); await reload() } }} className="text-mute hover:text-ink flex items-center gap-1"><Trash2 size={13} />Löschen</button></div>}
        <div className="mt-5"><Sec>Nachweis</Sec><div className="divide-y divide-line max-h-[520px] overflow-y-auto no-scrollbar">{people(q).map(p => { const b = best(q.id, p.id)
          return <div key={p.id} className="py-2 flex items-center justify-between gap-3 text-[13px]"><span className="truncate">{p.first} {p.last} <span className="text-mute">· {p.branch}</span></span>
            {b.passedAt ? <span className="inline-flex items-center gap-1.5 shrink-0"><span className="w-[7px] h-[7px] rounded-full bg-ok" />{fmtDate(b.passedAt, { day: '2-digit', month: '2-digit' })}</span>
              : b.n ? <span className="text-mute shrink-0">{b.max} % · {b.n}×</span> : <span className="text-mute shrink-0">offen</span>}</div> })}</div></div>
      </Side>}
    </div>
  </>)
}

/* ---------- Team & Skills ----------
   Büro: alle Personen, Rechte, Studio, Funktion, Skill-Katalog, endgültig löschen.
   Filialleitung: Personen des eigenen Studios, Skills vergeben, Mitarbeiterinnen anlegen und deaktivieren. */
function TeamAdmin() {
  const { staff, branches, skillCatalog, reload, me } = useApp()
  const office = me.app_role === 'buero'
  const myB = [me.branch_id, ...(me.extra ?? [])].filter(x => x !== 'buero')
  const studios = branches.filter(x => office || myB.includes(x.id))
  const [q, setQ] = useState(''), [b, setB] = useState('Alle'), [form, setForm] = useState(false), [skill, setSkill] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', job_title: 'Kosmetikerin', app_role: 'mitarbeiterin', branch_id: studios.find(x => !x.is_office)?.id ?? 'basel-1' })
  const visible = staff.filter(s => office || myB.some(x => inBranch(s, x)))
  const list = useMemo(() => visible.filter(s => (b === 'Alle' || s.branch === b) && `${s.first} ${s.last} ${s.role} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase())), [visible, q, b]) // eslint-disable-line react-hooks/exhaustive-deps
  const p = visible.find(s => s.id === sel) ?? null
  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase!.functions.invoke('admin-employee', { body })
    if (!error) return data
    try { return (await (error as { context?: Response }).context?.json()) ?? { ok: false, error: 'failed' } } catch { return { ok: false, error: 'failed' } }
  }
  const create = async () => {
    setBusy(true); setErr('')
    const r = await call({ action: 'create', ...f, app_role: office ? f.app_role : 'mitarbeiterin' })
    setBusy(false)
    if (!r?.ok) { setErr(r?.error === 'exists' ? 'Diese E-Mail gibt es schon.' : r?.error === 'missing_fields' ? 'Vorname, Nachname, eine gültige E-Mail und Studio sind nötig.' : r?.error === 'auth_failed' ? 'Das Login-Konto liess sich nicht anlegen. Bitte noch einmal versuchen.' : r?.error === 'forbidden' ? 'Für dieses Studio darfst du niemanden anlegen.' : 'Anlegen hat nicht geklappt.'); return }
    setForm(false); setF({ ...f, first_name: '', last_name: '', email: '' }); await reload(); setSel(r.employee_id); toast('Person angelegt')
  }
  return (<>
    <H action={<New onClick={() => setForm(!form)}>Person anlegen</New>}>{office ? 'Team & Skills' : `Team · ${studios.map(x => x.name).join(', ')}`}</H>
    {form && <Panel className="p-6 mb-8"><div className="grid grid-cols-3 gap-3">
      <Field label="Vorname"><input value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} className={inp} /></Field>
      <Field label="Nachname"><input value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} className={inp} /></Field>
      <Field label="Firmen-Mail"><input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="vorname@beautylounge.ch" className={inp} /></Field>
      <Field label="Funktion"><input value={f.job_title} onChange={e => setF({ ...f, job_title: e.target.value })} className={inp} /></Field>
      {office && <Field label="Rechte"><select value={f.app_role} onChange={e => setF({ ...f, app_role: e.target.value })} className={inp}><option value="mitarbeiterin">Mitarbeiterin</option><option value="filialleitung">Filialleitung</option><option value="buero">Büro</option></select></Field>}
      <Field label="Studio"><select value={f.branch_id} onChange={e => setF({ ...f, branch_id: e.target.value })} className={inp}>{studios.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
    </div><div className="mt-4 flex items-center gap-3"><button disabled={busy} onClick={create} className={btn}>Anlegen</button><Err m={err} /><p className="text-xs text-mute">Es geht keine Einladung raus. Sie meldet sich mit ihrer Firmen-Mail und dem Code an, den sie per E-Mail bekommt.</p></div></Panel>}
    <div className="flex gap-3 mb-4"><div className="h-10 flex-1 rounded-[10px] bg-sage-50 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, Funktion oder Skill" className="flex-1 outline-none text-[14px] bg-transparent" /></div>
      {studios.length > 1 && <select value={b} onChange={e => setB(e.target.value)} className="h-10 rounded-[10px] bg-sage-50 px-3 text-[14px] outline-none">{['Alle', ...studios.map(x => x.name)].map(x => <option key={x}>{x}</option>)}</select>}</div>
    <div className="grid grid-cols-[1fr_320px] gap-8">
      <div><table className="tbl w-full text-[14px]"><thead><tr><Th>Name</Th><Th>Funktion</Th><Th>Studio</Th><Th>Skills</Th></tr></thead>
        <tbody className="divide-y divide-line">{list.map(s => <tr key={s.id} onClick={() => setSel(s.id)} className={`cursor-pointer ${sel === s.id ? 'bg-sage-50' : 'hover:bg-sage-50/60'} ${s.active ? '' : 'opacity-50'}`}>
          <td className="px-4 py-2.5">{s.first} {s.last}{!real(s) && s.active && <span className="ml-2 text-xs text-mute">Test</span>}{!s.active && <span className="ml-2 text-xs text-mute">deaktiviert</span>}</td>
          <td className="px-4 text-mute">{s.role}</td><td className="px-4 text-mute">{s.branch}</td>
          <td className="px-4 text-mute text-[13px]">{s.skills.length ? s.skills.slice(0, 3).join(', ') + (s.skills.length > 3 ? ` +${s.skills.length - 3}` : '') : <span className="text-brass">noch keine</span>}</td></tr>)}</tbody></table></div>
      {p ? <PersonPanel key={p.id} p={p} office={office} studios={studios} call={call} onClose={() => setSel(null)} />
        : <Side>{office ? <><Sec>Skill-Katalog</Sec>
          <div className="mt-3 flex flex-wrap gap-1.5">{skillCatalog.map(k => <span key={k} className="px-2.5 h-7 rounded-[6px] bg-sage-50 text-[12px] flex items-center gap-1.5">{k}<button onClick={async () => { const n = staff.filter(x => x.skills.includes(k)).length; if (!confirm(`Skill „${k}“ löschen?${n ? ` ${n} Personen verlieren ihn aus dem Profil.` : ''}`)) return; const { error } = await supabase!.rpc('delete_skill', { p_name: k }); if (error) toast('Löschen hat nicht geklappt', 'error'); else toast('Skill gelöscht'); await reload() }} className="text-mute hover:text-alert"><X size={12} /></button></span>)}</div>
          <div className="mt-3 flex gap-2"><input value={skill} onChange={e => setSkill(e.target.value)} placeholder="Neuer Skill" className={inp} /><button onClick={async () => { if (skill.trim()) { const { error } = await supabase!.from('skills').insert({ name: skill.trim(), sort: skillCatalog.length }); setSkill(''); toast(error ? 'Gibt es schon' : 'Skill angelegt', error ? 'error' : 'ok'); await reload() } }} className={btn2}>Hinzufügen</button></div>
          <p className="mt-6 text-xs text-mute">Eine Person anklicken, um Skills zu vergeben.</p></>
          : <p className="text-[13px] text-mute">Eine Person anklicken, um ihre Skills zu vergeben oder sie zu deaktivieren.</p>}</Side>}
    </div>
  </>)
}

function PersonPanel({ p, office, studios, call, onClose }: { p: Staff; office: boolean; studios: { id: string; name: string }[]; call: (b: Record<string, unknown>) => Promise<any>; onClose: () => void }) {
  const { skillCatalog, reload, me } = useApp()
  const [skills, setSkills] = useState(p.skills)
  const [d, setD] = useState({ job_title: p.role, app_role: p.app_role, branch_id: p.branch_id })
  const dirty = d.job_title !== p.role || d.app_role !== p.app_role || d.branch_id !== p.branch_id
  const tog = async (k: string) => {
    const next = skills.includes(k) ? skills.filter(x => x !== k) : [...skills, k]
    setSkills(next)
    const { error } = await supabase!.from('employees').update({ skills: next, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) { setSkills(skills); toast('Speichern hat nicht geklappt', 'error') } else { toast('Skills gespeichert'); reload() }
  }
  const saveRole = async () => {
    const { error } = await supabase!.from('employees').update({ ...d, updated_at: new Date().toISOString() }).eq('id', p.id)
    toast(error ? 'Speichern hat nicht geklappt' : 'Gespeichert', error ? 'error' : 'ok'); if (!error) reload()
  }
  const self = p.id === me.id
  return (
    <Side>
      <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-[16px]">{p.first} {p.last}</p><p className="text-[13px] text-mute">{p.role} · {p.branch}</p></div><button onClick={onClose} className="text-mute hover:text-ink"><X size={16} /></button></div>
      <div className="mt-4 space-y-1.5 text-[13px]">
        <p className="flex items-center justify-between gap-2"><span className="text-mute">E-Mail</span><button onClick={() => { navigator.clipboard?.writeText(p.email).then(() => toast('Kopiert')) }} className="truncate hover:text-olive-700" title="Kopieren">{p.email}</button></p>
        {p.phone && <p className="flex items-center justify-between gap-2"><span className="text-mute">Telefon</span><button onClick={() => { navigator.clipboard?.writeText(p.phone!).then(() => toast('Kopiert')) }} className="hover:text-olive-700" title="Kopieren">{p.phone}</button></p>}
      </div>
      <Sec>Skills</Sec>
      <div className="mt-2 flex flex-wrap gap-1.5">{skillCatalog.map(k => <button key={k} onClick={() => tog(k)} className={`px-2.5 h-8 rounded-[8px] text-[13px] transition ${skills.includes(k) ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink hover:bg-sage-100'}`}>{k}</button>)}</div>
      {office && <>
        <Sec>Funktion und Rechte</Sec>
        <div className="mt-2 space-y-2">
          <input value={d.job_title} onChange={e => setD({ ...d, job_title: e.target.value })} className={inp} />
          <div className="grid grid-cols-2 gap-2">
            <select value={d.app_role} disabled={self} onChange={e => setD({ ...d, app_role: e.target.value })} className={inp}><option value="mitarbeiterin">Mitarbeiterin</option><option value="filialleitung">Filialleitung</option><option value="buero">Büro</option></select>
            <select value={d.branch_id} onChange={e => setD({ ...d, branch_id: e.target.value })} className={inp}>{studios.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </div>
          {dirty && <button onClick={saveRole} className={`${btn} w-full`}>Speichern</button>}
        </div>
      </>}
      {!self && (office || p.app_role !== 'buero') && <div className="mt-6 pt-4 border-t border-line flex flex-col gap-2 text-[13px]">
        <button onClick={async () => { if (!confirm(p.active ? `${p.first} ${p.last} deaktivieren? Sie kann sich dann nicht mehr anmelden. Ihr Verlauf bleibt.` : `${p.first} ${p.last} wieder aktivieren?`)) return; const r = await call({ action: 'set_active', employee_id: p.id, active: !p.active }); toast(r?.ok ? (p.active ? 'Deaktiviert' : 'Aktiviert') : 'Das hat nicht geklappt', r?.ok ? 'ok' : 'error'); await reload() }} className="text-left text-mute hover:text-ink">{p.active ? 'Deaktivieren' : 'Wieder aktivieren'}</button>
        {office && <button onClick={async () => { if (!confirm(`${p.first} ${p.last} endgültig löschen? Profil, Lesebestätigungen, Quiz-Ergebnisse und Login werden entfernt. Meldungen und Nachweise behalten ihren Namen. Das lässt sich nicht rückgängig machen.`)) return; const r = await call({ action: 'delete', employee_id: p.id }); toast(r?.ok ? 'Gelöscht' : 'Löschen hat nicht geklappt', r?.ok ? 'ok' : 'error'); if (r?.ok) { onClose(); await reload() } }} className="text-left text-alert/80 hover:text-alert">Endgültig löschen</button>}
      </div>}
    </Side>
  )
}

/* ---------- Studios (nur Büro; RLS branches_write) ---------- */
type StudioRow = { id: string; name: string; is_office: boolean; sort: number; phorest_branch_id: string | null; facility_email: string | null }
const slug = (n: string) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function StudiosAdmin() {
  const { staff, reload } = useApp()
  const [rows, setRows] = useState<StudioRow[] | null>(null), [err, setErr] = useState(''), [form, setForm] = useState(false)
  const [f, setF] = useState({ name: '', phorest_branch_id: '' }), [edit, setEdit] = useState<StudioRow | null>(null)
  const load = async () => { const { data } = await supabase!.from('branches').select('id, name, is_office, sort, phorest_branch_id, facility_email').order('sort'); setRows((data ?? []) as StudioRow[]) }
  useEffect(() => { load() }, [])
  const count = (id: string) => staff.filter(s => real(s) && s.branch_id === id).length
  const done = async (error: { message: string } | null, msg: string) => { if (error) { setErr(msg); return false } setErr(''); await load(); await reload(); return true }
  const add = async () => {
    const name = f.name.trim(), id = slug(name)
    if (!name || !id) { setErr('Bitte einen Namen eingeben.'); return }
    if (rows?.some(r => r.id === id || r.name.toLowerCase() === name.toLowerCase())) { setErr('Dieses Studio gibt es schon.'); return }
    const sort = Math.max(0, ...(rows ?? []).filter(r => !r.is_office).map(r => r.sort)) + 1
    const { error } = await supabase!.from('branches').insert({ id, name, sort, phorest_branch_id: f.phorest_branch_id.trim() || null })
    // Büro bleibt unten
    if (!error) for (const o of (rows ?? []).filter(r => r.is_office && r.sort <= sort)) await supabase!.from('branches').update({ sort: sort + 1 }).eq('id', o.id)
    if (await done(error, 'Anlegen hat nicht geklappt.')) { setF({ name: '', phorest_branch_id: '' }); setForm(false) }
  }
  const save = async () => {
    if (!edit || !edit.name.trim()) return
    const { error } = await supabase!.from('branches').update({ name: edit.name.trim(), phorest_branch_id: edit.phorest_branch_id?.trim() || null, facility_email: edit.facility_email?.trim() || null }).eq('id', edit.id)
    if (await done(error, 'Speichern hat nicht geklappt. Gibt es den Namen schon?')) setEdit(null)
  }
  const move = async (i: number, d: -1 | 1) => {
    if (!rows) return
    const a = rows[i], b = rows[i + d]; if (!a || !b) return
    await supabase!.from('branches').update({ sort: b.sort }).eq('id', a.id)
    const { error } = await supabase!.from('branches').update({ sort: a.sort }).eq('id', b.id)
    await done(error, 'Reihenfolge konnte nicht gespeichert werden.')
  }
  const remove = async (r: StudioRow) => {
    if (count(r.id) > 0 || staff.some(s => s.branch_id === r.id)) { setErr(`${r.name} hat noch Personen. Bitte zuerst umziehen oder deaktivieren.`); return }
    if (!confirm(`${r.name} löschen?`)) return
    const { error } = await supabase!.from('branches').delete().eq('id', r.id)
    await done(error, `${r.name} wird noch verwendet (Aufgaben, Meldungen oder Phorest) und kann nicht gelöscht werden.`)
  }
  return (<>
    <H action={<New onClick={() => setForm(!form)}>Studio anlegen</New>}>Studios</H>
    {form && <Panel className="p-6 mb-8"><div className="grid grid-cols-2 gap-3">
      <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="z. B. Liestal" className={inp} /></Field>
      <Field label="Phorest-Filial-ID (optional)"><input value={f.phorest_branch_id} onChange={e => setF({ ...f, phorest_branch_id: e.target.value })} className={inp} /></Field>
    </div><div className="mt-4 flex items-center gap-3"><button onClick={add} className={btn}>Anlegen</button></div></Panel>}
    <Err m={err} />
    <div className="mt-2"><table className="tbl w-full text-[14px]"><thead><tr><Th>Studio</Th><Th>Personen</Th><Th>Phorest</Th><Th>Facility-Mail</Th><Th> </Th></tr></thead>
      <tbody className="divide-y divide-line">{(rows ?? []).map((r, i) => edit?.id === r.id
        ? <tr key={r.id}><td className="px-4 py-2"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} className={`${inp} !bg-sage-50`} /></td><td className="px-4 text-mute">{count(r.id)}</td>
            <td className="px-4"><input value={edit.phorest_branch_id ?? ''} onChange={e => setEdit({ ...edit, phorest_branch_id: e.target.value })} className={`${inp} !bg-sage-50`} /></td>
            <td className="px-4"><input value={edit.facility_email ?? ''} onChange={e => setEdit({ ...edit, facility_email: e.target.value })} placeholder="zentrale Adresse" className={`${inp} !bg-sage-50`} /></td>
            <td className="px-4 whitespace-nowrap"><button onClick={save} className="h-8 px-3 rounded-[8px] bg-olive-700 text-white text-[13px]">Speichern</button><button onClick={() => setEdit(null)} className="ml-3 text-[13px] text-mute hover:text-ink">Abbrechen</button></td></tr>
        : <tr key={r.id}><td className="px-4 py-2.5">{r.name}{r.is_office && <span className="ml-2 text-xs text-mute">Büro</span>}</td><td className="px-4 text-mute">{count(r.id)}</td>
            <td className="px-4 text-mute text-[13px]">{r.is_office ? '–' : <span className="inline-flex items-center gap-1.5"><span className={`w-[7px] h-[7px] rounded-full ${r.phorest_branch_id ? 'bg-ok' : 'bg-sage-400'}`} />{r.phorest_branch_id ? 'verbunden' : 'nicht verbunden'}</span>}</td>
            <td className="px-4 text-mute text-[13px]">{r.facility_email || 'zentrale Adresse'}</td>
            <td className="px-4 whitespace-nowrap text-right"><button aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-mute disabled:opacity-30"><ArrowUp size={15} /></button><button aria-label="nach unten" disabled={i === (rows?.length ?? 0) - 1} onClick={() => move(i, 1)} className="p-1 text-mute disabled:opacity-30"><ArrowDown size={15} /></button>
              <button onClick={() => setEdit(r)} className="ml-3 text-[13px] text-mute hover:text-ink">Bearbeiten</button>{!r.is_office && <button onClick={() => remove(r)} className="ml-3 text-[13px] text-mute hover:text-ink">Löschen</button>}</td></tr>)}</tbody></table></div>
    <DemoSwitch />
    <MailSettings />
  </>)
}

/* ---------- Beispielinhalte ein/aus (gilt für alle) ---------- */
function DemoSwitch() {
  const { demoData, setDemoData } = useApp()
  const [busy, setBusy] = useState(false)
  return (
    <div className="mt-12 pt-6 border-t border-line flex items-start justify-between gap-4">
      <div><p className="rubric text-ink/70">Beispielinhalte</p>
        <p className="text-[14px] mt-3">Beispiel-News, -Schulungen, -Aufgaben und -Artikel {demoData ? 'werden angezeigt' : 'sind ausgeblendet'}</p>
        <p className="text-xs text-mute mt-1">Gilt für alle. Vor dem Pilot ausschalten. Gelöscht wird nichts.</p></div>
      <button disabled={busy} role="switch" aria-checked={demoData} onClick={async () => { if (!confirm(demoData ? 'Beispielinhalte für alle ausblenden?' : 'Beispielinhalte für alle wieder einblenden?')) return; setBusy(true); await setDemoData(!demoData); setBusy(false) }}
        className={`relative shrink-0 w-11 h-6 rounded-full transition disabled:opacity-50 ${demoData ? 'bg-olive-700' : 'bg-sage-200'}`}><span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${demoData ? 'left-[23px]' : 'left-[3px]'}`} /></button>
    </div>
  )
}

/* ---------- E-Mail-Versand (Facility, Einladungen, Erinnerungen) ---------- */
type MailLog = { at: string; kind: string; recipient: string; subject: string; status: string; error: string | null }
function MailSettings() {
  const [st, setSt] = useState<{ keySet: boolean; enabled: boolean; from: string; log: MailLog[] } | null>(null)
  const [central, setCentral] = useState(''), [days, setDays] = useState(2), [msg, setMsg] = useState(''), [preview, setPreview] = useState<string | null>(null)
  const load = async () => {
    const { data } = await supabase!.functions.invoke('mailer', { body: { action: 'status' } })
    setSt(data?.ok ? data : { keySet: false, enabled: false, from: '', log: [] })
    const { data: rows } = await supabase!.from('app_settings').select('key, value')
    for (const r of rows ?? []) { if (r.key === 'facility_email') setCentral(String(r.value ?? '')); if (r.key === 'event_reminder_days') setDays(Number(r.value) || 2) }
  }
  useEffect(() => { load() }, [])
  const put = (key: string, value: unknown) => supabase!.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() })
  const toggle = async () => {
    if (!st) return
    if (!st.enabled && !confirm('E-Mail-Versand einschalten? Ab dann gehen echte Mails an Facility und Mitarbeiterinnen (Einladungen, Erinnerungen).')) return
    await put('mail_enabled', !st.enabled); await load()
  }
  const save = async () => {
    const [a, b] = await Promise.all([put('facility_email', central.trim()), put('event_reminder_days', Math.max(1, Math.min(14, days)))])
    setMsg(a.error || b.error ? 'Speichern hat nicht geklappt.' : 'Gespeichert.'); setTimeout(() => setMsg(''), 2500)
  }
  const showPreview = async () => { const { data } = await supabase!.functions.invoke('mailer', { body: { action: 'preview' } }); setPreview(data?.html ?? null) }
  if (!st) return null
  return (
    <div className="mt-12 pt-6 border-t border-line">
      <div className="flex items-start justify-between gap-4">
        <div><p className="rubric text-ink/70">E-Mail-Versand</p>
          <p className="text-[14px] mt-3 inline-flex items-center gap-2"><span className={`w-[7px] h-[7px] rounded-full ${st.keySet && st.enabled ? 'bg-ok' : 'bg-sage-400'}`} />{!st.keySet ? 'Kein Resend-Schlüssel, es geht nichts raus' : st.enabled ? `Eingeschaltet · Absender ${st.from}` : 'Ausgeschaltet, es geht nichts raus'}</p></div>
        <button disabled={!st.keySet} onClick={toggle} className={`${st.enabled ? btn2 : btn} shrink-0 disabled:opacity-40`}>{st.enabled ? 'Ausschalten' : 'Einschalten'}</button>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_180px_auto] gap-3 items-end">
        <Field label="Zentrale Facility-Adresse (für Studios ohne eigene)"><input value={central} onChange={e => setCentral(e.target.value)} placeholder="facility@beautylounge.ch" className={`${inp} !bg-sage-50`} /></Field>
        <Field label="Erinnerung vor Schulung (Tage)"><input type="number" min={1} max={14} value={days} onChange={e => setDays(Number(e.target.value))} className={`${inp} !bg-sage-50`} /></Field>
        <div className="flex items-center gap-3"><button onClick={save} className={btn}>Speichern</button><button onClick={showPreview} className="text-[13px] text-olive-700">Vorschau</button></div>
      </div>
      {msg && <p className="mt-2 text-[13px] text-sage-800">{msg}</p>}
      {preview && <div className="mt-4 rounded-[16px] border border-line overflow-hidden"><div className="flex justify-between px-3 py-2 text-xs text-mute bg-sage-50"><span>Vorschau einer Facility-Meldung (wird nicht versendet)</span><button onClick={() => setPreview(null)}><X size={13} /></button></div><iframe title="Vorschau" srcDoc={preview} className="w-full h-[420px] bg-white" /></div>}
      {st.log.length > 0 && <table className="tbl mt-6 w-full text-[13px]"><thead><tr><Th>Zeit</Th><Th>Art</Th><Th>An</Th><Th>Betreff</Th><Th>Status</Th></tr></thead>
        <tbody className="divide-y divide-line">{st.log.map((l, i) => <tr key={i}><td className="px-4 py-2 text-mute">{fmtDate(l.at, { day: '2-digit', month: '2-digit' })} {fmtTime(l.at)}</td><td className="px-4">{l.kind}</td><td className="px-4 text-mute">{l.recipient}</td><td className="px-4">{l.subject}</td><td className={`px-4 ${l.status === 'fehler' ? 'text-alert' : 'text-mute'}`} title={l.error ?? ''}>{l.status}</td></tr>)}</tbody></table>}
    </div>
  )
}

/* ---------- Wissen ---------- */
type Edit = { id?: string; imported: boolean; category: string; title: string; intro: string; body: string; minutes: number; media_kind: string; media_url: string; published: boolean; access_level: string }
const LEVEL = { alle: 'Alle', filialleitung: 'Filialleitung + Büro', buero: 'Nur Büro' } as Record<string, string>
function WikiAdmin() {
  const { wiki, allSteps, reloadWiki, reload } = useApp()
  const obProposal = allSteps.filter(x => x.proposed)
  const own = wiki.filter(a => !a.fromNews)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Edit | null>(null)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const openEdit = async (id: string) => {
    const { data } = await supabase!.from('wiki_articles').select('*').eq('id', id).single()
    if (data) setEdit({ id: data.id, imported: !!data.blocks, category: data.category, title: data.title, intro: data.intro ?? '', body: data.body ?? '', minutes: data.minutes, media_kind: data.media_kind, media_url: data.media_url ?? '', published: data.published, access_level: data.access_level })
  }
  const save = async () => {
    if (!edit || !edit.title.trim() || !edit.category.trim()) { setErr('Titel und Kategorie sind nötig.'); return }
    const meta = { category: edit.category.trim(), title: edit.title.trim(), intro: edit.intro.trim(), minutes: edit.minutes, published: edit.published, access_level: edit.access_level, updated_at: new Date().toISOString() }
    // Importierte Artikel behalten ihren Aufbau (Bilder, Listen, Dateien); hier nur Rahmendaten
    const row = edit.imported ? meta : { ...meta, body: edit.body.trim(), media_kind: edit.media_kind, media_url: edit.media_url || null }
    const { error } = edit.id ? await supabase!.from('wiki_articles').update(row).eq('id', edit.id) : await supabase!.from('wiki_articles').insert({ ...row, sort: own.length })
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    setEdit(null); setErr(''); await reloadWiki(); retranslate()
  }
  const upload = async (f: File) => {
    const path = `wiki/${edit?.access_level ?? 'alle'}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase!.storage.from('media').upload(path, f, { contentType: f.type })
    if (!error && edit) setEdit({ ...edit, media_url: path, media_kind: f.type.startsWith('video') ? 'video' : 'photo' })
  }
  const list = own.filter(a => [a.title, a.cat, ...a.tags].join(' ').toLowerCase().includes(q.toLowerCase()))
  return (<>
    <H action={<New onClick={() => setEdit({ imported: false, category: '', title: '', intro: '', body: '', minutes: 3, media_kind: 'none', media_url: '', published: true, access_level: 'alle' })}>Neuer Artikel</New>}>Wissen</H>
    {edit && <Panel className="p-6 mb-8 grid grid-cols-[1fr_260px] gap-6">
      <div className="space-y-3"><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="Titel" className="w-full text-[18px] font-medium outline-none" />
        <input value={edit.intro} onChange={e => setEdit({ ...edit, intro: e.target.value })} placeholder="Kurzfassung (optional)" className="w-full text-[14px] text-mute outline-none" />
        {edit.imported ? <p className="text-[13px] text-mute">Aus dem bisherigen Wiki übernommen. Der Inhalt ist hier nicht bearbeitbar.</p>
          : <textarea value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} rows={10} placeholder="Text. Absätze mit einer Leerzeile trennen, Schritte als 1., 2., 3." className="w-full resize-none outline-none text-[14px]" />}</div>
      <div className="space-y-3 text-[14px]">
        <Field label="Kategorie"><input value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} list="wiki-cats" placeholder="z. B. Hygiene" className={inp} /><datalist id="wiki-cats">{[...new Set(own.map(a => a.cat))].map(c => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Sichtbar für"><select value={edit.access_level} onChange={e => setEdit({ ...edit, access_level: e.target.value })} className={inp}>{Object.entries(LEVEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Lesezeit (Min.)"><input type="number" min={1} value={edit.minutes} onChange={e => setEdit({ ...edit, minutes: Number(e.target.value) })} className={inp} /></Field>
        {!edit.imported && <><Field label="Medien"><select value={edit.media_kind} onChange={e => setEdit({ ...edit, media_kind: e.target.value })} className={inp}><option value="none">Keine</option><option value="photo">Foto</option><option value="video">Internes Video</option><option value="youtube">YouTube</option></select></Field>
          {edit.media_kind === 'youtube' && <Field label="YouTube-Link"><input value={edit.media_url} onChange={e => setEdit({ ...edit, media_url: e.target.value })} placeholder="https://youtu.be/…" className={inp} /></Field>}
          {(edit.media_kind === 'photo' || edit.media_kind === 'video') && <><button onClick={() => file.current?.click()} className="w-full h-10 rounded-[10px] bg-white">{edit.media_url ? 'Datei ersetzen' : 'Datei hochladen'}</button><input ref={file} type="file" accept="image/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />{edit.media_url && <p className="text-[11px] text-mute truncate">{edit.media_url}</p>}</>}</>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.published} onChange={e => setEdit({ ...edit, published: e.target.checked })} />Freigegeben</label>
        <Err m={err} /><div className="flex gap-2"><button onClick={save} className={`${btn} flex-1`}>Speichern</button><button onClick={() => setEdit(null)} className="h-10 px-3 rounded-[10px] text-mute hover:text-ink">Abbrechen</button></div>
      </div>
    </Panel>}
    {obProposal.length > 0 && <Panel className="p-6 mb-8">
      <div className="flex items-start justify-between gap-4"><div><p className="rubric text-brass">Vorschlag aus dem Wiki</p><p className="font-medium mt-2">Onboarding für Neue · {obProposal.length} Schritte</p></div>
        <button onClick={async () => { if (confirm('Onboarding-Vorschlag freigeben? Die Beispiel-Schritte aus dem Prototyp und der Fortschritt dazu werden dabei entfernt.')) { await supabase!.rpc('approve_wiki_proposals', { p_kind: 'onboarding' }); await reload(); retranslate() } }} className={`${btn} shrink-0`}>Freigeben</button></div>
      <ol className="mt-3 text-[13px] text-mute list-decimal pl-5 columns-2 gap-6">{obProposal.map(x => <li key={x.id}>{x.title} · {x.minutes} Min.</li>)}</ol>
    </Panel>}
    <div className="h-10 mb-4 rounded-[10px] bg-sage-50 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Titel, Kategorie oder Stichwort" className="flex-1 outline-none text-[14px] bg-transparent" /><span className="text-xs text-mute">{list.length} Artikel</span></div>
    <div><table className="tbl w-full text-[14px]"><thead><tr><Th>Artikel</Th><Th>Kategorie</Th><Th>Sichtbar für</Th><Th>Aktualisiert</Th><Th>Status</Th></tr></thead>
      <tbody className="divide-y divide-line">{list.map(a => <tr key={a.id} onClick={() => openEdit(a.id)} className="cursor-pointer hover:bg-sage-50/70"><td className="px-4 py-3">{a.title}</td><td className="px-4 text-mute">{a.cat}</td><td className="px-4 text-mute">{LEVEL[a.accessLevel]}</td><td className="px-4 text-mute">{a.updated}</td><td className="px-4 text-[13px]"><span className="inline-flex items-center gap-1.5 text-ink/80"><span className={`w-[7px] h-[7px] rounded-full ${a.published ? 'bg-ok' : 'bg-sage-400'}`} />{a.published ? 'Freigegeben' : 'Entwurf'}</span></td></tr>)}</tbody></table></div>
  </>)
}
