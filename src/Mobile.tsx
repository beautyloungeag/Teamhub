import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  Home, ListChecks, BookOpen, LayoutGrid, Sparkles, ChevronLeft, ChevronRight, Check, Camera, MapPin, Users,
  Search, Lightbulb, AlertTriangle, CalendarDays, Send, Newspaper, Plane, Play, Video,
  ArrowUp, ArrowUpRight, LogOut, Phone, ArrowBigUp, GraduationCap, Link2, Lock, FileText, Smartphone, Share, PlusSquare, MoreVertical, ExternalLink, Monitor,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { phorest, type MyDay, type TeamToday, type StaffWeek, type ClientHit, type ClientHistory } from './lib/phorest'
import { pushState, enablePush, disablePush, testPush, reportDevice, isStandalone, isIOS, isAndroid, canPromptInstall, promptInstall, type PushState } from './lib/push'
import { useApp, isoDay, addDays, zurichHour, type Lang, type News, type WikiArticle, type WikiBlock, type Staff } from './store'
import { Terminbuch, EventCalendar, colorFor } from './Calendar'
import { TONE, toneOf, tileTone, type Tone } from './tones'
import { tr, locale } from './lib/i18n'
import { emojiOf } from './lib/wiki'
import { ContactLocked } from './ContactLock'
import { BMark } from './Logo'
import { Comments, Media } from './TicketParts'
import { QuizRunner } from './QuizRunner'
import { PollForm } from './Poll'
import { MyPerformance } from './Performance'
import { BenniChat, openNewBenniChat, askBenniOnce, BenniWorking, BenniText, type Step } from './BenniChat'
import { MyTodos, useTodos, isForMe, isLate, useDue, reloadTodos } from './Todos'
import { Avatar, ContactRow } from './People'
import { SideNav } from './Nav'
import { useStandbyRequests, answerStandby, reloadStandby, timeSpan } from './standby'
export { Avatar }
import { toast } from './Toast'

// Name des KI-Reiters (im Vertrag „Marc Beau“, im abgestimmten Prototyp „Benni“)
export const ASSISTANT = 'Benni'

type Tab = 'home' | 'tasks' | 'ai' | 'wiki' | 'menu'
type Sub = null | { k: 'news-list' } | { k: 'news'; item: News } | { k: 'wiki'; item: WikiArticle } | { k: 'wiki-cat'; key: string; name: string } | { k: 'onboarding' } | { k: 'team' } | { k: 'profile'; item: Staff }
  | { k: 'me' } | { k: 'conn' } | { k: 'book' } | { k: 'tickets' } | { k: 'ticket'; id: string } | { k: 'clients'; cid?: string } | { k: 'events' } | { k: 'inbox' } | { k: 'time' } | { k: 'install' } | { k: 'perf' }


export default function Mobile({ onSwitch }: { onSwitch?: () => void }) {
  const { signOut } = useAuth()
  return <Shell onLogout={signOut} onSwitch={onSwitch} />
}

/* ---------- Primitives ---------- */
const Card = ({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) =>
  onClick ? <button onClick={onClick} className={`w-full text-left rounded-[16px] bg-white ${className}`}>{children}</button>
    : <div className={`rounded-[16px] bg-white ${className}`}>{children}</div>
const Row = ({ icon, title, sub, onClick, right }: { icon?: ReactNode; title: string; sub?: string; onClick?: () => void; right?: ReactNode }) => (
  <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
    {icon && <span className="w-6 flex items-center justify-center text-olive-700 shrink-0">{icon}</span>}
    <span className="flex-1 min-w-0"><span className="block text-[17px] truncate">{title}</span>{sub && <span className="block text-[13px] text-mute truncate mt-0.5">{sub}</span>}</span>
    {right ?? <ChevronRight size={18} className="text-sage-400 shrink-0" />}
  </button>
)
const List = ({ children }: { children: ReactNode }) => <Card className="divide-y divide-sage-50 overflow-hidden">{children}</Card>
const Title = ({ children, sub, right }: { children: ReactNode; sub?: string; right?: ReactNode }) => (
  <div className="px-5 pt-3 pb-4 flex items-end justify-between gap-3">
    <div>{sub && <p className="text-[14.5px] text-mute">{sub}</p>}<h1 className="text-[30px] leading-tight">{children}</h1></div>{right}
  </div>
)
const Label = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex items-baseline justify-between mt-8 mb-2.5 px-1"><h2 className="rubric text-ink/70">{children}</h2>{action}</div>
)
const Chips = ({ items, value, onChange, label = x => x }: { items: string[]; value: string; onChange: (v: string) => void; label?: (x: string) => string }) => (
  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
    {items.map(x => <button key={x} onClick={() => onChange(x)} className={`shrink-0 px-3.5 h-8 rounded-full text-[14.5px] transition ${value === x ? 'bg-olive-700 text-white' : 'bg-white text-ink'}`}>{label(x)}</button>)}
  </div>
)
const Btn = ({ children, onClick, ghost, disabled }: { children: ReactNode; onClick?: () => void; ghost?: boolean; disabled?: boolean }) =>
  <button disabled={disabled} onClick={onClick} className={`w-full h-12 rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-60 ${ghost ? 'bg-white text-ink' : 'bg-olive-700 text-white'}`}>{children}</button>
const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="h-11 rounded-2xl bg-white px-3.5 flex items-center gap-2"><Search size={18} className="text-mute" />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent outline-none text-[17px] placeholder:text-mute" /></div>
)
const Empty = ({ children }: { children: ReactNode }) => <p className="px-4 py-4 text-[15.5px] text-mute">{children}</p>

const live = (ns: News[]) => ns.filter(n => new Date(n.publishAt).getTime() <= Date.now())

