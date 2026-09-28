import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, MapPin, Search, Check, CalendarDays } from 'lucide-react'
import { STAFF } from './staff'
import { EVENTS } from './data'
import { useApp } from './store'

/* ---------- Terminbuch (lesend aus Phorest) ---------- */
// Beispielbelegung, deterministisch je Filiale. Echte Daten: Phorest /appointment?branch_id&date, /staff, /staff/worktimetable.
const SERVICES: [string, string, number][] = [
  ['Forming Brows', '#7FB77E', 30], ['Dry Manicure Business', '#7FB77E', 30], ['Auffüllen Gel Nails', '#E8837A', 60], ['Dry Business Pedicure', '#8EC3E6', 45],
  ['Gesichtsbehandlung Classic', '#F2D64B', 60], ['Lashlifting mit Färben', '#B58FD6', 45], ['Waxing Beine komplett', '#F29BC0', 30], ['French Nails / Full Colour', '#E8837A', 45],
]
const CLIENTS = ['A. Meier', 'F. Weber', 'K. Bühler', 'P. Kaufmann', 'U. Schmid', 'Z. Bosshard', 'E. Iseli', 'J. Zbinden', 'O. Frei', 'T. Kunz', 'Y. Lüthi', 'D. Möller', 'I. Aebi', 'N. Dietrich', 'S. Koch', 'X. Muster']
const START = 8, END = 19, SLOT = 44 // px je halbe Stunde
type Block = { start: number; dur: number; client: string; service: string; color: string; pause?: boolean }

// Pratteln heute: nachgebaut aus dem Phorest-Screenshot vom 25.09.2026 (Nachnamen gekürzt).
const G = '#7FB77E', R = '#E8837A', Y = '#F2D64B', B = '#8EC3E6', P = '#B58FD6', T = '#5BB5A2', K = '#555A60'
const b = (start: number, dur: number, client: string, service: string, color: string): Block => ({ start, dur, client, service, color })
export const PRATTELN_TODAY: { name: string; tag: string; from: number; blocks: Block[] }[] = [
  { name: 'Bea', tag: 'D/SR', from: 8, blocks: [b(8, .25, 'Kundin F.', 'Forming Brows', G), b(8.25, .5, 'Kundin G.', 'Dry Business Pedicure · Pedi Stuhl 1', G), b(8.75, .25, '', 'mit Shellack', G), b(9, .25, 'Kundin H.', 'Forming Brows', G), b(9.25, .5, 'Kundin I.', 'Dry Manicure Business · Tisch 2', G), b(9.75, .25, '', 'mit perm. Shellack', G), b(10, .5, 'Nele D.', 'Dry Manicure Business · Natural Shine Finish', G), b(10.5, .25, 'Kundin J.', 'Forming Brows', G), b(11.25, .75, 'Kundin K.', 'Auffüllen Gel Nails · Tisch 1', R), b(12, .25, '', 'French Nails / Full Colour', '#F29BC0'), b(12.25, .75, 'Nele B.', 'Auffüllen Gel Nails · Tisch 1', R), b(13, .25, '', 'French Nails / Full Colour', '#F29BC0')] },
  { name: 'Klara', tag: 'F/EN/D', from: 9, blocks: [b(9, .75, 'Kundin L.', 'Auffüllen Gel Nails · Tisch 1', G), b(9.75, .25, '', 'French Nails / Full Colour', G), b(10, .25, 'Kundin L.', 'Forming Brows', G), b(10.5, 1.25, 'Kundin M.', 'Auffüllen Colour / French · Tisch 2', Y), b(11.75, .25, 'Kundin N.', 'Forming Brows', P), b(12.5, .5, 'Kundin O.', 'Dry Manicure Business · Tisch 2', R), b(13, .25, '', 'mit perm. Shellack', '#F29BC0')] },
  { name: 'Juna', tag: 'DE/EN', from: 9, blocks: [b(9, 1, 'Kundin P.', 'Auffüllen Gel Nails · Natural Finish', G), b(10.25, .75, 'Kundin Q.', 'Dry Manicure Business · Tisch 3', Y), b(11, .75, 'Kundin Q.', 'Dry Business Pedicure · mit Farblack', Y), b(11.75, .25, 'Kundin Q.', 'Brow Tinting', Y), b(12, .25, 'Kundin Q.', 'Forming Brows', Y), b(12.25, .75, 'Tina I.', 'Auffüllen Gel Nails · Tisch 3', B), b(13, .25, '', 'Babyboomer weiss / farbe', B)] },
  { name: 'Elena', tag: 'D', from: 12, blocks: [b(12, 1, 'Kundin R.', 'Auffüllen Gel Nails · Tisch 4', R), b(13, .5, 'Kundin S.', 'Dry Business Pedicure', T)] },
  { name: 'Nina', tag: 'D/E', from: 9, blocks: [b(12, 1, '', 'Pause', K)] },
]

