import type { ReactNode } from 'react'
import { Copy } from 'lucide-react'
import { useApp } from './store'
import { toast } from './Toast'

// Personen-Bausteine, die App, Backoffice und Benni teilen
export const ini = (s: { first: string; last: string }) => ((s.first[0] ?? '') + (s.last[0] ?? '')).toUpperCase()

export const Avatar = ({ s, photo, size = 'w-10 h-10' }: { s: { first: string; last: string }; photo?: string | null; size?: string }) =>
  photo ? <img src={photo} alt="" className={`${size} rounded-full object-cover shrink-0`} /> : <span className={`${size} rounded-full bg-sage-200 flex items-center justify-center text-sm font-medium text-sage-800 shrink-0`}>{ini(s)}</span>

/** Telefon oder E-Mail mit Kopieren und Anrufen/Schreiben (am Desktop kann man nicht anrufen, aber kopieren). */
export function ContactRow({ label, value, href, icon, action }: { label: string; value: string; href: string; icon: ReactNode; action: string }) {
  const { t } = useApp()
  const copy = async () => { try { await navigator.clipboard.writeText(value); toast(t('Kopiert')) } catch { toast(t('Kopieren nicht möglich'), 'error') } }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex-1 min-w-0"><span className="block text-[12px] text-mute">{label}</span><span className="block text-[15px] truncate select-all">{value}</span></span>
      <button onClick={copy} title={t('Kopieren')} aria-label={t('Kopieren')} className="w-9 h-9 rounded-full text-mute hover:text-ink hover:bg-sage-50 flex items-center justify-center shrink-0"><Copy size={15} /></button>
      <a href={href} title={action} aria-label={action} className="w-9 h-9 rounded-full text-olive-700 hover:bg-sage-50 flex items-center justify-center shrink-0">{icon}</a>
    </div>
  )
}
