import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, LifeBuoy, GraduationCap, Smartphone, Newspaper, ListChecks, Lightbulb, CalendarDays, Users, BookOpen, Search, CalendarClock, TrendingUp, Settings as SettingsIcon } from 'lucide-react'
import { Terminbuch } from './Calendar'
import { useApp, isoDay, addDays, appliesOn, fmtDate, zurichHour, type Ticket } from './store'
import { supabase } from './lib/supabase'
import { Status, ASSISTANT } from './Mobile'

import { BMark } from './Logo'
import { SideNav } from './Nav'
import { useAuth } from './lib/auth'
import { BenniChat } from './BenniChat'
import { TeamAdmin } from './admin/Team'
import { TasksAdmin } from './admin/Tasks'
import { EventsAdmin } from './admin/Events'
import { StandbyAdmin } from './admin/Standby'
import { LearnAdmin } from './admin/Learn'
import { NewsAdmin, useAudience } from './admin/News'
import { SettingsAdmin } from './admin/Settings'
import { StudioPerformance } from './Performance'

import { Comments, Media } from './TicketParts'
import { H, New, Panel, Side, Sec, Th, Bar, Field, inp, btn, Err, retranslate, real, inBranch, Select, Seg, InfoTip } from './admin/kit'

type View = 'overview' | 'book' | 'news' | 'tasks' | 'tickets' | 'events' | 'standby' | 'learn' | 'team' | 'performance' | 'wiki' | 'settings'
const NAV: [View, string, typeof Users][] = [['overview', 'Übersicht', LayoutDashboard], ['book', 'Kundentermine', CalendarClock], ['news', 'News', Newspaper], ['tasks', 'Aufgaben', ListChecks], ['tickets', 'Meldungen & Ideen', Lightbulb], ['events', 'Schulungen & Events', CalendarDays], ['standby', 'Aushilfe', LifeBuoy], ['learn', 'Lernen', GraduationCap], ['team', 'Team', Users], ['performance', 'Performance', TrendingUp], ['wiki', 'Wissen', BookOpen], ['settings', 'Einstellungen', SettingsIcon]]

