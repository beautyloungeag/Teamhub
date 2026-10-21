import { useEffect, useRef, useState } from 'react'
import { Mail as MailIcon, RefreshCw, SquarePen, Paperclip, Reply, Forward, X, Send, Lock, ExternalLink, ChevronRight, LogOut } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useApp } from './store'
import { TONE } from './tones'
import { locale } from './lib/i18n'
import { toast } from './Toast'

// Persönlicher Posteingang (Function `mailbox`, Vertrag § 1.3 und Wunsch der Inhaberin 21.10.): das eigene Firmenpostfach
// bei Cyon. Jede Person verbindet es einmal mit ihrem Postfach-Passwort, das verschlüsselt gespeichert wird.
export type MailItem = { uid: number; seen: boolean; flagged: boolean; answered: boolean; date: string | null; from: { name: string; address: string } | null; subject: string; snippet: string; attachments: number }
type Full = { uid: number; subject: string; date: string | null; from: { name: string; address: string } | null; to: { name: string; address: string }[]; cc: { name: string; address: string }[]; messageId: string | null; references: string | null; text: string; html: string; attachments: { name: string; size: number }[] }
type Box = { ok: boolean; configured?: boolean; connected?: boolean; address?: string; total?: number; unseen?: number; items?: MailItem[]; error?: string }
export const WEBMAIL = 'https://webmail.cyon.ch'

const call = async (body: Record<string, unknown>) => (await supabase!.functions.invoke('mailbox', { body })).data as Box & Full & { ok: boolean; error?: string }

// Nur lokal für Ansichts-PDFs: Beispiel-Postfach
const demoOn = () => { try { return import.meta.env.DEV && localStorage.getItem('th-demo') === '1' } catch { return false } }
const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString()
const DEMO: MailItem[] = [
  { uid: 6, seen: false, flagged: false, answered: false, date: ago(18), from: { name: 'Büro Beautylounge', address: 'office@beautylounge.ch' }, subject: 'Beispiel: Dienstplan November', snippet: 'Hallo zusammen, im Anhang findet ihr den Dienstplan für November. Bitte bis Freitag prüfen.', attachments: 1 },
  { uid: 5, seen: false, flagged: false, answered: false, date: ago(95), from: { name: 'Marketing Beautylounge', address: 'marketing@beautylounge.ch' }, subject: 'Beispiel: Fotos für Instagram', snippet: 'Könnt ihr diese Woche zwei Vorher-nachher-Bilder von Brauen schicken? Gerne mit Einverständnis der Kundin.', attachments: 0 },
  { uid: 4, seen: true, flagged: false, answered: true, date: ago(60 * 26), from: { name: 'HR Beautylounge', address: 'hr@beautylounge.ch' }, subject: 'Beispiel: Schulung Lashlifting am Donnerstag', snippet: 'Die Schulung findet um 18 Uhr in Basel 1 statt. Bitte meldet euch im TeamHub an.', attachments: 0 },
  { uid: 3, seen: true, flagged: false, answered: false, date: ago(60 * 50), from: { name: 'Lieferant Kosmetik', address: 'info@lieferant.example' }, subject: 'Beispiel: Ihre Bestellung ist unterwegs', snippet: 'Die Lieferung mit Shellack-Farben und Wattepads kommt am Mittwoch.', attachments: 1 },
]

const initials = (n: string) => n.replace(/[^A-Za-zÀ-ž ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]!.toUpperCase()).join('') || '@'
const TONES = ['studio', 'learn', 'note', 'plum', 'done'] as const
const toneFor = (s: string) => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]
const when = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  if (d.toDateString() === now.toDateString()) return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(d)
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(d)
}
const Face = ({ who, size = 'w-11 h-11 text-[15px]' }: { who: { name: string; address: string } | null; size?: string }) => {
  const tone = TONE[toneFor(who?.address ?? '')]
  return <span className={`${size} rounded-full flex items-center justify-center font-semibold shrink-0 ${tone.bg} ${tone.fg}`}>{initials(who?.name || who?.address || '')}</span>
}

let cache: Box | null = null
/** Ungelesene im Posteingang (für Menü und Startseite) */
export function useMailUnread() {
  const [n, setN] = useState<number | null>(cache?.unseen ?? null)
  useEffect(() => { if (demoOn()) { setN(2); return } if (cache) return; call({ action: 'status' }).then(s => { if (!s?.connected) setN(null) }) }, [])
  return n
}

