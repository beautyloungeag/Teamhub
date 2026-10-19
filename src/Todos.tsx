import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { locale } from './lib/i18n'
import { useApp, isoDay, addDays, type Staff } from './store'
import { toast } from './Toast'

// Einzelne Aufgaben mit Frist, neben den täglichen Studio-Checklisten:
// eigene To-dos, von Filialleitung oder Büro einer Person oder einem ganzen Studio zugewiesen (Tabelle `todos`).

export type Todo = {
  id: string; title: string; note: string; due_at: string | null; assignee_id: string | null; branch_id: string | null
  created_by: string | null; created_by_name: string; done_at: string | null; done_by_name: string | null; created_at: string
}

const T = { owner: '', list: [] as Todo[], loaded: false, ver: 0 }
const subs = new Set<() => void>()
const bump = () => { T.ver++; subs.forEach(f => f()) }
export async function reloadTodos() {
  if (!supabase) return
  const since = new Date(Date.now() - 14 * 864e5).toISOString()
  const { data } = await supabase.from('todos').select('id, title, note, due_at, assignee_id, branch_id, created_by, created_by_name, done_at, done_by_name, created_at')
    .or(`done_at.is.null,done_at.gte.${since}`).order('due_at', { ascending: true, nullsFirst: false }).limit(500)
  T.list = (data ?? []) as Todo[]; T.loaded = true; bump()
}
export function useTodos() {
  const { employee } = useApp()
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => T.ver)
  useEffect(() => { if (T.owner !== employee.id) { T.owner = employee.id; T.list = []; T.loaded = false } if (!T.loaded) reloadTodos() }, [employee.id])
  return T.list
}
/** Was die Person selbst erledigen soll: ihr zugewiesen, ihrem Studio, oder eigene To-dos. */
export const isForMe = (x: Todo, me: Staff) => x.assignee_id === me.id || (x.assignee_id === null && !!x.branch_id && [me.branch_id, ...(me.extra ?? [])].includes(x.branch_id))

// Frist ohne Uhrzeit wird als 23:59 gespeichert und nur als Datum gezeigt
const zDate = (iso: string) => isoDay(new Date(iso))
const zTime = (iso: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
export function useDue() {
  const { t } = useApp()
  return (iso: string | null) => {
    if (!iso) return ''
    const d = zDate(iso), tm = zTime(iso), today = isoDay(), tomorrow = addDays(1)
    const day = d === today ? t('heute') : d === tomorrow ? t('morgen') : new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(iso))
    return tm === '23:59' ? day : `${day}, ${tm}`
  }
}
export const isLate = (x: Todo) => !x.done_at && !!x.due_at && new Date(x.due_at).getTime() < Date.now()
const toIso = (date: string, time: string) => date ? new Date(`${date}T${time || '23:59'}:00`).toISOString() : null

async function setDone(x: Todo, done: boolean, t: (s: string) => string) {
  const { error } = await supabase!.rpc('todo_done', { p_id: x.id, p_done: done })
  if (error) toast(t('Das hat nicht geklappt'), 'error')
  await reloadTodos()
}

/* ---------- App: „Für mich“ ---------- */
function Check2({ on, busy, onClick, label }: { on: boolean; busy?: boolean; onClick: () => void; label: string }) {
  return <button aria-label={label} disabled={busy} onClick={e => { e.stopPropagation(); onClick() }} className={`w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 transition ${on ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92] hover:shadow-[inset_0_0_0_1.5px_#495940]'} ${busy ? 'opacity-50' : ''}`}>{on && <Check size={15} strokeWidth={3} />}</button>
}

