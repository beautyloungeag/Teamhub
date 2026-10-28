import { useEffect, useState } from 'react'
import { Bell, ChevronRight, ImagePlus, Pencil, Trash2 } from 'lucide-react'
import { useApp, isoDay, fmtDate, fmtTime, type Ev } from '../store'
import { supabase } from '../lib/supabase'
import { notifyNow } from '../lib/push'
import { downloadCsv } from '../lib/csv'
import { Avatar } from '../People'
import { phorest } from '../lib/phorest'
import { toast } from '../Toast'
import { H, New, Th, Field, inpStone, btn, btn2, Err, retranslate, isTest, Seg, Modal, Chips, Back, Section, Status, Empty, DataRow } from './kit'
import { DonutParts, STEPS } from './charts'
import { adminEventReport, adminPickerPeople, eventParticipantCsv } from '../lib/admin-audience'

// Schulungen & Events: Liste der Termine, ein Klick öffnet die Seite des Termins mit allen Angaben,
// den Antworten je Person und Erinnerungen an einzelne oder alle ohne Antwort.

const KINDS = ['Schulung', 'Meeting', 'Team']
const KIND_TONE: Record<string, string> = { Schulung: 'bg-brass', Meeting: 'bg-olive-700', Team: 'bg-ok' }

function useStats() {
  const { staff, me, registrations } = useApp()
  return (ev: Ev) => adminEventReport(staff, me, ev, registrations)
}

