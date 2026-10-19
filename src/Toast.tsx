import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, AlertCircle } from 'lucide-react'

// Kurze Bestätigung nach einer Änderung („Sprache geändert“): unten rechts, zwei Sekunden, dann weg.
type T = { id: number; msg: string; kind: 'ok' | 'error' }
let seq = 0
export function toast(msg: string, kind: 'ok' | 'error' = 'ok') {
  window.dispatchEvent(new CustomEvent<T>('th-toast', { detail: { id: ++seq, msg, kind } }))
}

export function Toaster() {
  const [list, setList] = useState<T[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<T>).detail
      setList(l => [...l.slice(-2), t])
      window.setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), t.kind === 'error' ? 3500 : 2200)
    }
    window.addEventListener('th-toast', on)
    return () => window.removeEventListener('th-toast', on)
  }, [])
  return (
    <div className="fixed z-50 pointer-events-none flex flex-col gap-2 items-center md:items-end left-4 right-4 bottom-[96px] md:left-auto md:right-6 md:bottom-6" aria-live="polite">
      <AnimatePresence>{list.map(t => (
        <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}
          className="pointer-events-auto h-9 pl-2.5 pr-3.5 rounded-full bg-ink/90 text-white text-[13px] flex items-center gap-2 shadow-[0_10px_30px_-12px_rgba(29,34,28,.6)] backdrop-blur-sm">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center ${t.kind === 'ok' ? 'bg-white/15' : 'bg-alert'}`}>{t.kind === 'ok' ? <Check size={12} strokeWidth={3} /> : <AlertCircle size={12} strokeWidth={2.6} />}</span>{t.msg}
        </motion.div>
      ))}</AnimatePresence>
    </div>
  )
}