/* ---------- Shell ---------- */
function Shell({ onLogout, onSwitch }: { onLogout: () => void; onSwitch?: () => void }) {
  const { t, read, news: allNews, loading, reload } = useApp()
  const news = live(allNews)
  const [tab, setTab] = useState<Tab>('home')
  const [stack, setStack] = useState<Sub[]>([])
  const sub = stack[stack.length - 1] ?? null
  const scroller = useRef<HTMLDivElement>(null)
  const top = () => requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0 }))
  // Jeder Unterbildschirm ist ein Eintrag im Browser-Verlauf: so führt die Zurück-Geste (Android) eine Ebene zurück
  const open = (s: Sub) => { setStack(st => [...st, s]); history.pushState({ th: 1 }, ''); top() }
  const back = () => history.back()
  const go = (x: Tab) => { const n = stack.length; setStack([]); setTab(x); top(); if (n) history.go(-n) }
  useEffect(() => { const onPop = () => { setStack(st => st.slice(0, -1)); top() }; window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const mustOpen = news.filter(n => n.mustRead && !read.has(n.id)).length
  // Tipp auf eine Mitteilung: ?open=news:<id> | ticket:<id> | events | tickets. Unbekannte News: erst neu laden.
  const newsRef = useRef(allNews); newsRef.current = allNews
  const [pendingNews, setPendingNews] = useState<string | null>(null)
  useEffect(() => { if (!pendingNews) return; const n = allNews.find(x => x.id === pendingNews); if (n) { setPendingNews(null); open({ k: 'news', item: n }) } }, [allNews, pendingNews]) // eslint-disable-line react-hooks/exhaustive-deps
  const openUrl = (u: string) => {
    const o = new URL(u, location.origin).searchParams.get('open') ?? ''
    if (o.startsWith('news:')) { const n = newsRef.current.find(x => x.id === o.slice(5)); if (n) open({ k: 'news', item: n }); else { setPendingNews(o.slice(5)); reload() } }
    else if (o.startsWith('ticket:')) { reload(); open({ k: 'ticket', id: o.slice(7) }) }
    else if (o.startsWith('events')) open({ k: 'events' }); else if (o === 'tickets') open({ k: 'tickets' })
    else if (o === 'todos') { tasksView = 'me'; reloadTodos(); go('tasks') }
    else if (o === 'standby') { reloadStandby(); go('home') }
    else if (o === 'tasks') { tasksView = 'studio'; go('tasks') }
    else if (o === 'perf') open({ k: 'perf' })
    // Direktlinks aus Unterlagen und Schulungen
    else if (o === 'home' || o === 'ai' || o === 'wiki' || o === 'menu') go(o)
    else if (o === 'benni') go('ai')
    else if (o === 'onboarding' || o === 'book' || o === 'me' || o === 'team' || o === 'install' || o === 'news-list' || o === 'conn' || o === 'time') open({ k: o })
    else if (o === 'clients') open({ k: 'clients' })
  }
  // „Mit Benni lernen“ aus dem Onboarding: in den Benni-Reiter wechseln, die Frage stellt der Reiter selbst
  useEffect(() => { const f = () => go('ai'); window.addEventListener('th-benni', f); return () => window.removeEventListener('th-benni', f) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    reportDevice()
    if (location.search.includes('open=') && !loading) { openUrl(location.href); history.replaceState(null, '', '/') }
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'open') openUrl(e.data.url) }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  let screen: ReactNode
  switch (sub?.k) {
    case 'news-list': screen = <NewsList open={open} />; break
    case 'news': screen = <NewsDetail n={sub.item} />; break
    case 'wiki': screen = <WikiDetail a={sub.item} />; break
    case 'wiki-cat': screen = <WikiCategory k={sub.key} name={sub.name} open={open} />; break
    case 'onboarding': screen = <Onboarding open={open} />; break
    case 'team': screen = <Team open={open} />; break
    case 'profile': screen = <Profile s={sub.item} />; break
    case 'me': screen = <MyProfile />; break
    case 'tickets': screen = <Tickets open={open} />; break
    case 'ticket': screen = <TicketDetail id={sub.id} />; break
    case 'clients': screen = <ClientHistoryView cid={sub.cid} />; break
    case 'events': screen = <Events />; break
    case 'conn': screen = <Connections />; break
    case 'book': screen = <div className="px-5 pb-4 h-[calc(100dvh-150px)] md:h-[calc(100dvh-110px)]"><h1 className="text-[26px] font-medium tracking-tight mb-3">{t('Kundentermine')}</h1><Terminbuch compact /></div>; break
    case 'inbox': screen = <ExternalTool kind="mail" />; break
    case 'time': screen = <ExternalTool kind="timebutler" />; break
    case 'install': screen = <Install />; break
    case 'perf': screen = <MyPerformance />; break
    default:
      screen = tab === 'home' ? <Today open={open} go={go} /> : tab === 'tasks' ? <Tasks open={open} /> : tab === 'ai' ? <AI open={open} />
        : tab === 'wiki' ? <Wiki open={open} /> : <MenuView open={open} onLogout={onLogout} />
  }
  const key = (sub ? sub.k + ('item' in sub ? String((sub.item as { id?: string }).id) : '') : tab) + stack.length
  const nav: [Tab, string, typeof Home][] = [['home', 'Heute', Home], ['tasks', 'Aufgaben', ListChecks], ['ai', 'Benni', Sparkles], ['wiki', 'Wissen', BookOpen], ['menu', 'Menü', LayoutGrid]]
  return (
    <div className="flex-1 min-h-0 flex">
      {/* Desktop: Navigation als Seitenleiste wie im Backoffice, zuklappbar */}
      <div className="hidden md:flex">
        <SideNav
          items={nav.map(([x, label, Icon]) => ({ key: x, label: x === 'ai' ? label : t(label), active: tab === x && !sub, dot: x === 'home' && mustOpen > 0, onClick: () => go(x),
            icon: x === 'ai' ? <BMark className="w-[18px] h-[18px]" /> : <Icon size={18} strokeWidth={1.6} /> }))}
          extra={onSwitch ? [{ key: 'switch', label: t('Büro-Backoffice'), icon: <Monitor size={18} strokeWidth={1.6} />, onClick: onSwitch }] : []}
          onProfile={() => open({ k: 'me' })} profileActive={sub?.k === 'me'} onLogout={onLogout} />
      </div>
      <div className="relative flex-1 min-w-0 flex flex-col">
        {/* Benni füllt die ganze Fläche und scrollt selbst (Chatliste links, Eingabe unten) */}
        <div ref={scroller} className={`flex-1 no-scrollbar bg-sage-50 ${tab === 'ai' && !sub && !loading ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {tab === 'ai' && !sub && !loading ? screen : (
          <div className="w-full md:mx-auto md:max-w-[760px]">
            <div className="h-11 md:h-8" />
            {sub && <div className="px-3 pb-1 flex items-center justify-between">
              <button onClick={back} className="h-11 px-1 flex items-center gap-0.5 text-sage-800 text-[17px]"><ChevronLeft size={22} />{t('Zurück')}</button>
              {/* Schnell zurück zur Startseite (Renée 20.10.) */}
              <button onClick={() => go('home')} aria-label={t('Zur Startseite')} className="w-11 h-11 rounded-full bg-white text-olive-800 flex items-center justify-center"><Home size={20} /></button>
            </div>}
            {loading ? <p className="px-5 pt-10 text-mute">{t('Lädt …')}</p> :
              <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                {screen}
              </motion.div>}
          </div>)}
        </div>
        <nav className="md:hidden shrink-0 bg-white border-t border-line px-3 pb-7 pt-2 grid grid-cols-5 items-end">
          {nav.map(([x, label, Icon]) => {
            const on = tab === x && !sub
            if (x === 'ai') return (
              <button key={x} onClick={() => go(x)} className={`flex flex-col items-center gap-1 py-0.5 text-[12px] ${on ? 'text-olive-800' : 'text-mute'}`}>
                <BMark className="w-8 h-8" />{label}
              </button>
            )
            return (
              <button key={x} onClick={() => go(x)} className={`relative flex flex-col items-center gap-1 py-1 text-[12px] ${on ? 'text-olive-800' : 'text-mute'}`}>
                <Icon size={22} strokeWidth={on ? 2.2 : 1.7} />{t(label)}
                {x === 'home' && mustOpen > 0 && <span className="absolute top-0.5 right-[28%] w-2 h-2 rounded-full bg-brass" />}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

/* ---------- Aushilfe gesucht (auf Heute) ---------- */
function StandbyAsk() {
  const { me, standby, branches, t } = useApp()
  const { requests, responses } = useStandbyRequests()
  const [busy, setBusy] = useState<string | null>(null)
  const today = isoDay()
  const myDays = new Set(standby.filter(x => x.employee_id === me.id).map(x => x.day))
  const mine = (id: string) => responses.find(r => r.request_id === id && r.employee_id === me.id)?.answer
  const list = requests.filter(r => r.day >= today && r.created_by !== me.id && (r.filled_by === me.id
    || (r.status === 'offen' && (r.to_all || myDays.has(r.day)) && (!r.skill || me.skills.includes(r.skill)) && mine(r.id) !== 'nein')))
  if (!list.length) return null
  const when = (d: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00Z'))
  const say = async (id: string, a: 'ja' | 'nein' | null) => { setBusy(id); const ok = await answerStandby(id, me.id, a); setBusy(null); if (!ok) toast(t('Das hat nicht geklappt'), 'error'); else if (a === 'ja') toast(t('Danke, deine Zusage ist angekommen')) }
  return (<>
    <h2 className="mt-8 mb-2.5 px-1 rubric text-brass">{t(list.every(r => r.filled_by === me.id) ? 'Aushilfe' : 'Aushilfe gesucht')}</h2>
    <div className="space-y-2.5">{list.map(r => { const studio = branches.find(b => b.id === r.branch_id)?.name ?? '', a = mine(r.id)
      const detail = [when(r.day), timeSpan(r), r.skill].filter(Boolean).join(' · ')
      if (r.filled_by === me.id) return <div key={r.id} className="rounded-[16px] bg-olive-800 text-white p-4"><p className="text-[14.5px] text-sage-200">{t('Du hilfst aus')}</p><p className="mt-0.5 text-[17.5px] font-medium">{studio}</p><p className="text-[15.5px] text-sage-200 mt-0.5">{detail}</p>{r.note && <p className="text-[15.5px] mt-2">{r.note}</p>}</div>
      return <div key={r.id} className="rounded-[16px] bg-white p-4">
        <p className="text-[17.5px] font-medium">{t('{studio} sucht Aushilfe', { studio })}</p>
        <p className="text-[15.5px] text-mute mt-0.5">{detail}</p>
        {r.note && <p className="text-[15.5px] mt-2">{r.note}</p>}
        {a === 'ja' ? <p className="mt-3 text-[15px] text-ink/80 flex items-center gap-2"><Check size={15} className="text-ok" />{t('Du hast zugesagt. {name} teilt ein.', { name: r.created_by_name || t('Die Filialleitung') })} <button disabled={busy === r.id} onClick={() => say(r.id, null)} className="text-mute underline underline-offset-2">{t('Doch nicht')}</button></p>
          : <div className="mt-3 grid grid-cols-2 gap-2"><button disabled={busy === r.id} onClick={() => say(r.id, 'ja')} className="h-11 rounded-[12px] bg-olive-700 text-white text-[17px] disabled:opacity-50">{t('Ich kann')}</button><button disabled={busy === r.id} onClick={() => say(r.id, 'nein')} className="h-11 rounded-[12px] bg-sage-50 text-[17px] disabled:opacity-50">{t('Leider nicht')}</button></div>}
      </div> })}</div>
  </>)
}

/* ---------- Heute ---------- */
function useMyDay() {
  const [day, setDay] = useState<MyDay | null>(null)
  useEffect(() => { phorest<MyDay>({ action: 'my_day' }).then(setDay) }, [])
  return day
}
function Today({ open, go }: { open: (s: Sub) => void; go: (t: Tab) => void }) {
  const { me, t, done, read, tasks, news: allNews, quizzes, branches, photo } = useApp()
  const news = live(allNews)
  const day = useMyDay()
  const [team, setTeam] = useState<TeamToday | null>(null)
  const isLead = me.app_role === 'filialleitung'
  const due = useDue()
  const myTodos = useTodos().filter(x => isForMe(x, me) && !x.done_at)
  useEffect(() => { if (isLead) phorest<TeamToday>({ action: 'team_today', branch: me.branch_id }).then(setTeam) }, [isLead, me.branch_id])
  const doneN = tasks.filter(x => done.has(x.id)).length
  const next = tasks.find(x => !done.has(x.id))
  const must = news.filter(n => n.mustRead && !read.has(n.id))
  const shift = day?.shifts?.[0]
  const shiftText = day?.shifts?.length ? day.shifts.map(s => `${s.start} – ${s.end}`).join(' · ') : ''
  const shiftStudio = [...new Set((day?.shifts ?? []).map(s => branches.find(b => b.id === s.branch_id)?.name ?? me.branch))].join(', ') || me.branch
  const dateLabel = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const hour = zurichHour()
  const hello = hour < 11 ? t('Guten Morgen') : hour < 17 ? t('Hallo') : t('Guten Abend')
  // Nächster Termin: der erste, der noch nicht vorbei ist
  const nowMin = Math.round(hour * 60)
  const mins = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5))
  const appts = day?.appointments ?? []
  const upNext = appts.find(a => mins(a.end || a.start) > nowMin)
  const later = appts.filter(a => a !== upNext && mins(a.start) >= (upNext ? mins(upNext.start) : 0))
  const inMin = upNext ? mins(upNext.start) - nowMin : 0
  const tile = (tone: Tone, big: string, label: string, onClick: () => void) =>
    <button onClick={onClick} className={`rounded-[18px] p-3 text-left flex flex-col gap-1 min-h-[84px] ${TONE[tone].bg} ${TONE[tone].fg}`}><span className="font-display text-[26px] leading-none">{big}</span><span className="text-[14.5px] font-semibold leading-tight">{label}</span></button>
  return (
    <div className="px-4 pb-10">
      <div className="relative h-[204px] rounded-[24px] overflow-hidden bg-olive-800">
        <img src="/hero-empfang.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/10 via-ink/20 to-ink/80" />
        <button onClick={() => open({ k: 'me' })} aria-label={t('Mein Profil')} className="md:hidden absolute top-3 right-3 rounded-full ring-2 ring-white/70"><Avatar s={me} photo={photo} size="w-10 h-10 text-[14px]" /></button>
        <div className="absolute left-4 right-4 bottom-4 text-white">
          <p className="text-[15px] text-white/85">{dateLabel} · {shiftStudio}</p>
          <h1 className="text-[30px] leading-tight mt-0.5">{hello}, {me.first}</h1>
          <p className="text-[16px] mt-0.5">{!day ? '…' : shift ? shiftText : day.mapped ? t('Heute frei') : ''}{day?.appointments?.length ? ` · ${day.appointments.length} ${t('Termine')}` : ''}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {tile('done', `${doneN}/${tasks.length}`, t('Checkliste'), () => { tasksView = 'studio'; go('tasks') })}
        {tile(must.length ? 'duty' : 'done', String(must.length), must.length === 1 ? t('Pflicht offen') : t('Pflicht offen'), () => must[0] ? open({ k: 'news', item: must[0] }) : open({ k: 'news-list' }))}
        {tile('note', String(myTodos.length), t('Für dich'), () => { tasksView = 'me'; go('tasks') })}
      </div>

      <ReadyCard open={open} />
      <StandbyAsk />

      {day?.ok && day.mapped && upNext && <div className="mt-3 rounded-[22px] bg-white p-4">
        <div className="flex items-center justify-between"><h2 className="rubric text-ink/70">{t('Gleich dran')}</h2>
          {inMin > 0 && inMin < 240 && <span className={`px-2.5 py-1 rounded-full text-[14px] font-semibold ${TONE.note.bg} ${TONE.note.fg}`}>{t('in {n} Min.', { n: inMin })}</span>}</div>
        <div className="mt-2.5 flex gap-3.5 items-stretch">
          <span className="w-1.5 rounded-full" style={{ background: colorFor(upNext.service) }} />
          <div className="flex-1 min-w-0"><p className="font-display text-[24px] leading-tight">{upNext.start} · {upNext.client}</p><p className="text-[16px] text-ink/70 mt-0.5">{upNext.service}</p></div>
        </div>
        {later.length > 0 && <div className="mt-3 pt-2 border-t border-line divide-y divide-line">{later.slice(0, 4).map((a, i) => (
          <div key={i} className="flex gap-3 py-2 items-center"><span className="w-1 self-stretch rounded-full" style={{ background: colorFor(a.service) }} /><span className="w-12 font-display text-[16px]">{a.start}</span><span className="flex-1 min-w-0 truncate text-[16px]">{a.client} <span className="text-mute">· {a.service}</span></span></div>))}</div>}
        <button onClick={() => open({ k: 'book' })} className="mt-2 text-[15px] font-semibold text-olive-800">{t('Alle Kundentermine')}</button>
      </div>}
      {day?.ok && day.mapped && appts.length > 0 && !upNext && <Card className="mt-3 p-4"><p className="text-[16px]">{t('Alle Termine für heute sind vorbei.')}</p></Card>}
      {day && !day.ok && <Card className="mt-3"><Empty>{t('Phorest ist gerade nicht erreichbar. Bitte später noch einmal öffnen.')}</Empty></Card>}
      {day?.ok && !day.mapped && <Card className="mt-3"><Empty>{t('Du bist noch keiner Phorest-Spalte zugeordnet. Das Büro prüft deine Firmen-Mail in Phorest.')}</Empty></Card>}

      <div className="mt-3 rounded-[22px] bg-white p-4 flex gap-3 items-start">
        <BMark className="w-12 h-12" />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold">{ASSISTANT}</p>
          <p className="text-[16px] leading-snug mt-0.5">{upNext ? t('Soll ich dir sagen, was {name} meistens bucht und was du zusätzlich anbieten kannst?', { name: upNext.client }) : t('Frag mich zu Kundinnen, Abläufen oder Phorest.')}</p>
          <button onClick={() => openNewBenniChat(upNext ? t('Was bucht {name} meistens, und was kann ich ihr heute zusätzlich anbieten?', { name: upNext.client }) : undefined)} className="mt-2 text-[15px] font-semibold text-olive-800">{upNext ? t('Ja, zeig mir das') : t('Benni fragen')}</button>
        </div>
      </div>

      {must.length > 0 && <>
        <Label action={<span className="text-[13px] text-mute tabular-nums">{t('{n} offen', { n: must.length })}</span>}>{t('Bitte lesen')}</Label>
        <div className="space-y-2.5">{must.map(n => (
          <button key={n.id} onClick={() => open({ k: 'news', item: n })} className="w-full text-left rounded-[18px] bg-white p-3.5 flex items-center gap-3">
            {n.image ? <img src={n.image} alt="" className="w-14 h-14 rounded-[14px] object-cover shrink-0" /> : <span className={`w-14 h-14 rounded-[14px] shrink-0 flex items-center justify-center ${TONE.duty.bg} ${TONE.duty.fg}`}><BookOpen size={22} /></span>}
            <span className="flex-1 min-w-0"><span className={`inline-block px-2 py-0.5 rounded-full text-[13px] font-semibold ${TONE.duty.bg} ${TONE.duty.fg}`}>{t('Pflicht')}</span><span className="block text-[17px] font-semibold leading-snug mt-1">{n.title}</span><span className="block text-[14.5px] text-mute">{quizzes.some(q => q.newsId === n.id) ? t('Lesen, bestätigen und kurzes Quiz') : t('Lesen und bestätigen')}</span></span>
          </button>))}</div>
      </>}

      {myTodos.length > 0 && <>
        <Label action={<button onClick={() => { tasksView = 'me'; go('tasks') }} className="text-[14.5px] text-sage-800">{t('Alle')}</button>}>{t('Für dich')}</Label>
        <List>{myTodos.slice(0, 3).map(x => (
          <button key={x.id} onClick={() => { tasksView = 'me'; go('tasks') }} className="w-full text-left px-4 py-3.5 flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isLate(x) ? 'bg-duty' : 'bg-note'}`} />
            <span className="flex-1 min-w-0"><span className="block text-[17px] truncate">{x.title}</span><span className={`block text-[14px] mt-0.5 ${isLate(x) ? 'text-duty' : 'text-mute'}`}>{x.due_at ? t('bis {when}', { when: due(x.due_at) }) : t('ohne Frist')}{x.created_by !== me.id && x.created_by_name ? ` · ${t('von {name}', { name: x.created_by_name })}` : ''}</span></span>
            <ChevronRight size={18} className="text-sage-400 shrink-0" />
          </button>))}</List>
      </>}

      {next && <>
        <Label action={<button onClick={() => { tasksView = 'studio'; go('tasks') }} className="text-[14.5px] text-sage-800">{t('Alle')}</button>}>{t('Studio-Checkliste')}</Label>
        <Card onClick={() => { tasksView = 'studio'; go('tasks') }} className="p-4">
          <div className="h-2 rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-done rounded-full transition-all" style={{ width: (tasks.length ? doneN / tasks.length * 100 : 0) + '%' }} /></div>
          <p className="mt-3 text-[16px]">{t('Als Nächstes:')} <span className="font-semibold">{next.title}</span>{next.time && <span className="text-mute"> · {next.time}</span>}</p>
        </Card>
      </>}

      {isLead && <>
        <Label>{t('Heute im Studio')} · {me.branch}</Label>
        <List>
          {!team && <Empty>{t('Lädt …')}</Empty>}
          {team && !team.ok && <Empty>{t('Phorest ist gerade nicht erreichbar.')}</Empty>}
          {team?.team?.map(p => <Row key={p.name + p.start} title={p.name} sub={t('{start}–{end} · {n} Termine', { start: p.start, end: p.end, n: p.appointments })} right={<span />} />)}
        </List>
      </>}

      {news.filter(n => !n.mustRead).length > 0 && <>
        <Label action={<button onClick={() => open({ k: 'news-list' })} className="text-[14.5px] text-sage-800">{t('Alle')}</button>}>{t('News')}</Label>
        <div className="space-y-2.5">{news.filter(n => !n.mustRead).slice(0, 2).map(n => <NewsCard key={n.id} n={n} onClick={() => open({ k: 'news', item: n })} small />)}</div>
      </>}
    </div>
  )
}

