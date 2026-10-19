import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Star, Target, Trash2 } from 'lucide-react'
import { useApp, isoDay, addDays, type Staff } from './store'
import { supabase } from './lib/supabase'
import { phorest } from './lib/phorest'
import { locale } from './lib/i18n'
import { toast } from './Toast'
import { downloadCsv } from './lib/csv'
import { Modal } from './admin/kit'

// Meine Performance (Wunsch Renée 25.09., Vorbild PhorestGo): Kennzahlen aus Phorest mit Vergleich zum Vorzeitraum,
// persönliche Ziele und Teamziele (nur Leitung), Bewertungen der Kundinnen. Rechte prüft die Function `phorest`.

export type Metrics = { treatments: number; revenue: number; clients: number; visits: number; avg_ticket: number; requested: number; requested_pct: number; booked: number; online_pct: number; reviews: { count: number; avg: number | null } }
export type Review = { date: string; rating: number; text: string; client: string; staff: string }
export type PerfPerson = Metrics & { staff_id: string; employee_id: string | null; name: string }
export type Perf = { ok: boolean; mapped?: boolean; from: string; to: string; prev_from?: string; prev_to?: string; metrics: Metrics; prev: Metrics; reviews?: Review[]; people?: PerfPerson[]; error?: string }
export type Goal = { id: string; scope: 'person' | 'team'; employee_id: string | null; branch_id: string | null; metric: Metric; target: number; starts_on: string; ends_on: string; title: string | null; created_by_name: string | null }
export type Metric = 'revenue' | 'treatments' | 'avg_ticket' | 'clients' | 'requested' | 'rating' | 'reviews'

export const METRIC: Record<Metric, string> = { revenue: 'DL-Umsatz', treatments: 'Behandlungen', avg_ticket: 'Ø je Besuch', clients: 'Kundinnen', requested: 'Wunschtermine', rating: 'Bewertung Ø', reviews: 'Bewertungen' }
const money = (n: number) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(n)
export const fmtMetric = (m: Metric, v: number | null) => v === null || Number.isNaN(v) ? '–' : m === 'revenue' || m === 'avg_ticket' ? money(v) : m === 'rating' ? v.toFixed(1) : String(Math.round(v))
export const valueOf = (x: Metrics, m: Metric): number | null => m === 'rating' ? x.reviews.avg : m === 'reviews' ? x.reviews.count : x[m]

// Zeiträume, höchstens 92 Tage (Grenze der Function)
const mondayOf = (d: string) => { const dow = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7; return addDays(-dow, d) }
const monthStart = (d: string) => d.slice(0, 8) + '01'
const lastOfMonth = (d: string) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
export type PeriodKey = 'week' | 'lastweek' | 'month' | 'lastmonth' | 'q'
export function period(k: PeriodKey): { from: string; to: string } {
  const t = isoDay()
  if (k === 'week') return { from: mondayOf(t), to: t }
  if (k === 'lastweek') { const m = addDays(-7, mondayOf(t)); return { from: m, to: addDays(6, m) } }
  if (k === 'month') return { from: monthStart(t), to: t }
  if (k === 'lastmonth') { const e = addDays(-1, monthStart(t)); return { from: monthStart(e), to: e } }
  return { from: addDays(-89, t), to: t }
}
export const PERIODS: [PeriodKey, string][] = [['week', 'Diese Woche'], ['lastweek', 'Letzte Woche'], ['month', 'Dieser Monat'], ['lastmonth', 'Letzter Monat'], ['q', 'Letzte 90 Tage']]

const cache = new Map<string, Promise<Perf>>()
export function loadPerf(body: Record<string, unknown>) {
  const key = JSON.stringify(body)
  if (!cache.has(key)) { const p = phorest<Perf>({ action: 'performance', ...body }); cache.set(key, p); p.then(r => { if (!r?.ok) cache.delete(key) }); setTimeout(() => cache.delete(key), 5 * 60_000) }
  return cache.get(key)!
}
export function usePerf(body: Record<string, unknown> | null) {
  const [r, setR] = useState<Perf | null>(null)
  const key = body ? JSON.stringify(body) : ''
  useEffect(() => { if (!body) return; let alive = true; setR(null); loadPerf(body).then(x => { if (alive) setR(x) }); return () => { alive = false } }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return r
}

function Delta({ now, before, inverse }: { now: number | null; before: number | null; inverse?: boolean }) {
  if (now === null || before === null || !before) return null
  const pct = Math.round((now - before) / before * 100)
  if (!pct) return <span className="text-[11.5px] text-mute whitespace-nowrap shrink-0">±0 %</span>
  const up = pct > 0, good = inverse ? !up : up
  return <span className={`inline-flex items-center text-[11.5px] whitespace-nowrap shrink-0 ${good ? 'text-ok' : 'text-alert'}`}>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(pct)} %</span>
}