export function EventsAdmin() {
  const { events, me } = useApp()
  const office = me.app_role === 'buero'
  const [when, setWhen] = useState<'kommend' | 'vergangen' | 'jahr'>('kommend')
  const [open, setOpen] = useState<string | null>(null), [form, setForm] = useState<Ev | 'neu' | null>(null)
  const stats = useStats()
  const now = new Date()
  const visible = events.filter(e => e.kind === 'Schulung' || office || e.audienceBranches.length === 0 || e.audienceBranches.some(b => [me.branch_id, ...(me.extra ?? [])].includes(b)))
  const list = visible.filter(e => when === 'vergangen' ? new Date(e.endsAt ?? e.startsAt) < now : new Date(e.endsAt ?? e.startsAt) >= now)
    .sort((a, b) => when === 'vergangen' ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt))
  const ev = open ? events.find(e => e.id === open) : null
  if (ev) return <><EventPage e={ev} onBack={() => setOpen(null)} onEdit={() => setForm(ev)} />{form && <EventForm ev={form === 'neu' ? null : form} onClose={() => setForm(null)} />}</>
  return (<>
    <H action={<New onClick={() => setForm('neu')}>Neuer Termin</New>}>Schulungen & Events</H>
    <div className="mb-6"><Seg value={when} onChange={setWhen} items={[['kommend', 'Kommend'], ['vergangen', 'Vergangen'], ['jahr', 'Jahresplan']]} /></div>
    {when === 'jahr' ? <YearPlan events={visible} onOpen={x => setOpen(x.id)} /> : list.length === 0 ? <Empty>{when === 'kommend' ? 'Keine kommenden Termine.' : 'Noch keine vergangenen Termine.'}</Empty> : (
      <table className="tbl w-full text-[14px] table-fixed"><thead><tr><th className="w-[84px] border-b border-line" /><Th>Termin</Th><th className="w-[200px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Plätze</th><th className="w-[230px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Antworten</th><th className="w-10 border-b border-line" /></tr></thead>
        <tbody className="divide-y divide-line">{list.map(x => { const st = stats(x)
          return <tr key={x.id} onClick={() => setOpen(x.id)} className="cursor-pointer hover:bg-sage-50/70">
            <td className="px-4 py-3"><span className="block font-display text-[22px] leading-none">{fmtDate(x.startsAt, { day: 'numeric' })}</span><span className="block text-[11.5px] text-mute uppercase tracking-wide mt-1">{fmtDate(x.startsAt, { month: 'short' })}</span></td>
            <td className="px-4"><span className="flex items-center gap-2 min-w-0"><span className={`w-2 h-2 rounded-full shrink-0 ${KIND_TONE[x.kind] ?? 'bg-sage-400'}`} /><span className="truncate font-medium">{x.title}</span></span>
              <span className="block text-[12.5px] text-mute truncate pl-4">{x.kind} · {fmtDate(x.startsAt, { weekday: 'short' })} {fmtTime(x.startsAt)}{x.endsAt ? `–${fmtTime(x.endsAt)}` : ''} · {x.link ? 'Online' : x.place || 'Ort offen'}</span></td>
            <td className="px-4">{x.capacity ? <span className="flex items-center gap-3"><span className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full rounded-full bg-olive-700" style={{ width: `${Math.min(100, x.taken / x.capacity * 100)}%` }} /></span><span className="text-[13px] tabular-nums">{x.taken}/{x.capacity}</span></span> : <span className="text-mute text-[13px]">unbegrenzt · {st.yes}</span>}</td>
            <td className="px-4"><span className="flex items-center gap-3 text-[13px] tabular-nums"><span className="text-ok">{st.yes} kommen</span>{st.wait > 0 && <span className="text-brass">{st.wait} warten</span>}<span className="text-mute">{st.open} offen</span></span></td>
            <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
          </tr> })}</tbody></table>)}
    {form && <EventForm ev={form === 'neu' ? null : form} onClose={() => setForm(null)} />}
  </>)
}

/* ---------- Seite eines Termins ---------- */
type Who = 'alle' | 'kommen' | 'warten' | 'nein' | 'offen'
function EventPage({ e, onBack, onEdit }: { e: Ev; onBack: () => void; onEdit: () => void }) {
  const { staff, me, reload, branches } = useApp()
  const stats = useStats()
  const st = stats(e)
  const can = me.app_role === 'buero' || (me.app_role === 'filialleitung' && e.createdBy === me.id)
  const past = new Date(e.endsAt ?? e.startsAt) < new Date()
  const [who, setWho] = useState<Who>('alle'), [busy, setBusy] = useState<string | null>(null)
  const creator = staff.find(s => s.id === e.createdBy)
  const people = st.people
  const list = people.filter(p => who === 'alle' || p.kind === who)
  const remind = async (ids?: string[]) => {
    setBusy(ids?.[0] ?? 'alle')
    const { data } = await supabase!.functions.invoke('notify', { body: { action: 'remind_event', event_id: e.id, employee_ids: ids ?? people.filter(p => p.kind === 'offen').map(p => p.s.id) } })
    setBusy(null)
    toast(data?.ok ? (data.sent ? `Erinnerung an ${data.people} ${data.people === 1 ? 'Person' : 'Personen'} geschickt` : 'Erinnerung gesendet, aber noch hat niemand davon Mitteilungen eingeschaltet') : 'Das hat nicht geklappt', data?.ok ? 'ok' : 'error')
  }
  const del = async () => { if (!confirm('Diesen Termin löschen? Zu- und Absagen gehen verloren.')) return; const { error } = await supabase!.from('events').delete().eq('id', e.id); toast(error ? 'Löschen hat nicht geklappt' : 'Gelöscht', error ? 'error' : 'ok'); if (!error) { await reload(); onBack() } }
  const csv = () => downloadCsv(`Teilnehmende ${e.title} ${isoDay(new Date(e.startsAt))}`, eventParticipantCsv(list))
  const statusOf = (p: typeof people[number]) => p.kind === 'kommen' ? <Status kind="yes">Kommt</Status> : p.kind === 'warten' ? <Status kind="wait">Warteliste, Platz {p.pos}</Status> : p.kind === 'nein' ? <Status kind="no">Kommt nicht</Status> : <Status kind="none">Keine Antwort</Status>
  return (
    <div className="max-w-[1100px]">
      <Back onClick={onBack}>Schulungen & Events</Back>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0"><p className="text-[13px] text-mute flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${KIND_TONE[e.kind] ?? 'bg-sage-400'}`} />{e.kind}{past ? ' · vorbei' : ''}</p><h1 className="text-[28px] leading-tight mt-1">{e.title}</h1></div>
        <div className="flex items-center gap-2 shrink-0">
          {can && <button onClick={del} title="Löschen" className="w-10 h-10 rounded-[10px] text-mute hover:text-alert hover:bg-sage-50 flex items-center justify-center"><Trash2 size={16} /></button>}
          {can && <button onClick={onEdit} className={`${btn2} flex items-center gap-2`}><Pencil size={14} />Bearbeiten</button>}
          {!past && st.open > 0 && <button disabled={!!busy} onClick={() => remind()} className={`${btn} flex items-center gap-2`}><Bell size={15} />{busy === 'alle' ? 'Sendet …' : `${st.open} ohne Antwort erinnern`}</button>}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-14 mt-8">
        <div>
          <DataRow label="Datum" value={fmtDate(e.startsAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
          <DataRow label="Zeit" value={`${fmtTime(e.startsAt)}${e.endsAt ? ` – ${fmtTime(e.endsAt)}` : ''}`} />
          {e.place && <DataRow label="Ort" value={e.place} copy={e.place} />}
          {e.link && <DataRow label="Online-Link" value={<span className="truncate inline-block max-w-[360px] align-bottom">{e.link}</span>} href={e.link} copy={e.link} />}
          <DataRow label="Für" value={[...(e.audiencePeople.length ? [`${e.audiencePeople.length} ausgewählte Personen`] : []), e.audienceBranches.length ? e.audienceBranches.map(id => branches.find(b => b.id === id)?.name).join(', ') : 'Alle Studios', ...e.audienceSkills].join(' · ')} />
          <DataRow label="Plätze" value={e.capacity ? `${e.taken} von ${e.capacity} vergeben${e.waiting ? ` · ${e.waiting} auf der Warteliste` : ''}` : 'unbegrenzt'} />
          {e.registerUntil && <DataRow label="Anmeldung bis" value={fmtDate(e.registerUntil, { weekday: 'short', day: 'numeric', month: 'long' })} />}
          {creator && <DataRow label="Angelegt von" value={`${creator.first} ${creator.last}`} muted />}
          {can && <PhorestEventStatus e={e} />}
          {e.description && <p className="mt-5 text-[14.5px] leading-relaxed text-ink/85 whitespace-pre-wrap">{e.description}</p>}
        </div>
        <div className="flex items-center gap-6 self-start">
          <DonutParts size={132} stroke={13} parts={[{ value: st.yes, color: STEPS[0] }, { value: st.wait, color: '#B08A52' }, { value: st.no, color: '#C8CDC5' }, { value: st.open, color: STEPS[3] }]}>
            <span className="font-display text-[28px] leading-none tabular-nums">{st.yes}</span><span className="text-[11.5px] text-mute mt-1">kommen</span></DonutParts>
          <ul className="space-y-2 text-[13.5px]">{([['Kommen', st.yes, STEPS[0]], ['Warteliste', st.wait, '#B08A52'], ['Absagen', st.no, '#C8CDC5'], ['Ohne Antwort', st.open, STEPS[3]]] as const).map(([l, n, c]) =>
            <li key={l} className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} /><span className="w-24">{l}</span><span className="tabular-nums">{n}</span></li>)}</ul>
        </div>
      </div>

      <Section className="mt-12" title="Teilnehmende" count={people.length} action={<button onClick={csv} className="text-[13px] text-olive-700">Als CSV</button>}>
        <div className="mb-3">{st.excludedTests > 0 && <p className="mb-3 text-[13px] text-mute">{st.excludedTests} Testantwort(en) sind in der Liste enthalten, aber nicht in der Standardstatistik.</p>}<Seg value={who} onChange={setWho} items={[['alle', 'Alle'], ['kommen', `Kommen ${people.filter(p => p.kind === 'kommen').length}`], ...(people.some(p => p.kind === 'warten') ? [['warten', `Warteliste ${people.filter(p => p.kind === 'warten').length}`] as [Who, string]] : []), ['nein', `Absagen ${people.filter(p => p.kind === 'nein').length}`], ['offen', `Ohne Antwort ${st.open}`]]} /></div>
        {list.length === 0 ? <Empty>Niemand in dieser Auswahl.</Empty> :
        <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Person</Th><th className="w-[160px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Studio</th><th className="w-[230px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Antwort</th><th className="w-[140px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Seit</th><th className="w-[120px] border-b border-line" /></tr></thead>
          <tbody className="divide-y divide-line">{list.map(p => <tr key={p.s.id}>
            <td className="px-4 py-2.5"><span className="flex items-center gap-3 min-w-0"><Avatar s={p.s} photo={p.s.photo} size="w-8 h-8 text-[12px]" /><span className="min-w-0"><span className="block truncate">{p.s.first} {p.s.last}{isTest(p.s) ? ' · Testkonto' : ''}</span><span className="block text-[12.5px] text-mute truncate">{p.s.role}</span></span></span></td>
            <td className="px-4 text-mute">{p.s.branch}</td><td className="px-4">{statusOf(p)}</td>
            <td className="px-4 text-mute text-[13px]">{p.at ? fmtDate(p.at, { day: 'numeric', month: 'numeric' }) : '–'}</td>
            <td className="px-4 text-right">{p.kind === 'offen' && !past && <button disabled={!!busy} onClick={() => remind([p.s.id])} className="h-8 px-3 rounded-[8px] text-[13px] text-olive-700 hover:bg-sage-50 inline-flex items-center gap-1.5"><Bell size={13} />{busy === p.s.id ? 'Sendet …' : 'Erinnern'}</button>}</td>
          </tr>)}</tbody></table>}
      </Section>
    </div>
  )
}

function PhorestEventStatus({ e }: { e: Ev }) {
  const [status, setStatus] = useState<any>(null), [busy, setBusy] = useState(false)
  const load = async () => { const { data } = await supabase!.rpc('phorest_event_status', { p_event: e.id }); setStatus(data) }
  useEffect(() => { void load() }, [e.id, e.phorestSync, e.startsAt, e.endsAt])
  const errors: Record<string,string> = { calendar_conflict: 'Überschneidung mit einem bestehenden Phorest-Termin oder einer Sperrzeit.', phorest_changed_manually: 'Der Eintrag wurde direkt in Phorest geändert. Bitte dort prüfen; TeamHub überschreibt ihn nicht.', missing_mapping: 'Mindestens eine angemeldete Person hat keine eindeutige Phorest-Zuordnung.', single_day_required: 'Beginn und Ende müssen am selben Tag liegen.', phorest_403: 'Dem Phorest-Zugang fehlt die Berechtigung für interne Kalendereinträge.', phorest_401: 'Der Phorest-Zugang wurde abgelehnt.', continue: 'Weitere Teilnahmen werden im nächsten Durchgang übertragen.' }
  const sync = async () => { setBusy(true); const result = await phorest<any>({ action: 'retry', event_id: e.id, _eventSync: true }); setBusy(false); await load(); toast(result?.ok ? 'Phorest-Abgleich durchgeführt' : 'Phorest-Abgleich braucht Aufmerksamkeit', result?.ok ? 'ok' : 'error') }
  if (!e.phorestSync && !status) return <DataRow label="Phorest" value="Nicht aktiviert" muted />
  return <div className="my-5 rounded-[12px] bg-sage-50 p-4 text-[13px]">
    <p className="font-medium">Phorest-Kalender · {status?.status === 'synced' ? 'Abgeglichen' : status?.status === 'error' ? 'Bitte prüfen' : status?.status === 'running' ? 'Wird abgeglichen' : 'Abgleich vorgemerkt'}</p>
    <p className="text-mute mt-1">{e.phorestSync ? 'Bestätigte Teilnahmen werden als interne Kalendersperren übernommen. Wartelisten blockieren keine Zeit.' : 'Ausgeschaltet. Zukünftige TeamHub-Einträge werden entfernt.'}</p>
    {status?.error && <p className="mt-2 text-alert">{errors[status.error] ?? 'Der Abgleich ist noch nicht abgeschlossen. Bitte erneut versuchen oder den Phorest-Zugang prüfen.'}</p>}
    <button disabled={busy} onClick={sync} className="mt-3 text-olive-700 font-medium disabled:opacity-50">{busy ? 'Gleicht ab …' : 'Jetzt abgleichen'}</button>
  </div>
}

/* ---------- Jahresplan ---------- */
function YearPlan({ events, onOpen }: { events: Ev[]; onOpen: (e: Ev) => void }) {
  const [y, setY] = useState(new Date().getFullYear())
  const thisMonth = isoDay().slice(0, 7)
  return <div>
    <div className="flex items-center gap-3 mb-4"><button onClick={() => setY(y - 1)} aria-label="Vorjahr" className="w-9 h-9 rounded-[10px] hover:bg-sage-50 text-[18px]">‹</button><p className="font-display text-[22px] tabular-nums">{y}</p><button onClick={() => setY(y + 1)} aria-label="Nächstes Jahr" className="w-9 h-9 rounded-[10px] hover:bg-sage-50 text-[18px]">›</button>
      <span className="ml-auto flex gap-4 text-[12.5px] text-mute">{KINDS.map(k => <span key={k} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${KIND_TONE[k]}`} />{k}</span>)}</span></div>
    <div className="grid grid-cols-4 border-t border-l border-line">{Array.from({ length: 12 }, (_, i) => {
      const key = `${y}-${String(i + 1).padStart(2, '0')}`
      const evs = events.filter(e => isoDay(new Date(e.startsAt)).startsWith(key)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      return <div key={key} className={`p-3 min-h-[140px] border-r border-b border-line ${key === thisMonth ? 'bg-sage-50' : ''}`}>
        <p className={`text-[13px] capitalize ${key < thisMonth ? 'text-mute' : 'text-ink'}`}>{new Intl.DateTimeFormat('de-CH', { month: 'long' }).format(new Date(key + '-15T12:00:00Z'))}</p>
        <ul className="mt-2 space-y-0.5">{evs.map(e => <li key={e.id}><button onClick={() => onOpen(e)} className="w-full text-left flex items-start gap-2 rounded-[8px] px-1.5 py-1 -mx-1.5 hover:bg-white">
          <span className={`w-1.5 h-1.5 rounded-full mt-[7px] shrink-0 ${KIND_TONE[e.kind] ?? 'bg-sage-400'}`} />
          <span className="min-w-0"><span className="block text-[13px] truncate">{e.title}</span><span className="block text-[11.5px] text-mute tabular-nums">{fmtDate(e.startsAt, { weekday: 'short', day: 'numeric', month: 'numeric' })}{e.capacity ? ` · ${e.taken}/${e.capacity}` : ''}</span></span>
        </button></li>)}</ul>
      </div> })}</div>
  </div>
}

