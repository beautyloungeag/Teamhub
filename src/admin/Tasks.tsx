import { useEffect, useState } from 'react'
import { Camera, Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useApp, isoDay, addDays, appliesOn, fmtDate, type Template } from '../store'
import { supabase } from '../lib/supabase'
import { toast } from '../Toast'
import { useTodos, reloadTodos, isLate, useDue, type Todo } from '../Todos'
import { H, New, Sec, Th, Field, inpStone, btn, btn2, Err, retranslate, Select, Seg, Modal, Dot, Chips, InfoTip } from './kit'

// Aufgaben im Backoffice: „Heute“ zeigt je Studio, was erledigt ist (wer, wann, Foto) und was offen ist.
// „Zugewiesen“ sind einzelne Aufgaben mit Frist, „Checklisten“ die festen Abläufe (Vorlagen).

type Comp = { item_id: string; done_by_name: string; done_at: string; photo_path: string | null }
const REP = { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' } as const
const WD = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const hm = (iso: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export function TasksAdmin() {
  const { me, branches } = useApp()
  const office = me.app_role === 'buero'
  const myStudios = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [tab, setTab] = useState<'heute' | 'zugewiesen' | 'listen'>('heute')
  const [assign, setAssign] = useState(false), [edit, setEdit] = useState<Template | 'neu' | null>(null)
  const open = useTodos().filter(x => !x.done_at && !(x.assignee_id && x.assignee_id === x.created_by)).length
  return (<>
    <H info="Heute: was in den Studio-Checklisten erledigt und offen ist. Zugewiesen: einzelne Aufgaben mit Frist an eine Person oder ein Studio. Checklisten: die festen Abläufe, die jeden Tag neu beginnen."
      action={tab === 'listen' ? <New onClick={() => setEdit('neu')}>Neue Checkliste</New> : <New onClick={() => setAssign(true)}>Aufgabe zuweisen</New>}>Aufgaben</H>
    <div className="mb-6"><Seg value={tab} onChange={setTab} items={[['heute', 'Heute'], ['zugewiesen', <>Zugewiesen{open > 0 && <span className="ml-1.5 text-mute tabular-nums">{open}</span>}</>], ['listen', 'Checklisten']]} /></div>
    {tab === 'heute' && <Today studios={myStudios} />}
    {tab === 'zugewiesen' && <Assigned />}
    {tab === 'listen' && <Lists onEdit={setEdit} />}
    {assign && <AssignModal onClose={() => setAssign(false)} />}
    {edit && <TemplateModal t={edit === 'neu' ? null : edit} onClose={() => setEdit(null)} />}
  </>)
}

/* ---------- Heute je Studio ---------- */
function Today({ studios }: { studios: { id: string; name: string }[] }) {
  const { templates, staff } = useApp()
  const due = useDue()
  const [br, setBr] = useState(studios[0]?.id ?? ''), [day, setDay] = useState(isoDay())
  const [comps, setComps] = useState<Comp[] | null>(null), [photo, setPhoto] = useState<string | null>(null)
  const todos = useTodos()
  useEffect(() => {
    setComps(null)
    supabase!.from('task_completions').select('item_id, done_by_name, done_at, photo_path').eq('branch_id', br).eq('day', day).then(({ data }) => setComps((data ?? []) as Comp[]))
  }, [br, day])
  const lists = templates.filter(t => t.active && !t.proposed && appliesOn(t, day, br))
  const items = lists.flatMap(t => t.items)
  const done = new Map((comps ?? []).map(c => [c.item_id, c]))
  const isToday = day === isoDay()
  const nowHM = hm(new Date().toISOString())
  const late = (time: string, id: string) => !done.has(id) && !!time && (day < isoDay() || (isToday && time < nowHM))
  const nDone = items.filter(i => done.has(i.id)).length, nLate = items.filter(i => late(i.time, i.id)).length
  const showPhoto = async (path: string) => { const { data } = await supabase!.storage.from('task-proofs').createSignedUrl(path, 600); setPhoto(data?.signedUrl ?? null) }
  // Einzelne Aufgaben dieses Studios mit Frist heute oder überfällig
  const people = new Set(staff.filter(s => s.branch_id === br).map(s => s.id))
  const dueToday = todos.filter(x => !x.done_at && x.due_at && (x.branch_id === br || (x.assignee_id && people.has(x.assignee_id) && x.assignee_id !== x.created_by)) && (isLate(x) || isoDay(new Date(x.due_at)) === day))
  return (<>
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {studios.length > 1 && <Select tone="stone" className="w-44" value={br} onChange={setBr} options={studios.map(s => ({ value: s.id, label: s.name }))} />}
      <div className="flex items-center gap-1 h-10 px-1 rounded-[10px] bg-sage-50">
        <button onClick={() => setDay(addDays(-1, day))} aria-label="Vortag" className="w-8 h-8 rounded-[8px] hover:bg-white flex items-center justify-center"><ChevronLeft size={16} /></button>
        <span className="px-2 text-[14px] min-w-[150px] text-center">{isToday ? 'Heute' : fmtDate(day + 'T12:00:00Z', { weekday: 'short', day: 'numeric', month: 'long' })}</span>
        <button onClick={() => setDay(addDays(1, day))} disabled={isToday} aria-label="Nächster Tag" className="w-8 h-8 rounded-[8px] hover:bg-white flex items-center justify-center disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>
      <div className="ml-auto flex items-center gap-6 text-[14px]">
        <span><span className="font-display text-[22px] tabular-nums">{nDone}</span><span className="text-mute"> / {items.length} erledigt</span></span>
        {nLate > 0 && <span className="text-alert"><span className="font-display text-[22px] tabular-nums">{nLate}</span> überfällig</span>}
      </div>
    </div>
    {items.length === 0 && <p className="text-[14px] text-mute">Für dieses Studio gibt es an diesem Tag keine Checklisten.</p>}
    <div className="grid grid-cols-2 gap-5">
      {lists.map(t => { const k = t.items.filter(i => done.has(i.id)).length, last = t.items.map(i => i.time).filter(Boolean).sort().pop()
        return <section key={t.id} className="rounded-[16px] border border-line">
          <div className="px-4 pt-3.5 pb-2.5 flex items-baseline justify-between gap-3 border-b border-line">
            <div><p className="font-medium text-[15px]">{t.name}</p><p className="text-[12.5px] text-mute">{REP[t.repeat]}{last ? ` · bis ${last}` : ''}</p></div>
            <span className={`text-[13px] tabular-nums ${k === t.items.length ? 'text-ok' : 'text-mute'}`}>{k === t.items.length ? 'fertig' : `${k} / ${t.items.length}`}</span>
          </div>
          <ul className="divide-y divide-line">{t.items.map(i => { const c = done.get(i.id), lt = late(i.time, i.id)
            return <li key={i.id} className="px-4 py-2.5 flex items-center gap-3 text-[14px]">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${c ? 'bg-olive-700 text-white' : lt ? 'shadow-[inset_0_0_0_1.5px_#B4533E]' : 'shadow-[inset_0_0_0_1.5px_#C8CDC5]'}`}>{c && <Check size={12} strokeWidth={3} />}</span>
              <span className="flex-1 min-w-0"><span className={`block truncate ${c ? 'text-mute' : ''}`}>{i.title}</span>
                <span className={`block text-[12px] ${lt ? 'text-alert' : 'text-mute'}`}>{c ? `${c.done_by_name} · ${hm(c.done_at)}` : i.time ? (lt ? `offen, fällig seit ${i.time}` : `offen, bis ${i.time}`) : 'offen'}{i.prio && !c ? ' · wichtig' : ''}</span></span>
              {c?.photo_path && <button onClick={() => showPhoto(c.photo_path!)} className="h-8 px-2.5 rounded-[8px] bg-sage-50 hover:bg-sage-100 text-[12.5px] flex items-center gap-1.5 shrink-0"><Camera size={13} />Foto</button>}
              {!c && i.proof && <span title="Mit Foto als Nachweis" className="text-sage-400 shrink-0"><Camera size={14} /></span>}
            </li> })}</ul>
        </section> })}
    </div>
    {dueToday.length > 0 && <div className="mt-8"><Sec>Zugewiesene Aufgaben mit Frist</Sec>
      <div className="rounded-[16px] border border-line divide-y divide-line">{dueToday.map(x => <TodoRow key={x.id} x={x} due={due} />)}</div></div>}
    {photo && <Modal title="Foto als Nachweis" onClose={() => setPhoto(null)} width={720}><img src={photo} alt="" className="w-full rounded-[12px]" /></Modal>}
  </>)
}

function forLabel(x: Todo, staff: { id: string; first: string; last: string }[], branches: { id: string; name: string }[]) {
  if (x.assignee_id) { const p = staff.find(s => s.id === x.assignee_id); return p ? `${p.first} ${p.last}` : '–' }
  return `Ganzes Studio ${branches.find(b => b.id === x.branch_id)?.name ?? ''}`
}
function TodoRow({ x, due }: { x: Todo; due: (iso: string | null) => string }) {
  const { staff, branches } = useApp()
  return <div className="px-4 py-2.5 flex items-center gap-4 text-[14px]">
    <span className="flex-1 min-w-0"><span className="block truncate">{x.title}</span><span className="block text-[12px] text-mute">{forLabel(x, staff, branches)} · von {x.created_by_name}</span></span>
    <span className={isLate(x) ? 'text-alert' : 'text-mute'}>{x.due_at ? due(x.due_at) : ''}</span>
  </div>
}

/* ---------- Zugewiesene Aufgaben ---------- */
function Assigned() {
  const { staff, branches } = useApp()
  const all = useTodos(), due = useDue()
  const [view, setView] = useState<'offen' | 'erledigt'>('offen')
  const assigned = all.filter(x => !(x.assignee_id && x.assignee_id === x.created_by))
  const list = assigned.filter(x => view === 'offen' ? !x.done_at : !!x.done_at)
  return (<>
    <div className="mb-3"><Seg value={view} onChange={setView} items={[['offen', `Offen · ${assigned.filter(x => !x.done_at).length}`], ['erledigt', 'Erledigt']]} /></div>
    <table className="tbl w-full text-[14px]"><thead><tr><Th>Aufgabe</Th><Th>Für</Th><Th>Frist</Th><Th>Von</Th><Th>Stand</Th><Th /></tr></thead>
      <tbody className="divide-y divide-line">
        {list.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-mute">{view === 'offen' ? 'Keine offenen Aufgaben. Oben rechts weist du eine zu.' : 'Noch nichts erledigt.'}</td></tr>}
        {list.map(x => <tr key={x.id}>
          <td className="px-4 py-3">{x.title}{x.note && <p className="text-xs text-mute truncate max-w-[360px]">{x.note}</p>}</td>
          <td className="px-4 text-mute">{forLabel(x, staff, branches)}</td>
          <td className={`px-4 ${isLate(x) ? 'text-alert' : 'text-mute'}`}>{x.due_at ? due(x.due_at) : '–'}</td>
          <td className="px-4 text-mute">{x.created_by_name}</td>
          <td className="px-4 text-[13px]">{x.done_at ? <Dot tone="ok">{x.done_by_name}, {fmtDate(x.done_at, { day: 'numeric', month: 'numeric' })} {hm(x.done_at)}</Dot> : <Dot tone={isLate(x) ? 'alert' : 'mute'}>{isLate(x) ? 'Überfällig' : 'Offen'}</Dot>}</td>
          <td className="px-2 text-right"><button title="Löschen" onClick={async () => { if (confirm(`Aufgabe „${x.title}“ löschen?`)) { await supabase!.from('todos').delete().eq('id', x.id); await reloadTodos(); toast('Gelöscht') } }} className="w-8 h-8 rounded-full text-mute hover:text-alert hover:bg-sage-50 inline-flex items-center justify-center"><Trash2 size={14} /></button></td>
        </tr>)}
      </tbody></table>
  </>)
}

function AssignModal({ onClose }: { onClose: () => void }) {
  const { me, employee, staff, branches } = useApp()
  const mineBr = me.app_role === 'buero' ? branches.filter(b => !b.is_office).map(b => b.id) : [me.branch_id, ...(me.extra ?? [])].filter(b => b !== 'buero')
  const people = staff.filter(s => s.active && mineBr.includes(s.branch_id)).sort((a, b) => a.first.localeCompare(b.first))
  const [title, setTitle] = useState(''), [note, setNote] = useState(''), [target, setTarget] = useState(''), [date, setDate] = useState(''), [time, setTime] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const save = async () => {
    if (!title.trim() || !target) { setErr('Was und für wen sind nötig.'); return }
    const [kind, id] = target.split(':')
    setBusy(true)
    const { error } = await supabase!.from('todos').insert({ title: title.trim(), note: note.trim(), due_at: date ? new Date(`${date}T${time || '23:59'}:00`).toISOString() : null, assignee_id: kind === 'p' ? id : null, branch_id: kind === 'b' ? id : null, created_by: employee.id, created_by_name: `${me.first} ${me.last.slice(0, 1)}.` })
    setBusy(false)
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    toast('Aufgabe zugewiesen'); await reloadTodos(); onClose()
  }
  const quick = [['Heute', isoDay()], ['Morgen', addDays(1)], ['In einer Woche', addDays(7)]] as const
  return (
    <Modal title="Aufgabe zuweisen" onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={save} className={btn}>Zuweisen</button></>}>
      <div className="space-y-3">
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Was ist zu tun? z. B. Schaufenster neu dekorieren" className={inpStone} />
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Notiz (optional)" className="w-full rounded-[10px] bg-sage-50 px-3 py-2.5 text-[14px] outline-none resize-none" />
        <Select label="Für wen" tone="stone" value={target} onChange={setTarget} placeholder="Person oder ganzes Studio" options={[
          ...branches.filter(b => mineBr.includes(b.id)).map(b => ({ value: `b:${b.id}`, label: `Ganzes Studio ${b.name}`, hint: 'Jede im Studio kann es erledigen', group: 'Studio' })),
          ...people.map(p => ({ value: `p:${p.id}`, label: `${p.first} ${p.last}${/@aleksa\.ai$/i.test(p.email) ? ' (Testkonto)' : ''}`, hint: `${p.role} · ${p.branch}`, group: 'Person' }))]} />
        <div><span className="block text-xs text-mute mb-1">Frist (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            {quick.map(([l, d]) => <button key={l} onClick={() => setDate(date === d ? '' : d)} className={`h-9 px-3 rounded-full text-[13.5px] ${date === d ? 'bg-olive-700 text-white' : 'bg-sage-50 hover:bg-sage-100'}`}>{l}</button>)}
            <input type="date" min={isoDay()} value={date} onChange={e => setDate(e.target.value)} className="h-9 px-3 rounded-full bg-sage-50 text-[13.5px] outline-none" />
            {date && <input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-9 px-3 rounded-full bg-sage-50 text-[13.5px] outline-none" />}
          </div></div>
        <p className="text-[12.5px] text-mute">Sie bekommt eine Mitteilung und sieht die Aufgabe in der App unter „Für mich“.</p>
        <Err m={err} />
      </div>
    </Modal>
  )
}

/* ---------- Checklisten (Vorlagen) ---------- */
function Lists({ onEdit }: { onEdit: (t: Template) => void }) {
  const { templates, branches, me, reload } = useApp()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])]
  const canEdit = (t: Template) => office || (t.branchIds.length > 0 && t.branchIds.every(b => mine.includes(b)))
  const visible = templates.filter(t => !t.proposed && (office || t.branchIds.length === 0 || t.branchIds.some(b => mine.includes(b))))
  const proposals = templates.filter(t => t.proposed)
  const approve = async () => { if (confirm('Vorschläge freigeben? Die Beispielvorlagen aus dem Prototyp werden dabei abgeschaltet.')) { await supabase!.rpc('approve_wiki_proposals', { p_kind: 'tasks' }); await reload(); retranslate() } }
  const when = (t: Template) => `${REP[t.repeat]}${t.repeat === 'weekly' && t.weekday ? `, ${WD[t.weekday]}` : ''}${t.repeat === 'monthly' && t.monthday ? `, am ${t.monthday}.` : ''}`
  return (<>
    {office && proposals.length > 0 && <div className="mb-8 rounded-[16px] bg-sage-50 p-5 flex items-center gap-6">
      <div className="flex-1"><p className="font-medium">{proposals.length} Vorschläge aus dem alten Wiki</p><p className="text-[13px] text-mute mt-0.5">{proposals.map(t => t.name).join(', ')}</p></div>
      <button onClick={() => onEdit(proposals[0])} className={btn2}>Ansehen</button><button onClick={approve} className={btn}>Alle freigeben</button></div>}
    <table className="tbl w-full text-[14px]"><thead><tr><Th>Checkliste</Th><Th>Punkte</Th><Th>Wann</Th><Th>Für</Th><Th /></tr></thead>
      <tbody className="divide-y divide-line">{visible.map(t => <tr key={t.id} onClick={() => canEdit(t) && onEdit(t)} className={`${canEdit(t) ? 'cursor-pointer hover:bg-sage-50/70' : ''} ${t.active ? '' : 'opacity-50'}`}>
        <td className="px-4 py-3">{t.name}{t.sample && <span className="ml-2 text-xs text-mute">Beispiel</span>}{!t.active && <span className="ml-2 text-xs text-mute">ausgeschaltet</span>}</td>
        <td className="px-4 text-mute">{t.items.length}</td><td className="px-4 text-mute">{when(t)}</td>
        <td className="px-4 text-mute">{t.branchIds.length ? t.branchIds.map(id => branches.find(b => b.id === id)?.name).join(', ') : 'Alle Studios'}</td>
        <td className="px-3 text-right">{canEdit(t) ? <Pencil size={14} className="text-mute inline" /> : <span className="text-[12px] text-mute">vom Büro</span>}</td>
      </tr>)}</tbody></table>
    {!office && <p className="mt-3 text-[12.5px] text-mute flex items-center gap-1">Checklisten für alle Studios pflegt das Büro. Eigene fürs Studio legst du oben rechts an.</p>}
  </>)
}

type Row = { id?: string; time: string; title: string; proof: boolean; prio: boolean }
function TemplateModal({ t, onClose }: { t: Template | null; onClose: () => void }) {
  const { templates, branches, me, reload } = useApp()
  const office = me.app_role === 'buero'
  const own = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [name, setName] = useState(t?.name ?? ''), [repeat, setRepeat] = useState<Template['repeat']>(t?.repeat ?? 'daily'), [weekday, setWeekday] = useState(String(t?.weekday ?? 1)), [monthday, setMonthday] = useState(String(t?.monthday ?? 1))
  const [studios, setStudios] = useState<string[]>(t?.branchIds ?? (office ? [] : [me.branch_id]))
  const [rows, setRows] = useState<Row[]>(t ? t.items.map(i => ({ id: i.id, time: i.time, title: i.title, proof: i.proof, prio: i.prio })) : [{ time: '', title: '', proof: false, prio: false }])
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => j === i ? { ...r, ...p } : r))
  const save = async () => {
    const items = rows.filter(r => r.title.trim())
    if (!name.trim() || !items.length) { setErr('Name und mindestens ein Punkt sind nötig.'); return }
    if (!office && !studios.length) { setErr('Bitte ein Studio wählen.'); return }
    setBusy(true); setErr('')
    const head = { name: name.trim(), repeat, weekday: repeat === 'weekly' ? Number(weekday) : null, monthday: repeat === 'monthly' ? Number(monthday) : null, branch_ids: studios }
    const res = t ? await supabase!.from('task_templates').update(head).eq('id', t.id).select('id').single() : await supabase!.from('task_templates').insert({ ...head, sort: templates.length }).select('id').single()
    if (res.error || !res.data) { setBusy(false); setErr('Speichern hat nicht geklappt.'); return }
    const tid = res.data.id
    const removed = (t?.items ?? []).filter(i => !items.some(r => r.id === i.id))
    const results = await Promise.all([
      ...items.map((r, i) => { const row = { title: r.title.trim(), due_time: r.time || null, proof_photo: r.proof, prio: r.prio, sort: i }
        return r.id ? supabase!.from('task_items').update(row).eq('id', r.id) : supabase!.from('task_items').insert({ template_id: tid, ...row }) }),
      ...removed.map(r => supabase!.from('task_items').delete().eq('id', r.id)),
    ])
    setBusy(false)
    if (results.some(r => r.error)) { setErr('Nicht alle Punkte liessen sich speichern.'); return }
    toast('Checkliste gespeichert'); await reload(); retranslate(); onClose()
  }
  const toggleActive = async () => { if (!t) return; await supabase!.from('task_templates').update({ active: !t.active }).eq('id', t.id); toast(t.active ? 'Ausgeschaltet' : 'Eingeschaltet'); await reload(); onClose() }
  return (
    <Modal width={720} title={t ? 'Checkliste bearbeiten' : 'Neue Checkliste'} onClose={onClose} footer={<>
      {t && <button onClick={toggleActive} className="mr-auto h-10 px-3 text-[13.5px] text-mute hover:text-ink">{t.active ? 'Ausschalten' : 'Wieder einschalten'}</button>}
      <button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={save} className={btn}>Speichern</button></>}>
      <div className="grid grid-cols-[1fr_180px] gap-3">
        <Field label="Name"><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Öffnung" className={inpStone} /></Field>
        <Select label="Wiederholung" tone="stone" value={repeat} onChange={v => setRepeat(v as Template['repeat'])} options={[{ value: 'daily', label: 'Täglich' }, { value: 'weekly', label: 'Wöchentlich' }, { value: 'monthly', label: 'Monatlich' }]} />
      </div>
      {repeat === 'weekly' && <div className="mt-3 w-56"><Select label="Wochentag" tone="stone" value={weekday} onChange={setWeekday} options={WD.slice(1).map((d, i) => ({ value: String(i + 1), label: d }))} /></div>}
      {repeat === 'monthly' && <div className="mt-3 w-56"><Select label="Tag im Monat" tone="stone" value={monthday} onChange={setMonthday} options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `am ${i + 1}.` }))} /></div>}
      <div className="mt-4"><span className="flex items-center gap-1 text-xs text-mute mb-1.5">Gilt für {office && <InfoTip text="Kein Studio gewählt heisst: gilt für alle Studios." />}</span>
        <Chips tone="stone" items={own.map(b => ({ value: b.id, label: b.name }))} value={studios} onChange={setStudios} /></div>
      <div className="mt-5"><span className="block text-xs text-mute mb-1.5">Punkte</span>
        <div className="space-y-1.5">{rows.map((r, i) => <div key={i} className="flex items-center gap-2">
          <input type="time" value={r.time} onChange={e => set(i, { time: e.target.value })} aria-label="Bis wann" className="h-10 w-[104px] rounded-[10px] bg-sage-50 px-2.5 text-[14px] outline-none" />
          <input value={r.title} onChange={e => set(i, { title: e.target.value })} placeholder={i === 0 ? 'z. B. Kabinen desinfizieren' : 'Weiterer Punkt'} className={inpStone} />
          <button onClick={() => set(i, { proof: !r.proof })} title="Foto als Nachweis" className={`h-10 px-3 rounded-[10px] text-[13px] flex items-center gap-1.5 shrink-0 ${r.proof ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/70 hover:bg-sage-100'}`}><Camera size={14} />Foto</button>
          <button onClick={() => set(i, { prio: !r.prio })} title="Als wichtig markieren" className={`h-10 px-3 rounded-[10px] text-[13px] shrink-0 ${r.prio ? 'bg-brass text-white' : 'bg-sage-50 text-ink/70 hover:bg-sage-100'}`}>Wichtig</button>
          <button onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Punkt entfernen" className="w-9 h-10 rounded-[10px] text-mute hover:text-alert flex items-center justify-center shrink-0"><X size={15} /></button>
        </div>)}</div>
        <button onClick={() => setRows([...rows, { time: '', title: '', proof: false, prio: false }])} className="mt-2 h-9 px-3 rounded-[10px] text-[13.5px] text-olive-700 hover:bg-sage-50 flex items-center gap-1.5"><Plus size={15} />Punkt hinzufügen</button>
        <p className="mt-2 text-[12.5px] text-mute">Uhrzeit = bis wann der Punkt erledigt sein soll. Danach steht er in der App rot als „fällig seit“.</p>
      </div>
      <div className="mt-3"><Err m={err} /></div>
    </Modal>
  )
}