export function Inbox({ onOpen }: { onOpen: (uid: number, item: MailItem) => void }) {
  const { t } = useApp()
  const [box, setBox] = useState<Box | null>(cache)
  const [busy, setBusy] = useState(false), [compose, setCompose] = useState(false)
  const load = async () => {
    if (demoOn()) { const b = { ok: true, configured: true, connected: true, address: 'vorname@beautylounge.ch', total: 4, unseen: 2, items: DEMO }; cache = b; setBox(b); return }
    setBusy(true); const b = await call({ action: 'list' }).catch(() => ({ ok: false } as Box)); setBusy(false)
    if (b?.ok && b.connected) cache = b
    setBox(b ?? { ok: false })
  }
  useEffect(() => { load() }, [])
  const more = async () => { const last = box?.items?.[box.items.length - 1]; if (!last) return
    setBusy(true); const b = await call({ action: 'list', before: last.uid }); setBusy(false)
    if (b?.ok) setBox(x => { const n = { ...x!, items: [...(x?.items ?? []), ...(b.items ?? [])] }; cache = n; return n }) }
  const head = (right?: React.ReactNode) => <div className="px-5 pt-3 pb-4 flex items-end justify-between gap-3"><div><h1 className="text-[30px] leading-tight">{t('Posteingang')}</h1>{box?.address && <p className="text-[14.5px] text-mute mt-0.5 truncate">{box.address}</p>}</div>{right}</div>
  if (!box) return <div className="pb-10">{head()}<p className="px-5 text-mute">{t('Lädt …')}</p></div>
  if (!box.ok && box.error !== 'login_failed') return <div className="pb-10">{head()}<div className="px-4"><div className="rounded-[22px] bg-white p-5"><p className="text-[17px] font-semibold">{t('Das Postfach ist gerade nicht erreichbar')}</p><p className="mt-1 text-[15.5px] text-mute">{t('Bitte versuche es gleich noch einmal.')}</p><button onClick={load} className="mt-4 h-11 px-4 rounded-[14px] bg-sage-50 font-medium">{t('Erneut versuchen')}</button></div></div></div>
  if (!box.connected || box.error === 'login_failed') return <div className="pb-10">{head()}<Connect address={box.address ?? ''} failed={box.error === 'login_failed'} onDone={() => { cache = null; load() }} /></div>
  const items = box.items ?? []
  return (
    <div className="pb-10">
      {head(<div className="flex gap-2 mb-1"><button onClick={load} disabled={busy} aria-label={t('Aktualisieren')} className="w-10 h-10 rounded-full bg-white flex items-center justify-center disabled:opacity-50"><RefreshCw size={17} className={busy ? 'animate-spin' : ''} /></button>
        <button onClick={() => setCompose(true)} className="h-10 px-3.5 rounded-full bg-olive-800 text-white text-[15px] font-medium flex items-center gap-1.5"><SquarePen size={16} />{t('Neu')}</button></div>)}
      <div className="px-4">
        <div className="flex gap-2.5 mb-3">
          <span className={`px-3 h-8 rounded-full text-[14px] font-semibold flex items-center ${box.unseen ? `${TONE.duty.bg} ${TONE.duty.fg}` : `${TONE.done.bg} ${TONE.done.fg}`}`}>{box.unseen ? t('{n} ungelesen', { n: box.unseen }) : t('Alles gelesen')}</span>
          <span className="px-3 h-8 rounded-full bg-white text-[14px] text-ink/70 flex items-center">{t('{n} im Posteingang', { n: box.total ?? items.length })}</span>
        </div>
        <div className="rounded-[20px] bg-white overflow-hidden divide-y divide-line">
          {items.length === 0 && <p className="px-4 py-5 text-[15.5px] text-mute">{t('Dein Posteingang ist leer.')}</p>}
          {items.map(m => <button key={m.uid} onClick={() => { setBox(x => x ? { ...x, unseen: Math.max(0, (x.unseen ?? 0) - (m.seen ? 0 : 1)), items: x.items?.map(y => y.uid === m.uid ? { ...y, seen: true } : y) } : x); if (cache?.items) cache = { ...cache, items: cache.items.map(y => y.uid === m.uid ? { ...y, seen: true } : y) }; onOpen(m.uid, m) }} className="w-full px-4 py-3.5 flex gap-3 text-left">
            <Face who={m.from} />
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline gap-2"><span className={`flex-1 min-w-0 truncate text-[16.5px] ${m.seen ? '' : 'font-semibold'}`}>{m.from?.name || m.from?.address || t('Unbekannt')}</span><span className={`text-[13px] shrink-0 ${m.seen ? 'text-mute' : 'text-duty font-semibold'}`}>{when(m.date)}</span></span>
              <span className={`flex items-center gap-1.5 text-[15.5px] ${m.seen ? 'text-ink/80' : 'text-ink font-semibold'}`}><span className="truncate">{m.subject || t('(ohne Betreff)')}</span>{m.attachments > 0 && <Paperclip size={14} className="text-mute shrink-0" />}{m.answered && <Reply size={14} className="text-mute shrink-0" />}</span>
              <span className="block text-[14.5px] text-mute line-clamp-2 leading-snug mt-0.5">{m.snippet}</span>
            </span>
            {!m.seen && <span className="w-2.5 h-2.5 rounded-full bg-duty shrink-0 mt-2" />}
          </button>)}
        </div>
        {items.length >= 25 && <button onClick={more} disabled={busy} className="mt-3 w-full h-11 rounded-[14px] bg-white text-[15.5px] font-medium disabled:opacity-60">{t('Ältere laden')}</button>}
        <div className="mt-4 flex items-center justify-between px-1">
          <a href={WEBMAIL} target="_blank" rel="noreferrer" className="text-[14px] text-sage-800 flex items-center gap-1">{t('Im Webmail öffnen')}<ExternalLink size={13} /></a>
          {!demoOn() && <button onClick={async () => { await call({ action: 'disconnect' }); cache = null; load() }} className="text-[14px] text-mute flex items-center gap-1"><LogOut size={14} />{t('Postfach trennen')}</button>}
        </div>
      </div>
      {compose && <Compose onClose={() => setCompose(false)} />}
    </div>
  )
}

