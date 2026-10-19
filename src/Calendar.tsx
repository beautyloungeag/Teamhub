import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, MapPin, Search, Check, CalendarDays, X } from 'lucide-react'
import { useApp, isoDay, addDays, fmtTime, zurichHour, type Ev } from './store'
import { phorest, toHours, type BranchDay, type MyDay, type Appt, type ClientHistory } from './lib/phorest'
import { tr, locale } from './lib/i18n'

/* ---------- Kundentermine (lesend aus Phorest) ---------- */
const START = 8, END = 20, SLOT = 44 // px je halbe Stunde
const COLORS = ['#8FA382', '#C29A6B', '#93A9B3', '#B9A27A', '#A693A6', '#7E9C93', '#C2A39B']
const colorFor = (service: string) => COLORS[[...service].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
const dayOffset = (n: number) => addDays(n)
const dayLabel = (n: number) => n === 0 ? tr('Heute') : new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', weekday: 'short', day: 'numeric' }).format(new Date(addDays(n) + 'T12:00:00Z'))

export function Terminbuch({ compact }: { compact?: boolean }) {
  const { me, branches, myPhorest, t } = useApp()
  // Gleiche Regel wie der Server: eigenes Studio und Zusatzstudios, das Büro alle
  const allowed = branches.filter(b => !b.is_office && (me.app_role === 'buero' || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [branch, setBranch] = useState(allowed.find(b => b.id === me.branch_id)?.id ?? allowed[0]?.id ?? '')
  const [day, setDay] = useState(0)
  const [pick, setPick] = useState(false)
  const [q, setQ] = useState('')
  const [onlyMe, setOnlyMe] = useState(!!compact && myPhorest.length > 0)
  const [data, setData] = useState<BranchDay | null>(null)
  const [detail, setDetail] = useState<(Appt & { who: string }) | null>(null)
  // Antworten eines älteren Klicks verwerfen, sonst steht beim schnellen Blättern der falsche Tag da
  useEffect(() => { if (!branch) return; let alive = true; setData(null); phorest<BranchDay>({ action: 'branch_day', branch, date: dayOffset(day) }).then(r => { if (alive) setData(r) }); return () => { alive = false } }, [branch, day])
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
        {compact && myStaff.length > 0 && <div className="h-10 p-1 rounded-xl bg-white border border-sage-200 flex">{([[true, t('Nur ich')], [false, t('Ganzes Team')]] as const).map(([v, l]) => <button key={l} onClick={() => setOnlyMe(v)} className={`px-3 rounded-lg text-[13px] transition ${onlyMe === v ? 'bg-olive-700 text-white' : 'text-ink/80'}`}>{l}</button>)}</div>}
      </div>
      {compact && <div className="mt-2 h-10 rounded-xl bg-white border border-sage-200 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Kundin suchen')} className="flex-1 outline-none text-[14px] bg-transparent" /></div>}

      {q.length > 1 && data?.ok && hits.length === 0 && <p className="mt-2 px-1 text-[13px] text-mute">{t('An diesem Tag keine Kundin mit diesem Namen.')}</p>}
      {hits.length > 0 && <div className="mt-2 rounded-2xl bg-white border border-sage-100 divide-y divide-sage-50">{hits.slice(0, 5).map((h, i) => <button key={i} onClick={() => setDetail(h)} className="w-full text-left px-3 py-2 text-[13px] flex justify-between hover:bg-sage-50"><span>{h.client} · {h.service}</span><span className="text-mute">{h.start} · {h.who}</span></button>)}</div>}

      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button onClick={() => setDay(Math.max(0, day - 1))} className="w-9 h-9 rounded-lg bg-white border border-sage-200 flex items-center justify-center shrink-0"><ChevronLeft size={16} /></button>
        {Array.from({ length: 7 }, (_, i) => <button key={i} onClick={() => setDay(i)} className={`h-9 px-3 rounded-lg text-[13px] shrink-0 ${day === i ? 'bg-olive-700 text-white' : 'bg-white border border-sage-200'}`}>{dayLabel(i)}</button>)}
        <button onClick={() => setDay(Math.min(6, day + 1))} className="w-9 h-9 rounded-lg bg-white border border-sage-200 flex items-center justify-center shrink-0"><ChevronRight size={16} /></button>
      </div>

      <div className="mt-3 flex-1 min-h-0 rounded-2xl bg-white border border-sage-100 overflow-auto no-scrollbar">
        {!data && <p className="p-4 text-[14px] text-mute">{t('Lädt aus Phorest …')}</p>}
        {data && !data.ok && <p className="p-4 text-[14px] text-mute">{data.error === 'no_phorest_branch' ? t('Für dieses Studio ist noch kein Phorest-Kalender verbunden.') : data.error === 'forbidden' ? t('Für dieses Studio hast du keinen Zugriff auf den Kalender.') : t('Phorest ist gerade nicht erreichbar. Bitte später noch einmal versuchen.')}</p>}
        {data?.ok && shown.length === 0 && (onlyMe && cols.length > 0
          ? <div className="p-4 text-[14px] text-mute">{t('Du bist an diesem Tag nicht eingeplant.')} <button onClick={() => setOnlyMe(false)} className="text-olive-700 font-medium">{t('Ganzes Team anzeigen')}</button></div>
          : <p className="p-4 text-[14px] text-mute">{t('An diesem Tag ist niemand eingeplant.')}</p>)}
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
                    return <button key={i} onClick={() => setDetail({ ...b, who: c.name })} className="absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden text-[11px] leading-tight text-left hover:brightness-95 transition" style={{ top: (s - START) * 2 * SLOT + 1, height: Math.max((e - s) * 2 * SLOT - 2, 18), background: colorFor(b.service) + '33', borderLeft: `3px solid ${colorFor(b.service)}`, color: '#1D221C' }}>
                      <p className="font-medium truncate">{b.client}{b.notes ? ' ·' : ''}</p><p className="truncate">{b.service}</p><p className="opacity-70">{b.start}–{b.end}</p>
                    </button> })}
                  {day === 0 && nowH > START && nowH < END && <div className="absolute inset-x-0 h-0.5 bg-alert" style={{ top: (nowH - START) * 2 * SLOT }} />}
                </div>
              </div>
            )
          })}
        </div>}
      </div>
      {detail && <AppointmentSheet a={detail} onClose={() => setDetail(null)} />}
      <p className="mt-2 text-[11px] text-mute">{onlyMe ? t('Deine Termine aus Phorest · zugeordnet über {email}.', { email: me.email }) : t('Live aus Phorest, nur lesend.')} {t('Ändern, Bezahlen und Check-in bleiben in Phorest.')} {fmt(START)}–{fmt(END)}</p>
    </div>
  )
}