/** Kennzahlen als Raster: in der App weisse Karten, im Backoffice Linien. */
export function KpiGrid({ p, admin }: { p: Perf; admin?: boolean }) {
  const { t } = useApp()
  const m = p.metrics, pv = p.prev
  const items: [string, string, number | null, number | null, string?][] = [
    [t('DL-Umsatz'), money(m.revenue), m.revenue, pv.revenue, t('laut Terminpreisen')],
    [t('Behandlungen'), String(m.treatments), m.treatments, pv.treatments, m.clients === 1 ? t('1 Kundin') : t('{n} Kundinnen', { n: m.clients })],
    [t('Ø je Besuch'), money(m.avg_ticket), m.avg_ticket, pv.avg_ticket],
    [t('Wunschtermine'), `${m.requested_pct} %`, m.requested_pct, pv.requested_pct, t('Kundin hat dich gewählt')],
    [t('Online gebucht'), `${m.online_pct} %`, m.online_pct, pv.online_pct],
    [t('Bewertungen'), m.reviews.avg !== null ? `${m.reviews.avg.toFixed(1)} ★` : '–', m.reviews.avg, pv.reviews.avg, m.reviews.count === 1 ? t('1 Bewertung') : t('{n} Bewertungen', { n: m.reviews.count })],
  ]
  return <div className={admin ? 'grid grid-cols-3 xl:grid-cols-6 border-t border-line' : 'grid grid-cols-2 gap-2.5'}>
    {items.map(([l, v, a, b, sub], i) => <div key={l} className={admin ? `pt-4 pb-3 pr-4 ${i % 6 ? 'pl-5 border-l border-line' : ''}` : 'rounded-[16px] bg-white p-4'}>
      <p className="text-[12.5px] text-mute">{l}</p>
      <p className={`font-display ${admin ? 'text-[26px]' : 'text-[24px]'} leading-tight mt-1 tabular-nums whitespace-nowrap`}>{v}</p>
      <p className="mt-0.5 flex items-center gap-2 min-w-0"><Delta now={a} before={b} />{sub && <span className="text-[11.5px] text-mute truncate">{sub}</span>}</p>
    </div>)}
  </div>
}

export function ReviewList({ items, staff = false }: { items: Review[]; staff?: boolean }) {
  const { t } = useApp()
  if (!items.length) return <p className="text-[13.5px] text-mute py-2">{t('Keine Bewertungen in diesem Zeitraum.')}</p>
  return <ul className="divide-y divide-line">{items.map((r, i) => <li key={i} className="py-3">
    <div className="flex items-center justify-between gap-3 text-[13px]"><span className="flex gap-0.5 text-brass">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={13} fill={n <= r.rating ? 'currentColor' : 'none'} strokeWidth={1.6} />)}</span>
      <span className="text-mute">{r.client}{staff && r.staff ? ` · ${r.staff}` : ''} · {new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit' }).format(new Date(r.date + 'T12:00:00Z'))}</span></div>
    {r.text && <p className="text-[14px] mt-1.5">{r.text}</p>}
  </li>)}</ul>
}

/* ---------- Ziele ---------- */
function useGoals(filter: { employeeId?: string; branchId?: string }) {
  const [list, setList] = useState<Goal[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let q = supabase!.from('goals').select('*').order('starts_on', { ascending: false })
    if (filter.employeeId && filter.branchId) q = q.or(`employee_id.eq.${filter.employeeId},branch_id.eq.${filter.branchId}`)
    else if (filter.employeeId) q = q.eq('employee_id', filter.employeeId)
    else if (filter.branchId) q = q.eq('branch_id', filter.branchId)
    let alive = true; q.then(({ data }) => { if (alive) setList((data ?? []) as Goal[]) }); return () => { alive = false }
  }, [filter.employeeId, filter.branchId, tick])
  return [list, () => setTick(x => x + 1)] as const
}

