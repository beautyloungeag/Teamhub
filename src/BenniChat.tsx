import { Check } from 'lucide-react'
import { supabase, SUPABASE_URL, SUPABASE_ANON } from './lib/supabase'
import { locale } from './lib/i18n'
import { useApp, isoDay } from './store'
import { BMark } from './Logo'

// Gemeinsame Teile für Benni in App und Backoffice: Anfrage mit Arbeitsschritten,
// Anzeige „was Benni gerade tut“ und einfache Formatierung der Antwort.

export type Step = { step: string; detail?: string }
export type BenniAnswer = { ok: boolean; text?: string; sources?: { id: string; title: string }[]; ticket?: { kind: 'Meldung' | 'Idee'; title: string } }

/** Fragt Benni und meldet jeden Arbeitsschritt, sobald er beginnt (NDJSON-Stream der Function). */
export async function askBenni(message: string, history: { me: boolean; t: string }[], onStep: (s: Step) => void): Promise<BenniAnswer> {
  const { data: { session } } = await supabase!.auth.getSession()
  const r = await fetch(`${SUPABASE_URL}/functions/v1/assistant`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON}`, apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, stream: true }),
  })
  if (!r.ok || !r.body) return { ok: false }
  const reader = r.body.getReader(), dec = new TextDecoder()
  let buf = '', done: BenniAnswer | null = null
  for (;;) {
    const { value, done: end } = await reader.read()
    if (value) buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
      if (!line) continue
      try { const o = JSON.parse(line); if (o.done) done = o; else if (o.step) onStep(o) } catch { /* Zeile unvollständig */ }
    }
    if (end) break
  }
  return done ?? { ok: false }
}

function useStepLabel() {
  const { t } = useApp()
  const day = (d?: string) => {
    if (!d) return ''
    const today = isoDay(), tomorrow = isoDay(new Date(Date.now() + 864e5))
    if (d === today) return t('heute')
    if (d === tomorrow) return t('morgen')
    return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(d + 'T12:00:00Z'))
  }
  return (s: Step) => {
    switch (s.step) {
      case 'think': return t('Denkt nach')
      case 'calendar': return t('Schaut in deinen Kalender · {d}', { d: day(s.detail) })
      case 'week': return t('Schaut in deinen Dienstplan')
      case 'studio': return t('Schaut in den Studiokalender · {d}', { d: day(s.detail) })
      case 'client': return s.detail ? t('Sucht „{name}“ in Phorest', { name: s.detail }) : t('Liest die Kundenhistorie')
      case 'services': return t('Liest die Behandlungen')
      case 'phorest': return t('Fragt Phorest ab')
      case 'search': return t('Sucht im Wissen')
      case 'article': return s.detail ? t('Liest „{title}“', { title: s.detail }) : t('Liest einen Artikel')
      case 'news': return t('Liest die News')
      case 'onboarding': return t('Prüft dein Onboarding')
      case 'write': return t('Schreibt die Antwort')
      default: return t('Denkt nach')
    }
  }
}

/** Kugel, aktueller Schritt (schimmernd) und erledigte Schritte darunter. */
export function BenniWorking({ steps }: { steps: Step[] }) {
  const label = useStepLabel()
  const labels = steps.map(label).filter((x, i, a) => x && x !== a[i - 1])
  const current = labels[labels.length - 1] ?? label({ step: 'think' })
  const past = labels.slice(0, -1).slice(-3)
  return (
    <div className="flex gap-3 items-start pl-1 pt-1" aria-live="polite">
      <BMark className="w-8 h-8" working />
      <div className="min-w-0 pt-1.5">
        <p className="benni-shimmer text-[14px] leading-tight">{current} …</p>
        {past.length > 0 && <ul className="mt-2 space-y-1">{past.map((p, i) => <li key={i} className="flex items-center gap-1.5 text-[12px] text-mute"><Check size={12} strokeWidth={2.4} className="text-ok shrink-0" />{p}</li>)}</ul>}
      </div>
    </div>
  )
}

/** Antworttext: Absätze, Listen mit „- “ und **fett**. */
export function BenniText({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) { blocks.push({ list: false, lines: [] }); continue }
    const isItem = /^\s*[-•]\s+/.test(line)
    const last = blocks[blocks.length - 1]
    if (last && last.list === isItem && last.lines.length) last.lines.push(isItem ? line.replace(/^\s*[-•]\s+/, '') : line)
    else blocks.push({ list: isItem, lines: [isItem ? line.replace(/^\s*[-•]\s+/, '') : line] })
  }
  return <div className="space-y-2">{blocks.filter(b => b.lines.length).map((b, i) => b.list
    ? <ul key={i} className="space-y-1">{b.lines.map((l, j) => <li key={j} className="flex gap-2"><span className="mt-[9px] w-1 h-1 rounded-full bg-current opacity-50 shrink-0" /><span>{inline(l)}</span></li>)}</ul>
    : <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>)}</div>
}
