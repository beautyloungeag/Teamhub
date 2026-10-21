import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, SquarePen, Send, Users, Search, Check, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useApp, type Staff } from './store'
import { Avatar } from './People'
import { BMark } from './Logo'
import { locale } from './lib/i18n'
import { toast } from './Toast'

// Team-Chats (Wunsch der Inhaberin 20./21.10.): ein Raum je Studio, einer fürs ganze Team, Direkt- und Gruppenchats.
// Marc steht oben angeheftet, damit der Assistent ein eigener Eintrag bleibt.
type Room = { id: string; kind: 'studio' | 'team' | 'direkt' | 'gruppe'; branch_id: string | null; title: string | null; last_message_at: string }
type Member = { room_id: string; employee_id: string; last_read_at: string }
type Msg = { id: string; room_id: string; sender_id: string; body: string; created_at: string }
export type ChatSummary = { room: Room; members: string[]; last: Msg | null; unread: boolean }

export async function loadChatSummaries(meId: string): Promise<ChatSummary[]> {
  if (!supabase) return []
  const { data: rooms } = await supabase.from('chat_rooms').select('id, kind, branch_id, title, last_message_at').order('last_message_at', { ascending: false })
  const ids = (rooms ?? []).map(r => r.id)
  if (!ids.length) return []
  const [{ data: mem }, { data: msgs }] = await Promise.all([
    supabase.from('chat_members').select('room_id, employee_id, last_read_at').in('room_id', ids),
    supabase.from('chat_messages').select('id, room_id, sender_id, body, created_at').in('room_id', ids).order('created_at', { ascending: false }).limit(300),
  ])
  return (rooms as Room[]).map(room => {
    const ms = ((mem ?? []) as Member[]).filter(m => m.room_id === room.id)
    const last = ((msgs ?? []) as Msg[]).find(m => m.room_id === room.id) ?? null
    const mine = ms.find(m => m.employee_id === meId)
    return { room, members: ms.map(m => m.employee_id), last, unread: !!last && last.sender_id !== meId && (!mine || last.created_at > mine.last_read_at) }
  })
}

/** Ungelesene Team-Chats (für den Punkt in der Navigation), alle 60 s neu */
export function useChatUnread() {
  const { me } = useApp()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!me.id) return
    let live = true
    const tick = () => loadChatSummaries(me.id).then(s => { if (live) setN(s.filter(x => x.unread).length) })
    tick(); const iv = setInterval(tick, 60000)
    const on = () => tick(); window.addEventListener('th-chat-read', on)
    return () => { live = false; clearInterval(iv); window.removeEventListener('th-chat-read', on) }
  }, [me.id])
  return n
}

const when = (iso: string) => {
  const d = new Date(iso), now = new Date()
  const same = d.toDateString() === now.toDateString()
  return same ? new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(d)
    : new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(d)
}

function roomName(r: Room, members: string[], staff: Staff[], meId: string, t: (s: string, v?: Record<string, string | number>) => string, branchName: (id: string) => string) {
  if (r.kind === 'team') return t('Ganzes Team')
  if (r.kind === 'studio') return t('Studio {name}', { name: branchName(r.branch_id ?? '') })
  if (r.title) return r.title
  const others = members.filter(x => x !== meId).map(x => staff.find(s => s.id === x)).filter(Boolean) as Staff[]
  return others.map(s => r.kind === 'direkt' ? `${s.first} ${s.last}` : s.first).join(', ') || t('Chat')
}

