import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, LifeBuoy, GraduationCap, Smartphone, Newspaper, ListChecks, Lightbulb, CalendarDays, Users, BookOpen, Search, CalendarClock, TrendingUp, Settings as SettingsIcon } from 'lucide-react'
import { Terminbuch } from './Calendar'
import { useApp, isoDay, addDays, fmtDate } from './store'
import { supabase } from './lib/supabase'
import { ASSISTANT } from './Mobile'

import { BMark } from './Logo'
import { SideNav } from './Nav'
import { useAuth } from './lib/auth'
import { BenniChat } from './BenniChat'
import { TeamAdmin } from './admin/Team'
import { TasksAdmin } from './admin/Tasks'
import { EventsAdmin } from './admin/Events'
import { StandbyAdmin } from './admin/Standby'
import { LearnAdmin } from './admin/Learn'
import { NewsAdmin } from './admin/News'
import { TicketsAdmin } from './admin/Tickets'
import { Overview } from './admin/Overview'
import { SettingsAdmin } from './admin/Settings'
import { StudioPerformance } from './Performance'
import { ProfileAdmin } from './admin/Profile'

import { H, New, Panel, Th, Field, inp, btn, Err, retranslate, Select, Seg, InfoTip, Modal } from './admin/kit'

type View = 'overview' | 'book' | 'news' | 'tasks' | 'tickets' | 'events' | 'standby' | 'learn' | 'team' | 'performance' | 'wiki' | 'settings' | 'benni' | 'me'
const NAV: [View, string, typeof Users][] = [['overview', 'Übersicht', LayoutDashboard], ['book', 'Kundentermine', CalendarClock], ['news', 'News', Newspaper], ['tasks', 'Aufgaben', ListChecks], ['tickets', 'Meldungen & Ideen', Lightbulb], ['events', 'Schulungen & Events', CalendarDays], ['standby', 'Aushilfe', LifeBuoy], ['learn', 'Lernen', GraduationCap], ['team', 'Team', Users], ['performance', 'Performance', TrendingUp], ['wiki', 'Wissen', BookOpen], ['settings', 'Einstellungen', SettingsIcon]]