export function MyTodos() {
  const { me, t, branches } = useApp()
  const all = useTodos(), due = useDue()
  const [busy, setBusy] = useState<string | null>(null), [add, setAdd] = useState(false), [sel, setSel] = useState<Todo | null>(null), [showDone, setShowDone] = useState(false)
  const mine = all.filter(x => isForMe(x, me))
  const open = mine.filter(x => !x.done_at), done = mine.filter(x => x.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!))
  const today = isoDay()
  const groups: [string, Todo[], string?][] = [
    ['Überfällig', open.filter(isLate), 'text-alert'],
    ['Heute', open.filter(x => !isLate(x) && x.due_at && zDate(x.due_at) === today)],
    ['Demnächst', open.filter(x => x.due_at && zDate(x.due_at) > today)],
    ['Ohne Frist', open.filter(x => !x.due_at)],
  ]
  const from = (x: Todo) => x.created_by === me.id ? (x.assignee_id ? t('Eigenes To-do') : '') : x.created_by_name ? t('von {name}', { name: x.created_by_name }) : ''
  const toggle = async (x: Todo) => { setBusy(x.id); await setDone(x, !x.done_at, t); setBusy(null) }
  const row = (x: Todo) => (
    <div key={x.id} onClick={() => setSel(x)} className="flex items-center gap-3 px-4 py-3.5 cursor-pointer">
      <Check2 on={!!x.done_at} busy={busy === x.id} onClick={() => toggle(x)} label={x.done_at ? t('Rückgängig') : t('Erledigt')} />
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] leading-snug ${x.done_at ? 'text-mute line-through decoration-sage-400' : ''}`}>{x.title}</p>
        <p className="text-[12px] text-mute mt-0.5">{[
          x.done_at ? <span key="d">{t('Erledigt von {name}', { name: x.done_by_name ?? '' })}</span> : x.due_at ? <span key="d" className={isLate(x) ? 'text-alert' : ''}>{t('bis {when}', { when: due(x.due_at) })}</span> : null,
          !x.assignee_id && x.branch_id ? <span key="b">{t('ganzes Studio {name}', { name: branches.find(b => b.id === x.branch_id)?.name ?? '' })}</span> : null,
          from(x) ? <span key="f">{from(x)}</span> : null,
        ].filter(Boolean).flatMap((el, i) => i ? [<span key={'s' + i}> · </span>, el] : [el])}</p>
      </div>
    </div>
  )
  return (
    <div>
      <button onClick={() => setAdd(true)} className="w-full rounded-[16px] bg-white px-4 py-3.5 flex items-center gap-3 text-left text-[15px] text-ink/80 hover:text-ink"><span className="w-[26px] h-[26px] rounded-full bg-sage-100 text-olive-800 flex items-center justify-center"><Plus size={16} /></span>{t('Eigenes To-do hinzufügen')}</button>
      {open.length === 0 && <p className="mt-6 px-1 text-[14px] text-mute">{t('Gerade nichts offen. Aufgaben von deiner Filialleitung oder dem Büro erscheinen hier mit Frist.')}</p>}
      {groups.filter(([, l]) => l.length).map(([g, l, cls]) => (
        <div key={g}>
          <h2 className={`mt-7 mb-2.5 px-1 rubric ${cls ?? 'text-ink/70'}`}>{t(g)}</h2>
          <div className="rounded-[16px] bg-white divide-y divide-sage-50 overflow-hidden">{l.map(row)}</div>
        </div>
      ))}
      {done.length > 0 && <>
        <button onClick={() => setShowDone(!showDone)} className="mt-7 px-1 text-[13px] text-sage-800">{showDone ? t('Erledigte ausblenden') : t('{n} erledigt anzeigen', { n: done.length })}</button>
        {showDone && <div className="mt-2.5 rounded-[16px] bg-white divide-y divide-sage-50 overflow-hidden">{done.map(row)}</div>}
      </>}
      {add && <TodoSheet onClose={() => setAdd(false)} />}
      {sel && <TodoDetail x={sel} onClose={() => setSel(null)} onToggle={async () => { await toggle(sel); setSel(null) }} />}
    </div>
  )
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30" />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative w-full md:max-w-[460px] bg-white rounded-t-[28px] md:rounded-[20px] p-6 pb-10 md:pb-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="×" className="absolute right-4 top-4 w-9 h-9 rounded-full hover:bg-sage-100 flex items-center justify-center text-mute"><X size={18} /></button>
        {children}
      </motion.div>
    </div>
  )
}

function DueFields({ date, time, setDate, setTime }: { date: string; time: string; setDate: (s: string) => void; setTime: (s: string) => void }) {
  const { t } = useApp()
  const pick = useRef<HTMLInputElement>(null)
  const today = isoDay(), tomorrow = addDays(1), custom = !!date && date !== today && date !== tomorrow
  const chip = (on: boolean) => `h-9 px-3.5 rounded-full text-[14px] transition ${on ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/80 hover:bg-sage-100'}`
  const label = custom ? new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(date + 'T12:00:00Z')) : t('Anderes Datum')
  return (
    <div>
      <p className="text-[12px] text-mute mb-1.5">{t('Frist')}</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setDate('')} className={chip(!date)}>{t('Keine')}</button>
        <button onClick={() => setDate(today)} className={chip(date === today)}>{t('Heute')}</button>
        <button onClick={() => setDate(tomorrow)} className={chip(date === tomorrow)}>{t('Morgen')}</button>
        {/* Eigenes Datum: unsichtbares Datumsfeld über dem Knopf öffnet die Auswahl des Geräts */}
        <span className={`relative ${chip(custom)} flex items-center`}>
          {label}
          <input ref={pick} type="date" min={today} value={custom ? date : ''} onChange={e => setDate(e.target.value)} onClick={() => { try { pick.current?.showPicker() } catch { /* älterer Browser */ } }} aria-label={t('Anderes Datum')} className="absolute inset-0 opacity-0 cursor-pointer" />
        </span>
      </div>
      {date && <div className="mt-3 flex items-center gap-2"><span className="text-[13px] text-mute">{t('Uhrzeit (optional)')}</span><input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-9 px-3 rounded-full bg-sage-50 text-[14px] outline-none" /></div>}
    </div>
  )
}

