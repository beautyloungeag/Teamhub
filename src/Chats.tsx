import { scrollInPane } from './lib/mobile-viewport'
import { ViewportOverlay } from './ViewportOverlay'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { captureAccountScope, isCurrentAccountScope, onAccountScopeChange } from './lib/account-scope'
import { ChatTimeline, type ChatMessage } from './lib/chat-timeline'
import { ChevronLeft, ChevronRight, SquarePen, Send, Users, Search, Check, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useApp, type Staff } from './store'
import { Avatar } from './People'
import { BMark } from './Logo'
import { locale } from './lib/i18n'
import { refreshChatBadge } from './lib/push'
import { toast } from './Toast'

// Team-Chats (Wunsch der Inhaberin 20./21.10.): ein Raum je Studio, einer fürs ganze Team, Direkt- und Gruppenchats.
// Seit 22.10. zum Start nur die festen Gruppen (Studio, ganzes Team); Einzel- und eigene Gruppenchats schaltet das Büro
// bei Bedarf ein (app_settings chat_private), bis dahin sperrt die Datenbank sie auch.
// Marc steht oben angeheftet, damit der Assistent ein eigener Eintrag bleibt.
type Room = { id: string; kind: 'studio' | 'team' | 'direkt' | 'gruppe'; branch_id: string | null; title: string | null; last_message_at: string }
type Member = { room_id: string; employee_id: string; last_read_at: string }
type Msg = ChatMessage
export type ChatSummary = { room: Room; members: string[]; last: Msg | null; unread: boolean }

export async function loadChatSummaries(meId: string): Promise<ChatSummary[]> {
  const scope = captureAccountScope(meId)
  if (!supabase || !scope) throw new Error('chat_session_unavailable')
  const rooms: Room[] = []
  for (let offset = 0; ; offset += 100) {
    const result = await supabase.from('chat_rooms').select('id, kind, branch_id, title, last_message_at').order('last_message_at', { ascending: false }).range(offset, offset + 99).abortSignal(scope.signal)
    if (!isCurrentAccountScope(scope)) throw new Error('chat_session_changed')
    if (result.error) throw result.error
    const batch = (result.data ?? []) as Room[]
    rooms.push(...batch)
    if (batch.length < 100) break
  }
  const summaries = new Map<string, ChatSummary>()
  let cursor = 0
  // Latest message is fetched per room. A busy room cannot evict a quiet room's
  // last message/unread state from a global 300-row window.
  await Promise.all(Array.from({ length: Math.min(4, rooms.length) }, async () => {
    while (cursor < rooms.length) {
      const room = rooms[cursor++]
      const [members, messages] = await Promise.all([
        supabase!.from('chat_members').select('room_id, employee_id, last_read_at').eq('room_id', room.id).abortSignal(scope.signal),
        supabase!.from('chat_messages').select('id, room_id, sender_id, body, created_at').eq('room_id', room.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).abortSignal(scope.signal),
      ])
      if (!isCurrentAccountScope(scope)) throw new Error('chat_session_changed')
      if (members.error || messages.error) throw members.error ?? messages.error
      const ms = (members.data ?? []) as Member[], last = (messages.data?.[0] as Msg | undefined) ?? null
      const mine = ms.find(m => m.employee_id === meId)
      summaries.set(room.id, { room, members: ms.map(m => m.employee_id), last, unread: !!last && last.sender_id !== meId && (!mine || last.created_at > mine.last_read_at) })
    }
  }))
  if (!isCurrentAccountScope(scope)) throw new Error('chat_session_changed')
  return rooms.map(room => summaries.get(room.id)!)
}