export default function Backoffice({ onSwitch }: { onSwitch?: () => void }) {
  const { me } = useApp()
  const { signOut } = useAuth()
  const [v, setV] = useState<View>('overview')
  // Filialleitung gestaltet für ihr Studio (News, Termine, Checklisten, Quiz zu eigenen News); Wissen und Studios pflegt das Büro.
  const nav = me.app_role === 'buero' ? NAV : NAV.filter(([k]) => ['overview', 'book', 'news', 'tasks', 'tickets', 'events', 'standby', 'learn', 'team', 'performance', 'settings'].includes(k))
  const allowed = new Set(nav.map(([k]) => k))
  const go = (k: View) => { if (allowed.has(k)) setV(k) }
  return (
    <div className="flex h-full bg-white overflow-hidden">
      <SideNav
        items={nav.map(([k, l, I]) => ({ key: k, label: l, active: v === k, onClick: () => setV(k), icon: <I size={18} strokeWidth={1.6} /> }))}
        extra={[...(onSwitch ? [{ key: 'switch', label: 'Mitarbeiterin-App', icon: <Smartphone size={18} strokeWidth={1.6} />, onClick: onSwitch }] : []),
          { key: 'ai', label: `Frag ${ASSISTANT}`, active: v === 'benni', icon: <BMark className="w-[18px] h-[18px]" />, onClick: () => setV('benni') }]}
        onProfile={() => setV('me')} profileActive={v === 'me'} onLogout={signOut} />
      <main className={`flex-1 no-scrollbar ${v === 'benni' ? 'overflow-hidden bg-sage-50' : v === 'book' ? 'p-8 flex flex-col overflow-hidden' : 'p-8 overflow-y-auto'}`}>
        {v === 'benni' && <BenniChat variant="app" />}
        {v === 'me' && <ProfileAdmin onSettings={() => setV('settings')} />}
        {v === 'book' && <><H>Kundentermine</H><div className="flex-1 min-h-0"><Terminbuch /></div></>}
        {v === 'overview' && <Overview go={go} can={k => allowed.has(k as View)} />}{allowed.has('news') && v === 'news' && <NewsAdmin />}{v === 'tasks' && <TasksAdmin />}
        {v === 'tickets' && <TicketsAdmin />}{v === 'standby' && <StandbyAdmin />}{v === 'learn' && <LearnAdmin />}{v === 'events' && <EventsAdmin />}{allowed.has('team') && v === 'team' && <TeamAdmin />}{v === 'performance' && <StudioPerformance header={a => <H info="Kennzahlen aus Phorest je Person, Teamziele und neueste Bewertungen. Mitarbeiterinnen sehen in der App nur ihre eigenen Zahlen und die Teamziele." action={a}>Performance</H>} />}{allowed.has('wiki') && v === 'wiki' && <WikiAdmin />}{v === 'settings' && <SettingsAdmin />}
      </main>
    </div>
  )
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
    {edit && <Modal width={900} title={edit.id ? 'Artikel bearbeiten' : 'Neuer Artikel'} onClose={() => setEdit(null)} footer={<><button onClick={() => setEdit(null)} className="h-10 px-4 rounded-[10px] bg-sage-50 hover:bg-sage-100 text-[14px]">Abbrechen</button><button onClick={save} className={btn}>Speichern</button></>}><div className="grid grid-cols-[1fr_260px] gap-6">
      <div className="space-y-3"><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="Titel" className="w-full text-[20px] font-medium outline-none" />
        <input value={edit.intro} onChange={e => setEdit({ ...edit, intro: e.target.value })} placeholder="Kurzfassung (optional)" className="w-full text-[14px] text-mute outline-none" />
        {edit.imported ? <p className="text-[13px] text-mute">Aus dem bisherigen Wiki übernommen. Der Inhalt ist hier nicht bearbeitbar.</p>
          : <textarea value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} rows={10} placeholder="Text. Absätze mit einer Leerzeile trennen, Schritte als 1., 2., 3." className="w-full resize-none outline-none text-[14px]" />}</div>
      <div className="space-y-3 text-[14px]">
        <Field label="Kategorie"><input value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} list="wiki-cats" placeholder="z. B. Hygiene" className={`${inp} !bg-sage-50`} /><datalist id="wiki-cats">{[...new Set(own.map(a => a.cat))].map(c => <option key={c} value={c} />)}</datalist></Field>
        <Select label="Sichtbar für" tone="stone" value={edit.access_level} onChange={v => setEdit({ ...edit, access_level: v })} options={Object.entries(LEVEL).map(([k, l]) => ({ value: k, label: l }))} />
        <Field label="Lesezeit (Min.)"><input type="number" min={1} value={edit.minutes} onChange={e => setEdit({ ...edit, minutes: Number(e.target.value) })} className={`${inp} !bg-sage-50`} /></Field>
        <Select label="Verantwortlich" tone="stone" value={edit.owner_id} onChange={v => setEdit({ ...edit, owner_id: v })} placeholder="Niemand" options={[{ value: '', label: 'Niemand' }, ...staff.filter(x => x.active && x.app_role !== 'mitarbeiterin').map(x => ({ value: x.id, label: `${x.first} ${x.last}`, hint: x.branch }))]} />
        <Field label="Nächste Prüfung"><input type="date" value={edit.review_due} onChange={e => setEdit({ ...edit, review_due: e.target.value })} className={`${inp} !bg-sage-50`} /></Field>
        {!edit.imported && <><Select label="Medien" tone="stone" value={edit.media_kind} onChange={v => setEdit({ ...edit, media_kind: v })} options={[{ value: 'none', label: 'Keine' }, { value: 'photo', label: 'Foto' }, { value: 'video', label: 'Internes Video' }, { value: 'youtube', label: 'YouTube' }]} />
          {edit.media_kind === 'youtube' && <Field label="YouTube-Link"><input value={edit.media_url} onChange={e => setEdit({ ...edit, media_url: e.target.value })} placeholder="https://youtu.be/…" className={`${inp} !bg-sage-50`} /></Field>}
          {(edit.media_kind === 'photo' || edit.media_kind === 'video') && <><button onClick={() => file.current?.click()} className="w-full h-10 rounded-[10px] bg-sage-50 hover:bg-sage-100">{edit.media_url ? 'Datei ersetzen' : 'Datei hochladen'}</button><input ref={file} type="file" accept="image/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />{edit.media_url && <p className="text-[11px] text-mute truncate">{edit.media_url}</p>}</>}</>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.published} onChange={e => setEdit({ ...edit, published: e.target.checked })} />Freigegeben</label>
        <Err m={err} />
      </div>
    </div></Modal>}
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
