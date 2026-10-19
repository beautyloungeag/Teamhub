import { useState } from 'react'
import { Bell, Clock, Link2, MapPin, Pencil, Trash2, Users } from 'lucide-react'
import { useApp, isoDay, fmtDate, fmtTime, type Ev, type Staff } from '../store'
import { supabase } from '../lib/supabase'
import { notifyNow } from '../lib/push'
import { Avatar } from '../People'
import { toast } from '../Toast'
import { H, New, Field, inpStone, btn, btn2, Err, retranslate, real, inBranch, Select, Seg, Modal, Chips, Bar } from './kit'

// Schulungen & Events: Büro für alle, Filialleitung fürs eigene Studio. Zusagen, Absagen und offene Antworten
// je Termin, offene Personen lassen sich per Mitteilung erinnern.

const KINDS = ['Schulung', 'Meeting', 'Team']
export function EventsAdmin() {
  const { events, registrations, staff, me } = useApp()
  const office = me.app_role === 'buero'
  const [when, setWhen] = useState<'kommend' | 'vergangen' | 'jahr'>('kommend')
  const now = new Date()
  const visible = events.filter(e => office || e.audienceBranches.length === 0 || e.audienceBranches.some(b => [me.branch_id, ...(me.extra ?? [])].includes(b)))
  const list = visible.filter(e => when === 'vergangen' ? new Date(e.endsAt ?? e.startsAt) < now : new Date(e.endsAt ?? e.startsAt) >= now)
    .sort((a, b) => when === 'kommend' ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt))
  const [sel, setSel] = useState<string | null>(null), [form, setForm] = useState<Ev | 'neu' | null>(null)
  const e = list.find(x => x.id === sel) ?? list[0]
  // Zielgruppe eines Termins (Filialleitung: nur ihr Studio)
  const audience = (ev: Ev) => staff.filter(s => real(s) && s.branch_id !== 'buero' && (ev.audienceBranches.length === 0 || ev.audienceBranches.some(b => inBranch(s, b)))
    && (ev.audienceSkills.length === 0 || s.skills.some(k => ev.audienceSkills.includes(k))) && (office || [me.branch_id, ...(me.extra ?? [])].some(b => inBranch(s, b))))
  const stats = (ev: Ev) => { const regs = registrations.filter(r => r.event_id === ev.id), aud = audience(ev)
    return { yes: regs.filter(r => r.coming && !r.waitlist).length, wait: regs.filter(r => r.coming && r.waitlist).length, no: regs.filter(r => !r.coming).length, open: aud.filter(s => !regs.some(r => r.employee_id === s.id)).length } }
  return (<>
    <H info="Termine für dein Team: Schulungen, Meetings, Teamanlässe. Die Zielgruppe bekommt eine Mitteilung und sagt in der App zu oder ab."
      action={<New onClick={() => setForm('neu')}>Neuer Termin</New>}>Schulungen & Events</H>
    <div className="mb-5"><Seg value={when} onChange={v => { setWhen(v); setSel(null) }} items={[['kommend', 'Kommend'], ['vergangen', 'Vergangen'], ['jahr', 'Jahresplan']]} /></div>
    {when === 'jahr' ? <YearPlan events={visible} onOpen={x => { setWhen(new Date(x.endsAt ?? x.startsAt) < now ? 'vergangen' : 'kommend'); setSel(x.id) }} /> : list.length === 0 ? <p className="text-[14px] text-mute">{when === 'kommend' ? 'Keine kommenden Termine. Oben rechts legst du einen an.' : 'Noch keine vergangenen Termine.'}</p> : (
    <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-8">
      <div className="space-y-2">{list.map(x => { const st = stats(x), on = x.id === e?.id
        return <button key={x.id} onClick={() => setSel(x.id)} className={`w-full text-left rounded-[16px] p-4 flex gap-4 items-center transition ${on ? 'bg-sage-50 shadow-[inset_0_0_0_1.5px_#C8CDC5]' : 'hover:bg-sage-50/70'}`}>
          <span className="w-14 shrink-0 text-center rounded-[12px] bg-white border border-line py-1.5"><span className="block font-display text-[22px] leading-none">{fmtDate(x.startsAt, { day: 'numeric' })}</span><span className="block text-[11px] text-mute uppercase tracking-wide mt-1">{fmtDate(x.startsAt, { month: 'short' })}</span></span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2"><span className="font-medium text-[15px] truncate">{x.title}</span><span className="text-[11.5px] px-2 h-5 rounded-full bg-white border border-line text-ink/70 flex items-center shrink-0">{x.kind}</span></span>
            <span className="block text-[13px] text-mute mt-0.5 truncate">{fmtDate(x.startsAt, { weekday: 'short' })} {fmtTime(x.startsAt)}{x.endsAt ? `–${fmtTime(x.endsAt)}` : ''} · {x.link ? 'Online' : x.place || 'Ort offen'}</span>
          </span>
          <span className="flex items-center gap-3 text-[13px] tabular-nums shrink-0">
            <span className="flex items-center gap-1 text-ok" title="Zusagen"><span className="w-2 h-2 rounded-full bg-ok" />{st.yes}</span>
            {st.wait > 0 && <span className="flex items-center gap-1 text-brass" title="Warteliste"><span className="w-2 h-2 rounded-full bg-brass" />{st.wait}</span>}
            <span className="flex items-center gap-1 text-alert" title="Absagen"><span className="w-2 h-2 rounded-full bg-alert" />{st.no}</span>
            <span className="flex items-center gap-1 text-mute" title="Noch keine Antwort"><span className="w-2 h-2 rounded-full bg-sage-400" />{st.open}</span>
          </span>
        </button> })}</div>
      {e && <EventDetail key={e.id} e={e} people={audience(e)} onEdit={() => setForm(e)} />}
    </div>)}
    {form && <EventForm ev={form === 'neu' ? null : form} onClose={() => setForm(null)} />}
  </>)
}

