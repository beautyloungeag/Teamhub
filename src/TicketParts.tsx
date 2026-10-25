import { useRef, useState, useSyncExternalStore } from 'react'
import { Send, Check } from 'lucide-react'
import { useApp, type Ticket } from './store'
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
  const flight = useRef(false)
  const send = async () => {
    const scope = captureAccountScope(me.id), body = v.trim()
    if (!scope || !body || flight.current) return
    flight.current = true; setBusy(true); setError(false)
    try {
      const ok = await addComment(tk.id, body)
      if (!isCurrentAccountScope(scope)) return
      if (ok) setV(value => value.trim() === body ? '' : value)
      else setError(true)
    } catch { if (isCurrentAccountScope(scope)) setError(true) }
    finally { flight.current = false; if (isCurrentAccountScope(scope)) setBusy(false) }
  }
  return (<div>
    {tk.comments.map(c => { const p = c.authorId ? staff.find(s => s.id === c.authorId) : null
      const author = p ? `${p.first} ${p.last}` : t('Ehemalige Person')
      return <div key={c.id} className="py-2.5 border-b border-line text-[13px] flex gap-2.5">
        {p ? <Avatar s={p} photo={p.photo} size="w-7 h-7 text-[10px] shrink-0" /> : <span className="w-7 h-7 rounded-full bg-sage-100 text-mute text-[10px] flex items-center justify-center shrink-0">{author.slice(0, 1)}</span>}
        <div className="min-w-0"><p className="text-xs"><span className="text-ink font-medium">{author}</span><span className="text-mute"> · {c.when}</span></p><p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p></div></div> })}
    {error && <p role="alert" className="mt-3 text-[14px] text-alert">{t('Kommentar konnte nicht gesendet werden. Dein Entwurf bleibt erhalten. Bitte erneut versuchen.')}</p>}
    <div className={`flex items-end gap-2 ${compact ? 'mt-2' : 'mt-3'}`}><textarea value={v} rows={2} onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover)').matches) { e.preventDefault(); void send() } }}
      aria-label={t('Kommentar schreiben …')} placeholder={t('Kommentar schreiben …')} className="flex-1 min-w-0 min-h-11 max-h-40 resize-y rounded-[8px] bg-sage-50 px-3 py-2.5 text-[16px] md:text-[14px] outline-none" />
      <button disabled={busy || !v.trim()} onClick={() => void send()} aria-label={t('Kommentar senden')} className="h-11 w-11 shrink-0 rounded-[8px] bg-olive-700 text-white flex items-center justify-center disabled:opacity-40"><Send size={18} /></button></div>
  </div>)
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