function Connect({ address, failed, onDone }: { address: string; failed: boolean; onDone: () => void }) {
  const { t } = useApp()
  const [pw, setPw] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(failed ? t('Das gespeicherte Passwort stimmt nicht mehr. Bitte neu eingeben.') : '')
  const go = async () => {
    if (!pw) return
    setBusy(true); setErr('')
    const r = await call({ action: 'connect', password: pw }).catch(() => null)
    setBusy(false); setPw('')
    if (r?.ok) { toast(t('Postfach verbunden')); onDone() } else setErr(r?.error === 'login_failed' ? t('Anmeldung fehlgeschlagen. Bitte prüfe dein Postfach-Passwort.') : t('Das Postfach ist gerade nicht erreichbar.'))
  }
  return (
    <div className="px-4 space-y-3">
      <div className="rounded-[22px] bg-white p-5">
        <span className={`w-12 h-12 rounded-[14px] flex items-center justify-center ${TONE.studio.bg} ${TONE.studio.fg}`}><MailIcon size={22} /></span>
        <p className="mt-3 text-[18px] font-semibold">{t('Deine Firmen-Mails direkt im TeamHub')}</p>
        <p className="mt-1 text-[15.5px] text-mute leading-snug">{t('Verbinde dein Postfach einmal mit deinem Postfach-Passwort. Danach liest und beantwortest du deine Mails hier.')}</p>
        <div className="mt-4 h-12 rounded-[14px] bg-sage-50 px-4 flex items-center text-[16px] text-ink/80 truncate">{address}</div>
        <input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder={t('Postfach-Passwort')} className="mt-2 w-full h-12 rounded-[14px] bg-sage-50 px-4 text-[16px] outline-none placeholder:text-mute" />
        {err && <p role="alert" className="mt-2 text-[14.5px] text-duty">{err}</p>}
        <button disabled={busy || !pw} onClick={go} className="mt-3 w-full h-12 rounded-[16px] bg-olive-800 text-white font-semibold disabled:opacity-50">{busy ? t('Verbindet …') : t('Postfach verbinden')}</button>
        <p className="mt-3 text-[13.5px] text-mute flex gap-1.5"><Lock size={14} className="shrink-0 mt-0.5" />{t('Das Passwort wird verschlüsselt gespeichert. Nur du siehst dein Postfach, auch das Büro nicht.')}</p>
      </div>
      <a href={WEBMAIL} target="_blank" rel="noreferrer" className="rounded-[18px] bg-white px-4 py-3.5 flex items-center gap-3 text-[16px]"><span className="flex-1">{t('Lieber im Webmail öffnen')}</span><ChevronRight size={18} className="text-sage-400" /></a>
    </div>
  )
}

