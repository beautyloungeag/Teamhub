import { captureAccountScope, isCurrentAccountScope, onAccountScopeChange, type AccountScope } from './lib/account-scope'
import { scrollInPane } from './lib/mobile-viewport'
import { ViewportOverlay } from './ViewportOverlay'
import { useEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronLeft, ExternalLink, FileSpreadsheet, FileText, Globe, Mail, MessagesSquare, Mic, Paperclip, Phone, Sparkles, Square, SquarePen, Trash2, X } from 'lucide-react'
import { supabase, SUPABASE_URL, SUPABASE_ANON } from './lib/supabase'
import { locale } from './lib/i18n'
import { ContactLocked } from './ContactLock'
import { useApp, isoDay, addDays } from './store'
import { BMark } from './Logo'
import { BenniAvatar } from './BenniOrb'
import { Avatar, ContactRow } from './People'
import { TicketDraft } from './TicketParts'
import { toast } from './Toast'
import { reloadTodos } from './Todos'
import { reloadStandby } from './standby'

// Marc in App und Backoffice: mehrere Chats (parallel, löschbar, Titel vergibt der Server),
// Eingabeleiste mit Dateien, Diktat, Modellwahl und Websuche, Kundenkarte und Lernkarten.

export type Step = { step: string; detail?: string }
type Visit = { date: string; time: string; service: string; staff: string; branch: string }
export type ClientCard = { client_id: string; name: string; since: string; last_visit: string; preferred: string; email: string; phone: string; contact_hidden?: boolean; visits: number; cancelled: number; recent: Visit[]; upcoming: Visit[]; notes: { date: string; text: string }[] }
export type MsgData = {
  sources?: { id: string; title: string }[]; ticket?: { kind: 'Meldung' | 'Idee'; title: string }; card?: ClientCard
  cards?: { title: string; body: string }[]; quiz?: { question: string; options: string[] }; choices?: string[]; reveal?: boolean
  links?: { url: string; title: string }[]; files?: { name: string; kind: 'image' | 'file'; url?: string }[]
  actions?: ChatAction[]
}
// Vorschlag von Marc im Backoffice: erst nach „Ausführen“ wirksam, mit den Rechten der Person (Function assistant, actions.ts)
export type ChatAction = { id: string; kind: string; title: string; lines: string[]; status: 'offen' | 'laeuft' | 'ausgefuehrt' | 'verworfen' | 'fehler'; result?: string }
export type ChatMsg = { id: string; me: boolean; t: string; data: MsgData; at: string }
type Chat = { id: string; title: string; updated: string; msgs: ChatMsg[] | null; loading?: boolean; busy: boolean; steps: Step[] }
type BenniAnswer = MsgData & { ok: boolean; text?: string; message_id?: string; title?: string }
type Tier = 'schnell' | 'standard' | 'stark'
type Attach = { id: string; name: string; kind: 'image' | 'file'; preview?: string; payload: { name: string; mime: string; data?: string; text?: string } }

/* ---------- Zustand ausserhalb der Komponenten: Antworten laufen weiter, auch wenn man den Chat wechselt ---------- */
const S = { owner: '', scopeVersion: 0, chats: [] as Chat[], loaded: false, active: null as string | null, ver: 0, creating: false }
const subs = new Set<() => void>()
// Text drafts stay in this session and belong to one employee/conversation.
// Switching history must never carry an unsent question into another chat.
const drafts = new Map<string, string>()
const bump = () => { S.ver++; subs.forEach(f => f()) }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
function useBenni() { useSyncExternalStore(subscribe, () => S.ver); return captureAccountScope()?.version === S.scopeVersion ? S : { ...S, chats: [], active: null, loaded: false, creating: false } }
let pendingAsk: string | null = null
let chatsVersion = 0
onAccountScopeChange(() => {
  chatsVersion++; drafts.clear(); pendingAsk = null
  S.owner = ''; S.scopeVersion = 0; S.chats = []; S.loaded = false; S.active = null; S.creating = false; bump()
})

const toMsg = (r: { id: string; role: string; text: string; data: MsgData | null; created_at: string }): ChatMsg => ({ id: r.id, me: r.role === 'user', t: r.text, data: r.data ?? {}, at: r.created_at })

async function loadChats(owner: string) {
  const scope = captureAccountScope(owner)
  if (!scope || !supabase || S.loaded) return
  const version = ++chatsVersion
  S.owner = owner; S.scopeVersion = scope.version; S.loaded = true
  const { data, error } = await supabase.from('benni_chats').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(60).abortSignal(scope.signal)
  if (!isCurrentAccountScope(scope) || version !== chatsVersion) return
  if (error) { S.loaded = false; bump(); return }
  const known = new Set(S.chats.map(c => c.id))
  S.chats = [...S.chats, ...(data ?? []).filter(r => !known.has(r.id)).map(r => ({ id: r.id, title: r.title, updated: r.updated_at, msgs: null, busy: false, steps: [] }))]
  bump()
}
async function openChat(id: string | null) {
  const scope = captureAccountScope(S.owner); if (!scope) return
  S.active = id; bump()
  const c = S.chats.find(x => x.id === id)
  if (!c || c.msgs || c.loading || !supabase) return
  c.loading = true; bump()
  const { data, error } = await supabase.from('benni_messages').select('id, role, text, data, created_at').eq('chat_id', c.id).order('created_at').limit(300).abortSignal(scope.signal)
  if (!isCurrentAccountScope(scope) || !S.chats.includes(c)) return
  c.msgs = error ? null : (data ?? []).map(toMsg); c.loading = false; bump()
}
async function deleteChat(id: string) {
  const scope = captureAccountScope(S.owner); if (!scope) return false
  const { error } = await supabase!.from('benni_chats').delete().eq('id', id).abortSignal(scope.signal)
  if (!isCurrentAccountScope(scope)) return false
  if (!error) { S.chats = S.chats.filter(c => c.id !== id); if (S.active === id) S.active = null; bump() }
  return !error
}
/** Neuen Chat öffnen, optional gleich mit einer Frage (z. B. „Mit Marc lernen“ aus dem Onboarding). */
export function openNewBenniChat(question?: string) {
  if (!captureAccountScope()) return
  S.active = null; pendingAsk = question ?? null; bump()
  window.dispatchEvent(new Event('th-benni'))
}

