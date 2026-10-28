// Kurze Reaktion beim Erledigen (Matteo 28.10.: „damit man sieht, dass es geklappt hat“):
// ein grüner Haken springt auf, ein paar Punkte fliegen weg, das Handy vibriert kurz. Ohne Bewegung (Systemeinstellung) nur der Haken.
export function celebrate(at?: { x: number; y: number } | Element | null) {
  if (typeof document === 'undefined') return
  try { navigator.vibrate?.(18) } catch { /* nicht überall erlaubt */ }
  const r = at instanceof Element ? at.getBoundingClientRect() : null
  const x = r ? r.left + r.width / 2 : (at as { x: number } | null | undefined)?.x ?? innerWidth / 2
  const y = r ? r.top + r.height / 2 : (at as { y: number } | null | undefined)?.y ?? innerHeight / 2
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, width: '0', height: '0', zIndex: '9999', pointerEvents: 'none' })
  const tick = document.createElement('div')
  tick.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  Object.assign(tick.style, { position: 'absolute', left: '-20px', top: '-20px', width: '40px', height: '40px', borderRadius: '999px', background: '#5E7F4B', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px -6px rgba(46,70,36,.55)' })
  host.append(tick)
  tick.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: .45 }, { transform: 'scale(1)', opacity: 1, offset: .7 }, { transform: 'scale(.9)', opacity: 0 }], { duration: still ? 500 : 720, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' })
  if (!still) for (let i = 0; i < 10; i++) {
    const dot = document.createElement('span'), a = (i / 10) * Math.PI * 2 + Math.random() * .4, d = 34 + Math.random() * 22
    Object.assign(dot.style, { position: 'absolute', left: '-4px', top: '-4px', width: '8px', height: '8px', borderRadius: '999px', background: ['#5E7F4B', '#A78B5A', '#8FA67E', '#C9A86A'][i % 4] })
    host.append(dot)
    dot.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.4)`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' })
  }
  document.body.append(host)
  setTimeout(() => host.remove(), 800)
}
