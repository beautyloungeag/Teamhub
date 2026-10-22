import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDashed, Copy, Hourglass, Info, Link2, Lock, Plus, Search, X, XCircle } from 'lucide-react'
import { toast } from '../Toast'
import { tr } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { Staff } from '../store'
import { TONE, type Tone } from '../tones'
import { Donut } from './charts'

// Bausteine des Backoffice: überall gleich aussehen und sich gleich verhalten (Design System Olive/Stein/Messing).

export const H = ({ children, action, info }: { children: ReactNode; action?: ReactNode; info?: string }) =>
  <div className="flex items-center justify-between gap-4 mb-6"><h1 className="text-[28px] flex items-center gap-2">{children}{info && <InfoTip text={info} />}</h1>{action}</div>
export const New = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
  <button onClick={onClick} className="h-10 px-4 rounded-[10px] bg-olive-700 hover:bg-olive-800 transition text-white text-[14px] flex items-center gap-1.5 shrink-0"><Plus size={16} />{children}</button>
// Fläche für Formulare und Vorschläge: Stein ohne Rahmen
export const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`rounded-[20px] bg-sage-50 ${className}`}>{children}</div>
// Seitenspalte neben einer Tabelle: keine Box, nur Linie
export const Side = ({ children }: { children: ReactNode }) => <div className="border-l border-line pl-6 self-start min-w-0">{children}</div>
export const Sec = ({ children, action }: { children: ReactNode; action?: ReactNode }) => <div className="flex items-baseline justify-between mb-2"><p className="rubric text-ink/70">{children}</p>{action}</div>
export const Th = ({ children }: { children?: ReactNode }) => <th className="text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">{children}</th>
export const Bar = ({ p, tone = 'olive' }: { p: number; tone?: 'olive' | 'brass' }) => <div className="h-2 w-full rounded-full bg-sage-100 overflow-hidden"><div className={`h-full rounded-full ${tone === 'olive' ? 'bg-done' : 'bg-note'}`} style={{ width: Math.min(100, p) + '%' }} /></div>
export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="block"><span className="block text-xs text-mute mb-1">{label}</span>{children}</label>
export const inp = 'w-full h-10 rounded-[10px] border border-transparent focus:border-sage-400 px-3 text-[14px] bg-white outline-none transition'
export const inpStone = 'w-full h-10 rounded-[10px] border border-transparent focus:border-sage-400 px-3 text-[14px] bg-sage-50 outline-none transition'
export const btn = 'h-10 px-4 rounded-[10px] bg-olive-700 hover:bg-olive-800 transition text-white text-[14px] disabled:opacity-60'
export const btn2 = 'h-10 px-4 rounded-[10px] bg-sage-50 hover:bg-sage-100 transition text-[14px]'
export const Err = ({ m }: { m: string }) => m ? <p className="text-[13px] text-alert">{m}</p> : null
// Neue oder geänderte Inhalte sofort übersetzen lassen (sonst übernimmt der 10-Minuten-Takt)
export const retranslate = () => { supabase?.functions.invoke('translate', { body: { action: 'sync' } }) }
// Testkonten der Entwicklung zählen in Zielgruppen, Quoten und Ranglisten nicht mit
export const real = (s: Staff) => s.active && !/@aleksa\.ai$/i.test(s.email)
export const isTest = (s: Staff) => /@aleksa\.ai$/i.test(s.email)
export const inBranch = (s: Staff, b: string) => s.branch_id === b || (s.extra ?? []).includes(b)

/** Kleines (i) mit Erklärung beim Darüberfahren statt eines Textblocks. */
export function InfoTip({ text, side = 'bottom' }: { text: string; side?: 'bottom' | 'left' }) {
  return (
    <span className="relative group inline-flex align-middle">
      <button type="button" aria-label={text} className="w-6 h-6 rounded-full text-mute hover:text-ink focus:text-ink flex items-center justify-center outline-none"><Info size={15} strokeWidth={1.8} /></button>
      <span role="tooltip" className={`pointer-events-none absolute z-40 w-72 rounded-[10px] bg-ink text-white text-[12.5px] font-normal leading-snug tracking-normal normal-case px-3 py-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition ${side === 'bottom' ? 'left-0 top-full mt-1.5' : 'right-full mr-2 top-0'}`}>{text}</span>
    </span>
  )
}

