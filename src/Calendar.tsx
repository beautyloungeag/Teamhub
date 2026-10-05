import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, MapPin, Search, Check, CalendarDays } from 'lucide-react'
import { useApp, isoDay, fmtTime, zurichHour, type Ev } from './store'
import { phorest, toHours, type BranchDay, type MyDay } from './lib/phorest'
import { tr, locale } from './lib/i18n'

/* ---------- Kundentermine (lesend aus Phorest) ---------- */
const START = 8, END = 20, SLOT = 44 // px je halbe Stunde
const COLORS = ['#7FB77E', '#E8837A', '#F2D64B', '#8EC3E6', '#B58FD6', '#F29BC0', '#5BB5A2']
const colorFor = (service: string) => COLORS[[...service].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
const dayOffset = (n: number) => isoDay(new Date(Date.now() + n * 864e5))
const dayLabel = (n: number) => n === 0 ? tr('Heute') : new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', weekday: 'short', day: 'numeric' }).format(new Date(Date.now() + n * 864e5))

export function Terminbuch({ compact }: { compact?: boolean }) {
  const { me, branches, myPhorest, t } = useApp()
  // Nur eigene Filiale(n); das Büro sieht alle Studios (so prüft es auch der Server)
  const allowed = branches.filter(b => !b.is_office && (me.app_role === 'buero' || b.id === me.branch_id || myPhorest.some(m => m.branch_id === b.id)))
  const [branch, setBranch] = useState(allowed.find(b => b.id === me.branch_id)?.id ?? allowed[0]?.id ?? '')
  const [day, setDay] = useState(0)
  const [pick, setPick] = useState(false)
  const [q, setQ] = useState('')
  const [onlyMe, setOnlyMe] = useState(!!compact && myPhorest.length > 0)
  const [data, setData] = useState<BranchDay | null>(null)
  useEffect(() => { if (!branch) return; setData(null); phorest<BranchDay>({ action: 'branch_day', branch, date: dayOffset(day) }).then(setData) }, [branch, day])
  const myStaff = myPhorest.filter(m => m.branch_id === branch).map(m => m.staff_id)
  const cols = data?.ok ? data.columns : []
  const shown = onlyMe && myStaff.length ? cols.filter(c => myStaff.includes(c.staff_id)) : cols
  const hits = q.length > 1 && data?.ok ? data.appointments.filter(a => a.client.toLowerCase().includes(q.toLowerCase())).map(a => ({ ...a, who: cols.find(c => c.staff_id === a.staff_id)?.name ?? '' })) : []
  const colW = compact ? (onlyMe ? 'w-full' : 'w-[150px]') : 'w-[210px]'
  const nowH = zurichHour()
  const bname = branches.find(b => b.id === branch)?.name ?? ''
  if (!allowed.length) return <p className="text-[14px] text-mute">{t('Für dein Konto ist kein Studio mit Phorest-Kalender hinterlegt.')}</p>

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <button onClick={() => allowed.length > 1 && setPick(!pick)} className="h-10 pl-3 pr-2.5 rounded-xl bg-white border border-sage-200 flex items-center gap-2 text-[14px] font-medium"><MapPin size={16} className="text-sage-800" />{bname}{allowed.length > 1 && <ChevronDown size={16} className="text-mute" />}</button>
          {pick && <div className="absolute z-20 mt-1.5 w-64 rounded-2xl bg-white shadow-lg border border-sage-100 p-1.5">
            <p className="px-3 pt-2 pb-1 text-xs text-mute">{t('Deine Standorte')}</p>
            {allowed.map(b => <button key={b.id} onClick={() => { setBranch(b.id); setPick(false) }} className={`w-full h-10 px-3 rounded-xl flex items-center gap-2.5 text-[14px] ${b.id === branch ? 'bg-sage-50 font-medium' : ''}`}><MapPin size={15} className="text-sage-600" />Beautylounge {b.name}{b.id === branch && <Check size={16} className="ml-auto" />}</button>)}
          </div>}
        </div>
        {!compact && <div className="h-10 flex-1 min-w-[200px] max-w-sm rounded-xl bg-white border border-sage-200 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Kundin suchen')} className="flex-1 outline-none text-[14px] bg-transparent" /></div>}
        {compact && myStaff.length > 0 && <button onClick={() => setOnlyMe(!onlyMe)} className="h-10 px-3 rounded-xl bg-white border border-sage-200 text-[13px]">{onlyMe ? t('Ganzes Team') : t('Nur ich')}</button>}
      </div>
      {compact && <div className="mt-2 h-10 rounded-xl bg-white border border-sage-200 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Kundin suchen')} className="flex-1 outline-none text-[14px] bg-transparent" /></div>}

      {hits.length > 0 && <div className="mt-2 rounded-2xl bg-white border border-sage-100 divide-y divide-sage-50">{hits.slice(0, 5).map((h, i) => <div key={i} className="px-3 py-2 text-[13px] flex justify-between"><span>{h.client} · {h.service}</span><span className="text-mute">{h.start} · {h.who}</span></div>)}</div>}

      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button onClick={() => setDay(Math.max(0, day - 1))} className="w-9 h-9 rounded-lg bg-white border border-sage-200 flex items-center justify-center shrink-0"><ChevronLeft size={16} /></button>
        {Array.from({ length: 7 }, (_, i) => <button key={i} onClick={() => setDay(i)} className={`h-9 px-3 rounded-lg text-[13px] shrink-0 ${day === i ? 'bg-ink text-white' : 'bg-white border border-sage-200'}`}>{dayLabel(i)}</button>)}
        <button onClick={() => setDay(Math.min(6, day + 1))} className="w-9 h-9 rounded-lg bg-white border border-sage-200 flex items-center justify-center shrink-0"><ChevronRight size={16} /></button>
      </div>

      <div className="mt-3 flex-1 min-h-0 rounded-2xl bg-white border border-sage-100 overflow-auto no-scrollbar">
        {!data && <p className="p-4 text-[14px] text-mute">{t('Lädt aus Phorest …')}</p>}
        {data && !data.ok && <p className="p-4 text-[14px] text-mute">{t('Phorest ist gerade nicht erreichbar. Bitte später noch einmal versuchen.')}</p>}
        {data?.ok && shown.length === 0 && <p className="p-4 text-[14px] text-mute">{t('An diesem Tag ist niemand eingeplant.')}</p>}
        {data?.ok && shown.length > 0 && <div className="flex min-w-max">
          <div className="w-12 shrink-0 sticky left-0 z-10 bg-white">
            <div className="h-12 border-b border-sage-100 sticky top-0 bg-white" />
            {Array.from({ length: (END - START) * 2 }, (_, i) => <div key={i} style={{ height: SLOT }} className="text-[10px] text-mute text-right pr-1.5 -mt-1.5">{i % 2 ? '' : `${START + i / 2}`}</div>)}
          </div>
          {shown.map(c => {
            const blocks = data.appointments.filter(a => a.staff_id === c.staff_id)
            const from = c.shift ? toHours(c.shift.start) : END, to = c.shift ? toHours(c.shift.end) : END
            return (
              <div key={c.staff_id} className={`${colW} shrink-0 border-l border-sage-100`}>
                <div className="h-12 px-2.5 border-b border-sage-100 flex items-center gap-2 sticky top-0 bg-white z-10">
                  <span className="w-7 h-7 rounded-full bg-sage-200 text-sage-800 text-[11px] font-medium flex items-center justify-center shrink-0">{c.name.slice(0, 2).toUpperCase()}</span>
                  <span className="text-[13px] font-medium truncate">{c.name}</span>
                </div>
                <div className="relative" style={{ height: (END - START) * 2 * SLOT }}>
                  {Array.from({ length: (END - START) * 2 }, (_, i) => <div key={i} style={{ top: i * SLOT, height: SLOT }} className={`absolute inset-x-0 ${i % 2 ? 'border-b border-sage-50' : 'border-b border-sage-100'}`} />)}
                  {/* ausserhalb der Schicht grau */}
                  {from > START && <div className="absolute inset-x-0 top-0 bg-sage-100/70" style={{ height: (Math.min(from, END) - START) * 2 * SLOT }}>{!c.shift && <p className="p-2 text-xs text-mute">{t('Nicht eingeplant')}</p>}</div>}
                  {c.shift && to < END && <div className="absolute inset-x-0 bg-sage-100/70" style={{ top: (to - START) * 2 * SLOT, bottom: 0 }} />}
                  {blocks.map((b, i) => { const s = toHours(b.start), e = toHours(b.end)
                    return <div key={i} className="absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden text-[11px] leading-tight" style={{ top: (s - START) * 2 * SLOT + 1, height: Math.max((e - s) * 2 * SLOT - 2, 18), background: colorFor(b.service), color: '#0B0D12' }}>
                      <p className="font-semibold truncate">{b.client}</p><p className="truncate">{b.service}</p><p className="opacity-70">{b.start}–{b.end}</p>
                    </div> })}
                  {day === 0 && nowH > START && nowH < END && <div className="absolute inset-x-0 h-0.5 bg-[#D93A2B]" style={{ top: (nowH - START) * 2 * SLOT }} />}
                </div>
              </div>
            )
          })}
        </div>}
      </div>
      <p className="mt-2 text-[11px] text-mute">{onlyMe ? t('Deine Termine aus Phorest · zugeordnet über {email}.', { email: me.email }) : t('Live aus Phorest, nur lesend.')} {t('Ändern, Bezahlen und Check-in bleiben in Phorest.')} {fmt(START)}–{fmt(END)}</p>
    </div>
  )
}

/* ---------- Mein Kalender: Phorest-Termine + Schulungen/Events ---------- */
type Item = { time: string; end?: string; title: string; sub: string; src: 'phorest' | 'event'; color: string; ev?: Ev }
const SRC = { phorest: { label: 'Termine', color: '#7FB77E' }, event: { label: 'Schulungen & Events', color: '#C0634B' } } as const
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function EventCalendar() {
  const { joined, toggleEvent, events, t } = useApp()
  const t0 = isoDay()
  const [y, setY] = useState(Number(t0.slice(0, 4))), [m, setM] = useState(Number(t0.slice(5, 7))), [sel, setSel] = useState(t0)
  const [show, setShow] = useState({ phorest: true, event: true })
  const [day, setDay] = useState<MyDay | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  useEffect(() => { setDay(null); phorest<MyDay>({ action: 'my_day', date: sel }).then(setDay) }, [sel])
  const evByDay = useMemo(() => { const map = new Map<string, Ev[]>(); for (const e of events) { const k = isoDay(new Date(e.startsAt)); map.set(k, [...(map.get(k) ?? []), e]) } return map }, [events])
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => i - first + 1)
  const shiftMonth = (d: number) => { const nm = m + d; const ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y; setY(ny); setM(((nm + 11) % 12) + 1) }
  const list: Item[] = [
    ...(day?.ok ? day.appointments.map(a => ({ time: a.start, end: a.end, title: a.client, sub: a.service, src: 'phorest' as const, color: SRC.phorest.color })) : []),
    ...(evByDay.get(sel) ?? []).map(e => ({ time: fmtTime(e.startsAt), end: e.endsAt ? fmtTime(e.endsAt) : undefined, title: e.title, sub: `${e.link ? t('Online') : e.place}${e.capacity ? ` · ${t('{a}/{b} Plätze', { a: e.taken, b: e.capacity })}` : ''}${e.registerUntil ? ` · ${t('Anmeldung bis')} ${new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit' }).format(new Date(e.registerUntil))}` : ''}`, src: 'event' as const, color: SRC.event.color, ev: e })),
  ].filter(x => show[x.src]).sort((a, b) => a.time.localeCompare(b.time))
  const monthName = new Intl.DateTimeFormat(locale(), { month: 'long' }).format(new Date(Date.UTC(y, m - 1, 15)))
  const selLabel = new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(sel + 'T12:00:00Z'))
  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(Object.keys(SRC) as (keyof typeof SRC)[]).map(k => (
          <button key={k} onClick={() => setShow(v => ({ ...v, [k]: !v[k] }))} className={`h-8 px-3 rounded-full text-[13px] flex items-center gap-1.5 ${show[k] ? 'bg-white' : 'bg-transparent text-mute line-through'}`}>
            <span className="w-2 h-2 rounded-full" style={{ background: SRC[k].color, opacity: show[k] ? 1 : .4 }} />{t(SRC[k].label)}
          </button>
        ))}
      </div>
      <div className="rounded-[20px] bg-white p-4">
        <div className="flex items-center justify-between"><p className="font-semibold text-[17px]">{monthName} {y}</p>
          <div className="flex gap-1"><button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-lg bg-sage-50 flex items-center justify-center"><ChevronLeft size={16} /></button><button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-lg bg-sage-50 flex items-center justify-center"><ChevronRight size={16} /></button></div></div>
        <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-mute">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => <span key={d}>{t(d)}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-y-0.5">
          {cells.map((d, i) => {
            const valid = d >= 1 && d <= days, key = valid ? ymd(y, m, d) : ''
            const hasEv = valid && show.event && evByDay.has(key)
            return <button key={i} disabled={!valid} onClick={() => setSel(key)} className="h-11 flex flex-col items-center justify-center">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] ${!valid ? 'text-transparent' : sel === key ? 'bg-ink text-white' : key === t0 ? 'text-[#C0634B] font-semibold' : ''}`}>{valid ? d : ''}</span>
              <span className="flex gap-0.5 h-1.5 mt-0.5">{hasEv && <span className="w-1 h-1 rounded-full" style={{ background: SRC.event.color }} />}</span>
            </button>
          })}
        </div>
      </div>
      <p className="mt-5 mb-2 px-1 text-[13px] font-medium text-sage-800">{sel === t0 ? `${t('Heute')}, ` : ''}{selLabel} · {t('{n} Einträge', { n: list.length })}</p>
      <div className="rounded-[20px] bg-white divide-y divide-sage-50 overflow-hidden">
        {!day && show.phorest && <p className="px-4 py-3 text-[13px] text-mute">{t('Termine laden …')}</p>}
        {day && list.length === 0 && <p className="px-4 py-4 text-[14px] text-mute">{t('Nichts eingetragen.')}</p>}
        {list.map((x, i) => { const j = x.ev ? joined.has(x.ev.id) : false
          const full = x.ev?.capacity ? x.ev.taken >= x.ev.capacity : false, closed = x.ev?.registerUntil ? new Date(x.ev.registerUntil) < new Date() : false
          return <div key={i} className="flex gap-3 px-4 py-3">
            <div className="w-11 shrink-0"><p className="text-[14px] font-medium">{x.time}</p><p className="text-xs text-mute">{x.end}</p></div>
            <div className="flex-1 border-l-[3px] pl-3" style={{ borderColor: x.color }}>
              <p className="text-[15px]">{x.title}</p><p className="text-[13px] text-mute">{x.sub}</p>
              {x.ev?.description && <p className="text-[13px] mt-1">{x.ev.description}</p>}
              {x.ev?.link && <a href={x.ev.link} target="_blank" rel="noreferrer" className="text-[13px] text-sage-800 underline">{t('Zum Meeting')}</a>}
              <p className="text-[11px] mt-0.5" style={{ color: SRC[x.src].color }}>{x.src === 'phorest' ? 'Phorest' : 'TeamHub'}</p>
              {x.ev && <button disabled={!j && (full || closed)} onClick={async () => { const r = await toggleEvent(x.ev!.id); setMsg(v => ({ ...v, [x.ev!.id]: r ?? '' })) }} className={`mt-2 h-8 px-3.5 rounded-full text-[12px] disabled:opacity-50 ${j ? 'bg-sage-100 text-sage-800' : 'bg-ink text-white'}`}>{j ? t('Angemeldet · abmelden') : full ? t('Ausgebucht') : closed ? t('Anmeldung geschlossen') : t('Anmelden|event')}</button>}
              {x.ev && msg[x.ev.id] && <p className="mt-1 text-[12px] text-[#B5483B]">{t(msg[x.ev.id])}</p>}
            </div>
          </div>
        })}
      </div>
      <p className="mt-3 px-1 text-xs text-mute flex items-center gap-1"><CalendarDays size={12} />{t('Termine ändern bleibt in Phorest. Schulungen und Events legt das Büro an.')}</p>
    </div>
  )
}