/* Termin antippen: Details wie in Phorest, dazu die Historie der Kundin */
function AppointmentSheet({ a, onClose }: { a: Appt & { who: string }; onClose: () => void }) {
  const { t } = useApp()
  const [h, setH] = useState<ClientHistory | null>(null)
  useEffect(() => { if (!a.client_id) return; let alive = true; phorest<ClientHistory>({ action: 'client_history', client_id: a.client_id, months: 12 }).then(r => { if (alive) setH(r) }); return () => { alive = false } }, [a.client_id])
  const d = (s: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(s + 'T12:00:00Z'))
  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-stretch md:justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/25" />
      <div onClick={e => e.stopPropagation()} className="relative w-full md:w-[400px] max-h-[85dvh] md:max-h-none overflow-y-auto no-scrollbar bg-paper rounded-t-[24px] md:rounded-none p-6 pb-10 md:pb-6 shadow-[0_-12px_40px_-16px_rgba(29,34,28,.4)]">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[12px] text-mute">{a.start}–{a.end} · {a.who}</p><h2 className="font-display text-[24px] leading-tight mt-1">{a.client}</h2></div>
          <button onClick={onClose} aria-label={t('Schliessen')} className="w-9 h-9 rounded-full hover:bg-sage-50 flex items-center justify-center text-mute shrink-0"><X size={18} /></button>
        </div>
        <div className="mt-4 rounded-[14px] bg-white divide-y divide-line text-[14px]">
          <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Behandlung')}</span><span className="text-right">{a.service}</span></div>
          {a.price != null && <div className="px-4 py-3 flex justify-between gap-3"><span className="text-mute">{t('Preis')}</span><span>CHF {a.price}</span></div>}
          <div className="px-4 py-3"><p className="text-mute">{t('Notiz am Termin')}</p><p className="mt-1 whitespace-pre-wrap">{a.notes || <span className="text-mute">{t('Keine Notiz.')}</span>}</p></div>
        </div>
        {a.client_id && <>
          <p className="mt-6 mb-2 px-1 rubric text-ink/70">{t('Kundin')}</p>
          {!h && <p className="px-1 text-[13px] text-mute">{t('Lädt aus Phorest …')}</p>}
          {h && !h.ok && <p className="px-1 text-[13px] text-mute">{t('Phorest ist gerade nicht erreichbar. Bitte später noch einmal versuchen.')}</p>}
          {h?.ok && <div className="rounded-[14px] bg-white divide-y divide-line text-[14px]">
            <div className="px-4 py-3 text-[13px] text-mute">{[h.client.since && t('Kundin seit {d}', { d: d(h.client.since) }), h.client.last_visit && t('zuletzt {d}', { d: d(h.client.last_visit) }), h.client.preferred && t('bevorzugt {n}', { n: h.client.preferred })].filter(Boolean).join(' · ') || '–'}</div>
            {(h.upcoming ?? []).slice(0, 2).map((v, i) => <div key={'u' + i} className="px-4 py-2.5 flex justify-between gap-3"><span><span className="text-[11px] text-olive-700 block">{t('Kommend')}</span>{v.service}</span><span className="text-mute shrink-0">{d(v.date)}</span></div>)}
            {h.visits.slice(0, 6).map((v, i) => <div key={i} className="px-4 py-2.5">
              <div className="flex justify-between gap-3"><span className={v.cancelled ? 'line-through text-mute' : ''}>{v.service}</span><span className="text-mute shrink-0">{d(v.date)}</span></div>
              <p className="text-[12px] text-mute">{[v.branch, v.staff].filter(Boolean).join(' · ')}</p>
              {v.notes && <p className="text-[13px] mt-1 text-ink/80 whitespace-pre-wrap">{v.notes}</p>}
            </div>)}
            {h.visits.length === 0 && <div className="px-4 py-3 text-[13px] text-mute">{t('Keine Besuche in diesem Zeitraum.')}</div>}
          </div>}
        </>}
        <p className="mt-4 px-1 text-[11px] text-mute">{t('Ändern, Bezahlen und Check-in bleiben in Phorest.')}</p>
      </div>
    </div>
  )
}