export type Opt = { value: string; label: string; hint?: string; group?: string }
/** Eigenes Dropdown statt des Browser-Menüs: Suche ab 8 Einträgen, Gruppen, Haken beim gewählten Eintrag. */
export function Select({ value, onChange, options, placeholder = 'Auswählen …', tone = 'white', disabled, className = '', label, compact }: {
  value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; tone?: 'white' | 'stone'; disabled?: boolean; className?: string; label?: string; compact?: boolean
}) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null), pop = useRef<HTMLDivElement>(null)
  // Liste frei über der Seite (nicht vom Dialog abgeschnitten), nach oben, wenn unten kein Platz ist
  const [at, setAt] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null)
  const place = () => {
    const r = box.current?.querySelector('button')?.getBoundingClientRect(); if (!r) return
    const below = window.innerHeight - r.bottom
    setAt(below < 320 && r.top > below ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 } : { left: r.left, width: r.width, top: r.bottom + 4 })
  }
  useEffect(() => {
    if (!open) return
    place()
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !pop.current?.contains(t)) setOpen(false) }
    const away = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', out); window.addEventListener('scroll', away, true); window.addEventListener('resize', away)
    return () => { document.removeEventListener('mousedown', out); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', away) }
  }, [open])
  useEffect(() => { if (!open) { setQ(''); setHi(0) } }, [open])
  const cur = options.find(o => o.value === value)
  const list = options.filter(o => !q || `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const pick = (v: string) => { onChange(v); setOpen(false) }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false) } return }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(list.length - 1, h + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) }
    if (e.key === 'Enter' && list[hi]) { e.preventDefault(); pick(list[hi].value) }
  }
  let lastGroup: string | undefined
  return (
    <div ref={box} className={`relative ${className}`} onKeyDown={key}>
      {label && <span className="block text-xs text-mute mb-1">{label}</span>}
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
        className={`w-full ${compact ? 'h-8 rounded-[8px] px-2.5 text-[13px]' : 'h-10 rounded-[10px] px-3 text-[14px]'} flex items-center gap-2 border transition outline-none disabled:opacity-60 disabled:cursor-default ${tone === 'white' ? 'bg-white' : 'bg-sage-50'} ${open ? 'border-sage-400' : 'border-transparent hover:border-line'}`}>
        <span className={`flex-1 truncate text-left ${cur ? '' : 'text-mute'}`}>{cur?.label ?? placeholder}</span>
        <ChevronDown size={15} className={`text-mute shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && at && createPortal(<motion.div ref={pop} initial={{ opacity: 0, y: at.top !== undefined ? -4 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} role="listbox" onKeyDown={key}
        style={{ position: 'fixed', left: at.left, top: at.top, bottom: at.bottom, minWidth: at.width }}
        className="z-[60] w-max max-w-[360px] rounded-[12px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-1">
        {options.length > 8 && <div className="flex items-center gap-2 px-2.5 h-9 mb-1 rounded-[8px] bg-sage-50"><Search size={14} className="text-mute" /><input autoFocus value={q} onChange={e => { setQ(e.target.value); setHi(0) }} placeholder="Suchen …" className="flex-1 bg-transparent outline-none text-[13.5px]" /></div>}
        <div className="max-h-72 overflow-y-auto">
          {list.length === 0 && <p className="px-3 py-2 text-[13px] text-mute">Nichts gefunden.</p>}
          {list.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null; lastGroup = o.group
            return <div key={o.value}>
              {head && <p className="px-3 pt-2 pb-1 text-[11px] text-mute">{head}</p>}
              <button type="button" role="option" aria-selected={o.value === value} onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}
                className={`w-full text-left px-3 py-2 rounded-[8px] flex items-center gap-3 text-[14px] ${i === hi ? 'bg-sage-50' : ''}`}>
                <span className="flex-1 min-w-0"><span className="block truncate">{o.label}</span>{o.hint && <span className="block text-[12px] text-mute truncate">{o.hint}</span>}</span>
                {o.value === value && <Check size={15} className="text-olive-700 shrink-0" />}
              </button>
            </div>
          })}
        </div>
      </motion.div>, document.body)}
    </div>
  )
}

/** Segmente (z. B. Offen · Erledigt): die Markierung gleitet weich zum gewählten Teil. */
export function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, ReactNode][] }) {
  const id = useId()
  return <div className="inline-flex gap-1 p-1 rounded-[10px] bg-sage-50 shrink-0">{items.map(([k, l]) =>
    <button key={k} onClick={() => onChange(k)} className={`relative h-8 px-3 rounded-[8px] text-[13px] transition-colors whitespace-nowrap ${value === k ? 'text-ink' : 'text-ink/60 hover:text-ink'}`}>
      {value === k && <motion.span layoutId={`seg-${id}`} transition={{ duration: .3, ease: [.22, 1, .36, 1] }} className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_2px_rgba(29,34,28,.08)]" />}
      <span className="relative">{l}</span></button>)}</div>
}

