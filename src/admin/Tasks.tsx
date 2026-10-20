import { useEffect, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, Flag, Plus, Trash2, X } from 'lucide-react'
import { useApp, isoDay, addDays, appliesOn, fmtDate, type Template, type Staff } from '../store'
import { supabase } from '../lib/supabase'
import { toast } from '../Toast'
import { Avatar } from '../People'
import { useTodos, reloadTodos, isLate, useDue, type Todo } from '../Todos'
import { H, New, Th, inpStone, btn, btn2, Err, retranslate, Select, Seg, Modal, Chips, Back, Section, Status, Empty, ReadOnly } from './kit'
import { Donut } from './charts'

// Aufgaben gibt es in zwei Arten:
//   Checklisten: feste Abläufe, die jeden Tag (Woche, Monat) neu beginnen und fürs ganze Studio gelten. Wer abhakt, steht dabei.
//   Einzelaufgaben: einmalig, mit Frist, an eine Person oder ein ganzes Studio.
// „Heute“ zeigt beides für einen Tag und ein Studio.

type Comp = { item_id: string; done_by: string | null; done_by_name: string; done_at: string; photo_path: string | null }
const WD = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const hm = (iso: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const when = (t: Pick<Template, 'repeat' | 'weekday' | 'monthday'>) => t.repeat === 'daily' ? 'Jeden Tag' : t.repeat === 'weekly' ? `Jeden ${WD[t.weekday ?? 1]}` : `Jeden Monat am ${t.monthday ?? 1}.`
const until = (t: Template) => t.items.map(i => i.time).filter(Boolean).sort().pop()

export function TasksAdmin() {
  const { me, branches } = useApp()
  const office = me.app_role === 'buero'
  const studios = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [tab, setTab] = useState<'heute' | 'einzeln' | 'listen'>('heute')
  const [assign, setAssign] = useState<Todo | 'neu' | null>(null), [page, setPage] = useState<string | 'neu' | null>(null)
  const open = useTodos().filter(x => !x.done_at && !(x.assignee_id && x.assignee_id === x.created_by)).length
  if (page) return <ChecklistPage id={page} onBack={() => setPage(null)} />
  return (<>
    <H action={tab === 'listen' ? <New onClick={() => setPage('neu')}>Neue Checkliste</New> : <New onClick={() => setAssign('neu')}>Aufgabe zuweisen</New>}>Aufgaben</H>
    <div className="mb-6"><Seg value={tab} onChange={setTab} items={[['heute', 'Heute'], ['einzeln', <>Einzelaufgaben{open > 0 && <span className="ml-1.5 text-mute tabular-nums">{open}</span>}</>], ['listen', 'Checklisten']]} /></div>
    {tab === 'heute' && <Today studios={studios} onOpenList={setPage} onOpenTodo={setAssign} />}
    {tab === 'einzeln' && <Single onOpen={setAssign} />}
    {tab === 'listen' && <Lists onOpen={setPage} />}
    {assign && <AssignModal todo={assign === 'neu' ? null : assign} onClose={() => setAssign(null)} />}
  </>)
}

const forWhom = (x: Todo, staff: Staff[], branches: { id: string; name: string }[]) => {
  const p = x.assignee_id ? staff.find(s => s.id === x.assignee_id) : null
  return p ? <span className="flex items-center gap-2 min-w-0"><Avatar s={p} photo={p.photo} size="w-6 h-6 text-[10px]" /><span className="truncate">{p.first} {p.last}</span></span>
    : <span className="min-w-0"><span className="block truncate text-ink/80">Studio {branches.find(b => b.id === x.branch_id)?.name ?? ''}</span><span className="block text-[12px] text-mute">eine Person reicht</span></span>
}
const todoStatus = (x: Todo, due: (s: string | null) => string) => x.done_at ? <Status kind="done">Erledigt · {x.done_by_name}, {fmtDate(x.done_at, { day: 'numeric', month: 'numeric' })} {hm(x.done_at)}</Status>
  : isLate(x) ? <Status kind="late">Überfällig seit {due(x.due_at)}</Status> : <Status kind="open">Offen</Status>

/* ---------- Heute ---------- */
function Today({ studios, onOpenList, onOpenTodo }: { studios: { id: string; name: string }[]; onOpenList: (id: string) => void; onOpenTodo: (x: Todo) => void }) {
  const { templates, staff, branches } = useApp()
  const due = useDue()
  const [pick, setBr] = useState<string | null>(null), [day, setDay] = useState(isoDay())
  const br = pick ?? studios[0]?.id ?? ''
  const [comps, setComps] = useState<Comp[] | null>(null), [photo, setPhoto] = useState<string | null>(null)
  const todos = useTodos()
  useEffect(() => { if (!br) return; let alive = true; setComps(null)
    supabase!.from('task_completions').select('item_id, done_by, done_by_name, done_at, photo_path').eq('branch_id', br).eq('day', day).then(({ data }) => { if (alive) setComps((data ?? []) as Comp[]) })
    return () => { alive = false } }, [br, day])
  const lists = templates.filter(t => t.active && !t.proposed && appliesOn(t, day, br))
  const items = lists.flatMap(t => t.items)
  const done = new Map((comps ?? []).map(c => [c.item_id, c]))
  const isToday = day === isoDay(), nowHM = hm(new Date().toISOString())
  const late = (time: string, id: string) => !done.has(id) && !!time && (day < isoDay() || (isToday && time < nowHM))
  const nDone = items.filter(i => done.has(i.id)).length, nLate = items.filter(i => late(i.time, i.id)).length
  const showPhoto = async (path: string) => { const { data } = await supabase!.storage.from('task-proofs').createSignedUrl(path, 600); setPhoto(data?.signedUrl ?? null) }
  const name = branches.find(b => b.id === br)?.name ?? ''
  const people = new Set(staff.filter(s => s.branch_id === br).map(s => s.id))
  const single = todos.filter(x => !(x.assignee_id && x.assignee_id === x.created_by) && (x.branch_id === br || (x.assignee_id && people.has(x.assignee_id)))
    && x.due_at && (isoDay(new Date(x.due_at)) === day || (isToday && isLate(x))))
  return (<>
    <div className="flex flex-wrap items-center gap-3 mb-8">
      {studios.length > 1 && <Seg value={br} onChange={setBr} items={studios.map(s => [s.id, s.name] as [string, string])} />}
      <div className="flex items-center gap-1 h-10 px-1 rounded-[10px] bg-sage-50">
        <button onClick={() => setDay(addDays(-1, day))} aria-label="Vortag" className="w-8 h-8 rounded-[8px] hover:bg-white flex items-center justify-center"><ChevronLeft size={16} /></button>
        <span className="px-2 text-[14px] min-w-[170px] text-center">{isToday ? 'Heute' : fmtDate(day + 'T12:00:00Z', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <button onClick={() => setDay(addDays(1, day))} disabled={isToday} aria-label="Nächster Tag" className="w-8 h-8 rounded-[8px] hover:bg-white flex items-center justify-center disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>
      {!isToday && <button onClick={() => setDay(isoDay())} className="text-[13px] text-olive-700">Zu heute</button>}
    </div>

    <div className="flex items-center gap-5 mb-10">
      <Donut value={nDone} total={items.length} size={72} stroke={8} />
      <div><p className="font-display text-[26px] leading-tight tabular-nums">{nDone} von {items.length} erledigt</p>
        <p className="text-[13.5px] text-mute">{nLate ? <span className="text-alert">{nLate} überfällig · </span> : ''}{lists.length} {lists.length === 1 ? 'Checkliste' : 'Checklisten'} für {name}{single.length ? ` · ${single.filter(x => !x.done_at).length} Einzelaufgaben offen` : ''}</p></div>
    </div>

    {!comps ? <p className="text-[14px] text-mute">Lädt …</p> : items.length === 0 && single.length === 0 ? <Empty>An diesem Tag gibt es in {name} keine Aufgaben.</Empty> : <>
      {lists.map(t => { const k = t.items.filter(i => done.has(i.id)).length, u = until(t)
        return <Section key={t.id} className="mb-10" title={<button onClick={() => onOpenList(t.id)} className="hover:underline underline-offset-4 decoration-sage-400">{t.name}</button>}
          action={<span className="text-[13px] text-mute">{when(t)}{u ? ` · bis ${u}` : ''} · für alle in {name} · <span className={`tabular-nums ${k === t.items.length ? 'text-ok' : 'text-ink'}`}>{k} von {t.items.length}</span></span>}>
          <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Aufgabe</Th><th className="w-[110px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Fällig</th><th className="w-[300px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Stand</th><th className="w-[90px] border-b border-line" /></tr></thead>
            <tbody className="divide-y divide-line">{t.items.map(i => { const c = done.get(i.id), lt = late(i.time, i.id), p = c?.done_by ? staff.find(s => s.id === c.done_by) : null
              return <tr key={i.id}>
                <td className="px-4 py-3"><span className="flex items-center gap-2 min-w-0"><span className={`truncate ${c ? 'text-mute' : ''}`}>{i.title}</span>{i.prio && <Flag size={13} className="text-brass shrink-0" aria-label="wichtig" />}{i.proof && <Camera size={13} className="text-sage-400 shrink-0" aria-label="mit Foto" />}</span></td>
                <td className={`px-4 tabular-nums ${lt ? 'text-alert' : 'text-mute'}`}>{i.time || '–'}</td>
                <td className="px-4">{c ? <span className="flex items-center gap-2 text-[13px]">{p && <Avatar s={p} photo={p.photo} size="w-6 h-6 text-[10px]" />}<span className="truncate">{c.done_by_name}</span><span className="text-mute tabular-nums">{hm(c.done_at)}</span></span>
                  : lt ? <Status kind="late">Überfällig</Status> : <Status kind="open">Offen</Status>}</td>
                <td className="px-4 text-right">{c?.photo_path && <button onClick={() => showPhoto(c.photo_path!)} className="text-[13px] text-olive-700 inline-flex items-center gap-1"><Camera size={13} />Foto</button>}</td>
              </tr> })}</tbody></table>
        </Section> })}
      {single.length > 0 && <Section title="Einzelaufgaben mit Frist" count={single.length}>
        <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Aufgabe</Th><th className="w-[110px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Frist</th><th className="w-[300px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Für</th><th className="w-[90px] border-b border-line" /></tr></thead>
          <tbody className="divide-y divide-line">{single.map(x => <tr key={x.id} onClick={() => onOpenTodo(x)} className="cursor-pointer hover:bg-sage-50/70">
            <td className="px-4 py-3"><span className="block truncate">{x.title}</span><span className="block text-[12.5px]">{todoStatus(x, due)}</span></td>
            <td className={`px-4 tabular-nums ${isLate(x) ? 'text-alert' : 'text-mute'}`}>{x.due_at ? hm(x.due_at) : '–'}</td>
            <td className="px-4 text-[13.5px]">{forWhom(x, staff, branches)}</td><td className="px-4 text-right text-mute"><ChevronRight size={15} className="inline" /></td></tr>)}</tbody></table>
      </Section>}
    </>}
    {photo && <Modal title="Foto als Nachweis" onClose={() => setPhoto(null)} width={720}><img src={photo} alt="" className="w-full rounded-[12px]" /></Modal>}
  </>)
}

/* ---------- Einzelaufgaben ---------- */
function Single({ onOpen }: { onOpen: (x: Todo) => void }) {
  const { staff, branches } = useApp()
  const all = useTodos(), due = useDue()
  const [view, setView] = useState<'offen' | 'erledigt'>('offen')
  const assigned = all.filter(x => !(x.assignee_id && x.assignee_id === x.created_by))
  const list = assigned.filter(x => view === 'offen' ? !x.done_at : !!x.done_at)
  return (<>
    <div className="mb-4"><Seg value={view} onChange={setView} items={[['offen', `Offen · ${assigned.filter(x => !x.done_at).length}`], ['erledigt', 'Erledigt']]} /></div>
    {list.length === 0 ? <Empty>{view === 'offen' ? 'Keine offenen Einzelaufgaben.' : 'Noch nichts erledigt.'}</Empty> :
    <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Aufgabe</Th><th className="w-[240px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Für</th><th className="w-[150px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Frist</th><th className="w-[260px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Stand</th><th className="w-10 border-b border-line" /></tr></thead>
      <tbody className="divide-y divide-line">{list.map(x => <tr key={x.id} onClick={() => onOpen(x)} className="cursor-pointer hover:bg-sage-50/70">
        <td className="px-4 py-3"><span className="block truncate">{x.title}</span><span className="block text-[12.5px] text-mute truncate">von {x.created_by_name}{x.note ? ` · ${x.note}` : ''}</span></td>
        <td className="px-4 text-[13.5px]">{forWhom(x, staff, branches)}</td>
        <td className={`px-4 ${isLate(x) ? 'text-alert' : 'text-mute'}`}>{x.due_at ? due(x.due_at) : 'ohne Frist'}</td>
        <td className="px-4">{todoStatus(x, due)}</td><td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
      </tr>)}</tbody></table>}
  </>)
}

function AssignModal({ todo, onClose }: { todo: Todo | null; onClose: () => void }) {
  const { me, employee, staff, branches } = useApp()
  const mineBr = me.app_role === 'buero' ? branches.filter(b => !b.is_office).map(b => b.id) : [me.branch_id, ...(me.extra ?? [])].filter(b => b !== 'buero')
  const people = staff.filter(s => s.active && mineBr.includes(s.branch_id)).sort((a, b) => a.first.localeCompare(b.first))
  const myStudios = branches.filter(b => mineBr.includes(b.id) && !b.is_office)
  const d0 = todo?.due_at ? isoDay(new Date(todo.due_at)) : '', t0 = todo?.due_at ? hm(todo.due_at) : ''
  const [title, setTitle] = useState(todo?.title ?? ''), [note, setNote] = useState(todo?.note ?? ''), [target, setTarget] = useState(todo ? (todo.assignee_id ? `p:${todo.assignee_id}` : `b:${todo.branch_id}`) : '')
  const [date, setDate] = useState(d0), [time, setTime] = useState(t0 === '23:59' ? '' : t0), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const save = async () => {
    if (!title.trim() || !target) { setErr('Was und für wen sind nötig.'); return }
    const [kind, id] = target.split(':')
    setBusy(true)
    const row = { title: title.trim(), note: note.trim(), due_at: date ? new Date(`${date}T${time || '23:59'}:00`).toISOString() : null, assignee_id: kind === 'p' ? id : null, branch_id: kind === 'b' ? id : null }
    const by = { created_by: employee.id, created_by_name: `${me.first} ${me.last.slice(0, 1)}.` }
    // Alle Studios: je Studio eine eigene Aufgabe, jedes Studio hakt seine ab
    const { error } = todo ? await supabase!.from('todos').update(row).eq('id', todo.id)
      : id === '*' ? await supabase!.from('todos').insert(myStudios.map(b => ({ ...row, branch_id: b.id, ...by })))
      : await supabase!.from('todos').insert({ ...row, ...by })
    setBusy(false)
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    toast(todo ? 'Aufgabe gespeichert' : 'Aufgabe zugewiesen'); await reloadTodos(); onClose()
  }
  const del = async () => { if (!todo || !confirm(`Aufgabe „${todo.title}“ löschen?`)) return; await supabase!.from('todos').delete().eq('id', todo.id); await reloadTodos(); toast('Gelöscht'); onClose() }
  const reopen = async () => { if (!todo) return; await supabase!.from('todos').update({ done_at: null, done_by: null, done_by_name: null }).eq('id', todo.id); await reloadTodos(); toast('Wieder offen'); onClose() }
  const quick = [['Heute', isoDay()], ['Morgen', addDays(1)], ['In einer Woche', addDays(7)]] as const
  return (
    <Modal title={todo ? 'Einzelaufgabe' : 'Aufgabe zuweisen'} onClose={onClose} footer={<>
      {todo && <button onClick={del} className="mr-auto h-10 px-3 rounded-[10px] text-[13.5px] text-mute hover:text-alert flex items-center gap-1.5"><Trash2 size={14} />Löschen</button>}
      {todo?.done_at && <button onClick={reopen} className={btn2}>Wieder öffnen</button>}
      <button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={save} className={btn}>{todo ? 'Speichern' : 'Zuweisen'}</button></>}>
      <div className="space-y-3">
        {todo?.done_at && <Status kind="done">Erledigt von {todo.done_by_name} am {fmtDate(todo.done_at, { day: 'numeric', month: 'long' })}, {hm(todo.done_at)}</Status>}
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Was ist zu tun? z. B. Schaufenster neu dekorieren" className={inpStone} />
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Notiz (optional)" className="w-full rounded-[10px] bg-sage-50 px-3 py-2.5 text-[14px] outline-none resize-none" />
        <Select label="Für wen" tone="stone" value={target} onChange={setTarget} placeholder="Eine Person oder ein Studio" options={[
          ...(!todo && myStudios.length > 1 ? [{ value: 'b:*', label: me.app_role === 'buero' ? 'Alle Studios' : 'Alle deine Studios', hint: 'Je Studio eine Aufgabe, eine Person reicht', group: 'Studio' }] : []),
          ...myStudios.map(b => ({ value: `b:${b.id}`, label: `Studio ${b.name}`, hint: 'Eine Person reicht', group: 'Studio' })),
          ...people.map(p => ({ value: `p:${p.id}`, label: `${p.first} ${p.last}${/@aleksa\.ai$/i.test(p.email) ? ' (Testkonto)' : ''}`, hint: `${p.role} · ${p.branch}`, group: 'Person' }))]} />
        {target.startsWith('b:') && <p className="text-[13px] text-mute -mt-1">{target === 'b:*' ? 'Jedes Studio bekommt die Aufgabe einmal. ' : ''}Alle im Studio sehen die Aufgabe. Eine Person erledigt sie, dann ist sie für alle abgehakt, mit Name und Uhrzeit.</p>}
        <div><span className="block text-xs text-mute mb-1">Frist</span>
          <div className="flex flex-wrap items-center gap-2">
            {quick.map(([l, d]) => <button key={l} onClick={() => setDate(date === d ? '' : d)} className={`h-9 px-3 rounded-[9px] text-[13.5px] ${date === d ? 'bg-olive-700 text-white' : 'bg-sage-50 hover:bg-sage-100'}`}>{l}</button>)}
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 px-3 rounded-[9px] bg-sage-50 text-[13.5px] outline-none" />
            {date && <input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-9 px-3 rounded-[9px] bg-sage-50 text-[13.5px] outline-none" />}
          </div></div>
        <Err m={err} />
      </div>
    </Modal>
  )
}

/* ---------- Checklisten ---------- */
function Lists({ onOpen }: { onOpen: (id: string) => void }) {
  const { templates, branches, me, reload } = useApp()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])]
  const visible = templates.filter(t => !t.proposed && (office || t.branchIds.length === 0 || t.branchIds.some(b => mine.includes(b))))
  const proposals = templates.filter(t => t.proposed)
  const approve = async () => { if (confirm('Vorschläge freigeben? Die Beispielvorlagen aus dem Prototyp werden dabei abgeschaltet.')) { await supabase!.rpc('approve_wiki_proposals', { p_kind: 'tasks' }); await reload(); retranslate() } }
  return (<>
    {office && proposals.length > 0 && <div className="mb-8 pb-6 border-b border-line flex items-center gap-6">
      <div className="flex-1"><p className="text-[15px] font-medium">{proposals.length} Vorschläge aus dem alten Wiki</p><p className="text-[13px] text-mute mt-0.5">{proposals.map(t => t.name).join(', ')}</p></div>
      <button onClick={() => onOpen(proposals[0].id)} className={btn2}>Ansehen</button><button onClick={approve} className={btn}>Alle freigeben</button></div>}
    {visible.length === 0 ? <Empty>Noch keine Checklisten.</Empty> :
    <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Checkliste</Th><th className="w-[220px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Gilt für</th><th className="w-[200px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Wann</th><th className="w-[90px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Punkte</th><th className="w-[130px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Stand</th><th className="w-10 border-b border-line" /></tr></thead>
      <tbody className="divide-y divide-line">{visible.map(t => { const u = until(t)
        return <tr key={t.id} onClick={() => onOpen(t.id)} className="cursor-pointer hover:bg-sage-50/70">
          <td className="px-4 py-3"><span className="block truncate">{t.name}{t.sample && <span className="ml-2 text-xs text-mute">Beispiel</span>}</span></td>
          <td className="px-4 text-ink/80 truncate">{t.branchIds.length ? t.branchIds.map(id => branches.find(b => b.id === id)?.name).join(', ') : 'Alle Studios'}</td>
          <td className="px-4 text-mute">{when(t)}{u ? `, bis ${u}` : ''}</td>
          <td className="px-4 text-mute tabular-nums">{t.items.length}</td>
          <td className="px-4">{t.active ? <Status kind="yes">Aktiv</Status> : <Status kind="none">Ausgeschaltet</Status>}</td>
          <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
        </tr> })}</tbody></table>}
  </>)
}

type Row = { id?: string; time: string; title: string; proof: boolean; prio: boolean }
function ChecklistPage({ id, onBack }: { id: string | 'neu'; onBack: () => void }) {
  const { templates, branches, me, reload } = useApp()
  const office = me.app_role === 'buero'
  const t = id === 'neu' ? null : templates.find(x => x.id === id) ?? null
  const mine = [me.branch_id, ...(me.extra ?? [])]
  const canEdit = !t || office || (t.branchIds.length > 0 && t.branchIds.every(b => mine.includes(b)))
  const own = branches.filter(b => !b.is_office && (office || mine.includes(b.id)))
  const [name, setName] = useState(t?.name ?? ''), [repeat, setRepeat] = useState<Template['repeat']>(t?.repeat ?? 'daily'), [weekday, setWeekday] = useState(String(t?.weekday ?? 1)), [monthday, setMonthday] = useState(String(t?.monthday ?? 1))
  const [studios, setStudios] = useState<string[]>(t?.branchIds ?? (office ? [] : [me.branch_id]))
  const [rows, setRows] = useState<Row[]>(t ? t.items.map(i => ({ id: i.id, time: i.time, title: i.title, proof: i.proof, prio: i.prio })) : [{ time: '', title: '', proof: false, prio: false }])
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(!t)
  const touch = <T,>(f: (v: T) => void) => (v: T) => { f(v); setDirty(true) }
  const set = (i: number, p: Partial<Row>) => { setRows(rows.map((r, j) => j === i ? { ...r, ...p } : r)); setDirty(true) }
  const save = async () => {
    const items = rows.filter(r => r.title.trim())
    if (!name.trim() || !items.length) { setErr('Name und mindestens ein Punkt sind nötig.'); return }
    if (!office && !studios.length) { setErr('Bitte dein Studio wählen.'); return }
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
    toast('Checkliste gespeichert'); setDirty(false); await reload(); retranslate(); if (!t) onBack()
  }
  const toggleActive = async () => { if (!t) return; await supabase!.from('task_templates').update({ active: !t.active }).eq('id', t.id); toast(t.active ? 'Ausgeschaltet' : 'Eingeschaltet'); await reload() }
  const remove = async () => { if (!t || !confirm(`Checkliste „${t.name}“ löschen? Die Nachweise der vergangenen Tage gehen mit verloren. Ausschalten behält sie.`)) return
    const { error } = await supabase!.from('task_templates').delete().eq('id', t.id); if (error) { toast('Löschen hat nicht geklappt', 'error'); return } await reload(); toast('Gelöscht'); onBack() }
  const label = 'w-[150px] shrink-0 text-[13.5px] text-mute pt-2'
  return (
    <div className="max-w-[920px]">
      <Back onClick={() => { if (!dirty || confirm('Änderungen verwerfen?')) onBack() }}>Aufgaben</Back>
      <div className="flex items-start justify-between gap-6 mb-6">
        {canEdit ? <input value={name} onChange={e => touch(setName)(e.target.value)} placeholder="Name der Checkliste, z. B. Öffnung" className="flex-1 font-display text-[28px] leading-tight outline-none bg-transparent placeholder:text-sage-400" />
          : <h1 className="text-[28px] leading-tight">{t?.name}</h1>}
        <div className="flex items-center gap-2 shrink-0 pt-1">
          {t && canEdit && <button onClick={toggleActive} className={btn2}>{t.active ? 'Ausschalten' : 'Einschalten'}</button>}
          {canEdit && <button disabled={busy || !dirty} onClick={save} className={btn}>{t ? 'Speichern' : 'Anlegen'}</button>}
        </div>
      </div>
      {!canEdit && <p className="mb-6"><ReadOnly>Vom Büro für alle Studios. Ändern kann nur das Büro, eigene Checklisten für dein Studio legst du unter Checklisten an.</ReadOnly></p>}

      <div className="divide-y divide-line border-y border-line mb-10">
        <div className="flex items-start gap-4 py-3"><span className={label}>Gilt für</span>
          {canEdit ? <div className="flex-1"><Chips tone="stone" items={own.map(b => ({ value: b.id, label: b.name }))} value={studios} onChange={touch(setStudios)} />{office && !studios.length && <p className="text-[12.5px] text-mute mt-1.5">Kein Studio gewählt: gilt für alle Studios.</p>}</div>
            : <span className="pt-2 text-[14px]">{t?.branchIds.length ? t.branchIds.map(b => branches.find(x => x.id === b)?.name).join(', ') : 'Alle Studios'}</span>}</div>
        <div className="flex items-start gap-4 py-3"><span className={label}>Wann</span>
          {canEdit ? <div className="flex flex-wrap items-center gap-3">
            <Seg value={repeat} onChange={touch(setRepeat)} items={[['daily', 'Jeden Tag'], ['weekly', 'Jede Woche'], ['monthly', 'Jeden Monat']]} />
            {repeat === 'weekly' && <Select tone="stone" className="w-44" value={weekday} onChange={touch(setWeekday)} options={WD.slice(1).map((d, i) => ({ value: String(i + 1), label: d }))} />}
            {repeat === 'monthly' && <Select tone="stone" className="w-36" value={monthday} onChange={touch(setMonthday)} options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `am ${i + 1}.` }))} />}
          </div> : <span className="pt-2 text-[14px]">{t ? when(t) : ''}</span>}</div>
        <div className="flex items-start gap-4 py-3"><span className={label}>Wer erledigt sie</span><span className="pt-2 text-[14px] text-ink/80">Alle im Studio. Wer einen Punkt abhakt, steht mit Uhrzeit dabei.</span></div>
      </div>

      <Section title="Punkte" count={rows.filter(r => r.title.trim()).length}>
        <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] text-xs text-mute px-1 pb-2 border-b border-line"><span>Bis</span><span>Was ist zu tun</span><span className="pr-1">Foto · Wichtig</span></div>
        <ul className="divide-y divide-line">{rows.map((r, i) => <li key={i} className="group grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2 py-1.5">
          {canEdit ? <input type="time" value={r.time} onChange={e => set(i, { time: e.target.value })} aria-label="Bis wann" className="h-9 rounded-[8px] px-1.5 bg-transparent hover:bg-sage-50 focus:bg-sage-50 outline-none text-[14px] tabular-nums" />
            : <span className="px-1.5 text-[14px] tabular-nums text-mute">{r.time || '–'}</span>}
          {canEdit ? <input value={r.title} onChange={e => set(i, { title: e.target.value })} placeholder={i === 0 ? 'z. B. Kabinen desinfizieren' : 'Weiterer Punkt'} className="h-9 rounded-[8px] px-2 bg-transparent hover:bg-sage-50 focus:bg-sage-50 outline-none text-[14px]" />
            : <span className="px-2 text-[14px]">{r.title}</span>}
          <span className="flex items-center gap-1 pr-1">
            <button disabled={!canEdit} onClick={() => set(i, { proof: !r.proof })} title={r.proof ? 'Mit Foto als Nachweis' : 'Ohne Foto'} className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition ${r.proof ? 'text-olive-700' : 'text-sage-400'} enabled:hover:bg-sage-50`}><Camera size={16} /></button>
            <button disabled={!canEdit} onClick={() => set(i, { prio: !r.prio })} title={r.prio ? 'Wichtig' : 'Normal'} className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition ${r.prio ? 'text-brass' : 'text-sage-400'} enabled:hover:bg-sage-50`}><Flag size={15} /></button>
            {canEdit && <button onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true) }} aria-label="Punkt entfernen" className="w-8 h-8 rounded-[8px] text-mute hover:text-alert hover:bg-sage-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><X size={15} /></button>}
          </span>
        </li>)}</ul>
        {canEdit && <button onClick={() => { setRows([...rows, { time: '', title: '', proof: false, prio: false }]); setDirty(true) }} className="mt-2 h-9 px-2 rounded-[8px] text-[13.5px] text-olive-700 hover:bg-sage-50 flex items-center gap-1.5"><Plus size={15} />Punkt hinzufügen</button>}
        <div className="mt-3"><Err m={err} /></div>
      </Section>
      {t && canEdit && <button onClick={remove} className="mt-10 h-9 px-2 rounded-[8px] text-[13.5px] text-mute hover:text-alert flex items-center gap-1.5"><Trash2 size={14} />Checkliste löschen</button>}
    </div>
  )
}
