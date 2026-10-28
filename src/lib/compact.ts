import { useEffect, useState } from 'react'

// Backoffice auf Handy und schmalem Tablet (28.10.): unter 900 px Menü statt Seitenleiste, Tabellen als Listen.
// Gleiche Grenze wie `min-[900px]:` in den Klassen und `.office-shell` in index.css.
export const COMPACT_MEDIA = '(max-width: 899px)'
export function useCompact() {
  const [c, setC] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(COMPACT_MEDIA).matches)
  useEffect(() => {
    const m = window.matchMedia?.(COMPACT_MEDIA); if (!m) return
    const on = () => setC(m.matches)
    m.addEventListener('change', on); return () => m.removeEventListener('change', on)
  }, [])
  return c
}

// Tabellen im Backoffice tragen ihre Spaltenköpfe als data-label in jede Zelle, damit die Listenansicht
// am Handy sagt, was ein Wert ist. Läuft über alle Tabellen, auch später nachgeladene.
export function labelTables(root: HTMLElement) {
  for (const table of root.querySelectorAll<HTMLTableElement>('table.tbl')) {
    const heads = [...table.querySelectorAll('thead tr:first-child > th')].map(th => (th.textContent ?? '').replace(/[↓↑]/g, '').trim())
    if (!heads.some(Boolean)) continue
    for (const tr of table.querySelectorAll('tbody > tr')) {
      [...tr.children].forEach((td, i) => {
        const l = heads[i] ?? ''
        if (i === 0 || !l) { if (td.hasAttribute('data-label')) td.removeAttribute('data-label'); return }
        if (td.getAttribute('data-label') !== l) td.setAttribute('data-label', l)
      })
    }
  }
}
