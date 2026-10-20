import { useState, type ReactNode } from 'react'

// Diagramme ohne Bibliothek: Ring, Verlauf mit Vergleich, Säulen, Balkenliste. Farben nur aus der Marke
// (Olive in Stufen, Messing als Akzent), keine Verläufe, keine Flächen unter Linien.

const OLIVE = '#495940', LINE = '#E7E9E3', MUTE = '#979E92'
export const STEPS = ['#495940', '#7C8A72', '#A9B49F', '#D3D9CC']

/** Anteil als Ring mit Zahl in der Mitte. */
export function Donut({ value, total, size = 64, stroke = 7, children, tone = OLIVE }: { value: number; total: number; size?: number; stroke?: number; children?: ReactNode; tone?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = total ? Math.min(1, value / total) : 0
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LINE} strokeWidth={stroke} />
        {p > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.22,1,.36,1)' }} />}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12.5px] tabular-nums font-medium">{children ?? (total ? `${Math.round(p * 100)}%` : '–')}</span>
    </span>
  )
}

/** Mehrere Anteile in einem Ring (z. B. Neu / In Arbeit / Erledigt). */
export function DonutParts({ parts, size = 120, stroke = 12, children }: { parts: { value: number; color: string }[]; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, total = parts.reduce((a, b) => a + b.value, 0)
  let off = 0
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LINE} strokeWidth={stroke} />
        {total > 0 && parts.filter(p => p.value > 0).map((p, i) => { const len = c * p.value / total, el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} />; off += len; return el })}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">{children}</span>
    </span>
  )
}

