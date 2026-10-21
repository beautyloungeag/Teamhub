import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Square, ExternalLink, Plane, Clock, CalendarDays, Lock, X, Plus } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useApp, isoDay, addDays } from './store'
import { TONE, type Tone } from './tones'
import { locale } from './lib/i18n'
import { isIOS, isAndroid } from './lib/push'
import { toast } from './Toast'

// Zeit & Ferien aus Timebutler (Function `timebutler`, API v2, Wunsch der Inhaberin 21.10.). Jede Person verbindet ihr
// eigenes Timebutler-Konto einmal; danach Stempeluhr, Ferienstand, Arbeitszeit, eigene Anträge und Ferien beantragen.
type ClockSt = { status: 'idle' | 'running' | 'paused' | 'waiting'; workTimeElapsedSeconds?: number; breakElapsedSeconds?: number; pauseTimestamp?: number; startTimestamp?: number; startOnlyOnTerminal?: boolean; pauseOnlyOnTerminal?: boolean; stopOnlyOnTerminal?: boolean }
type Req = { id: string; type: string; startDate: string; endDate: string; days: number; status: 'pending' | 'approved' | 'rejected'; halfDay?: 'morning' | 'afternoon' | null }
type AType = { id: string; name: string; half: boolean; approval: boolean }
type Overview = {
  ok: boolean; configured?: boolean; connected?: boolean; reconnect?: boolean; known?: boolean | null; email?: string; error?: string; today?: string
  profile?: { name?: string; timeTracking: boolean } | null
  summary?: { vacationDaysRemaining: number; vacationDaysTotal: number; vacationDaysApproved: number; vacationDaysPending: number; illnessDaysTaken: number } | null
  clock?: ClockSt | null; work?: { workedMinutes: number; commitmentMinutes: number; percentDone: number } | null
  requests?: Req[]; types?: AType[]; entries?: { date: string; workedMinutes: number }[]
}
export const TIMEBUTLER = { web: 'https://app.timebutler.com/login/', ios: 'https://apps.apple.com/ch/app/timebutler/id6763064084', android: 'https://play.google.com/store/apps/details?id=com.timebutler.mobile' }
const tbLink = () => isIOS() ? TIMEBUTLER.ios : isAndroid() ? TIMEBUTLER.android : TIMEBUTLER.web
const call = async (body: Record<string, unknown>) => (await supabase!.functions.invoke('timebutler', { body })).data as Overview & { mfa?: boolean; mfa_token?: string; clock?: ClockSt; status?: number }

// Nur lokal für Ansichts-PDFs: Beispieldaten
const demoOn = () => { try { return import.meta.env.DEV && localStorage.getItem('th-demo') === '1' } catch { return false } }
const demo = (): Overview => {
  const d = isoDay(), mon = addDays(-((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7), d)
  return { ok: true, configured: true, connected: true, today: d, profile: { timeTracking: true },
    summary: { vacationDaysRemaining: 12.5, vacationDaysTotal: 25, vacationDaysApproved: 10, vacationDaysPending: 1, illnessDaysTaken: 2 },
    clock: { status: 'running', workTimeElapsedSeconds: (3 * 60 + 42) * 60 }, work: { workedMinutes: 222, commitmentMinutes: 504, percentDone: 44 },
    entries: [{ date: mon, workedMinutes: 495 }, { date: addDays(1, mon), workedMinutes: 450 }].filter(x => x.date < d),
    types: [{ id: '1', name: 'Ferien', half: true, approval: true }, { id: '2', name: 'Überstundenabbau', half: true, approval: true }],
    requests: [
      { id: 'a', type: 'Ferien', startDate: addDays(23, d), endDate: addDays(27, d), days: 5, status: 'approved' },
      { id: 'b', type: 'Ferien', startDate: addDays(58, d), endDate: addDays(58, d), days: 1, status: 'pending' },
      { id: 'c', type: 'Krankheit', startDate: addDays(-12, d), endDate: addDays(-11, d), days: 2, status: 'approved' },
    ] }
}
const STATE: Record<string, [string, Tone]> = { approved: ['Genehmigt', 'done'], pending: ['Beantragt', 'note'], rejected: ['Abgelehnt', 'duty'] }
const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')}`
const num = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',')

