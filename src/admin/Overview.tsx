import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useApp, isoDay, addDays, appliesOn, fmtDate, fmtTime, zurichHour } from '../store'
import { supabase } from '../lib/supabase'
import { phorest, type TeamToday } from '../lib/phorest'
import { loadPerf, type Perf } from '../Performance'
import { useAudience } from './News'
import { Seg, Section, Status, Empty, real, inBranch } from './kit'
import { Donut, DonutParts, LineChart, Columns, BarList, STEPS } from './charts'

// Übersicht: was heute zählt, mit Verläufen statt Zahlenkacheln. Jede Kennzahl führt auf ihre Seite.

type Go = (v: 'tasks' | 'news' | 'tickets' | 'events' | 'performance' | 'team') => void
const hm = (d = new Date()) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(d)
const pctChange = (a: number, b: number) => !b ? null : Math.round((a - b) / b * 100)

export function Overview({ go, can }: { go: Go; can: (v: string) => boolean }) {
  const { me, branches, staff, templates, tickets, news, newsReads, events, registrations } = useApp()
  const audience = useAudience()
  const office = me.app_role === 'buero'
  const studios = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [pick, setScope] = useState<string | null>(null)
  // Filialleitung startet in ihrem Studio, das Büro bei allen (Studios kommen erst nach dem Laden)
  const scope = pick ?? (office ? '' : studios[0]?.id ?? '')
  const ids = scope ? [scope] : studios.map(s => s.id)
  const key = ids.join(',')
  const today = isoDay()

  /* Checklisten der letzten 14 Tage */
  const [comps, setComps] = useState<{ item_id: string; branch_id: string; day: string }[] | null>(null)
  useEffect(() => { let alive = true; setComps(null)
    supabase!.from('task_completions').select('item_id, branch_id, day').gte('day', addDays(-13)).in('branch_id', ids).then(({ data }) => { if (alive) setComps(data ?? []) })
    return () => { alive = false } }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const dayStats = (d: string) => {
    let total = 0, done = 0, late = 0
    for (const b of ids) for (const t of templates.filter(x => x.active && !x.proposed && appliesOn(x, d, b))) for (const it of t.items) {
      total++
      const ok = (comps ?? []).some(c => c.day === d && c.branch_id === b && c.item_id === it.id)
      if (ok) done++; else if (d === today && it.time && it.time < hm()) late++
    }
    return { total, done, late }
  }
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(i - 13))
  const hist = comps ? days14.map(d => ({ d, ...dayStats(d) })) : null
  const t0 = comps ? dayStats(today) : null
  const avg = hist ? (() => { const h = hist.filter(x => x.total); return h.length ? Math.round(h.reduce((a, x) => a + x.done / x.total, 0) / h.length * 100) : null })() : null

  /* Pflicht-News */
  const must = news.find(n => n.mustRead && new Date(n.publishAt) <= new Date())
  const mustPeople = must ? audience(must).filter(p => ids.some(b => inBranch(p, b))) : []
  const mustOk = must ? mustPeople.filter(p => newsReads.some(r => r.news_id === must.id && r.employee_id === p.id && r.confirmed_at)).length : 0

  /* Meldungen */
  const tks = tickets.filter(t => t.kind === 'Meldung' && ids.includes(t.branchId))
  const tNew = tks.filter(t => t.status === 'Neu').length, tWork = tks.filter(t => t.status === 'Zugewiesen' || t.status === 'In Arbeit').length, tDone = tks.filter(t => t.status === 'Erledigt').length

  /* Phorest: Termine je Tag, alle Studios im Blick zusammengezählt */
  const [span, setSpan] = useState<'7' | '28'>('7')
  const [perf, setPerf] = useState<Perf[] | null>(null)
  useEffect(() => { let alive = true; setPerf(null)
    const from = addDays(-(Number(span) - 1))
    Promise.all(ids.map(b => loadPerf({ from, to: today, branch: b, totals_only: true }))).then(r => { if (alive) setPerf(r.filter(x => x?.ok)) })
    return () => { alive = false } }, [key, span]) // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => {
    if (!perf?.length) return null
    const n = perf[0].series?.length ?? 0
    return Array.from({ length: n }, (_, i) => ({
      date: perf[0].series![i].date,
      a: perf.reduce((s, p) => s + (p.series?.[i]?.booked ?? 0), 0),
      b: perf.reduce((s, p) => s + (p.prev_series?.[i]?.booked ?? 0), 0),
      paid: perf.reduce((s, p) => s + (p.series?.[i]?.treatments ?? 0), 0),
    }))
  }, [perf])
  const sumA = series?.reduce((s, x) => s + x.paid, 0) ?? 0
  const sumB = perf?.reduce((s, p) => s + (p.prev?.treatments ?? 0), 0) ?? 0
  const change = pctChange(sumA, sumB)

  /* Heute im Studio */
  const [team, setTeam] = useState<Record<string, TeamToday['team']> | null>(null)
  useEffect(() => { let alive = true; setTeam(null)
    Promise.all(ids.map(b => phorest<TeamToday>({ action: 'team_today', branch: b }).then(r => [b, r?.ok ? r.team : []] as const))).then(r => { if (alive) setTeam(Object.fromEntries(r)) })
    return () => { alive = false } }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Startbereitschaft */
  const ready = studios.filter(s => ids.includes(s.id)).map(s => { const p = staff.filter(x => real(x) && inBranch(x, s.id)); return { s, n: p.length, app: p.filter(x => x.appInstalled).length, push: p.filter(x => x.pushEnabled).length } })
  const rn = ready.reduce((a, r) => a + r.n, 0), rApp = ready.reduce((a, r) => a + r.app, 0), rPush = ready.reduce((a, r) => a + r.push, 0)

  /* Als Nächstes */
  const next = events.filter(e => new Date(e.startsAt) > new Date() && (e.audienceBranches.length === 0 || e.audienceBranches.some(b => ids.includes(b)))).slice(0, 4)

  const hour = zurichHour()
  const short = (d: string) => fmtDate(d + 'T12:00:00Z', { weekday: 'short', day: 'numeric' })
  return (
    <div className="max-w-[1200px]">
      <div className="flex items-end justify-between gap-6 mb-8">
        <div><p className="text-[13px] text-mute">{fmtDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-[28px] mt-1">{hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : 'Guten Abend'}, {me.first}</h1></div>
        {studios.length > 1 && <Seg value={scope} onChange={setScope} items={[...(office ? [['', 'Alle Studios'] as [string, string]] : []), ...studios.map(s => [s.id, s.name] as [string, string])]} />}
      </div>

      {/* Kennzahlen: ohne Kacheln, jede führt auf ihre Seite */}
      <div className="grid grid-cols-4 border-y border-line">
        <Kpi onClick={can('tasks') ? () => go('tasks') : undefined} first label="Checklisten heute"
          figure={t0 ? `${t0.done} von ${t0.total}` : '…'} visual={<Donut value={t0?.done ?? 0} total={t0?.total ?? 0} size={52} stroke={6} />}
          meta={t0?.late ? <span className="text-alert">{t0.late} überfällig</span> : t0 && t0.total && t0.done === t0.total ? 'alles erledigt' : 'erledigt'} />
        <Kpi onClick={can('news') ? () => go('news') : undefined} label="Pflicht-News bestätigt"
          figure={must ? `${mustOk} von ${mustPeople.length}` : '–'} visual={<Donut value={mustOk} total={mustPeople.length} size={52} stroke={6} />}
          meta={<span className="truncate block">{must?.title ?? 'keine Pflicht-News'}</span>} />
        <Kpi onClick={can('tickets') ? () => go('tickets') : undefined} label="Offene Meldungen"
          figure={String(tNew + tWork)} meta={tNew + tWork ? `${tNew} neu · ${tWork} in Arbeit` : 'nichts offen'} />
        <Kpi onClick={can('performance') ? () => go('performance') : undefined} label="Behandlungen · 7 Tage"
          figure={perf ? (span === '7' ? sumA : perf.reduce((s, p) => s + (p.series?.slice(-7).reduce((a, d) => a + d.treatments, 0) ?? 0), 0)).toLocaleString('de-CH') : '…'}
          meta={span === '7' && change !== null ? `${change > 0 ? '+' : ''}${change} % zur Vorwoche` : 'aus Phorest'} />
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-12 mt-10">
        <Section title="Termine je Tag" action={<Seg value={span} onChange={setSpan} items={[['7', '7 Tage'], ['28', '28 Tage']]} />}>
          {!series ? <div className="h-[220px] rounded-[12px] bg-sage-50 animate-pulse" /> : <LineChart height={220} aLabel={span === '7' ? 'Diese Woche' : 'Letzte 28 Tage'} bLabel="Zeitraum davor"
            data={series.map(x => ({ label: span === '7' ? short(x.date) : fmtDate(x.date + 'T12:00:00Z', { day: 'numeric', month: 'numeric' }), hint: fmtDate(x.date + 'T12:00:00Z', { weekday: 'long', day: 'numeric', month: 'long' }), a: x.a, b: x.b }))} />}
        </Section>
        <Section title="Heute im Studio" count={team ? Object.values(team).reduce((a, t) => a + t.length, 0) : undefined}>
          {!team ? <p className="text-[14px] text-mute py-2">…</p> : scope ? (
            team[scope]?.length ? <ul className="divide-y divide-line">{team[scope].map(p => <li key={p.name} className="py-2.5 flex items-center justify-between gap-3 text-[14px]"><span>{p.name}</span><span className="text-mute tabular-nums text-[13px]">{p.start}–{p.end} · {p.appointments} Termine</span></li>)}</ul>
              : <Empty>Heute arbeitet laut Phorest niemand.</Empty>)
            : <BarList items={studios.map(s => ({ key: s.id, label: s.name, value: team[s.id]?.length ?? 0 }))} fmt={n => `${n} da`} onPick={k => setScope(k)} />}
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-12 mt-12">
        <Section title="Checklisten · letzte 14 Tage" action={avg !== null ? <span className="text-[13px] text-mute">im Schnitt {avg} % erledigt</span> : undefined}>
          {!hist ? <div className="h-[160px] rounded-[12px] bg-sage-50 animate-pulse" /> :
            <Columns height={140} data={hist.map(x => ({ label: fmtDate(x.d + 'T12:00:00Z', { day: 'numeric' }), hint: fmtDate(x.d + 'T12:00:00Z', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ` · ${x.done} von ${x.total}`, value: x.total ? Math.round(x.done / x.total * 100) : null }))} />}
        </Section>
        <Section title="Meldungen" action={can('tickets') ? <button onClick={() => go('tickets')} className="text-[13px] text-olive-700">Alle ansehen</button> : undefined}>
          <div className="flex items-center gap-8">
            <DonutParts size={128} stroke={13} parts={[{ value: tNew, color: '#B08A52' }, { value: tWork, color: STEPS[0] }, { value: tDone, color: STEPS[3] }]}>
              <span className="font-display text-[26px] leading-none tabular-nums">{tks.length}</span><span className="text-[11.5px] text-mute mt-1">gesamt</span></DonutParts>
            <ul className="flex-1 space-y-2 text-[14px]">
              {([['Neu', tNew, '#B08A52'], ['In Arbeit', tWork, STEPS[0]], ['Erledigt', tDone, STEPS[3]]] as const).map(([l, n, c]) => <li key={l} className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} /><span className="flex-1">{l}</span><span className="tabular-nums">{n}</span></li>)}
            </ul>
          </div>
          <ul className="mt-5 divide-y divide-line">{tks.filter(t => t.status !== 'Erledigt').slice(0, 3).map(t => <li key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-[14px]"><span className="truncate">{t.title}</span><Status kind={t.status === 'Neu' ? 'open' : 'wait'}>{t.status}</Status></li>)}</ul>
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-12 mt-12 mb-6">
        <Section title="Als Nächstes" action={can('events') ? <button onClick={() => go('events')} className="text-[13px] text-olive-700">Alle Termine</button> : undefined}>
          {next.length === 0 ? <Empty>Keine Termine geplant.</Empty> : <ul className="divide-y divide-line">{next.map(e => { const yes = registrations.filter(r => r.event_id === e.id && r.coming && !r.waitlist).length
            return <li key={e.id} className="py-2.5 flex items-center gap-4 text-[14px]">
              <span className="w-12 shrink-0 text-center"><span className="block font-display text-[19px] leading-none">{fmtDate(e.startsAt, { day: 'numeric' })}</span><span className="block text-[11px] text-mute uppercase mt-0.5">{fmtDate(e.startsAt, { month: 'short' })}</span></span>
              <span className="flex-1 min-w-0"><span className="block truncate">{e.title}</span><span className="block text-[12.5px] text-mute">{e.kind} · {fmtTime(e.startsAt)}</span></span>
              <span className="text-[13px] tabular-nums text-ink/80">{yes}{e.capacity ? ` / ${e.capacity}` : ''} <span className="text-mute">zugesagt</span></span>
            </li> })}</ul>}
        </Section>
        <Section title="Startbereitschaft">
          <div className="flex items-center gap-8 mb-5">
            <span className="flex items-center gap-3"><Donut value={rApp} total={rn} size={56} stroke={6} /><span className="text-[13.5px]"><span className="block">App installiert</span><span className="text-mute tabular-nums">{rApp} von {rn}</span></span></span>
            <span className="flex items-center gap-3"><Donut value={rPush} total={rn} size={56} stroke={6} /><span className="text-[13.5px]"><span className="block">Mitteilungen an</span><span className="text-mute tabular-nums">{rPush} von {rn}</span></span></span>
          </div>
          {ready.length > 1 && <BarList items={ready.map(r => ({ key: r.s.id, label: r.s.name, value: r.app, total: r.n }))} onPick={k => setScope(k)} />}
        </Section>
      </div>
    </div>
  )
}

function Kpi({ label, figure, meta, visual, onClick, first }: { label: string; figure: ReactNode; meta: ReactNode; visual?: ReactNode; onClick?: () => void; first?: boolean }) {
  const body = <>
    <span className="flex items-center justify-between gap-2"><span className="text-[13px] text-mute">{label}</span>{onClick && <ArrowUpRight size={15} className="text-sage-400 opacity-0 group-hover:opacity-100 transition" />}</span>
    <span className="mt-2 flex items-center gap-4">{visual}<span className="min-w-0"><span className="block font-display text-[26px] leading-tight tabular-nums">{figure}</span><span className="block text-[12.5px] text-mute truncate">{meta}</span></span></span>
  </>
  const cls = `group text-left px-5 py-5 min-w-0 ${first ? '' : 'border-l border-line'}`
  return onClick ? <button onClick={onClick} className={`${cls} hover:bg-sage-50 transition-colors`}>{body}</button> : <div className={cls}>{body}</div>
}
