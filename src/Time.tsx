import { useEffect, useState } from 'react'
import { Play, Pause, Square, ExternalLink, Plane, Clock, CalendarDays } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useApp, isoDay, addDays } from './store'
import { TONE, type Tone } from './tones'
import { locale } from './lib/i18n'
import { isIOS, isAndroid } from './lib/push'
import { toast } from './Toast'

// Zeit & Ferien aus Timebutler (Function `timebutler`, Wunsch der Inhaberin 21.10.): Stempeluhr, Resturlaub,
// Arbeitszeit der Woche, eigene Abwesenheiten. Anträge stellt man in Timebutler, die API v1 kann keine anlegen.
type Clock = { state: 'IDLE' | 'RUNNING' | 'PAUSED'; since: string | null; pauseSince: string | null }
type Absence = { id: string; from: string; to: string; type: string; state: string; days: number; half: boolean }
type Overview = { ok: boolean; configured?: boolean; linked?: boolean; error?: string; today?: string; vacation?: { contingent: number; remaining: number } | null; absences?: Absence[]; work?: { date: string; seconds: number }[]; clock?: Clock | null }

export const TIMEBUTLER = {
  web: 'https://app.timebutler.com/login/',
  ios: 'https://apps.apple.com/ch/app/timebutler/id6763064084',
  android: 'https://play.google.com/store/apps/details?id=com.timebutler.mobile',
}
const tbLink = () => isIOS() ? TIMEBUTLER.ios : isAndroid() ? TIMEBUTLER.android : TIMEBUTLER.web