export function ChatHub({ onOpenMarc, onOpenRoom }: { onOpenMarc: () => void; onOpenRoom: (id: string) => void }) {
  const { me, staff, branches, t } = useApp()
  const [list, setList] = useState<ChatSummary[] | null>(null)
  const [picking, setPicking] = useState(false)
  const bname = (id: string) => branches.find(b => b.id === id)?.name ?? id
  useEffect(() => { loadChatSummaries(me.id).then(setList) }, [me.id])
  // Studio-Räume erst, eigene zuerst; danach nach letzter Nachricht
  const sorted = useMemo(() => [...(list ?? [])].sort((a, b) => {
    const rank = (x: ChatSummary) => x.room.kind === 'studio' && x.room.branch_id === me.branch_id ? 0 : x.room.kind === 'team' ? 1 : 2
    return (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? '') || rank(a) - rank(b)
  }), [list, me.branch_id])
  const other = (s: ChatSummary) => s.room.kind === 'direkt' ? staff.find(x => x.id === s.members.find(m => m !== me.id)) : undefined
  return (
    <div className="pb-10">
      <div className="px-5 pt-3 pb-4 flex items-end justify-between gap-3">
        <h1 className="text-[30px] leading-tight">{t('Chats')}</h1>
        <button onClick={() => setPicking(true)} className="h-10 px-3.5 rounded-full bg-white text-[15.5px] font-medium flex items-center gap-1.5"><SquarePen size={16} />{t('Neuer Chat')}</button>
      </div>
      <div className="px-4 space-y-3">
        <button onClick={onOpenMarc} className="w-full rounded-[20px] bg-white p-4 flex items-center gap-3.5 text-left">
          <BMark className="w-12 h-12" />
          <span className="flex-1 min-w-0"><span className="block text-[17.5px] font-semibold">Marc</span><span className="block text-[15px] text-mute truncate">{t('Dein Assistent für Wissen, Abläufe und Kunden')}</span></span>
          <ChevronRight size={18} className="text-sage-400 shrink-0" />
        </button>
        <div className="rounded-[20px] bg-white overflow-hidden divide-y divide-line">
          {!list && <p className="px-4 py-4 text-[15.5px] text-mute">{t('Lädt …')}</p>}
          {sorted.map(s => { const o = other(s), name = roomName(s.room, s.members, staff, me.id, t, bname)
            const sender = s.last && s.last.sender_id !== me.id ? staff.find(x => x.id === s.last!.sender_id)?.first : null
            return <button key={s.room.id} onClick={() => onOpenRoom(s.room.id)} className="w-full px-4 py-3.5 flex items-center gap-3 text-left">
              {o ? <Avatar s={o} photo={o.photo} size="w-11 h-11 text-[15px]" /> : <span className="w-11 h-11 rounded-full bg-studio-50 text-studio flex items-center justify-center shrink-0"><Users size={19} /></span>}
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline gap-2"><span className={`flex-1 min-w-0 truncate text-[17px] ${s.unread ? 'font-semibold' : ''}`}>{name}</span>{s.last && <span className="text-[13px] text-mute shrink-0">{when(s.last.created_at)}</span>}</span>
                <span className={`block text-[15px] truncate mt-0.5 ${s.unread ? 'text-ink' : 'text-mute'}`}>{s.last ? `${sender ? sender + ': ' : s.last.sender_id === me.id ? t('Du') + ': ' : ''}${s.last.body}` : t('Noch keine Nachrichten')}</span>
              </span>
              {s.unread && <span className="w-2.5 h-2.5 rounded-full bg-duty shrink-0" />}
            </button> })}
        </div>
      </div>
      {picking && <PeoplePicker onClose={() => setPicking(false)} onStart={async (ids, title) => {
        const { data, error } = await supabase!.rpc('start_chat', { p_people: ids, p_title: title || null })
        if (error || !data) { toast(t('Das hat nicht geklappt'), 'error'); return }
        setPicking(false); onOpenRoom(data as string)
      }} />}
    </div>
  )
}