/* ---------- Mein Kalender: eigene Phorest-Termine + Schulungen/Events ---------- */
type Item = { time: string; end?: string; title: string; sub: string; src: 'phorest' | 'event'; ev?: Ev }
const COLOR = { phorest: '#6F7D66', event: '#B08A52' } as const
type Filter = 'all' | 'phorest' | 'event'
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function EventCalendar() {
  const { joined, declined, toggleEvent, declineEvent, events, myPhorest, t } = useApp()
  const mapped = myPhorest.length > 0
  const t0 = isoDay()
  const [y, setY] = useState(Number(t0.slice(0, 4))), [m, setM] = useState(Number(t0.slice(5, 7))), [sel, setSel] = useState(t0)
  const [filter, setFilter] = useState<Filter>('all')
  const [day, setDay] = useState<MyDay | null>(null)
  const [month, setMonth] = useState<Record<string, number> | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  useEffect(() => { if (!mapped) return; let alive = true; setDay(null); phorest<MyDay>({ action: 'my_day', date: sel }).then(r => { if (alive) setDay(r) }); return () => { alive = false } }, [sel, mapped])
  // Punkte für eigene Termine: ein Abruf je Monat
  useEffect(() => { if (!mapped) return; let alive = true; setMonth(null); phorest<{ ok: boolean; days: Record<string, number> }>({ action: 'my_month', from: ymd(y, m, 1), to: ymd(y, m, days) }).then(r => { if (alive) setMonth(r?.ok ? r.days : {}) }); return () => { alive = false } }, [y, m, days, mapped])
  const show = { phorest: mapped && filter !== 'event', event: filter !== 'phorest' }
  const evByDay = useMemo(() => { const map = new Map<string, Ev[]>(); for (const e of events) { const k = isoDay(new Date(e.startsAt)); map.set(k, [...(map.get(k) ?? []), e]) } return map }, [events])
  const upcoming = events.filter(e => new Date(e.startsAt).getTime() >= Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 5)
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => i - first + 1)
  const shiftMonth = (d: number) => { const nm = m + d; const ny = nm < 1 ? y - 1 : nm > 12 ? y + 1 : y; setY(ny); setM(((nm + 11) % 12) + 1) }
  const goTo = (key: string) => { setY(Number(key.slice(0, 4))); setM(Number(key.slice(5, 7))); setSel(key); if (filter === 'phorest') setFilter('all') }
  const shift = day?.ok ? day.shifts?.[0] : undefined
  const list: Item[] = [
    ...(show.phorest && day?.ok ? day.appointments.map(a => ({ time: a.start, end: a.end, title: a.client, sub: a.service, src: 'phorest' as const })) : []),
    ...(show.event ? (evByDay.get(sel) ?? []) : []).map(e => ({ time: fmtTime(e.startsAt), end: e.endsAt ? fmtTime(e.endsAt) : undefined, title: e.title, sub: `${e.link ? t('Online') : e.place}${e.capacity ? ` · ${t('{a}/{b} Plätze', { a: e.taken, b: e.capacity })}` : ''}${e.registerUntil ? ` · ${t('Anmeldung bis')} ${new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit' }).format(new Date(e.registerUntil))}` : ''}`, src: 'event' as const, ev: e })),
  ].sort((a, b) => a.time.localeCompare(b.time))
  const monthName = new Intl.DateTimeFormat(locale(), { month: 'long' }).format(new Date(Date.UTC(y, m - 1, 15)))
  const selLabel = new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(sel + 'T12:00:00Z'))
  const loading = show.phorest && !day
  const filters: [Filter, string][] = [['all', t('Alles')], ['phorest', t('Meine Termine')], ['event', t('Schulungen & Events')]]
  return (
    <div>
      {mapped && <div className="mb-3 inline-flex p-1 rounded-full bg-white">
        {filters.map(([k, label]) => <button key={k} onClick={() => setFilter(k)} className={`h-8 px-3.5 rounded-full text-[13px] transition ${filter === k ? 'bg-olive-700 text-white' : 'text-ink/80 hover:text-ink'}`}>{label}</button>)}
      </div>}
      <div className="rounded-[16px] bg-white p-4">
        <div className="flex items-center justify-between"><p className="font-medium text-[17px] capitalize">{monthName} {y}</p>
          <div className="flex gap-1">
            {(y !== Number(t0.slice(0, 4)) || m !== Number(t0.slice(5, 7)) || sel !== t0) && <button onClick={() => goTo(t0)} className="h-8 px-3 rounded-lg bg-sage-50 text-[13px]">{t('Heute')}</button>}
            <button aria-label={t('Vorheriger Monat')} onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-lg bg-sage-50 flex items-center justify-center"><ChevronLeft size={16} /></button>
            <button aria-label={t('Nächster Monat')} onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-lg bg-sage-50 flex items-center justify-center"><ChevronRight size={16} /></button>
          </div></div>
        <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-mute">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => <span key={d}>{t(d)}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-y-0.5">
          {cells.map((d, i) => {
            const valid = d >= 1 && d <= days, key = valid ? ymd(y, m, d) : ''
            const nApp = valid && show.phorest ? (month?.[key] ?? 0) : 0
            const hasEv = valid && show.event && evByDay.has(key)
            return <button key={i} disabled={!valid} onClick={() => setSel(key)} className="h-11 flex flex-col items-center justify-center">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] tabular-nums ${!valid ? 'text-transparent' : sel === key ? 'bg-olive-700 text-white' : key === t0 ? 'text-olive-700 font-semibold' : ''}`}>{valid ? d : ''}</span>
              <span className="flex gap-0.5 h-1.5 mt-0.5">{nApp > 0 && <span className="w-1 h-1 rounded-full" style={{ background: COLOR.phorest }} />}{hasEv && <span className="w-1 h-1 rounded-full" style={{ background: COLOR.event }} />}</span>
            </button>
          })}
        </div>
        {(show.phorest || show.event) && <div className="mt-2 flex gap-4 justify-center text-[11px] text-mute">
          {show.phorest && <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: COLOR.phorest }} />{t('Meine Termine')}</span>}
          {show.event && <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: COLOR.event }} />{t('Schulungen & Events')}</span>}
        </div>}
      </div>

      <div className="mt-6 mb-2.5 px-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium capitalize">{sel === t0 ? `${t('Heute')} · ` : ''}{selLabel}</h2>
        {show.phorest && day?.ok && <span className="text-[12px] text-mute shrink-0">{shift ? t('Schicht {a}–{b}', { a: shift.start, b: shift.end }) : t('frei')}</span>}
      </div>
      <div className="rounded-[16px] bg-white divide-y divide-sage-50 overflow-hidden">
        {loading && <p className="px-4 py-3 text-[13px] text-mute">{t('Termine laden …')}</p>}
        {!loading && list.length === 0 && <p className="px-4 py-4 text-[14px] text-mute">{t('Nichts eingetragen.')}</p>}
        {list.map((x, i) => { const j = x.ev ? joined.has(x.ev.id) : false, no = x.ev ? declined.has(x.ev.id) : false
          const full = x.ev?.capacity ? x.ev.taken >= x.ev.capacity : false, closed = x.ev?.registerUntil ? new Date(x.ev.registerUntil) < new Date() : false
          const past = x.ev ? new Date(x.ev.startsAt) < new Date() : false
          return <div key={i} className="flex gap-3 px-4 py-3">
            <div className="w-11 shrink-0"><p className="text-[14px] font-medium tabular-nums">{x.time}</p><p className="text-xs text-mute tabular-nums">{x.end}</p></div>
            <div className="flex-1 min-w-0 flex gap-3">
              <span className="w-[3px] rounded-full shrink-0" style={{ background: COLOR[x.src] }} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{x.title}</p><p className="text-[13px] text-mute">{x.sub}</p>
                {x.ev?.description && <p className="text-[13px] mt-1">{x.ev.description}</p>}
                {x.ev?.link && <a href={x.ev.link} target="_blank" rel="noreferrer" className="text-[13px] text-sage-800 underline">{t('Zum Meeting')}</a>}
                {x.ev && past && <p className="mt-1.5 text-[12px] text-mute">{j ? t('Du warst angemeldet.') : t('Vorbei')}</p>}
                {x.ev && !past && <div className="mt-2 flex gap-1.5 items-center">
                  <button disabled={!j && (full || closed)} onClick={async () => { const r = j ? null : await toggleEvent(x.ev!.id); setMsg(v => ({ ...v, [x.ev!.id]: r ?? '' })) }} className={`h-8 px-3.5 rounded-[8px] text-[12px] transition disabled:opacity-50 ${j ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink'}`}>{j ? <span className="inline-flex items-center gap-1"><Check size={13} strokeWidth={2.6} />{t('Ich komme')}</span> : full ? t('Ausgebucht') : closed ? t('Anmeldung geschlossen') : t('Ich komme')}</button>
                  {<button onClick={async () => { await declineEvent(x.ev!.id); setMsg(v => ({ ...v, [x.ev!.id]: '' })) }} className={`h-8 px-3.5 rounded-[8px] text-[12px] transition ${no ? 'bg-olive-800 text-white' : 'bg-sage-50 text-ink'}`}>{t('Ich komme nicht')}</button>}
                </div>}
                {x.ev && msg[x.ev.id] && <p className="mt-1 text-[12px] text-alert">{t(msg[x.ev.id])}</p>}
              </div>
            </div>
          </div>
        })}
      </div>

      {show.event && upcoming.length > 0 && <>
        <h2 className="mt-8 mb-2.5 px-1 rubric text-ink/70">{t('Schulungen & Events · als Nächstes')}</h2>
        <div className="rounded-[16px] bg-white divide-y divide-sage-50 overflow-hidden">
          {upcoming.map(e => { const k = isoDay(new Date(e.startsAt)), j = joined.has(e.id), no = declined.has(e.id)
            return <button key={e.id} onClick={() => goTo(k)} className="w-full text-left flex items-center gap-3 px-4 py-3">
              <span className="w-11 shrink-0 text-center"><span className="block text-[11px] text-mute uppercase">{new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', month: 'short' }).format(new Date(e.startsAt))}</span><span className="block font-display text-[19px] leading-tight">{new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', day: 'numeric' }).format(new Date(e.startsAt))}</span></span>
              <span className="flex-1 min-w-0"><span className="block text-[15px] truncate">{e.title}</span><span className="block text-[12px] text-mute truncate">{fmtTime(e.startsAt)} · {e.link ? t('Online') : e.place}</span></span>
              <span className={`text-[12px] shrink-0 inline-flex items-center gap-1.5 ${j ? 'text-ok' : no ? 'text-mute' : 'text-brass'}`}><span className={`w-[6px] h-[6px] rounded-full ${j ? 'bg-ok' : no ? 'bg-sage-400' : 'bg-brass'}`} />{j ? t('Zugesagt') : no ? t('Abgesagt') : t('Offen')}</span>
            </button> })}
        </div>
      </>}
      <p className="mt-4 px-1 text-xs text-mute flex items-center gap-1"><CalendarDays size={12} />{t('Termine ändern bleibt in Phorest. Schulungen und Events legt das Büro an.')}</p>
    </div>
  )
}