/* ---------- Anlegen / Bearbeiten ---------- */
const day = (iso: string) => isoDay(new Date(iso))
const tm = (iso: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
function EventForm({ ev, onClose }: { ev: Ev | null; onClose: () => void }) {
  const { branches, skillCatalog, staff, me, employee, reload } = useApp()
  const office = me.app_role === 'buero'
  const own = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [f, setF] = useState({
    title: ev?.raw.title ?? '', kind: ev?.kind ?? 'Schulung', description: ev?.raw.description ?? '', date: ev ? day(ev.startsAt) : '', from: ev ? tm(ev.startsAt) : '09:00', to: ev?.endsAt ? tm(ev.endsAt) : '',
    place: ev?.raw.place ?? '', link: ev?.link ?? '', capacity: ev?.capacity ? String(ev.capacity) : '', until: ev?.registerUntil ? day(ev.registerUntil) : '',
    image: ev?.imagePath ?? '', people: ev?.audiencePeople ?? [], phorestSync: ev?.phorestSync ?? false, phorestPaid: ev?.phorestPaid ?? true, branches: ev?.audienceBranches ?? (office ? [] : [me.branch_id]), skills: ev?.audienceSkills ?? [],
  })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [personQuery, setPersonQuery] = useState('')
  // Bild der Schulung (28.10., Renée): erscheint in den Neuigkeiten auf der Startseite und im Kalender
  const [preview, setPreview] = useState<string | null>(ev?.image ?? null), [uploading, setUploading] = useState(false)
  const photo = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Bitte ein Foto wählen.'); return }
    if (file.size > 25 * 1024 * 1024) { setErr('Das Foto ist grösser als 25 MB.'); return }
    setUploading(true); setErr('')
    const path = `events/${isoDay()}-${crypto.randomUUID().slice(0, 8)}.${(file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')}`
    const { error } = await supabase!.storage.from('media').upload(path, file, { contentType: file.type })
    setUploading(false)
    if (error) { setErr('Das Foto konnte nicht hochgeladen werden.'); return }
    setF(v => ({ ...v, image: path })); setPreview(URL.createObjectURL(file))
  }
  const save = async () => {
    if (!f.title.trim() || !f.date) { setErr('Titel und Datum sind nötig.'); return }
    if (f.phorestSync && !f.to) { setErr('Für Phorest ist eine Endzeit nötig.'); return }
    if (f.to && f.to <= f.from) { setErr('„Bis“ muss nach „Von“ liegen.'); return }
    if (!office && !f.branches.length) { setErr('Bitte dein Studio wählen.'); return }
    const at = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString()
    const row = { title: f.title.trim(), kind: f.kind, description: f.description.trim(), starts_at: at(f.date, f.from), ends_at: f.to ? at(f.date, f.to) : null,
      place: f.place.trim(), link: f.link.trim() || null, capacity: f.capacity ? Number(f.capacity) : null, register_until: f.until ? new Date(f.until + 'T23:59:00').toISOString() : null,
      audience_branches: f.branches, audience_skills: f.skills, audience_people: f.people, phorest_sync: f.phorestSync, phorest_paid: f.phorestPaid, image_path: f.image || null }
    setBusy(true)
    const { error } = ev ? await supabase!.from('events').update(row).eq('id', ev.id) : await supabase!.from('events').insert({ ...row, created_by: employee.id })
    setBusy(false)
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    toast(ev ? 'Termin gespeichert' : 'Termin angelegt, die Zielgruppe bekommt eine Mitteilung'); await reload(); if (!ev) notifyNow(); retranslate(); onClose()
  }
  return (
    <Modal width={720} title={ev ? 'Termin bearbeiten' : 'Neuer Termin'} onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={save} className={btn}>{ev ? 'Speichern' : 'Anlegen'}</button></>}>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="Titel"><input autoFocus value={f.title} onChange={x => setF({ ...f, title: x.target.value })} placeholder="z. B. Produktschulung Pflegelinie" className={inpStone} /></Field>
        <div><span className="block text-xs text-mute mb-1">Art</span><Seg value={f.kind} onChange={v => setF({ ...f, kind: v })} items={KINDS.map(k => [k, k] as [string, string])} /></div>
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
      <div className="mt-3"><span className="block text-xs text-mute mb-1.5">Bild (optional, erscheint auf der Startseite)</span>
        {preview ? <div className="relative w-full max-w-[360px]"><img src={preview} alt="" className="w-full aspect-[16/9] object-cover rounded-[12px]" /><button onClick={() => { setF({ ...f, image: '' }); setPreview(null) }} className="absolute top-2 right-2 h-8 px-3 rounded-[8px] bg-white/90 text-[13px]">Bild entfernen</button></div>
          : <label className={`${btn2} inline-flex items-center gap-1.5 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}><ImagePlus size={15} />{uploading ? 'Lädt hoch …' : 'Foto wählen'}<input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void photo(file) }} /></label>}
      </div>
      <div className="mt-3"><Field label="Beschreibung"><textarea value={f.description} onChange={x => setF({ ...f, description: x.target.value })} rows={3} placeholder="Inhalt, was mitbringen, für wen" className="w-full rounded-[10px] bg-sage-50 px-3 py-2.5 text-[14px] outline-none resize-none" /></Field></div>
      <div className="mt-4 rounded-[12px] bg-sage-50 p-3 text-[13px]"><label className="flex gap-2 items-center"><input type="checkbox" checked={f.phorestSync} onChange={x => setF({ ...f, phorestSync: x.target.checked })} />Bestätigte Teilnahmen in Phorest eintragen</label><p className="mt-1 text-mute">Schulungen und Meetings erscheinen als interne Kalendersperre, ohne Kundenbuchung. Änderungen und Absagen werden abgeglichen. Eine Endzeit ist erforderlich.</p>{f.phorestSync && <label className="mt-3 flex gap-2 items-center"><input type="checkbox" checked={f.phorestPaid} onChange={x => setF({ ...f, phorestPaid: x.target.checked })} />In Phorest als bezahlte Zeit markieren</label>}</div>
      <div className="mt-4"><span className="block text-xs text-mute mb-1.5">Für {office ? '(kein Studio = alle)' : ''}</span><Chips tone="stone" items={own.map(b => ({ value: b.id, label: b.name }))} value={f.branches} onChange={v => setF({ ...f, branches: v })} /></div>
      <details className="mt-4 text-[13px]"><summary className="cursor-pointer text-ink">Einzelne Personen zuteilen (optional){f.people.length ? ` · ${f.people.length} ausgewählt` : ''}</summary><input aria-label="Personen suchen" placeholder="Personen suchen …" value={personQuery} onChange={e => setPersonQuery(e.target.value)} className={`${inpStone} mt-3`} /><div className="mt-2 max-h-36 overflow-y-auto"><Chips tone="stone" items={adminPickerPeople(staff, me).filter(s => `${s.first} ${s.last}`.toLowerCase().includes(personQuery.toLowerCase())).map(s => ({ value: s.id, label: `${s.first} ${s.last}${isTest(s) ? ' (Testkonto)' : ''}` }))} value={f.people} onChange={v => setF({ ...f, people: v })} /></div></details><p className="mt-2 text-xs text-mute">Schulungen sehen alle. Anmelden können sich nur Personen, auf die alle gewählten Kriterien zutreffen. Ohne Auswahl gilt die gesamte Zielgruppe.</p>
      {skillCatalog.length > 0 && <div className="mt-3"><span className="block text-xs text-mute mb-1.5">Nur mit diesen Skills (optional)</span><Chips tone="stone" items={skillCatalog.map(k => ({ value: k, label: k }))} value={f.skills} onChange={v => setF({ ...f, skills: v })} /></div>}
      <div className="mt-3"><Err m={err} /></div>
    </Modal>
  )
}