/** Mehrfachauswahl als Chips (Studios, Skills, Gruppen). */
export function Chips({ items, value, onChange, tone = 'white' }: { items: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; tone?: 'white' | 'stone' }) {
  return <div className="flex flex-wrap gap-1.5">{items.map(it => { const on = value.includes(it.value)
    return <button key={it.value} type="button" onClick={() => onChange(on ? value.filter(x => x !== it.value) : [...value, it.value])}
      className={`px-2.5 h-8 rounded-[8px] text-[13px] transition ${on ? 'bg-olive-700 text-white' : tone === 'white' ? 'bg-white text-ink/80 hover:bg-sage-100' : 'bg-sage-50 text-ink/80 hover:bg-sage-100'}`}>{it.label}</button> })}</div>
}

/** Dialog in der Mitte, für Formulare (Anlegen, Bearbeiten). Esc oder Klick daneben schliesst. */
export function Modal({ title, onClose, children, footer, width = 560 }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onMouseDown={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-ink/20 backdrop-blur-[6px]" />
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.16 }} onMouseDown={e => e.stopPropagation()}
        style={{ maxWidth: width }} className="relative w-full max-h-[calc(100dvh-48px)] flex flex-col rounded-[20px] bg-white shadow-[0_24px_64px_-24px_rgba(29,34,28,.45)]">
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3"><p className="text-[18px] font-medium">{title}</p>
          <button onClick={onClose} aria-label="Schliessen" className="w-9 h-9 rounded-full text-mute hover:text-ink hover:bg-sage-50 flex items-center justify-center"><X size={18} /></button></div>
        <div className="px-6 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line flex items-center justify-end gap-2">{footer}</div>}
      </motion.div>
    </div>
  )
}

/** Status-Punkt mit Text (offen, erledigt, überfällig …). */
export const Dot = ({ tone, children }: { tone: 'ok' | 'alert' | 'brass' | 'mute' | 'olive'; children: ReactNode }) =>
  <span className="inline-flex items-center gap-1.5"><span className={`w-[7px] h-[7px] rounded-full ${{ ok: 'bg-ok', alert: 'bg-alert', brass: 'bg-brass', mute: 'bg-sage-400', olive: 'bg-olive-700' }[tone]}`} />{children}</span>

/* ---------- Seiten, Abschnitte, Zustände ---------- */

/** Weg zurück zur Liste, oben links auf jeder Detailseite. */
export const Back = ({ onClick, children }: { onClick: () => void; children: ReactNode }) =>
  <button onClick={onClick} className="h-9 pl-2 pr-3 -ml-2 mb-4 rounded-[10px] hover:bg-sage-50 inline-flex items-center gap-1.5 text-[14px] text-ink/80"><ArrowLeft size={16} />{children}</button>

/** Abschnittskopf: Titel in Satzschreibung, Zähler, rechts eine Aktion. */
export const Section = ({ title, count, action, children, className = '' }: { title: ReactNode; count?: number | string; action?: ReactNode; children?: ReactNode; className?: string }) =>
  <section className={className}><div className="flex items-baseline justify-between gap-3 mb-2"><h2 className="font-sans text-[15px] font-medium tracking-normal">{title}{count !== undefined && <span className="ml-2 text-mute font-normal tabular-nums">{count}</span>}</h2>{action}</div>{children}</section>

/** Ein leerer Bereich: ein Satz, eine Aktion, oben links. */
export const Empty = ({ children, action }: { children: ReactNode; action?: ReactNode }) =>
  <p className="py-3 text-[14px] text-mute">{children}{action && <span className="ml-2">{action}</span>}</p>

