import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

let layers = 0, previousInert = false

/** Portals escape animated/scrolling page ancestors. One visible viewport for
 * every mobile sheet, with keyboard focus kept out of the page behind it. */
export function ViewportOverlay({ children, onClose, label, className = '' }: { children: ReactNode; onClose: () => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, app = document.getElementById('root')
    if (layers++ === 0 && app) { previousInert = app.inert; app.inert = true }
    // Opening a sheet does not summon the keyboard before the user chooses a field.
    ref.current?.focus({ preventScroll: true })
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type=hidden]), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter(e => e.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus({ preventScroll: true }) }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus({ preventScroll: true }) }
    }
    const node = ref.current
    node?.addEventListener('keydown', keys)
    return () => {
      node?.removeEventListener('keydown', keys)
      if (--layers === 0 && app) app.inert = previousInert
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(<div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={`mobile-overlay fixed inset-0 z-50 outline-none ${className}`} onClick={onClose}>{children}</div>, document.body)
}
