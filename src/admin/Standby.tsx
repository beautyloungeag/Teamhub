import { useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useApp, isoDay, addDays, fmtDate, type Staff } from '../store'
import { supabase } from '../lib/supabase'
import { notifyNow } from '../lib/push'
import { Avatar } from '../People'
import { toast } from '../Toast'
import { useStandbyRequests, reloadStandby, timeSpan, type SReq } from '../standby'
import { H, New, Th, Field, inpStone, btn, btn2, Err, isTest, Select, Seg, Modal, Back, Section, Status, Empty, DataRow } from './kit'

// Aushilfe: Mitarbeitende tragen in der App ein, an welchen Tagen sie einspringen können.
// „Wer kann wann“ zeigt das als Einsatzplan; ein Klick auf einen Tag fragt an. Unter „Anfragen“ sieht man,
// wer zugesagt hat, und teilt jemanden ein.

const label = (d: string, o: Intl.DateTimeFormatOptions) => fmtDate(d + 'T12:00:00Z', o)
export function StandbyAdmin() {
  const { me } = useApp()
  const { requests, responses } = useStandbyRequests()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])]
  const reqs = requests.filter(r => office || mine.includes(r.branch_id))
  const openN = reqs.filter(r => r.status === 'offen' && r.day >= isoDay()).length
  const [tab, setTab] = useState<'plan' | 'anfragen'>(openN ? 'anfragen' : 'plan')
  const [ask, setAsk] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null)
  const sel = open ? reqs.find(r => r.id === open) : null
  if (sel) return <RequestPage r={sel} responses={responses.filter(x => x.request_id === sel.id)} onBack={() => setOpen(null)} />
  return (<>
    <H action={<New onClick={() => setAsk(isoDay())}>Aushilfe anfragen</New>}>Aushilfe</H>
    <div className="mb-6"><Seg value={tab} onChange={setTab} items={[['plan', 'Wer kann wann'], ['anfragen', <>Anfragen{openN > 0 && <span className="ml-1.5 text-mute tabular-nums">{openN}</span>}</>]]} /></div>
    {tab === 'plan' ? <Plan onAsk={d => setAsk(d)} /> : <Requests reqs={reqs} responses={responses} onOpen={setOpen} />}
    {ask && <AskModal day={ask} onClose={() => setAsk(null)} onDone={() => { setAsk(null); setTab('anfragen') }} />}
  </>)
}