function TodoSheet({ onClose }: { onClose: () => void }) {
  const { t, employee, me } = useApp()
  const [title, setTitle] = useState(''), [note, setNote] = useState(''), [date, setDate] = useState(''), [time, setTime] = useState(''), [busy, setBusy] = useState(false)
  const save = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const { error } = await supabase!.from('todos').insert({ title: title.trim(), note: note.trim(), due_at: toIso(date, time), assignee_id: employee.id, created_by: employee.id, created_by_name: `${me.first} ${me.last.slice(0, 1)}.` })
    setBusy(false)
    if (error) { toast(t('Das hat nicht geklappt'), 'error'); return }
    toast(t('To-do gespeichert')); await reloadTodos(); onClose()
  }
  return (
    <Modal onClose={onClose}>
      <p className="font-medium text-[18px]">{t('Eigenes To-do')}</p>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} placeholder={t('Was ist zu tun?')} className="mt-4 w-full h-12 rounded-[12px] bg-sage-50 px-4 text-[15px] outline-none" />
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={t('Notiz (optional)')} className="mt-2 w-full rounded-[12px] bg-sage-50 px-4 py-3 text-[14px] outline-none resize-none" />
      <div className="mt-4"><DueFields date={date} time={time} setDate={setDate} setTime={setTime} /></div>
      <button onClick={save} disabled={!title.trim() || busy} className="mt-6 w-full h-12 rounded-[14px] bg-olive-700 text-white text-[15px] disabled:opacity-50">{t('Speichern')}</button>
    </Modal>
  )
}

