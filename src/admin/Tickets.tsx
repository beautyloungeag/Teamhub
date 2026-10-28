import { useState } from 'react'
import { AlertTriangle, ChevronRight, GraduationCap, Lightbulb, Lock, Search, Trash2, X } from 'lucide-react'
import { fuzzyIncludes } from '../lib/wiki'
import { supabase } from '../lib/supabase'
import { toast } from '../Toast'
import { useApp, type Ticket } from '../store'
import { Status as TicketStatus, ASSISTANT } from '../Mobile'
import { Comments, Media } from '../TicketParts'
import { H, Th, real, Select, Seg, Back, Section, Empty, DataRow, IconBox, Tag } from './kit'
import type { Tone } from '../tones'

// Meldungen & Ideen: Liste zum Sortieren (Zuweisen und Status direkt in der Zeile), ein Klick öffnet die Meldung.

const STATES = ['Neu', 'Zugewiesen', 'In Arbeit', 'Erledigt'] as const
// Gleiche Farben und Zeichen wie in der App: Meldung rot, Idee Messing, Learning blau
const KIND_LOOK: Record<Ticket['kind'], { tone: Tone; icon: typeof Lightbulb }> = { Meldung: { tone: 'duty', icon: AlertTriangle }, Idee: { tone: 'note', icon: Lightbulb }, Learning: { tone: 'learn', icon: GraduationCap }, Anliegen: { tone: 'note', icon: Lock } }
const kindIcon = (k: Ticket['kind'], size = 'w-9 h-9 rounded-[11px]') => { const l = KIND_LOOK[k] ?? KIND_LOOK.Meldung, I = l.icon; return <IconBox tone={l.tone} size={size}><I size={16} /></IconBox> }
type View = 'team' | 'vertraulich'
type Sort = 'neu' | 'alt' | 'stimmen' | 'studio'
const DAY = 864e5
/** „Offen seit“ in Worten (28.10., Matteo): heute, 3 Tage, 2 Wochen */
function since(iso?: string) {
  if (!iso) return { text: '–', days: 0 }
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY))
  return { days: d, text: d === 0 ? 'heute' : d === 1 ? '1 Tag' : d < 14 ? `${d} Tage` : `${Math.floor(d / 7)} Wochen` }
}
const thL = 'text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line'

