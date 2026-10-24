import { ViewportOverlay } from './ViewportOverlay'
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
  // Studio-Aufgabe: jemand anderes war schneller
  if (error) toast(t(/already_done/.test(error.message) ? 'Schon erledigt, jemand war schneller.' : 'Das hat nicht geklappt'), 'error')
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
        <p className={`text-[17px] leading-snug ${x.done_at ? 'text-mute line-through decoration-sage-400' : ''}`}>{x.title}</p>
        <p className="text-[13px] text-mute mt-0.5">{[
          x.done_at ? <span key="d">{t('Erledigt von {name}', { name: x.done_by_name ?? '' })}</span> : x.due_at ? <span key="d" className={isLate(x) ? 'text-alert' : ''}>{t('bis {when}', { when: due(x.due_at) })}</span> : null,
          !x.assignee_id && x.branch_id ? <span key="b">{t('fürs Studio {name}, eine Person reicht', { name: branches.find(b => b.id === x.branch_id)?.name ?? '' })}</span> : null,
          from(x) ? <span key="f">{from(x)}</span> : null,
        ].filter(Boolean).flatMap((el, i) => i ? [<span key={'s' + i}> · </span>, el] : [el])}</p>
      </div>
    </div>
  )
  return (
    <div>
      <button onClick={() => setAdd(true)} className="w-full rounded-[16px] bg-white px-4 py-3.5 flex items-center gap-3 text-left text-[17px] text-ink/80 hover:text-ink"><span className="w-[26px] h-[26px] rounded-full bg-sage-100 text-olive-800 flex items-center justify-center"><Plus size={16} /></span>{t('Eigenes To-do hinzufügen')}</button>
      {open.length === 0 && <p className="mt-6 px-1 text-[15.5px] text-mute">{t('Gerade nichts offen. Aufgaben von deiner Filialleitung oder dem Büro erscheinen hier mit Frist.')}</p>}
      {groups.filter(([, l]) => l.length).map(([g, l, cls]) => (
        <div key={g}>
          <h2 className={`mt-7 mb-2.5 px-1 rubric ${cls ?? 'text-ink/70'}`}>{t(g)}</h2>
          <div className="rounded-[16px] bg-white divide-y divide-sage-50 overflow-hidden">{l.map(row)}</div>
        </div>
      ))}
      {done.length > 0 && <>
        <button onClick={() => setShowDone(!showDone)} className="mt-7 px-1 text-[14.5px] text-sage-800">{showDone ? t('Erledigte ausblenden') : t('{n} erledigt anzeigen', { n: done.length })}</button>
        {showDone && <div className="mt-2.5 rounded-[16px] bg-white divide-y divide-sage-50 overflow-hidden">{done.map(row)}</div>}
      </>}
      {add && <TodoSheet onClose={() => setAdd(false)} />}
      {sel && <TodoDetail x={sel} onClose={() => setSel(null)} onToggle={async () => { await toggle(sel); setSel(null) }} />}
    </div>
  )
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const { t } = useApp()
  return (
    <ViewportOverlay label={t('Aufgaben')} onClose={onClose} className="flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-ink/30" />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mobile-sheet mobile-todo-sheet relative w-full md:max-w-[460px] bg-white rounded-t-[28px] md:rounded-[20px] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex justify-end px-3 pt-2"><button onClick={onClose} aria-label={t('Schliessen')} className="w-11 h-11 rounded-full hover:bg-sage-100 flex items-center justify-center text-mute"><X size={18} /></button></div>
        <div className="mobile-sheet-scroll flex-1 min-h-0 overflow-y-auto px-6 pb-6">{children}</div>
      </motion.div>
    </ViewportOverlay>
  )
}

function DueFields({ date, time, setDate, setTime }: { date: string; time: string; setDate: (s: string) => void; setTime: (s: string) => void }) {
  const { t } = useApp()
  const pick = useRef<HTMLInputElement>(null)
  const today = isoDay(), tomorrow = addDays(1), custom = !!date && date !== today && date !== tomorrow
  const chip = (on: boolean) => `h-9 px-3.5 rounded-full text-[15.5px] transition ${on ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/80 hover:bg-sage-100'}`
  const label = custom ? new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(date + 'T12:00:00Z')) : t('Anderes Datum')
  return (
    <div>
      <p className="text-[13px] text-mute mb-1.5">{t('Frist')}</p>
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
      {date && <div className="mt-3 flex items-center gap-2"><span className="text-[14.5px] text-mute">{t('Uhrzeit (optional)')}</span><input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-9 px-3 rounded-full bg-sage-50 text-[15.5px] outline-none" /></div>}
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
      <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} placeholder={t('Was ist zu tun?')} className="mt-4 w-full h-12 rounded-[12px] bg-sage-50 px-4 text-[17px] outline-none" />
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={t('Notiz (optional)')} className="mt-2 w-full rounded-[12px] bg-sage-50 px-4 py-3 text-[15.5px] outline-none resize-none" />
      <div className="mt-4"><DueFields date={date} time={time} setDate={setDate} setTime={setTime} /></div>
      <button onClick={save} disabled={!title.trim() || busy} className="mt-6 w-full h-12 rounded-[14px] bg-olive-700 text-white text-[17px] disabled:opacity-50">{t('Speichern')}</button>
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
      {x.note && <p className="mt-2 text-[15.5px] text-ink/80 whitespace-pre-wrap">{x.note}</p>}
      <div className="mt-4 rounded-[14px] bg-sage-50 divide-y divide-white text-[15.5px]">
        <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Frist')}</span><span className={isLate(x) ? 'text-alert' : ''}>{x.due_at ? due(x.due_at) : t('Keine')}</span></div>
        <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Für')}</span><span>{x.assignee_id ? (x.assignee_id === me.id ? t('dich') : '') : t('fürs Studio {name}, eine Person reicht', { name: branches.find(b => b.id === x.branch_id)?.name ?? '' })}</span></div>
        {x.created_by !== me.id && <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Von')}</span><span>{x.created_by_name}</span></div>}
        {x.done_at && <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Erledigt')}</span><span>{x.done_by_name}</span></div>}
      </div>
      <button onClick={onToggle} className="mt-5 w-full h-12 rounded-[14px] bg-olive-700 text-white text-[17px]">{x.done_at ? t('Wieder öffnen') : t('Erledigt')}</button>
      {x.created_by === me.id && <button onClick={del} className="mt-2 w-full h-10 text-[14.5px] text-mute hover:text-alert flex items-center justify-center gap-1.5"><Trash2 size={14} />{t('Löschen')}</button>}
    </Modal>
  )
}
