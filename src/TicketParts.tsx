import { useState } from 'react'
import { Send } from 'lucide-react'
import { useApp, type Ticket } from './store'

// Ein Verlauf mit Kommentaren, damit alle sehen, was passiert („Techniker kommt Montag 8 Uhr“)
export function Comments({ tk, compact }: { tk: Ticket; compact?: boolean }) {
  const { addComment, t } = useApp()
  const [v, setV] = useState(''), [busy, setBusy] = useState(false)
  const send = async () => { if (!v.trim() || busy) return; setBusy(true); if (await addComment(tk.id, v)) setV(''); setBusy(false) }
  return (<div>
    {tk.comments.map(c => <div key={c.id} className="py-2 border-b border-line text-[13px]"><p className="text-mute text-xs">{c.author} · {c.when}</p><p className="mt-0.5 whitespace-pre-wrap">{c.body}</p></div>)}
    <div className={`flex gap-2 ${compact ? 'mt-2' : 'mt-3'}`}><input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={t('Kommentar schreiben …')} className="flex-1 h-9 rounded-[8px] bg-sage-50 px-3 text-[13px] outline-none" />
      <button disabled={busy || !v.trim()} onClick={send} className="h-9 w-9 rounded-[8px] bg-olive-700 text-white flex items-center justify-center disabled:opacity-40"><Send size={14} /></button></div>
  </div>)
}
export function Media({ tk }: { tk: Ticket }) {
  if (!tk.photo) return null
  return tk.mediaKind === 'video' ? <video src={tk.photo} controls playsInline className="w-full rounded-[10px] bg-ink" /> : <a href={tk.photo} target="_blank" rel="noreferrer"><img src={tk.photo} alt="" className="w-full max-h-64 object-cover rounded-[10px]" /></a>
}