function dayFor(branch: string, dayIdx: number) {
  if (branch === 'Pratteln' && dayIdx === 0) return PRATTELN_TODAY.map((c, i) => ({ s: { id: 900 + i, first: `${c.name} (${c.tag})`, last: ' ', branch, role: '', skills: [] }, off: false, from: c.from, blocks: c.blocks.map(x => x.service === 'Pause' ? { ...x, pause: true } : x) }))
  const staff = STAFF.filter(s => s.branch === branch).slice(0, 5)
  let seed = branch.length * 31 + dayIdx * 7
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  return staff.map((s, i) => {
    const off = i === 3 && dayIdx % 2 === 0
    const from = START + (i === 2 ? 1 : 0) + (i === 4 ? 4 : 0)
    const blocks: Block[] = []
    if (!off) {
      let t = from + Math.floor(rnd() * 2) * 0.5
      while (t < END - 1) {
        if (t >= 12 && t < 12.5 && !blocks.some(b => b.pause)) { blocks.push({ start: t, dur: 1, client: '', service: 'Pause', color: '#555A60', pause: true }); t += 1; continue }
        if (rnd() < 0.08) { t += 0.5; continue }
        const [service, color, min] = SERVICES[Math.floor(rnd() * SERVICES.length)]
        const dur = min / 60
        blocks.push({ start: t, dur, client: CLIENTS[Math.floor(rnd() * CLIENTS.length)], service, color }); t += dur
      }
    }
    return { s, off, from, blocks }
  })
}
const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`
const DAYS = ['Heute', 'Sa', 'So', 'Mo', 'Di', 'Mi', 'Do']
const BL = ['Basel 1', 'Basel 2', 'Oberwil', 'Pratteln', 'Reinach', 'Riehen']

export function Terminbuch({ compact }: { compact?: boolean }) {
  const { me } = useApp()
  const [branch, setBranch] = useState(BL.includes(me.branch) ? me.branch : 'Basel 1')
  const [day, setDay] = useState(0)
  const [pick, setPick] = useState(false)
  const [q, setQ] = useState('')
  const [onlyMe, setOnlyMe] = useState(compact)
  const cols = useMemo(() => dayFor(branch, day), [branch, day])
  const mine = cols.find(c => c.s.id === me.id || c.s.first.startsWith(me.first)) ?? cols[0]
  const shown = onlyMe && branch === me.branch ? [mine] : cols
  const hits = q.length > 1 ? cols.flatMap(c => c.blocks.filter(b => b.client.toLowerCase().includes(q.toLowerCase())).map(b => ({ ...b, who: c.s.first }))) : []
  const colW = compact ? (onlyMe ? 'w-full' : 'w-[150px]') : 'w-[210px]'
  const nowLine = (10 + 43 / 60 - START) * 2 * SLOT

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <button onClick={() => setPick(!pick)} className="h-10 pl-3 pr-2.5 rounded-xl bg-white border border-sage-200 flex items-center gap-2 text-[14px] font-medium"><MapPin size={16} className="text-sage-800" />{branch}<ChevronDown size={16} className="text-mute" /></button>
          {pick && <div className="absolute z-20 mt-1.5 w-64 rounded-2xl bg-white shadow-lg border border-sage-100 p-1.5">
            <p className="px-3 pt-2 pb-1 text-xs text-mute">Deine Standorte</p>
            {BL.map(b => <button key={b} onClick={() => { setBranch(b); setPick(false) }} className={`w-full h-10 px-3 rounded-xl flex items-center gap-2.5 text-[14px] ${b === branch ? 'bg-sage-50 font-medium' : ''}`}><MapPin size={15} className="text-sage-600" />Beautylounge {b}{b === branch && <Check size={16} className="ml-auto" />}</button>)}
          </div>}
        </div>
        {!compact && <div className="h-10 flex-1 min-w-[200px] max-w-sm rounded-xl bg-white border border-sage-200 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Kundin suchen" className="flex-1 outline-none text-[14px] bg-transparent" /></div>}
        {compact && <button onClick={() => setOnlyMe(!onlyMe)} className="h-10 px-3 rounded-xl bg-white border border-sage-200 text-[13px]">{onlyMe ? 'Ganzes Team' : 'Nur ich'}</button>}
        {!compact && <div className="ml-auto flex p-1 rounded-xl bg-sage-50"><button className="h-8 px-3 rounded-lg bg-white text-[13px] font-medium">Tag</button><button className="h-8 px-3 rounded-lg text-[13px] text-sage-800">Woche</button></div>}
      </div>
      {compact && <div className="mt-2 h-10 rounded-xl bg-white border border-sage-200 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Kundin suchen" className="flex-1 outline-none text-[14px] bg-transparent" /></div>}

      {hits.length > 0 && <div className="mt-2 rounded-2xl bg-white border border-sage-100 divide-y divide-sage-50">{hits.slice(0, 5).map((h, i) => <div key={i} className="px-3 py-2 text-[13px] flex justify-between"><span>{h.client} · {h.service}</span><span className="text-mute">{fmt(h.start)} · {h.who}</span></div>)}</div>}

      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button onClick={() => setDay(Math.max(0, day - 1))} className="w-9 h-9 rounded-lg bg-white border border-sage-200 flex items-center justify-center shrink-0"><ChevronLeft size={16} /></button>
        {DAYS.map((d, i) => <button key={d} onClick={() => setDay(i)} className={`h-9 px-3 rounded-lg text-[13px] shrink-0 ${day === i ? 'bg-ink text-white' : 'bg-white border border-sage-200'}`}>{d}</button>)}
        <button onClick={() => setDay(Math.min(6, day + 1))} className="w-9 h-9 rounded-lg bg-white border border-sage-200 flex items-center justify-center shrink-0"><ChevronRight size={16} /></button>
      </div>

      <div className="mt-3 flex-1 min-h-0 rounded-2xl bg-white border border-sage-100 overflow-auto no-scrollbar">
        <div className="flex min-w-max">
          <div className="w-12 shrink-0 sticky left-0 z-10 bg-white">
            <div className="h-12 border-b border-sage-100 sticky top-0 bg-white" />
            {Array.from({ length: (END - START) * 2 }, (_, i) => <div key={i} style={{ height: SLOT }} className="text-[10px] text-mute text-right pr-1.5 -mt-1.5">{i % 2 ? '' : `${START + i / 2}`}</div>)}
          </div>
          {shown.map(c => (
            <div key={c.s.id} className={`${colW} shrink-0 border-l border-sage-100`}>
              <div className="h-12 px-2.5 border-b border-sage-100 flex items-center gap-2 sticky top-0 bg-white z-10">
                <span className="w-7 h-7 rounded-full bg-sage-200 text-sage-800 text-[11px] font-medium flex items-center justify-center shrink-0">{c.s.first[0]}{c.s.last.trim()[0] ?? ''}</span>
                <span className="text-[13px] font-medium truncate">{c.s.first}</span>
              </div>
              <div className="relative" style={{ height: (END - START) * 2 * SLOT }}>
                {Array.from({ length: (END - START) * 2 }, (_, i) => <div key={i} style={{ top: i * SLOT, height: SLOT }} className={`absolute inset-x-0 ${i % 2 ? 'border-b border-sage-50' : 'border-b border-sage-100'}`} />)}
                {(c.off || c.from > START) && <div className="absolute inset-x-0 top-0 bg-sage-100/70" style={{ height: c.off ? '100%' : (c.from - START) * 2 * SLOT }}>{c.off && <p className="p-2 text-xs text-mute">Abwesend · Timebutler</p>}</div>}
                {c.blocks.map((b, i) => (
                  <div key={i} className="absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden text-[11px] leading-tight" style={{ top: (b.start - START) * 2 * SLOT + 1, height: b.dur * 2 * SLOT - 2, background: b.color, color: b.pause ? '#fff' : '#0B0D12' }}>
                    {b.pause ? <p>Pause</p> : <><p className="font-semibold truncate">{b.client}</p><p className="truncate">{b.service}</p><p className="opacity-70">{fmt(b.start)}–{fmt(b.start + b.dur)}</p></>}
                  </div>
                ))}
                {day === 0 && <div className="absolute inset-x-0 h-0.5 bg-[#D93A2B]" style={{ top: nowLine }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-mute">{onlyMe ? `Deine Termine aus Phorest · zugeordnet über ${me.first.toLowerCase()}@beautylounge.ch` : 'Live aus Phorest, nur lesend.'} Ändern, Bezahlen und Check-in bleiben in Phorest.</p>
    </div>
  )
}

/* ---------- Mein Kalender: Phorest-Termine + Schulungen/Events + Timebutler ---------- */
type Item = { time: string; end?: string; title: string; sub: string; src: 'phorest' | 'event' | 'off'; color: string; eventId?: number }
const SRC = { phorest: { label: 'Termine', color: '#7FB77E' }, event: { label: 'Schulungen', color: '#C0634B' }, off: { label: 'Abwesend', color: '#6B9BC3' } } as const
const hm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
const key = (m: number, d: number) => `${m}-${d}`
// Monat 9 = September, 10 = Oktober 2026
const EVENT_DAYS: Record<string, number> = { [key(10, 5)]: 1, [key(10, 7)]: 2, [key(10, 15)]: 3 }
const OFF_DAYS: Record<string, string> = { [key(9, 23)]: 'Berufsschule', [key(9, 27)]: 'Frei', [key(10, 15)]: 'Ferien', [key(10, 16)]: 'Ferien' }

function itemsFor(m: number, d: number): Item[] {
  const out: Item[] = []
  const dow = (new Date(2026, m - 1, d).getDay() + 6) % 7 // Mo=0
  const off = OFF_DAYS[key(m, d)] ?? (dow === 6 ? 'Frei' : undefined)
  if (off) out.push({ time: 'ganztags', title: off, sub: 'aus Timebutler', src: 'off', color: SRC.off.color })
  if (!off) {
    if (m === 9 && d === 25) PRATTELN_TODAY[0].blocks.filter(b => b.client).forEach(b => out.push({ time: hm(b.start), end: hm(b.start + b.dur), title: b.client, sub: b.service, src: 'phorest', color: b.color }))
    else {
      let seed = m * 97 + d * 13; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
      let t = dow === 5 ? 9 : 8
      const endH = dow === 5 ? 15 : 17
      while (t < endH - 0.5) {
        if (rnd() < 0.25) { t += 0.5; continue }
        const [service, color, min] = SERVICES[Math.floor(rnd() * SERVICES.length)]
        out.push({ time: hm(t), end: hm(t + min / 60), title: CLIENTS[Math.floor(rnd() * CLIENTS.length)], sub: service, src: 'phorest', color }); t += min / 60
      }
    }
  }
  const ev = EVENT_DAYS[key(m, d)]
  if (ev) { const e = EVENTS.find(x => x.id === ev)!; out.push({ time: e.time.split('–')[0], end: e.time.split('–')[1], title: e.title, sub: `${e.link ? 'Online' : e.place} · ${e.deadline}`, src: 'event', color: SRC.event.color, eventId: e.id }) }
  return out.sort((a, b) => (a.time === 'ganztags' ? -1 : b.time === 'ganztags' ? 1 : a.time.localeCompare(b.time)))
}

export function EventCalendar() {
  const { joined, toggleEvent } = useApp()
  const [m, setM] = useState(9), [sel, setSel] = useState(25)
  const [show, setShow] = useState({ phorest: true, event: true, off: true })
  const first = (new Date(2026, m - 1, 1).getDay() + 6) % 7
  const days = new Date(2026, m, 0).getDate()
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => i - first + 1)
  const list = itemsFor(m, sel).filter(x => show[x.src])
  const monthName = m === 9 ? 'September' : 'Oktober'
  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(Object.keys(SRC) as (keyof typeof SRC)[]).map(k => (
          <button key={k} onClick={() => setShow(v => ({ ...v, [k]: !v[k] }))} className={`h-8 px-3 rounded-full text-[13px] flex items-center gap-1.5 ${show[k] ? 'bg-white' : 'bg-transparent text-mute line-through'}`}>
            <span className="w-2 h-2 rounded-full" style={{ background: SRC[k].color, opacity: show[k] ? 1 : .4 }} />{SRC[k].label}
          </button>
        ))}
      </div>
      <div className="rounded-[20px] bg-white p-4">
        <div className="flex items-center justify-between"><p className="font-semibold text-[17px]">{monthName} 2026</p>
          <div className="flex gap-1"><button disabled={m === 9} onClick={() => { setM(9); setSel(25) }} className="w-8 h-8 rounded-lg bg-sage-50 flex items-center justify-center disabled:opacity-30"><ChevronLeft size={16} /></button><button disabled={m === 10} onClick={() => { setM(10); setSel(5) }} className="w-8 h-8 rounded-lg bg-sage-50 flex items-center justify-center disabled:opacity-30"><ChevronRight size={16} /></button></div></div>
        <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-mute">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => <span key={d}>{d}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-y-0.5">
          {cells.map((d, i) => {
            const valid = d >= 1 && d <= days
            const its = valid ? itemsFor(m, d) : []
            const srcs = [...new Set(its.map(x => x.src))].filter(x => show[x])
            const today = m === 9 && d === 25
            return <button key={i} disabled={!valid} onClick={() => setSel(d)} className="h-11 flex flex-col items-center justify-center">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] ${!valid ? 'text-transparent' : sel === d ? 'bg-ink text-white' : today ? 'text-[#C0634B] font-semibold' : ''}`}>{valid ? d : ''}</span>
              <span className="flex gap-0.5 h-1.5 mt-0.5">{srcs.map(x => <span key={x} className="w-1 h-1 rounded-full" style={{ background: SRC[x].color }} />)}</span>
            </button>
          })}
        </div>
      </div>
      <p className="mt-5 mb-2 px-1 text-[13px] font-medium text-sage-800">{m === 9 && sel === 25 ? 'Heute, ' : ''}{sel}. {monthName} · {list.length} Einträge</p>
      <div className="rounded-[20px] bg-white divide-y divide-sage-50 overflow-hidden">
        {list.length === 0 && <p className="px-4 py-4 text-[14px] text-mute">Nichts eingetragen.</p>}
        {list.map((x, i) => { const j = x.eventId ? joined.has(x.eventId) : false
          return <div key={i} className="flex gap-3 px-4 py-3">
            <div className="w-11 shrink-0"><p className="text-[14px] font-medium">{x.time === 'ganztags' ? '' : x.time}</p><p className="text-xs text-mute">{x.time === 'ganztags' ? 'ganztags' : x.end}</p></div>
            <div className="flex-1 border-l-[3px] pl-3" style={{ borderColor: x.color }}>
              <p className="text-[15px]">{x.title}</p><p className="text-[13px] text-mute">{x.sub}</p>
              <p className="text-[11px] mt-0.5" style={{ color: SRC[x.src].color }}>{x.src === 'phorest' ? 'Phorest' : x.src === 'off' ? 'Timebutler' : 'TeamHub'}</p>
              {x.eventId && <button onClick={() => toggleEvent(x.eventId!)} className={`mt-2 h-8 px-3.5 rounded-full text-[12px] ${j ? 'bg-sage-100 text-sage-800' : 'bg-ink text-white'}`}>{j ? 'Angemeldet' : 'Anmelden'}</button>}
            </div>
          </div>
        })}
      </div>
      <p className="mt-3 px-1 text-xs text-mute flex items-center gap-1"><CalendarDays size={12} />Drei Quellen, eine Ansicht. Termine ändern bleibt in Phorest, Ferien in Timebutler.</p>
    </div>
  )
}