export type Point = { label: string; a: number | null; b?: number | null; hint?: string }
/** Verlauf je Tag: Linie in Olive, Vergleich gestrichelt grau. Darüberfahren zeigt beide Werte. */
export function LineChart({ data, height = 200, fmt = (n: number) => String(n), aLabel = 'Dieser Zeitraum', bLabel = 'Zeitraum davor' }: { data: Point[]; height?: number; fmt?: (n: number) => string; aLabel?: string; bLabel?: string }) {
  const [hi, setHi] = useState<number | null>(null)
  const W = 720, H = height, pad = { l: 36, r: 8, t: 10, b: 24 }
  const vals = data.flatMap(d => [d.a, d.b]).filter((v): v is number => typeof v === 'number')
  const max = Math.max(1, ...vals), nice = niceMax(max)
  const x = (i: number) => pad.l + (data.length > 1 ? i * (W - pad.l - pad.r) / (data.length - 1) : (W - pad.l - pad.r) / 2)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice)
  const path = (k: 'a' | 'b') => data.map((d, i) => d[k] == null ? null : `${x(i)},${y(d[k] as number)}`).filter(Boolean).join(' L ')
  const ticks = [0, nice / 2, nice]
  const step = Math.ceil(data.length / 8)
  return (
    <div className="relative" onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" /></g>)}
        {data.some(d => d.b != null) && <path d={`M ${path('b')}`} fill="none" stroke={MUTE} strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        <path d={`M ${path('a')}`} fill="none" stroke={OLIVE} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={H - pad.b} stroke={MUTE} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {data.map((_, i) => <rect key={i} x={x(i) - (W / data.length) / 2} y={0} width={W / data.length} height={H} fill="transparent" onMouseEnter={() => setHi(i)} />)}
      </svg>
      {/* Achsen als HTML, damit die Schrift nicht mitskaliert */}
      <div className="absolute inset-0 pointer-events-none">
        {ticks.map(t => <span key={t} className="absolute left-0 text-[11px] text-mute tabular-nums -translate-y-1/2" style={{ top: `${y(t) / H * 100}%` }}>{fmt(t)}</span>)}
        {data.map((d, i) => i % step === 0 || i === data.length - 1 ? <span key={i} className="absolute bottom-0 text-[11px] text-mute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(i) / W * 100}%` }}>{d.label}</span> : null)}
        {hi !== null && data[hi].a != null && <span className="absolute w-2.5 h-2.5 rounded-full bg-white -translate-x-1/2 -translate-y-1/2" style={{ left: `${x(hi) / W * 100}%`, top: `${y(data[hi].a as number) / H * 100}%`, boxShadow: `inset 0 0 0 2px ${OLIVE}` }} />}
        {hi !== null && <div className="absolute top-0 -translate-x-1/2 rounded-[10px] bg-white px-3 py-2 text-[12.5px] shadow-[0_8px_24px_-8px_rgba(29,34,28,.35)] whitespace-nowrap" style={{ left: `clamp(70px, ${x(hi) / W * 100}%, calc(100% - 70px))` }}>
          <p className="text-mute">{data[hi].hint ?? data[hi].label}</p>
          <p className="flex items-center gap-2 mt-0.5"><span className="w-2.5 h-[2px] rounded" style={{ background: OLIVE }} />{aLabel}<span className="ml-auto pl-3 tabular-nums font-medium">{data[hi].a != null ? fmt(data[hi].a as number) : '–'}</span></p>
          {data[hi].b !== undefined && <p className="flex items-center gap-2"><span className="w-2.5 h-[2px] rounded border-t border-dashed" style={{ borderColor: MUTE }} />{bLabel}<span className="ml-auto pl-3 tabular-nums">{data[hi].b != null ? fmt(data[hi].b as number) : '–'}</span></p>}
        </div>}
      </div>
    </div>
  )
}

/** Säulen je Tag (z. B. erledigte Aufgaben in Prozent). */
export function Columns({ data, height = 140, max = 100, fmt = (n: number) => `${n}%`, onPick }: { data: { label: string; value: number | null; hint?: string; tone?: string }[]; height?: number; max?: number; fmt?: (n: number) => string; onPick?: (i: number) => void }) {
  const [hi, setHi] = useState<number | null>(null)
  return (
    <div className="relative" onMouseLeave={() => setHi(null)}>
      <div className="flex items-end gap-[6px]" style={{ height }}>
        {data.map((d, i) => <button key={i} type="button" onMouseEnter={() => setHi(i)} onClick={() => onPick?.(i)} className={`flex-1 h-full flex items-end rounded-[4px] ${onPick ? 'cursor-pointer' : 'cursor-default'}`}>
          <span className="w-full rounded-[4px] transition-[height] duration-500" style={{ height: d.value == null ? 3 : `${Math.max(3, d.value / max * 100)}%`, background: d.value == null ? LINE : d.tone ?? (hi === i ? '#2F3A29' : OLIVE), opacity: d.value == null ? 1 : hi === null || hi === i ? 1 : .55 }} />
        </button>)}
      </div>
      <div className="flex gap-[6px] mt-1.5">{data.map((d, i) => <span key={i} className="flex-1 text-center text-[10.5px] text-mute truncate">{d.label}</span>)}</div>
      {hi !== null && <div className="absolute -top-2 -translate-x-1/2 -translate-y-full rounded-[10px] bg-white px-3 py-1.5 text-[12.5px] shadow-[0_8px_24px_-8px_rgba(29,34,28,.35)] whitespace-nowrap pointer-events-none" style={{ left: `${(hi + .5) / data.length * 100}%` }}>
        <span className="text-mute">{data[hi].hint ?? data[hi].label}</span> <span className="tabular-nums font-medium ml-1">{data[hi].value == null ? 'keine Liste' : fmt(data[hi].value as number)}</span></div>}
    </div>
  )
}

/** Anteile als Liste mit dünnen Balken: Name, Balken, Wert. */
export function BarList({ items, fmt = (n: number) => String(n), onPick }: { items: { label: ReactNode; value: number; total?: number; hint?: string; key?: string }[]; fmt?: (n: number) => string; onPick?: (key: string) => void }) {
  const max = Math.max(1, ...items.map(i => i.total ?? i.value))
  return <ul className="space-y-2.5">{items.map((it, i) => { const base = it.total ?? max
    return <li key={it.key ?? i}><button type="button" disabled={!onPick} onClick={() => it.key && onPick?.(it.key)} className="w-full text-left grid grid-cols-[minmax(0,120px)_1fr_auto] items-center gap-3 text-[13.5px] disabled:cursor-default group">
      <span className="truncate group-enabled:group-hover:text-olive-700">{it.label}</span>
      <span className="h-2 rounded-full bg-line overflow-hidden"><span className="block h-full rounded-full bg-olive-700 transition-[width] duration-500" style={{ width: `${base ? it.value / base * 100 : 0}%` }} /></span>
      <span className="tabular-nums text-ink/80 text-right min-w-[64px]">{fmt(it.value)}{it.total !== undefined && <span className="text-mute"> / {it.total}</span>}</span>
    </button></li> })}</ul>
}

function niceMax(n: number) {
  const p = Math.pow(10, Math.floor(Math.log10(n))), m = n / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}
