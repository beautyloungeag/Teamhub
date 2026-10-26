// Ungespeicherte Eingaben schützen (27.10., Durchklicken wie Renée): Wechsel im Menü, Schliessen des Tabs und
// ein versehentlicher Klick neben ein Fenster fragen nach, statt Getipptes still zu verwerfen.
const open = new Set<string>()

export function markUnsaved(key: string, on: boolean) { if (on) open.add(key); else open.delete(key) }

/** true = weitergehen. Fragt nur, wenn irgendwo etwas Ungespeichertes steht. */
export function confirmLeave(): boolean {
  if (!open.size) return true
  if (!confirm('Du hast ungespeicherte Änderungen. Wirklich verlassen? Sie gehen dann verloren.')) return false
  open.clear()
  return true
}

if (typeof window !== 'undefined') window.addEventListener('beforeunload', e => { if (open.size) { e.preventDefault(); e.returnValue = '' } })