async function sendMessage(owner: string, text: string, files: Attach[], opts: { model: Tier; web: boolean }, failText: string, after: () => void) {
  const scope = captureAccountScope(owner)
  if (!supabase || !scope) return
  S.owner = owner; S.scopeVersion = scope.version
  let chat = S.chats.find(c => c.id === S.active)
  if (!chat) {
    if (S.creating) return
    S.creating = true
    const { data, error } = await supabase.from('benni_chats').insert({ employee_id: owner }).select('id, title, updated_at').abortSignal(scope.signal).single()
    if (!isCurrentAccountScope(scope)) return
    S.creating = false
    if (error || !data) { toast(failText, 'error'); return }
    chat = { id: data.id, title: '', updated: data.updated_at, msgs: [], busy: false, steps: [] }
    S.chats = [chat, ...S.chats]; S.active = chat.id
  }
  if (chat.busy) return
  const c = chat, now = () => new Date().toISOString()
  c.msgs = [...(c.msgs ?? []), { id: 'u' + Date.now(), me: true, t: text, data: files.length ? { files: files.map(f => ({ name: f.name, kind: f.kind, url: f.preview })) } : {}, at: now() }]
  c.busy = true; c.steps = [{ step: 'think' }]; c.updated = now()
  S.chats = [c, ...S.chats.filter(x => x !== c)]; bump()
  const ans: BenniAnswer = await askBenni({ chat_id: c.id, message: text, files: files.map(f => f.payload), model: opts.model, web: opts.web }, e => {
    if (!isCurrentAccountScope(scope) || !S.chats.includes(c)) return
    if ('title' in e && e.title) c.title = e.title; else c.steps = [...c.steps, e as Step]
    bump()
  }, scope).catch(() => ({ ok: false }))
  if (!isCurrentAccountScope(scope) || !S.chats.includes(c)) return
  const { ok, text: answer, message_id, title, ...data } = ans
  void ok
  c.msgs = [...(c.msgs ?? []), { id: message_id ?? 'a' + Date.now(), me: false, t: ans.ok && answer ? answer : failText, data: ans.ok ? data : {}, at: now() }]
  if (title) c.title = title
  c.busy = false; c.steps = []; c.updated = now(); bump()
  after()
}

/** Fragt Marc; meldet Arbeitsschritte und den Chat-Titel, sobald sie da sind (NDJSON-Stream der Function). */
async function askBenni(body: Record<string, unknown>, onEvent: (e: Step | { title: string }) => void, scope: AccountScope | null = captureAccountScope()): Promise<BenniAnswer> {
  if (!isCurrentAccountScope(scope)) return { ok: false }
  const { data: { session } } = await supabase!.auth.getSession()
  if (!session || !isCurrentAccountScope(scope)) return { ok: false }
  const r = await fetch(`${SUPABASE_URL}/functions/v1/assistant`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON}`, apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }), signal: scope.signal,
  })
  if (!isCurrentAccountScope(scope) || !r.ok || !r.body) return { ok: false }
  const reader = r.body.getReader(), dec = new TextDecoder()
  let buf = '', done: BenniAnswer | null = null
  for (;;) {
    const { value, done: end } = await reader.read()
    if (!isCurrentAccountScope(scope)) { await reader.cancel(); return { ok: false } }
    if (value) buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
      if (!line) continue
      try { const o = JSON.parse(line); if (o.done) done = o; else if (o.step || o.title) onEvent(o) } catch { /* Zeile unvollständig */ }
    }
    if (end) break
  }
  return isCurrentAccountScope(scope) ? done ?? { ok: false } : { ok: false }
}

/** Einzelne Frage ohne gespeicherten Chat (z. B. in der Kundenhistorie). */
export async function askBenniOnce(message: string, history: { me: boolean; t: string }[], onStep: (s: Step) => void) {
  const scope = captureAccountScope()
  const r = await askBenni({ message, history }, e => { if (isCurrentAccountScope(scope) && 'step' in e) onStep(e) }, scope).catch(() => ({ ok: false } as BenniAnswer))
  return isCurrentAccountScope(scope) ? { ok: r.ok && !!r.text, text: r.text ?? '' } : { ok: false, text: '' }
}

/* ---------- Dateien ---------- */
const MAX_FILE = 10 * 1024 * 1024
const b64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(b) })
const OFFICE: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
/** Fotos werden verkleinert (max. 1600 px), PDF und Office-Dateien gehen als Datei, Text wird gelesen. */
async function prepareFile(f: File): Promise<Attach | 'size' | 'format'> {
  const name = f.name || 'Datei', id = Math.random().toString(36).slice(2), ext = (name.split('.').pop() ?? '').toLowerCase()
  if (f.type.startsWith('image/')) {
    try {
      const bmp = await createImageBitmap(f)
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
      const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.85))
      if (!blob) return 'format'
      const jpg = name.replace(/\.[^.]+$/, '') + '.jpg'
      return { id, name: jpg, kind: 'image', preview: URL.createObjectURL(blob), payload: { name: jpg, mime: 'image/jpeg', data: await b64(blob) } }
    } catch { return 'format' }
  }
  if (f.size > MAX_FILE) return 'size'
  if (/^text\//.test(f.type) || ['txt', 'csv', 'md', 'json'].includes(ext)) return { id, name, kind: 'file', payload: { name, mime: f.type || 'text/plain', text: (await f.text()).slice(0, 60000) } }
  if (OFFICE[ext]) return { id, name, kind: 'file', payload: { name, mime: OFFICE[ext], data: await b64(f) } }
  return 'format'
}

/* ---------- Diktat: Live-Text alle paar Sekunden, am Ende genauer ---------- */
async function transcribe(blob: Blob, lang: string, fast: boolean, scope: AccountScope | null): Promise<string | null> {
  if (!isCurrentAccountScope(scope)) return null
  const { data: { session } } = await supabase!.auth.getSession()
  if (!session || !isCurrentAccountScope(scope)) return null
  const fd = new FormData()
  fd.append('file', blob, 'diktat.' + (blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'))
  fd.append('lang', lang); if (fast) fd.append('fast', '1')
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON}`, apikey: SUPABASE_ANON }, body: fd, signal: scope.signal })
    const j = await r.json(); return isCurrentAccountScope(scope) && j.ok ? String(j.text ?? '') : null
  } catch { return null }
}
function useDictation(lang: string, onText: (s: string) => void, onError: (key: string) => void) {
  const [scope] = useState(() => captureAccountScope())
  const [state, setState] = useState<'idle' | 'rec' | 'final'>('idle')
  const [live, setLive] = useState(''), [levels, setLevels] = useState<number[]>(() => Array(32).fill(0)), [secs, setSecs] = useState(0)
  const r = useRef<{ rec: MediaRecorder; stream: MediaStream; ctx: AudioContext; chunks: Blob[]; raf: number; timer: number; busy: boolean; sent: number; cancel: boolean; t0: number } | null>(null)
  const cleanup = () => {
    const x = r.current; if (!x) return
    cancelAnimationFrame(x.raf); clearInterval(x.timer); x.stream.getTracks().forEach(tr => tr.stop()); x.ctx.close().catch(() => {}); r.current = null
  }
  useEffect(() => () => { if (r.current) { r.current.cancel = true; try { r.current.rec.stop() } catch { /* schon zu */ } cleanup() } }, [])
  const start = async () => {
    if (state !== 'idle' || !isCurrentAccountScope(scope)) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onError('Diktieren geht in diesem Browser nicht'); return }
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) } catch { onError('Mikrofon ist nicht erlaubt'); return }
    if (!isCurrentAccountScope(scope)) { stream.getTracks().forEach(track => track.stop()); return }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) ?? ''
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(an)
    const x = { rec, stream, ctx, chunks: [] as Blob[], raf: 0, timer: 0, busy: false, sent: 0, cancel: false, t0: Date.now() }
    r.current = x
    rec.ondataavailable = e => { if (e.data.size) x.chunks.push(e.data) }
    rec.onstop = async () => {
      const blob = new Blob(x.chunks, { type: rec.mimeType || type })
      const cancelled = x.cancel
      cleanup()
      if (cancelled) { setState('idle'); setLive(''); return }
      setState('final')
      const text = blob.size > 800 ? await transcribe(blob, lang, false, scope) : ''
      if (!isCurrentAccountScope(scope)) return
      setState('idle'); setLive('')
      if (text) onText(text); else if (text === null) onError('Das Diktat liess sich nicht umwandeln')
    }
    rec.start(1000)
    const buf = new Uint8Array(an.fftSize); let last = 0
    const tick = (now: number) => {
      if (now - last > 60) {
        an.getByteTimeDomainData(buf); let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 5)
        setLevels(l => [...l.slice(1), lvl]); last = now
      }
      x.raf = requestAnimationFrame(tick)
    }
    x.raf = requestAnimationFrame(tick)
    // Live-Text: Stand der Aufnahme mit dem schnellen Modell, nie zwei Anfragen gleichzeitig
    x.timer = window.setInterval(() => {
      const el = Math.round((Date.now() - x.t0) / 1000); setSecs(el)
      if (el >= 180) { stop(); return }
      if (x.busy || x.chunks.length === x.sent || el < 2) return
      x.busy = true; x.sent = x.chunks.length
      transcribe(new Blob(x.chunks, { type: rec.mimeType || type }), lang, true, scope).then(t => { if (isCurrentAccountScope(scope) && t && r.current === x) setLive(t) }).finally(() => { x.busy = false })
    }, 1000)
    setSecs(0); setLive(''); setState('rec')
  }
  const stop = (cancel = false) => { const x = r.current; if (!x) return; x.cancel = cancel; try { x.rec.stop() } catch { cleanup(); setState('idle') } }
  return { state, live, levels, secs, start, stop }
}