/* ---------- Einsatzplan ---------- */
function Plan({ onAsk }: { onAsk: (d: string) => void }) {
  const { standby, staff, skillCatalog, me } = useApp()
  const [start, setStart] = useState(isoDay()), [sk, setSk] = useState('')
  const days = Array.from({ length: 14 }, (_, i) => addDays(i, start))
  const can = (s: Staff, d: string) => standby.some(x => x.employee_id === s.id && x.day === d)
  const mine = [me.branch_id, ...(me.extra ?? [])]
  // Testkonten nur, wenn sie Tage eingetragen haben (für Vorführungen), dann markiert
  const people = staff.filter(s => s.active && s.branch_id !== 'buero' && (!sk || s.skills.includes(sk)) && days.some(d => can(s, d)))
    .sort((a, b) => Number(!mine.includes(a.branch_id)) - Number(!mine.includes(b.branch_id)) || a.branch.localeCompare(b.branch) || a.first.localeCompare(b.first))
  const today = isoDay()
  const weekend = (d: string) => [0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())
  return (<>
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="flex items-center gap-1 h-10 px-1 rounded-[10px] bg-sage-50">
        <button onClick={() => setStart(addDays(-7, start))} disabled={start <= today} aria-label="Eine Woche zurück" className="w-8 h-8 rounded-[8px] hover:bg-white flex items-center justify-center disabled:opacity-30"><ChevronLeft size={16} /></button>
        <span className="px-2 text-[14px] min-w-[170px] text-center tabular-nums">{label(days[0], { day: 'numeric', month: 'numeric' })} – {label(days[13], { day: 'numeric', month: 'numeric' })}</span>
        <button onClick={() => setStart(addDays(7, start))} aria-label="Eine Woche weiter" className="w-8 h-8 rounded-[8px] hover:bg-white flex items-center justify-center"><ChevronRight size={16} /></button>
      </div>
      <Select tone="stone" className="w-52" value={sk} onChange={setSk} options={[{ value: '', label: 'Alle Skills' }, ...skillCatalog.map(k => ({ value: k, label: k }))]} />
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] border-collapse min-w-[880px] table-fixed">
        <thead><tr>
          <th className="text-left font-normal text-xs text-mute px-3 py-2 border-b border-line w-[240px]">Person</th>
          {days.map(d => <th key={d} className={`p-0 border-b border-line ${weekend(d) ? 'bg-sage-50/60' : ''}`}>
            <button onClick={() => onAsk(d)} title={`Für ${label(d, { weekday: 'long', day: 'numeric', month: 'long' })} anfragen`} className={`w-full py-1.5 flex flex-col items-center rounded-[8px] hover:bg-sage-100 transition ${d === today ? 'text-olive-700' : ''}`}>
              <span className="text-[11px] text-mute">{label(d, { weekday: 'short' }).replace('.', '')}</span><span className={`text-[14px] tabular-nums ${d === today ? 'font-medium' : ''}`}>{label(d, { day: 'numeric' })}</span></button></th>)}
        </tr></thead>
        <tbody>
          {people.map(s => <tr key={s.id} className="border-b border-line">
            <td className="px-3 py-2"><span className="flex items-center gap-2.5 min-w-0"><Avatar s={s} photo={s.photo} size="w-7 h-7 text-[11px]" /><span className="min-w-0"><span className="block truncate">{s.first} {s.last}{isTest(s) && <span className="text-mute"> · Testkonto</span>}</span><span className="block text-[12px] text-mute truncate">{s.branch}{s.skills.length ? ` · ${s.skills.slice(0, 2).join(', ')}` : ''}</span></span></span></td>
            {days.map(d => <td key={d} className={`text-center ${weekend(d) ? 'bg-sage-50/60' : ''}`}>{can(s, d) ? <button onClick={() => onAsk(d)} title={`${s.first} kann am ${label(d, { weekday: 'long', day: 'numeric', month: 'numeric' })}`} className="w-7 h-7 rounded-full inline-flex items-center justify-center hover:bg-sage-100"><span className="w-3 h-3 rounded-full bg-olive-700" /></button> : <span className="text-sage-200">·</span>}</td>)}
          </tr>)}
          <tr><td className="px-3 py-2.5 text-[12.5px] text-mute">Verfügbar</td>{days.map(d => { const n = people.filter(s => can(s, d)).length; return <td key={d} className={`text-center text-[13px] tabular-nums ${n ? '' : 'text-sage-400'} ${weekend(d) ? 'bg-sage-50/60' : ''}`}>{n || '–'}</td> })}</tr>
        </tbody>
      </table>
    </div>
    {people.length === 0 && <Empty action={<button onClick={() => onAsk(days[0])} className="text-olive-700">Trotzdem an alle anfragen</button>}>In diesen zwei Wochen hat sich niemand{sk ? ` mit „${sk}“` : ''} eingetragen. Mitarbeitende tragen ihre Tage in der App im Profil ein.</Empty>}
  </>)
}

/* ---------- Anfragen ---------- */
function Requests({ reqs, responses, onOpen }: { reqs: SReq[]; responses: { request_id: string; employee_id: string; answer: string }[]; onOpen: (id: string) => void }) {
  const { staff, branches } = useApp()
  const today = isoDay()
  const [view, setView] = useState<'kommend' | 'vergangen'>('kommend')
  const list = reqs.filter(r => view === 'kommend' ? r.day >= today : r.day < today).sort((a, b) => view === 'kommend' ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day))
  return (<>
    <div className="mb-4"><Seg value={view} onChange={setView} items={[['kommend', 'Kommend'], ['vergangen', 'Vergangen']]} /></div>
    {list.length === 0 ? <Empty>{view === 'kommend' ? 'Keine offenen Anfragen.' : 'Noch keine vergangenen Anfragen.'}</Empty> :
    <table className="tbl tbl-lead w-full text-[14px] table-fixed"><thead><tr><th className="w-[84px] border-b border-line" /><Th>Anfrage</Th><th className="w-[260px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Können</th><th className="w-[230px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Stand</th><th className="w-10 border-b border-line" /></tr></thead>
      <tbody className="divide-y divide-line">{list.map(r => { const yes = responses.filter(x => x.request_id === r.id && x.answer === 'ja').map(x => staff.find(s => s.id === x.employee_id)).filter((s): s is Staff => !!s), filled = staff.find(s => s.id === r.filled_by)
        return <tr key={r.id} onClick={() => onOpen(r.id)} className={`cursor-pointer hover:bg-sage-50/70 ${r.status === 'abgesagt' ? 'opacity-60' : ''}`}>
          <td className="px-4 py-3"><span className="block font-display text-[22px] leading-none">{label(r.day, { day: 'numeric' })}</span><span className="block text-[11.5px] text-mute mt-1">{label(r.day, { weekday: 'short', month: 'short' })}</span></td>
          <td className="px-4"><span className="block truncate">{[branches.find(b => b.id === r.branch_id)?.name, timeSpan(r), r.skill].filter(Boolean).join(' · ')}</span><span className="block text-[12.5px] text-mute truncate">{r.note || (r.to_all ? 'An alle' : 'An alle, die an dem Tag können')}</span></td>
          <td className="px-4">{yes.length ? <span className="flex items-center gap-2"><span className="flex -space-x-2">{yes.slice(0, 4).map(s => <span key={s.id} className="ring-2 ring-white rounded-full"><Avatar s={s} photo={s.photo} size="w-7 h-7 text-[10px]" /></span>)}</span><span className="text-[13px] text-ink/80">{yes.length} {yes.length === 1 ? 'kann' : 'können'}</span></span> : <span className="text-[13px] text-mute">noch niemand</span>}</td>
          <td className="px-4">{r.status === 'besetzt' ? <Status kind="yes">Besetzt{filled ? `: ${filled.first} ${filled.last.slice(0, 1)}.` : ''}</Status> : r.status === 'abgesagt' ? <Status kind="none">Nicht mehr nötig</Status> : <Status kind="wait">Offen</Status>}</td>
          <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
        </tr> })}</tbody></table>}
  </>)
}