// Nur lokal für Ansichts-PDFs: Beispieldaten, solange der Timebutler-Schlüssel fehlt
const demo = (): Overview | null => {
  try { if (!import.meta.env.DEV || localStorage.getItem('th-demo') !== '1') return null } catch { return null }
  const d = isoDay(), mon = addDays(-((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7), d)
  return { ok: true, configured: true, linked: true, today: d, vacation: { contingent: 25, remaining: 12.5 },
    clock: { state: 'RUNNING', since: new Date(Date.now() - (3 * 60 + 42) * 60000).toISOString(), pauseSince: null },
    work: [0, 1].map(i => ({ date: addDays(i, mon), seconds: [8.25, 7.5][i] * 3600 })),
    absences: [
      { id: '1', from: addDays(23, d), to: addDays(27, d), type: 'Ferien', state: 'Approved', days: 5, half: false },
      { id: '2', from: addDays(58, d), to: addDays(58, d), type: 'Ferien', state: 'Submitted', days: 1, half: false },
      { id: '3', from: addDays(-12, d), to: addDays(-11, d), type: 'Krankheit', state: 'Done', days: 2, half: false },
    ] }
}

const STATE: Record<string, [string, Tone]> = { Approved: ['Genehmigt', 'done'], Done: ['Erledigt', 'studio'], 'In process': ['In Bearbeitung', 'note'], Submitted: ['Beantragt', 'note'], Rejected: ['Abgelehnt', 'duty'] }
const hhmm = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')}`

export function TimeView() {
  const { t } = useApp()
  const [o, setO] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  const load = () => { const x = demo(); if (x) { setO(x); return } supabase?.functions.invoke('timebutler', { body: { action: 'overview' } }).then(({ data }) => setO((data as Overview) ?? { ok: false })) }
  useEffect(load, [])
  useEffect(() => { const iv = setInterval(() => tick(x => x + 1), 30000); return () => clearInterval(iv) }, [])
  const clock = async (command: string) => {
    if (demo()) { toast(t('Beispiel: In der App stempelt das direkt in Timebutler.')); return }
    setBusy(true)
    const { data } = await supabase!.functions.invoke('timebutler', { body: { action: 'clock', command } })
    setBusy(false)
    if (!data?.ok) { toast(t('Timebutler hat das nicht angenommen. Bitte in Timebutler prüfen.'), 'error'); return }
    setO(x => x ? { ...x, clock: data.clock } : x)
    toast(command === 'start' ? t('Eingestempelt') : command === 'pause' ? t('Pause gestartet') : command === 'resume' ? t('Weiter geht’s') : t('Ausgestempelt'))
  }
  const time = (iso: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  const range = (a: Absence) => { const f = (x: string, y = false) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) }).format(new Date(x + 'T12:00:00Z'))
    return a.from === a.to ? f(a.from) : `${f(a.from)} – ${f(a.to)}` }

  const header = <div className="px-5 pt-3 pb-4"><h1 className="text-[30px] leading-tight">{t('Zeit & Ferien')}</h1><p className="text-[14.5px] text-mute mt-0.5">{t('Aus Timebutler')}</p></div>
  if (!o) return <div className="pb-10">{header}<p className="px-5 text-mute">{t('Lädt …')}</p></div>
  if (!o.ok || !o.configured || !o.linked) return (
    <div className="pb-10">{header}
      <div className="px-4 space-y-3">
        <div className="rounded-[22px] bg-white p-5">
          <span className={`w-12 h-12 rounded-[14px] flex items-center justify-center ${TONE.learn.bg} ${TONE.learn.fg}`}><Clock size={22} /></span>
          <p className="mt-3 text-[18px] font-semibold">{!o.configured ? t('Timebutler wird gerade angebunden') : !o.ok ? t('Timebutler ist gerade nicht erreichbar') : t('Kein Timebutler-Konto zu deiner Firmen-Mail')}</p>
          <p className="mt-1 text-[15.5px] text-mute leading-snug">{!o.configured ? t('Bald siehst du hier deine Stempeluhr, deinen Ferienstand und deine Abwesenheiten. Bis dahin öffnest du Timebutler direkt.') : !o.ok ? t('Bitte versuche es später noch einmal.') : t('Bitte melde dich im Büro, damit dein Timebutler-Konto mit deiner Firmen-Mail verknüpft wird.')}</p>
          <a href={tbLink()} target="_blank" rel="noreferrer" className="mt-4 h-12 rounded-[16px] bg-olive-800 text-white font-semibold flex items-center justify-center gap-2">{t('Timebutler öffnen')}<ExternalLink size={16} /></a>
        </div>
      </div>
    </div>
  )
  const c = o.clock, running = c?.state === 'RUNNING', paused = c?.state === 'PAUSED'
  const elapsed = c?.since ? (Date.now() - new Date(c.since).getTime()) / 1000 - (paused && c.pauseSince ? (Date.now() - new Date(c.pauseSince).getTime()) / 1000 : 0) : 0
  const today = o.today ?? isoDay(), mon = addDays(-((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7), today)
  const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(i, mon); return { d, sec: (o.work ?? []).find(w => w.date === d)?.seconds ?? 0 } })
  if (running || paused) { const w = week.find(x => x.d === today); if (w) w.sec += Math.max(0, elapsed) }
  const weekSec = week.reduce((s, x) => s + x.sec, 0), max = Math.max(9 * 3600, ...week.map(x => x.sec))
  const v = o.vacation, used = v ? Math.max(0, v.contingent - v.remaining) : 0
  const upcoming = (o.absences ?? []).filter(a => a.to >= today), past = (o.absences ?? []).filter(a => a.to < today).reverse().slice(0, 4)
  const R = 46, C = 2 * Math.PI * R
  return (
    <div className="pb-10">{header}
      <div className="px-4 space-y-3">
        {/* Stempeluhr */}
        <div className="rounded-[24px] bg-olive-800 text-white p-5">
          <div className="flex items-center justify-between"><p className="rubric text-white/70">{t('Stempeluhr')}</p>
            <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${running ? 'bg-done text-white' : paused ? 'bg-note text-white' : 'bg-white/15 text-white/85'}`}>{running ? t('Eingestempelt') : paused ? t('Pause') : t('Nicht eingestempelt')}</span></div>
          <p className="mt-3 font-display text-[52px] leading-none tabular-nums">{running || paused ? hhmm(Math.max(0, elapsed)) : '0:00'}<span className="text-[20px] text-white/60 ml-1">h</span></p>
          <p className="mt-2 text-[15px] text-white/75">{running && c?.since ? t('seit {time}', { time: time(c.since) }) : paused && c?.pauseSince ? t('Pause seit {time}', { time: time(c.pauseSince) }) : t('Tippe auf Einstempeln, wenn du anfängst.')}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {!running && !paused && <button disabled={busy} onClick={() => clock('start')} className="col-span-2 h-12 rounded-[16px] bg-white text-olive-800 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Play size={18} />{t('Einstempeln')}</button>}
            {running && <button disabled={busy} onClick={() => clock('pause')} className="h-12 rounded-[16px] bg-white/15 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Pause size={18} />{t('Pause')}</button>}
            {paused && <button disabled={busy} onClick={() => clock('resume')} className="h-12 rounded-[16px] bg-white text-olive-800 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Play size={18} />{t('Weiter')}</button>}
            {(running || paused) && <button disabled={busy} onClick={() => clock('stop')} className="h-12 rounded-[16px] bg-white/15 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Square size={16} />{t('Ausstempeln')}</button>}
          </div>
        </div>

        {/* Ferien */}
        {v && <div className="rounded-[22px] bg-white p-5">
          <div className="flex items-center gap-5">
            <svg viewBox="0 0 110 110" className="w-[104px] h-[104px] shrink-0 -rotate-90"><circle cx="55" cy="55" r={R} fill="none" strokeWidth="11" className="stroke-sage-100" />
              <circle cx="55" cy="55" r={R} fill="none" strokeWidth="11" strokeLinecap="round" className="stroke-learn" strokeDasharray={`${C * (v.contingent ? v.remaining / v.contingent : 0)} ${C}`} /></svg>
            <div className="min-w-0"><p className="rubric text-ink/70">{t('Ferien {year}', { year: today.slice(0, 4) })}</p>
              <p className="mt-1 font-display text-[34px] leading-none">{String(v.remaining).replace('.', ',')}<span className="text-[17px] text-mute ml-1.5">{t('Tage übrig')}</span></p>
              <p className="mt-1.5 text-[15px] text-mute">{t('{a} von {b} Tagen genommen oder geplant', { a: String(used).replace('.', ','), b: String(v.contingent).replace('.', ',') })}</p></div>
          </div>
          <a href={tbLink()} target="_blank" rel="noreferrer" className={`mt-4 h-12 rounded-[16px] font-semibold flex items-center justify-center gap-2 ${TONE.learn.bg} ${TONE.learn.fg}`}><Plane size={18} />{t('Ferien beantragen')}<ExternalLink size={14} /></a>
        </div>}

        {/* Woche */}
        <div className="rounded-[22px] bg-white p-5">
          <div className="flex items-baseline justify-between"><p className="rubric text-ink/70">{t('Diese Woche')}</p><p className="font-display text-[22px] tabular-nums">{hhmm(weekSec)} h</p></div>
          <div className="mt-4 grid grid-cols-7 gap-2 items-end h-[120px]">{week.map(x => { const h = x.sec / max * 100, isToday = x.d === today
            return <div key={x.d} className="flex flex-col items-center gap-1.5 h-full justify-end">
              <span className="text-[11.5px] text-mute tabular-nums">{x.sec ? hhmm(x.sec) : ''}</span>
              <div className={`w-full rounded-[8px] ${isToday ? 'bg-done' : x.sec ? 'bg-studio' : 'bg-sage-100'}`} style={{ height: x.sec ? Math.max(8, h * .8) + '%' : '6px' }} />
              <span className={`text-[12.5px] ${isToday ? 'font-semibold text-ink' : 'text-mute'}`}>{new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short' }).format(new Date(x.d + 'T12:00:00Z')).replace('.', '')}</span>
            </div> })}</div>
        </div>

        {/* Abwesenheiten */}
        <div className="rounded-[22px] bg-white overflow-hidden">
          <p className="px-5 pt-4 pb-2 rubric text-ink/70">{t('Abwesenheiten')}</p>
          {upcoming.length === 0 && past.length === 0 && <p className="px-5 pb-4 text-[15.5px] text-mute">{t('Keine Einträge in diesem Jahr.')}</p>}
          <div className="divide-y divide-line">{[...upcoming, ...past].map(a => { const [label, tone] = STATE[a.state] ?? [a.state, 'studio' as Tone], isPast = a.to < today
            return <div key={a.id} className={`px-5 py-3.5 flex items-center gap-3 ${isPast ? 'opacity-60' : ''}`}>
              <span className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 ${/krank/i.test(a.type) ? `${TONE.duty.bg} ${TONE.duty.fg}` : `${TONE.learn.bg} ${TONE.learn.fg}`}`}>{/krank/i.test(a.type) ? <CalendarDays size={18} /> : <Plane size={18} />}</span>
              <span className="flex-1 min-w-0"><span className="block text-[17px]">{range(a)}</span><span className="block text-[14px] text-mute">{a.type} · {a.half ? t('halber Tag') : a.days === 1 ? t('1 Tag') : t('{n} Tage', { n: String(a.days).replace('.', ',') })}</span></span>
              <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold shrink-0 ${TONE[tone].bg} ${TONE[tone].fg}`}>{t(label)}</span>
            </div> })}</div>
        </div>
        <p className="px-1 text-[13.5px] text-mute">{t('Anträge und Korrekturen machst du in Timebutler, TeamHub zeigt dir den Stand.')}</p>
      </div>
    </div>
  )
}
