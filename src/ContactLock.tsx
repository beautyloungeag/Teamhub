import { Lock } from 'lucide-react'
import { useApp } from './store'

// Kontaktdaten von Kundinnen sehen nur Respo, Stv. Respo und Büro. Alle anderen sehen unscharfe Platzhalter
// (der Server liefert die echten Werte gar nicht erst aus).
export function ContactLocked({ className = '' }: { className?: string }) {
  const { t } = useApp()
  return (
    <div className={className}>
      {[[t('Mobil'), '+41 79 123 45 67'], [t('E-Mail'), 'vorname.name@mail.ch']].map(([l, v]) => (
        <div key={l} className="px-4 py-3 flex items-center justify-between gap-3">
          <span className="min-w-0"><span className="block text-[13px] text-mute">{l}</span><span aria-hidden="true" className="block text-[17px] blur-[5px] select-none">{v}</span></span>
        </div>))}
      <p className="px-4 pb-3 -mt-1 text-[14px] text-mute flex items-center gap-1.5"><Lock size={12} />{t('Nur für Respo, Stv. Respo und Büro sichtbar')}</p>
    </div>
  )
}