function EventDetail({ e, people, onEdit }: { e: Ev; people: Staff[]; onEdit: () => void }) {
  const { registrations, staff, me, reload, branches } = useApp()
  const can = me.app_role === 'buero' || (me.app_role === 'filialleitung' && e.createdBy === me.id)
  const regs = registrations.filter(r => r.event_id === e.id)
  const yes = regs.filter(r => r.coming && !r.waitlist).map(r => staff.find(s => s.id === r.employee_id)).filter((s): s is Staff => !!s)
  const wait = regs.filter(r => r.coming && r.waitlist).map(r => staff.find(s => s.id === r.employee_id)).filter((s): s is Staff => !!s)
  const no = regs.filter(r => !r.coming).map(r => staff.find(s => s.id === r.employee_id)).filter((s): s is Staff => !!s)
  const open = people.filter(s => !regs.some(r => r.employee_id === s.id))
  const [tab, setTab] = useState<'yes' | 'wait' | 'no' | 'open'>(open.length && !yes.length ? 'open' : 'yes')
  const [busy, setBusy] = useState(false)
  const past = new Date(e.endsAt ?? e.startsAt) < new Date()
  const remind = async () => {
    setBusy(true)
    const { data } = await supabase!.functions.invoke('notify', { body: { action: 'remind_event', event_id: e.id } })
    setBusy(false)
    toast(data?.ok ? (data.sent ? `Erinnerung an ${data.people} ${data.people === 1 ? 'Person' : 'Personen'} geschickt` : 'Erinnerung gesendet, aber niemand hat Mitteilungen eingeschaltet') : 'Das hat nicht geklappt', data?.ok ? 'ok' : 'error')
  }
  const list = { yes, wait, no, open }[tab]
  const meta: [typeof Clock, string][] = [
    [Clock, `${fmtDate(e.startsAt, { weekday: 'long', day: 'numeric', month: 'long' })}, ${fmtTime(e.startsAt)}${e.endsAt ? `–${fmtTime(e.endsAt)}` : ''}`],
    ...(e.place ? [[MapPin, e.place] as [typeof Clock, string]] : []),
    ...(e.link ? [[Link2, 'Online-Termin mit Link'] as [typeof Clock, string]] : []),
    [Users, [e.audienceBranches.length ? e.audienceBranches.map(id => branches.find(b => b.id === id)?.name).join(', ') : 'Alle Studios', ...e.audienceSkills].join(' · ')],
  ]
  return (
    <aside className="self-start rounded-[20px] border border-line p-5 sticky top-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-[11.5px] text-mute">{e.kind}</p><p className="text-[19px] font-medium leading-snug">{e.title}</p></div>
        {can && <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} title="Bearbeiten" className="w-9 h-9 rounded-full text-mute hover:text-ink hover:bg-sage-50 flex items-center justify-center"><Pencil size={15} /></button>
          <button onClick={async () => { if (confirm('Diesen Termin löschen? Zu- und Absagen gehen verloren.')) { const { error } = await supabase!.from('events').delete().eq('id', e.id); toast(error ? 'Löschen hat nicht geklappt' : 'Gelöscht', error ? 'error' : 'ok'); await reload() } }} title="Löschen" className="w-9 h-9 rounded-full text-mute hover:text-alert hover:bg-sage-50 flex items-center justify-center"><Trash2 size={15} /></button>
        </div>}
      </div>
      <ul className="mt-3 space-y-1.5 text-[13.5px] text-ink/80">{meta.map(([I, t], i) => <li key={i} className="flex gap-2"><I size={15} className="text-mute mt-0.5 shrink-0" />{t}</li>)}</ul>
      {e.description && <p className="mt-3 text-[13.5px] text-ink/80 whitespace-pre-wrap">{e.description}</p>}
      {wait.length > 0 && <p className="mt-3 text-[12.5px] text-mute">Sagt jemand ab, rückt die Nächste auf der Warteliste automatisch nach und bekommt eine Mitteilung.</p>}
      {e.capacity && <div className="mt-4"><div className="flex justify-between text-[12.5px] mb-1"><span className="text-mute">Plätze</span><span className="tabular-nums">{yes.length} / {e.capacity}</span></div><Bar p={yes.length / e.capacity * 100} /></div>}
      {e.registerUntil && <p className="mt-2 text-[12.5px] text-mute">Anmeldung bis {fmtDate(e.registerUntil, { day: 'numeric', month: 'long' })}</p>}

      <div className={`mt-5 grid ${wait.length ? 'grid-cols-4' : 'grid-cols-3'} gap-1 p-1 rounded-[12px] bg-sage-50`}>
        {([['yes', 'Zusagen', yes.length, 'bg-ok'], ...(wait.length ? [['wait', 'Warteliste', wait.length, 'bg-brass']] : []), ['no', 'Absagen', no.length, 'bg-alert'], ['open', 'Offen', open.length, 'bg-sage-400']] as ['yes' | 'wait' | 'no' | 'open', string, number, string][]).map(([k, l, n, c]) =>
          <button key={k} onClick={() => setTab(k)} className={`h-12 rounded-[9px] flex flex-col items-center justify-center transition ${tab === k ? 'bg-white shadow-[0_1px_2px_rgba(29,34,28,.08)]' : 'hover:bg-white/60'}`}>
            <span className="font-display text-[18px] leading-none tabular-nums">{n}</span><span className="text-[11.5px] text-mute mt-1 flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${c}`} />{l}</span></button>)}
      </div>
      <ul className="mt-3 max-h-[360px] overflow-y-auto no-scrollbar divide-y divide-line">
        {list.length === 0 && <li className="py-3 text-[13.5px] text-mute">{tab === 'open' ? 'Alle haben geantwortet.' : 'Noch niemand.'}</li>}
        {list.map((p, i) => <li key={p.id} className="py-2 flex items-center gap-3 text-[13.5px]"><Avatar s={p} photo={p.photo} size="w-7 h-7 text-[11px]" /><span className="flex-1 min-w-0 truncate">{tab === 'wait' && <span className="text-mute tabular-nums mr-1.5">{i + 1}.</span>}{p.first} {p.last}</span><span className="text-mute text-[12.5px]">{p.branch}</span></li>)}
      </ul>
      {tab === 'open' && open.length > 0 && !past && <button disabled={busy} onClick={remind} className={`${btn2} w-full mt-3 flex items-center justify-center gap-2`}><Bell size={15} />{busy ? 'Sendet …' : `${open.length} ${open.length === 1 ? 'Person' : 'Personen'} erinnern`}</button>}
    </aside>
  )
}

const KIND_TONE: Record<string, string> = { Schulung: 'bg-brass', Meeting: 'bg-olive-700', Team: 'bg-ok' }
function YearPlan({ events, onOpen }: { events: Ev[]; onOpen: (e: Ev) => void }) {
  const [y, setY] = useState(new Date().getFullYear())
  const thisMonth = isoDay().slice(0, 7)
  return <div>
    <div className="flex items-center gap-3 mb-4"><button onClick={() => setY(y - 1)} className={btn2}>‹</button><p className="font-display text-[22px] tabular-nums">{y}</p><button onClick={() => setY(y + 1)} className={btn2}>›</button>
      <span className="ml-auto flex gap-4 text-[12.5px] text-mute">{KINDS.map(k => <span key={k} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${KIND_TONE[k]}`} />{k}</span>)}</span></div>
    <div className="grid grid-cols-4 gap-3">{Array.from({ length: 12 }, (_, i) => {
      const key = `${y}-${String(i + 1).padStart(2, '0')}`
      const evs = events.filter(e => isoDay(new Date(e.startsAt)).startsWith(key)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      return <div key={key} className={`rounded-[14px] p-3 min-h-[132px] ${key === thisMonth ? 'bg-sage-50 shadow-[inset_0_0_0_1.5px_#C8CDC5]' : key < thisMonth ? 'bg-sage-50/50' : 'bg-sage-50'}`}>
        <p className={`text-[13px] capitalize ${key < thisMonth ? 'text-mute' : 'text-ink/80'}`}>{new Intl.DateTimeFormat('de-CH', { month: 'long' }).format(new Date(key + '-15T12:00:00Z'))}</p>
        <ul className="mt-2 space-y-1">{evs.length === 0 && <li className="text-[12px] text-mute">–</li>}{evs.map(e => <li key={e.id}><button onClick={() => onOpen(e)} className="w-full text-left flex items-center gap-2 rounded-[8px] bg-white px-2 py-1.5 hover:shadow-[0_1px_3px_rgba(29,34,28,.12)] transition">
          <span className={`w-1.5 h-6 rounded-full shrink-0 ${KIND_TONE[e.kind] ?? 'bg-sage-400'}`} />
          <span className="min-w-0 flex-1"><span className="block text-[12.5px] truncate">{e.title}</span><span className="block text-[11px] text-mute tabular-nums">{fmtDate(e.startsAt, { day: '2-digit', month: '2-digit' })}{e.capacity ? ` · ${e.taken}/${e.capacity}` : ''}</span></span>
        </button></li>)}</ul>
      </div> })}</div>
  </div>
}

const day = (iso: string) => isoDay(new Date(iso))
const tm = (iso: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
function EventForm({ ev, onClose }: { ev: Ev | null; onClose: () => void }) {
  const { branches, skillCatalog, me, employee, reload } = useApp()
  const office = me.app_role === 'buero'
  const own = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [f, setF] = useState({
    title: ev?.raw.title ?? '', kind: ev?.kind ?? 'Schulung', description: ev?.raw.description ?? '', date: ev ? day(ev.startsAt) : '', from: ev ? tm(ev.startsAt) : '09:00', to: ev?.endsAt ? tm(ev.endsAt) : '',
    place: ev?.raw.place ?? '', link: ev?.link ?? '', capacity: ev?.capacity ? String(ev.capacity) : '', until: ev?.registerUntil ? day(ev.registerUntil) : '',
    branches: ev?.audienceBranches ?? (office ? [] : [me.branch_id]), skills: ev?.audienceSkills ?? [],
  })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.title.trim() || !f.date) { setErr('Titel und Datum sind nötig.'); return }
    if (f.to && f.to <= f.from) { setErr('„Bis“ muss nach „Von“ liegen.'); return }
    if (!office && !f.branches.length) { setErr('Bitte dein Studio wählen.'); return }
    const at = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString()
    const row = { title: f.title.trim(), kind: f.kind, description: f.description.trim(), starts_at: at(f.date, f.from), ends_at: f.to ? at(f.date, f.to) : null,
      place: f.place.trim(), link: f.link.trim() || null, capacity: f.capacity ? Number(f.capacity) : null, register_until: f.until ? new Date(f.until + 'T23:59:00').toISOString() : null,
      audience_branches: f.branches, audience_skills: f.skills }
    setBusy(true)
    const { error } = ev ? await supabase!.from('events').update(row).eq('id', ev.id) : await supabase!.from('events').insert({ ...row, created_by: employee.id })
    setBusy(false)
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    toast(ev ? 'Termin gespeichert' : 'Termin angelegt, die Zielgruppe bekommt eine Mitteilung'); await reload(); if (!ev) notifyNow(); retranslate(); onClose()
  }
  return (
    <Modal width={680} title={ev ? 'Termin bearbeiten' : 'Neuer Termin'} onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={save} className={btn}>{ev ? 'Speichern' : 'Anlegen'}</button></>}>
      <div className="grid grid-cols-[1fr_180px] gap-3">
        <Field label="Titel"><input autoFocus value={f.title} onChange={x => setF({ ...f, title: x.target.value })} placeholder="z. B. Produktschulung Pflegelinie" className={inpStone} /></Field>
        <Select label="Art" tone="stone" value={f.kind} onChange={v => setF({ ...f, kind: v })} options={KINDS.map(k => ({ value: k, label: k }))} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Field label="Datum"><input type="date" min={ev ? undefined : isoDay()} value={f.date} onChange={x => setF({ ...f, date: x.target.value })} className={inpStone} /></Field>
        <Field label="Von"><input type="time" value={f.from} onChange={x => setF({ ...f, from: x.target.value })} className={inpStone} /></Field>
        <Field label="Bis (optional)"><input type="time" value={f.to} onChange={x => setF({ ...f, to: x.target.value })} className={inpStone} /></Field>
        <Field label="Ort"><input value={f.place} onChange={x => setF({ ...f, place: x.target.value })} placeholder="z. B. Studio Basel 1" className={inpStone} /></Field>
        <Field label="Max. Plätze"><input type="number" min={1} value={f.capacity} onChange={x => setF({ ...f, capacity: x.target.value })} placeholder="unbegrenzt" className={inpStone} /></Field>
        <Field label="Anmeldung bis"><input type="date" value={f.until} onChange={x => setF({ ...f, until: x.target.value })} className={inpStone} /></Field>
      </div>
      <div className="mt-3"><Field label="Online-Link (optional)"><input value={f.link} onChange={x => setF({ ...f, link: x.target.value })} placeholder="https://…" className={inpStone} /></Field></div>
      <div className="mt-3"><Field label="Beschreibung"><textarea value={f.description} onChange={x => setF({ ...f, description: x.target.value })} rows={3} placeholder="Inhalt, was mitbringen, für wen" className="w-full rounded-[10px] bg-sage-50 px-3 py-2.5 text-[14px] outline-none resize-none" /></Field></div>
      <div className="mt-4"><span className="block text-xs text-mute mb-1.5">Für {office ? '(kein Studio = alle)' : ''}</span><Chips tone="stone" items={own.map(b => ({ value: b.id, label: b.name }))} value={f.branches} onChange={v => setF({ ...f, branches: v })} /></div>
      {skillCatalog.length > 0 && <div className="mt-3"><span className="block text-xs text-mute mb-1.5">Nur mit diesen Skills (optional)</span><Chips tone="stone" items={skillCatalog.map(k => ({ value: k, label: k }))} value={f.skills} onChange={v => setF({ ...f, skills: v })} /></div>}
      <div className="mt-3"><Err m={err} /></div>
    </Modal>
  )
}