/* ---------- Anzeige ---------- */
function useStepLabel() {
  const { t } = useApp()
  const day = (d?: string) => {
    if (!d) return ''
    const today = isoDay(), tomorrow = addDays(1)
    if (d === today) return t('heute')
    if (d === tomorrow) return t('morgen')
    return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(d + 'T12:00:00Z'))
  }
  return (s: Step) => {
    switch (s.step) {
      case 'think': return t('Denkt nach')
      case 'calendar': return t('Schaut in deinen Kalender · {d}', { d: day(s.detail) })
      case 'week': return t('Schaut in deinen Dienstplan')
      case 'studio': return t('Schaut in den Studiokalender · {d}', { d: day(s.detail) })
      case 'client': return s.detail ? t('Sucht „{name}“ in Phorest', { name: s.detail }) : t('Liest die Kundenhistorie')
      case 'services': return t('Liest die Behandlungen')
      case 'phorest': return t('Fragt Phorest ab')
      case 'search': return t('Sucht im Wissen')
      case 'article': return s.detail ? t('Liest „{title}“', { title: s.detail }) : t('Liest einen Artikel')
      case 'news': return t('Liest die News')
      case 'onboarding': return t('Prüft dein Onboarding')
      case 'step_done': return t('Hakt den Schritt ab')
      case 'todo': return t('Legt ein To-do an')
      case 'backoffice': return t('Schaut im Backoffice nach')
      case 'web': return s.detail ? t('Sucht im Web · {q}', { q: s.detail }) : t('Sucht im Web')
      case 'write': return t('Schreibt die Antwort')
      default: return t('Denkt nach')
    }
  }
}

/** Kugel, aktueller Schritt (schimmernd) und erledigte Schritte darunter. */
export function BenniWorking({ steps }: { steps: Step[] }) {
  const label = useStepLabel()
  const labels = steps.map(label).filter((x, i, a) => x && x !== a[i - 1])
  const current = labels[labels.length - 1] ?? label({ step: 'think' })
  const past = labels.slice(0, -1).slice(-3)
  return (
    <div className="flex gap-2.5 items-start" aria-live="polite">
      <BMark className="w-7 h-7" working />
      <div className="min-w-0 pt-1">
        <p className="benni-shimmer text-[15.5px] leading-tight">{current} …</p>
        {past.length > 0 && <ul className="mt-2 space-y-1">{past.map((p, i) => <li key={i} className="flex items-center gap-1.5 text-[13px] text-mute"><Check size={12} strokeWidth={2.4} className="text-ok shrink-0" />{p}</li>)}</ul>}
      </div>
    </div>
  )
}

/** Antworttext: Absätze, Listen mit „- “ und **fett**. */
export function BenniText({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) { blocks.push({ list: false, lines: [] }); continue }
    const isItem = /^\s*[-•]\s+/.test(line)
    const last = blocks[blocks.length - 1]
    if (last && last.list === isItem && last.lines.length) last.lines.push(isItem ? line.replace(/^\s*[-•]\s+/, '') : line)
    else blocks.push({ list: isItem, lines: [isItem ? line.replace(/^\s*[-•]\s+/, '') : line] })
  }
  return <div className="space-y-2">{blocks.filter(b => b.lines.length).map((b, i) => b.list
    ? <ul key={i} className="space-y-1">{b.lines.map((l, j) => <li key={j} className="flex gap-2"><span className="mt-[9px] w-1 h-1 rounded-full bg-current opacity-50 shrink-0" /><span>{inline(l)}</span></li>)}</ul>
    : <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>)}</div>
}

const hhmm = (iso: string) => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const shortDate = (d: string) => d ? new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: '2-digit' }).format(new Date(d + 'T12:00:00Z')) : ''
const telOf = (p: string) => { const d = p.replace(/[^\d+]/g, ''); return d.startsWith('+') ? d : /^(41|49|33|39|43)\d{8,}$/.test(d) ? '+' + d : d.startsWith('00') ? '+' + d.slice(2) : d }
const showTel = (p: string) => { const d = telOf(p); const m = d.match(/^\+(41)(\d{2})(\d{3})(\d{2})(\d{2})$/); return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : d.replace(/^(\+\d{2})(\d{3})(\d+)$/, '$1 $2 $3') }

