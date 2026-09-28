import { useMemo, useRef, useState, type ReactNode } from 'react'
import { LayoutDashboard, Newspaper, ListChecks, Lightbulb, CalendarDays, Users, BookOpen, Sparkles, Plus, Check, Camera, Search, CalendarClock, Send, X, Trash2 } from 'lucide-react'
import { Terminbuch } from './Calendar'
import { useApp, isoDay, appliesOn, fmtDate, fmtTime, zurichHour, type Ticket } from './store'
import { supabase } from './lib/supabase'
import { Status, ASSISTANT } from './Mobile'
import { notifyNow } from './lib/push'

type View = 'overview' | 'book' | 'news' | 'tasks' | 'tickets' | 'events' | 'team' | 'wiki'
const NAV: [View, string, typeof Users][] = [['overview', 'Übersicht', LayoutDashboard], ['book', 'Kundentermine', CalendarClock], ['news', 'News', Newspaper], ['tasks', 'Aufgaben', ListChecks], ['tickets', 'Meldungen & Ideen', Lightbulb], ['events', 'Schulungen & Events', CalendarDays], ['team', 'Team & Skills', Users], ['wiki', 'Wissen', BookOpen]]

export default function Backoffice() {
  const { me } = useApp()
  const [v, setV] = useState<View>('overview')
  const [ai, setAi] = useState(false)
  // Filialleitung verwaltet nur ihre Filiale; Inhalte (News, Wissen, Vorlagen, Team) pflegt das Büro.
  const nav = me.app_role === 'buero' ? NAV : NAV.filter(([k]) => ['overview', 'book', 'tasks', 'tickets', 'events'].includes(k))
  return (
    <div className="flex h-full bg-white rounded-[20px] overflow-hidden border border-sage-200">
      <aside className="w-60 shrink-0 bg-sage-50 p-4 flex flex-col">
        <div className="flex items-center gap-2.5 px-2 py-2"><span className="w-9 h-9 rounded-xl bg-sage-400 text-white flex items-center justify-center font-semibold">bl</span><div><p className="font-semibold leading-tight">TeamHub</p><p className="text-xs text-mute">Backoffice</p></div></div>
        <nav className="mt-6 space-y-0.5">
          {nav.map(([k, l, I]) => <button key={k} onClick={() => setV(k)} className={`w-full h-10 px-3 rounded-xl flex items-center gap-3 text-[14px] ${v === k ? 'bg-white text-ink font-medium' : 'text-sage-800 hover:bg-white/60'}`}><I size={18} />{l}</button>)}
        </nav>
        <button onClick={() => setAi(!ai)} className={`mt-auto h-11 rounded-xl flex items-center justify-center gap-2 text-[14px] font-medium ${ai ? 'bg-sage-800 text-white' : 'bg-ink text-white'}`}><Sparkles size={17} />{ASSISTANT} fragen</button>
      </aside>
      <main className={`flex-1 no-scrollbar p-8 ${v === 'book' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {v === 'book' && <><H>Kundentermine</H><div className="flex-1 min-h-0"><Terminbuch /></div></>}
        {v === 'overview' && <Overview go={setV} />}{v === 'news' && <NewsAdmin />}{v === 'tasks' && <TasksAdmin />}
        {v === 'tickets' && <TicketsAdmin />}{v === 'events' && <EventsAdmin />}{v === 'team' && <TeamAdmin />}{v === 'wiki' && <WikiAdmin />}
      </main>
      {ai && <AdminChat onClose={() => setAi(false)} />}
    </div>
  )
}

const H = ({ children, action }: { children: ReactNode; action?: ReactNode }) => <div className="flex items-center justify-between mb-6"><h1 className="text-[26px] font-semibold tracking-tight">{children}</h1>{action}</div>
const Box = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`rounded-2xl border border-sage-100 ${className}`}>{children}</div>
const New = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button onClick={onClick} className="h-10 px-4 rounded-xl bg-ink text-white text-[14px] flex items-center gap-1.5"><Plus size={16} />{children}</button>
const Th = ({ children }: { children: ReactNode }) => <th className="text-left font-normal text-xs text-mute px-4 py-3">{children}</th>
const Bar = ({ p }: { p: number }) => <div className="h-1.5 w-full rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-sage-600 rounded-full" style={{ width: p + '%' }} /></div>
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="block"><span className="block text-xs text-mute mb-1">{label}</span>{children}</label>
const inp = 'w-full h-10 rounded-xl border border-sage-200 px-3 text-[14px] bg-white outline-none'
const Err = ({ m }: { m: string }) => m ? <p className="text-[13px] text-[#B5483B]">{m}</p> : null

/* Wer gehört zur Zielgruppe (leer = alle aktiven)? */
function useAudience() {
  const { staff } = useApp()
  return (branches: string[]) => staff.filter(s => s.active && s.branch_id !== 'buero' && (branches.length === 0 || branches.includes(s.branch_id)))
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

function Overview({ go }: { go: (v: View) => void }) {
  const { tickets, news, newsReads, events, me } = useApp()
  const audience = useAudience(), progress = useTaskProgress()
  const must = news.find(n => n.mustRead && new Date(n.publishAt) <= new Date())
  const mustPeople = must ? audience(must.audienceBranches) : []
  const mustPct = must && mustPeople.length ? Math.round(mustPeople.filter(p => newsReads.some(r => r.news_id === must.id && r.employee_id === p.id && r.confirmed_at)).length / mustPeople.length * 100) : 0
  const open = tickets.filter(t => t.status !== 'Erledigt')
  const tot = progress.reduce((a, b) => a + b.total, 0), dn = progress.reduce((a, b) => a + b.done, 0)
  const nextEv = events.find(e => new Date(e.startsAt) > new Date())
  const kpis: [string, string, string, View][] = [
    ['Pflicht-News gelesen', must ? mustPct + ' %' : '–', must?.title ?? 'keine Pflicht-News', 'news'],
    ['Tagesaufgaben', tot ? Math.round(dn / tot * 100) + ' %' : '–', 'alle Studios heute', 'tasks'],
    ['Offene Meldungen', String(open.length), `${open.filter(t => t.status === 'Neu').length} ohne Zuweisung`, 'tickets'],
    ['Nächster Termin', nextEv ? fmtDate(nextEv.startsAt, { day: '2-digit', month: '2-digit' }) : '–', nextEv ? `${nextEv.title.slice(0, 26)}${nextEv.capacity ? ` · ${nextEv.taken}/${nextEv.capacity}` : ''}` : 'nichts geplant', 'events'],
  ]
  const hour = zurichHour()
  return (<>
    <H>{hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : 'Guten Abend'}, {me.first}</H>
    <div className="grid grid-cols-4 gap-4">{kpis.map(([l, n, s, to]) => <button key={l} onClick={() => go(to)} className="text-left"><Box className="p-5 hover:border-sage-400 transition"><p className="text-xs text-mute">{l}</p><p className="text-[30px] font-semibold mt-1">{n}</p><p className="text-xs text-mute truncate">{s}</p></Box></button>)}</div>
    <div className="grid grid-cols-2 gap-4 mt-4">
      <Box className="p-5"><p className="font-medium mb-4">Tagesaufgaben je Studio</p><div className="space-y-3">{progress.map(b => <div key={b.id} className="grid grid-cols-[90px_1fr_40px] items-center gap-3 text-[14px]"><span>{b.branch}</span><Bar p={b.total ? b.done / b.total * 100 : 0} /><span className="text-right text-mute">{b.done}/{b.total}</span></div>)}</div></Box>
      <Box className="p-5"><p className="font-medium mb-3">Neueste Meldungen</p><div className="divide-y divide-sage-50">{tickets.length === 0 && <p className="text-[14px] text-mute">Noch keine.</p>}{tickets.slice(0, 5).map(t => <div key={t.id} className="py-2.5 flex justify-between gap-3 text-[14px]"><span className="truncate">{t.title}{t.viaAI && <Sparkles size={12} className="inline ml-1.5 text-sage-600" />}</span><span className="text-xs shrink-0"><Status s={t.status} /></span></div>)}</div></Box>
      <Readiness />
    </div>
  </>)
}

/* Startbereitschaft je Studio (BLTH-27): App installiert, Mitteilungen an */
function Readiness() {
  const { staff, branches, me } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const rows = branches.filter(b => !b.is_office && (me.app_role === 'buero' || b.id === me.branch_id)).map(b => {
    const p = staff.filter(s => s.active && s.branch_id === b.id)
    return { b, p, inst: p.filter(s => s.appInstalled).length, push: p.filter(s => s.pushEnabled).length }
  })
  return <Box className="p-5 col-span-2"><p className="font-medium mb-1">Startbereitschaft</p><p className="text-xs text-mute mb-4">App auf dem Home-Bildschirm · Mitteilungen eingeschaltet</p>
    <div className="space-y-2">{rows.map(r => <div key={r.b.id}>
      <button onClick={() => setOpen(open === r.b.id ? null : r.b.id)} className="w-full grid grid-cols-[90px_1fr_1fr_24px] items-center gap-3 text-[14px] text-left"><span>{r.b.name}</span>
        <span className="flex items-center gap-2"><Bar p={r.p.length ? r.inst / r.p.length * 100 : 0} /><span className="text-xs text-mute w-10">{r.inst}/{r.p.length}</span></span>
        <span className="flex items-center gap-2"><Bar p={r.p.length ? r.push / r.p.length * 100 : 0} /><span className="text-xs text-mute w-10">{r.push}/{r.p.length}</span></span><span className="text-mute text-xs">{open === r.b.id ? '–' : '+'}</span></button>
      {open === r.b.id && <div className="mt-2 mb-3 ml-[102px] grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">{r.p.map(s => <span key={s.id} className="flex justify-between"><span>{s.first} {s.last}</span><span className="text-mute">{s.appInstalled ? 'App' : '–'} · {s.pushEnabled ? 'Push' : '–'}</span></span>)}</div>}
    </div>)}</div></Box>
}

/* ---------- News ---------- */
function NewsAdmin() {
  const { news, newsReads, branches, me, reload } = useApp()
  const audience = useAudience()
  const [sel, setSel] = useState<string | null>(news[0]?.id ?? null), [compose, setCompose] = useState(false)
  const [f, setF] = useState({ title: '', teaser: '', body: '', tag: 'Studio', must: false, branches: [] as string[], when: '', wiki: '' })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const n = news.find(x => x.id === sel)
  const pctOf = (id: string, br: string[]) => { const p = audience(br); return p.length ? Math.round(p.filter(s => newsReads.some(r => r.news_id === id && r.employee_id === s.id && r.confirmed_at)).length / p.length * 100) : 0 }
  const publish = async () => {
    if (!f.title.trim() || !f.body.trim()) { setErr('Titel und Text sind nötig.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase!.from('news').insert({
      title: f.title.trim(), teaser: f.teaser.trim() || f.body.trim().slice(0, 140), body: f.body.trim(), tag: f.must ? 'Pflicht' : f.tag, must_read: f.must,
      audience_branches: f.branches, author_id: me.id, author_name: `${me.first} ${me.last}`, publish_at: f.when ? new Date(f.when).toISOString() : new Date().toISOString(), wiki_category: f.wiki || null,
    })
    setBusy(false)
    if (error) { setErr('Veröffentlichen hat nicht geklappt.'); return }
    setCompose(false); setF({ title: '', teaser: '', body: '', tag: 'Studio', must: false, branches: [], when: '', wiki: '' }); await reload(); notifyNow()
  }
  const people = n ? audience(n.audienceBranches) : []
  return (<>
    <H action={<New onClick={() => setCompose(!compose)}>Neue News</New>}>News</H>
    {compose && <Box className="p-5 mb-6 grid grid-cols-[1fr_280px] gap-6">
      <div className="space-y-3"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Titel" className="w-full text-[20px] font-medium outline-none" />
        <input value={f.teaser} onChange={e => setF({ ...f, teaser: e.target.value })} placeholder="Kurzfassung für die Karte (optional)" className="w-full text-[15px] outline-none text-mute" />
        <textarea value={f.body} onChange={e => setF({ ...f, body: e.target.value })} rows={8} placeholder="Text. Absätze mit einer Leerzeile trennen." className="w-full resize-none outline-none text-[15px]" /></div>
      <div className="space-y-3 text-[14px]">
        <Field label="Zielgruppe"><div className="flex flex-wrap gap-1.5">{branches.filter(b => !b.is_office).map(b => <button key={b.id} onClick={() => setF({ ...f, branches: f.branches.includes(b.id) ? f.branches.filter(x => x !== b.id) : [...f.branches, b.id] })} className={`px-2.5 h-8 rounded-full text-[13px] ${f.branches.includes(b.id) ? 'bg-ink text-white' : 'bg-sage-50'}`}>{b.name}</button>)}</div><span className="text-[11px] text-mute">{f.branches.length ? '' : 'Keine Auswahl = alle Studios'}</span></Field>
        <Field label="Kategorie"><select value={f.tag} onChange={e => setF({ ...f, tag: e.target.value })} className={inp}>{['Studio', 'Marketing', 'Team', 'Hygiene'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.must} onChange={e => setF({ ...f, must: e.target.checked })} />Pflicht mit Lesebestätigung</label>
        <Field label="Veröffentlichen"><input type="datetime-local" value={f.when} onChange={e => setF({ ...f, when: e.target.value })} className={inp} /><span className="text-[11px] text-mute">Leer = sofort</span></Field>
        <Field label="Auch ins Wissen (Kategorie)"><input value={f.wiki} onChange={e => setF({ ...f, wiki: e.target.value })} placeholder="z. B. Hygiene" className={inp} /></Field>
        <Err m={err} /><button disabled={busy} onClick={publish} className="w-full h-10 rounded-xl bg-ink text-white disabled:opacity-60">{f.when ? 'Einplanen' : 'Veröffentlichen'}</button>
      </div>
    </Box>}
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <Box><table className="w-full text-[14px]"><thead><tr><Th>Titel</Th><Th>Zielgruppe</Th><Th>Datum</Th><Th>Gelesen</Th></tr></thead>
        <tbody className="divide-y divide-sage-50">{news.map(x => { const p = x.mustRead ? pctOf(x.id, x.audienceBranches) : null, planned = new Date(x.publishAt) > new Date()
          return <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${sel === x.id ? 'bg-sage-50' : ''}`}><td className="px-4 py-3">{x.title}{x.mustRead && <span className="ml-2 text-xs text-[#C0634B]">Pflicht</span>}{planned && <span className="ml-2 text-xs text-mute">geplant</span>}</td><td className="px-4 text-mute">{x.audience}</td><td className="px-4 text-mute">{x.date}</td><td className="px-4 w-32">{p !== null ? <div className="flex items-center gap-2"><Bar p={p} /><span className="text-xs text-mute">{p}%</span></div> : <span className="text-xs text-mute">–</span>}</td></tr>
        })}</tbody></table></Box>
      {n && <Box className="p-4"><p className="font-medium">{n.title}</p><p className="text-xs text-mute mt-1">{n.mustRead ? `${people.filter(s => newsReads.some(r => r.news_id === n.id && r.employee_id === s.id && r.confirmed_at)).length} von ${people.length} bestätigt` : 'Ohne Lesebestätigung'}</p>
        {n.mustRead && <div className="mt-3 max-h-[420px] overflow-y-auto no-scrollbar divide-y divide-sage-50">{people.map(s => { const r = newsReads.find(x => x.news_id === n.id && x.employee_id === s.id)
          return <div key={s.id} className="py-2 flex items-center justify-between text-[13px]"><span>{s.first} {s.last} <span className="text-mute">· {s.branch}</span></span>{r?.confirmed_at ? <Check size={15} className="text-sage-600" /> : <span className="text-xs text-[#C0634B]">{r ? 'geöffnet' : 'offen'}</span>}</div> })}</div>}
        <button onClick={async () => { if (confirm('Diese News löschen?')) { await supabase!.from('news').delete().eq('id', n.id); setSel(null); await reload() } }} className="mt-4 text-[13px] text-mute flex items-center gap-1"><Trash2 size={13} />Löschen</button>
      </Box>}
    </div>
  </>)
}