/** Status als Icon plus Wort, überall gleich. */
type StatusKind = 'done' | 'open' | 'late' | 'wait' | 'no' | 'none' | 'yes'
export function Status({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  const I = { done: CheckCircle2, yes: CheckCircle2, open: Circle, late: AlertCircle, wait: Hourglass, no: XCircle, none: CircleDashed }[kind]
  // Farben wie in der App: erledigt grün, überfällig rot, wartet Messing
  const tone = { done: 'text-done', yes: 'text-done', open: 'text-ink/80', late: 'text-duty', wait: 'text-note', no: 'text-mute', none: 'text-mute' }[kind]
  return <span className={`inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap ${tone}`}><I size={14} strokeWidth={2} className="shrink-0" />{children}</span>
}

/** Datenzeile wie in einem System: Bezeichnung links, Wert rechts, Kopieren beim Darüberfahren. */
export function DataRow({ label, value, copy, href, muted }: { label: string; value: ReactNode; copy?: string | null; href?: string; muted?: boolean }) {
  const [ok, setOk] = useState(false)
  const doCopy = async () => { if (!copy) return; try { await navigator.clipboard.writeText(copy); setOk(true); toast(tr('{x} kopiert', { x: label })); setTimeout(() => setOk(false), 1400) } catch { /* Zwischenablage gesperrt */ } }
  const v = <span className={`text-right min-w-0 break-words ${muted ? 'text-mute' : 'text-ink'}`}>{value}</span>
  return (
    <div className="group min-h-[40px] py-2 flex items-start justify-between gap-6 text-[14px] border-b border-line last:border-b-0">
      <span className="text-mute shrink-0 pt-px">{label}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        {copy && <button type="button" onClick={doCopy} aria-label={tr('{x} kopieren', { x: label })} className="w-6 h-6 -my-0.5 rounded-[6px] text-mute hover:text-ink hover:bg-sage-50 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition shrink-0">{ok ? <Check size={13} /> : <Copy size={13} />}</button>}
        {href ? <a href={href} className="text-right min-w-0 break-words hover:underline underline-offset-2">{value}</a> : v}
      </span>
    </div>
  )
}

/** Kopf eines Datensatzes: Name mit Link-Icon, darunter woher er kommt. */
export const RecordHead = ({ name, source, right }: { name: ReactNode; source: string; right?: ReactNode }) =>
  <div className="flex items-start gap-2.5"><Link2 size={17} className="text-ok mt-1 shrink-0" /><div className="min-w-0 flex-1"><p className="text-[17px] font-medium leading-snug truncate">{name}</p><p className="text-[12.5px] text-mute">{source}</p></div>{right}</div>

/** Nur lesen: Schloss plus kurzer Grund. */
export const ReadOnly = ({ children }: { children: ReactNode }) => <span className="inline-flex items-center gap-1.5 text-[12.5px] text-mute"><Lock size={12} />{children}</span>

/** Zeile, die man anklicken kann: Hover-Fläche und Pfeil am Ende. */
export const RowLink = ({ onClick, children, className = '' }: { onClick: () => void; children: ReactNode; className?: string }) =>
  <button type="button" onClick={onClick} className={`group w-full text-left flex items-center gap-4 px-3 -mx-3 rounded-[10px] hover:bg-sage-50 transition-colors ${className}`}>{children}<ChevronRight size={16} className="text-sage-400 group-hover:text-ink shrink-0 transition-colors" /></button>

/* ---------- Gleiche Sprache wie die Mitarbeiter-App (Richtung B, 21./22.10.) ---------- */
// Farben der Töne als Hex für Ringe und Linien (Werte aus index.css)
export const TONE_HEX: Record<Tone, string> = { duty: '#93392B', note: '#7E5A22', learn: '#35566A', studio: '#3E4D36', done: '#3D6B38', plum: '#5E4468' }

/** Kennzahl als farbige Kachel wie „Checkliste / Pflicht offen / Wissen gelesen“ auf der Startseite der App. */
export function ToneTile({ tone, label, figure, meta, value, total, onClick }: { tone: Tone; label: string; figure: ReactNode; meta?: ReactNode; value?: number; total?: number; onClick?: () => void }) {
  const body = <>
    <span className={`text-[13.5px] font-semibold ${TONE[tone].fg}`}>{label}</span>
    <span className="mt-2.5 flex items-center gap-3.5">
      {total !== undefined && <Donut value={value ?? 0} total={total} size={50} stroke={6} tone={TONE_HEX[tone]} />}
      <span className="min-w-0"><span className="block font-display text-[26px] leading-tight tabular-nums text-ink whitespace-nowrap">{figure}</span>{meta && <span className="block text-[12.5px] text-ink/65 truncate">{meta}</span>}</span>
    </span>
  </>
  const cls = `text-left rounded-[20px] p-5 min-w-0 flex flex-col ${TONE[tone].bg}`
  return onClick ? <button onClick={onClick} className={`${cls} hover:brightness-[.98] transition`}>{body}</button> : <div className={cls}>{body}</div>
}

/** Zeichen in getönter Fläche (Hauptbereiche im Wissen, Arten von Meldungen). */
export const IconBox = ({ tone, children, size = 'w-11 h-11 rounded-[13px]' }: { tone: Tone; children: ReactNode; size?: string }) =>
  <span className={`${size} flex items-center justify-center shrink-0 ${TONE[tone].bg} ${TONE[tone].fg}`}>{children}</span>

/** Kleines farbiges Etikett wie in der App (Kategorie, Art). */
export const Tag = ({ tone, children }: { tone: Tone; children: ReactNode }) =>
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${TONE[tone].bg} ${TONE[tone].fg}`}>{children}</span>

/** Fortschritt als runder Balken in einer Tonfarbe. */
export const ToneBar = ({ value, total, tone = 'done' }: { value: number; total: number; tone?: Tone }) =>
  <div className="h-2 w-full rounded-full bg-sage-100 overflow-hidden"><div className={`h-full rounded-full transition-all ${TONE[tone].solid}`} style={{ width: (total ? Math.min(100, value / total * 100) : 0) + '%' }} /></div>