/** Kundenkarte aus Phorest: Kontakt, nächste Termine, letzte Besuche, Notizen. */
function ClientCardView({ c, onOpen }: { c: ClientCard; onOpen?: (id: string) => void }) {
  const { t } = useApp()
  const Sec = ({ title, children }: { title: string; children: ReactNode }) => <div className="px-4 py-3 border-t border-line"><p className="text-[12.5px] text-mute mb-1.5">{title}</p>{children}</div>
  const visit = (v: Visit, i: number) => <li key={i} className="flex gap-3 text-[15px] leading-snug"><span className="w-[62px] shrink-0 text-mute tabular-nums">{shortDate(v.date)}</span><span className="min-w-0">{v.service}<span className="text-mute">{[v.time, v.staff, v.branch].filter(Boolean).length ? ` · ${[v.time, v.staff].filter(Boolean).join(' · ')}` : ''}</span></span></li>
  const ini = c.name.split(/\s+/).map(x => x[0] ?? '').slice(0, 2).join('').toUpperCase()
  return (
    <div className="mt-2 rounded-[16px] bg-white border border-line/80 overflow-hidden">
      <div className="px-4 py-3.5 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-sage-100 text-sage-800 flex items-center justify-center text-[15.5px] font-medium shrink-0">{ini}</span>
        <div className="min-w-0">
          <p className="text-[17.5px] font-medium truncate">{c.name}</p>
          <p className="text-[14px] text-mute">{[c.since && t('Kunde seit {d}', { d: shortDate(c.since) }), t('{n} Besuche', { n: c.visits }), c.preferred && t('bevorzugt {name}', { name: c.preferred })].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {c.contact_hidden && <ContactLocked className="border-t border-line" />}
      {(c.phone || c.email) && <div className="border-t border-line divide-y divide-line">
        {c.phone && <ContactRow label={t('Telefon')} value={showTel(c.phone)} href={`tel:${telOf(c.phone)}`} icon={<Phone size={15} />} action={t('Anrufen')} />}
        {c.email && <ContactRow label={t('E-Mail')} value={c.email} href={`mailto:${c.email}`} icon={<Mail size={15} />} action={t('E-Mail schreiben')} />}
      </div>}
      {c.upcoming.length > 0 && <Sec title={t('Nächste Termine')}><ul className="space-y-1">{c.upcoming.map(visit)}</ul></Sec>}
      {c.recent.length > 0 && <Sec title={t('Letzte Besuche')}><ul className="space-y-1">{c.recent.map(visit)}</ul></Sec>}
      {c.notes.length > 0 && <Sec title={t('Notizen')}><ul className="space-y-1.5">{c.notes.map((n, i) => <li key={i} className="text-[15px] leading-snug"><span className="text-mute tabular-nums mr-2">{n.date ? shortDate(n.date) : t('Kundennotiz')}</span>{n.text}</li>)}</ul></Sec>}
      {onOpen && <button onClick={() => onOpen(c.client_id)} className="w-full border-t border-line px-4 py-3 text-[15px] text-sage-800 flex items-center justify-between hover:bg-sage-50">{t('Ganze Historie')}<ArrowUpRight size={15} /></button>}
    </div>
  )
}

/** Lernkarte; bis zur Auflösung der Kontrollfragen verdeckt (Weichzeichner mit Funkeln). */
function LessonCard({ c, i, n, hidden }: { c: { title: string; body: string }; i: number; n: number; hidden: boolean }) {
  const { t } = useApp()
  const spots = [[14, 22], [72, 18], [38, 58], [86, 64], [22, 78], [58, 34], [64, 82]]
  return (
    <div className="relative rounded-[16px] bg-white border border-line/80 overflow-hidden">
      <div className={`px-4 py-3.5 transition-[filter,opacity] duration-700 ${hidden ? 'blur-[7px] opacity-70 select-none' : ''}`} aria-hidden={hidden}>
        <p className="rubric text-olive-700">{t('Lernkarte {i} von {n}', { i: i + 1, n })}</p>
        <p className="mt-1.5 text-[17.5px] font-medium leading-snug">{c.title}</p>
        <div className="mt-1.5 text-[14.5px] leading-relaxed text-ink/85"><BenniText text={c.body} /></div>
      </div>
      <AnimatePresence>
        {hidden && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0 flex items-center justify-center">
          {spots.map(([x, y], k) => <Sparkles key={k} size={k % 2 ? 11 : 14} className="sparkle absolute text-brass" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${k * 0.35}s` }} />)}
          <span className="relative h-8 px-3 rounded-full bg-white/85 backdrop-blur-sm text-[14px] text-ink/80 flex items-center gap-1.5 shadow-sm"><Sparkles size={13} className="text-brass" />{t('Verdeckt bis nach der Kontrollfrage')}</span>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}

function QuizCard({ q, chosen, active, onAnswer }: { q: { question: string; options: string[] }; chosen?: string; active: boolean; onAnswer: (s: string) => void }) {
  const { t } = useApp()
  return (
    <div className="mt-2 rounded-[16px] bg-olive-800 text-white px-4 py-3.5">
      <p className="rubric text-sage-200">{t('Kontrollfrage')}</p>
      <p className="mt-1.5 text-[17.5px] font-medium leading-snug">{q.question}</p>
      {q.options.length > 0 ? <div className="mt-3 space-y-2">{q.options.map(o => (
        <button key={o} disabled={!active} onClick={() => onAnswer(o)} className={`w-full text-left rounded-[12px] px-3.5 py-2.5 text-[14.5px] leading-snug transition ${chosen === o ? 'bg-white text-ink' : 'bg-white/10'} ${active ? 'hover:bg-white/20' : 'cursor-default'} ${!active && chosen !== o ? 'opacity-60' : ''}`}>{o}</button>
      ))}</div> : active && <p className="mt-2 text-[14.5px] text-sage-200">{t('Schreib deine Antwort unten ins Feld.')}</p>}
    </div>
  )
}

// Welche Lernkarten gerade verdeckt sind: ab der ersten Kontrollfrage bis zur Auflösung (reveal)
function hiddenCards(msgs: ChatMsg[]) {
  let section: string[] = [], quiz = false
  for (const m of msgs) {
    if (m.me) continue
    if (m.data.reveal) { section = []; quiz = false }
    if (m.data.cards?.length) { if (quiz) { section = []; quiz = false } section.push(m.id) }
    if (m.data.quiz) quiz = true
  }
  return new Set(quiz ? section : [])
}

const bubble = (variant: 'app' | 'panel') => `rounded-[16px] rounded-tl-[6px] px-4 py-3 text-[17px] leading-snug ${variant === 'app' ? 'bg-white' : 'bg-sage-50'}`

function BenniMessage({ m, next, latest, busy, hidden, variant, send, onOpenArticle, onOpenClient }: {
  m: ChatMsg; next?: ChatMsg; latest: boolean; busy: boolean; hidden: boolean; variant: 'app' | 'panel'; send: (s: string) => void
  onOpenArticle?: (id: string) => void; onOpenClient?: (id: string) => void
}) {
  const { t, addTicket } = useApp()
  const d = m.data, cards = d.cards ?? []
  return (
    <div className="flex gap-2.5 items-start">
      <BenniAvatar className="w-7 h-7 mt-0.5" />
      <div className="min-w-0 flex-1 max-w-[560px]">
        <p className="text-[13px] text-mute mb-1"><span className="text-ink/80 font-medium">Marc</span> · {hhmm(m.at)}</p>
        {cards.length > 0 && <div className="space-y-2 mb-2">{cards.map((c, i) => <LessonCard key={i} c={c} i={i} n={cards.length} hidden={hidden} />)}</div>}
        {m.t && <div className={bubble(variant)}><BenniText text={m.t} />
          {!hidden && !d.quiz && d.sources?.map(s => onOpenArticle
            ? <button key={s.id} onClick={() => onOpenArticle(s.id)} className="mt-2 text-[14.5px] text-sage-800 flex items-center gap-1"><BookOpen size={14} />{s.title}<ArrowUpRight size={13} /></button>
            : <p key={s.id} className="mt-2 text-[14.5px] text-mute flex items-center gap-1"><BookOpen size={14} />{s.title}</p>)}
          {d.links?.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="mt-2 text-[14.5px] text-sage-800 flex items-center gap-1 min-w-0"><ExternalLink size={13} className="shrink-0" /><span className="truncate">{l.title}</span></a>)}
          {d.ticket && <TicketDraft kind={d.ticket.kind} title={d.ticket.title} onSend={() => addTicket({ kind: d.ticket!.kind, title: d.ticket!.title, viaAI: true })} />}
        </div>}
        {d.actions?.map(a => <ActionCard key={a.id} a={a} messageId={m.id} />)}
        {d.quiz && <QuizCard q={d.quiz} chosen={next?.me ? next.t : undefined} active={latest && !busy} onAnswer={send} />}
        {d.card && <ClientCardView c={d.card} onOpen={onOpenClient} />}
        {latest && !busy && (d.choices?.length ?? 0) > 0 && <div className="mt-2.5 flex flex-wrap gap-2">{d.choices!.map(c => <button key={c} onClick={() => send(c)} className="h-9 px-3.5 rounded-full bg-white border border-line text-[15.5px] hover:border-sage-400 transition">{c}</button>)}</div>}
        {!m.t && !cards.length && !d.quiz && !d.card && <div className={bubble(variant)}>{t('Ich bin gerade nicht erreichbar. Bitte versuche es gleich noch einmal.')}</div>}
      </div>
    </div>
  )
}

function UserMessage({ m }: { m: ChatMsg }) {
  const { me, photo } = useApp()
  const files = m.data.files ?? []
  return (
    <div className="flex gap-2.5 items-start justify-end">
      <div className="min-w-0 max-w-[85%] flex flex-col items-end">
        <p className="text-[13px] text-mute mb-1">{hhmm(m.at)} · <span className="text-ink/80 font-medium">{me.first}</span></p>
        {files.length > 0 && <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">{files.map((f, i) => f.url
          ? <img key={i} src={f.url} alt={f.name} className="h-24 max-w-[180px] rounded-[12px] object-cover" />
          : <span key={i} className="h-9 px-3 rounded-[10px] bg-white border border-line text-[14.5px] flex items-center gap-1.5 max-w-[220px]">{fileIcon(f.name)}<span className="truncate">{f.name}</span></span>)}</div>}
        {m.t && <div className="rounded-[16px] rounded-tr-[6px] px-4 py-3 text-[17px] leading-snug bg-olive-700 text-white whitespace-pre-wrap break-words">{m.t}</div>}
      </div>
      <Avatar s={me} photo={photo} size="w-7 h-7 text-[12px] mt-0.5" />
    </div>
  )
}
const fileIcon = (name: string) => /\.(xlsx|csv)$/i.test(name) ? <FileSpreadsheet size={14} className="text-olive-700 shrink-0" /> : <FileText size={14} className="text-olive-700 shrink-0" />

/* ---------- Eingabeleiste ---------- */
const TIERS: { k: Tier; name: string; hint: string; model: string }[] = [
  { k: 'schnell', name: 'Schnell', hint: 'Kurze Fragen, antwortet sofort', model: 'GPT-5.4 mini' },
  { k: 'standard', name: 'Standard', hint: 'Für den Alltag', model: 'GPT-5.6' },
  { k: 'stark', name: 'Gründlich', hint: 'Knifflige Fragen, dauert etwas länger', model: 'GPT-6.1' },
]
let tierPref: Tier = (() => { try { const v = localStorage.getItem('th-benni-model'); return v === 'schnell' || v === 'stark' ? v : 'standard' } catch { return 'standard' } })()

function Composer({ busy, variant, onSend, draftKey }: { busy: boolean; variant: 'app' | 'panel'; draftKey: string; onSend: (text: string, files: Attach[], opts: { model: Tier; web: boolean }) => void }) {
  const { t, lang, employee } = useApp()
  const [scope] = useState(() => captureAccountScope(employee.id))
  const [v, setV] = useState(() => drafts.get(draftKey) ?? ''), [files, setFiles] = useState<Attach[]>([]), [tier, setTier] = useState<Tier>(tierPref), [web, setWeb] = useState(false), [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!isCurrentAccountScope(scope)) return
    if (v) { drafts.set(draftKey, v); if (drafts.size > 20) drafts.delete(drafts.keys().next().value!) }
    else drafts.delete(draftKey)
  }, [draftKey, v])
  const area = useRef<HTMLTextAreaElement>(null), pick = useRef<HTMLInputElement>(null)
  // Nach dem Diktat: Text zum Bearbeiten ins Feld (Stopp) oder direkt senden (Pfeil)
  const after = useRef<'edit' | 'send'>('edit'), live = useRef({ v, files, tier, web })
  live.current = { v, files, tier, web }
  const dict = useDictation(lang.toLowerCase(), text => {
    const cur = live.current, full = (cur.v.trim() ? cur.v.trimEnd() + ' ' : '') + text
    if (after.current === 'send' && !busy) { onSend(full.trim(), cur.files, { model: cur.tier, web: cur.web }); setV(''); setFiles([]) }
    else { setV(full); setTimeout(() => { const a = area.current; if (a) { a.focus(); a.setSelectionRange(a.value.length, a.value.length) } }, 30) }
  }, k => toast(t(k), 'error'))
  useEffect(() => { const a = area.current; if (!a) return; a.style.height = 'auto'; a.style.height = Math.min(a.scrollHeight, 168) + 'px' }, [v, dict.state])
  const add = async (list: FileList | File[]) => {
    for (const f of [...list].slice(0, 4 - files.length)) {
      const r = await prepareFile(f)
      if (!isCurrentAccountScope(scope)) { if (typeof r !== 'string' && r.preview) URL.revokeObjectURL(r.preview); return }
      if (r === 'size') toast(t('Datei ist grösser als 10 MB'), 'error')
      else if (r === 'format') toast(t('Bitte als Foto, PDF, Word (.docx), Excel (.xlsx) oder Text anhängen'), 'error')
      else setFiles(x => [...x, r])
    }
  }
  const send = () => {
    if (!isCurrentAccountScope(scope) || busy || dict.state !== 'idle' || (!v.trim() && !files.length)) return
    onSend(v.trim(), files, { model: tier, web }); setV(''); setFiles([])
  }
  const setModel = (k: Tier) => { setTier(k); tierPref = k; setMenu(false); try { localStorage.setItem('th-benni-model', k) } catch { /* privat */ } }
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  const onPaste = (e: ClipboardEvent) => { if (e.clipboardData.files.length) { e.preventDefault(); add(e.clipboardData.files) } }
  const onDrop = (e: DragEvent) => { if (e.dataTransfer.files.length) { e.preventDefault(); add(e.dataTransfer.files) } }
  const cur = TIERS.find(x => x.k === tier)!
  const chip = 'h-8 px-2.5 rounded-full text-[14.5px] flex items-center gap-1.5 transition'
  return (
    <div onDragOver={e => e.preventDefault()} onDrop={onDrop} className={`relative rounded-[20px] bg-white ${variant === 'app' ? 'shadow-[0_1px_2px_rgba(29,34,28,.06),0_8px_24px_-12px_rgba(29,34,28,.18)]' : 'border border-line'}`}>
      {files.length > 0 && <div className="chat-composer-attachments px-3 pt-3 flex flex-wrap gap-2">{files.map(f => (
        <span key={f.id} className="relative group">
          {f.preview ? <img src={f.preview} alt="" className="w-12 h-12 rounded-[10px] object-cover" />
            : <span className="h-12 px-3 rounded-[10px] bg-sage-50 text-[14.5px] flex items-center gap-2 max-w-[200px]">{fileIcon(f.name)}<span className="truncate">{f.name}</span></span>}
          <button onClick={() => setFiles(x => x.filter(y => y.id !== f.id))} aria-label={t('Entfernen')} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-white flex items-center justify-center"><X size={11} /></button>
        </span>))}</div>}
      {dict.state === 'idle' ? (
        <textarea ref={area} rows={1} aria-label={t('Frag Marc …')} value={v} onChange={e => setV(e.target.value)} onPaste={onPaste}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
          placeholder={t('Frag Marc …')} className="chat-composer-input block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[17px] leading-[22px] outline-none placeholder:text-mute max-h-[168px]" />
      ) : (
        <div className="px-4 pt-3.5 pb-1 min-h-[36px] text-[17px] leading-[22px]" aria-live="polite">
          {v.trim() && <span>{v.trim()} </span>}
          {dict.live ? <span className="text-ink/60">{dict.live}</span> : <span className="text-mute">{dict.state === 'final' ? t('Schreibt den Text …') : t('Ich höre zu …')}</span>}
          {dict.state === 'rec' && <span className="inline-block w-[2px] h-[17px] -mb-[3px] ml-0.5 bg-olive-700 animate-pulse" />}
        </div>
      )}
      <div className="chat-composer-tools px-2 pb-2 pt-1 flex items-center gap-1">
        {dict.state === 'idle' ? <>
          <input ref={pick} type="file" multiple hidden accept="image/*,.pdf,.docx,.xlsx,.pptx,.csv,.txt" onChange={e => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
          <button onClick={() => pick.current?.click()} title={t('Datei oder Foto anhängen')} aria-label={t('Datei oder Foto anhängen')} className="w-8 h-8 rounded-full text-mute hover:text-ink hover:bg-sage-50 flex items-center justify-center"><Paperclip size={17} /></button>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className={`${chip} text-ink/75 hover:bg-sage-50`} aria-expanded={menu}>{t(cur.name)}<ChevronDown size={13} className="text-mute" /></button>
            {menu && <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="mobile-model-menu absolute z-20 bottom-10 left-0 w-[264px] rounded-[14px] bg-white border border-line shadow-[0_12px_32px_-12px_rgba(29,34,28,.25)] p-1.5">
                {TIERS.map(x => <button key={x.k} onClick={() => setModel(x.k)} className="w-full text-left rounded-[10px] px-3 py-2 hover:bg-sage-50 flex items-start gap-2">
                  <span className="flex-1 min-w-0"><span className="block text-[15.5px]">{t(x.name)} <span className="text-[13px] text-mute">{x.model}</span></span><span className="block text-[13px] text-mute">{t(x.hint)}</span></span>
                  {x.k === tier && <Check size={15} className="text-olive-700 mt-1 shrink-0" />}
                </button>)}
              </div>
            </>}
          </div>
          <button onClick={() => setWeb(!web)} aria-pressed={web} title={t('Websuche')} className={`${chip} ${web ? 'bg-sage-100 text-olive-800' : 'text-ink/75 hover:bg-sage-50'}`}><Globe size={14} />{t('Web')}</button>
          <span className="flex-1" />
          <button onClick={() => { after.current = 'edit'; dict.start() }} title={t('Diktieren')} aria-label={t('Diktieren')} className="w-8 h-8 rounded-full text-mute hover:text-ink hover:bg-sage-50 flex items-center justify-center"><Mic size={17} /></button>
          <button onClick={send} disabled={busy || (!v.trim() && !files.length)} aria-label={t('Senden')} className="w-8 h-8 rounded-full bg-olive-700 text-white flex items-center justify-center disabled:bg-sage-200 transition"><ArrowUp size={17} strokeWidth={2.2} /></button>
        </> : <>
          <button onClick={() => dict.stop(true)} disabled={dict.state !== 'rec'} title={t('Abbrechen')} aria-label={t('Abbrechen')} className="w-8 h-8 rounded-full text-mute hover:text-ink hover:bg-sage-50 flex items-center justify-center disabled:opacity-40"><X size={17} /></button>
          <div className="flex-1 h-8 flex items-center justify-center gap-[3px] overflow-hidden" aria-hidden="true">
            {dict.levels.map((l, i) => <span key={i} className="w-[3px] rounded-full bg-olive-700/70 transition-[height] duration-75" style={{ height: `${Math.max(3, l * 26)}px` }} />)}
          </div>
          <span className="text-[13px] text-mute tabular-nums w-9 text-right">{Math.floor(dict.secs / 60)}:{String(dict.secs % 60).padStart(2, '0')}</span>
          <button onClick={() => { after.current = 'edit'; dict.stop() }} disabled={dict.state !== 'rec'} title={t('Diktat beenden und Text bearbeiten')} className="h-8 pl-2.5 pr-3 rounded-full bg-sage-50 hover:bg-sage-100 text-[14.5px] text-ink/80 flex items-center gap-1.5 disabled:opacity-50 transition"><Square size={11} fill="currentColor" strokeWidth={0} />{t('Stopp')}</button>
          <button onClick={() => { after.current = 'send'; dict.stop() }} disabled={dict.state !== 'rec' || busy} title={t('Diktat beenden und senden')} aria-label={t('Diktat beenden und senden')} className="w-8 h-8 rounded-full bg-olive-700 text-white flex items-center justify-center disabled:opacity-50"><ArrowUp size={17} strokeWidth={2.2} /></button>
        </>}
      </div>
    </div>
  )
}

/* ---------- Chatliste ---------- */
function ChatList({ onPicked }: { onPicked?: () => void }) {
  const { t } = useApp()
  const st = useBenni()
  const [armed, setArmed] = useState<string | null>(null)
  useEffect(() => { if (!armed) return; const h = setTimeout(() => setArmed(null), 5000); return () => clearTimeout(h) }, [armed])
  if (!st.chats.length) return <p className="px-3 py-2 text-[14.5px] text-mute">{t('Noch keine Chats.')}</p>
  // Gruppen wie in ChatGPT: Heute, Gestern, Letzte 7 Tage, Älter
  const today = isoDay(), yesterday = addDays(-1), week = addDays(-7)
  const groupOf = (iso: string) => { const d = isoDay(new Date(iso)); return d === today ? 'Heute' : d === yesterday ? 'Gestern' : d >= week ? 'Letzte 7 Tage' : 'Älter' }
  const groups = ['Heute', 'Gestern', 'Letzte 7 Tage', 'Älter'].map(g => ({ g, list: st.chats.filter(c => groupOf(c.updated) === g) })).filter(x => x.list.length)
  return (
    <div className="space-y-4">{groups.map(({ g, list }) => (
      <div key={g}>
        <p className="px-3 pb-1 text-[12.5px] text-mute">{t(g)}</p>
        <ul className="space-y-px">{list.map(c => {
          const on = c.id === st.active
          return (
            <li key={c.id} className={`group relative flex items-center rounded-[10px] transition ${on ? 'bg-sage-100' : 'hover:bg-sage-50'}`}>
              <button onClick={() => { openChat(c.id); onPicked?.() }} className="flex-1 min-w-0 text-left pl-3 pr-2 h-10 flex items-center gap-2">
                {c.busy && <span className="w-1.5 h-1.5 rounded-full bg-olive-700 animate-pulse shrink-0" aria-label={t('Marc arbeitet …')} />}
                <span className={`truncate text-[15.5px] ${on ? 'text-ink' : 'text-ink/80'}`}>{c.title || t('Neuer Chat')}</span>
              </button>
              {armed === c.id
                ? <button onClick={async () => { setArmed(null); const ok = await deleteChat(c.id); toast(ok ? t('Chat gelöscht') : t('Löschen hat nicht geklappt'), ok ? 'ok' : 'error') }} className="mr-1.5 h-7 px-2.5 rounded-full bg-alert/10 text-alert text-[13px] shrink-0">{t('Löschen')}</button>
                : <button onClick={() => setArmed(c.id)} aria-label={t('Chat löschen')} title={t('Chat löschen')} className="mr-1 w-8 h-8 rounded-full text-mute hover:text-alert flex items-center justify-center shrink-0 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"><Trash2 size={14} /></button>}
            </li>
          )
        })}</ul>
      </div>
    ))}</div>
  )
}

/* ---------- Ganze Ansicht ---------- */
const IDEAS = ['Was steht heute bei mir an?', 'Lass uns mit dem Onboarding weiterlernen.', 'Wer arbeitet morgen im Studio?', 'Das Wachsgerät in Kabine 3 ist kaputt']

export function BenniChat({ variant = 'app', onOpenArticle, onOpenClient, onClose, onBack }: { variant?: 'app' | 'panel'; onOpenArticle?: (id: string) => void; onOpenClient?: (id: string) => void; onClose?: () => void; onBack?: () => void }) {
  const { employee, me, t, reload } = useApp()
  const st = useBenni()
  const [drawer, setDrawer] = useState(false)
  const end = useRef<HTMLDivElement>(null), messagesPane = useRef<HTMLDivElement>(null)
  const chat = st.chats.find(c => c.id === st.active) ?? null
  const msgs = chat?.msgs ?? []
  useEffect(() => { loadChats(employee.id) }, [employee.id, st.loaded])
  const send = (text: string, files: Attach[] = [], opts = { model: tierPref, web: false }) =>
    sendMessage(employee.id, text, files, opts, t('Ich bin gerade nicht erreichbar. Bitte versuche es gleich noch einmal.'), () => { reload(); reloadTodos() })
  // Frage aus dem Onboarding („Mit Marc lernen“)
  useEffect(() => { if (pendingAsk) { const q = pendingAsk; pendingAsk = null; send(q) } }, [st.ver]) // eslint-disable-line react-hooks/exhaustive-deps
  // Neue Antwort: Frage und Antwortanfang zeigen (lange Antworten liest man von oben); sonst ans Ende
  useEffect(() => {
    const last = msgs[msgs.length - 1], q = msgs[msgs.length - 2]
    if (last && !last.me && q?.me && !chat?.busy) {
      const question = document.getElementById('bm-' + q.id), pane = messagesPane.current
      const target = question && pane && question.getBoundingClientRect().height > pane.clientHeight * .6 ? document.getElementById('bm-' + last.id) : question
      scrollInPane(pane, target, 'start', true)
    }
    else scrollInPane(messagesPane.current, end.current, 'end', true)
  }, [st.active, msgs.length, chat?.steps.length, chat?.busy, chat?.loading]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pane = messagesPane.current
    if (!pane) return
    let height = pane.clientHeight
    const observer = new ResizeObserver(() => { if (Math.abs(height - pane.clientHeight) > 2) { height = pane.clientHeight; scrollInPane(pane, end.current, 'end') } })
    observer.observe(pane)
    return () => observer.disconnect()
  }, [variant])
  const hidden = hiddenCards(msgs)
  const lastA = [...msgs].reverse().find(m => !m.me)
  const title = chat ? chat.title || t('Neuer Chat') : t('Neuer Chat')

  const body = (
    <>
      {!chat ? (
        <div className={variant === 'app' ? 'pt-6 md:pt-0 md:text-center' : 'pt-2'}>
          <BMark className={variant === 'app' ? 'w-12 h-12' : 'w-10 h-10'} />
          <h1 className={`mt-5 leading-tight ${variant === 'app' ? 'text-[28px]' : 'text-[22px]'}`}>{t('Hallo {name}, wie kann ich helfen?', { name: me.first })}</h1>
          <p className="mt-1.5 text-[14.5px] text-mute">{t('Termine, Kunden, Wissen, Dateien: frag einfach.')}</p>
          <div className={`mt-6 rounded-[16px] divide-y divide-line ${variant === 'app' ? 'bg-white md:hidden' : 'border border-line'}`}>{IDEAS.map(i => <button key={i} onClick={() => send(t(i))} className="w-full text-left px-4 py-3.5 text-[17px] flex items-center gap-3"><span className="flex-1">{t(i)}</span><ArrowUpRight size={16} className="text-sage-400 shrink-0" /></button>)}</div>
          {variant === 'app' && <div className="hidden md:flex mt-7 flex-wrap justify-center gap-2">{IDEAS.map(i => <button key={i} onClick={() => send(t(i))} className="h-9 px-3.5 rounded-full bg-white border border-line text-[15px] text-ink/80 hover:border-sage-400 hover:text-ink transition">{t(i)}</button>)}</div>}
        </div>
      ) : chat.loading ? <p className="pt-6 text-mute text-[15.5px]">{t('Lädt …')}</p> : (
        <div className="pt-2 space-y-5">
          {msgs.map((m, i) => <div key={m.id} id={'bm-' + m.id} className="scroll-mt-4">{m.me ? <UserMessage m={m} /> : <BenniMessage m={m} next={msgs[i + 1]} latest={m === lastA && i === msgs.length - 1} busy={chat.busy} hidden={hidden.has(m.id)} variant={variant} send={s => send(s)} onOpenArticle={onOpenArticle} onOpenClient={onOpenClient} />}</div>)}
          {chat.busy && <BenniWorking steps={chat.steps} />}
        </div>
      )}
      <div ref={end} className="h-1" />
    </>
  )
  const draftKey = employee.id + ':' + (chat?.id ?? 'new')
  const composer = <Composer key={draftKey} draftKey={draftKey} busy={!!chat?.busy} variant={variant} onSend={(text, files, opts) => send(text, files, opts)} />
  const newBtn = <button onClick={() => openChat(null)} title={t('Neuer Chat')} aria-label={t('Neuer Chat')} className="w-9 h-9 rounded-full text-ink/70 hover:bg-sage-100 flex items-center justify-center shrink-0"><SquarePen size={17} /></button>

  if (variant === 'panel') return (
    <aside className="w-[400px] shrink-0 border-l border-line flex flex-col bg-white relative">
      <div className="h-16 px-3 flex items-center gap-1 border-b border-line">
        <button onClick={() => setDrawer(!drawer)} className="flex-1 min-w-0 h-10 px-2 rounded-[10px] hover:bg-sage-50 flex items-center gap-2 text-left" aria-expanded={drawer}>
          <BMark className="w-6 h-6" /><span className="min-w-0 truncate font-medium text-[17px]">{title}</span><ChevronDown size={15} className="text-mute shrink-0" />
        </button>
        {newBtn}
        {onClose && <button onClick={onClose} aria-label={t('Schliessen')} className="w-9 h-9 rounded-full hover:bg-sage-50 flex items-center justify-center"><X size={17} /></button>}
      </div>
      {drawer && <div className="absolute top-16 inset-x-0 bottom-0 z-20 bg-white p-3 overflow-y-auto no-scrollbar"><ChatList onPicked={() => setDrawer(false)} /></div>}
      <div ref={messagesPane} className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 py-4">{body}</div>
      <div className="p-3 border-t border-line">{composer}</div>
    </aside>
  )

  const fresh = !chat
  return (
    <div className="chat-screen flex h-full min-h-0 overflow-hidden">
      {/* Desktop: Chats als eigene Spalte, bündig an der Navigation */}
      <aside className="hidden md:flex w-[260px] shrink-0 flex-col bg-white border-r border-line">
        <div className="h-[60px] shrink-0 pl-5 pr-3 flex items-center justify-between border-b border-line/70">
          <p className="text-[17px] font-medium">{t('Chats')}</p>
          <button onClick={() => openChat(null)} className="h-9 px-3 rounded-[10px] bg-sage-50 hover:bg-sage-100 text-[15px] flex items-center gap-1.5 transition"><SquarePen size={15} />{t('Neuer Chat')}</button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-3"><ChatList /></div>
      </aside>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="chat-app-header shrink-0 md:pt-0 h-auto md:h-[60px] px-3 md:px-8 flex items-center gap-1 md:border-b md:border-line/70">
          {/* Aus der Chat-Liste geöffnet: zurück zu den Team-Chats, Marcs eigene Gespräche heissen dann „Verlauf“ */}
          {onBack && <button onClick={onBack} className="h-10 pl-0.5 pr-1 flex items-center gap-0.5 text-sage-800 text-[17px]"><ChevronLeft size={22} />{t('Chats')}</button>}
          <button onClick={() => setDrawer(true)} className="md:hidden h-9 px-2.5 rounded-full hover:bg-sage-100 flex items-center gap-1.5 text-[15.5px] text-ink/80"><MessagesSquare size={17} />{onBack ? t('Verlauf') : t('Chats')}</button>
          <p className="flex-1 min-w-0 truncate text-center md:text-left text-[15.5px] text-mute md:text-[17px] md:text-ink md:font-medium">{chat ? title : <span className="hidden md:inline text-mute font-normal">{t('Neuer Chat')}</span>}</p>
          <span className="md:hidden">{newBtn}</span>
        </div>
        {fresh && <div className="hidden md:block flex-1" />}
        <div ref={messagesPane} className={`min-h-0 overflow-y-auto no-scrollbar ${fresh ? 'flex-1 md:flex-none' : 'flex-1'}`}>
          <div className="max-w-[760px] mx-auto px-5 md:px-8 pt-3 pb-4">{body}</div>
        </div>
        <div className="chat-composer-wrap shrink-0 px-3 md:px-8 pb-3 md:pb-6"><div className="max-w-[760px] mx-auto">{composer}</div></div>
        {fresh && <div className="hidden md:block flex-1" />}
      </div>
      {drawer && <ViewportOverlay label={t('Chats')} onClose={() => setDrawer(false)} className="bg-ink/30 md:hidden">
        <div onClick={e => e.stopPropagation()} className="mobile-history-drawer w-[84%] max-w-[340px] h-full bg-white flex flex-col">
          <div className="shrink-0 px-4 flex items-center justify-between mb-3"><p className="text-[20px]">{t('Chats')}</p><button onClick={() => setDrawer(false)} aria-label={t('Schliessen')} className="w-11 h-11 rounded-full hover:bg-sage-100 flex items-center justify-center"><X size={18} /></button></div>
          <div className="shrink-0 px-4"><button onClick={() => { openChat(null); setDrawer(false) }} className="w-full h-11 px-3 rounded-[12px] bg-sage-50 flex items-center gap-2 text-[17px] mb-3"><SquarePen size={17} />{t('Neuer Chat')}</button></div>
          <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-2 pb-6"><ChatList onPicked={() => setDrawer(false)} /></div>
        </div>
      </ViewportOverlay>}

    </div>
  )
}

/* ---------- Vorschläge von Marc (Backoffice-Copilot) ---------- */
function setAction(messageId: string, a: ChatAction) {
  for (const c of S.chats) for (const m of c.msgs ?? []) if (m.id === messageId && m.data.actions) m.data = { ...m.data, actions: m.data.actions.map(x => x.id === a.id ? a : x) }
  bump()
}
function ActionCard({ a, messageId }: { a: ChatAction; messageId: string }) {
  const { t, reload, reloadWiki } = useApp()
  const [busy, setBusy] = useState<'run' | 'drop' | null>(null)
  const decide = async (run: boolean) => {
    setBusy(run ? 'run' : 'drop')
    const { data } = await supabase!.functions.invoke('assistant', { body: { action: 'decide', message_id: messageId, action_id: a.id, run } }).catch(() => ({ data: null }))
    setBusy(null)
    const next = data?.action as ChatAction | undefined
    if (next) setAction(messageId, next)
    if (!run) return
    if (data?.ok) { toast(next?.result ?? t('Erledigt')); await Promise.all([reload(), reloadTodos(), reloadStandby(), a.kind === 'wiki' ? reloadWiki() : Promise.resolve()]) }
    else toast(next?.result ?? (data?.error === 'already' ? t('Das wurde schon erledigt.') : t('Das hat nicht geklappt')), 'error')
  }
  const done = a.status === 'ausgefuehrt', failed = a.status === 'fehler', dropped = a.status === 'verworfen'
  return (
    <div className={`mt-2 rounded-[16px] bg-white p-4 shadow-[inset_0_0_0_1px_var(--color-line)] ${dropped ? 'opacity-60' : ''}`}>
      <p className="rubric text-note">{t(a.title)}</p>
      <ul className="mt-1.5 space-y-0.5 text-[15.5px] leading-snug">{a.lines.map((l, i) => <li key={i} className={i === 0 ? 'font-medium' : 'text-ink/75'}>{l}</li>)}</ul>
      {a.status === 'offen' || a.status === 'laeuft' ? <div className="mt-3 flex gap-2">
        <button disabled={!!busy || a.status === 'laeuft'} onClick={() => decide(true)} className="h-10 px-4 rounded-full bg-olive-800 text-white text-[15px] font-semibold flex items-center gap-1.5 disabled:opacity-60"><Check size={16} />{busy === 'run' || a.status === 'laeuft' ? t('Wird ausgeführt …') : t('Ausführen')}</button>
        <button disabled={!!busy || a.status === 'laeuft'} onClick={() => decide(false)} className="h-10 px-4 rounded-full bg-sage-50 text-[15px] disabled:opacity-60">{t('Verwerfen')}</button>
      </div> : <p className={`mt-2.5 text-[14.5px] flex items-center gap-1.5 ${done ? 'text-done' : failed ? 'text-duty' : 'text-mute'}`}>{done ? <Check size={15} /> : failed ? <X size={15} /> : null}{a.result ?? (done ? t('Erledigt') : dropped ? t('Verworfen.') : '')}</p>}
    </div>
  )
}