function PeoplePicker({ onClose, onStart }: { onClose: () => void; onStart: (ids: string[], title: string) => Promise<void> }) {
  const { staff, me, t } = useApp()
  const [q, setQ] = useState(''), [sel, setSel] = useState<string[]>([]), [title, setTitle] = useState(''), [busy, setBusy] = useState(false)
  const list = staff.filter(s => s.active && s.id !== me.id && `${s.first} ${s.last} ${s.branch} ${s.role}`.toLowerCase().includes(q.toLowerCase()))
  const toggle = (id: string) => setSel(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id])
  return (
    <div className="fixed inset-0 z-50 bg-ink/30 flex items-end md:items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full md:max-w-[480px] max-h-[88dvh] bg-paper rounded-t-[24px] md:rounded-[24px] flex flex-col">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between"><p className="text-[20px]">{t('Neuer Chat')}</p><button onClick={onClose} aria-label={t('Schliessen')} className="w-9 h-9 rounded-full bg-white flex items-center justify-center"><X size={18} /></button></div>
        <div className="px-5"><div className="h-11 rounded-2xl bg-white px-3.5 flex items-center gap-2"><Search size={18} className="text-mute" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('Name oder Studio')} className="flex-1 bg-transparent outline-none text-[17px] placeholder:text-mute" /></div></div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-3"><div className="rounded-[18px] bg-white divide-y divide-line overflow-hidden">
          {list.map(s => { const on = sel.includes(s.id)
            return <button key={s.id} onClick={() => toggle(s.id)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
              <Avatar s={s} photo={s.photo} size="w-10 h-10" /><span className="flex-1 min-w-0"><span className="block text-[17px] truncate">{s.first} {s.last}</span><span className="block text-[14px] text-mute truncate">{s.role} · {s.branch}</span></span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${on ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#B9C4AF]'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
            </button> })}
        </div></div>
        <div className="px-5 pt-2 pb-7 space-y-2 border-t border-line bg-paper">
          {sel.length > 1 && <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Name der Gruppe (optional)')} className="w-full h-11 rounded-2xl bg-white px-4 text-[17px] outline-none placeholder:text-mute" />}
          <button disabled={!sel.length || busy} onClick={async () => { setBusy(true); await onStart(sel, title.trim()); setBusy(false) }} className="w-full h-12 rounded-2xl bg-olive-700 text-white font-medium disabled:opacity-50">
            {sel.length > 1 ? t('Gruppe mit {n} Personen starten', { n: sel.length }) : t('Chat starten')}</button>
        </div>
      </div>
    </div>
  )
}

export function ChatRoom({ id, onBack }: { id: string; onBack: () => void }) {
  const { me, staff, branches, t } = useApp()
  const [room, setRoom] = useState<Room | null>(null), [members, setMembers] = useState<string[]>([])
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const markRead = () => supabase?.from('chat_members').upsert({ room_id: id, employee_id: me.id, last_read_at: new Date().toISOString() }).then(() => window.dispatchEvent(new Event('th-chat-read')))
  useEffect(() => {
    if (!supabase) return
    supabase.from('chat_rooms').select('id, kind, branch_id, title, last_message_at').eq('id', id).maybeSingle().then(({ data }) => setRoom(data as Room | null))
    supabase.from('chat_members').select('employee_id').eq('room_id', id).then(({ data }) => setMembers((data ?? []).map(x => x.employee_id)))
    supabase.from('chat_messages').select('id, room_id, sender_id, body, created_at').eq('room_id', id).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => { setMsgs(((data ?? []) as Msg[]).reverse()); markRead() })
    const ch = supabase.channel('chat-' + id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${id}` }, p => {
      const m = p.new as Msg
      setMsgs(x => x && !x.some(y => y.id === m.id) ? [...x, m] : x); markRead()
    }).subscribe()
    return () => { supabase!.removeChannel(ch) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])
  const send = async () => {
    const body = text.trim(); if (!body || !supabase) return
    setBusy(true)
    const { data, error } = await supabase.from('chat_messages').insert({ room_id: id, sender_id: me.id, body }).select('id, room_id, sender_id, body, created_at').single()
    setBusy(false)
    if (error) { toast(t('Senden hat nicht geklappt'), 'error'); return }
    setText(''); setMsgs(x => x && !x.some(y => y.id === data.id) ? [...x, data as Msg] : x)
  }
  const name = room ? roomName(room, members, staff, me.id, t, b => branches.find(x => x.id === b)?.name ?? b) : ''
  const sub = room?.kind === 'team' ? t('Alle Studios') : room?.kind === 'studio' ? t('Alle im Studio') : members.length > 2 ? t('{n} Personen', { n: members.length }) : ''
  const day = (iso: string) => new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 pt-11 md:pt-3 pb-2 px-3 flex items-center gap-2 bg-paper border-b border-line">
        <button onClick={onBack} className="h-11 px-1 flex items-center gap-0.5 text-sage-800 text-[17px]"><ChevronLeft size={22} />{t('Chats')}</button>
        <div className="flex-1 min-w-0 text-center pr-16"><p className="text-[17px] font-semibold truncate">{name}</p>{sub && <p className="text-[13px] text-mute">{sub}</p>}</div>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar bg-sage-50">
        <div className="max-w-[760px] mx-auto px-4 py-4 space-y-1.5">
          {msgs === null && <p className="text-mute text-[15.5px]">{t('Lädt …')}</p>}
          {msgs?.length === 0 && <p className="text-center text-[15.5px] text-mute pt-10">{t('Schreib die erste Nachricht.')}</p>}
          {msgs?.map((m, i) => { const mine = m.sender_id === me.id, s = staff.find(x => x.id === m.sender_id), prev = msgs[i - 1]
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
            const showName = !mine && (newDay || prev?.sender_id !== m.sender_id)
            return <div key={m.id}>
              {newDay && <p className="text-center text-[13px] text-mute py-2">{day(m.created_at)}</p>}
              <div className={`flex items-end gap-2 ${mine ? 'justify-end' : ''} ${showName ? 'pt-2' : ''}`}>
                {!mine && <span className="w-8 shrink-0">{showName && s && <Avatar s={s} photo={s.photo} size="w-8 h-8 text-[12px]" />}</span>}
                <div className={`max-w-[78%] rounded-[18px] px-3.5 py-2.5 ${mine ? 'bg-olive-700 text-white rounded-br-[6px]' : 'bg-white rounded-bl-[6px]'}`}>
                  {showName && room?.kind !== 'direkt' && <p className="text-[13px] font-semibold text-studio mb-0.5">{s ? `${s.first} ${s.last}` : t('Ehemalige Person')}</p>}
                  <p className="text-[17px] leading-snug whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[12px] mt-1 text-right ${mine ? 'text-white/70' : 'text-mute'}`}>{new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(m.created_at))}</p>
                </div>
              </div>
            </div> })}
          <div ref={end} />
        </div>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-3 md:pb-5 bg-paper border-t border-line">
        <div className="max-w-[760px] mx-auto flex items-end gap-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={1} placeholder={t('Nachricht')}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover: hover)').matches) { e.preventDefault(); send() } }}
            className="flex-1 max-h-36 min-h-[46px] rounded-[22px] bg-white px-4 py-3 text-[17px] outline-none resize-none placeholder:text-mute" />
          <button disabled={busy || !text.trim()} onClick={send} aria-label={t('Senden')} className="w-[46px] h-[46px] rounded-full bg-olive-700 text-white flex items-center justify-center disabled:opacity-40 shrink-0"><Send size={18} /></button>
        </div>
      </div>
    </div>
  )
}