export function TicketsAdmin() {
  const { tickets, assign, setStatus, staff, me, branches } = useApp()
  const [view, setView] = useState<View>('team'), [f, setF] = useState<'Alle' | Ticket['kind']>('Alle'), [st, setSt] = useState<'offen' | 'erledigt'>('offen')
  const [q, setQ] = useState(''), [br, setBr] = useState(''), [sort, setSort] = useState<Sort>('neu'), [open, setOpen] = useState<string | null>(null)
  const assignees = ['Facility', ...new Set(staff.filter(s => real(s) && s.app_role !== 'mitarbeiterin').map(s => `${s.first} ${s.last}`))]
  const officeAssignees = ['Büro', ...staff.filter(s => real(s) && s.app_role === 'buero').map(s => `${s.first} ${s.last}`)]
  const canEdit = (tk: Ticket) => me.app_role === 'buero' || (tk.kind !== 'Anliegen' && me.app_role === 'filialleitung' && tk.branchId !== 'buero' && (tk.branchId === me.branch_id || (me.extra ?? []).includes(tk.branchId)))
  // Vertrauliches (Anliegen) steht getrennt, nie gemischt mit den Meldungen des Teams
  const secret = tickets.filter(t => t.kind === 'Anliegen'), team = tickets.filter(t => t.kind !== 'Anliegen')
  const pool = view === 'vertraulich' ? secret : team
  const studios = branches.filter(b => pool.some(t => t.branchId === b.id))
  const list = pool
    .filter(t => (view === 'vertraulich' || f === 'Alle' || t.kind === f) && (st === 'offen' ? t.status !== 'Erledigt' : t.status === 'Erledigt'))
    .filter(t => !br || (br === 'alle' ? t.allStudios : t.branchId === br && !t.allStudios))
    .filter(t => !q.trim() || fuzzyIncludes([t.title, t.body, t.who, t.branch, t.assignee ?? '', ...t.comments.map(c => c.body)].join(' '), q))
    .sort((a, b) => sort === 'stimmen' ? b.votes - a.votes || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      : sort === 'studio' ? a.branch.localeCompare(b.branch) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      : sort === 'alt' ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '') : (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  const openCount = (xs: Ticket[]) => xs.filter(t => t.status !== 'Erledigt').length
  const tk = open ? tickets.find(x => x.id === open) : null
  if (tk) return <TicketPage tk={tk} canEdit={canEdit(tk)} assignees={tk.kind === 'Anliegen' ? officeAssignees : assignees} onBack={() => setOpen(null)} />
  const filtered = !!(q || br || (view === 'team' && f !== 'Alle'))
  return (<>
    <H action={secret.length > 0 || me.app_role === 'buero' ? <Seg value={view} onChange={v => { setView(v); setBr(''); setOpen(null) }} items={[['team', `Meldungen & Ideen · ${openCount(team)}`], ['vertraulich', <span key="v" className="flex items-center gap-1.5"><Lock size={13} />Vertraulich · {openCount(secret)}</span>]]} /> : undefined}>{view === 'vertraulich' ? 'Vertrauliche Anliegen' : 'Meldungen & Ideen'}</H>
    {view === 'vertraulich' && <p className="-mt-3 mb-5 text-[13px] text-mute flex items-center gap-2"><Lock size={14} />Sichtbar nur für die meldende Person und das Büro.</p>}
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="h-10 flex-1 min-w-[240px] rounded-[10px] bg-sage-50 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Suchen: Titel, Text, Name" className="flex-1 outline-none text-[14px] bg-transparent" />{q && <button onClick={() => setQ('')} aria-label="Suche leeren" className="text-mute"><X size={14} /></button>}</div>
      {view === 'team' && <Select tone="stone" className="w-40" value={f} onChange={v => setF(v as typeof f)} options={[{ value: 'Alle', label: 'Alle Arten' }, { value: 'Meldung', label: 'Meldungen' }, { value: 'Idee', label: 'Ideen' }, { value: 'Learning', label: 'Learnings' }]} />}
      <Select tone="stone" className="w-44" value={br} onChange={setBr} options={[{ value: '', label: 'Alle Studios' }, ...(pool.some(t => t.allStudios) ? [{ value: 'alle', label: 'Für alle Studios' }] : []), ...studios.map(b => ({ value: b.id, label: b.name }))]} />
      <Select tone="stone" className="w-52" value={sort} onChange={v => setSort(v as Sort)} options={[{ value: 'neu', label: 'Neueste zuerst' }, { value: 'alt', label: st === 'offen' ? 'Am längsten offen zuerst' : 'Älteste zuerst' }, ...(view === 'team' ? [{ value: 'stimmen', label: 'Meiste Unterstützung' }] : []), { value: 'studio', label: 'Nach Studio' }]} />
      <Seg value={st} onChange={setSt} items={[['offen', `Offen · ${openCount(pool)}`], ['erledigt', 'Erledigt']]} />
    </div>
    {list.length === 0 ? <Empty>{filtered ? <>Nichts gefunden. <button onClick={() => { setQ(''); setBr(''); setF('Alle') }} className="underline underline-offset-2">Filter zurücksetzen</button></> : st === 'offen' ? 'Nichts offen.' : 'Noch nichts erledigt.'}</Empty> :
    <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>{view === 'vertraulich' ? 'Anliegen' : 'Meldung'}</Th><th className={`w-[130px] ${thL}`}>Studio</th><th className={`w-[110px] ${thL}`}>{st === 'offen' ? 'Offen seit' : 'Gemeldet'}</th><th className={`w-[200px] ${thL}`}>Zuständig</th><th className={`w-[170px] ${thL}`}>Status</th><th className="w-10 border-b border-line" /></tr></thead>
      <tbody className="divide-y divide-line">{list.map(t => { const age = since(t.createdAt), late = st === 'offen' && age.days >= 7 && t.status === 'Neu'
        return <tr key={t.id} onClick={() => setOpen(t.id)} className="cursor-pointer hover:bg-sage-50/70">
        <td className="px-4 py-3"><span className="flex items-center gap-3 min-w-0">{kindIcon(t.kind)}<span className="min-w-0"><span className="block truncate">{t.title}</span><span className="block text-[12.5px] text-mute truncate">{t.kind === 'Anliegen' ? 'Vertraulich' : t.kind} · {t.who}{t.photo ? ` · ${t.mediaKind === 'video' ? 'Video' : 'Foto'}` : ''}{t.comments.length ? ` · ${t.comments.length} Kommentar${t.comments.length > 1 ? 'e' : ''}` : ''}{t.kind === 'Idee' && t.votes ? ` · ${t.votes} unterstützen` : ''}{t.viaAI ? ` · über ${ASSISTANT}` : ''}</span></span></span></td>
        <td className="px-4 text-mute truncate">{t.branch}</td>
        <td className={`px-4 truncate ${late ? 'text-alert' : 'text-mute'}`} title={late ? 'Seit über einer Woche nicht angefasst' : undefined}>{st === 'offen' ? age.text : t.when}</td>
        <td className="px-4" onClick={e => e.stopPropagation()}>{canEdit(t) ? <Select compact className="w-full" value={t.assignee ?? ''} onChange={v => assign(t.id, v)} placeholder="Zuweisen …" options={(t.kind === 'Anliegen' ? officeAssignees : assignees).map(a => ({ value: a, label: a }))} /> : <span className="text-mute">{t.assignee ?? '–'}</span>}</td>
        <td className="px-4" onClick={e => e.stopPropagation()}>{canEdit(t) ? <Select compact className="w-full" value={t.status} onChange={v => setStatus(t.id, v as Ticket['status'])} options={STATES.map(x => ({ value: x, label: x }))} /> : <span className="text-[13px]"><TicketStatus s={t.status} /></span>}</td>
        <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
      </tr> })}</tbody></table>}
  </>)
}

function TicketPage({ tk, canEdit, assignees, onBack }: { tk: Ticket; canEdit: boolean; assignees: string[]; onBack: () => void }) {
  const { assign, setStatus, reload } = useApp()
  // Löschen: zuerst Foto/Video (die Speicherregel prüft über die Meldung), dann die Meldung samt Kommentaren und Stimmen
  const del = async () => {
    if (!confirm(`${tk.kind} „${tk.title}“ endgültig löschen? Kommentare und Foto werden mitgelöscht.`)) return
    const { data } = await supabase!.from('tickets').select('photo_path').eq('id', tk.id).maybeSingle()
    if (data?.photo_path) await supabase!.storage.from('ticket-photos').remove([data.photo_path])
    const { error } = await supabase!.from('tickets').delete().eq('id', tk.id)
    if (error) { toast('Löschen hat nicht geklappt', 'error'); return }
    await reload(); toast('Gelöscht'); onBack()
  }
  return (
    <div className="max-w-[1000px]">
      <Back onClick={onBack}>Meldungen & Ideen</Back>
      <p className="text-[13px] text-mute flex items-center gap-2"><Tag tone={(KIND_LOOK[tk.kind] ?? KIND_LOOK.Meldung).tone}>{tk.kind}</Tag>{tk.branch}</p>
      <h1 className="text-[28px] leading-tight mt-1">{tk.title}</h1>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-12 mt-6">
        <div>
          {tk.kind === 'Anliegen' && <p className="mb-4 text-[13px] text-mute flex items-center gap-2"><Lock size={14} />Vertraulich · sichtbar für die meldende Person und das Büro.</p>}
          {tk.body && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{tk.body}</p>}
          {tk.photo && <div className="mt-5 max-w-[520px]"><Media tk={tk} /></div>}
          <Section className="mt-10" title="Verlauf"><Comments tk={tk} /></Section>
        </div>
        <div className="self-start">
          <DataRow label="Status" value={canEdit ? <Select compact className="w-40" value={tk.status} onChange={v => setStatus(tk.id, v as Ticket['status'])} options={STATES.map(x => ({ value: x, label: x }))} /> : <TicketStatus s={tk.status} />} />
          <DataRow label="Zuständig" value={canEdit ? <Select compact className="w-40" value={tk.assignee ?? ''} onChange={v => assign(tk.id, v)} placeholder="Zuweisen …" options={assignees.map(a => ({ value: a, label: a }))} /> : tk.assignee ?? '–'} />
          <DataRow label="Gemeldet von" value={tk.who} />
          <DataRow label="Wann" value={tk.when} />
          <DataRow label="Studio" value={tk.branch} />
          {tk.kind === 'Idee' && <DataRow label="Unterstützen" value={String(tk.votes)} />}
          {tk.viaAI && <DataRow label="Erfasst" value={`über ${ASSISTANT}`} muted />}
          {canEdit && <button onClick={del} className="mt-6 text-[13px] text-mute hover:text-alert flex items-center gap-1.5"><Trash2 size={14} />{tk.kind} löschen</button>}
        </div>
      </div>
    </div>
  )
}