/* ---------- Aufgaben ---------- */
const REP = { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' } as const
const WD = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
function TasksAdmin() {
  const { templates, branches, me, reload } = useApp()
  const progress = useTaskProgress().filter(b => me.app_role === 'buero' || b.id === me.branch_id)
  const [form, setForm] = useState(false)
  const [f, setF] = useState({ name: '', repeat: 'daily' as 'daily' | 'weekly' | 'monthly', weekday: 1, monthday: 1, branches: [] as string[], items: '' })
  const [err, setErr] = useState('')
  const proposals = templates.filter(t => t.proposed)
  const approve = async () => { if (confirm('Vorschläge freigeben? Die Beispielvorlagen aus dem Prototyp werden dabei abgeschaltet.')) { await supabase!.rpc('approve_wiki_proposals', { p_kind: 'tasks' }); await reload() } }
  const save = async () => {
    const lines = f.items.split('\n').map(l => l.trim()).filter(Boolean)
    if (!f.name.trim() || !lines.length) { setErr('Name und mindestens ein Punkt sind nötig.'); return }
    const { data, error } = await supabase!.from('task_templates').insert({ name: f.name.trim(), repeat: f.repeat, weekday: f.repeat === 'weekly' ? f.weekday : null, monthday: f.repeat === 'monthly' ? f.monthday : null, branch_ids: f.branches, sort: templates.length }).select('id').single()
    if (error || !data) { setErr('Speichern hat nicht geklappt.'); return }
    // Zeile: "07:45 Kabinen desinfizieren !foto !wichtig"
    const rows = lines.map((l, i) => { const m = l.match(/^(\d{1,2}:\d{2})\s+(.*)$/); const text = (m ? m[2] : l)
      return { template_id: data.id, title: text.replace(/!foto|!wichtig/gi, '').trim(), due_time: m ? m[1] : null, proof_photo: /!foto/i.test(text), prio: /!wichtig/i.test(text), sort: i } })
    await supabase!.from('task_items').insert(rows)
    setForm(false); setErr(''); setF({ name: '', repeat: 'daily', weekday: 1, monthday: 1, branches: [], items: '' }); await reload()
  }
  return (<>
    <H action={me.app_role === 'buero' && <New onClick={() => setForm(!form)}>Neue Vorlage</New>}>Aufgaben</H>
    {form && <Box className="p-5 mb-6 grid grid-cols-[1fr_260px] gap-6">
      <div className="space-y-3"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Name der Vorlage, z. B. Öffnung" className="w-full text-[18px] font-medium outline-none" />
        <textarea value={f.items} onChange={e => setF({ ...f, items: e.target.value })} rows={7} placeholder={'Ein Punkt pro Zeile, optional mit Uhrzeit:\n07:45 Studio aufschliessen\n07:50 Kabinen desinfizieren !foto !wichtig'} className="w-full resize-none outline-none text-[14px] font-mono" /></div>
      <div className="space-y-3 text-[14px]">
        <Field label="Wiederholung"><select value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value as typeof f.repeat })} className={inp}><option value="daily">Täglich</option><option value="weekly">Wöchentlich</option><option value="monthly">Monatlich</option></select></Field>
        {f.repeat === 'weekly' && <Field label="Wochentag"><select value={f.weekday} onChange={e => setF({ ...f, weekday: Number(e.target.value) })} className={inp}>{WD.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Field>}
        {f.repeat === 'monthly' && <Field label="Tag im Monat"><input type="number" min={1} max={31} value={f.monthday} onChange={e => setF({ ...f, monthday: Number(e.target.value) })} className={inp} /></Field>}
        <Field label="Gilt für"><div className="flex flex-wrap gap-1.5">{branches.filter(b => !b.is_office).map(b => <button key={b.id} onClick={() => setF({ ...f, branches: f.branches.includes(b.id) ? f.branches.filter(x => x !== b.id) : [...f.branches, b.id] })} className={`px-2.5 h-8 rounded-full text-[13px] ${f.branches.includes(b.id) ? 'bg-ink text-white' : 'bg-sage-50'}`}>{b.name}</button>)}</div><span className="text-[11px] text-mute">{f.branches.length ? '' : 'Keine Auswahl = alle Studios'}</span></Field>
        <Err m={err} /><button onClick={save} className="w-full h-10 rounded-xl bg-ink text-white">Speichern</button>
      </div>
    </Box>}
    {me.app_role === 'buero' && proposals.length > 0 && <Box className="p-5 mb-6 border-sage-400">
      <div className="flex items-start justify-between gap-4"><div><p className="font-medium">Vorschlag aus dem Wiki · {proposals.length} Vorlagen, {proposals.reduce((a, t) => a + t.items.length, 0)} Punkte</p><p className="text-xs text-mute mt-1">Abgeleitet aus „Tagesabschluss Kasse“, „Reinigung in den Filialen“ und „Ämtlipläne & Wochen-Putzdienste“. Jeder Punkt verlinkt den Artikel. Gilt erst nach Freigabe.</p></div>
        <button onClick={approve} className="h-10 px-4 rounded-xl bg-ink text-white text-[14px] shrink-0">Freigeben</button></div>
      <div className="mt-4 grid grid-cols-2 gap-4">{proposals.map(t => <div key={t.id}><p className="text-[14px] font-medium">{t.name} <span className="text-xs text-mute font-normal">· {REP[t.repeat]}{t.repeat === 'weekly' && t.weekday ? `, ${WD[t.weekday]}` : ''}</span></p><ul className="mt-1 text-[13px] text-mute list-disc pl-4 space-y-0.5">{t.items.map(i => <li key={i.id}>{i.title}{i.prio && <span className="text-[#C0634B]"> · wichtig</span>}</li>)}</ul></div>)}</div>
    </Box>}
    <div className="grid grid-cols-2 gap-4">
      <Box><p className="font-medium px-4 pt-4">Vorlagen</p><table className="w-full text-[14px]"><thead><tr><Th>Name</Th><Th>Punkte</Th><Th>Wiederholung</Th><Th>Gilt für</Th><Th> </Th></tr></thead>
        <tbody className="divide-y divide-sage-50">{templates.filter(t => t.active).map(t => <tr key={t.id}><td className="px-4 py-3">{t.name}{t.sample && <span className="ml-2 text-xs text-mute">Beispiel</span>}</td><td className="px-4 text-mute">{t.items.length}</td><td className="px-4 text-mute">{REP[t.repeat]}{t.repeat === 'weekly' && t.weekday ? `, ${WD[t.weekday]}` : ''}{t.repeat === 'monthly' && t.monthday ? `, ${t.monthday}.` : ''}</td><td className="px-4 text-mute">{t.branchIds.length ? t.branchIds.map(id => branches.find(b => b.id === id)?.name).join(', ') : 'Alle Studios'}</td>
          <td className="px-2">{me.app_role === 'buero' && <button title="Deaktivieren" onClick={async () => { if (confirm(`Vorlage „${t.name}“ deaktivieren? Alte Nachweise bleiben.`)) { await supabase!.from('task_templates').update({ active: false }).eq('id', t.id); await reload() } }} className="text-mute"><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></Box>
      <Box className="p-4"><p className="font-medium mb-4">Heute je Studio</p><div className="space-y-3">{progress.map(b => <div key={b.id} className="grid grid-cols-[90px_1fr_40px] items-center gap-3 text-[14px]"><span>{b.branch}</span><Bar p={b.total ? b.done / b.total * 100 : 0} /><span className="text-right text-mute">{b.done}/{b.total}</span></div>)}</div>
        <p className="mt-5 text-xs text-mute flex items-center gap-1.5"><Camera size={13} />Nachweise mit Person, Uhrzeit und Foto bleiben gespeichert, jeder Tag beginnt neu.</p></Box>
    </div>
  </>)
}

/* ---------- Meldungen & Ideen ---------- */
function TicketsAdmin() {
  const { tickets, assign, setStatus, staff, me } = useApp()
  const [f, setF] = useState<'Alle' | 'Meldung' | 'Idee'>('Alle')
  const assignees = ['Facility', ...staff.filter(s => s.active && s.app_role !== 'mitarbeiterin').map(s => `${s.first} ${s.last}`)]
  const canEdit = me.app_role === 'buero'
  return (<>
    <H action={<div className="flex gap-1 p-1 rounded-xl bg-sage-50">{(['Alle', 'Meldung', 'Idee'] as const).map(k => <button key={k} onClick={() => setF(k)} className={`h-8 px-3 rounded-lg text-[13px] ${f === k ? 'bg-white font-medium' : 'text-sage-800'}`}>{k}</button>)}</div>}>Meldungen & Ideen</H>
    <Box><table className="w-full text-[14px]"><thead><tr><Th>Art</Th><Th>Titel</Th><Th>Studio</Th><Th>Von</Th><Th>Zuständig</Th><Th>Status</Th></tr></thead>
      <tbody className="divide-y divide-sage-50">{tickets.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-mute">Noch keine Meldungen oder Ideen.</td></tr>}
        {tickets.filter(t => f === 'Alle' || t.kind === f).map(t => (
        <tr key={t.id}><td className="px-4 py-3 text-mute">{t.kind}</td>
          <td className="px-4">{t.title}<span className="ml-2 inline-flex gap-1.5 text-mute align-middle">{t.photo && <a href={t.photo} target="_blank" rel="noreferrer"><Camera size={13} /></a>}{t.viaAI && <Sparkles size={13} className="text-sage-600" />}</span><p className="text-xs text-mute">{t.when}</p></td>
          <td className="px-4 text-mute">{t.branch}</td><td className="px-4 text-mute">{t.who}</td>
          <td className="px-4">{canEdit ? <select value={t.assignee ?? ''} onChange={e => assign(t.id, e.target.value)} className="h-9 rounded-lg border border-sage-200 px-2 bg-white text-[13px]"><option value="">Zuweisen …</option>{assignees.map(a => <option key={a}>{a}</option>)}</select> : <span className="text-mute">{t.assignee ?? '–'}</span>}</td>
          <td className="px-4">{canEdit ? <select value={t.status} onChange={e => setStatus(t.id, e.target.value as Ticket['status'])} className="h-9 rounded-lg border border-sage-200 px-2 bg-white text-[13px]">{['Neu', 'Zugewiesen', 'In Arbeit', 'Erledigt'].map(s => <option key={s}>{s}</option>)}</select> : <Status s={t.status} />}</td></tr>
      ))}</tbody></table></Box>
    <p className="mt-3 text-xs text-mute">Jede Zuweisung und jeder Statuswechsel wird mit Person und Zeit protokolliert. Die Meldende sieht den Stand in der App. Versand per E-Mail an die Facility folgt mit BLTH-20.</p>
  </>)
}

/* ---------- Schulungen & Events ---------- */
function EventsAdmin() {
  const { events, registrations, staff, branches, skillCatalog, me, reload } = useApp()
  const [sel, setSel] = useState<string | null>(events[0]?.id ?? null), [form, setForm] = useState(false), [err, setErr] = useState('')
  const [f, setF] = useState({ title: '', kind: 'Schulung', description: '', date: '', from: '09:00', to: '12:00', place: '', link: '', capacity: '', until: '', branches: [] as string[], skills: [] as string[] })
  const e = events.find(x => x.id === sel)
  const people = e ? registrations.filter(r => r.event_id === e.id).map(r => staff.find(s => s.id === r.employee_id)).filter(Boolean) : []
  const save = async () => {
    if (!f.title.trim() || !f.date) { setErr('Titel und Datum sind nötig.'); return }
    const at = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString()
    const { error } = await supabase!.from('events').insert({
      title: f.title.trim(), kind: f.kind, description: f.description.trim(), starts_at: at(f.date, f.from), ends_at: f.to ? at(f.date, f.to) : null,
      place: f.place.trim(), link: f.link.trim() || null, capacity: f.capacity ? Number(f.capacity) : null, register_until: f.until ? new Date(f.until + 'T23:59:00').toISOString() : null,
      audience_branches: f.branches, audience_skills: f.skills,
    })
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    setForm(false); setErr(''); await reload(); notifyNow()
  }
  const tog = (k: 'branches' | 'skills', v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] })
  return (<>
    <H action={me.app_role === 'buero' && <New onClick={() => setForm(!form)}>Neue Schulung</New>}>Schulungen & Events</H>
    {form && <Box className="p-5 mb-6 grid grid-cols-[1fr_300px] gap-6">
      <div className="space-y-3"><input value={f.title} onChange={x => setF({ ...f, title: x.target.value })} placeholder="Titel" className="w-full text-[18px] font-medium outline-none" />
        <textarea value={f.description} onChange={x => setF({ ...f, description: x.target.value })} rows={4} placeholder="Beschreibung: Inhalt, was mitbringen, für wen" className="w-full resize-none outline-none text-[14px]" />
        <div className="grid grid-cols-3 gap-2"><Field label="Datum"><input type="date" value={f.date} onChange={x => setF({ ...f, date: x.target.value })} className={inp} /></Field><Field label="Von"><input type="time" value={f.from} onChange={x => setF({ ...f, from: x.target.value })} className={inp} /></Field><Field label="Bis"><input type="time" value={f.to} onChange={x => setF({ ...f, to: x.target.value })} className={inp} /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Ort"><input value={f.place} onChange={x => setF({ ...f, place: x.target.value })} placeholder="Studio Basel 1" className={inp} /></Field><Field label="Meeting-Link (optional)"><input value={f.link} onChange={x => setF({ ...f, link: x.target.value })} placeholder="https://…" className={inp} /></Field></div>
      </div>
      <div className="space-y-3 text-[14px]">
        <Field label="Art"><select value={f.kind} onChange={x => setF({ ...f, kind: x.target.value })} className={inp}>{['Schulung', 'Meeting', 'Team'].map(k => <option key={k}>{k}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Max. Plätze"><input type="number" min={1} value={f.capacity} onChange={x => setF({ ...f, capacity: x.target.value })} placeholder="unbegrenzt" className={inp} /></Field><Field label="Anmeldung bis"><input type="date" value={f.until} onChange={x => setF({ ...f, until: x.target.value })} className={inp} /></Field></div>
        <Field label="Studios"><div className="flex flex-wrap gap-1.5">{branches.filter(b => !b.is_office).map(b => <button key={b.id} onClick={() => tog('branches', b.id)} className={`px-2.5 h-7 rounded-full text-[12px] ${f.branches.includes(b.id) ? 'bg-ink text-white' : 'bg-sage-50'}`}>{b.name}</button>)}</div></Field>
        <Field label="Skills (Zielgruppe)"><div className="flex flex-wrap gap-1.5">{skillCatalog.map(s => <button key={s} onClick={() => tog('skills', s)} className={`px-2.5 h-7 rounded-full text-[12px] ${f.skills.includes(s) ? 'bg-ink text-white' : 'bg-sage-50'}`}>{s}</button>)}</div></Field>
        <Err m={err} /><button onClick={save} className="w-full h-10 rounded-xl bg-ink text-white">Anlegen</button>
      </div>
    </Box>}
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <Box><table className="w-full text-[14px]"><thead><tr><Th>Termin</Th><Th>Datum</Th><Th>Zielgruppe</Th><Th>Plätze</Th></tr></thead>
        <tbody className="divide-y divide-sage-50">{events.map(x => <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${sel === x.id ? 'bg-sage-50' : ''}`}><td className="px-4 py-3">{x.title}<p className="text-xs text-mute">{x.registerUntil ? `Anmeldung bis ${fmtDate(x.registerUntil, { day: '2-digit', month: '2-digit' })}` : x.kind}</p></td>
          <td className="px-4 text-mute">{fmtDate(x.startsAt)}, {fmtTime(x.startsAt)}{x.endsAt ? `–${fmtTime(x.endsAt)}` : ''}</td>
          <td className="px-4 text-mute">{[...x.audienceBranches.map(id => branches.find(b => b.id === id)?.name), ...x.audienceSkills].filter(Boolean).join(', ') || 'Alle'}</td>
          <td className="px-4 text-mute">{x.taken}{x.capacity ? `/${x.capacity}` : ''}</td></tr>)}</tbody></table></Box>
      {e && <Box className="p-4"><p className="font-medium">{e.title}</p><p className="text-xs text-mute mt-1">{e.taken} Anmeldungen · {e.link ? 'Online' : e.place}</p>
        {e.description && <p className="mt-2 text-[13px]">{e.description}</p>}
        <div className="mt-3 divide-y divide-sage-50">{people.length === 0 && <p className="py-2 text-[13px] text-mute">{me.app_role === 'buero' ? 'Noch niemand angemeldet.' : 'Aus deiner Filiale noch niemand angemeldet.'}</p>}{people.map(p => <p key={p!.id} className="py-2 text-[13px]">{p!.first} {p!.last} <span className="text-mute">· {p!.branch}</span></p>)}</div>
        <button disabled title="Braucht den eigenen Mailversand (Resend)" className="mt-4 w-full h-10 rounded-xl border border-sage-200 text-[14px] text-mute">Erinnerung per E-Mail · folgt mit Mailversand</button>
        {me.app_role === 'buero' && <button onClick={async () => { if (confirm('Diesen Termin löschen? Anmeldungen gehen verloren.')) { await supabase!.from('events').delete().eq('id', e.id); setSel(null); await reload() } }} className="mt-3 text-[13px] text-mute flex items-center gap-1"><Trash2 size={13} />Löschen</button>}
      </Box>}
    </div>
  </>)
}

/* ---------- Team & Skills ---------- */
function TeamAdmin() {
  const { staff, branches, skillCatalog, reload } = useApp()
  const [q, setQ] = useState(''), [b, setB] = useState('Alle'), [form, setForm] = useState(false), [skill, setSkill] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', job_title: 'Kosmetikerin', app_role: 'mitarbeiterin', branch_id: 'basel-1' })
  const list = useMemo(() => staff.filter(s => (b === 'Alle' || s.branch === b) && `${s.first} ${s.last} ${s.role} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase())), [staff, q, b])
  const call = async (body: Record<string, unknown>) => { const { data, error } = await supabase!.functions.invoke('admin-employee', { body }); return error ? { ok: false, error: 'failed' } : data }
  const create = async () => {
    setBusy(true); setErr('')
    const r = await call({ action: 'create', ...f })
    setBusy(false)
    if (!r?.ok) { setErr(r?.error === 'exists' ? 'Diese E-Mail gibt es schon.' : r?.error === 'missing_fields' ? 'Vorname, Nachname, E-Mail und Studio sind nötig.' : 'Anlegen hat nicht geklappt.'); return }
    setForm(false); setF({ ...f, first_name: '', last_name: '', email: '' }); await reload()
  }
  return (<>
    <H action={<New onClick={() => setForm(!form)}>Person anlegen</New>}>Team & Skills</H>
    {form && <Box className="p-5 mb-6"><div className="grid grid-cols-3 gap-3">
      <Field label="Vorname"><input value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} className={inp} /></Field>
      <Field label="Nachname"><input value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} className={inp} /></Field>
      <Field label="Firmen-Mail"><input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="vorname@beautylounge.ch" className={inp} /></Field>
      <Field label="Funktion"><input value={f.job_title} onChange={e => setF({ ...f, job_title: e.target.value })} className={inp} /></Field>
      <Field label="Rechte"><select value={f.app_role} onChange={e => setF({ ...f, app_role: e.target.value })} className={inp}><option value="mitarbeiterin">Mitarbeiterin</option><option value="filialleitung">Filialleitung</option><option value="buero">Büro</option></select></Field>
      <Field label="Studio"><select value={f.branch_id} onChange={e => setF({ ...f, branch_id: e.target.value })} className={inp}>{branches.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
    </div><div className="mt-4 flex items-center gap-3"><button disabled={busy} onClick={create} className="h-10 px-5 rounded-xl bg-ink text-white disabled:opacity-60">Anlegen</button><Err m={err} /><p className="text-xs text-mute">Es geht keine Einladung raus. Anmelden kann sie sich mit ihrer Firmen-Mail.</p></div></Box>}
    <div className="flex gap-3 mb-4"><div className="h-10 flex-1 rounded-xl border border-sage-200 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, Rolle oder Skill" className="flex-1 outline-none text-[14px]" /></div>
      <select value={b} onChange={e => setB(e.target.value)} className="h-10 rounded-xl border border-sage-200 px-3 text-[14px] bg-white">{['Alle', ...branches.map(x => x.name)].map(x => <option key={x}>{x}</option>)}</select></div>
    <div className="grid grid-cols-[1fr_260px] gap-4">
      <Box><table className="w-full text-[14px]"><thead><tr><Th>Name</Th><Th>Funktion</Th><Th>Studio</Th><Th>Skills</Th><Th> </Th></tr></thead>
        <tbody className="divide-y divide-sage-50">{list.map(s => <tr key={s.id} className={s.active ? '' : 'opacity-50'}><td className="px-4 py-2.5">{s.first} {s.last}</td><td className="px-4 text-mute">{s.role}</td><td className="px-4 text-mute">{s.branch}</td><td className="px-4 text-mute text-[13px]">{s.skills.join(', ')}</td>
          <td className="px-2"><button onClick={async () => { if (confirm(s.active ? `${s.first} ${s.last} deaktivieren? Sie kann sich dann nicht mehr anmelden.` : `${s.first} ${s.last} wieder aktivieren?`)) { await call({ action: 'set_active', employee_id: s.id, active: !s.active }); await reload() } }} className="text-xs text-mute underline">{s.active ? 'deaktivieren' : 'aktivieren'}</button></td></tr>)}</tbody></table></Box>
      <Box className="p-4 self-start"><p className="font-medium">Skill-Katalog</p><p className="text-xs text-mute mt-1">Mitarbeiterinnen wählen daraus.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{skillCatalog.map(k => <span key={k} className="px-2.5 h-7 rounded-full bg-sage-50 text-[12px] flex items-center gap-1">{k}<button onClick={async () => { await supabase!.from('skills').delete().eq('name', k); await reload() }} className="text-mute"><X size={11} /></button></span>)}</div>
        <div className="mt-3 flex gap-2"><input value={skill} onChange={e => setSkill(e.target.value)} placeholder="Neuer Skill" className={inp} /><button onClick={async () => { if (skill.trim()) { await supabase!.from('skills').insert({ name: skill.trim(), sort: skillCatalog.length }); setSkill(''); await reload() } }} className="h-10 px-3 rounded-xl bg-ink text-white"><Plus size={15} /></button></div></Box>
    </div>
  </>)
}

/* ---------- Wissen ---------- */
type Edit = { id?: string; imported: boolean; category: string; title: string; intro: string; body: string; minutes: number; media_kind: string; media_url: string; published: boolean; access_level: string }
const LEVEL = { alle: 'Alle', filialleitung: 'Filialleitung + Büro', buero: 'Nur Büro' } as Record<string, string>
function WikiAdmin() {
  const { wiki, steps, allSteps, reloadWiki, reload } = useApp()
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
    setEdit(null); setErr(''); await reloadWiki()
  }
  const upload = async (f: File) => {
    const path = `wiki/${edit?.access_level ?? 'alle'}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase!.storage.from('media').upload(path, f, { contentType: f.type })
    if (!error && edit) setEdit({ ...edit, media_url: path, media_kind: f.type.startsWith('video') ? 'video' : 'photo' })
  }
  const list = own.filter(a => [a.title, a.cat, ...a.tags].join(' ').toLowerCase().includes(q.toLowerCase()))
  return (<>
    <H action={<New onClick={() => setEdit({ imported: false, category: '', title: '', intro: '', body: '', minutes: 3, media_kind: 'none', media_url: '', published: true, access_level: 'alle' })}>Neuer Artikel</New>}>Wissen</H>
    {edit && <Box className="p-5 mb-6 grid grid-cols-[1fr_260px] gap-6">
      <div className="space-y-3"><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="Titel" className="w-full text-[18px] font-medium outline-none" />
        <input value={edit.intro} onChange={e => setEdit({ ...edit, intro: e.target.value })} placeholder="Kurzfassung (optional)" className="w-full text-[14px] text-mute outline-none" />
        {edit.imported ? <p className="text-[13px] text-mute">Aus dem bisherigen Wiki übernommen, mit Bildern, Listen und Dateien. Hier lassen sich Titel, Kategorie, Sichtbarkeit und Freigabe ändern; den Inhalt bearbeiten wir beim nächsten Import oder direkt mit Aleksa AI.</p>
          : <textarea value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} rows={10} placeholder="Text. Absätze mit einer Leerzeile trennen, Schritte als 1., 2., 3." className="w-full resize-none outline-none text-[14px]" />}</div>
      <div className="space-y-3 text-[14px]">
        <Field label="Kategorie"><input value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} list="wiki-cats" placeholder="z. B. Hygiene" className={inp} /><datalist id="wiki-cats">{[...new Set(own.map(a => a.cat))].map(c => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Sichtbar für"><select value={edit.access_level} onChange={e => setEdit({ ...edit, access_level: e.target.value })} className={inp}>{Object.entries(LEVEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Lesezeit (Min.)"><input type="number" min={1} value={edit.minutes} onChange={e => setEdit({ ...edit, minutes: Number(e.target.value) })} className={inp} /></Field>
        {!edit.imported && <><Field label="Medien"><select value={edit.media_kind} onChange={e => setEdit({ ...edit, media_kind: e.target.value })} className={inp}><option value="none">Keine</option><option value="photo">Foto</option><option value="video">Internes Video</option><option value="youtube">YouTube</option></select></Field>
          {edit.media_kind === 'youtube' && <Field label="YouTube-Link"><input value={edit.media_url} onChange={e => setEdit({ ...edit, media_url: e.target.value })} placeholder="https://youtu.be/…" className={inp} /></Field>}
          {(edit.media_kind === 'photo' || edit.media_kind === 'video') && <><button onClick={() => file.current?.click()} className="w-full h-10 rounded-xl border border-sage-200">{edit.media_url ? 'Datei ersetzen' : 'Datei hochladen'}</button><input ref={file} type="file" accept="image/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />{edit.media_url && <p className="text-[11px] text-mute truncate">{edit.media_url}</p>}</>}</>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.published} onChange={e => setEdit({ ...edit, published: e.target.checked })} />Freigegeben</label>
        <Err m={err} /><div className="flex gap-2"><button onClick={save} className="flex-1 h-10 rounded-xl bg-ink text-white">Speichern</button><button onClick={() => setEdit(null)} className="h-10 px-3 rounded-xl border border-sage-200">Abbrechen</button></div>
      </div>
    </Box>}
    {obProposal.length > 0 && <Box className="p-5 mb-6 border-sage-400">
      <div className="flex items-start justify-between gap-4"><div><p className="font-medium">Vorschlag: Onboarding für Neue · {obProposal.length} Schritte aus dem Wiki</p><p className="text-xs text-mute mt-1">Jeder Schritt öffnet den Artikel. Ersetzt nach Freigabe die {steps.length} Beispielschritte.</p></div>
        <button onClick={async () => { if (confirm('Onboarding-Vorschlag freigeben?')) { await supabase!.rpc('approve_wiki_proposals', { p_kind: 'onboarding' }); await reload() } }} className="h-10 px-4 rounded-xl bg-ink text-white text-[14px] shrink-0">Freigeben</button></div>
      <ol className="mt-3 text-[13px] text-mute list-decimal pl-5 columns-2 gap-6">{obProposal.map(x => <li key={x.id}>{x.title} · {x.minutes} Min.</li>)}</ol>
    </Box>}
    <div className="h-10 mb-4 rounded-xl border border-sage-200 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Titel, Kategorie oder Stichwort" className="flex-1 outline-none text-[14px]" /><span className="text-xs text-mute">{list.length} Artikel</span></div>
    <Box><table className="w-full text-[14px]"><thead><tr><Th>Artikel</Th><Th>Kategorie</Th><Th>Sichtbar für</Th><Th>Aktualisiert</Th><Th>Status</Th></tr></thead>
      <tbody className="divide-y divide-sage-50">{list.map(a => <tr key={a.id} onClick={() => openEdit(a.id)} className="cursor-pointer hover:bg-sage-50"><td className="px-4 py-3">{a.title}</td><td className="px-4 text-mute">{a.cat}</td><td className="px-4 text-mute">{LEVEL[a.accessLevel]}</td><td className="px-4 text-mute">{a.updated}</td><td className="px-4 text-mute">{a.published ? 'freigegeben' : 'Entwurf'}</td></tr>)}</tbody></table></Box>
    <p className="mt-3 text-xs text-mute">{ASSISTANT} beantwortet Fragen nur aus freigegebenen Artikeln, die die fragende Person sehen darf. News mit Wissens-Kategorie erscheinen zusätzlich im Wissen. Onboarding: {steps.length} Schritte.</p>
  </>)
}

/* ---------- KI im Backoffice ---------- */
type M = { me: boolean; t: string }
function AdminChat({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<M[]>([]), [v, setV] = useState(''), [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const ideas = ['Wie lange wirkt das Desinfektionsmittel?', 'Wie entferne ich Shellac ohne Nagelschaden?']
  const send = async (q = v) => {
    if (!q.trim() || busy) return
    setMsgs(m => [...m, { me: true, t: q }]); setV(''); setBusy(true)
    const { data, error } = await supabase!.functions.invoke('assistant', { body: { message: q, history: msgs } })
    setMsgs(m => [...m, { me: false, t: error || !data?.ok ? 'Gerade nicht erreichbar.' : data.text }]); setBusy(false)
    setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }
  return (
    <aside className="w-[380px] shrink-0 border-l border-sage-100 flex flex-col bg-paper">
      <div className="h-16 px-5 flex items-center justify-between border-b border-sage-100"><p className="font-medium flex items-center gap-2"><Sparkles size={17} />{ASSISTANT}</p><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sage-50 flex items-center justify-center"><X size={17} /></button></div>
      <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-3">
        {msgs.length === 0 && <><p className="text-[14px] text-mute">{ASSISTANT} beantwortet Fragen aus dem freigegebenen Wissen und kennt deinen Tag aus Phorest.</p>
          {ideas.map(i => <button key={i} onClick={() => send(i)} className="w-full text-left rounded-2xl bg-white px-4 py-3 text-[14px]">{i}</button>)}</>}
        {msgs.map((m, i) => <div key={i} className={m.me ? 'flex justify-end' : ''}><div className={`max-w-[92%] rounded-[18px] px-4 py-3 text-[14px] leading-snug ${m.me ? 'bg-ink text-white' : 'bg-white'}`}>{m.t}</div></div>)}
        {busy && <div className="w-16 rounded-[18px] bg-white px-4 py-3 flex gap-1">{[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-sage-400 animate-pulse" />)}</div>}
        <div ref={end} />
      </div>
      <div className="p-4 flex gap-2 border-t border-sage-100"><input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={`Frag ${ASSISTANT} …`} className="flex-1 h-11 rounded-xl bg-white border border-sage-200 px-3 text-[14px] outline-none" /><button onClick={() => send()} className="w-11 h-11 rounded-xl bg-ink text-white flex items-center justify-center"><Send size={16} /></button></div>
    </aside>
  )
}
