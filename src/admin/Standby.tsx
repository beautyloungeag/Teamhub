import { useState } from 'react'
import { Phone, Trash2 } from 'lucide-react'
import { useApp, isoDay, addDays, fmtDate, type Staff } from '../store'
import { supabase } from '../lib/supabase'
import { notifyNow } from '../lib/push'
import { Avatar } from '../People'
import { toast } from '../Toast'
import { useStandbyRequests, reloadStandby, timeSpan, type SReq } from '../standby'
import { H, New, Sec, Field, inpStone, btn, btn2, Err, real, inBranch, Select, Seg, Modal, Dot } from './kit'

// Aushilfe: Mitarbeitende tragen im Profil Tage ein, an denen sie einspringen können.
// Hier fragt die Filialleitung gezielt an, sieht die Antworten und teilt jemanden ein.

const label = (d: string, o: Intl.DateTimeFormatOptions) => fmtDate(d + 'T12:00:00Z', o)
export function StandbyAdmin() {
  const { me } = useApp()
  const { requests, responses } = useStandbyRequests()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])]
  const reqs = requests.filter(r => office || mine.includes(r.branch_id))
  const openN = reqs.filter(r => r.status === 'offen' && r.day >= isoDay()).length
  const [tab, setTab] = useState<'anfragen' | 'verfuegbar'>(openN ? 'anfragen' : 'verfuegbar')
  const [ask, setAsk] = useState<string | null>(null)
  return (<>
    <H info="Mitarbeitende tragen in ihrem Profil die Tage ein, an denen sie kurzfristig einspringen können. Fällt jemand aus, fragst du hier an: Alle, die an dem Tag können und den Skill haben, bekommen eine Mitteilung und antworten in der App. Du teilst dann jemanden ein."
      action={<New onClick={() => setAsk(isoDay())}>Aushilfe anfragen</New>}>Aushilfe</H>
    <div className="mb-6"><Seg value={tab} onChange={setTab} items={[['anfragen', <>Anfragen{openN > 0 && <span className="ml-1.5 text-mute tabular-nums">{openN}</span>}</>], ['verfuegbar', 'Wer kann wann']]} /></div>
    {tab === 'anfragen' ? <Requests reqs={reqs} responses={responses} onNew={() => setAsk(isoDay())} /> : <Availability onAsk={d => setAsk(d)} />}
    {ask && <AskModal day={ask} onClose={() => setAsk(null)} onDone={() => { setAsk(null); setTab('anfragen') }} />}
  </>)
}