export function TimeView() {
  const { t } = useApp()
  const [o, setO] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(false), [ask, setAsk] = useState(false)
  const fetched = useRef(Date.now())
  const [, tick] = useState(0)
  const load = () => { if (demoOn()) { setO(demo()); fetched.current = Date.now(); return }
    call({ action: 'overview' }).then(x => { fetched.current = Date.now(); setO(x ?? { ok: false }) }).catch(() => setO({ ok: false })) }
  useEffect(load, [])
  useEffect(() => { const iv = setInterval(() => tick(x => x + 1), 20000); return () => clearInterval(iv) }, [])
  const clock = async (command: string) => {
    if (demoOn()) { toast(t('Beispiel: In der App stempelt das direkt in Timebutler.')); return }
    setBusy(true); const r = await call({ action: 'clock', command }).catch(() => null); setBusy(false)
    if (!r?.ok) { toast(t('Timebutler hat das nicht angenommen. Bitte in Timebutler prüfen.'), 'error'); return }
    toast(command === 'start' ? t('Eingestempelt') : command === 'pause' ? t('Pause gestartet') : command === 'resume' ? t('Weiter geht’s') : t('Ausgestempelt'))
    load()
  }
  const withdraw = async (r: Req) => {
    if (demoOn()) { toast(t('Beispiel: In der App wird der Antrag in Timebutler zurückgezogen.')); return }
    if (!confirm(r.status === 'pending' ? t('Antrag zurückziehen?') : t('Stornierung bei der Leitung anfragen?'))) return
    const x = await call({ action: 'withdraw', id: r.id }).catch(() => null)
    if (x?.ok) { toast(r.status === 'pending' ? t('Antrag zurückgezogen') : t('Stornierung angefragt')); load() } else toast(t('Das hat nicht geklappt'), 'error')
  }
  const range = (a: Req) => { const f = (x: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(x + 'T12:00:00Z'))
    return a.startDate === a.endDate ? f(a.startDate) : `${f(a.startDate)} – ${f(a.endDate)}` }

  const header = <div className="px-5 pt-3 pb-4"><h1 className="text-[30px] leading-tight">{t('Zeit & Ferien')}</h1><p className="text-[14.5px] text-mute mt-0.5">{t('Aus Timebutler')}</p></div>
  if (!o) return <div className="pb-10">{header}<p className="px-5 text-mute">{t('Lädt …')}</p></div>
  if (!o.ok) return <div className="pb-10">{header}<div className="px-4"><div className="rounded-[22px] bg-white p-5"><p className="text-[17px] font-semibold">{t('Timebutler ist gerade nicht erreichbar')}</p><p className="mt-1 text-[15.5px] text-mute">{t('Bitte versuche es später noch einmal.')}</p><button onClick={load} className="mt-4 h-11 px-4 rounded-[14px] bg-sage-50 font-medium">{t('Erneut versuchen')}</button></div></div></div>
  if (!o.connected) return <div className="pb-10">{header}<Connect o={o} onDone={load} /></div>

  const today = o.today ?? isoDay(), mon = addDays(-((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7), today)
  const c = o.clock, running = c?.status === 'running', paused = c?.status === 'paused'
  const since = (Date.now() - fetched.current) / 1000
  const elapsedMin = ((c?.workTimeElapsedSeconds ?? 0) + (running ? since : 0)) / 60
  const workedToday = Math.max(o.work?.workedMinutes ?? 0, 0) + (running ? since / 60 : 0)
  const goal = o.work?.commitmentMinutes ?? 0
  const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(i, mon); return { d, min: d === today ? Math.max(workedToday, (o.entries ?? []).filter(e => e.date === d).reduce((s, e) => s + e.workedMinutes, 0)) : (o.entries ?? []).filter(e => e.date === d).reduce((s, e) => s + e.workedMinutes, 0) } })
  const weekMin = week.reduce((s, x) => s + x.min, 0), max = Math.max(9 * 60, ...week.map(x => x.min))
  const v = o.summary, R = 46, C = 2 * Math.PI * R
  const reqs = [...(o.requests ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const upcoming = reqs.filter(a => a.endDate >= today), past = reqs.filter(a => a.endDate < today).reverse().slice(0, 4)
  const tracking = o.profile?.timeTracking !== false
  return (
    <div className="pb-10">{header}
      <div className="px-4 space-y-3">
        {tracking && c && <div className="rounded-[24px] bg-olive-800 text-white p-5">
          <div className="flex items-center justify-between"><p className="rubric text-white/70">{t('Stempeluhr')}</p>
            <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${running ? 'bg-done text-white' : paused ? 'bg-note text-white' : 'bg-white/15 text-white/85'}`}>{running ? t('Eingestempelt') : paused ? t('Pause') : c.status === 'waiting' ? t('Wartet') : t('Nicht eingestempelt')}</span></div>
          <p className="mt-3 font-display text-[52px] leading-none tabular-nums">{hm(running || paused ? elapsedMin : 0)}<span className="text-[20px] text-white/60 ml-1">h</span></p>
          {goal > 0 && <><div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-white/85" style={{ width: Math.min(100, workedToday / goal * 100) + '%' }} /></div>
            <p className="mt-1.5 text-[14.5px] text-white/75">{t('Heute {a} von {b} h', { a: hm(workedToday), b: hm(goal) })}</p></>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {!running && !paused && <button disabled={busy || c.startOnlyOnTerminal} onClick={() => clock('start')} className="col-span-2 h-12 rounded-[16px] bg-white text-olive-800 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"><Play size={18} />{t('Einstempeln')}</button>}
            {running && <button disabled={busy || c.pauseOnlyOnTerminal} onClick={() => clock('pause')} className="h-12 rounded-[16px] bg-white/15 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"><Pause size={18} />{t('Pause')}</button>}
            {paused && <button disabled={busy} onClick={() => clock('resume')} className="h-12 rounded-[16px] bg-white text-olive-800 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"><Play size={18} />{t('Weiter')}</button>}
            {(running || paused) && <button disabled={busy || c.stopOnlyOnTerminal} onClick={() => clock('stop')} className="h-12 rounded-[16px] bg-white/15 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"><Square size={16} />{t('Ausstempeln')}</button>}
          </div>
          {(c.startOnlyOnTerminal || c.stopOnlyOnTerminal) && <p className="mt-2 text-[13px] text-white/70">{t('Stempeln ist für dich nur am Terminal im Studio möglich.')}</p>}
        </div>}

        {v && <div className="rounded-[22px] bg-white p-5">
          <div className="flex items-center gap-5">
            <svg viewBox="0 0 110 110" className="w-[104px] h-[104px] shrink-0 -rotate-90"><circle cx="55" cy="55" r={R} fill="none" strokeWidth="11" className="stroke-sage-100" />
              <circle cx="55" cy="55" r={R} fill="none" strokeWidth="11" strokeLinecap="round" className="stroke-learn" strokeDasharray={`${C * (v.vacationDaysTotal ? Math.max(0, v.vacationDaysRemaining) / v.vacationDaysTotal : 0)} ${C}`} /></svg>
            <div className="min-w-0"><p className="rubric text-ink/70">{t('Ferien {year}', { year: today.slice(0, 4) })}</p>
              <p className="mt-1 font-display text-[34px] leading-none">{num(v.vacationDaysRemaining)}<span className="text-[17px] text-mute ml-1.5">{t('Tage übrig')}</span></p>
              <p className="mt-1.5 text-[15px] text-mute">{t('von {n} Tagen', { n: num(v.vacationDaysTotal) })}</p></div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[[v.vacationDaysApproved, 'genehmigt', 'done'], [v.vacationDaysPending, 'beantragt', 'note'], [v.illnessDaysTaken, 'krank', 'duty']].map(([n, l, tn]) =>
              <div key={l as string} className={`rounded-[14px] py-2 ${TONE[tn as Tone].bg}`}><p className={`font-display text-[20px] ${TONE[tn as Tone].fg}`}>{num(n as number)}</p><p className="text-[12.5px] text-ink/70">{t(l as string)}</p></div>)}
          </div>
          <button onClick={() => setAsk(true)} className={`mt-3 w-full h-12 rounded-[16px] font-semibold flex items-center justify-center gap-2 ${TONE.learn.bg} ${TONE.learn.fg}`}><Plane size={18} />{t('Ferien beantragen')}</button>
        </div>}

        {tracking && <div className="rounded-[22px] bg-white p-5">
          <div className="flex items-baseline justify-between"><p className="rubric text-ink/70">{t('Diese Woche')}</p><p className="font-display text-[22px] tabular-nums">{hm(weekMin)} h</p></div>
          <div className="mt-4 grid grid-cols-7 gap-2 items-end h-[120px]">{week.map(x => { const isToday = x.d === today
            return <div key={x.d} className="flex flex-col items-center gap-1.5 h-full justify-end">
              <span className="text-[11.5px] text-mute tabular-nums">{x.min ? hm(x.min) : ''}</span>
              <div className={`w-full rounded-[8px] ${isToday ? 'bg-done' : x.min ? 'bg-studio' : 'bg-sage-100'}`} style={{ height: x.min ? Math.max(8, x.min / max * 80) + '%' : '6px' }} />
              <span className={`text-[12.5px] ${isToday ? 'font-semibold text-ink' : 'text-mute'}`}>{new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short' }).format(new Date(x.d + 'T12:00:00Z')).replace('.', '')}</span>
            </div> })}</div>
        </div>}

        <div className="rounded-[22px] bg-white overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between"><p className="rubric text-ink/70">{t('Meine Anträge')}</p><button onClick={() => setAsk(true)} className="h-8 px-3 rounded-full bg-sage-50 text-[14px] flex items-center gap-1"><Plus size={14} />{t('Neu')}</button></div>
          {!upcoming.length && !past.length && <p className="px-5 pb-4 text-[15.5px] text-mute">{t('Keine Einträge in diesem Jahr.')}</p>}
          <div className="divide-y divide-line">{[...upcoming, ...past].map(a => { const [label, tone] = STATE[a.status] ?? [a.status, 'studio' as Tone], isPast = a.endDate < today, sick = /krank/i.test(a.type)
            return <div key={a.id} className={`px-5 py-3.5 flex items-center gap-3 ${isPast ? 'opacity-60' : ''}`}>
              <span className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 ${sick ? `${TONE.duty.bg} ${TONE.duty.fg}` : `${TONE.learn.bg} ${TONE.learn.fg}`}`}>{sick ? <CalendarDays size={18} /> : <Plane size={18} />}</span>
              <span className="flex-1 min-w-0"><span className="block text-[17px]">{range(a)}</span><span className="block text-[14px] text-mute">{a.type} · {a.halfDay ? t('halber Tag') : a.days === 1 ? t('1 Tag') : t('{n} Tage', { n: num(a.days) })}</span>
                {!isPast && a.status !== 'rejected' && !sick && <button onClick={() => withdraw(a)} className="mt-1 text-[13.5px] text-sage-800 underline underline-offset-2">{a.status === 'pending' ? t('Zurückziehen') : t('Stornieren')}</button>}</span>
              <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold shrink-0 ${TONE[tone].bg} ${TONE[tone].fg}`}>{t(label)}</span>
            </div> })}</div>
        </div>
        <div className="flex items-center justify-between px-1">
          <a href={tbLink()} target="_blank" rel="noreferrer" className="text-[14px] text-sage-800 flex items-center gap-1">{t('Timebutler öffnen')}<ExternalLink size={13} /></a>
          {!demoOn() && <button onClick={async () => { await call({ action: 'disconnect' }); load() }} className="text-[14px] text-mute">{t('Timebutler trennen')}</button>}
        </div>
      </div>
      {ask && <RequestSheet types={o.types ?? []} today={today} onClose={() => setAsk(false)} onDone={() => { setAsk(false); load() }} />}
    </div>
  )
}

function Connect({ o, onDone }: { o: Overview; onDone: () => void }) {
  const { t, me } = useApp()
  const [email, setEmail] = useState(o.email || me.email), [pw, setPw] = useState(''), [code, setCode] = useState(''), [mfa, setMfa] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState(o.reconnect ? t('Die Verbindung zu Timebutler ist abgelaufen. Bitte einmal neu anmelden.') : '')
  const go = async () => {
    setBusy(true); setErr('')
    const r = await call(mfa ? { action: 'connect', mfa_token: mfa, code } : { action: 'connect', email, password: pw }).catch(() => null)
    setBusy(false); setPw('')
    if (r?.ok && r.mfa && r.mfa_token) { setMfa(r.mfa_token); return }
    if (r?.ok) { toast(t('Timebutler verbunden')); onDone(); return }
    const e = (r as { error?: string } | null)?.error
    setErr(e === 'code_wrong' ? t('Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.') : e === 'too_many' ? t('Zu viele Versuche. Bitte warte kurz.') : e === 'login_failed' ? t('Anmeldung fehlgeschlagen. Bitte prüfe Mail und Passwort von Timebutler.') : t('Timebutler ist gerade nicht erreichbar.'))
  }
  return (
    <div className="px-4 space-y-3">
      <div className="rounded-[22px] bg-white p-5">
        <span className={`w-12 h-12 rounded-[14px] flex items-center justify-center ${TONE.learn.bg} ${TONE.learn.fg}`}><Clock size={22} /></span>
        <p className="mt-3 text-[18px] font-semibold">{t('Stempeln und Ferien direkt im TeamHub')}</p>
        <p className="mt-1 text-[15.5px] text-mute leading-snug">{t('Melde dich einmal mit deinem Timebutler-Zugang an. Danach stempelst du hier, siehst deinen Ferienstand und beantragst Ferien.')}</p>
        {mfa ? <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder={t('Code aus der Authenticator-App')} className="mt-4 w-full h-12 rounded-[14px] bg-sage-50 px-4 text-[17px] tracking-[0.3em] outline-none placeholder:text-mute placeholder:tracking-normal" />
          : <>
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="mt-4 w-full h-12 rounded-[14px] bg-sage-50 px-4 text-[16px] outline-none" />
            <input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && pw && go()} placeholder={t('Timebutler-Passwort')} className="mt-2 w-full h-12 rounded-[14px] bg-sage-50 px-4 text-[16px] outline-none placeholder:text-mute" />
          </>}
        {o.known === false && !mfa && email.toLowerCase() === me.email.toLowerCase() && <p className="mt-2 text-[14px] text-note">{t('Zu deiner Firmen-Mail gibt es kein Timebutler-Konto. Nutze die Mail, mit der du dich in Timebutler anmeldest.')}</p>}
        {err && <p role="alert" className="mt-2 text-[14.5px] text-duty">{err}</p>}
        <button disabled={busy || (mfa ? code.length < 6 : !pw || !email)} onClick={go} className="mt-3 w-full h-12 rounded-[16px] bg-olive-800 text-white font-semibold disabled:opacity-50">{busy ? t('Verbindet …') : mfa ? t('Bestätigen') : t('Timebutler verbinden')}</button>
        <p className="mt-3 text-[13.5px] text-mute flex gap-1.5"><Lock size={14} className="shrink-0 mt-0.5" />{t('TeamHub speichert dein Passwort nicht, nur einen verschlüsselten Zugang, den du jederzeit trennen kannst.')}</p>
      </div>
      <a href={tbLink()} target="_blank" rel="noreferrer" className="rounded-[18px] bg-white px-4 py-3.5 flex items-center gap-3 text-[16px]"><span className="flex-1">{t('Lieber Timebutler direkt öffnen')}</span><ExternalLink size={16} className="text-sage-400" /></a>
    </div>
  )
}

// Datum gleich auf jedem Gerät anzeigen; darüber liegt unsichtbar der Datumswähler des Geräts
function DateField({ label, value, min, disabled, onChange }: { label: string; value: string; min?: string; disabled?: boolean; onChange: (v: string) => void }) {
  const shown = value ? new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value + 'T12:00:00Z')) : ''
  return <label className={`block ${disabled ? 'opacity-50' : ''}`}><span className="block text-[14px] text-mute mb-1.5">{label}</span>
    <span className="relative block h-12 rounded-[14px] bg-sage-50 px-4 text-[16px] flex items-center justify-between">{shown}<CalendarDays size={17} className="text-mute" />
      <input type="date" min={min} value={value} disabled={disabled} onChange={e => e.target.value && onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" /></span></label>
}

function RequestSheet({ types, today, onClose, onDone }: { types: AType[]; today: string; onClose: () => void; onDone: () => void }) {
  const { t } = useApp()
  const usable = types.filter(x => !/krank|überstunde|ueb|aua/i.test(x.name))
  const [type, setType] = useState((usable.find(x => /ferien|urlaub/i.test(x.name)) ?? usable[0])?.id ?? '')
  const [from, setFrom] = useState(addDays(14, today)), [to, setTo] = useState(addDays(14, today)), [half, setHalf] = useState<'' | 'morning' | 'afternoon'>(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const tp = usable.find(x => x.id === type)
  const send = async () => {
    if (demoOn()) { toast(t('Beispiel: In der App geht der Antrag direkt an Timebutler.')); onClose(); return }
    setBusy(true)
    const r = await call({ action: 'request', absenceTypeId: type, startDate: from, endDate: half ? from : to, halfDay: half || undefined, comments: note.trim() || undefined }).catch(() => null)
    setBusy(false)
    if (r?.ok) { toast(tp?.approval ? t('Antrag gesendet. Deine Leitung bekommt ihn in Timebutler.') : t('Eingetragen')); onDone() }
    else toast((r as { error?: string } | null)?.error || t('Timebutler hat den Antrag nicht angenommen.'), 'error')
  }
  return (
    <div className="fixed inset-0 z-50 bg-ink/30 flex items-end md:items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full md:max-w-[480px] bg-paper rounded-t-[24px] md:rounded-[24px] p-5 pb-8">
        <div className="flex items-center justify-between"><p className="text-[20px]">{t('Ferien beantragen')}</p><button onClick={onClose} aria-label={t('Schliessen')} className="w-9 h-9 rounded-full bg-white flex items-center justify-center"><X size={18} /></button></div>
        <div className="mt-4 rounded-[18px] bg-white p-4 space-y-3">
          {usable.length > 1 && <label className="block"><span className="block text-[14px] text-mute mb-1.5">{t('Art')}</span>
            <div className="flex flex-wrap gap-2">{usable.map(x => <button key={x.id} onClick={() => setType(x.id)} className={`h-10 px-3.5 rounded-full text-[15px] ${type === x.id ? 'bg-olive-800 text-white' : 'bg-sage-50'}`}>{x.name}</button>)}</div></label>}
          <div className="grid grid-cols-2 gap-2">
            <DateField label={t('Von')} value={from} min={today} onChange={v => { setFrom(v); if (to < v) setTo(v) }} />
            <DateField label={t('Bis')} value={half ? from : to} min={from} disabled={!!half} onChange={setTo} />
          </div>
          {tp?.half && <div className="grid grid-cols-3 gap-1 p-1 rounded-[14px] bg-sage-50">{([['', 'Ganze Tage'], ['morning', 'Vormittag'], ['afternoon', 'Nachmittag']] as const).map(([k, l]) => <button key={k} onClick={() => setHalf(k)} className={`h-10 rounded-[11px] text-[14.5px] ${half === k ? 'bg-white font-semibold' : 'text-ink/70'}`}>{t(l)}</button>)}</div>}
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={t('Bemerkung (optional)')} className="w-full rounded-[14px] bg-sage-50 px-4 py-3 text-[16px] outline-none resize-none placeholder:text-mute" />
        </div>
        <button disabled={busy || !type} onClick={send} className="mt-4 w-full h-12 rounded-[16px] bg-olive-800 text-white font-semibold disabled:opacity-50">{busy ? t('Sendet …') : t('Antrag senden')}</button>
        <p className="mt-2 text-[13px] text-mute text-center">{t('Der Antrag geht direkt an Timebutler, deine Leitung genehmigt ihn dort.')}</p>
      </div>
    </div>
  )
}