export default function Backoffice({ onSwitch }: { onSwitch?: () => void }) {
  const { me } = useApp()
  const { signOut } = useAuth()
  const [v, setV] = useState<View>('overview')
  const [ai, setAi] = useState(false)
  // Filialleitung gestaltet für ihr Studio (News, Termine, Checklisten, Quiz zu eigenen News); Wissen und Studios pflegt das Büro.
  const nav = me.app_role === 'buero' ? NAV : NAV.filter(([k]) => ['overview', 'book', 'news', 'tasks', 'tickets', 'events', 'standby', 'learn', 'team', 'performance', 'settings'].includes(k))
  const allowed = new Set(nav.map(([k]) => k))
  const go = (k: View) => { if (allowed.has(k)) setV(k) }
  return (
    <div className="flex h-full bg-white overflow-hidden">
      <SideNav
        items={nav.map(([k, l, I]) => ({ key: k, label: l, active: v === k, onClick: () => setV(k), icon: <I size={18} strokeWidth={1.6} /> }))}
        extra={[...(onSwitch ? [{ key: 'switch', label: 'Mitarbeiterin-App', icon: <Smartphone size={18} strokeWidth={1.6} />, onClick: onSwitch }] : []),
          { key: 'ai', label: `Frag ${ASSISTANT}`, active: ai, icon: <BMark className="w-[18px] h-[18px]" />, onClick: () => setAi(!ai) }]}
        onLogout={signOut} />
      <main className={`flex-1 no-scrollbar p-8 ${v === 'book' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {v === 'book' && <><H>Kundentermine</H><div className="flex-1 min-h-0"><Terminbuch /></div></>}
        {v === 'overview' && <Overview go={go} can={k => allowed.has(k)} />}{allowed.has('news') && v === 'news' && <NewsAdmin />}{v === 'tasks' && <TasksAdmin />}
        {v === 'tickets' && <TicketsAdmin />}{v === 'standby' && <StandbyAdmin />}{v === 'learn' && <LearnAdmin />}{v === 'events' && <EventsAdmin />}{allowed.has('team') && v === 'team' && <TeamAdmin />}{v === 'performance' && <StudioPerformance header={a => <H info="Kennzahlen aus Phorest je Person, Teamziele und neueste Bewertungen. Mitarbeiterinnen sehen in der App nur ihre eigenen Zahlen und die Teamziele." action={a}>Performance</H>} />}{allowed.has('wiki') && v === 'wiki' && <WikiAdmin />}{v === 'settings' && <SettingsAdmin />}
      </main>
      {ai && <BenniChat variant="panel" onClose={() => setAi(false)} />}
    </div>
  )
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
            <td className="px-4" onClick={e => e.stopPropagation()}>{canEdit(t) ? <Select compact tone="stone" className="w-44" value={t.assignee ?? ''} onChange={v => assign(t.id, v)} placeholder="Zuweisen …" options={assignees.map(a => ({ value: a, label: a }))} /> : <span className="text-mute">{t.assignee ?? '–'}</span>}</td>
            <td className="px-4" onClick={e => e.stopPropagation()}>{canEdit(t) ? <Select compact tone="stone" className="w-36" value={t.status} onChange={v => setStatus(t.id, v as Ticket['status'])} options={['Neu', 'Zugewiesen', 'In Arbeit', 'Erledigt'].map(x => ({ value: x, label: x }))} /> : <Status s={t.status} />}</td></tr>
        ))}</tbody></table></div>
      {tk && <Side><p className="rubric text-ink/70">{tk.kind} · {tk.branch}</p><p className="font-medium mt-2">{tk.title}</p>{tk.body && <p className="text-[13px] mt-1 whitespace-pre-wrap">{tk.body}</p>}
        <p className="text-xs text-mute mt-1">{tk.who} · {tk.when}</p>
        <div className="mt-3"><Media tk={tk} /></div>
        <div className="mt-4"><Sec>Verlauf</Sec><Comments tk={tk} /></div>
      </Side>}
    </div>
  </>)
}

/* ---------- Wissen ---------- */
type Edit = { id?: string; imported: boolean; category: string; title: string; intro: string; body: string; minutes: number; media_kind: string; media_url: string; published: boolean; access_level: string; owner_id: string; review_due: string }
const LEVEL = { alle: 'Alle', filialleitung: 'Filialleitung + Büro', buero: 'Nur Büro' } as Record<string, string>
function WikiAdmin() {
  const { wiki, allSteps, reloadWiki, reload, staff } = useApp()
  const [review, setReview] = useState<Record<string, { owner: string | null; due: string | null }>>({})
  const [only, setOnly] = useState<'alle' | 'faellig'>('alle')
  useEffect(() => { supabase!.from('wiki_articles').select('id, owner_id, review_due').then(({ data }) => setReview(Object.fromEntries((data ?? []).map((r: any) => [r.id, { owner: r.owner_id, due: r.review_due }])))) }, [wiki])
  const obProposal = allSteps.filter(x => x.proposed)
  const own = wiki.filter(a => !a.fromNews)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Edit | null>(null)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const openEdit = async (id: string) => {
    const { data } = await supabase!.from('wiki_articles').select('*').eq('id', id).single()
    if (data) setEdit({ id: data.id, imported: !!data.blocks, category: data.category, title: data.title, intro: data.intro ?? '', body: data.body ?? '', minutes: data.minutes, media_kind: data.media_kind, media_url: data.media_url ?? '', published: data.published, access_level: data.access_level, owner_id: data.owner_id ?? '', review_due: data.review_due ?? '' })
  }
  const save = async () => {
    if (!edit || !edit.title.trim() || !edit.category.trim()) { setErr('Titel und Kategorie sind nötig.'); return }
    const meta = { category: edit.category.trim(), title: edit.title.trim(), intro: edit.intro.trim(), minutes: edit.minutes, published: edit.published, access_level: edit.access_level, owner_id: edit.owner_id || null, review_due: edit.review_due || null, updated_at: new Date().toISOString() }
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
  const due = (id: string) => { const d = review[id]?.due; return !!d && d <= isoDay() }
  const list = own.filter(a => [a.title, a.cat, ...a.tags].join(' ').toLowerCase().includes(q.toLowerCase()) && (only === 'alle' || due(a.id) || !review[a.id]?.due))
  return (<>
    <H action={<New onClick={() => setEdit({ imported: false, category: '', title: '', intro: '', body: '', minutes: 3, media_kind: 'none', media_url: '', published: true, access_level: 'alle', owner_id: '', review_due: addDays(365) })}>Neuer Artikel</New>}>Wissen</H>
    {edit && <Panel className="p-6 mb-8 grid grid-cols-[1fr_260px] gap-6">
      <div className="space-y-3"><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="Titel" className="w-full text-[18px] font-medium outline-none" />
        <input value={edit.intro} onChange={e => setEdit({ ...edit, intro: e.target.value })} placeholder="Kurzfassung (optional)" className="w-full text-[14px] text-mute outline-none" />
        {edit.imported ? <p className="text-[13px] text-mute">Aus dem bisherigen Wiki übernommen. Der Inhalt ist hier nicht bearbeitbar.</p>
          : <textarea value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} rows={10} placeholder="Text. Absätze mit einer Leerzeile trennen, Schritte als 1., 2., 3." className="w-full resize-none outline-none text-[14px]" />}</div>
      <div className="space-y-3 text-[14px]">
        <Field label="Kategorie"><input value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} list="wiki-cats" placeholder="z. B. Hygiene" className={inp} /><datalist id="wiki-cats">{[...new Set(own.map(a => a.cat))].map(c => <option key={c} value={c} />)}</datalist></Field>
        <Select label="Sichtbar für" value={edit.access_level} onChange={v => setEdit({ ...edit, access_level: v })} options={Object.entries(LEVEL).map(([k, l]) => ({ value: k, label: l }))} />
        <Field label="Lesezeit (Min.)"><input type="number" min={1} value={edit.minutes} onChange={e => setEdit({ ...edit, minutes: Number(e.target.value) })} className={inp} /></Field>
        <Select label="Verantwortlich" value={edit.owner_id} onChange={v => setEdit({ ...edit, owner_id: v })} placeholder="Niemand" options={[{ value: '', label: 'Niemand' }, ...staff.filter(x => x.active && x.app_role !== 'mitarbeiterin').map(x => ({ value: x.id, label: `${x.first} ${x.last}`, hint: x.branch }))]} />
        <Field label="Nächste Prüfung"><input type="date" value={edit.review_due} onChange={e => setEdit({ ...edit, review_due: e.target.value })} className={inp} /></Field>
        {!edit.imported && <><Select label="Medien" value={edit.media_kind} onChange={v => setEdit({ ...edit, media_kind: v })} options={[{ value: 'none', label: 'Keine' }, { value: 'photo', label: 'Foto' }, { value: 'video', label: 'Internes Video' }, { value: 'youtube', label: 'YouTube' }]} />
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
    <div className="mb-4 flex gap-3 items-center"><Seg value={only} onChange={setOnly} items={[['alle', 'Alle'], ['faellig', `Prüfung fällig · ${own.filter(a => due(a.id) || !review[a.id]?.due).length}`]]} /><InfoTip text="Laut Wiki-Format wird jeder Artikel mindestens einmal im Jahr geprüft. „Prüfung fällig“ zeigt Artikel, deren Datum erreicht ist oder die noch keins haben." /></div>
    <div className="h-10 mb-4 rounded-[10px] bg-sage-50 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Titel, Kategorie oder Stichwort" className="flex-1 outline-none text-[14px] bg-transparent" /><span className="text-xs text-mute">{list.length} Artikel</span></div>
    <div><table className="tbl w-full text-[14px]"><thead><tr><Th>Artikel</Th><Th>Kategorie</Th><Th>Sichtbar für</Th><Th>Aktualisiert</Th><Th>Verantwortlich</Th><Th>Prüfen bis</Th><Th>Status</Th></tr></thead>
      <tbody className="divide-y divide-line">{list.map(a => <tr key={a.id} onClick={() => openEdit(a.id)} className="cursor-pointer hover:bg-sage-50/70"><td className="px-4 py-3">{a.title}</td><td className="px-4 text-mute">{a.cat}</td><td className="px-4 text-mute">{LEVEL[a.accessLevel]}</td><td className="px-4 text-mute">{a.updated}</td><td className="px-4 text-mute text-[13px]">{(() => { const o = staff.find(x => x.id === review[a.id]?.owner); return o ? `${o.first} ${o.last}` : '–' })()}</td><td className={`px-4 text-[13px] ${due(a.id) ? 'text-alert' : 'text-mute'}`}>{review[a.id]?.due ? fmtDate(review[a.id]!.due! + 'T12:00:00Z', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'}</td><td className="px-4 text-[13px]"><span className="inline-flex items-center gap-1.5 text-ink/80"><span className={`w-[7px] h-[7px] rounded-full ${a.published ? 'bg-ok' : 'bg-sage-400'}`} />{a.published ? 'Freigegeben' : 'Entwurf'}</span></td></tr>)}</tbody></table></div>
  </>)
}