function Requests({ reqs, responses, onNew }: { reqs: SReq[]; responses: { request_id: string; employee_id: string; answer: string }[]; onNew: () => void }) {
  const { staff, branches } = useApp()
  const today = isoDay()
  const upcoming = reqs.filter(r => r.day >= today).sort((a, b) => a.day.localeCompare(b.day))
  const past = reqs.filter(r => r.day < today).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 10)
  if (!reqs.length) return <div className="rounded-[16px] bg-sage-50 p-6 flex items-center gap-6"><div className="flex-1"><p className="font-medium">Noch keine Anfragen</p><p className="text-[13.5px] text-mute mt-1">Fällt jemand aus, fragst du hier eine Aushilfe an.</p></div><button onClick={onNew} className={btn}>Aushilfe anfragen</button></div>
  const card = (r: SReq) => {
    const resp = responses.filter(x => x.request_id === r.id)
    const yes = resp.filter(x => x.answer === 'ja').map(x => staff.find(s => s.id === x.employee_id)).filter((s): s is Staff => !!s)
    const no = resp.filter(x => x.answer === 'nein').length
    const filled = staff.find(s => s.id === r.filled_by)
    const setStatus = async (patch: Partial<SReq>) => { const { error } = await supabase!.from('standby_requests').update(patch).eq('id', r.id); if (error) toast('Das hat nicht geklappt', 'error'); await reloadStandby(); if (!error && patch.status === 'besetzt') notifyNow() }
    return (
      <section key={r.id} className={`rounded-[16px] border border-line ${r.day < today || r.status === 'abgesagt' ? 'opacity-60' : ''}`}>
        <div className="p-4 flex items-start gap-4">
          <span className="w-14 shrink-0 text-center rounded-[12px] bg-sage-50 py-1.5"><span className="block text-[11px] text-mute">{label(r.day, { weekday: 'short' })}</span><span className="block font-display text-[20px] leading-tight">{label(r.day, { day: 'numeric' })}</span><span className="block text-[11px] text-mute">{label(r.day, { month: 'short' })}</span></span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[15px]">{[branches.find(b => b.id === r.branch_id)?.name, timeSpan(r), r.skill].filter(Boolean).join(' · ')}</p>
            {r.note && <p className="text-[13.5px] text-ink/80 mt-0.5">{r.note}</p>}
            <p className="text-[12.5px] text-mute mt-1">{r.to_all ? 'An alle' : 'An alle, die an dem Tag können'}{r.created_by_name ? ` · von ${r.created_by_name}` : ''}</p>
          </div>
          <div className="shrink-0 text-[13px]">{r.status === 'besetzt' ? <Dot tone="ok">Besetzt{filled ? `: ${filled.first} ${filled.last}` : ''}</Dot> : r.status === 'abgesagt' ? <Dot tone="mute">Abgesagt</Dot> : <Dot tone="brass">Offen · {yes.length} {yes.length === 1 ? 'kann' : 'können'}{no ? `, ${no} nicht` : ''}</Dot>}</div>
        </div>
        {r.status === 'offen' && r.day >= today && <div className="border-t border-line">
          {yes.length === 0 ? <p className="px-4 py-3 text-[13.5px] text-mute">Noch keine Zusage.</p>
            : <ul className="divide-y divide-line">{yes.map(p => <li key={p.id} className="px-4 py-2.5 flex items-center gap-3 text-[14px]">
              <Avatar s={p} photo={p.photo} size="w-8 h-8 text-[12px]" /><span className="flex-1 min-w-0"><span className="block truncate">{p.first} {p.last}</span><span className="block text-[12px] text-mute truncate">{p.role} · {p.branch}{p.skills.length ? ` · ${p.skills.slice(0, 3).join(', ')}` : ''}</span></span>
              {p.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`} onClick={() => navigator.clipboard?.writeText(p.phone!)} title="Nummer kopieren und anrufen" className="h-8 px-2.5 rounded-[8px] bg-sage-50 hover:bg-sage-100 text-[12.5px] flex items-center gap-1.5"><Phone size={13} />{p.phone}</a>}
              <button onClick={() => setStatus({ status: 'besetzt', filled_by: p.id })} className="h-8 px-3 rounded-[8px] bg-olive-700 text-white text-[13px]">Einteilen</button>
            </li>)}</ul>}
          <div className="px-4 py-2.5 border-t border-line flex justify-end gap-2 text-[13px]">
            <button onClick={() => setStatus({ status: 'abgesagt' })} className="h-8 px-3 rounded-[8px] text-mute hover:text-ink hover:bg-sage-50">Nicht mehr nötig</button>
          </div>
        </div>}
        {r.status !== 'offen' && r.day >= today && <div className="px-4 py-2.5 border-t border-line flex justify-end gap-2 text-[13px]">
          <button onClick={() => setStatus({ status: 'offen', filled_by: null })} className="h-8 px-3 rounded-[8px] text-mute hover:text-ink hover:bg-sage-50">Wieder öffnen</button>
          <button onClick={async () => { if (confirm('Anfrage löschen?')) { await supabase!.from('standby_requests').delete().eq('id', r.id); await reloadStandby() } }} className="h-8 px-3 rounded-[8px] text-mute hover:text-alert hover:bg-sage-50 flex items-center gap-1"><Trash2 size={13} />Löschen</button>
        </div>}
      </section>
    )
  }
  return (<div className="space-y-3 max-w-[900px]">
    {upcoming.map(card)}
    {past.length > 0 && <><Sec>Vergangen</Sec>{past.map(card)}</>}
  </div>)
}

function Availability({ onAsk }: { onAsk: (d: string) => void }) {
  const { standby, staff, skillCatalog, me } = useApp()
  const office = me.app_role === 'buero'
  const days = Array.from({ length: 21 }, (_, i) => addDays(i))
  const [day, setDay] = useState(days[0]), [sk, setSk] = useState('')
  const avail = (d: string) => standby.filter(x => x.day === d).map(x => staff.find(s => s.id === x.employee_id)).filter((s): s is Staff => !!s && s.active)
    .filter(s => !sk || s.skills.includes(sk))
  const list = avail(day)
  const team = staff.filter(s => real(s) && s.branch_id !== 'buero' && (office || [me.branch_id, ...(me.extra ?? [])].some(b => inBranch(s, b))))
  const counts = team.map(s => ({ s, n: standby.filter(x => x.employee_id === s.id && x.day <= addDays(60)).length })).sort((a, b) => b.n - a.n)
  return (<>
    <div className="flex items-center gap-3 mb-4">
      <Select tone="stone" className="w-52" value={sk} onChange={setSk} options={[{ value: '', label: 'Alle Skills' }, ...skillCatalog.map(k => ({ value: k, label: k }))]} />
      <span className="text-[13px] text-mute">Zahl = so viele können an dem Tag einspringen</span>
    </div>
    <div className="grid grid-cols-7 gap-1.5 max-w-[760px]">{days.map(d => { const n = avail(d).length, on = d === day
      return <button key={d} onClick={() => setDay(d)} className={`h-[72px] rounded-[12px] flex flex-col items-center justify-center transition ${on ? 'bg-olive-700 text-white' : 'bg-sage-50 hover:bg-sage-100'}`}>
        <span className={`text-[11px] ${on ? 'text-sage-200' : 'text-mute'}`}>{label(d, { weekday: 'short' })}</span>
        <span className="font-display text-[17px] leading-tight">{label(d, { day: 'numeric' })}</span>
        <span className={`mt-0.5 min-w-[22px] h-[18px] px-1.5 rounded-full text-[11px] tabular-nums flex items-center justify-center ${on ? 'bg-white/20' : n ? 'bg-olive-700 text-white' : 'text-mute'}`}>{n || '–'}</span>
      </button> })}</div>
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-8 mt-8">
      <div>
        <div className="flex items-center justify-between mb-2"><p className="rubric text-ink/70">{label(day, { weekday: 'long', day: 'numeric', month: 'long' })} · {list.length} verfügbar</p>
          <button onClick={() => onAsk(day)} className="h-9 px-3 rounded-[10px] text-[13.5px] text-olive-700 hover:bg-sage-50">Für diesen Tag anfragen</button></div>
        {list.length === 0 ? <p className="py-3 text-[14px] text-mute">Für diesen Tag hat sich niemand eingetragen{sk ? ' (mit diesem Skill)' : ''}. Eine Anfrage an alle erreicht trotzdem das ganze Team.</p>
          : <ul className="rounded-[16px] border border-line divide-y divide-line">{list.map(s => <li key={s.id} className="px-4 py-3 flex items-center gap-3">
            <Avatar s={s} photo={s.photo} size="w-9 h-9 text-[13px]" />
            <div className="flex-1 min-w-0"><p className="text-[14px] truncate">{s.first} {s.last} <span className="text-mute">· {s.role} · {s.branch}</span></p>
              {s.skills.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{s.skills.map(k => <span key={k} className={`px-2 h-6 rounded-[6px] text-[12px] flex items-center ${k === sk ? 'bg-olive-700 text-white' : 'bg-sage-50'}`}>{k}</span>)}</p>}</div>
            {s.phone ? <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="h-8 px-2.5 rounded-[8px] bg-sage-50 hover:bg-sage-100 text-[12.5px] flex items-center gap-1.5 shrink-0"><Phone size={13} />{s.phone}</a> : <span className="text-[12px] text-mute shrink-0">keine Nummer</span>}
          </li>)}</ul>}
      </div>
      <div><p className="rubric text-ink/70 mb-2">Eingetragene Tage · 60 Tage</p>
        <ul className="divide-y divide-line">{counts.slice(0, 14).map(({ s, n }) => <li key={s.id} className="py-2 flex items-center gap-2.5 text-[13px]"><Avatar s={s} photo={s.photo} size="w-6 h-6 text-[10px]" /><span className="flex-1 truncate">{s.first} {s.last}</span><span className={`tabular-nums ${n ? '' : 'text-mute'}`}>{n}</span></li>)}</ul>
        {counts.length > 14 && <p className="pt-2 text-[12px] text-mute">und {counts.length - 14} weitere</p>}
      </div>
    </div>
  </>)
}

function AskModal({ day, onClose, onDone }: { day: string; onClose: () => void; onDone: () => void }) {
  const { me, employee, branches, skillCatalog, standby, staff } = useApp()
  const office = me.app_role === 'buero'
  const own = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [f, setF] = useState({ branch: own.find(b => b.id === me.branch_id)?.id ?? own[0]?.id ?? '', day, from: '', to: '', skill: '', note: '', toAll: false })
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
    <Modal title="Aushilfe anfragen" onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={save} className={btn}>Anfrage senden</button></>}>
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
      <p className="mt-3 text-[13px] text-ink/80">Erreicht <span className="font-medium">{reach} {reach === 1 ? 'Person' : 'Personen'}</span>{f.skill ? ` mit „${f.skill}“` : ''}. Sie bekommen eine Mitteilung und antworten in der App.</p>
      {!f.toAll && reach === 0 && <p className="mt-1 text-[12.5px] text-brass">Für diesen Tag hat sich niemand eingetragen. Wähle „Alle im Team“.</p>}
      <div className="mt-2"><Err m={err} /></div>
    </Modal>
  )
}
