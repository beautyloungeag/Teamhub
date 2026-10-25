// Keep this query aligned with the md variant and mobile media blocks in index.css.
// A landscape phone remains the employee app; width alone does not make it a desktop.
export const DESKTOP_MEDIA = '(min-width: 768px) and (hover: hover) and (pointer: fine)'

// A keyboard can both resize AND pan iOS's visual viewport. Keep these values
// together; nested panes must scroll themselves, never scroll the document.
export type ViewportReading = { height: number; offsetTop: number; scale: number }
export function visibleFrame(layoutHeight: number, viewport?: ViewportReading | null) {
  const layout = Math.max(1, layoutHeight)
  if (!viewport || !Number.isFinite(viewport.height) || viewport.height <= 0) return { height: layout, top: 0 }
  if (Math.abs(viewport.scale - 1) > .01) return null // Preserve layout during accessibility zoom.
  const height = Math.min(layout, viewport.height)
  return { height, top: Math.min(Math.max(0, viewport.offsetTop || 0), Math.max(0, layout - height)) }
}

export function paneScrollTop(pane: { top: number; height: number; scrollTop: number; scrollHeight: number }, target: { top: number; bottom: number }, align: 'nearest' | 'start' | 'end' = 'nearest') {
  const start = target.top - pane.top + pane.scrollTop - 12
  const end = target.bottom - pane.top + pane.scrollTop - pane.height + 12
  const desired = align === 'start' ? start : align === 'end' ? end : target.top < pane.top + 12 ? start : target.bottom > pane.top + pane.height - 12 ? end : pane.scrollTop
  return Math.max(0, Math.min(desired, Math.max(0, pane.scrollHeight - pane.height)))
}

export function scrollInPane(pane: HTMLElement | null, target: HTMLElement | null, align: 'nearest' | 'start' | 'end' = 'nearest', smooth = false) {
  if (!pane || !target || !pane.contains(target)) return
  const p = pane.getBoundingClientRect(), t = target.getBoundingClientRect()
  pane.scrollTo({ top: paneScrollTop({ top: p.top, height: pane.clientHeight, scrollTop: pane.scrollTop, scrollHeight: pane.scrollHeight }, t, align), behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
}

export function installMobileViewport() {
  const root = document.documentElement
  let frame = 0, stableWidth = innerWidth, stableHeight = innerHeight
  const editable = () => document.activeElement instanceof HTMLElement && document.activeElement.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable=true]')
  const update = () => {
    frame = 0
    const reading = visibleFrame(Math.max(innerHeight, root.clientHeight), window.visualViewport)
    if (!reading) return
    if (Math.abs(stableWidth - innerWidth) > 2) { stableWidth = innerWidth; stableHeight = innerHeight }
    if (!editable()) stableHeight = Math.max(innerHeight, reading.height)
    root.style.setProperty('--app-height', `${reading.height}px`)
    root.style.setProperty('--app-top', `${reading.top}px`)
    root.dataset.keyboardOpen = String(!!editable() && (stableHeight - reading.height > 120 || reading.height < 400))
    // Native focus scrolling is retained at login. In the signed-in canvas and
    // dialogs, reveal only the nearest scroll pane rather than moving the page.
    if (!editable() || root.classList.contains('teamhub-login-mode')) return
    const target = document.activeElement as HTMLElement
    for (let pane = target.parentElement; pane && pane !== document.body; pane = pane.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(pane).overflowY) && pane.scrollHeight > pane.clientHeight) { scrollInPane(pane, target); break }
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
  const events: [EventTarget, string][] = [[window, 'resize'], [window, 'orientationchange'], [document, 'focusin'], [document, 'focusout'], [document, 'visibilitychange']]
  if (window.visualViewport) events.push([window.visualViewport, 'resize'], [window.visualViewport, 'scroll'])
  events.forEach(([target, event]) => target.addEventListener(event, schedule))
  update()
  return () => { if (frame) cancelAnimationFrame(frame); events.forEach(([target, event]) => target.removeEventListener(event, schedule)) }
}