/* ---------- News ---------- */
/** News als Karte: Foto oben mit Farb-Etikett, sonst Farbfläche (Richtung B). */
function NewsCard({ n, onClick, small }: { n: News; onClick: () => void; small?: boolean }) {
  const { read, t } = useApp()
  const tone = TONE[toneOf(n.tag, n.mustRead)]
  const tag = n.mustRead ? t('Pflicht') : t(n.tag)
  return (
    <button onClick={onClick} className="w-full text-left rounded-[22px] bg-white overflow-hidden">
      {n.image && !small ? <div className="relative h-[150px]"><img src={n.image} alt="" className="w-full h-full object-cover" />
        <span className={`absolute left-3 top-3 px-2.5 py-1 rounded-full text-[13px] font-semibold text-white ${tone.solid}`}>{tag}</span></div> : null}
      <div className={`p-4 ${small ? 'flex gap-3.5 items-center' : ''}`}>
        {small && (n.image ? <img src={n.image} alt="" className="w-16 h-16 rounded-[14px] object-cover shrink-0" /> : <span className={`w-16 h-16 rounded-[14px] shrink-0 flex items-center justify-center ${tone.bg} ${tone.fg}`}><Newspaper size={24} /></span>)}
        <div className="flex-1 min-w-0">
          {(!n.image || small) && <span className={`inline-block px-2.5 py-0.5 rounded-full text-[13px] font-semibold ${tone.bg} ${tone.fg}`}>{tag}</span>}
          <p className={`${small ? 'text-[17px] font-semibold mt-1' : 'font-display text-[21px] mt-1.5'} leading-snug`}>{n.title}</p>
          {!small && n.teaser && <p className="mt-1 text-[15.5px] text-ink/70 leading-snug">{n.teaser}</p>}
          <p className="mt-1.5 text-[14px] text-mute flex items-center gap-1.5">{n.audience} · {n.date}
            {n.mustRead && (read.has(n.id) ? <span className="ml-auto flex items-center gap-1 text-done font-semibold"><Check size={14} />{t('bestätigt')}</span> : <span className="ml-auto text-duty font-semibold">{t('Noch offen')}</span>)}</p>
        </div>
      </div>
    </button>
  )
}
function NewsList({ open }: { open: (s: Sub) => void }) {
  const { t, news: allNews } = useApp()
  const news = live(allNews)
  const [f, setF] = useState('Alle')
  const tags = ['Alle', ...new Set(news.map(n => n.tag))]
  const shown = news.filter(n => f === 'Alle' || n.tag === f)
  return (
    <div className="pb-10"><Title>{t('News')}</Title>
      <div className="px-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          {tags.map(x => { const tone = TONE[toneOf(x)]
            return <button key={x} onClick={() => setF(x)} className={`shrink-0 px-4 h-10 rounded-full text-[15px] font-medium transition ${f === x ? 'bg-olive-800 text-white' : x === 'Alle' ? 'bg-white text-ink' : `${tone.bg} ${tone.fg}`}`}>{x === 'Alle' ? t('Alle') : t(x)}</button> })}
        </div>
        <div className="mt-4 space-y-3">{shown.map(n => <NewsCard key={n.id} n={n} onClick={() => open({ k: 'news', item: n })} />)}</div>
      </div>
    </div>
  )
}
function NewsDetail({ n }: { n: News }) {
  const { read, confirm, openNews, quizzes, polls, t } = useApp()
  const quiz = quizzes.find(q => q.newsId === n.id), poll = polls.find(p => p.newsId === n.id)
  const [orig, setOrig] = useState(false)
  const v = orig && n.orig ? n.orig : n
  const [busy, setBusy] = useState(false)
  // „Gelesen & verstanden“ geht erst, nachdem die News geöffnet wurde — das Öffnen wird hier gespeichert.
  useEffect(() => { openNews(n.id) }, [n.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <article className="px-5 pb-10">
      <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${TONE[toneOf(n.tag, n.mustRead)].bg} ${TONE[toneOf(n.tag, n.mustRead)].fg}`}>{n.mustRead ? t('Pflicht') : t(n.tag)}</span><span className="text-[14px] text-mute">{n.audience} · {n.date}</span></div>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight leading-tight">{v.title}</h1>
      <p className="mt-2 text-[14.5px] text-mute">{t('von {name}', { name: n.author })}{n.orig && <> · <button onClick={() => setOrig(!orig)} className="text-olive-700">{orig ? t('Übersetzung anzeigen') : t('Automatisch übersetzt · Original')}</button></>}</p>
      {n.image && <img src={n.image} alt="" className="mt-5 w-full aspect-[3/2] object-cover rounded-[16px] bg-sage-100" />}
      <div className="mt-5 space-y-4 text-[17.5px] leading-relaxed">{v.body.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>
      {n.wikiCategory && <p className="mt-4 text-[14.5px] text-sage-800 flex items-center gap-1"><BookOpen size={14} />{t('Auch im Wissen unter {cat} abgelegt', { cat: n.wikiCategory })}</p>}
      {poll && <PollForm poll={poll} />}
      {n.mustRead && read.has(n.id) && <div className="mt-8 h-12 rounded-[10px] bg-sage-100 text-olive-800 flex items-center justify-center gap-2 font-medium"><Check size={18} />{t('Gelesen und bestätigt')}</div>}
      {n.mustRead && !read.has(n.id) && !quiz && <div className="mt-8"><Btn disabled={busy} onClick={async () => { setBusy(true); await confirm(n.id); setBusy(false) }}>{t('Gelesen und verstanden')}</Btn></div>}
      {quiz && <QuizRunner quiz={quiz} />}
    </article>
  )
}

/* ---------- Aufgaben ---------- */
// Push „neue Aufgabe für dich“ oder Tipp auf „Für dich“: Aufgaben direkt bei „Für mich“ öffnen
let tasksView: 'me' | 'studio' | null = null
function Tasks({ open }: { open: (s: Sub) => void }) {
  const { me, done, toggle, t, tasks, templates, wiki } = useApp()
  const todos = useTodos()
  const openMine = todos.filter(x => isForMe(x, me) && !x.done_at)
  const [view, setView] = useState<'me' | 'studio'>(() => tasksView ?? (openMine.length ? 'me' : 'studio'))
  useEffect(() => { tasksView = null }, [])
  const [photoFor, setPhotoFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const run = async (id: string, f?: File) => { setBusy(id); await toggle(id, f); setBusy(null) }
  // Listen = Vorlagen vom Büro, die heute für dieses Studio gelten; je Liste: wann sie gilt und Zeitfenster
  const groups = [...new Set(tasks.map(x => x.group))].map(g => {
    const items = tasks.filter(x => x.group === g)
    const tpl = templates.find(tp => tp.items.some(i => i.id === items[0]?.id))
    const times = items.map(i => i.time).filter(Boolean).sort()
    const when = !tpl ? '' : tpl.repeat === 'daily' ? t('Jeden Tag')
      : tpl.repeat === 'weekly' ? t('Jeden {day}', { day: new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, tpl.weekday ?? 1))) })
      : t('Am {n}. jedes Monats', { n: tpl.monthday ?? 1 })
    // Frist der Liste = spätester Punkt
    const span = times.length ? t('bis {time}', { time: times[times.length - 1] }) : ''
    return { g, items, sub: [when, span].filter(Boolean).join(' · ') }
  })
  const total = tasks.length, n = tasks.filter(x => done.has(x.id)).length
  const next = tasks.find(x => !done.has(x.id))
  const nowHM = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date())
  return (
    <div className="pb-10"><Title sub={t('Studio {name} · heute', { name: me.branch })}>{t('Aufgaben')}</Title>
      <div className="px-5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-[14px] bg-white">
          {([['me', t('Für mich'), openMine.length ? String(openMine.length) : ''], ['studio', t('Studio-Checklisten'), total ? `${n}/${total}` : '']] as const).map(([k, l, c]) => (
            <button key={k} onClick={() => setView(k)} className={`h-10 rounded-[10px] text-[15.5px] flex items-center justify-center gap-1.5 transition ${view === k ? 'bg-olive-700 text-white' : 'text-ink/70'}`}>{l}{c && <span className={`text-[13px] tabular-nums ${view === k ? 'text-white/75' : 'text-mute'}`}>{c}</span>}</button>))}
        </div>
        <p className="mt-3 mb-5 px-1 text-[14.5px] text-mute leading-relaxed">{view === 'me' ? t('Einzelne Aufgaben mit Frist: von deiner Filialleitung oder dem Büro, und deine eigenen To-dos.') : t('Feste Abläufe deines Studios, jeden Tag neu. Wer etwas erledigt, hakt es für alle ab, mit Name und Uhrzeit.')}</p>
        {view === 'me' ? <MyTodos /> : <>
        {total === 0 ? <Card className="p-4 text-[15.5px] text-mute">{t('Für dein Studio sind heute keine Aufgaben hinterlegt.')}</Card> : (
          <Card className="p-4">
            <div className="flex items-baseline justify-between"><p className="font-display text-[26px] leading-none">{n} <span className="text-mute text-[17.5px]">/ {total}</span></p><p className="text-[14.5px] text-mute">{n === total ? t('Alles erledigt') : t('{n} offen', { n: total - n })}</p></div>
            <div className="mt-3 h-[4px] rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-olive-700 rounded-full transition-all" style={{ width: (total ? n / total * 100 : 0) + '%' }} /></div>
            {next && <p className="mt-3 text-[14.5px] text-mute">{t('Als Nächstes:')} <span className="text-ink">{next.title}</span>{next.time && ` · ${next.time}`}</p>}
          </Card>
        )}
        {groups.map(({ g, items, sub }) => {
          const k = items.filter(x => done.has(x.id)).length
          return (
            <div key={g}>
              <div className="mt-8 mb-2.5 px-1 flex items-end justify-between gap-3">
                <div className="min-w-0"><h2 className="rubric text-ink/70">{g}</h2>{sub && <p className="text-[13px] text-mute mt-1">{sub}</p>}</div>
                <span className={`text-[13px] tabular-nums shrink-0 ${k === items.length ? 'text-ok' : 'text-mute'}`}>{k === items.length ? <span className="inline-flex items-center gap-1"><Check size={13} strokeWidth={2.6} />{t('fertig')}</span> : `${k} / ${items.length}`}</span>
              </div>
              <List>{items.map(x => {
                const d = done.get(x.id), late = !d && x.time && x.time < nowHM, locked = !!d && !!d.byId && d.byId !== me.id
                const doIt = () => { if (locked) return; if (x.proof && !d) setPhotoFor(x.id); else run(x.id) }
                return (
                  <div key={x.id} className="flex items-center gap-3 px-4 py-3.5">
                    <button aria-label={d ? t('Rückgängig') : t('Erledigt')} title={locked ? t('Nur {name} kann das rückgängig machen', { name: d!.by }) : undefined} disabled={busy === x.id || locked} onClick={doIt} className={`w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 transition ${d ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92] hover:shadow-[inset_0_0_0_1.5px_#495940]'} ${busy === x.id ? 'opacity-50' : ''}`}>{d && <Check size={15} strokeWidth={3} />}</button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[17px] leading-snug ${d ? 'text-mute line-through decoration-sage-400' : ''}`}>{x.title}</p>
                      <p className="text-[13px] text-mute mt-0.5 flex flex-wrap items-center gap-x-2">
                        {d ? <span>{t('Erledigt von {name} · {time}', { name: d.by, time: d.at })}</span> : x.time && <span className={late ? 'text-alert' : ''}>{late ? t('fällig seit {time}', { time: x.time }) : t('bis {time}', { time: x.time })}</span>}
                        {x.prio && !d && <span className="text-brass">{t('Wichtig')}</span>}
                        {x.proof && <span className="inline-flex items-center gap-1"><Camera size={12} />{t('mit Foto')}</span>}
                      </p>
                    </div>
                    {x.articleId && wiki.find(w => w.id === x.articleId) && <button onClick={() => open({ k: 'wiki', item: wiki.find(w => w.id === x.articleId)! })} className="w-8 h-8 rounded-lg text-sage-800 hover:bg-sage-50 flex items-center justify-center shrink-0" title={t('Anleitung im Wissen')}><BookOpen size={16} /></button>}
                    {!d && <button disabled={busy === x.id} onClick={doIt} className="h-8 px-3 rounded-full bg-olive-700/10 text-olive-800 text-[14.5px] font-medium flex items-center gap-1.5 shrink-0 hover:bg-olive-700/15 disabled:opacity-50">{x.proof ? <Camera size={14} /> : <Check size={14} strokeWidth={2.6} />}{t('Erledigt')}</button>}
                  </div>
                )
              })}</List>
            </div>
          )
        })}
        {total > 0 && <p className="mt-6 px-1 text-[13px] text-mute leading-relaxed">{t('Die Listen und wann sie gelten legt das Büro im Backoffice unter Aufgaben fest.')}</p>}
        </>}
      </div>
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => { const f = e.target.files?.[0]; const id = photoFor; e.target.value = ''; if (f && id) { setPhotoFor(null); await run(id, f) } }} />
      {photoFor && <Sheet onClose={() => setPhotoFor(null)}>
        <p className="font-medium text-[17px]">{t('Foto als Nachweis')}</p>
        <p className="mt-1 text-[15.5px] text-mute">{t('Das Foto wird mit deinem Namen und der Uhrzeit gespeichert.')}</p>
        <div className="mt-4"><Btn onClick={() => file.current?.click()}><Camera size={18} />{t('Foto aufnehmen und abhaken')}</Btn></div>
      </Sheet>}
    </div>
  )
}

