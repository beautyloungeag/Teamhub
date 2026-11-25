import { useRef, useState, useSyncExternalStore } from 'react'
import { Send, Check, Paperclip, X, FileText, Film, Download } from 'lucide-react'
import { useApp, type Ticket, type CommentFile } from './store'
import { fileKind, fileSize, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from './lib/files'
import { Avatar } from './People'
import { captureAccountScope, isCurrentAccountScope, onAccountScopeChange } from './lib/account-scope'

// Ein Verlauf mit Kommentaren, damit alle sehen, was passiert („Techniker kommt Montag 8 Uhr“)
export function Comments({ tk, compact }: { tk: Ticket; compact?: boolean }) {
  const { me } = useApp()
  const version = useSyncExternalStore(onAccountScopeChange, () => captureAccountScope(me.id)?.version ?? -1)
  return version < 0 ? null : <CommentThread key={`${version}:${tk.id}`} tk={tk} compact={compact} />
}
function CommentThread({ tk, compact }: { tk: Ticket; compact?: boolean }) {
  const { addComment, me, t, staff } = useApp()
  const [v, setV] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const [files, setFiles] = useState<File[]>([]), [note, setNote] = useState('')
  const flight = useRef(false), picker = useRef<HTMLInputElement>(null)
  const pick = (list: FileList | null) => {
    const chosen = [...(list ?? [])], ok = chosen.filter(f => f.size <= MAX_ATTACHMENT_BYTES)
    setNote(ok.length < chosen.length ? t('Eine Datei ist grösser als 50 MB und wurde nicht angehängt.') : files.length + ok.length > MAX_ATTACHMENTS ? t('Höchstens sechs Dateien je Kommentar.') : '')
    setFiles(fs => [...fs, ...ok].slice(0, MAX_ATTACHMENTS))
  }
  const send = async () => {
    const scope = captureAccountScope(me.id), body = v.trim(), sending = files
    if (!scope || (!body && !sending.length) || flight.current) return
    flight.current = true; setBusy(true); setError(false); setNote('')
    try {
      const ok = await addComment(tk.id, body, sending)
      if (!isCurrentAccountScope(scope)) return
      if (ok) { setV(value => value.trim() === body ? '' : value); setFiles(fs => fs === sending ? [] : fs) }
      else setError(true)
    } catch { if (isCurrentAccountScope(scope)) setError(true) }
    finally { flight.current = false; if (isCurrentAccountScope(scope)) setBusy(false) }
  }
  return (<div>
    {tk.comments.map(c => { const p = c.authorId ? staff.find(s => s.id === c.authorId) : null
      const author = p ? `${p.first} ${p.last}` : t('Ehemalige Person')
      return <div key={c.id} className="py-2.5 border-b border-line text-[13px] flex gap-2.5">
        {p ? <Avatar s={p} photo={p.photo} size="w-7 h-7 text-[10px] shrink-0" /> : <span className="w-7 h-7 rounded-full bg-sage-100 text-mute text-[10px] flex items-center justify-center shrink-0">{author.slice(0, 1)}</span>}
        <div className="min-w-0 flex-1"><p className="text-xs"><span className="text-ink font-medium">{author}</span><span className="text-mute"> · {c.when}</span></p>
          {c.body && <p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>}
          {(c.files ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{c.files.map(f => <Attachment key={f.path} f={f} />)}</div>}
        </div></div> })}
    {error && <p role="alert" className="mt-3 text-[14px] text-alert">{t('Kommentar konnte nicht gesendet werden. Dein Entwurf bleibt erhalten. Bitte erneut versuchen.')}</p>}
    {note && <p role="status" className="mt-3 text-[13px] text-mute">{note}</p>}
    {files.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{files.map((f, i) => <span key={`${f.name}-${f.size}-${i}`} className="max-w-full h-9 pl-2.5 pr-1 rounded-[8px] bg-sage-50 text-[13px] flex items-center gap-1.5">
      <FileGlyph kind={fileKind(f.type, f.name)} /><span className="truncate max-w-[180px]">{f.name}</span><span className="text-mute shrink-0">{fileSize(f.size)}</span>
      <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} disabled={busy} aria-label={t('Anhang entfernen')} className="w-7 h-7 flex items-center justify-center text-mute"><X size={14} /></button></span>)}</div>}
    <div className={`flex items-end gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
      <button onClick={() => picker.current?.click()} disabled={busy || files.length >= MAX_ATTACHMENTS} aria-label={t('Datei anhängen')} title={t('Foto, Video oder Datei anhängen')} className="h-11 w-11 shrink-0 rounded-[8px] bg-sage-50 text-olive-800 flex items-center justify-center disabled:opacity-40"><Paperclip size={18} /></button>
      <input ref={picker} type="file" multiple className="hidden" onChange={e => { pick(e.target.files); e.target.value = '' }} />
      <textarea value={v} rows={2} onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover)').matches) { e.preventDefault(); void send() } }}
      aria-label={t('Kommentar schreiben …')} placeholder={t('Kommentar schreiben …')} className="flex-1 min-w-0 min-h-11 max-h-40 resize-y rounded-[8px] bg-sage-50 px-3 py-2.5 text-[16px] md:text-[14px] outline-none" />
      <button disabled={busy || (!v.trim() && !files.length)} onClick={() => void send()} aria-label={t('Kommentar senden')} className="h-11 w-11 shrink-0 rounded-[8px] bg-olive-700 text-white flex items-center justify-center disabled:opacity-40"><Send size={18} /></button></div>
    {busy && files.length > 0 && <p className="mt-2 text-[13px] text-mute">{t('Anhänge werden hochgeladen …')}</p>}
  </div>)
}
function FileGlyph({ kind }: { kind: ReturnType<typeof fileKind> }) {
  return kind === 'video' ? <Film size={15} className="text-mute shrink-0" /> : <FileText size={15} className="text-mute shrink-0" />
}
/** Ein Anhang im Verlauf: Bild und Video direkt, alles andere als Datei zum Öffnen. Ein Bild, das der Browser nicht
 *  lesen kann (z. B. HEIC in Chrome), fällt auf die Datei-Ansicht zurück. */
function Attachment({ f }: { f: CommentFile }) {
  const { t } = useApp()
  const kind = fileKind(f.type, f.name)
  const [broken, setBroken] = useState(false)
  if (!f.url) return <span className="h-9 px-2.5 rounded-[8px] bg-sage-50 text-mute flex items-center gap-1.5"><FileText size={15} />{f.name}</span>
  if (kind === 'image' && !broken) return <a href={f.url} target="_blank" rel="noreferrer" title={f.name}><img src={f.url} alt={f.name} onError={() => setBroken(true)} className="h-28 w-28 object-cover rounded-[8px] bg-sage-50" /></a>
  if (kind === 'video') return <video src={f.url} controls playsInline preload="metadata" className="w-full max-w-[320px] rounded-[8px] bg-ink" />
  return <a href={f.url} target="_blank" rel="noreferrer" download={f.name} className="max-w-full h-9 px-2.5 rounded-[8px] bg-sage-50 flex items-center gap-1.5 hover:bg-sage-100">
    <FileGlyph kind={kind} /><span className="truncate max-w-[200px]">{f.name}</span><span className="text-mute shrink-0">{fileSize(f.size)}</span><Download size={14} className="text-mute shrink-0" aria-label={t('Öffnen')} /></a>
}
export function Media({ tk }: { tk: Ticket }) {
  if (!tk.photo) return null
  return tk.mediaKind === 'video' ? <video src={tk.photo} controls playsInline className="w-full rounded-[10px] bg-ink" /> : <a href={tk.photo} target="_blank" rel="noreferrer"><img src={tk.photo} alt="" className="w-full max-h-64 object-cover rounded-[10px]" /></a>
}

// Meldung oder Idee, die Marc vorschlägt: ein Tipp schickt sie ab (App und Backoffice)
export function TicketDraft({ kind, title, onSend }: { kind: 'Meldung' | 'Idee'; title: string; onSend: () => Promise<boolean> }) {
  const { t } = useApp()
  const [state, setState] = useState<'draft' | 'busy' | 'sent' | 'error'>('draft')
  return (
    <div className="mt-3 rounded-xl bg-sage-50 p-3">
      <p className="text-xs text-mute">{kind === 'Meldung' ? t('Meldung · Facility') : t('Idee · Büro')}</p><p className="text-[14px] font-medium mt-0.5">{title}</p>
      {state === 'sent' ? <p className="mt-2 text-[13px] text-sage-800 flex items-center gap-1"><Check size={14} />{t('Gesendet, du siehst den Stand unter Melden & Ideen')}</p>
        : <button disabled={state === 'busy'} onClick={async () => { setState('busy'); setState(await onSend() ? 'sent' : 'error') }} className="mt-2.5 h-9 px-4 rounded-full bg-olive-700 text-white text-[13px] disabled:opacity-60">{state === 'error' ? t('Nochmal senden') : kind === 'Meldung' ? t('Meldung senden') : t('Idee senden')}</button>}
    </div>
  )
}