/** Ungelesene Team-Chats (für den Punkt in der Navigation), alle 60 s neu */
export function useChatUnread() {
  const { me } = useApp()
  const [n, setN] = useState(0)
  useEffect(() => {
    const scope = captureAccountScope(me.id)
    if (!scope) return
    let live = true, running = false, again = false
    const current = () => live && isCurrentAccountScope(scope)
    const tick = async () => {
      if (!current()) return
      if (running) { again = true; return }
      running = true
      try {
        const rows = await loadChatSummaries(me.id)
        if (current()) { setN(rows.filter(x => x.unread).length); void refreshChatBadge() }
      } catch { /* Keep last confirmed count; ChatHub exposes retry/errors. */ }
      finally { running = false; if (again && current()) { again = false; void tick() } }
    }
    void tick(); const iv = setInterval(tick, 30000)
    const visible = () => { if (document.visibilityState === 'visible') void tick() }
    document.addEventListener('visibilitychange', visible)
    const ch = supabase?.channel(`chat-unread-${scope.version}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
      if (!current()) return
      void tick(); window.dispatchEvent(new Event('th-chat-change'))
    }).subscribe(status => { if (status === 'SUBSCRIBED' && current()) void tick() })
    const on = () => { void tick() }; window.addEventListener('th-chat-read', on)
    const stop = onAccountScopeChange(() => { if (!current()) setN(0) })
    return () => { live = false; stop(); clearInterval(iv); window.removeEventListener('th-chat-read', on); document.removeEventListener('visibilitychange', visible); if (ch) void supabase?.removeChannel(ch) }
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
  const { me, staff, branches, t, privateChats } = useApp()
  const [list, setList] = useState<ChatSummary[] | null>(null)
  const [picking, setPicking] = useState(false), [loadError, setLoadError] = useState(false)
  const bname = (id: string) => branches.find(b => b.id === id)?.name ?? id
  useEffect(() => {
    const scope = captureAccountScope(me.id)
    if (!scope) return
    let live = true, running = false, again = false
    const current = () => live && isCurrentAccountScope(scope)
    const load = async () => {
      if (!current()) return
      if (running) { again = true; return }
      running = true
      try { const rows = await loadChatSummaries(me.id); if (current()) { setList(rows); setLoadError(false) } }
      catch { if (current()) setLoadError(true) }
      finally { running = false; if (again && current()) { again = false; void load() } }
    }
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    const stop = onAccountScopeChange(() => { if (!current()) setList(null) })
    void load(); window.addEventListener('th-chat-change', load); window.addEventListener('th-chat-read', load); document.addEventListener('visibilitychange', visible)
    const timer = setInterval(load, 30000)
    return () => { live = false; stop(); clearInterval(timer); window.removeEventListener('th-chat-change', load); window.removeEventListener('th-chat-read', load); document.removeEventListener('visibilitychange', visible) }
  }, [me.id])
  // Studio-Räume erst, eigene zuerst; danach nach letzter Nachricht
  const sorted = useMemo(() => [...(list ?? [])].filter(x => privateChats || x.room.kind === 'studio' || x.room.kind === 'team').sort((a, b) => {
    const rank = (x: ChatSummary) => x.room.kind === 'studio' && x.room.branch_id === me.branch_id ? 0 : x.room.kind === 'team' ? 1 : 2
    return (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? '') || rank(a) - rank(b)
  }), [list, me.branch_id, privateChats])
  const other = (s: ChatSummary) => s.room.kind === 'direkt' ? staff.find(x => x.id === s.members.find(m => m !== me.id)) : undefined
  return (
    <div className="pb-10">
      <div className="px-5 pt-3 pb-4 flex items-end justify-between gap-3">
        <h1 className="text-[30px] leading-tight">{t('Chats')}</h1>
        {privateChats && <button onClick={() => setPicking(true)} className="h-10 px-3.5 rounded-full bg-white text-[15.5px] font-medium flex items-center gap-1.5"><SquarePen size={16} />{t('Neuer Chat')}</button>}
      </div>
      <div className="px-4 space-y-3">
        <button onClick={onOpenMarc} className="w-full rounded-[20px] bg-white p-4 flex items-center gap-3.5 text-left">
          <BMark className="w-12 h-12" />
          <span className="flex-1 min-w-0"><span className="block text-[17.5px] font-semibold">Marc</span><span className="block text-[15px] text-mute truncate">{t('Dein Assistent für Wissen, Abläufe und Kunden')}</span></span>
          <ChevronRight size={18} className="text-sage-400 shrink-0" />
        </button>
        <div className="rounded-[20px] bg-white overflow-hidden divide-y divide-line">
          {loadError && <p role="alert" className="px-4 py-4 text-[15px] text-alert">{t('Chats konnten nicht geladen werden.')} <button onClick={() => window.dispatchEvent(new Event('th-chat-change'))} className="underline underline-offset-2">{t('Erneut versuchen')}</button></p>}
          {!list && !loadError && <p className="px-4 py-4 text-[15.5px] text-mute">{t('Lädt …')}</p>}
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
        const scope = captureAccountScope(me.id)
        if (!scope) return
        const { data, error } = await supabase!.rpc('start_chat', { p_people: ids, p_title: title || null }).abortSignal(scope.signal)
        if (!isCurrentAccountScope(scope)) return
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
    <ViewportOverlay label={t('Neuer Chat')} onClose={onClose} className="bg-ink/30 flex items-end md:items-center justify-center">
      <div onClick={e => e.stopPropagation()} className="w-full md:max-w-[480px] mobile-sheet max-h-[88dvh] bg-paper rounded-t-[24px] md:rounded-[24px] flex flex-col">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between"><p className="text-[20px]">{t('Neuer Chat')}</p><button onClick={onClose} aria-label={t('Schliessen')} className="w-9 h-9 rounded-full bg-white flex items-center justify-center"><X size={18} /></button></div>
        <div className="px-5"><div className="h-11 rounded-2xl bg-white px-3.5 flex items-center gap-2"><Search size={18} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Name oder Studio')} className="flex-1 bg-transparent outline-none text-[17px] placeholder:text-mute" /></div></div>
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 py-3"><div className="rounded-[18px] bg-white divide-y divide-line overflow-hidden">
          {list.map(s => { const on = sel.includes(s.id)
            return <button key={s.id} onClick={() => toggle(s.id)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
              <Avatar s={s} photo={s.photo} size="w-10 h-10" /><span className="flex-1 min-w-0"><span className="block text-[17px] truncate">{s.first} {s.last}</span><span className="block text-[14px] text-mute truncate">{s.role} · {s.branch}</span></span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${on ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#B9C4AF]'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
            </button> })}
        </div></div>
        <div className="px-5 pt-2 pb-7 space-y-2 border-t border-line bg-paper">
          {sel.length > 1 && <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Name der Gruppe (optional)')} className="w-full h-11 rounded-2xl bg-white px-4 text-[17px] outline-none placeholder:text-mute" />}
          <button disabled={!sel.length || busy} onClick={async () => { const scope = captureAccountScope(me.id); if (!scope || busy) return; setBusy(true); try { await onStart(sel, title.trim()) } catch { if (isCurrentAccountScope(scope)) toast(t('Das hat nicht geklappt'), 'error') } finally { if (isCurrentAccountScope(scope)) setBusy(false) } }} className="w-full h-12 rounded-2xl bg-olive-700 text-white font-medium disabled:opacity-50">
            {sel.length > 1 ? t('Gruppe mit {n} Personen starten', { n: sel.length }) : t('Chat starten')}</button>
        </div>
      </div>
    </ViewportOverlay>
  )
}

export function ChatRoom({ id, onBack }: { id: string; onBack: () => void }) {
  const { me } = useApp()
  const version = useSyncExternalStore(onAccountScopeChange, () => captureAccountScope(me.id)?.version ?? -1)
  if (version < 0) return null
  return <ChatRoomSession key={`${version}:${id}`} id={id} onBack={onBack} />
}

function ChatRoomSession({ id, onBack }: { id: string; onBack: () => void }) {
  const { me, staff, branches, t } = useApp()
  const messagesPane = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), end = useRef<HTMLDivElement>(null), roomRoot = useRef<HTMLDivElement>(null)
  const [roomReady, setRoomReady] = useState(false), [readReady, setReadReady] = useState(false)
  const [room, setRoom] = useState<Room | null>(null), [members, setMembers] = useState<string[]>([])
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false), [connectionError, setConnectionError] = useState(false), [sendError, setSendError] = useState(false), [readError, setReadError] = useState(false), [newBelow, setNewBelow] = useState(false)
  const atBottom = useRef(true), sending = useRef(false), rendered = useRef<Msg[]>([])
  const uncertainSend = useRef<{ id: string; body: string } | null>(null)
  const life = useRef<{ current: () => boolean; reload: () => Promise<void>; receive: (m: Msg) => void; queueRead: () => void; signal: AbortSignal } | null>(null)
  useEffect(() => { const area = input.current; if (area) { area.style.height = 'auto'; area.style.height = Math.min(area.scrollHeight, 144) + 'px' } }, [text])

  useEffect(() => {
    const scope = captureAccountScope(me.id)
    if (!supabase || !scope) return
    const controller = new AbortController(), timeline = new ChatTimeline()
    let live = true, loading = false, rerun = false, snapshotReady = false, readFrame = 0
    let reading = false, wantedRead: Msg | null = null, acknowledged: Msg | null = null
    const current = () => live && !controller.signal.aborted && isCurrentAccountScope(scope)
    const abort = () => controller.abort()
    scope.signal.addEventListener('abort', abort, { once: true })
    const displayed = () => {
      const pane = messagesPane.current, root = roomRoot.current
      if (!current() || !snapshotReady || document.visibilityState !== 'visible' || !root?.getClientRects().length || root.closest('[inert]') || !pane) return null
      const bounds = pane.getBoundingClientRect()
      const visible = [...pane.querySelectorAll<HTMLElement>('[data-chat-message-id]')].reverse().find(node => {
        const r = node.getBoundingClientRect()
        return r.height > 0 && r.bottom > bounds.top && r.top < bounds.bottom
      })
      return rendered.current.find(message => message.id === visible?.dataset.chatMessageId) ?? null
    }
    const acknowledge = async () => {
      if (reading) return
      reading = true
      try {
        while (wantedRead && current()) {
          const message = wantedRead; wantedRead = null
          if (!snapshotReady || (acknowledged && (message.id === acknowledged.id || Date.parse(message.created_at) < Date.parse(acknowledged.created_at)))) continue
          const { error } = await supabase!.rpc('mark_chat_read', { p_room: id, p_message: message.id }).abortSignal(controller.signal)
          if (!current()) return
          if (error) { setReadError(true); break }
          acknowledged = message; setReadError(false)
          window.dispatchEvent(new Event('th-chat-read'))
        }
      } catch { if (current()) setReadError(true) }
      finally { reading = false }
    }
    const queueRead = () => {
      if (!current() || readFrame) return
      readFrame = requestAnimationFrame(() => {
        readFrame = 0
        const message = displayed()
        if (message) { wantedRead = message; void acknowledge() }
      })
    }
    const receive = (message: Msg) => {
      if (!current() || message.room_id !== id) return
      const rows = timeline.upsert(message)
      if (rows) { setMsgs(rows); if (!atBottom.current) setNewBelow(true) }
      // No read acknowledgement here: React must commit and expose the bubble first.
    }
    const load = async () => {
      if (!current()) return
      if (loading) { rerun = true; return }
      loading = true; snapshotReady = false; setReadReady(false)
      const startedAt = timeline.beginSnapshot(), request = new AbortController()
      const cancel = () => request.abort()
      controller.signal.addEventListener('abort', cancel, { once: true })
      const timeout = window.setTimeout(cancel, 15000)
      try {
        const [r, people, messages] = await Promise.all([
          supabase!.from('chat_rooms').select('id, kind, branch_id, title, last_message_at').eq('id', id).abortSignal(request.signal).maybeSingle(),
          supabase!.from('chat_members').select('employee_id').eq('room_id', id).abortSignal(request.signal),
          supabase!.from('chat_messages').select('id, room_id, sender_id, body, created_at').eq('room_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200).abortSignal(request.signal),
        ])
        if (!current()) return
        if (r.error || people.error || messages.error) throw r.error ?? people.error ?? messages.error
        setRoomReady(true); setRoom(r.data as Room | null)
        if (!r.data) { setMsgs([]); setMembers([]); setLoadError(false); return }
        setMembers((people.data ?? []).map(x => x.employee_id))
        setMsgs(timeline.acceptSnapshot((messages.data ?? []) as Msg[], startedAt))
        snapshotReady = true; setReadReady(true); setLoadError(false)
      } catch { if (current()) setLoadError(true) }
      finally {
        window.clearTimeout(timeout); controller.signal.removeEventListener('abort', cancel); loading = false
        if (rerun && current()) { rerun = false; void load() }
      }
    }
    life.current = { current, reload: load, receive, queueRead, signal: controller.signal }
    const channel = supabase.channel(`chat-${scope.version}-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${id}` }, payload => receive(payload.new as Msg))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${id}` }, payload => receive(payload.new as Msg))
      .subscribe(status => {
        if (!current()) return
        if (status === 'SUBSCRIBED') { setConnectionError(false); void load() }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { snapshotReady = false; setReadReady(false); setConnectionError(true) }
      })
    if (!loading) void load()
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load() })
    if (roomRoot.current) observer.observe(roomRoot.current)
    document.addEventListener('visibilitychange', visible)
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible' && roomRoot.current?.getClientRects().length) void load() }, 30000)
    return () => {
      live = false; controller.abort(); scope.signal.removeEventListener('abort', abort); life.current = null
      if (readFrame) cancelAnimationFrame(readFrame)
      window.clearInterval(interval); observer.disconnect(); document.removeEventListener('visibilitychange', visible); void supabase!.removeChannel(channel)
    }
  }, [id, me.id])

  useEffect(() => { rendered.current = msgs ?? []; life.current?.queueRead() }, [msgs, readReady])
  useEffect(() => { if (atBottom.current) scrollInPane(messagesPane.current, end.current, 'end') }, [msgs?.length])
  useEffect(() => {
    const pane = messagesPane.current
    if (!pane) return
    const observer = new ResizeObserver(() => { if (atBottom.current) scrollInPane(pane, end.current, 'end'); life.current?.queueRead() })
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])
  const scroll = () => {
    const pane = messagesPane.current
    if (pane) { atBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48; if (atBottom.current) setNewBelow(false) }
    life.current?.queueRead()
  }
  const send = async () => {
    const body = text.trim(), active = life.current
    if (sending.current || !body || !supabase || !room || msgs === null || !active?.current()) return
    sending.current = true; setBusy(true); setSendError(false)
    const attempt = uncertainSend.current?.body === body ? uncertainSend.current : { id: crypto.randomUUID(), body }
    uncertainSend.current = attempt
    try {
      const result = await supabase.from('chat_messages').insert({ id: attempt.id, room_id: id, sender_id: me.id, body }).select('id, room_id, sender_id, body, created_at').abortSignal(active.signal).single()
      if (!active.current()) return
      let message = result.data as Msg | null
      if (result.error) {
        // A lost acknowledgement may mean the insert already succeeded. Reusing
        // the same message id makes retry idempotent; verify its owned contents.
        const check = await supabase.from('chat_messages').select('id, room_id, sender_id, body, created_at').eq('id', attempt.id).abortSignal(active.signal).maybeSingle()
        if (!active.current()) return
        message = check.data as Msg | null
        if (check.error || !message || message.room_id !== id || message.sender_id !== me.id || message.body !== body) throw result.error
      }
      if (!message) throw new Error('missing_message')
      uncertainSend.current = null; atBottom.current = true; setNewBelow(false); active.receive(message)
      setText(value => value.trim() === body ? '' : value)
      window.dispatchEvent(new Event('th-chat-change'))
    } catch { if (active.current()) setSendError(true) }
    finally { sending.current = false; if (active.current()) setBusy(false) }
  }
  const name = room ? roomName(room, members, staff, me.id, t, b => branches.find(x => x.id === b)?.name ?? b) : ''
  const sub = room?.kind === 'team' ? t('Alle Studios') : room?.kind === 'studio' ? t('Alle im Studio') : members.length > 2 ? t('{n} Personen', { n: members.length }) : ''
  const day = (iso: string) => new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
  if (roomReady && !room) return <div className="chat-app-header px-5"><button onClick={onBack} className="h-11 text-olive-700">{t('Zurück zu den Chats')}</button><p className="mt-4 text-[16px] text-mute">{t('Dieser Chat ist nicht mehr verfügbar oder gerade nicht erreichbar.')}</p></div>
  return (
    <div ref={roomRoot} className="chat-screen h-full min-h-0 flex flex-col">
      <div className="chat-app-header shrink-0 md:pt-3 pb-2 px-3 flex items-center gap-2 bg-paper border-b border-line">
        <button onClick={onBack} className="h-11 px-1 flex items-center gap-0.5 text-sage-800 text-[17px]"><ChevronLeft size={22} />{t('Chats')}</button>
        <div className="flex-1 min-w-0 text-center pr-16"><p className="text-[17px] font-semibold truncate">{name}</p>{sub && <p className="text-[13px] text-mute">{sub}</p>}</div>
      </div>
      <div ref={messagesPane} onScroll={scroll} className="min-h-0 flex-1 overflow-y-auto no-scrollbar bg-sage-50">
        <div className="max-w-[760px] mx-auto px-4 py-4 space-y-1.5">
          {(loadError || connectionError || readError) && <p role="alert" className="mb-3 text-[14px] text-alert">{t(loadError ? 'Nachrichten konnten nicht geladen werden.' : connectionError ? 'Die Chatverbindung wird wiederhergestellt.' : 'Der Lesestatus konnte nicht aktualisiert werden.')} <button onClick={() => void life.current?.reload()} className="underline underline-offset-2">{t('Erneut versuchen')}</button></p>}
          {msgs === null && !loadError && <p className="text-mute text-[15.5px]">{t('Lädt …')}</p>}
          {msgs?.length === 0 && <p className="text-center text-[15.5px] text-mute pt-10">{t('Schreib die erste Nachricht.')}</p>}
          {msgs?.map((m, i) => { const mine = m.sender_id === me.id, s = staff.find(x => x.id === m.sender_id), prev = msgs[i - 1]
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
            const showName = !mine && (newDay || prev?.sender_id !== m.sender_id)
            return <div key={m.id}>
              {newDay && <p className="text-center text-[13px] text-mute py-2">{day(m.created_at)}</p>}
              <div className={`flex items-end gap-2 ${mine ? 'justify-end' : ''} ${showName ? 'pt-2' : ''}`}>
                {!mine && <span className="w-8 shrink-0">{showName && s && <Avatar s={s} photo={s.photo} size="w-8 h-8 text-[12px]" />}</span>}
                <div data-chat-message-id={m.id} className={`max-w-[78%] rounded-[18px] px-3.5 py-2.5 ${mine ? 'bg-olive-700 text-white rounded-br-[6px]' : 'bg-white rounded-bl-[6px]'}`}>
                  {showName && room?.kind !== 'direkt' && <p className="text-[13px] font-semibold text-studio mb-0.5">{s ? `${s.first} ${s.last}` : t('Ehemalige Person')}</p>}
                  <p className="text-[17px] leading-snug whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[12px] mt-1 text-right ${mine ? 'text-white/70' : 'text-mute'}`}>{new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(m.created_at))}</p>
                </div>
              </div>
            </div> })}
          <div ref={end} />
        </div>
      </div>
      {newBelow && <button onClick={() => { atBottom.current = true; setNewBelow(false); scrollInPane(messagesPane.current, end.current, 'end'); life.current?.queueRead() }} className="shrink-0 h-11 bg-sage-100 text-olive-800 text-[14px]">{t('Neue Nachrichten')}</button>}
      <div className="shrink-0 px-3 pt-2 pb-3 md:pb-5 bg-paper border-t border-line">
        {sendError && <p role="alert" className="max-w-[760px] mx-auto mb-2 text-[14px] text-alert">{t('Senden wurde nicht bestätigt. Dein Entwurf bleibt erhalten. Bitte erneut versuchen.')}</p>}
        <div className="max-w-[760px] mx-auto flex items-end gap-2">
          <textarea ref={input} value={text} onChange={e => setText(e.target.value)} rows={1} aria-label={t('Nachricht')} placeholder={t('Nachricht')}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover)').matches) { e.preventDefault(); send() } }}
            className="team-chat-input flex-1 max-h-36 min-h-[46px] rounded-[22px] bg-white px-4 py-3 text-[17px] outline-none resize-none placeholder:text-mute" />
          <button disabled={busy || !text.trim() || !room || msgs === null} onClick={send} aria-label={t('Senden')} className="w-[46px] h-[46px] rounded-full bg-olive-700 text-white flex items-center justify-center disabled:opacity-40 shrink-0"><Send size={18} /></button>
        </div>
      </div>
    </div>
  )
}