function GoalRow({ g, onDelete, canDelete, who, by }: { g: Goal; onDelete: () => void; canDelete: boolean; who?: string; by: boolean }) {
  const { t } = useApp()
  const today = isoDay(), started = g.starts_on <= today
  const p = usePerf(started ? { from: g.starts_on, to: g.ends_on < today ? g.ends_on : today, ...(g.scope === 'team' ? { branch: g.branch_id, totals_only: true } : { employee_id: g.employee_id }) } : null)
  const v = p?.ok ? valueOf(p.metrics, g.metric) : null
  const pct = v !== null ? Math.min(100, Math.round(v / g.target * 100)) : 0
  const reached = v !== null && v >= g.target
  const fmt = (d: string) => new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit' }).format(new Date(d + 'T12:00:00Z'))
  return <div className="py-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-[12px] text-brass">{g.scope === 'team' ? t('Teamziel') : who ?? t('Persönliches Ziel')}</p>
        <p className="text-[15px] font-medium leading-snug">{g.title || `${t(METRIC[g.metric])}: ${fmtMetric(g.metric, g.target)}`}</p>
        <p className="text-[12px] text-mute mt-0.5">{fmt(g.starts_on)}–{fmt(g.ends_on)}{by && g.created_by_name ? ` · ${t('von {name}', { name: g.created_by_name })}` : ''}</p></div>
      {canDelete && <button onClick={onDelete} aria-label={t('Löschen')} className="p-1.5 text-mute hover:text-alert"><Trash2 size={14} /></button>}
    </div>
    {started ? <div className="mt-2 flex items-center gap-3"><span className="flex-1 h-2 rounded-full bg-line overflow-hidden"><span className={`block h-full rounded-full ${reached ? 'bg-ok' : 'bg-olive-700'}`} style={{ width: `${pct}%` }} /></span>
      <span className="text-[12.5px] tabular-nums shrink-0">{p ? `${fmtMetric(g.metric, v)} / ${fmtMetric(g.metric, g.target)}` : '…'}</span></div>
      : <p className="mt-1.5 text-[12.5px] text-mute">{t('Startet am {d}', { d: fmt(g.starts_on) })}</p>}
  </div>
}