export function MailRead({ uid, item }: { uid: number; item?: MailItem }) {
  const { t } = useApp()
  const [m, setM] = useState<Full | null>(null), [err, setErr] = useState(false)
  const [compose, setCompose] = useState<null | 'reply' | 'forward'>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (demoOn()) { const d = DEMO.find(x => x.uid === uid) ?? DEMO[0]; setM({ uid, subject: d.subject, date: d.date, from: d.from, to: [{ name: 'Du', address: 'vorname@beautylounge.ch' }], cc: [], messageId: null, references: null, html: '', attachments: d.attachments ? [{ name: 'Dienstplan-November.pdf', size: 184000 }] : [],
      text: `${d.snippet}\n\nBei Fragen meldet euch einfach im Büro oder schreibt im Team-Chat.\n\nLiebe Grüsse\n${d.from?.name ?? ''}` }); return }
    call({ action: 'message', uid }).then(r => r?.ok ? setM(r as unknown as Full) : setErr(true)).catch(() => setErr(true))
  }, [uid])
  const fmt = (iso: string | null) => iso ? new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : ''
  // HTML-Mails im abgeschotteten Rahmen: keine Skripte, Links öffnen neu, Höhe passt sich an
  const srcDoc = m?.html ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;font:16px/1.55 -apple-system,system-ui,sans-serif;color:#1D221C;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%!important}blockquote{margin:0 0 0 8px;padding-left:10px;border-left:3px solid #E6E8E3;color:#5C6359}</style></head><body>${m.html}</body></html>` : ''
  const fit = () => { const d = frame.current?.contentDocument; if (d && frame.current) frame.current.style.height = Math.min(6000, d.documentElement.scrollHeight + 8) + 'px' }
  return (
    <article className="pb-4">
      <div className="px-5">
        {!m && !err && <><h1 className="mt-2 text-[26px] font-medium leading-tight">{item?.subject}</h1><p className="mt-4 text-mute">{t('Lädt …')}</p></>}
        {err && <p className="mt-4 text-[15.5px] text-mute">{t('Diese Mail lässt sich gerade nicht laden.')}</p>}
        {m && <>
          <h1 className="mt-2 text-[26px] font-medium tracking-tight leading-tight">{m.subject || t('(ohne Betreff)')}</h1>
          <div className="mt-4 flex items-center gap-3"><Face who={m.from} />
            <div className="flex-1 min-w-0"><p className="text-[16.5px] font-semibold truncate">{m.from?.name}</p><p className="text-[14px] text-mute truncate">{m.from?.address} · {fmt(m.date)}</p></div></div>
          {m.to.length > 0 && <p className="mt-2 text-[14px] text-mute truncate">{t('An')}: {m.to.map(x => x.name || x.address).join(', ')}{m.cc.length ? ` · Cc: ${m.cc.map(x => x.name || x.address).join(', ')}` : ''}</p>}
          <div className="mt-5 rounded-[20px] bg-white p-4">
            {m.html ? <iframe ref={frame} title={m.subject} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={srcDoc} onLoad={fit} className="w-full border-0 min-h-[160px]" />
              : <p className="text-[16.5px] leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>}
          </div>
          {m.attachments.length > 0 && <div className="mt-3 rounded-[18px] bg-white divide-y divide-line">{m.attachments.map((a, i) => <a key={i} href={WEBMAIL} target="_blank" rel="noreferrer" className="px-4 py-3 flex items-center gap-3"><span className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${TONE.studio.bg} ${TONE.studio.fg}`}><Paperclip size={16} /></span><span className="flex-1 min-w-0"><span className="block text-[16px] truncate">{a.name}</span><span className="block text-[13px] text-mute">{Math.max(1, Math.round(a.size / 1024))} KB · {t('im Webmail öffnen')}</span></span></a>)}</div>}
        </>}
      </div>
      {m && <div className="sticky bottom-0 mt-6 px-4 pt-3 pb-3 bg-gradient-to-t from-sage-50 via-sage-50 to-sage-50/0">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setCompose('reply')} className="h-12 rounded-[16px] bg-olive-800 text-white font-semibold flex items-center justify-center gap-2"><Reply size={18} />{t('Antworten')}</button>
          <button onClick={() => setCompose('forward')} className="h-12 rounded-[16px] bg-white font-semibold flex items-center justify-center gap-2"><Forward size={18} />{t('Weiterleiten')}</button>
        </div>
      </div>}
      {m && compose && <Compose onClose={() => setCompose(null)} base={m} mode={compose} />}
    </article>
  )
}

function Compose({ onClose, base, mode }: { onClose: () => void; base?: Full; mode?: 'reply' | 'forward' }) {
  const { t } = useApp()
  const quote = base ? `\n\n${t('Am {date} schrieb {name}:', { date: base.date ? new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(base.date)) : '', name: base.from?.name || base.from?.address || '' })}\n${(base.text || '').split('\n').map(l => '> ' + l).join('\n')}` : ''
  const [to, setTo] = useState(mode === 'reply' ? base?.from?.address ?? '' : ''), [cc, setCc] = useState('')
  const [subject, setSubject] = useState(base ? (mode === 'reply' ? (/^re:/i.test(base.subject) ? base.subject : 'Re: ' + base.subject) : 'Fwd: ' + base.subject) : '')
  const [text, setText] = useState(quote), [busy, setBusy] = useState(false)
  const send = async () => {
    if (demoOn()) { toast(t('Beispiel: In der App geht die Mail direkt aus deinem Postfach.')); onClose(); return }
    setBusy(true)
    const r = await call({ action: 'send', to, cc, subject, text, ...(mode === 'reply' && base ? { inReplyTo: base.messageId, references: base.references, replyUid: base.uid } : {}) }).catch(() => null)
    setBusy(false)
    if (r?.ok) { toast(t('Gesendet')); onClose() } else toast(r?.error === 'bad_recipient' ? t('Bitte prüfe die Empfänger-Adresse.') : t('Senden hat nicht geklappt'), 'error')
  }
  const field = 'w-full h-11 bg-transparent outline-none text-[16.5px] placeholder:text-mute'
  return (
    <div className="fixed inset-0 z-50 bg-ink/30 flex items-end md:items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full md:max-w-[560px] h-[92dvh] md:h-auto md:max-h-[86dvh] bg-paper rounded-t-[24px] md:rounded-[24px] flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between"><button onClick={onClose} aria-label={t('Schliessen')} className="w-10 h-10 rounded-full bg-white flex items-center justify-center"><X size={18} /></button>
          <p className="text-[17px] font-semibold">{mode === 'reply' ? t('Antworten') : mode === 'forward' ? t('Weiterleiten') : t('Neue E-Mail')}</p>
          <button disabled={busy || !to.trim() || !text.trim()} onClick={send} className="h-10 px-4 rounded-full bg-olive-800 text-white font-semibold flex items-center gap-1.5 disabled:opacity-40"><Send size={15} />{t('Senden')}</button></div>
        <div className="mx-4 rounded-[18px] bg-white px-4 divide-y divide-line">
          <label className="flex items-center gap-2"><span className="w-12 text-[15px] text-mute">{t('An')}</span><input value={to} onChange={e => setTo(e.target.value)} inputMode="email" placeholder="name@beispiel.ch" className={field} /></label>
          <label className="flex items-center gap-2"><span className="w-12 text-[15px] text-mute">Cc</span><input value={cc} onChange={e => setCc(e.target.value)} inputMode="email" className={field} /></label>
          <label className="flex items-center gap-2"><span className="w-12 text-[15px] text-mute">{t('Betreff')}</span><input value={subject} onChange={e => setSubject(e.target.value)} className={field} /></label>
        </div>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={t('Deine Nachricht')} className="flex-1 mx-4 mt-2 mb-6 rounded-[18px] bg-white p-4 text-[16.5px] leading-relaxed outline-none resize-none placeholder:text-mute" onFocus={e => { if (mode) e.currentTarget.setSelectionRange(0, 0) }} />
      </div>
    </div>
  )
}
