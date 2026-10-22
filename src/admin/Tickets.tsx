import { useState } from 'react'
import { AlertTriangle, ChevronRight, GraduationCap, Lightbulb, Trash2 } from 'lucide-react'
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
const KIND_LOOK: Record<Ticket['kind'], { tone: Tone; icon: typeof Lightbulb }> = { Meldung: { tone: 'duty', icon: AlertTriangle }, Idee: { tone: 'note', icon: Lightbulb }, Learning: { tone: 'learn', icon: GraduationCap } }
const kindIcon = (k: Ticket['kind'], size = 'w-9 h-9 rounded-[11px]') => { const l = KIND_LOOK[k] ?? KIND_LOOK.Meldung, I = l.icon; return <IconBox tone={l.tone} size={size}><I size={16} /></IconBox> }
export function TicketsAdmin() {
  const { tickets, assign, setStatus, staff, me } = useApp()
  const [f, setF] = useState<'Alle' | Ticket['kind']>('Alle'), [st, setSt] = useState<'offen' | 'erledigt'>('offen'), [open, setOpen] = useState<string | null>(null)
  const assignees = ['Facility', ...new Set(staff.filter(s => real(s) && s.app_role !== 'mitarbeiterin').map(s => `${s.first} ${s.last}`))]
  const canEdit = (tk: Ticket) => me.app_role === 'buero' || (me.app_role === 'filialleitung' && tk.branchId !== 'buero' && (tk.branchId === me.branch_id || (me.extra ?? []).includes(tk.branchId)))
  const list = tickets.filter(t => (f === 'Alle' || t.kind === f) && (st === 'offen' ? t.status !== 'Erledigt' : t.status === 'Erledigt')).sort((a, b) => (f === 'Idee' ? b.votes - a.votes : 0))
  const tk = open ? tickets.find(x => x.id === open) : null
  if (tk) return <TicketPage tk={tk} canEdit={canEdit(tk)} assignees={assignees} onBack={() => setOpen(null)} />
  return (<>
    <H action={<div className="flex gap-3"><Seg value={st} onChange={setSt} items={[['offen', `Offen · ${tickets.filter(t => t.status !== 'Erledigt').length}`], ['erledigt', 'Erledigt']]} /><Seg value={f} onChange={setF} items={[['Alle', 'Alle'], ['Meldung', 'Meldungen'], ['Idee', 'Ideen'], ['Learning', 'Learning']]} /></div>}>Meldungen & Ideen</H>
    {list.length === 0 ? <Empty>{st === 'offen' ? 'Nichts offen.' : 'Noch nichts erledigt.'}</Empty> :
    <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Meldung</Th><th className="w-[130px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Studio</th><th className="w-[200px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Zuständig</th><th className="w-[170px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Status</th><th className="w-10 border-b border-line" /></tr></thead>
      <tbody className="divide-y divide-line">{list.map(t => <tr key={t.id} onClick={() => setOpen(t.id)} className="cursor-pointer hover:bg-sage-50/70">
        <td className="px-4 py-3"><span className="flex items-center gap-3 min-w-0">{kindIcon(t.kind)}<span className="min-w-0"><span className="block truncate">{t.title}</span><span className="block text-[12.5px] text-mute truncate">{t.kind} · {t.who} · {t.when}{t.photo ? ` · ${t.mediaKind === 'video' ? 'Video' : 'Foto'}` : ''}{t.comments.length ? ` · ${t.comments.length} Kommentar${t.comments.length > 1 ? 'e' : ''}` : ''}{t.kind === 'Idee' && t.votes ? ` · ${t.votes} unterstützen` : ''}{t.viaAI ? ` · über ${ASSISTANT}` : ''}</span></span></span></td>
        <td className="px-4 text-mute truncate">{t.branch}</td>
        <td className="px-4" onClick={e => e.stopPropagation()}>{canEdit(t) ? <Select compact className="w-full" value={t.assignee ?? ''} onChange={v => assign(t.id, v)} placeholder="Zuweisen …" options={assignees.map(a => ({ value: a, label: a }))} /> : <span className="text-mute">{t.assignee ?? '–'}</span>}</td>
        <td className="px-4" onClick={e => e.stopPropagation()}>{canEdit(t) ? <Select compact className="w-full" value={t.status} onChange={v => setStatus(t.id, v as Ticket['status'])} options={STATES.map(x => ({ value: x, label: x }))} /> : <span className="text-[13px]"><TicketStatus s={t.status} /></span>}</td>
        <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
      </tr>)}</tbody></table>}
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