function RequestPage({ r, responses, onBack }: { r: SReq; responses: { request_id: string; employee_id: string; answer: string }[]; onBack: () => void }) {
  const { staff, branches, standby } = useApp()
  const yes = responses.filter(x => x.answer === 'ja').map(x => staff.find(s => s.id === x.employee_id)).filter((s): s is Staff => !!s)
  const no = responses.filter(x => x.answer === 'nein').map(x => staff.find(s => s.id === x.employee_id)).filter((s): s is Staff => !!s)
  const reached = staff.filter(s => s.active && s.id !== r.created_by && s.branch_id !== 'buero' && (r.to_all || standby.some(x => x.employee_id === s.id && x.day === r.day)) && (!r.skill || s.skills.includes(r.skill))).length
  const filled = staff.find(s => s.id === r.filled_by)
  const past = r.day < isoDay()
  const setStatus = async (patch: Partial<SReq>) => { const { error } = await supabase!.from('standby_requests').update(patch).eq('id', r.id); if (error) toast('Das hat nicht geklappt', 'error'); else toast(patch.status === 'besetzt' ? 'Eingeteilt, sie bekommt eine Mitteilung' : 'Gespeichert'); await reloadStandby(); if (!error && patch.status === 'besetzt') notifyNow() }
  const del = async () => { if (!confirm('Anfrage löschen?')) return; await supabase!.from('standby_requests').delete().eq('id', r.id); await reloadStandby(); onBack() }
  const person = (s: Staff, action?: React.ReactNode) => <li key={s.id} className="py-2.5 flex items-center gap-3">
    <Avatar s={s} photo={s.photo} size="w-9 h-9 text-[12px]" />
    <span className="flex-1 min-w-0"><span className="block truncate text-[14px]">{s.first} {s.last}</span><span className="block text-[12.5px] text-mute truncate">{s.role} · {s.branch}{s.skills.length ? ` · ${s.skills.slice(0, 3).join(', ')}` : ''}</span></span>
    {s.phone && <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="text-[13px] text-ink/80 hover:underline tabular-nums">{s.phone}</a>}
    {action}</li>
  return (
    <div className="max-w-[920px]">
      <Back onClick={onBack}>Aushilfe</Back>
      <div className="flex items-start justify-between gap-6 mb-8">
        <div><p className="text-[13px] text-mute">{branches.find(b => b.id === r.branch_id)?.name}</p><h1 className="text-[28px] leading-tight mt-1">Aushilfe {label(r.day, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
          <p className="mt-2">{r.status === 'besetzt' ? <Status kind="yes">Besetzt{filled ? `: ${filled.first} ${filled.last}` : ''}</Status> : r.status === 'abgesagt' ? <Status kind="none">Nicht mehr nötig</Status> : <Status kind="wait">Offen · {yes.length} {yes.length === 1 ? 'kann' : 'können'}</Status>}</p></div>
        <div className="flex items-center gap-2 shrink-0">
          {r.status === 'offen' && !past && <button onClick={() => setStatus({ status: 'abgesagt' })} className={btn2}>Nicht mehr nötig</button>}
          {r.status !== 'offen' && !past && <button onClick={() => setStatus({ status: 'offen', filled_by: null })} className={btn2}>Wieder öffnen</button>}
          <button onClick={del} title="Löschen" className="w-10 h-10 rounded-[10px] text-mute hover:text-alert hover:bg-sage-50 flex items-center justify-center"><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="mb-10">
        <DataRow label="Zeit" value={timeSpan(r) || 'ganzer Tag'} />
        <DataRow label="Skill" value={r.skill || 'egal'} />
        {r.note && <DataRow label="Notiz" value={r.note} />}
        <DataRow label="An wen" value={`${r.to_all ? 'Alle im Team' : 'Alle, die an dem Tag können'} · ${reached} ${reached === 1 ? 'Person' : 'Personen'} erreicht`} />
        <DataRow label="Angefragt von" value={r.created_by_name || '–'} muted />
      </div>
      <Section title="Können" count={yes.length}>
        {yes.length === 0 ? <Empty>Noch keine Zusage.</Empty> : <ul className="divide-y divide-line">{yes.map(s => person(s, r.status === 'offen' && !past
          ? <button onClick={() => setStatus({ status: 'besetzt', filled_by: s.id })} className="h-8 px-3 rounded-[8px] bg-olive-700 text-white text-[13px] ml-2">Einteilen</button>
          : r.filled_by === s.id ? <Status kind="yes">Eingeteilt</Status> : null))}</ul>}
      </Section>
      {no.length > 0 && <Section className="mt-8" title="Können nicht" count={no.length}><ul className="divide-y divide-line opacity-70">{no.map(s => person(s))}</ul></Section>}
    </div>
  )
}

function AskModal({ day, onClose, onDone }: { day: string; onClose: () => void; onDone: () => void }) {
  const { me, employee, branches, skillCatalog, standby, staff } = useApp()
  const office = me.app_role === 'buero'
  const own = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [f, setF] = useState({ branch: own.find(b => b.id === me.branch_id)?.id ?? own[0]?.id ?? '', day, from: '', to: '', skill: '', note: '', toAll: !standby.some(x => x.day === day) })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const reach = staff.filter(s => s.active && s.id !== me.id && s.branch_id !== 'buero' && (f.toAll || standby.some(x => x.employee_id === s.id && x.day === f.day)) && (!f.skill || s.skills.includes(f.skill))).length
  const save = async () => {
    if (!f.branch || !f.day) { setErr('Studio und Datum sind nötig.'); return }
    if (f.from && f.to && f.to <= f.from) { setErr('„Bis“ muss nach „Von“ liegen.'); return }
    setBusy(true)
    const { error } = await supabase!.from('standby_requests').insert({ branch_id: f.branch, day: f.day, start_time: f.from || null, end_time: f.to || null, skill: f.skill || null, note: f.note.trim(), to_all: f.toAll, created_by: employee.id, created_by_name: `${me.first} ${me.last.slice(0, 1)}.` })
    setBusy(false)
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    toast(reach ? `Anfrage an ${reach} ${reach === 1 ? 'Person' : 'Personen'} geschickt` : 'Anfrage gespeichert'); await reloadStandby(); notifyNow(); onDone()
  }
  return (
    <Modal title="Aushilfe anfragen" onClose={onClose} footer={<><span className="mr-auto text-[13px] text-olive-700">Erreicht {reach} {reach === 1 ? 'Person' : 'Personen'}</span><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={save} className={btn}>Anfrage senden</button></>}>
      <div className="grid grid-cols-2 gap-3">
        {own.length > 1 ? <Select label="Studio" tone="stone" value={f.branch} onChange={v => setF({ ...f, branch: v })} options={own.map(b => ({ value: b.id, label: b.name }))} /> : <Field label="Studio"><div className={`${inpStone} flex items-center`}>{own[0]?.name}</div></Field>}
        <Field label="Datum"><input type="date" min={isoDay()} value={f.day} onChange={e => setF({ ...f, day: e.target.value })} className={inpStone} /></Field>
        <Field label="Von (optional)"><input type="time" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className={inpStone} /></Field>
        <Field label="Bis (optional)"><input type="time" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className={inpStone} /></Field>
        <div className="col-span-2"><Select label="Skill" tone="stone" value={f.skill} onChange={v => setF({ ...f, skill: v })} options={[{ value: '', label: 'Egal' }, ...skillCatalog.map(k => ({ value: k, label: k }))]} /></div>
        <div className="col-span-2"><Field label="Notiz (optional)"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="z. B. Pediküre-Termine am Nachmittag übernehmen" className={inpStone} /></Field></div>
      </div>
      <div className="mt-4"><span className="block text-xs text-mute mb-1.5">An wen</span>
        <Seg value={f.toAll ? 'alle' : 'eingetragen'} onChange={v => setF({ ...f, toAll: v === 'alle' })} items={[['eingetragen', 'Wer an dem Tag kann'], ['alle', 'Alle im Team']]} /></div>
      <div className="mt-3"><Err m={err} /></div>
    </Modal>
  )
}