export function GoalForm({ scope, employeeId, branchId, onDone, onCancel, admin }: { scope: 'person' | 'team'; employeeId?: string; branchId?: string; onDone: () => void; onCancel: () => void; admin?: boolean }) {
  const { me, t } = useApp()
  const today = isoDay()
  const [f, setF] = useState({ metric: 'treatments' as Metric, target: '', span: 'month' as 'month' | 'next' | 'custom', from: today, to: lastOfMonth(today), title: '' })
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const range = f.span === 'month' ? { from: monthStart(today), to: lastOfMonth(today) } : f.span === 'next' ? { from: addDays(1, lastOfMonth(today)), to: lastOfMonth(addDays(1, lastOfMonth(today))) } : { from: f.from, to: f.to }
  const save = async () => {
    const target = Number(String(f.target).replace(/['’\s]/g, '').replace(',', '.'))
    if (!target || target <= 0) { setErr(t('Bitte einen Zielwert eingeben.')); return }
    if (range.to < range.from || (Date.parse(range.to) - Date.parse(range.from)) / 864e5 > 92) { setErr(t('Zeitraum höchstens drei Monate.')); return }
    setBusy(true)
    const { error } = await supabase!.from('goals').insert({ scope, employee_id: scope === 'person' ? employeeId ?? me.id : null, branch_id: scope === 'team' ? branchId : null, metric: f.metric, target, starts_on: range.from, ends_on: range.to, title: f.title.trim() || null, created_by: me.id, created_by_name: `${me.first} ${me.last}` })
    setBusy(false)
    if (error) { setErr(t('Speichern hat nicht geklappt.')); return }
    toast(t('Ziel gespeichert')); onDone()
  }
  const field = admin ? 'w-full h-10 rounded-[10px] bg-sage-50 px-3 text-[14px] outline-none' : 'w-full h-11 rounded-[12px] bg-sage-50 px-3 text-[15px] outline-none'
  const seg = (on: boolean) => `h-9 px-3 rounded-[9px] text-[13px] transition ${on ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/80'}`
  return <div className={admin ? '' : 'rounded-[16px] bg-white p-4'}>
    <p className="text-[13px] text-mute mb-1.5">{t('Was')}</p>
    <div className="flex flex-wrap gap-1.5">{(Object.keys(METRIC) as Metric[]).map(k => <button key={k} onClick={() => setF({ ...f, metric: k })} className={seg(f.metric === k)}>{t(METRIC[k])}</button>)}</div>
    <p className="text-[13px] text-mute mt-4 mb-1.5">{t('Ziel')}{f.metric === 'revenue' || f.metric === 'avg_ticket' ? ' (CHF)' : f.metric === 'rating' ? ' (1–5)' : ''}</p>
    <input inputMode="decimal" value={f.target} onChange={e => setF({ ...f, target: e.target.value })} placeholder={f.metric === 'revenue' ? 'z. B. 8000' : f.metric === 'rating' ? 'z. B. 4.8' : 'z. B. 120'} className={field} />
    <p className="text-[13px] text-mute mt-4 mb-1.5">{t('Zeitraum')}</p>
    <div className="flex flex-wrap gap-1.5">{([['month', t('Dieser Monat')], ['next', t('Nächster Monat')], ['custom', t('Eigener Zeitraum')]] as const).map(([k, l]) => <button key={k} onClick={() => setF({ ...f, span: k })} className={seg(f.span === k)}>{l}</button>)}</div>
    {f.span === 'custom' && <div className="mt-2 grid grid-cols-2 gap-2"><input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className={field} /><input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className={field} /></div>}
    <p className="text-[13px] text-mute mt-4 mb-1.5">{t('Titel (optional)')}</p>
    <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder={t('z. B. Mehr Wunschtermine im Herbst')} className={field} />
    {err && <p className="mt-2 text-[13px] text-alert">{err}</p>}
    <div className="mt-4 flex gap-2 justify-end"><button onClick={onCancel} className="h-10 px-4 rounded-[10px] bg-sage-50 text-[14px]">{t('Abbrechen')}</button><button disabled={busy} onClick={save} className="h-10 px-4 rounded-[10px] bg-olive-700 text-white text-[14px] disabled:opacity-60">{t('Ziel speichern')}</button></div>
  </div>
}

function GoalList({ goals, staff, onChanged, canDeleteOf, emptyText }: { goals: Goal[]; staff: Staff[]; onChanged: () => void; canDeleteOf: (g: Goal) => boolean; emptyText: string }) {
  const { t, me } = useApp()
  const [tab, setTab] = useState<'active' | 'next' | 'done'>('active')
  const today = isoDay()
  const groups = { active: goals.filter(g => g.starts_on <= today && g.ends_on >= today), next: goals.filter(g => g.starts_on > today), done: goals.filter(g => g.ends_on < today) }
  const del = async (g: Goal) => { if (!confirm(t('Ziel löschen?'))) return; const { error } = await supabase!.from('goals').delete().eq('id', g.id); if (error) toast(t('Das hat nicht geklappt'), 'error'); else onChanged() }
  return <div>
    <div className="flex gap-4 border-b border-line text-[13.5px]">{([['active', t('Aktiv')], ['next', t('Demnächst')], ['done', t('Abgeschlossen')]] as const).map(([k, l]) =>
      <button key={k} onClick={() => setTab(k)} className={`pb-2 -mb-px border-b-2 transition ${tab === k ? 'border-olive-700 text-ink' : 'border-transparent text-mute'}`}>{groups[k].length ? `${groups[k].length} ` : ''}{l}</button>)}</div>
    <div className="divide-y divide-line">{groups[tab].length === 0 ? <p className="py-3 text-[13.5px] text-mute">{emptyText}</p>
      : groups[tab].map(g => { const p = g.employee_id ? staff.find(s => s.id === g.employee_id) : null, name = p ? `${p.first} ${p.last}` : ''
        return <GoalRow key={g.id} g={g} who={p && g.scope === 'person' && p.id !== me.id ? name : undefined} by={!!g.created_by_name && g.created_by_name !== name} canDelete={canDeleteOf(g)} onDelete={() => del(g)} /> })}</div>
  </div>
}

/* ---------- App: Meine Performance ---------- */
export function MyPerformance() {
  const { me, t, staff } = useApp()
  const [k, setK] = useState<PeriodKey>('month')
  const r = period(k)
  const p = usePerf({ from: r.from, to: r.to })
  const [goals, reloadGoals] = useGoals({ employeeId: me.id, branchId: me.branch_id })
  const [adding, setAdding] = useState(false)
  const lead = me.app_role !== 'mitarbeiterin'
  return (
    <div className="px-5 pb-10">
      <h1 className="text-[30px] leading-tight pt-3">{t('Meine Performance')}</h1>
      <p className="text-[13px] text-mute mt-1">{t('Nur für dich sichtbar, die Filialleitung sieht die Zahlen ihres Studios.')}</p>
      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">{PERIODS.map(([key, l]) => <button key={key} onClick={() => setK(key)} className={`shrink-0 px-3.5 h-8 rounded-full text-[13px] transition ${k === key ? 'bg-olive-700 text-white' : 'bg-white text-ink'}`}>{t(l)}</button>)}</div>
      <div className="mt-4">
        {!p ? <div className="grid grid-cols-2 gap-2.5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[92px] rounded-[16px] bg-white animate-pulse" />)}</div>
          : !p.ok ? <p className="rounded-[16px] bg-white p-4 text-[14px] text-mute">{t('Phorest antwortet gerade nicht. Versuch es später noch einmal.')}</p>
          : p.mapped === false ? <p className="rounded-[16px] bg-white p-4 text-[14px] text-mute">{t('Dein Konto ist noch keiner Phorest-Spalte zugeordnet. Das Büro kann das prüfen.')}</p>
          : <><KpiGrid p={p} /><p className="mt-2 px-1 text-[11.5px] text-mute">{t('Vergleich mit den {n} Tagen davor. Umsatz laut Terminpreisen, ohne Verkauf und Rabatte.', { n: Math.round((Date.parse(r.to) - Date.parse(r.from)) / 864e5) + 1 })}</p></>}
      </div>

      <div className="flex items-baseline justify-between mt-8 mb-2.5 px-1"><h2 className="rubric text-ink/70">{t('Ziele')}</h2>{!adding && <button onClick={() => setAdding(true)} className="text-[13px] text-olive-700 flex items-center gap-1"><Target size={14} />{t('Ziel erstellen')}</button>}</div>
      {adding && <div className="mb-3"><GoalForm scope="person" onCancel={() => setAdding(false)} onDone={() => { setAdding(false); reloadGoals() }} /></div>}
      <div className="rounded-[16px] bg-white px-4 py-2">
        {goals ? <GoalList goals={goals} staff={staff} onChanged={reloadGoals} canDeleteOf={g => (g.scope === 'person' && g.employee_id === me.id) || (g.scope === 'team' && lead)} emptyText={t('Noch keine Ziele. Teamziele legt die Filialleitung an.')} /> : <p className="py-3 text-[13.5px] text-mute">…</p>}
      </div>

      <h2 className="rubric text-ink/70 mt-8 mb-2.5 px-1">{t('Meine Bewertungen')}</h2>
      <div className="rounded-[16px] bg-white px-4 py-1">{p?.ok && p.mapped !== false ? <ReviewList items={p.reviews ?? []} /> : <p className="py-3 text-[13.5px] text-mute">…</p>}</div>
    </div>
  )
}

/* ---------- Backoffice: eine Person ---------- */
export function PersonPerformance({ person }: { person: Staff }) {
  const { me, staff } = useApp()
  const [k, setK] = useState<PeriodKey>('month')
  const r = period(k)
  const p = usePerf({ from: r.from, to: r.to, employee_id: person.id })
  const [goals, reloadGoals] = useGoals({ employeeId: person.id })
  const [adding, setAdding] = useState(false)
  return <div>
    <div className="flex items-center justify-between gap-3 mb-3"><p className="rubric text-ink/70">Performance</p>
      <div className="flex gap-1 p-1 rounded-[10px] bg-sage-50">{PERIODS.slice(0, 4).map(([key, l]) => <button key={key} onClick={() => setK(key)} className={`h-7 px-2.5 rounded-[7px] text-[12.5px] ${k === key ? 'bg-white shadow-[0_1px_2px_rgba(29,34,28,.08)]' : 'text-ink/60'}`}>{l}</button>)}</div></div>
    {!p ? <div className="h-24 rounded-[12px] bg-sage-50 animate-pulse" /> : !p.ok ? <p className="text-[13.5px] text-mute">Phorest antwortet gerade nicht.</p>
      : p.mapped === false ? <p className="text-[13.5px] text-mute">Keine Phorest-Spalte zugeordnet, deshalb keine Zahlen.</p> : <KpiGrid p={p} admin />}
    <div className="grid grid-cols-2 gap-8 mt-6">
      <div><div className="flex items-baseline justify-between mb-1"><p className="rubric text-ink/70">Ziele</p>{!adding && <button onClick={() => setAdding(true)} className="text-[13px] text-olive-700">Ziel setzen</button>}</div>
        {adding && <div className="rounded-[12px] border border-line p-4 mb-2"><GoalForm admin scope="person" employeeId={person.id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); reloadGoals() }} /></div>}
        {goals && <GoalList goals={goals} staff={staff} onChanged={reloadGoals} canDeleteOf={() => me.app_role !== 'mitarbeiterin'} emptyText="Keine Ziele." />}</div>
      <div><p className="rubric text-ink/70 mb-1">Bewertungen</p>{p?.ok && p.mapped !== false && <ReviewList items={(p.reviews ?? []).slice(0, 6)} />}</div>
    </div>
  </div>
}