function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-end md:items-center md:justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30" />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative w-full md:max-w-[480px] bg-paper rounded-t-[28px] md:rounded-[20px] p-6 pb-10 md:pb-6" onClick={e => e.stopPropagation()}>{children}</motion.div>
    </div>
  )
}

/* ---------- KI ---------- */
function AI({ open }: { open: (s: Sub) => void }) {
  const { wiki } = useApp()
  return <BenniChat variant="app" onOpenArticle={id => { const a = wiki.find(x => x.id === id); if (a) open({ k: 'wiki', item: a }) }} onOpenClient={cid => open({ k: 'clients', cid })} />
}
/* ---------- Wissen ---------- */
// Jede Kategorie bekommt ein Emoji statt eines Fotos: einheitlich, ruhig, auch ohne Bilder im Artikel (Standard in lib/wiki, Büro kann es ändern)
const catName = (name: string) => name.slice(0, 1).toUpperCase() + name.slice(1)
const articleIcon = (a: WikiArticle) => a.mediaKind === 'video' || a.mediaKind === 'youtube' ? <Video size={17} /> : a.fromNews ? <Newspaper size={17} /> : <BookOpen size={17} />

// Beliebteste Artikel (Öffnungen der letzten 30 Tage, Tabelle wiki_views)
function usePopular() {
  const [pop, setPop] = useState<Map<string, number>>(new Map())
  useEffect(() => { supabase?.rpc('popular_articles', { p_days: 30 }).then(({ data }) => setPop(new Map(((data ?? []) as { article_id: string; views: number }[]).map(r => [r.article_id, Number(r.views)])))) }, [])
  return pop
}
function Wiki({ open }: { open: (s: Sub) => void }) {
  const { t, wiki: allWiki, steps, obDone, catEmojis } = useApp()
  const wiki = allWiki.filter(a => a.published)
  const pop = usePopular()
  const [q, setQ] = useState(''), [all, setAll] = useState(false)
  const cats = [...wiki.reduce((m, a) => { const c = m.get(a.catKey) ?? { key: a.catKey, name: a.cat, n: 0, views: 0 }; c.n++; c.views += pop.get(a.id) ?? 0; return m.set(a.catKey, c) }, new Map<string, { key: string; name: string; n: number; views: number }>()).values()]
    .sort((x, y) => y.views - x.views || y.n - x.n || x.name.localeCompare(y.name))
  const ranked = [...wiki].filter(a => !a.fromNews).sort((x, y) => (pop.get(y.id) ?? 0) - (pop.get(x.id) ?? 0))
  const top = ranked.find(a => (pop.get(a.id) ?? 0) > 0) ?? ranked.find(a => a.mediaKind === 'video' || a.mediaKind === 'youtube') ?? ranked[0]
  const popular = ranked.filter(a => a !== top && (pop.get(a.id) ?? 0) > 0).slice(0, 4)
  const hits = wiki.filter(a => [a.title, a.cat, a.intro, ...a.tags, ...a.body].join(' ').toLowerCase().includes(q.toLowerCase()))
  const shownCats = all ? cats : cats.slice(0, 6)
  return (
    <div className="pb-10"><Title>{t('Wissen')}</Title>
      <div className="px-4">
        <SearchBox value={q} onChange={setQ} placeholder={t('Suchen, z. B. Wachs')} />
        {!q && top && <button onClick={() => open({ k: 'wiki', item: top })} className="mt-4 relative block w-full h-[180px] rounded-[24px] overflow-hidden text-left">
          <img src="/hero-studio.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-b from-ink/0 via-ink/25 to-ink/85" />
          <span className="absolute left-4 right-4 bottom-4 text-white">
            <span className="block rubric text-[#E9CF9F]">{(pop.get(top.id) ?? 0) > 0 ? t('Meistgelesen') : t('Tipp')}</span>
            <span className="block font-display text-[23px] leading-tight mt-1">{top.title}</span>
            <span className="block text-[15px] text-white/85 mt-0.5">{catName(top.cat)} · {t('{n} Min.', { n: top.minutes })}</span>
          </span>
        </button>}
        {!q && steps.length > 0 && <button onClick={() => open({ k: 'onboarding' })} className={`mt-3 w-full rounded-[20px] p-4 flex items-center gap-3 text-left ${TONE.learn.bg}`}>
          <span className="w-12 h-12 rounded-[14px] bg-learn text-white flex items-center justify-center shrink-0"><GraduationCap size={22} /></span>
          <span className="flex-1"><span className={`block text-[17px] font-semibold ${TONE.learn.fg}`}>{t('Onboarding für Neue')}</span><span className="block text-[14.5px] text-ink/70 mt-0.5">{t('{n} Schritte · {d} von {n} erledigt', { n: steps.length, d: steps.filter(s => obDone.has(s.id)).length })}</span></span>
          <ChevronRight size={18} className="text-learn shrink-0" />
        </button>}
        {!q && <>
          <Label>{t('Themen')}</Label>
          <div className="grid grid-cols-3 gap-2.5">{shownCats.map((c, i) => { const tone = TONE[tileTone(c.name, i)]
            return <button key={c.key} onClick={() => open({ k: 'wiki-cat', key: c.key, name: c.name })} className={`text-left rounded-[20px] p-3 min-h-[104px] flex flex-col justify-between active:scale-[.98] transition ${tone.bg}`}>
              <span className="text-[28px] leading-none" aria-hidden="true">{emojiOf(c.key, catEmojis)}</span>
              <span className="min-w-0"><span className={`block text-[15.5px] font-semibold leading-tight truncate ${tone.fg}`}>{catName(c.name)}</span><span className="block text-[13px] text-ink/60 mt-0.5">{c.n}</span></span>
            </button> })}</div>
          {cats.length > 6 && <button onClick={() => setAll(!all)} className="mt-3 w-full h-11 rounded-[14px] bg-white text-[15.5px] font-medium">{all ? t('Weniger Themen') : t('Alle {n} Themen', { n: cats.length })}</button>}
          {popular.length > 0 && <><Label>{t('Beliebt')}</Label>
            <List>{popular.map(a => <Row key={a.id} icon={articleIcon(a)} title={a.title} sub={`${catName(a.cat)} · ${t('{n} Min.', { n: a.minutes })}`} onClick={() => open({ k: 'wiki', item: a })} />)}</List></>}
        </>}
        {q && <><Label>{t('{n} Treffer', { n: hits.length })}</Label>
          {hits.length > 0 && <List>{hits.slice(0, 60).map(a => <Row key={a.id} icon={articleIcon(a)} title={a.title} sub={`${a.cat} · ${t('{n} Min.', { n: a.minutes })}`} onClick={() => open({ k: 'wiki', item: a })} />)}</List>}
          {hits.length === 0 && <p className="text-[15.5px] text-mute">{t('Nichts gefunden. Frag {name} oder schick eine Idee ans Büro.', { name: ASSISTANT })}</p>}
        </>}
      </div>
    </div>
  )
}