function TodoDetail({ x, onClose, onToggle }: { x: Todo; onClose: () => void; onToggle: () => void }) {
  const { t, me, branches } = useApp()
  const due = useDue()
  const del = async () => { await supabase!.from('todos').delete().eq('id', x.id); toast(t('Gelöscht')); await reloadTodos(); onClose() }
  return (
    <Modal onClose={onClose}>
      <p className="font-medium text-[18px] pr-10">{x.title}</p>
      {x.note && <p className="mt-2 text-[14px] text-ink/80 whitespace-pre-wrap">{x.note}</p>}
      <div className="mt-4 rounded-[14px] bg-sage-50 divide-y divide-white text-[14px]">
        <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Frist')}</span><span className={isLate(x) ? 'text-alert' : ''}>{x.due_at ? due(x.due_at) : t('Keine')}</span></div>
        <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Für')}</span><span>{x.assignee_id ? (x.assignee_id === me.id ? t('dich') : '') : t('ganzes Studio {name}', { name: branches.find(b => b.id === x.branch_id)?.name ?? '' })}</span></div>
        {x.created_by !== me.id && <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Von')}</span><span>{x.created_by_name}</span></div>}
        {x.done_at && <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Erledigt')}</span><span>{x.done_by_name}</span></div>}
      </div>
      <button onClick={onToggle} className="mt-5 w-full h-12 rounded-[14px] bg-olive-700 text-white text-[15px]">{x.done_at ? t('Wieder öffnen') : t('Erledigt')}</button>
      {x.created_by === me.id && <button onClick={del} className="mt-2 w-full h-10 text-[13px] text-mute hover:text-alert flex items-center justify-center gap-1.5"><Trash2 size={14} />{t('Löschen')}</button>}
    </Modal>
  )
}

/* ---------- Backoffice: Aufgaben zuweisen ---------- */
export function TodosAdmin() {
  const { me, employee, staff, branches } = useApp()
  const all = useTodos(), due = useDue()
  const mineBr = me.app_role === 'buero' ? branches.filter(b => !b.is_office).map(b => b.id) : [me.branch_id, ...(me.extra ?? [])].filter(b => b !== 'buero')
  const people = staff.filter(s => s.active && mineBr.includes(s.branch_id)).sort((a, b) => a.first.localeCompare(b.first))
  const [form, setForm] = useState(false), [title, setTitle] = useState(''), [note, setNote] = useState(''), [target, setTarget] = useState(''), [date, setDate] = useState(''), [time, setTime] = useState(''), [err, setErr] = useState(''), [view, setView] = useState<'offen' | 'erledigt'>('offen')
  // Hier nur, was Filialleitung/Büro anderen gibt (eigene To-dos bleiben privat in der App)
  const assigned = all.filter(x => !(x.assignee_id && x.assignee_id === x.created_by))
  const list = assigned.filter(x => view === 'offen' ? !x.done_at : !!x.done_at)
  const forLabel = (x: Todo) => x.assignee_id ? (() => { const p = staff.find(s => s.id === x.assignee_id); return p ? `${p.first} ${p.last}` : '–' })() : `Studio ${branches.find(b => b.id === x.branch_id)?.name ?? ''}`
  const save = async () => {
    if (!title.trim() || !target) { setErr('Titel und „Für wen“ sind nötig.'); return }
    const [kind, id] = target.split(':')
    const { error } = await supabase!.from('todos').insert({ title: title.trim(), note: note.trim(), due_at: toIso(date, time), assignee_id: kind === 'p' ? id : null, branch_id: kind === 'b' ? id : null, created_by: employee.id, created_by_name: `${me.first} ${me.last.slice(0, 1)}.` })
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    toast('Aufgabe zugewiesen'); setForm(false); setTitle(''); setNote(''); setTarget(''); setDate(''); setTime(''); setErr(''); await reloadTodos()
  }
  const seg = (on: boolean) => `h-8 px-3 rounded-[8px] text-[13px] transition ${on ? 'bg-white text-ink shadow-[0_1px_2px_rgba(29,34,28,.08)]' : 'text-ink/60'}`
  const inp = 'w-full h-10 rounded-[10px] border border-transparent focus:border-sage-400 px-3 text-[14px] bg-white outline-none transition'
  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <div><p className="rubric text-ink/70">Einzelne Aufgaben</p><p className="text-[13px] text-mute mt-1">Einmalig, mit Frist, für eine Person oder ein ganzes Studio. Erscheint in der App unter Aufgaben → Für mich, mit Mitteilung.</p></div>
        <div className="flex gap-3 items-center shrink-0">
          <div className="flex gap-1 p-1 rounded-[10px] bg-sage-50">{(['offen', 'erledigt'] as const).map(k => <button key={k} onClick={() => setView(k)} className={seg(view === k)}>{k === 'offen' ? `Offen · ${assigned.filter(x => !x.done_at).length}` : 'Erledigt'}</button>)}</div>
          <button onClick={() => setForm(!form)} className="h-10 px-4 rounded-[10px] bg-olive-700 hover:bg-olive-800 transition text-white text-[14px] flex items-center gap-1.5"><Plus size={16} />Aufgabe zuweisen</button>
        </div>
      </div>
      {form && <div className="rounded-[16px] bg-sage-50 p-6 mb-5 grid grid-cols-[1fr_300px] gap-6">
        <div className="space-y-3">
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Was ist zu tun? z. B. Schaufenster neu dekorieren" className="w-full text-[18px] font-medium outline-none bg-transparent" />
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Notiz (optional)" className="w-full resize-none outline-none text-[14px] bg-transparent" />
        </div>
        <div className="space-y-3 text-[14px]">
          <label className="block"><span className="block text-xs text-mute mb-1">Für wen</span>
            <select value={target} onChange={e => setTarget(e.target.value)} className={inp}><option value="">Auswählen …</option>
              <optgroup label="Ganzes Studio">{branches.filter(b => mineBr.includes(b.id)).map(b => <option key={b.id} value={`b:${b.id}`}>Studio {b.name}</option>)}</optgroup>
              <optgroup label="Person">{people.map(p => <option key={p.id} value={`p:${p.id}`}>{p.first} {p.last} · {p.branch}{p.email.endsWith('@aleksa.ai') ? ' (Testkonto)' : ''}</option>)}</optgroup>
            </select></label>
          <DueFieldsAdmin date={date} time={time} setDate={setDate} setTime={setTime} inp={inp} />
          {err && <p className="text-[13px] text-alert">{err}</p>}
          <button onClick={save} className="w-full h-10 rounded-[10px] bg-olive-700 hover:bg-olive-800 transition text-white text-[14px]">Zuweisen</button>
        </div>
      </div>}
      <table className="tbl w-full text-[14px]"><thead><tr>{['Aufgabe', 'Für', 'Frist', 'Von', 'Stand', ''].map(h => <th key={h} className="text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {list.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-mute">{view === 'offen' ? 'Keine offenen Aufgaben.' : 'Noch nichts erledigt.'}</td></tr>}
          {list.map(x => <tr key={x.id}>
            <td className="px-4 py-3">{x.title}{x.note && <p className="text-xs text-mute truncate max-w-[360px]">{x.note}</p>}</td>
            <td className="px-4 text-mute">{forLabel(x)}</td>
            <td className={`px-4 ${isLate(x) ? 'text-alert' : 'text-mute'}`}>{x.due_at ? due(x.due_at) : '–'}</td>
            <td className="px-4 text-mute">{x.created_by_name}</td>
            <td className="px-4 text-[13px]">{x.done_at ? <span className="inline-flex items-center gap-1.5"><span className="w-[7px] h-[7px] rounded-full bg-ok" />{x.done_by_name}, {new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(x.done_at))}</span> : <span className="inline-flex items-center gap-1.5 text-ink/80"><span className={`w-[7px] h-[7px] rounded-full ${isLate(x) ? 'bg-alert' : 'bg-sage-400'}`} />{isLate(x) ? 'Überfällig' : 'Offen'}</span>}</td>
            <td className="px-2 text-right"><button title="Löschen" onClick={async () => { if (confirm(`Aufgabe „${x.title}“ löschen?`)) { await supabase!.from('todos').delete().eq('id', x.id); await reloadTodos() } }} className="text-mute hover:text-alert"><Trash2 size={14} /></button></td>
          </tr>)}
        </tbody></table>
    </div>
  )
}
function DueFieldsAdmin({ date, time, setDate, setTime, inp }: { date: string; time: string; setDate: (s: string) => void; setTime: (s: string) => void; inp: string }) {
  return (
    <div className="grid grid-cols-[1fr_110px] gap-2">
      <label className="block"><span className="block text-xs text-mute mb-1">Frist (optional)</span><input type="date" min={isoDay()} value={date} onChange={e => setDate(e.target.value)} className={inp} /></label>
      <label className="block"><span className="block text-xs text-mute mb-1">Uhrzeit</span><input type="time" value={time} disabled={!date} onChange={e => setTime(e.target.value)} className={`${inp} disabled:opacity-50`} /></label>
    </div>
  )
}