/* ---------- Backoffice: Studio ---------- */
export function StudioPerformance({ header }: { header: (action: ReactNode) => ReactNode }) {
  const { me, branches, staff } = useApp()
  const office = me.app_role === 'buero'
  const studios = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [b, setB] = useState(studios[0]?.id ?? '')
  const [k, setK] = useState<PeriodKey>('month')
  const r = period(k)
  const p = usePerf(b ? { from: r.from, to: r.to, branch: b } : null)
  const [goals, reloadGoals] = useGoals({ branchId: b })
  const [teamGoals, setTeamGoals] = useState<Goal[]>([])
  useEffect(() => { setTeamGoals(goals ?? []) }, [goals])
  // persönliche Ziele der Personen im Studio dazuholen
  const ids = useMemo(() => staff.filter(s => s.branch_id === b || (s.extra ?? []).includes(b)).map(s => s.id), [staff, b])
  const [personGoals, setPersonGoals] = useState<Goal[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => { if (!ids.length) return; supabase!.from('goals').select('*').eq('scope', 'person').in('employee_id', ids).then(({ data }) => setPersonGoals((data ?? []) as Goal[])) }, [ids, tick])
  const [adding, setAdding] = useState(false), [open, setOpen] = useState<PerfPerson | null>(null)
  const [sort, setSort] = useState<Metric>('revenue')
  const people = [...(p?.people ?? [])].sort((x, y) => (valueOf(y, sort) ?? -1) - (valueOf(x, sort) ?? -1))
  const exportCsv = () => {
    downloadCsv(`Performance ${studios.find(x => x.id === b)?.name} ${r.from} bis ${r.to}`, people.map(x => ({ Person: (() => { const s = staff.find(y => y.id === x.employee_id); return s ? `${s.first} ${s.last}` : x.name })(), Behandlungen: x.treatments, 'DL-Umsatz CHF': x.revenue, 'Ø je Besuch CHF': x.avg_ticket, Kundinnen: x.clients, 'Wunschtermine %': x.requested_pct, 'Online %': x.online_pct, 'Bewertung Ø': x.reviews.avg ?? '', Bewertungen: x.reviews.count })))
  }
  const th = (m: Metric | null, l: string) => <th className="text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">{m ? <button onClick={() => setSort(m)} className={sort === m ? 'text-ink' : ''}>{l}{sort === m ? ' ↓' : ''}</button> : l}</th>
  return <>
    {header(<div className="flex gap-3 items-center">
      {studios.length > 1 && <div className="flex gap-1 p-1 rounded-[10px] bg-sage-50">{studios.map(s => <button key={s.id} onClick={() => setB(s.id)} className={`h-8 px-3 rounded-[8px] text-[13px] ${b === s.id ? 'bg-white shadow-[0_1px_2px_rgba(29,34,28,.08)]' : 'text-ink/60'}`}>{s.name}</button>)}</div>}
      <div className="flex gap-1 p-1 rounded-[10px] bg-sage-50">{PERIODS.map(([key, l]) => <button key={key} onClick={() => setK(key)} className={`h-8 px-3 rounded-[8px] text-[13px] whitespace-nowrap ${k === key ? 'bg-white shadow-[0_1px_2px_rgba(29,34,28,.08)]' : 'text-ink/60'}`}>{l}</button>)}</div>
    </div>)}
    {!p ? <div className="h-28 rounded-[16px] bg-sage-50 animate-pulse" /> : !p.ok ? <p className="text-[14px] text-mute">Phorest antwortet gerade nicht.</p> : <>
      <KpiGrid p={p} admin />
      <p className="mt-2 text-[12px] text-mute">Vergleich mit dem gleich langen Zeitraum davor. Umsatz laut Terminpreisen abgeschlossener Termine, ohne Verkauf und Rabatte.</p>
      <div className="mt-8 flex items-baseline justify-between"><p className="rubric text-ink/70">Je Person</p><button onClick={exportCsv} className="text-[13px] text-olive-700">Als CSV</button></div>
      <table className="tbl w-full text-[14px] mt-2"><thead><tr>{th(null, 'Person')}{th('treatments', 'Behandlungen')}{th('revenue', 'DL-Umsatz')}{th('avg_ticket', 'Ø je Besuch')}{th('requested', 'Wunschtermine')}{th('rating', 'Bewertung')}</tr></thead>
        <tbody className="divide-y divide-line">{people.map(x => <tr key={x.staff_id} onClick={() => setOpen(x)} className="cursor-pointer hover:bg-sage-50/70">
          <td className="px-4 py-2.5">{(() => { const s = staff.find(y => y.id === x.employee_id); return s ? `${s.first} ${s.last}` : x.name })()}{!x.employee_id && <span className="ml-2 text-xs text-mute">nicht im TeamHub</span>}</td><td className="px-4 tabular-nums">{x.treatments}</td><td className="px-4 tabular-nums">{money(x.revenue)}</td>
          <td className="px-4 tabular-nums">{money(x.avg_ticket)}</td><td className="px-4 tabular-nums">{x.requested_pct} %</td><td className="px-4 tabular-nums">{x.reviews.avg !== null ? `${x.reviews.avg.toFixed(1)} ★ · ${x.reviews.count}` : '–'}</td></tr>)}</tbody></table>
    </>}
    <div className="grid grid-cols-2 gap-10 mt-10">
      <div><div className="flex items-baseline justify-between mb-1"><p className="rubric text-ink/70">Ziele</p>{!adding && <button onClick={() => setAdding(true)} className="text-[13px] text-olive-700 flex items-center gap-1"><Target size={14} />Teamziel erstellen</button>}</div>
        {adding && <div className="rounded-[12px] border border-line p-4 mb-2"><GoalForm admin scope="team" branchId={b} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); reloadGoals() }} /></div>}
        <GoalList goals={[...teamGoals, ...personGoals.filter(g => !teamGoals.some(x => x.id === g.id))]} staff={staff} onChanged={() => { reloadGoals(); setTick(x => x + 1) }} canDeleteOf={() => true} emptyText="Noch keine Ziele. Teamziele sehen alle im Studio in der App." /></div>
      <div><p className="rubric text-ink/70 mb-1">Neueste Bewertungen</p>{p?.ok && <ReviewList items={(p.reviews ?? []).slice(0, 8)} staff />}</div>
    </div>
    {open && <PersonModal x={open} onClose={() => setOpen(null)} />}
  </>
}

function PersonModal({ x, onClose }: { x: PerfPerson; onClose: () => void }) {
  const { staff } = useApp()
  const s = x.employee_id ? staff.find(y => y.id === x.employee_id) : null
  return <Modal width={920} title={s ? `${s.first} ${s.last}` : x.name} onClose={onClose}>
    {s ? <PersonPerformance person={s} /> : <p className="text-[14px] text-mute">Diese Person hat kein TeamHub-Konto. {x.treatments} Behandlungen, {money(x.revenue)} DL-Umsatz im gewählten Zeitraum.</p>}
  </Modal>
}