function WikiCategory({ k, name, open }: { k: string; name: string; open: (s: Sub) => void }) {
  const { t, wiki, catEmojis } = useApp()
  const pop = usePopular()
  const tone = TONE[toneOf(name)]
  const items = wiki.filter(a => a.published && a.catKey === k).sort((x, y) => (pop.get(y.id) ?? 0) - (pop.get(x.id) ?? 0) || x.title.localeCompare(y.title))
  return (
    <div className="pb-10">
      <div className="px-4">
        <div className={`mt-2 rounded-[22px] p-4 flex items-center gap-4 ${tone.bg}`}>
          <span className="w-14 h-14 rounded-[16px] bg-white/70 flex items-center justify-center text-[30px] shrink-0" aria-hidden="true">{emojiOf(k, catEmojis)}</span>
          <div className="min-w-0"><h1 className={`font-display text-[28px] leading-tight truncate ${tone.fg}`}>{catName(name)}</h1><p className="text-[15px] text-ink/70">{items.length === 1 ? t('1 Artikel') : t('{n} Artikel', { n: items.length })} · {t('beliebteste zuerst')}</p></div>
        </div>
        <div className="mt-3"><List>{items.map(a => <Row key={a.id} icon={articleIcon(a)} title={a.title} sub={t('{n} Min. · aktualisiert {date}', { n: a.minutes, date: a.updated })} onClick={() => open({ k: 'wiki', item: a })} />)}</List></div>
      </div>
    </div>
  )
}
const ytId = (u: string) => u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1]
// **fett**, *kursiv*, [Text](Link) aus dem Import als echte Auszeichnung
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\)|\n)/g).filter(Boolean)
  return <>{parts.map((p, i) => {
    if (p === '\n') return <br key={i} />
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    const l = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/); if (l) return <a key={i} href={l[2]} target="_blank" rel="noreferrer" className="text-sage-800 underline underline-offset-2">{l[1]}</a>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>
    return <span key={i}>{p}</span>
  })}</>
}
function WikiDetail({ a }: { a: WikiArticle }) {
  const { quizzes, lang, t, me } = useApp()
  const [tr8, setTr8] = useState<{ body: string; blocks: WikiBlock[] | null } | null | 'loading' | 'failed'>(null)
  const [orig, setOrig] = useState(false)
  useEffect(() => {
    if (lang === 'DE' || a.fromNews || !supabase) { setTr8(null); return }
    setTr8('loading')
    supabase.functions.invoke('translate', { body: { action: 'article', id: a.id, lang } }).then(({ data, error }) => setTr8(error || !data?.ok ? 'failed' : { body: data.body, blocks: data.blocks }))
  }, [a.id, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!a.fromNews && supabase && me.id) supabase.from('wiki_views').upsert({ article_id: a.id, employee_id: me.id }, { onConflict: 'article_id,employee_id,day', ignoreDuplicates: true }).then(() => {}) }, [a.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const quiz = quizzes.find(q => a.fromNews ? q.newsId === a.id.slice(5) : q.articleId === a.id)
  const [full, setFull] = useState<{ body: string; blocks: WikiBlock[] | null; title?: string; intro?: string } | null>(a.fromNews ? { body: a.body.join('\n\n'), blocks: null } : null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    if (a.fromNews || !supabase) return
    supabase.from('wiki_articles').select('title, intro, body, blocks').eq('id', a.id).maybeSingle().then(async ({ data }) => {
      setFull({ body: data?.body ?? '', blocks: (data?.blocks as WikiBlock[] | null) ?? null, title: data?.title, intro: data?.intro ?? '' })
      const paths = [...new Set(((data?.blocks ?? []) as WikiBlock[]).filter(b => (b.t === 'img' || b.t === 'file' || b.t === 'video') && b.src).map(b => b.src!))]
      if (a.mediaUrl && !/^https?:/.test(a.mediaUrl)) paths.push(a.mediaUrl)
      if (paths.length) {
        const { data: signed } = await supabase!.storage.from('media').createSignedUrls(paths, 3600)
        setUrls(Object.fromEntries((signed ?? []).filter(x => x.signedUrl && x.path).map(x => [x.path!, x.signedUrl as string])))
      }
    })
  }, [a])
  const shown = full && !orig && tr8 && typeof tr8 === 'object' ? { body: tr8.body, blocks: tr8.blocks } : full
  // Im Original auch Titel und Kurzfassung auf Deutsch
  const title = orig && full?.title ? full.title : a.title, intro = orig && full?.title ? full.intro : a.intro
  const yt = a.mediaKind === 'youtube' && a.mediaUrl ? ytId(a.mediaUrl) : null
  const own = a.mediaUrl ? (urls[a.mediaUrl] ?? (/^https?:/.test(a.mediaUrl) ? a.mediaUrl : null)) : null
  return (
    <article className="px-5 pb-10">
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${TONE[toneOf(a.cat)].bg} ${TONE[toneOf(a.cat)].fg}`}>{catName(a.cat)}</span>
        {(a.mediaKind === 'video' || a.mediaKind === 'youtube' || full?.blocks?.some(x => x.t === 'video')) && <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${TONE.learn.bg} ${TONE.learn.fg}`}>{t('mit Video')}</span>}
        {a.accessLevel !== 'alle' && <span className="px-2.5 py-1 rounded-full text-[13px] bg-white text-ink/70 inline-flex items-center gap-1"><Lock size={12} />{a.accessLevel === 'buero' ? t('Büro') : t('Filialleitung')}</span>}
        <span className="text-[14px] text-mute">{t('{n} Min. · aktualisiert {date}', { n: a.minutes, date: a.updated })}</span>
      </div>
      <h1 className="mt-3 text-[28px] font-medium tracking-tight leading-tight">{title}</h1>
      {intro && <p className="mt-2 text-[17px] text-mute leading-snug">{intro}</p>}
      {lang !== 'DE' && !a.fromNews && <p className="mt-2 text-[14.5px] text-mute">{tr8 === 'loading' ? t('Wird übersetzt …') : tr8 === 'failed' ? t('Übersetzung gerade nicht möglich, Original wird angezeigt.') : <button onClick={() => setOrig(!orig)} className="text-olive-700">{orig ? t('Übersetzung anzeigen') : t('Automatisch übersetzt · Original')}</button>}</p>}
      {yt ? <iframe className="mt-5 w-full aspect-video rounded-[16px]" src={`https://www.youtube-nocookie.com/embed/${yt}`} title={a.title} allow="encrypted-media; picture-in-picture" allowFullScreen />
        : a.mediaKind === 'video' && own ? <video className="mt-5 w-full rounded-[16px] bg-olive-700" src={own} controls playsInline />
        : a.mediaKind === 'photo' && own ? <img className="mt-5 w-full rounded-[16px]" src={own} alt="" /> : null}
      {!full && <p className="mt-6 text-mute">{t('Lädt …')}</p>}
      {shown?.blocks ? <div className="mt-5 space-y-3 text-[17.5px] leading-relaxed">{shown.blocks.map((b, i) => {
        switch (b.t) {
          case 'h': return <h2 key={i} className={`${b.level && b.level >= 3 ? 'text-[17px]' : 'text-[20px]'} font-medium tracking-tight pt-3`}>{b.text}</h2>
          case 'p': return <p key={i}><Rich text={b.text ?? ''} /></p>
          case 'quote': return <div key={i} className="rounded-[16px] bg-duty-50 px-4 py-3 flex gap-3 text-[#6E2A1F]"><AlertTriangle size={19} className="text-duty shrink-0 mt-1" /><p><Rich text={b.text ?? ''} /></p></div>
          case 'ol': return <div key={i} className="space-y-2.5">{b.items?.map((x, j) => <div key={j} className="rounded-[18px] bg-white p-3.5 flex gap-3"><span className="w-8 h-8 rounded-full bg-olive-800 text-white font-display text-[16px] flex items-center justify-center shrink-0">{j + 1}</span><span className="pt-0.5"><Rich text={x} /></span></div>)}</div>
          case 'ul': { const L = 'ul'
            return <L key={i} className={`${b.t === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 space-y-1.5`}>{b.items?.map((x, j) => <li key={j}><Rich text={x} /></li>)}</L> }
          case 'img': return urls[b.src!] ? <img key={i} src={urls[b.src!]} alt="" loading="lazy" className="w-full rounded-[16px] bg-sage-100" /> : <div key={i} className="w-full aspect-[4/3] rounded-[16px] bg-sage-100" />
          case 'video': { if (b.src) return urls[b.src] ? <video key={i} src={urls[b.src]} controls playsInline className="w-full rounded-[16px] bg-olive-700" /> : <div key={i} className="w-full aspect-video rounded-[16px] bg-sage-100" />
            const id = b.url ? ytId(b.url) : null
            return id ? <iframe key={i} className="w-full aspect-video rounded-[16px]" src={`https://www.youtube-nocookie.com/embed/${id}`} title={t('Video')} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
              : <a key={i} href={b.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sage-800 underline"><Play size={16} />{t('Video öffnen')}</a> }
          case 'file': return <a key={i} href={urls[b.src!] ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[17px]"><span className="w-9 h-9 rounded-xl bg-sage-50 flex items-center justify-center text-sage-800 shrink-0"><FileText size={17} /></span><span className="flex-1 min-w-0 truncate">{b.name ?? t('Datei')}</span><ArrowUpRight size={16} className="text-sage-400" /></a>
          default: return null
        }
      })}</div> : shown && <div className="mt-5 space-y-3 text-[17.5px] leading-relaxed">{shown.body.split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>}
      {quiz && full && <QuizRunner quiz={quiz} />}
    </article>
  )
}
function Onboarding({ open }: { open: (s: Sub) => void }) {
  const { steps, obDone, toggleStep, wiki, t } = useApp()
  return (
    <div className="px-5 pb-10"><h1 className="mt-3 text-[26px] font-medium tracking-tight">{t('Onboarding')}</h1>
      <p className="mt-1 text-[15.5px] text-mute">{t('Alles für deine ersten Tage. Deine Respo sieht, wie weit du bist.')}</p>
      <Card onClick={() => open({ k: 'install' })} className="mt-4 p-4 flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-olive-700 text-white flex items-center justify-center"><Smartphone size={19} /></span><span className="flex-1"><span className="block text-[17px] font-medium">{t('Zuerst: TeamHub aufs Handy')}</span><span className="block text-[13px] text-mute">{t('Auf den Home-Bildschirm legen und Mitteilungen einschalten')}</span></span><ChevronRight size={18} className="text-sage-400" /></Card>
      <button onClick={() => openNewBenniChat(t('Lass uns mit dem Onboarding weiterlernen.'))} className="mt-3 w-full rounded-[16px] bg-white p-4 flex items-center gap-3 text-left"><BMark className="w-10 h-10 text-[17px]" /><span className="flex-1"><span className="block text-[17px] font-medium">{t('Mit Benni lernen')}</span><span className="block text-[13px] text-mute">{t('Schritt für Schritt, mit kurzer Kontrollfrage')}</span></span><ChevronRight size={18} className="text-sage-400" /></button>
      <div className="mt-4 h-[3px] rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-olive-700 transition-all" style={{ width: (steps.length ? steps.filter(s => obDone.has(s.id)).length / steps.length * 100 : 0) + '%' }} /></div>
      <div className="mt-5 space-y-2">
        {steps.map((s, i) => { const art = wiki.find(w => w.id === s.articleId)
          return <div key={s.id} className="rounded-[16px] bg-white p-4 flex items-center gap-3">
            <button onClick={() => toggleStep(s.id)} className={`w-8 h-8 rounded-full flex items-center justify-center text-[14.5px] font-medium shrink-0 ${obDone.has(s.id) ? 'bg-sage-600 text-white' : 'bg-sage-50 text-sage-800'}`}>{obDone.has(s.id) ? <Check size={15} /> : i + 1}</button>
            <button onClick={() => art ? open({ k: 'wiki', item: art }) : toggleStep(s.id)} className="flex-1 text-left"><span className="block text-[17px]">{s.title}</span><span className="block text-[13px] text-mute">{t('{n} Min.', { n: s.minutes })}{art ? ' · ' + t('Artikel öffnen') : ''}</span></button>
          </div> })}
      </div>
    </div>
  )
}

/* ---------- Menü ---------- */
function MenuView({ open, onLogout }: { open: (s: Sub) => void; onLogout: () => void }) {
  const { me, t, tickets, news, read, staff } = useApp()
  const unread = live(news).filter(n => n.mustRead && !read.has(n.id)).length
  const tiles: [string, string, typeof Users, Sub][] = [
    ['News', unread ? t('{n} ungelesen', { n: unread }) : t('alles gelesen'), Newspaper, { k: 'news-list' }], ['Kalender', t('Termine, Schulungen und Events'), CalendarDays, { k: 'events' }],
    ['Team', t('{n} Personen', { n: staff.filter(s => s.active).length }), Users, { k: 'team' }], ['Melden & Ideen', t('{n} offen', { n: tickets.filter(x => x.status !== 'Erledigt').length }), Lightbulb, { k: 'tickets' }],
    ['Zeit & Ferien', 'Timebutler', Plane, { k: 'time' }],
  ]
  return (
    <div className="pb-10"><Title>{t('Menü')}</Title>
      <div className="px-5">
        <List>
          <Row title={`${me.first} ${me.last}`} sub={`${me.role} · ${me.branch}`} onClick={() => open({ k: 'me' })} />
        </List>
        <div className="mt-3"><List>
          <Row icon={<CalendarDays size={19} strokeWidth={1.6} />} title={t('Kundentermine')} sub={`${t('Alle Studios')} · ${t('live aus Phorest')}`} onClick={() => open({ k: 'book' })} />
          <Row icon={<Search size={19} strokeWidth={1.6} />} title={t('Kundenhistorie')} sub={t('Besuche und Notizen von Kunden')} onClick={() => open({ k: 'clients' })} />
          {me.app_role !== 'buero' && <Row icon={<TrendingUp size={19} strokeWidth={1.6} />} title={t('Meine Performance')} sub={t('Kennzahlen, Ziele und Bewertungen')} onClick={() => open({ k: 'perf' })} />}
          {tiles.map(([title, sub, Icon, target]) => <Row key={title} icon={<Icon size={19} strokeWidth={1.6} />} title={t(title)} sub={sub} onClick={() => open(target)} />)}
        </List></div>
        <div className="mt-3"><List>
          <Row icon={<Link2 size={19} strokeWidth={1.6} />} title={t('Verbindungen')} sub={t('Phorest, Timebutler, Postfach')} onClick={() => open({ k: 'conn' })} />
        </List></div>
        <button onClick={onLogout} className="mt-6 flex items-center gap-2 text-[17px] text-mute"><LogOut size={18} />{t('Abmelden')}</button>
      </div>
    </div>
  )
}

function Team({ open }: { open: (s: Sub) => void }) {
  const { staff, branches, t } = useApp()
  const [q, setQ] = useState(''), [b, setB] = useState('Alle')
  const list = useMemo(() => staff.filter(s => s.active && (b === 'Alle' || s.branch === b) && `${s.first} ${s.last} ${s.role} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase())), [q, b, staff])
  return (
    <div className="pb-10"><Title>{t('Team')}</Title>
      <div className="px-5 space-y-3"><SearchBox value={q} onChange={setQ} placeholder={t('Name oder Skill, z. B. Pediküre')} /><Chips items={['Alle', ...branches.map(x => x.name)]} value={b} onChange={setB} label={x => x === 'Alle' ? t('Alle') : x} />
        <p className="text-[13px] text-mute pt-1">{t('{n} Personen', { n: list.length })}</p>
        <List>{list.map(s => <Row key={s.id} icon={<Avatar s={s} photo={s.photo} size="w-9 h-9" />} title={`${s.first} ${s.last}`} sub={`${s.role} · ${s.branch}${s.skills.length ? ' · ' + s.skills.slice(0, 3).join(', ') : ''}`} onClick={() => open({ k: 'profile', item: s })} />)}</List>
      </div>
    </div>
  )
}

/* ---------- Kundenhistorie aus Phorest (Zusammenfassung durch Benni) ---------- */
function ClientHistoryView({ cid }: { cid?: string }) {
  const { t, me } = useApp()
  const [q, setQ] = useState(''), [hits, setHits] = useState<ClientHit[] | null>(null), [h, setH] = useState<(ClientHistory & { id: string }) | null>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const day = useMyDay()
  const search = async () => {
    if (q.trim().length < 3 || busy) return
    setBusy(true); setErr(''); setH(null)
    const r = await phorest<{ ok: boolean; clients: ClientHit[]; error?: string }>({ action: 'client_search', q })
    setBusy(false)
    if (!r.ok) { setErr(t(r.error === 'contact_search_forbidden' ? 'Suche bitte über den Namen. Telefon und E-Mail sieht nur die Respo.' : 'Phorest ist gerade nicht erreichbar. Bitte später noch einmal öffnen.')); return }
    setHits(r.clients)
  }
  const pick = async (id: string) => {
    setBusy(true); setErr('')
    const r = await phorest<ClientHistory>({ action: 'client_history', client_id: id, months: 12, summary: true })
    setBusy(false)
    if (!r.ok) { setErr(t('Phorest ist gerade nicht erreichbar. Bitte später noch einmal öffnen.')); return }
    setH({ ...r, id })
  }
  // Aus Bennis Kundenkarte: direkt die Historie dieser Kundin
  useEffect(() => { if (cid) pick(cid) }, [cid]) // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (d: string) => d ? new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: '2-digit' }).format(new Date(d + 'T12:00:00Z')) : ''
  // Eigene Kundinnen von heute als Schnellwahl
  const todays = (day?.appointments ?? []).filter((a, i, l) => a.client_id && l.findIndex(b => b.client_id === a.client_id) === i)
  if (h) return <ClientDetail h={h} fmt={fmt} onBack={() => setH(null)} />
  return (
    <div className="pb-10"><Title>{t('Kundenhistorie')}</Title>
      <div className="px-5">
        <div className="flex gap-2"><div className="flex-1"><SearchBox value={q} onChange={setQ} placeholder={t('Name, E-Mail oder Telefon')} /></div>
          <button disabled={busy || q.trim().length < 3} onClick={search} className="h-11 px-4 rounded-[10px] bg-olive-700 text-white text-[15.5px] disabled:opacity-40">{t('Suchen')}</button></div>
        {err && <p className="mt-3 text-[14.5px] text-alert">{err}</p>}
        {busy && <p className="mt-4 text-[15.5px] text-mute">{t('Lädt aus Phorest …')}</p>}
        {hits && !busy && <div className="mt-4"><List>{hits.length === 0 && <Empty>{t('Keine Kunden gefunden.')}</Empty>}
          {hits.map(c => <Row key={c.client_id} title={c.name} sub={[c.since && t('seit {d}', { d: fmt(c.since) }), c.phone_tail && `…${c.phone_tail}`].filter(Boolean).join(' · ')} onClick={() => pick(c.client_id)} />)}</List></div>}
        {!hits && !busy && <>
          <Label>{t('Deine Kunden heute')}</Label>
          <List>
            {!day && <Empty>{t('Lädt aus Phorest …')}</Empty>}
            {day && todays.length === 0 && <Empty>{t(me.app_role === 'mitarbeiterin' ? 'Heute keine Termine. Such Kunden über den Namen.' : 'Heute keine Termine. Such Kunden über Name, E-Mail oder Telefon.')}</Empty>}
            {todays.map(a => <Row key={a.client_id} title={a.client} sub={`${a.start} · ${a.service}`} onClick={() => pick(a.client_id!)} />)}
          </List>
        </>}
      </div>
    </div>
  )
}

/** Kundin im Detail: Kontakt, Angaben aus Phorest, Kundennotiz, Benni-Zusammenfassung mit Rückfragen, Termine. */
function ClientDetail({ h, fmt, onBack }: { h: ClientHistory & { id: string }; fmt: (d: string) => string; onBack: () => void }) {
  const { t } = useApp()
  const c = h.client
  const visits = h.visits.filter(v => !v.cancelled).length
  const ini = c.name.split(/\s+/).map(x => x[0] ?? '').slice(0, 2).join('').toUpperCase()
  const tel = (p: string) => { const d = p.replace(/[^\d+]/g, ''); return d.startsWith('+') ? d : /^(41|49|33|39|43)\d{8,}$/.test(d) ? '+' + d : d.startsWith('00') ? '+' + d.slice(2) : d }
  // Lesbar gliedern: +41 79 123 45 67, sonst +49 151 40055346
  const showTel = (p: string) => { const d = tel(p), ch = d.match(/^\+41(\d{2})(\d{3})(\d{2})(\d{2})$/); return ch ? `+41 ${ch[1]} ${ch[2]} ${ch[3]} ${ch[4]}` : d.replace(/^(\+\d{2})(\d{3})(\d+)$/, '$1 $2 $3') }
  const gender = c.gender === 'FEMALE' ? t('weiblich') : c.gender === 'MALE' ? t('männlich') : c.gender ? t('divers') : ''
  const yes = (b?: boolean) => b ? t('ja') : t('nein')
  const facts: [string, string][] = ([
    [t('Geschlecht'), gender],
    [t('Geburtstag'), c.birth_date ? fmt(c.birth_date) : ''],
    [t('Adresse'), c.address ?? ''],
    [t('Bevorzugt'), c.preferred],
    [t('Zuletzt da'), [c.last_visit && fmt(c.last_visit), c.last_branch].filter(Boolean).join(' · ')],
    [t('Erster Besuch'), c.first_visit ? fmt(c.first_visit) : ''],
    [t('Treuepunkte'), c.loyalty_points ? String(c.loyalty_points) : ''],
    [t('Offener Betrag'), c.balance ? `CHF ${c.balance.toFixed(2)}` : ''],
    [t('Erinnerungen'), c.consent ? [c.consent.sms_reminder && 'SMS', c.consent.email_reminder && t('E-Mail')].filter(Boolean).join(', ') || t('keine') : ''],
    [t('Werbung erlaubt'), c.consent ? `SMS ${yes(c.consent.sms_marketing)} · ${t('E-Mail')} ${yes(c.consent.email_marketing)}` : ''],
  ] as [string, string][]).filter(([, v]) => v)
  return (
    <div className="pb-10 px-5">
      <div className="mt-2 flex items-center gap-4">
        <span className="w-14 h-14 rounded-full bg-white text-sage-800 flex items-center justify-center text-[18px] font-medium shrink-0">{ini}</span>
        <div className="min-w-0 flex-1"><h1 className="text-[24px] leading-tight truncate">{c.name}</h1>
          <p className="text-[14.5px] text-mute mt-0.5">{[c.since && t('Kunde seit {d}', { d: fmt(c.since) }), t('{n} Besuche', { n: visits })].filter(Boolean).join(' · ')}</p></div>
        <button onClick={onBack} title={t('Andere Kunden suchen')} aria-label={t('Andere Kunden suchen')} className="w-10 h-10 rounded-full bg-white text-ink/70 hover:text-ink flex items-center justify-center shrink-0"><Search size={17} /></button>
      </div>
      {((c.categories?.length ?? 0) > 0 || c.membership || c.banned) && <div className="mt-3 flex flex-wrap gap-1.5">
        {c.banned && <span className="h-7 px-2.5 rounded-full bg-alert/10 text-alert text-[14px] flex items-center">{t('Gesperrt')}</span>}
        {c.membership && <span className="h-7 px-2.5 rounded-full bg-olive-700 text-white text-[14px] flex items-center">{t('Mitgliedschaft aktiv')}</span>}
        {c.categories?.map(k => <span key={k} className="h-7 px-2.5 rounded-full bg-white text-[14px] flex items-center">{k}</span>)}
      </div>}
      {c.contact_hidden && <><Label>{t('Kontakt')}</Label><List><ContactLocked /></List></>}
      {(c.phone || c.email) && <><Label>{t('Kontakt')}</Label><List>
        {c.phone && <ContactRow label={t('Mobil')} value={showTel(c.phone)} href={`tel:${tel(c.phone)}`} icon={<Phone size={15} />} action={t('Anrufen')} />}
        {c.landline && <ContactRow label={t('Festnetz')} value={showTel(c.landline)} href={`tel:${tel(c.landline)}`} icon={<Phone size={15} />} action={t('Anrufen')} />}
        {c.email && <ContactRow label={t('E-Mail')} value={c.email} href={`mailto:${c.email}`} icon={<Send size={15} />} action={t('E-Mail schreiben')} />}
      </List></>}
      {facts.length > 0 && <><Label>{t('Angaben aus Phorest')}</Label>
        <List>{facts.map(([k, v]) => <div key={k} className="px-4 py-3 flex justify-between gap-4 text-[15.5px]"><span className="text-mute shrink-0">{k}</span><span className="text-right">{v}</span></div>)}</List></>}
      {c.notes && <div className="mt-6 rounded-[16px] bg-white px-4 py-4"><p className="rubric text-brass">{t('Kundennotiz')}</p><p className="mt-2 text-[17px] leading-relaxed whitespace-pre-wrap">{c.notes}</p></div>}
      <ClientAsk h={h} />
      {(h.upcoming?.length ?? 0) > 0 && <><Label>{t('Kommende Termine')}</Label>
        <List>{h.upcoming!.map((v, i) => <div key={i} className="px-4 py-3 flex justify-between gap-3 text-[15.5px]"><span>{v.service}<span className="block text-[13px] text-mute mt-0.5">{[v.branch, v.staff].filter(Boolean).join(' · ')}</span></span><span className="text-mute shrink-0 text-right">{fmt(v.date)}<span className="block text-[13px]">{v.time}</span></span></div>)}</List></>}
      <Label>{t('Besuche der letzten {n} Monate', { n: h.months })}</Label>
      <List>{h.visits.length === 0 && <Empty>{t('Keine Besuche in diesem Zeitraum.')}</Empty>}{h.visits.map((v, i) => (
        <div key={i} className="px-4 py-3">
          <div className="flex justify-between gap-3 text-[15.5px]"><span className={v.cancelled ? 'line-through text-mute' : ''}>{v.service}</span><span className="text-mute shrink-0">{fmt(v.date)}</span></div>
          <p className="text-[13px] text-mute mt-0.5">{[v.time, v.branch, v.staff, v.cancelled && t('abgesagt')].filter(Boolean).join(' · ')}</p>
          {v.notes && <p className="text-[14.5px] mt-1.5 text-ink/80 whitespace-pre-wrap">{v.notes}</p>}
        </div>))}</List>
    </div>
  )
}

/** Zusammenfassung von Benni und direkt Fragen zur Kundin stellen (ohne eigenen Chat). */
function ClientAsk({ h }: { h: ClientHistory & { id: string } }) {
  const { t } = useApp()
  const first = h.client.name.split(' ')[0]
  const [q, setQ] = useState(''), [thread, setThread] = useState<{ q: string; a?: string; steps: Step[] }[]>([])
  const busy = thread.some(x => x.a === undefined)
  const ask = async () => {
    const question = q.trim(); if (!question || busy) return
    setQ('')
    const history = thread.flatMap(x => [{ me: true, t: x.q }, { me: false, t: x.a ?? '' }])
    setThread(l => [...l, { q: question, steps: [{ step: 'think' }] }])
    const r = await askBenniOnce(`Frage zur Kundin ${h.client.name} (client_id ${h.id}): ${question}`, history, st => setThread(l => l.map((x, i) => i === l.length - 1 ? { ...x, steps: [...x.steps, st] } : x)))
    setThread(l => l.map((x, i) => i === l.length - 1 ? { ...x, a: r.ok ? r.text : t('Ich bin gerade nicht erreichbar. Bitte versuche es gleich noch einmal.') } : x))
  }
  return (
    <div className="mt-6 rounded-[16px] bg-white px-4 py-4">
      <p className="rubric text-olive-700 flex items-center gap-2"><BMark className="w-5 h-5" />{t('Zusammenfassung von {name}', { name: ASSISTANT })}</p>
      {h.summary ? <div className="mt-2 text-[17px] leading-relaxed space-y-1">{h.summary.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div>
        : <p className="mt-2 text-[15.5px] text-mute">{t('Noch zu wenig Besuche für eine Zusammenfassung.')}</p>}
      {thread.map((x, i) => <div key={i} className="mt-4 pt-4 border-t border-sage-50">
        <p className="text-[15.5px] font-medium">{x.q}</p>
        <div className="mt-1.5 text-[17px] leading-relaxed">{x.a === undefined ? <BenniWorking steps={x.steps} /> : <BenniText text={x.a} />}</div>
      </div>)}
      <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-sage-50 pl-4 pr-1.5 py-1.5">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder={t('Frag {name} zu {client} …', { name: ASSISTANT, client: first })} className="flex-1 min-w-0 bg-transparent text-[17px] outline-none placeholder:text-mute" />
        <button onClick={ask} disabled={!q.trim() || busy} aria-label={t('Senden')} className="w-8 h-8 rounded-full bg-olive-700 text-white flex items-center justify-center disabled:bg-sage-200 shrink-0"><ArrowUp size={16} strokeWidth={2.2} /></button>
      </div>
    </div>
  )
}

/* ---------- Arbeitszeiten der Woche (aus Phorest) ---------- */
function WeekShifts({ id }: { id?: string }) {
  const { t, branches } = useApp()
  const [w, setW] = useState<StaffWeek | null>(null)
  useEffect(() => { setW(null); phorest<StaffWeek>({ action: 'staff_week', employee_id: id }).then(setW) }, [id])
  const days = Array.from({ length: 7 }, (_, i) => addDays(i))
  const label = (d: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(d + 'T12:00:00Z'))
  if (!w) return <Empty>{t('Lädt aus Phorest …')}</Empty>
  if (!w.ok || !w.mapped) return <Empty>{t('Keine Arbeitszeiten aus Phorest.')}</Empty>
  return <List>{days.map(d => { const x = w.days.filter(s => s.date === d)
    return <div key={d} className="px-4 py-2.5 flex justify-between text-[15.5px]"><span className="text-ink/80">{label(d)}</span>{x.length ? <span>{x.map(s => `${s.start}–${s.end}${branches.length && x.length > 1 ? ' ' + (branches.find(b => b.id === s.branch_id)?.name ?? '') : ''}`).join(', ')}</span> : <span className="text-mute">{t('frei')}</span>}</div> })}</List>
}
/* ---------- Aushilfe-Tage (Pikett) ---------- */
// Monatskalender: Tage antippen, an denen man kurzfristig einspringen kann (heute bis drei Monate voraus)
function StandbyPicker() {
  const { standby, toggleStandby, me, t } = useApp()
  const mine = new Set(standby.filter(x => x.employee_id === me.id).map(x => x.day))
  const today = isoDay(), first = today.slice(0, 7)
  const shift = (ym: string, n: number) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7) }
  const last = shift(first, 3)
  const [month, setMonth] = useState(first)
  const [busy, setBusy] = useState<string | null>(null)
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1
  const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), pad = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7
  const days = Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  const fmt = (o: Intl.DateTimeFormatOptions, d: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', ...o }).format(new Date(d + 'T12:00:00Z'))
  const upcoming = [...mine].filter(d => d >= today).sort()
  const inMonth = days.filter(d => mine.has(d)).length
  const nav = 'w-9 h-9 rounded-full flex items-center justify-center text-ink/70 hover:bg-sage-50 disabled:opacity-25 disabled:hover:bg-transparent'
  return (<div>
    <div className="rounded-[16px] bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setMonth(shift(month, -1))} disabled={month <= first} aria-label={t('Vorheriger Monat')} className={nav}><ChevronLeft size={18} /></button>
        <p className="font-display text-[17px] capitalize">{fmt({ month: 'long', year: 'numeric' }, month + '-01')}</p>
        <button onClick={() => setMonth(shift(month, 1))} disabled={month >= last} aria-label={t('Nächster Monat')} className={nav}><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] text-mute mb-1">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(x => <span key={x}>{t(x)}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-1">{Array.from({ length: pad }, (_, i) => <span key={'p' + i} />)}{days.map(d => {
        const on = mine.has(d), past = d < today, isToday = d === today
        return <button key={d} disabled={past || busy === d} onClick={async () => { setBusy(d); await toggleStandby(d); setBusy(null) }} aria-pressed={on} aria-label={fmt({ weekday: 'long', day: 'numeric', month: 'long' }, d)}
          className={`mx-auto w-10 h-10 rounded-full text-[15.5px] tabular-nums transition ${on ? 'bg-olive-700 text-white' : past ? 'text-ink/25' : 'hover:bg-sage-50'} ${isToday && !on ? 'shadow-[inset_0_0_0_1.5px_#495940] font-medium' : ''} ${busy === d ? 'opacity-50' : ''}`}>{Number(d.slice(8))}</button>
      })}</div>
      <p className="mt-3 pt-3 border-t border-sage-50 text-[14px] text-mute">{inMonth ? t('{n} Tage in diesem Monat eingetragen', { n: inMonth }) : t('In diesem Monat noch keine Tage eingetragen')}</p>
    </div>
    {upcoming.length > 0 && <p className="mt-2.5 px-1 text-[14.5px] text-ink/80">{t('Nächste:')} {upcoming.slice(0, 4).map(d => fmt({ weekday: 'short', day: 'numeric', month: 'numeric' }, d)).join(' · ')}</p>}
    <p className="mt-2 px-1 text-[13px] text-mute leading-relaxed">{t('Tipp die Tage an, an denen du kurzfristig einspringen kannst. Filialleitung und Büro sehen das unter Aushilfe, wenn jemand ausfällt.')}</p>
  </div>)
}

function Profile({ s }: { s: Staff }) {
  const { t } = useApp()
  return (
    <div className="px-5 pb-10 text-center">
      <div className="mt-4 flex justify-center"><Avatar s={s} photo={s.photo} size="w-24 h-24 text-2xl" /></div>
      <h1 className="mt-4 text-[24px] font-medium tracking-tight">{s.first} {s.last}</h1><p className="text-mute">{s.role} · {t('Studio {name}', { name: s.branch })}</p>
      <div className="mt-6 text-left"><Label>{t('Skills')}</Label>{s.skills.length ? <div className="flex flex-wrap gap-2">{s.skills.map(k => <span key={k} className="px-3 h-8 rounded-full bg-white text-[14.5px] flex items-center">{k}</span>)}</div> : <p className="text-[15.5px] text-mute">{t('Noch keine Skills eingetragen.')}</p>}
        <Label>{t('Arbeitszeiten diese Woche')}</Label><WeekShifts id={s.id} />
        <Label>{t('Kontakt')}</Label>
        <List>
          {s.phone && <ContactRow label={t('Telefon')} value={s.phone} href={`tel:${s.phone.replace(/\s/g, '')}`} icon={<Phone size={15} />} action={t('Anrufen')} />}
          <ContactRow label={t('E-Mail')} value={s.email} href={`mailto:${s.email}`} icon={<Send size={15} />} action={t('E-Mail schreiben')} />
        </List></div>
    </div>
  )
}
function MyProfile() {
  const { me, skills, photo, setPhotoFile, lang, setLang, t } = useApp()
  const { signOut } = useAuth()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="px-5 pb-10">
      <div className="mt-3 flex flex-col items-center">
        <button onClick={() => file.current?.click()} className={`relative ${busy ? 'opacity-50' : ''}`}><Avatar s={me} photo={photo} size="w-24 h-24 text-2xl" />
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-olive-700 text-white flex items-center justify-center border-2 border-paper"><Camera size={14} /></span></button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { setBusy(true); await setPhotoFile(f); setBusy(false) } }} />
        <h1 className="mt-4 text-[24px] font-medium tracking-tight">{me.first} {me.last}</h1><p className="text-mute">{me.role} · {t('Studio {name}', { name: me.branch })}</p>
      </div>
      <Label>{t('Meine Skills')}</Label>
      {skills.length ? <div className="flex flex-wrap gap-2">{skills.map(k => <span key={k} className="px-3 h-8 rounded-full bg-white text-[14.5px] flex items-center">{k}</span>)}</div>
        : <p className="text-[15.5px] text-mute">{t('Noch keine Skills hinterlegt.')}</p>}
      <p className="mt-3 text-[13px] text-mute">{t('Skills pflegt deine Filialleitung oder das Büro. Kolleginnen finden dich darüber, zum Beispiel wenn jemand Aushilfe sucht.')}</p>
      <Label>{t('Arbeitszeiten · nächste 7 Tage')}</Label>
      <WeekShifts />
      <Label>{t('Aushilfe-Tage')}</Label>
      <StandbyPicker />
      <Label>{t('Mitteilungen')}</Label>
      <PushToggle />
      <Label>{t('Sprache')}</Label>
      <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-white">{([['DE', 'Deutsch'], ['EN', 'English'], ['FR', 'Français']] as [Lang, string][]).map(([k, l]) => <button key={k} onClick={() => setLang(k)} className={`h-10 rounded-xl text-[15.5px] ${lang === k ? 'bg-olive-700 text-white' : ''}`}>{l}</button>)}</div>
      <button onClick={signOut} className="mt-8 w-full h-12 rounded-[14px] bg-white text-[17px] text-ink/80 hover:text-alert flex items-center justify-center gap-2"><LogOut size={17} />{t('Abmelden')}</button>
    </div>
  )
}

function Tickets({ open }: { open: (s: Sub) => void }) {
  const { tickets, addTicket, toggleVote, me, t, branches } = useApp()
  const [kind, setKind] = useState<'Meldung' | 'Idee'>('Meldung'), [text, setText] = useState(''), [ok, setOk] = useState(''), [photo, setPhoto] = useState<File | null>(null), [busy, setBusy] = useState(false)
  // Wer woanders aushilft, meldet für das Studio, in dem sie gerade ist
  const studios = branches.filter(b => !b.is_office)
  const [branchId, setBranchId] = useState(studios.some(b => b.id === me.branch_id) ? me.branch_id : studios[0]?.id ?? me.branch_id)
  const [pickB, setPickB] = useState(false)
  const [view, setView] = useState<'offen' | 'erledigt'>('offen')
  const file = useRef<HTMLInputElement>(null)
  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true); const good = await addTicket({ kind, title: text.trim(), photo: photo ?? undefined, ...(branchId === '*' ? { allStudios: true } : { branchId }) }); setBusy(false)
    if (good) { setText(''); setPhoto(null); setOk(t('Gesendet. Du siehst hier, was daraus wird.')) } else setOk(t('Das hat nicht geklappt. Bitte versuche es noch einmal.'))
    setTimeout(() => setOk(''), 3000)
  }
  // Die Datenbank liefert nur, was diese Person sehen darf: eigene Meldungen, Ideen des Teams, als Leitung das Studio
  const list = tickets.filter(x => view === 'offen' ? x.status !== 'Erledigt' : x.status === 'Erledigt')
    .sort((a, b) => b.votes - a.votes)
  const isVideo = photo?.type.startsWith('video')
  return (
    <div className="pb-10"><Title>{t('Melden & Ideen')}</Title>
      <div className="px-5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-[12px] bg-white">
          {(['Meldung', 'Idee'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={`h-10 rounded-[10px] text-[15.5px] flex items-center justify-center gap-1.5 transition ${kind === k ? 'bg-olive-700 text-white' : ''}`}>{k === 'Meldung' ? <AlertTriangle size={15} /> : <Lightbulb size={15} />}{t(k)}</button>)}
        </div>
        <Card className="mt-3 p-4">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={kind === 'Meldung' ? t('Was ist kaputt oder fehlt?') : t('Was könnten wir besser machen?')} className="w-full resize-none outline-none text-[17px] placeholder:text-mute bg-transparent" />
          <div className="mt-2 flex items-center justify-between text-[14.5px] text-mute">
            <span className="flex items-center gap-3"><button onClick={() => file.current?.click()} className={`flex items-center gap-1 ${photo ? 'text-olive-700' : ''}`}>{isVideo ? <Video size={15} /> : <Camera size={15} />}{photo ? (isVideo ? t('Video dabei') : t('Foto dabei')) : t('Foto oder Video')}</button><span className="relative"><button onClick={() => setPickB(!pickB)} className="flex items-center gap-1 hover:text-ink"><MapPin size={15} />{branchId === '*' ? t('Alle Studios') : branches.find(b => b.id === branchId)?.name ?? me.branch}<ChevronRight size={13} className={`transition ${pickB ? 'rotate-90' : ''}`} /></button>
              {pickB && <span className="absolute z-20 left-0 bottom-7 w-48 rounded-[12px] bg-white shadow-[0_12px_32px_-12px_rgba(29,34,28,.45)] p-1 flex flex-col">{[{ id: '*', name: t('Alle Studios') }, ...studios].map(b => <button key={b.id} onClick={() => { setBranchId(b.id); setPickB(false) }} className={`h-9 px-3 rounded-[8px] text-left text-[15.5px] flex items-center justify-between ${b.id === branchId ? 'bg-sage-50 text-ink' : 'text-ink/80 hover:bg-sage-50'}`}>{b.name}{b.id === branchId && <Check size={14} />}</button>)}</span>}
            </span></span>
            <button disabled={busy} onClick={submit} className="h-9 px-4 rounded-[10px] bg-olive-700 text-white flex items-center gap-1.5 disabled:opacity-60"><Send size={13} />{t('Senden')}</button>
          </div>
          <input ref={file} type="file" accept="image/*,video/*" className="hidden" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
        </Card>
        {ok && <p className="mt-2 text-[13px] text-mute">{ok}</p>}
        <div className="mt-8 mb-2.5 px-1 flex items-center justify-between"><div><h2 className="rubric text-ink/70">{t('Verlauf')}</h2><p className="text-[13px] text-mute mt-1">{t('Schon gemeldet? Dann einfach upvoten.')}</p></div>
          <div className="flex gap-1 p-0.5 rounded-[8px] bg-white">{(['offen', 'erledigt'] as const).map(k => <button key={k} onClick={() => setView(k)} className={`h-7 px-2.5 rounded-[6px] text-[13px] transition ${view === k ? 'bg-olive-700 text-white' : 'text-ink/60'}`}>{t(k === 'offen' ? 'Offen' : 'Erledigt')}</button>)}</div></div>
        <List>{list.length === 0 && <Empty>{view === 'offen' ? t('Nichts offen.') : t('Noch nichts erledigt.')}</Empty>}{list.map(x => (
          <div key={x.id} className="px-4 py-3 flex gap-3 items-start">
            <button onClick={() => open({ k: 'ticket', id: x.id })} className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 text-[13px] text-mute"><span className="text-olive-700">{t(x.kind)}</span>·<span>{x.branch}</span>·<span>{x.when}</span>{!x.mine && <span>· {x.who}</span>}</div>
              <p className="text-[17px] mt-1">{x.title}</p>
              <p className="text-[13px] mt-1 flex items-center gap-2"><Status s={x.status} />{x.assignee && <span className="text-mute">· {x.assignee}</span>}{x.comments.length > 0 && <span className="text-mute">· {t('{n} Kommentare', { n: x.comments.length })}</span>}</p>
            </button>
            <button onClick={() => toggleVote(x.id)} aria-pressed={x.voted} title={t('Upvote')} className={`shrink-0 w-11 py-1.5 rounded-[10px] flex flex-col items-center text-[13px] transition ${x.voted ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/70 hover:bg-sage-100'}`}><ArrowBigUp size={16} strokeWidth={1.8} />{x.votes}</button>
          </div>
        ))}</List>
      </div>
    </div>
  )
}
function TicketDetail({ id }: { id: string }) {
  const { tickets, toggleVote, t } = useApp()
  const x = tickets.find(y => y.id === id)
  if (!x) return <Empty>{t('Nicht mehr vorhanden.')}</Empty>
  return (
    <div className="px-5 pb-10">
      <p className="rubric text-olive-700 mt-2">{t(x.kind)} · {x.branch}</p>
      <h1 className="text-[24px] leading-tight mt-2">{x.title}</h1>
      {x.body && <p className="mt-2 text-[17px] whitespace-pre-wrap">{x.body}</p>}
      <p className="mt-2 text-[14.5px] text-mute flex items-center gap-2"><Status s={x.status} />{x.assignee && <span>· {x.assignee}</span>}<span>· {x.who}, {x.when}</span></p>
      {x.photo && <div className="mt-4"><Media tk={x} /></div>}
      <button onClick={() => toggleVote(x.id)} className={`mt-4 h-10 px-4 rounded-[10px] text-[15.5px] flex items-center gap-2 transition ${x.voted ? 'bg-olive-700 text-white' : 'bg-white'}`}><ArrowBigUp size={17} strokeWidth={1.8} />{x.voted ? t('Upvoted') : t('Upvote')} · {x.votes}</button>
      <Label>{t('Verlauf')}</Label>
      <div className="rounded-[16px] bg-white px-4 py-2"><Comments tk={x} compact /></div>
    </div>
  )
}
export const Status = ({ s }: { s: string }) => {
  const c = s === 'Erledigt' ? 'bg-ok' : s === 'Neu' ? 'bg-sage-400' : 'bg-brass'
  return <span className="inline-flex items-center gap-1.5 text-ink/80"><span className={`w-[7px] h-[7px] rounded-full ${c}`} />{tr(s)}</span>
}

function Events() {
  const { t } = useApp()
  return <div className="pb-10"><Title sub={t('Deine Termine und Schulungen')}>{t('Mein Kalender')}</Title><div className="px-5"><EventCalendar /></div></div>
}


/* ---------- Zeit & Ferien (Timebutler) und Postfach: Link statt Einbettung ----------
   Timebutler, Cyon-Webmail und Phorest verbieten Einbettung (X-Frame-Options/frame-ancestors),
   deshalb direkter Zugang zur App bzw. zum Browser mit eigener Anmeldung (BLTH-22, Stand 10/2026). */
const TOOL_LINKS = {
  timebutlerWeb: 'https://app.timebutler.com/login/',
  timebutlerIOS: 'https://apps.apple.com/ch/app/timebutler/id6763064084',
  timebutlerAndroid: 'https://play.google.com/store/apps/details?id=com.timebutler.mobile',
  webmail: 'https://webmail.cyon.ch',
}
function ExternalTool({ kind }: { kind: 'timebutler' | 'mail' }) {
  const { me, t } = useApp()
  const tb = kind === 'timebutler'
  const app = isIOS() ? TOOL_LINKS.timebutlerIOS : isAndroid() ? TOOL_LINKS.timebutlerAndroid : null
  return (
    <div className="pb-10"><Title>{tb ? t('Zeit & Ferien') : t('Posteingang')}</Title>
      <div className="px-5 space-y-3">
        <Card className="p-5">
          <span className="w-11 h-11 rounded-xl text-white flex items-center justify-center font-medium" style={{ background: '#495940' }}>{tb ? 'T' : '@'}</span>
          <p className="mt-3 text-[17px] font-medium">{tb ? t('Ferien, Anträge und Stempeluhr laufen in Timebutler') : t('Deine Firmen-Mails liest du im Webmail')}</p>
          <p className="mt-1 text-[15.5px] text-mute">{tb ? t('Melde dich dort mit deinem Timebutler-Zugang an. TeamHub speichert dafür kein Passwort.') : t('Melde dich mit {email} und deinem Postfach-Passwort an. TeamHub speichert dafür kein Passwort.', { email: me.email })}</p>
          <div className="mt-4 space-y-2">
            {tb && app && <a href={app} target="_blank" rel="noreferrer" className="h-12 rounded-2xl bg-olive-700 text-white flex items-center justify-center gap-2 text-[17px] font-medium">{t('Timebutler-App öffnen oder installieren')}</a>}
            <a href={tb ? TOOL_LINKS.timebutlerWeb : TOOL_LINKS.webmail} target="_blank" rel="noreferrer" className={`h-12 rounded-2xl flex items-center justify-center gap-2 text-[17px] font-medium ${tb && app ? 'bg-white border border-sage-200' : 'bg-olive-700 text-white'}`}>{t('Im Browser öffnen')}<ExternalLink size={16} /></a>
          </div>
        </Card>
        <p className="px-1 text-[13px] text-mute">{tb ? t('Wo steht was: Kundentermine und Schichten kommen aus Phorest, Schulungen und Events aus TeamHub, Ferien und Arbeitszeit aus Timebutler.') : t('Der Posteingang direkt im TeamHub folgt in einem späteren Schritt.')}</p>
      </div>
    </div>
  )
}

function Connections() {
  const { me, myPhorest, branches, t } = useApp()
  const rows = [
    { k: 'phorest', name: 'Phorest', logo: 'P', color: '#495940', on: myPhorest.length > 0, what: myPhorest.length ? t('Automatisch · {list}', { list: myPhorest.map(m => branches.find(b => b.id === m.branch_id)?.name).join(', ') }) : t('Keine Phorest-Spalte zu {email} gefunden', { email: me.email }) },
    { k: 'timebutler', name: 'Timebutler', logo: 'T', color: '#495940', on: false, link: true, what: t('Ferien, Anträge, Stempeluhr · eigene Anmeldung') },
    { k: 'mail', name: t('Postfach'), logo: '@', color: '#495940', on: false, link: true, what: `${me.email} · ${t('Webmail, eigene Anmeldung')}` },
  ]
  return (
    <div className="pb-10"><Title>{t('Verbindungen')}</Title>
      <div className="px-5">
        <p className="text-[15.5px] text-mute -mt-2 mb-4">{t('Deine Konten in anderen Tools.')}</p>
        <List>{rows.map(c => (
          <div key={c.k} className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-medium" style={{ background: c.color }}>{c.logo}</span>
            <span className="flex-1 min-w-0"><span className="block text-[17px] font-medium">{c.name}</span><span className="block text-[13px] text-mute truncate">{c.what}</span></span>
            {c.on ? <span className="flex items-center gap-1 text-[14.5px] text-sage-800"><Check size={15} />{t('Aktiv')}</span> : 'link' in c ? <a href={c.k === 'mail' ? TOOL_LINKS.webmail : TOOL_LINKS.timebutlerWeb} target="_blank" rel="noreferrer" className="text-[14.5px] text-sage-800 flex items-center gap-1">{t('Öffnen')}<ExternalLink size={13} /></a> : <span className="text-[14.5px] text-mute flex items-center gap-1"><Lock size={13} />{c.k === 'phorest' ? t('offen') : t('bald')}</span>}
          </div>
        ))}</List>
        <p className="mt-3 text-[13px] text-mute">{t('Phorest braucht keine eigene Anmeldung. TeamHub erkennt dich über deine Firmen-Mail und zeigt dir deine eigenen Termine.')}</p>
      </div>
    </div>
  )
}

/* ---------- Startklar: Homescreen + Mitteilungen (BLTH-27) ---------- */
function usePush() {
  const [st, setSt] = useState<PushState | null>(null)
  const refresh = () => pushState().then(setSt)
  useEffect(() => { refresh() }, [])
  return [st, refresh] as const
}
function ReadyCard({ open }: { open: (s: Sub) => void }) {
  const { t } = useApp()
  const [st] = usePush()
  const [hide, setHide] = useState(() => { try { return localStorage.getItem('th-ready-hide') === '1' } catch { return false } })
  if (hide || st === null || matchMedia('(min-width: 768px)').matches || (isStandalone() && (st === 'on' || st === 'unsupported'))) return null
  const label = !isStandalone() ? t('Auf den Home-Bildschirm legen') : t('Mitteilungen einschalten')
  return (
    <div className="mt-3 rounded-[16px] bg-white px-4 py-3.5 flex gap-3 items-center">
      <button onClick={() => open({ k: 'install' })} className="flex-1 text-left text-[17px] text-olive-700 font-medium">{label}</button>
      <button onClick={() => { setHide(true); try { localStorage.setItem('th-ready-hide', '1') } catch { /* privat */ } }} className="text-[14.5px] text-mute">{t('Später')}</button>
    </div>
  )
}
function PushToggle() {
  const { me, t } = useApp()
  const [st, refresh] = usePush()
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const info: Record<PushState, string> = {
    on: t('Eingeschaltet. Du bekommst Pflicht-News, neue Schulungen und den Stand deiner Meldungen.'),
    off: t('Aus. Schalte sie ein, dann meldet sich TeamHub bei wichtigen News.'),
    denied: t('Blockiert. Erlaube Mitteilungen für TeamHub in den Einstellungen deines Handys oder Browsers.'),
    unsupported: t('Dieser Browser kann keine Mitteilungen. Alles Wichtige siehst du trotzdem auf „Heute“.'),
    'needs-install': t('Auf dem iPhone gehen Mitteilungen erst, wenn TeamHub auf dem Home-Bildschirm liegt.'),
  }
  if (!st) return <Card className="p-4 text-[15.5px] text-mute">…</Card>
  return (
    <Card className="p-4">
      <p className="text-[15.5px]">{info[st]}</p>
      <div className="mt-3 flex gap-2">
        {st === 'off' && <button disabled={busy} onClick={async () => { setBusy(true); const r = await enablePush(me.id); setBusy(false); refresh(); if (r === 'on') toast(t('Mitteilungen eingeschaltet')); if (r === 'denied') setMsg(t('Du hast Mitteilungen abgelehnt.')) }} className="h-10 px-4 rounded-full bg-olive-700 text-white text-[15.5px] disabled:opacity-60">{t('Einschalten')}</button>}
        {st === 'on' && <><button disabled={busy} onClick={async () => { setBusy(true); const ok = await testPush(); setBusy(false); setMsg(ok ? t('Probe-Mitteilung ist unterwegs.') : t('Konnte keine Probe senden.')) }} className="h-10 px-4 rounded-full bg-white border border-sage-200 text-[15.5px]">{t('Probe senden')}</button>
          <button onClick={async () => { await disablePush(); refresh(); toast(t('Mitteilungen ausgeschaltet')) }} className="h-10 px-4 rounded-full text-[15.5px] text-mute">{t('Ausschalten')}</button></>}
      </div>
      {msg && <p className="mt-2 text-[14.5px] text-mute">{msg}</p>}
    </Card>
  )
}
function Install() {
  const { t } = useApp()
  const [st, refresh] = usePush()
  const standalone = isStandalone(), ios = isIOS(), android = isAndroid()
  const Step = ({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) => (
    <div className="flex gap-3 items-start px-4 py-3.5"><span className="w-7 h-7 rounded-full bg-sage-50 text-sage-800 text-[14.5px] font-medium flex items-center justify-center shrink-0">{n}</span><span className="flex-1 text-[17px]">{children}</span><span className="text-sage-800">{icon}</span></div>
  )
  return (
    <div className="pb-10"><Title sub={t('In zwei Minuten erledigt')}>{t('TeamHub aufs Handy')}</Title>
      <div className="px-5 space-y-3">
        <Card className="p-4 flex items-center gap-3"><span className={`w-8 h-8 rounded-full flex items-center justify-center ${standalone ? 'bg-sage-600 text-white' : 'bg-sage-50 text-sage-800'}`}>{standalone ? <Check size={15} /> : 1}</span><span className="flex-1 text-[17px]">{standalone ? t('Liegt auf dem Home-Bildschirm') : t('Auf den Home-Bildschirm legen')}</span></Card>
        {!standalone && <List>
          {ios ? <>
            <Step n={1} icon={<Share size={18} />}><Rich text={t('In Safari unten auf **Teilen** tippen')} /></Step>
            <Step n={2} icon={<PlusSquare size={18} />}><Rich text={t('**Zum Home-Bildschirm** wählen, dann **Hinzufügen**')} /></Step>
            <Step n={3} icon={<Smartphone size={18} />}>{t('TeamHub über das neue Symbol öffnen und hier Mitteilungen einschalten')}</Step>
          </> : android ? <>
            {canPromptInstall() && <div className="p-4"><Btn onClick={async () => { await promptInstall(); refresh() }}>{t('App installieren')}</Btn></div>}
            <Step n={1} icon={<MoreVertical size={18} />}><Rich text={t('In Chrome oben rechts auf das **Menü** tippen')} /></Step>
            <Step n={2} icon={<PlusSquare size={18} />}><Rich text={t('**App installieren** bzw. **Zum Startbildschirm hinzufügen**')} /></Step>
            <Step n={3} icon={<Smartphone size={18} />}>{t('TeamHub über das neue Symbol öffnen')}</Step>
          </> : <Step n={1} icon={<Smartphone size={18} />}>{t('Öffne diese Seite auf deinem Handy: iPhone mit Safari, Android mit Chrome.')}</Step>}
        </List>}
        <Card className="p-4 flex items-center gap-3"><span className={`w-8 h-8 rounded-full flex items-center justify-center ${st === 'on' ? 'bg-sage-600 text-white' : 'bg-sage-50 text-sage-800'}`}>{st === 'on' ? <Check size={15} /> : 2}</span><span className="flex-1 text-[17px]">{t('Mitteilungen einschalten')}</span></Card>
        <PushToggle />
        <p className="text-[13px] text-mute px-1">{t('Ohne Mitteilungen geht nichts verloren: Pflicht-News und Aufgaben stehen immer auf „Heute“. Deine Respo sieht im Backoffice, wer startklar ist.')}</p>
      </div>
    </div>
  )
}
