import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  Home, ListChecks, BookOpen, LayoutGrid, Sparkles, ChevronLeft, ChevronRight, Check, Camera, MapPin, Users,
  Search, Lightbulb, AlertTriangle, CalendarDays, Send, Newspaper, Plane, Play, Video,
  ArrowUp, ArrowUpRight, LogOut, Phone, ArrowBigUp, GraduationCap, Link2, Lock, FileText, Smartphone, Share, PlusSquare, MoreVertical, ExternalLink, Monitor,
  TrendingUp, MessageCircle, Clock, Share2, Circle, ShieldAlert, Mail,
} from 'lucide-react'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { phorest, type MyDay, type StaffWeek, type ClientHit, type ClientHistory } from './lib/phorest'
import { pushState, enablePush, disablePush, testPush, reportDevice, isStandalone, isIOS, isAndroid, canPromptInstall, promptInstall, type PushState } from './lib/push'
import { useApp, isoDay, addDays, zurichHour, type Lang, type News, type WikiArticle, type WikiBlock, type Staff } from './store'
import { Terminbuch, EventCalendar } from './Calendar'
import { TONE, toneOf, type Tone } from './tones'
import { tr, locale } from './lib/i18n'
import { emojiOf, AREAS, areaOf } from './lib/wiki'
import { wikiProgress } from './lib/wiki-progress'
import { ChatHub, ChatRoom, useChatUnread, loadChatSummaries } from './Chats'
import { TimeView } from './Time'
import { Inbox, MailRead, useMailUnread, type MailItem } from './Mail'
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

// Name des KI-Reiters (im Vertrag „Marc Beau“, im abgestimmten Prototyp „Marc“)
export const ASSISTANT = 'Marc'

type Tab = 'home' | 'tasks' | 'ai' | 'wiki' | 'menu'
type Sub = null | { k: 'news-list' } | { k: 'news'; item: News } | { k: 'wiki'; item: WikiArticle } | { k: 'wiki-cat'; key: string; name: string } | { k: 'onboarding' } | { k: 'team' } | { k: 'profile'; item: Staff }
  | { k: 'me' } | { k: 'conn' } | { k: 'book' } | { k: 'tickets'; learning?: boolean } | { k: 'ticket'; id: string } | { k: 'clients'; cid?: string } | { k: 'events' } | { k: 'inbox' } | { k: 'time' } | { k: 'install' } | { k: 'perf' }
  | { k: 'marc' } | { k: 'chat'; id: string } | { k: 'area'; key: string } | { k: 'mail'; uid: number; item?: MailItem }


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
    {icon && <span className="min-w-6 flex items-center justify-center text-olive-700 shrink-0">{icon}</span>}
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
  const stackRef = useRef(stack); stackRef.current = stack
  const chatUnread = useChatUnread()
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
    else if (o === 'home' || o === 'ai' || o === 'wiki' || o === 'menu' || o === 'chats') go(o === 'chats' ? 'ai' : o)
    else if (o === 'benni' || o === 'marc') { go('ai'); open({ k: 'marc' }) }
    else if (o === 'onboarding' || o === 'book' || o === 'me' || o === 'team' || o === 'install' || o === 'news-list' || o === 'conn' || o === 'time' || o === 'inbox') open({ k: o })
    else if (o === 'clients') open({ k: 'clients' })
  }
  // „Mit Marc lernen“ aus dem Onboarding: in den Marc-Reiter wechseln, die Frage stellt der Reiter selbst
  useEffect(() => { const f = () => { if (stackRef.current[stackRef.current.length - 1]?.k !== 'marc') { go('ai'); open({ k: 'marc' }) } }; window.addEventListener('th-benni', f); return () => window.removeEventListener('th-benni', f) }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
    case 'profile': screen = <Profile s={sub.item} open={open} />; break
    case 'me': screen = <MyProfile />; break
    case 'tickets': screen = <Tickets open={open} learning={sub.learning} />; break
    case 'marc': screen = <AI open={open} onBack={back} />; break
    case 'chat': screen = <ChatRoom id={sub.id} onBack={back} />; break
    case 'area': screen = <WikiArea k={sub.key} open={open} />; break
    case 'ticket': screen = <TicketDetail id={sub.id} />; break
    case 'clients': screen = <ClientHistoryView cid={sub.cid} />; break
    case 'events': screen = <Events />; break
    case 'conn': screen = <Connections />; break
    case 'book': screen = <div className="px-5 pb-4 h-[calc(100dvh-150px)] md:h-[calc(100dvh-110px)]"><h1 className="text-[26px] font-medium tracking-tight mb-3">{t('Kundentermine')}</h1><Terminbuch compact /></div>; break
    case 'inbox': screen = <Inbox onOpen={(uid, item) => open({ k: 'mail', uid, item })} />; break
    case 'mail': screen = <MailRead uid={sub.uid} item={sub.item} />; break
    case 'time': screen = <TimeView />; break
    case 'install': screen = <Install />; break
    case 'perf': screen = <MyPerformance />; break
    default:
      screen = tab === 'home' ? <Today open={open} go={go} /> : tab === 'tasks' ? <Tasks open={open} /> : tab === 'ai' ? <ChatHub onOpenMarc={() => open({ k: 'marc' })} onOpenRoom={id => open({ k: 'chat', id })} />
        : tab === 'wiki' ? <Wiki open={open} /> : <MenuView open={open} onLogout={onLogout} />
  }
  const key = (sub ? sub.k + ('item' in sub ? String((sub.item as { id?: string }).id) : '') : tab) + stack.length
  // Chats (Team + Marc angeheftet) statt eines eigenen Marc-Reiters, Fokus auf Austausch im Team (Inhaberin 21.10.)
  const nav: [Tab, string, typeof Home][] = [['home', 'Heute', Home], ['tasks', 'Aufgaben', ListChecks], ['ai', 'Chats', MessageCircle], ['wiki', 'Wissen', BookOpen], ['menu', 'Menü', LayoutGrid]]
  const full = !loading && (sub?.k === 'marc' || sub?.k === 'chat')
  return (
    <div className="flex-1 min-h-0 flex">
      {/* Desktop: Navigation als Seitenleiste wie im Backoffice, zuklappbar */}
      <div className="hidden md:flex">
        <SideNav
          items={nav.map(([x, label, Icon]) => ({ key: x, label: t(label), active: tab === x && (!sub || x === 'ai' && (sub.k === 'marc' || sub.k === 'chat')), dot: (x === 'home' && mustOpen > 0) || (x === 'ai' && chatUnread > 0), onClick: () => go(x),
            icon: <Icon size={18} strokeWidth={1.6} /> }))}
          extra={onSwitch ? [{ key: 'switch', label: t('Büro-Backoffice'), icon: <Monitor size={18} strokeWidth={1.6} />, onClick: onSwitch }] : []}
          onProfile={() => open({ k: 'me' })} profileActive={sub?.k === 'me'} onLogout={onLogout} />
      </div>
      <div className="relative flex-1 min-w-0 flex flex-col">
        {/* Marc und Team-Chats füllen die ganze Fläche und scrollen selbst (Eingabe unten) */}
        <div ref={scroller} className={`flex-1 no-scrollbar bg-sage-50 ${full ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {full ? screen : (
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
            const on = tab === x && (!sub || x === 'ai' && (sub.k === 'marc' || sub.k === 'chat'))
            return (
              <button key={x} onClick={() => go(x)} className={`relative flex flex-col items-center gap-1 py-1 text-[12px] ${on ? 'text-olive-800' : 'text-mute'}`}>
                <Icon size={22} strokeWidth={on ? 2.2 : 1.7} />{t(label)}
                {((x === 'home' && mustOpen > 0) || (x === 'ai' && chatUnread > 0)) && <span className={`absolute top-0.5 right-[28%] w-2 h-2 rounded-full ${x === 'ai' ? 'bg-duty' : 'bg-brass'}`} />}
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
  const { me, t, done, read, tasks, news: allNews, quizzes, branches, photo, wiki, tickets } = useApp()
  const news = live(allNews)
  const day = useMyDay()
  const due = useDue()
  const runs = useWikiRuns()
  const pop = usePopular()
  const myTodos = useTodos().filter(x => isForMe(x, me) && !x.done_at)
  const doneN = tasks.filter(x => done.has(x.id)).length
  const next = tasks.find(x => !done.has(x.id))
  const must = news.filter(n => n.mustRead && !read.has(n.id))
  const shift = day?.shifts?.[0]
  const shiftText = day?.shifts?.length ? day.shifts.map(s => `${s.start} – ${s.end}`).join(' · ') : ''
  const shiftStudio = [...new Set((day?.shifts ?? []).map(s => branches.find(b => b.id === s.branch_id)?.name ?? me.branch))].join(', ') || me.branch
  const dateLabel = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const hour = zurichHour()
  const hello = hour < 11 ? t('Guten Morgen') : hour < 17 ? t('Hallo') : t('Guten Abend')
  // Fokus der Startseite (Inhaberin 21.10.): News, Listen, Wissen, Chats und Lernen voneinander; Termine bleiben in Phorest
  const articles = wiki.filter(a => a.published && !a.fromNews)
  const readN = articles.filter(a => runs.read.has(a.id)).length
  const nextRead = [...articles].filter(a => !runs.read.has(a.id)).sort((x, y) => (pop.get(y.id) ?? 0) - (pop.get(x.id) ?? 0) || Number(areaOf(y.catKey, y.title) === 'behandlung') - Number(areaOf(x.catKey, x.title) === 'behandlung'))[0]
  const learning = tickets.find(x => x.kind === 'Learning')
  const mailUnread = useMailUnread()
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
          {day?.mapped && <p className="text-[16px] mt-0.5">{shift ? t('Schicht {time}', { time: shiftText }) : t('Heute frei')}</p>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {tile('done', `${doneN}/${tasks.length}`, t('Checkliste'), () => { tasksView = 'studio'; go('tasks') })}
        {tile(must.length ? 'duty' : 'done', String(must.length), t('Pflicht offen'), () => must[0] ? open({ k: 'news', item: must[0] }) : open({ k: 'news-list' }))}
        {tile('learn', `${pct(readN, articles.length)} %`, t('Wissen gelesen'), () => go('wiki'))}
      </div>
      {/* Postfach und Zeiterfassung direkt erreichbar (Inhaberin 21.10.) */}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button onClick={() => open({ k: 'inbox' })} className="rounded-[18px] bg-white p-3 flex items-center gap-2.5 text-left min-w-0">
          <span className={`w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0 ${TONE.studio.bg} ${TONE.studio.fg}`}><Mail size={18} /></span>
          <span className="min-w-0"><span className="block text-[15.5px] font-semibold whitespace-nowrap">{t('Posteingang')}</span><span className={`block text-[13.5px] ${mailUnread ? 'text-duty font-semibold' : 'text-mute'}`}>{mailUnread ? t('{n} ungelesen', { n: mailUnread }) : t('Firmen-Mails')}</span></span>
        </button>
        <button onClick={() => open({ k: 'time' })} className="rounded-[18px] bg-white p-3 flex items-center gap-2.5 text-left min-w-0">
          <span className={`w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0 ${TONE.learn.bg} ${TONE.learn.fg}`}><Clock size={18} /></span>
          <span className="min-w-0"><span className="block text-[15.5px] font-semibold whitespace-nowrap">{t('Zeit & Ferien')}</span><span className="block text-[13.5px] text-mute">{t('Stempeln, Ferien')}</span></span>
        </button>
      </div>

      <ReadyCard open={open} />
      <StandbyAsk />

      {must.length > 0 && <>
        <Label action={<span className="text-[13px] text-mute tabular-nums">{t('{n} offen', { n: must.length })}</span>}>{t('Bitte lesen')}</Label>
        <div className="space-y-3">{must.slice(0, 2).map(n => <NewsCard key={n.id} n={n} onClick={() => open({ k: 'news', item: n })} />)}</div>
        {must.length > 2 && <button onClick={() => open({ k: 'news-list' })} className="mt-2 w-full h-11 rounded-[14px] bg-white text-[15.5px] font-medium">{t('Alle {n} anzeigen', { n: must.length })}</button>}
        {must.some(n => quizzes.some(q => q.newsId === n.id)) && <p className="mt-2 px-1 text-[14px] text-mute">{t('Bei manchen News folgt ein kurzes Quiz.')}</p>}
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
          <Bar value={doneN} total={tasks.length} />
          <p className="mt-3 text-[16px]">{t('Als Nächstes:')} <span className="font-semibold">{next.title}</span>{next.time && <span className="text-mute"> · {next.time}</span>}</p>
        </Card>
      </>}

      <TodayChats go={go} open={open} />

      {nextRead && <>
        <Label action={<button onClick={() => go('wiki')} className="text-[14.5px] text-sage-800">{t('Wissen')}</button>}>{t('Weiterlernen')}</Label>
        <button onClick={() => open({ k: 'wiki', item: nextRead })} className="w-full rounded-[20px] bg-white p-4 flex items-center gap-3.5 text-left">
          <span className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${TONE.learn.bg} ${TONE.learn.fg}`}><BookOpen size={22} /></span>
          <span className="flex-1 min-w-0"><span className="block text-[17px] font-semibold leading-snug">{nextRead.title}</span><span className="block text-[14.5px] text-mute mt-0.5">{catName(nextRead.cat)} · {t('{n} Min.', { n: nextRead.minutes })}</span></span>
          <ChevronRight size={18} className="text-sage-400 shrink-0" />
        </button>
      </>}

      {learning && <>
        <Label action={<button onClick={() => open({ k: 'tickets', learning: true })} className="text-[14.5px] text-sage-800">{t('Alle')}</button>}>{t('Von Kolleginnen geteilt')}</Label>
        <button onClick={() => open({ k: 'tickets', learning: true })} className="w-full rounded-[20px] bg-white overflow-hidden text-left">
          {learning.photo && learning.mediaKind !== 'video' && <img src={learning.photo} alt="" className="w-full h-[150px] object-cover" />}
          <span className="block p-4"><span className="block text-[14px] text-mute">{learning.who} · {learning.branch}{learning.mediaKind === 'video' && learning.photo ? ` · ${t('Video')}` : ''}</span><span className="block text-[17px] mt-1 leading-snug">{learning.title}</span></span>
        </button>
      </>}

      {news.filter(n => !n.mustRead).length > 0 && <>
        <Label action={<button onClick={() => open({ k: 'news-list' })} className="text-[14.5px] text-sage-800">{t('Alle')}</button>}>{t('News')}</Label>
        <div className="space-y-3">{news.filter(n => !n.mustRead).slice(0, 2).map(n => <NewsCard key={n.id} n={n} onClick={() => open({ k: 'news', item: n })} />)}</div>
      </>}
    </div>
  )
}
/** Die letzten Team-Chats auf der Startseite */
function TodayChats({ go, open }: { go: (t: Tab) => void; open: (s: Sub) => void }) {
  const { me, staff, t } = useApp()
  const [list, setList] = useState<Awaited<ReturnType<typeof loadChatSummaries>> | null>(null)
  useEffect(() => { loadChatSummaries(me.id).then(setList) }, [me.id])
  const recent = (list ?? []).filter(x => x.last).sort((a, b) => b.last!.created_at.localeCompare(a.last!.created_at)).slice(0, 3)
  return <>
    <Label action={<button onClick={() => go('ai')} className="text-[14.5px] text-sage-800">{t('Alle Chats')}</button>}>{t('Chats')}</Label>
    <List>
      {recent.length === 0 && <button onClick={() => go('ai')} className="w-full px-4 py-3.5 flex items-center gap-3 text-left"><span className="w-10 h-10 rounded-full bg-studio-50 text-studio flex items-center justify-center shrink-0"><MessageCircle size={18} /></span><span className="flex-1 text-[16px] text-ink/80">{t('Schreib deinem Studio oder dem ganzen Team.')}</span><ChevronRight size={18} className="text-sage-400" /></button>}
      {recent.map(x => { const who = staff.find(s => s.id === x.last!.sender_id), other = staff.find(s => s.id === x.members.find(m => m !== me.id))
        return <button key={x.room.id} onClick={() => { go('ai'); open({ k: 'chat', id: x.room.id }) }} className="w-full px-4 py-3 flex items-center gap-3 text-left">
          {who ? <Avatar s={who} photo={who.photo} size="w-10 h-10" /> : <span className="w-10 h-10 rounded-full bg-studio-50" />}
          <span className="flex-1 min-w-0"><span className={`block text-[16px] truncate ${x.unread ? 'font-semibold' : ''}`}>{x.room.kind === 'team' ? t('Ganzes Team') : x.room.kind === 'studio' ? t('Studio {name}', { name: x.room.title ?? '' }) : x.room.title || (other ? `${other.first} ${other.last}` : t('Chat'))}</span>
            <span className="block text-[14.5px] text-mute truncate">{who && x.last!.sender_id !== me.id ? who.first + ': ' : ''}{x.last!.body}</span></span>
          {x.unread && <span className="w-2.5 h-2.5 rounded-full bg-duty shrink-0" />}
        </button> })}
    </List>
  </>
}

/* ---------- News ---------- */
// Kategorien wie von der Inhaberin gewünscht; „Wichtig“ umfasst auch jede Pflicht-News
export const NEWS_CATS = ['Wichtig', 'Schulung', 'Team', 'Salon']
export const newsCat = (n: News) => n.mustRead ? 'Wichtig' : NEWS_CATS.includes(n.tag) ? n.tag : n.tag === 'Studio' || n.tag === 'Marketing' ? 'Salon' : n.tag
// Ohne eigenes Bild: Foto aus den Studios, damit jede Karte gleich gross bleibt
export const newsPhoto = (n: News) => n.image ?? (newsCat(n) === 'Team' ? '/login-studio.webp' : newsCat(n) === 'Salon' ? '/hero-empfang.jpg' : '/hero-studio.jpg')
const newsWhen = (iso: string, t: (s: string) => string) => {
  const d = new Date(iso), today = isoDay(), day = isoDay(d)
  const time = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(d)
  return day === today ? `${t('Heute')}, ${time}` : day === addDays(-1, today) ? `${t('Gestern')}, ${time}` : new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', day: 'numeric', month: 'short' }).format(d)
}
/** Bestätigungsstand der Pflicht-News („8 von 12“), für alle sichtbar ohne Namen */
let progressCache: Map<string, { confirmed: number; total: number }> | null = null
function useNewsProgress() {
  const [p, setP] = useState(progressCache ?? new Map<string, { confirmed: number; total: number }>())
  const { read } = useApp()
  useEffect(() => { supabase?.rpc('news_progress').then(({ data }) => { progressCache = new Map(((data ?? []) as { news_id: string; confirmed: number; total: number }[]).map(r => [r.news_id, { confirmed: r.confirmed, total: r.total }])); setP(progressCache) }) }, [read.size])
  return p
}
/** News als grosse Bildkarte (Vorlage der Inhaberin 20.10.): Etikett, Zeit, Titel, Kurztext, bei Pflicht der Bestätigungsstand */
function NewsCard({ n, onClick }: { n: News; onClick: () => void }) {
  const { read, t } = useApp()
  const prog = useNewsProgress().get(n.id)
  const cat = newsCat(n), tone = TONE[toneOf(cat, n.mustRead)]
  const mine = read.has(n.id)
  return (
    <button onClick={onClick} className="w-full text-left rounded-[22px] bg-white overflow-hidden shadow-[0_1px_2px_rgba(29,34,28,.05)]">
      <div className="relative h-[176px] bg-sage-100">
        <img src={newsPhoto(n)} alt="" className={`w-full h-full object-cover ${n.image ? '' : 'saturate-[.85]'}`} />
        <span className={`absolute left-3 top-3 px-3 py-1 rounded-full text-[14px] font-semibold text-white ${tone.solid}`}>{t(cat)}</span>
        <span className="absolute right-3 bottom-3 px-2.5 py-1 rounded-full bg-ink/70 text-white text-[13.5px] flex items-center gap-1.5"><Clock size={13} />{newsWhen(n.publishAt, t)}</span>
      </div>
      <div className="p-4">
        <p className="font-display text-[22px] leading-snug">{n.title}</p>
        {n.teaser && <p className="mt-1 text-[16px] text-ink/70 leading-snug line-clamp-2">{n.teaser}</p>}
        {n.mustRead && <div className="mt-3.5 pt-3 border-t border-line">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[14.5px]"><span className="text-ink/70">{t('Bestätigt')}</span>{prog && <span className="text-mute tabular-nums">{t('{a} von {b}', { a: prog.confirmed, b: prog.total })}</span>}</div>
              <div className="mt-1.5 h-2 rounded-full bg-sage-100 overflow-hidden"><div className="h-full rounded-full bg-done transition-all" style={{ width: (prog && prog.total ? Math.min(100, prog.confirmed / prog.total * 100) : 0) + '%' }} /></div>
            </div>
            {mine ? <span className={`shrink-0 h-8 px-3 rounded-full text-[14px] font-semibold flex items-center gap-1 ${TONE.done.bg} ${TONE.done.fg}`}><Check size={14} />{t('Bestätigt')}</span>
              : <span className={`shrink-0 h-8 px-3 rounded-full text-[14px] font-semibold flex items-center gap-1 ${TONE.duty.bg} ${TONE.duty.fg}`}>{t('Offen')}</span>}
          </div>
        </div>}
      </div>
    </button>
  )
}
function NewsList({ open }: { open: (s: Sub) => void }) {
  const { t, news: allNews } = useApp()
  const news = live(allNews)
  const [f, setF] = useState('Alle')
  const shown = news.filter(n => f === 'Alle' || newsCat(n) === f)
  return (
    <div className="pb-10"><Title>{t('News')}</Title>
      <div className="px-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          {['Alle', ...NEWS_CATS].map(x => { const tone = TONE[toneOf(x)]
            return <button key={x} onClick={() => setF(x)} className={`shrink-0 px-4 h-10 rounded-full text-[15.5px] font-medium transition ${f === x ? 'bg-olive-800 text-white' : x === 'Alle' ? 'bg-white text-ink' : `${tone.bg} ${tone.fg}`}`}>{t(x)}</button> })}
        </div>
        <div className="mt-4 space-y-4">{shown.map(n => <NewsCard key={n.id} n={n} onClick={() => open({ k: 'news', item: n })} />)}</div>
        {shown.length === 0 && <p className="mt-6 text-[15.5px] text-mute">{t('Gerade keine News in dieser Kategorie.')}</p>}
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
      <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${TONE[toneOf(newsCat(n), n.mustRead)].bg} ${TONE[toneOf(newsCat(n), n.mustRead)].fg}`}>{t(newsCat(n))}</span>{n.mustRead && <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${TONE.duty.bg} ${TONE.duty.fg}`}>{t('Pflicht')}</span>}<span className="text-[14px] text-mute">{n.audience} · {n.date}</span></div>
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
    // Offenes oben, Erledigtes rutscht nach unten (Wunsch der Inhaberin 22.10.); fertige Listen ganz ans Ende
    const sorted = [...items].sort((a, b) => Number(done.has(a.id)) - Number(done.has(b.id)))
    return { g, items: sorted, sub: [when, span].filter(Boolean).join(' · '), finished: items.every(i => done.has(i.id)) }
  }).sort((a, b) => Number(a.finished) - Number(b.finished))
  const total = tasks.length, n = tasks.filter(x => done.has(x.id)).length
  const next = tasks.find(x => !done.has(x.id))
  const nowHM = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date())
  // Wo nachlesen, was genau verlangt ist: Artikel im Wissen oder Link (Video, How-to)
  const guide = (x: typeof tasks[number]) => { const a = x.articleId ? wiki.find(w => w.id === x.articleId) : undefined
    if (a) return { go: () => open({ k: 'wiki', item: a }), video: a.mediaKind === 'video' || a.mediaKind === 'youtube' }
    if (x.linkUrl) return { go: () => window.open(x.linkUrl!, '_blank', 'noopener'), video: /youtu|vimeo|\.mp4|video/i.test(x.linkUrl) }
    return null }
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
                      {guide(x) && <button onClick={guide(x)!.go} className="mt-1.5 h-8 px-3 rounded-full bg-studio-50 text-studio text-[14px] font-medium inline-flex items-center gap-1.5">{guide(x)!.video ? <Play size={13} /> : <BookOpen size={13} />}{guide(x)!.video ? t('Video ansehen') : t('So geht es')}<ArrowUpRight size={13} /></button>}
                    </div>
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
function AI({ open, onBack }: { open: (s: Sub) => void; onBack?: () => void }) {
  const { wiki } = useApp()
  return <BenniChat variant="app" onBack={onBack} onOpenArticle={id => { const a = wiki.find(x => x.id === id); if (a) open({ k: 'wiki', item: a }) }} onOpenClient={cid => open({ k: 'clients', cid })} />
}
/* ---------- Wissen ---------- */
// Jede Kategorie bekommt ein Emoji statt eines Fotos: einheitlich, ruhig, auch ohne Bilder im Artikel (Standard in lib/wiki, Büro kann es ändern)
const catName = (name: string) => name.slice(0, 1).toUpperCase() + name.slice(1)
// Statt des Buchs das Zeichen des Hauptbereichs, zu dem der Artikel gehört (Wunsch der Inhaberin 22.10.)
const articleIcon = (a: WikiArticle) => { if (a.fromNews) return <Newspaper size={17} />
  const look = AREA_LOOK[areaOf(a.catKey, a.title)] ?? AREA_LOOK.studio, Icon = look.icon
  return <span className={`w-9 h-9 rounded-[11px] flex items-center justify-center ${TONE[look.tone].bg} ${TONE[look.tone].fg}`}><Icon size={17} /></span> }
// Suche im Wissen mit Marc daneben: wer nichts findet, fragt ihn direkt
function WikiSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { t } = useApp()
  return <div className="flex gap-2"><div className="flex-1 min-w-0"><SearchBox value={value} onChange={onChange} placeholder={placeholder} /></div>
    <button onClick={() => openNewBenniChat(value.trim() ? t('Ich suche im Wissen nach „{q}“. Welche Anleitung passt und was steht drin?', { q: value.trim() }) : t('Ich suche eine Anleitung im Wissen.'))} className={`h-11 px-3.5 rounded-2xl font-semibold flex items-center gap-1.5 shrink-0 ${TONE.note.bg} ${TONE.note.fg}`}><MessageCircle size={17} />Marc</button></div>
}
// Treffer: Titel zuerst, dann alles aus dem passenden Thema oder Bereich, dann Treffer im Text
const wikiHits = (list: WikiArticle[], q: string) => { const x = q.trim().toLowerCase(); if (!x) return list
  const areaName = (a: WikiArticle) => AREAS.find(r => r.key === areaOf(a.catKey, a.title))?.name ?? ''
  const rank = (a: WikiArticle) => a.title.toLowerCase().includes(x) ? 0 : `${a.cat} ${areaName(a)}`.toLowerCase().includes(x) ? 1 : [a.intro, ...a.tags, ...a.body].join(' ').toLowerCase().includes(x) ? 2 : 3
  return list.map(a => [a, rank(a)] as const).filter(([, r]) => r < 3).sort((a, b) => a[1] - b[1] || a[0].title.localeCompare(b[0].title)).map(([a]) => a) }

// Beliebteste Artikel (Öffnungen der letzten 30 Tage, Tabelle wiki_views)
function usePopular() {
  const [pop, setPop] = useState<Map<string, number>>(new Map())
  useEffect(() => { supabase?.rpc('popular_articles', { p_days: 30 }).then(({ data }) => setPop(new Map(((data ?? []) as { article_id: string; views: number }[]).map(r => [r.article_id, Number(r.views)])))) }, [])
  return pop
}
// Eigener Fortschritt im Wissen: „gelesen & bestätigt“ oder ein Durchgang gemacht (Tabelle wiki_runs).
// Artikel mit Test gelten erst nach bestandenem Test als gelesen (Wunsch der Inhaberin 22.10.), das trägt der Test ein.
const reloadRuns = () => window.dispatchEvent(new Event('th-wiki-runs'))
function useWikiRuns() {
  const { me, quizzes, attempts } = useApp()
  const [v, setV] = useState<{ employeeId: string; rows: { article_id: string; kind: string }[] }>({ employeeId: '', rows: [] })
  useEffect(() => {
    let active = true
    const load = () => { supabase?.from('wiki_runs').select('article_id, kind').eq('employee_id', me.id).then(({ data }) => {
      if (active) setV({ employeeId: me.id, rows: data ?? [] })
    }) }
    load(); window.addEventListener('th-wiki-runs', load); return () => { active = false; window.removeEventListener('th-wiki-runs', load) }
  }, [me.id])
  return useMemo(() => wikiProgress(v.employeeId === me.id ? v.rows : [], quizzes, attempts, me.id), [v, quizzes, attempts, me.id])
}
export const AREA_LOOK: Record<string, { tone: Tone; icon: typeof Home }> = {
  behandlung: { tone: 'learn', icon: Sparkles }, hygiene: { tone: 'duty', icon: ShieldAlert }, studio: { tone: 'note', icon: LayoutGrid },
  team: { tone: 'plum', icon: Users }, lernen: { tone: 'done', icon: GraduationCap },
}
const Bar = ({ value, total, tone = 'done' }: { value: number; total: number; tone?: Tone }) => (
  <div className="h-2 rounded-full bg-sage-100 overflow-hidden"><div className={`h-full rounded-full transition-all ${TONE[tone].solid}`} style={{ width: (total ? Math.min(100, value / total * 100) : 0) + '%' }} /></div>
)
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0

function Wiki({ open }: { open: (s: Sub) => void }) {
  const { t, wiki: allWiki, steps, obDone, tickets } = useApp()
  const wiki = allWiki.filter(a => a.published && !a.fromNews)
  const pop = usePopular()
  const { read } = useWikiRuns()
  const [q, setQ] = useState('')
  const areas = AREAS.map(ar => {
    const items = wiki.filter(a => areaOf(a.catKey, a.title) === ar.key)
    const cats = [...items.reduce((m, a) => m.set(a.cat, (m.get(a.cat) ?? 0) + 1), new Map<string, number>()).entries()].sort((x, y) => y[1] - x[1]).map(([c]) => c)
    return { ...ar, items, cats, done: items.filter(a => read.has(a.id)).length }
  }).filter(ar => ar.items.length)
  const doneAll = wiki.filter(a => read.has(a.id)).length
  const popular = [...wiki].filter(a => (pop.get(a.id) ?? 0) > 0).sort((x, y) => (pop.get(y.id) ?? 0) - (pop.get(x.id) ?? 0)).slice(0, 5)
  const learnings = tickets.filter(x => x.kind === 'Learning')
  const hits = wikiHits(allWiki.filter(a => a.published), q)
  return (
    <div className="pb-10"><Title right={<button onClick={() => open({ k: 'tickets', learning: true })} className={`mb-1 h-10 px-3.5 rounded-full text-[15px] font-semibold flex items-center gap-1.5 ${TONE.note.bg} ${TONE.note.fg}`}><Share2 size={16} />{t('Wissen teilen')}</button>}>{t('Wissen')}</Title>
      <div className="px-4">
        <WikiSearch value={q} onChange={setQ} placeholder={t('In allen Anleitungen suchen …')} />
        {!q && <>
          <div className="mt-4 rounded-[20px] bg-white p-4">
            <div className="flex items-baseline justify-between"><p className="text-[17px] font-semibold">{t('Dein Fortschritt')}</p><p className="font-display text-[22px] tabular-nums">{pct(doneAll, wiki.length)} %</p></div>
            <div className="mt-2"><Bar value={doneAll} total={wiki.length} /></div>
            <p className="mt-2 text-[14.5px] text-mute">{t('{a} von {b} Artikeln gelesen und bestätigt', { a: doneAll, b: wiki.length })}</p>
          </div>
          <button onClick={() => open({ k: 'tickets', learning: true })} className={`mt-3 w-full rounded-[20px] p-4 flex items-center gap-3 text-left ${TONE.note.bg}`}>
            <span className="w-12 h-12 rounded-[14px] bg-white/70 text-note flex items-center justify-center shrink-0"><Lightbulb size={22} /></span>
            <span className="flex-1 min-w-0"><span className={`block text-[17px] font-semibold ${TONE.note.fg}`}>{t('Von Kolleginnen geteilt')}</span><span className="block text-[14.5px] text-ink/70 mt-0.5">{learnings.length === 1 ? t('1 Tipp aus den Studios') : learnings.length ? t('{n} Tipps und Videos aus den Studios', { n: learnings.length }) : t('Teile ein Video oder einen Tipp aus deinem Alltag')}</span></span>
            <ChevronRight size={18} className="text-note shrink-0" />
          </button>
          {steps.length > 0 && <button onClick={() => open({ k: 'onboarding' })} className="mt-3 w-full rounded-[20px] bg-white p-4 text-left">
            <span className="flex items-center gap-3"><span className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${TONE.learn.bg} ${TONE.learn.fg}`}><GraduationCap size={22} /></span>
              <span className="flex-1 min-w-0"><span className="block text-[17px] font-semibold">{t('Onboarding für Neue')}</span><span className="block text-[14.5px] text-mute mt-0.5">{t('{d} von {n} Schritten erledigt', { n: steps.length, d: steps.filter(x => obDone.has(x.id)).length })}</span></span>
              <ChevronRight size={18} className="text-sage-400 shrink-0" /></span>
            <span className="block mt-3"><Bar value={steps.filter(x => obDone.has(x.id)).length} total={steps.length} tone="learn" /></span>
          </button>}
          <Label action={<span className="text-[13px] text-mute">{t('{n} Bereiche', { n: areas.length })}</span>}>{t('Hauptbereiche')}</Label>
          <div className="space-y-3">{areas.map(ar => { const look = AREA_LOOK[ar.key], Icon = look.icon
            return <button key={ar.key} onClick={() => open({ k: 'area', key: ar.key })} className="w-full rounded-[20px] bg-white p-4 text-left">
              <span className="flex items-start gap-3.5">
                <span className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${TONE[look.tone].bg} ${TONE[look.tone].fg}`}><Icon size={22} /></span>
                <span className="flex-1 min-w-0"><span className="block text-[18px] font-semibold leading-tight">{t(ar.name)}</span><span className="block text-[15px] text-mute mt-0.5 leading-snug">{t(ar.desc)}</span></span>
                <ChevronRight size={18} className="text-sage-400 shrink-0 mt-1" />
              </span>
              <span className="mt-3 flex flex-wrap gap-1.5">{ar.cats.slice(0, 4).map(c => <span key={c} className="px-2.5 py-1 rounded-full bg-sage-50 text-[13.5px] text-ink/75">{catName(c)}</span>)}</span>
              <span className="mt-3 flex items-center gap-3"><span className="flex-1"><Bar value={ar.done} total={ar.items.length} /></span><span className="text-[14px] font-semibold tabular-nums">{pct(ar.done, ar.items.length)} %</span><span className="text-[13.5px] text-mute tabular-nums">{t('{a} von {b} gelesen', { a: ar.done, b: ar.items.length })}</span></span>
            </button> })}</div>
          {popular.length > 0 && <><Label>{t('Meistgelesen')}</Label>
            <List>{popular.map(a => <Row key={a.id} icon={articleIcon(a)} title={a.title} sub={`${catName(a.cat)} · ${t('{n} Min.', { n: a.minutes })}`} onClick={() => open({ k: 'wiki', item: a })} right={read.has(a.id) ? <Check size={18} className="text-done shrink-0" /> : undefined} />)}</List></>}
        </>}
        {q && <><Label>{t('{n} Treffer', { n: hits.length })}</Label>
          {hits.length > 0 && <List>{hits.slice(0, 60).map(a => <Row key={a.id} icon={articleIcon(a)} title={a.title} sub={`${catName(a.cat)} · ${t('{n} Min.', { n: a.minutes })}`} onClick={() => open({ k: 'wiki', item: a })} right={read.has(a.id) ? <Check size={18} className="text-done shrink-0" /> : undefined} />)}</List>}
          {hits.length === 0 && <p className="text-[15.5px] text-mute">{t('Nichts gefunden. Frag {name} oder schick eine Idee ans Büro.', { name: ASSISTANT })}</p>}
        </>}
      </div>
    </div>
  )
}

function WikiArea({ k, open }: { k: string; open: (s: Sub) => void }) {
  const { t, wiki } = useApp()
  const pop = usePopular()
  const { read, runs } = useWikiRuns()
  const ar = AREAS.find(x => x.key === k)!, look = AREA_LOOK[k], Icon = look.icon
  const items = wiki.filter(a => a.published && !a.fromNews && areaOf(a.catKey, a.title) === k)
  const cats = [...new Set(items.map(a => a.cat))].sort((x, y) => items.filter(a => a.cat === y).length - items.filter(a => a.cat === x).length)
  const [c, setC] = useState('Alle'), [q, setQ] = useState('')
  // Offenes oben, Gelesenes rutscht nach unten (Wunsch der Inhaberin 22.10.); innerhalb beliebteste zuerst
  const shown = wikiHits(items.filter(a => c === 'Alle' || a.cat === c), q).sort((x, y) => q.trim() ? 0 : (pop.get(y.id) ?? 0) - (pop.get(x.id) ?? 0) || x.title.localeCompare(y.title))
  const todo = shown.filter(a => !read.has(a.id)), have = shown.filter(a => read.has(a.id))
  const done = items.filter(a => read.has(a.id)).length
  const row = (a: WikiArticle) => { const n = runs.get(a.id) ?? 0
    return <Row key={a.id} icon={articleIcon(a)} title={a.title} sub={[catName(a.cat), t('{n} Min.', { n: a.minutes }), n ? t('{n}× durchgemacht', { n }) : ''].filter(Boolean).join(' · ')} onClick={() => open({ k: 'wiki', item: a })}
      right={read.has(a.id) ? <span className="w-6 h-6 rounded-full bg-done text-white flex items-center justify-center shrink-0"><Check size={14} strokeWidth={3} /></span> : <Circle size={22} className="text-sage-200 shrink-0" />} /> }
  return (
    <div className="pb-10 px-4">
      <div className={`mt-2 rounded-[22px] p-4 ${TONE[look.tone].bg}`}>
        <div className="flex items-center gap-3.5"><span className={`w-14 h-14 rounded-[16px] bg-white/70 flex items-center justify-center shrink-0 ${TONE[look.tone].fg}`}><Icon size={26} /></span>
          <div className="min-w-0"><h1 className={`font-display text-[25px] leading-tight ${TONE[look.tone].fg}`}>{t(ar.name)}</h1><p className="text-[15px] text-ink/70">{t(ar.desc)}</p></div></div>
        <div className="mt-4 flex items-center gap-3"><span className="flex-1"><Bar value={done} total={items.length} /></span><span className="text-[14.5px] font-semibold tabular-nums">{t('{a} von {b} gelesen', { a: done, b: items.length })}</span></div>
      </div>
      <div className="mt-4"><WikiSearch value={q} onChange={setQ} placeholder={t('Hier suchen …')} /></div>
      {cats.length > 1 && <div className="mt-3"><Chips items={['Alle', ...cats]} value={c} onChange={setC} label={x => x === 'Alle' ? t('Alle') : catName(x)} /></div>}
      {todo.length > 0 && <><Label action={<span className="text-[13px] text-mute tabular-nums">{todo.length}</span>}>{t('Noch offen')}</Label><List>{todo.map(row)}</List></>}
      {have.length > 0 && <><Label action={<span className="text-[13px] text-mute tabular-nums">{have.length}</span>}>{t('Gelesen und bestätigt')}</Label><List>{have.map(row)}</List></>}
      {shown.length === 0 && <p className="mt-4 text-[15.5px] text-mute">{t('Nichts gefunden. Frag {name} oder schick eine Idee ans Büro.', { name: ASSISTANT })}</p>}
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
function wichtig(bs: WikiBlock[] | null): { show: WikiBlock[]; used: Set<WikiBlock> } | null {
  if (!bs) return null
  const q = bs.find(x => x.t === 'quote'); if (q) return { show: [q], used: new Set([q]) }
  const h = bs.findIndex(x => x.t === 'h' && /^wichtig/i.test(x.text ?? ''))
  if (h >= 0) { const show: WikiBlock[] = []
    const used: WikiBlock[] = [bs[h]]
    for (let i = h + 1; i < bs.length && show.length < 6 && ['p', 'ul', 'ol'].includes(bs[i].t); i++) {
      used.push(bs[i]); if (!/^\W*\w{1,12}\s*(\.\.\.|…)\W*$/.test(bs[i].text ?? '')) show.push(bs[i]) } // „immer...“ als Einleitung fällt weg
    if (show.length) return { show, used: new Set(used) } }
  const p = bs.find(x => x.t === 'p' && /^(\*\*wichtig:?\*\*|wichtig:)\s*/i.test(x.text ?? ''))
  return p ? { show: [{ ...p, text: p.text!.replace(/^(\*\*wichtig:?\*\*|wichtig:)\s*/i, '') }], used: new Set([p]) } : null
}
const ytId = (u: string) => u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1]
// **fett**, *kursiv*, [Text](Link) aus dem Import als echte Auszeichnung
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\)|\n)/g).filter(Boolean)
  return <>{parts.map((p, i) => {
    if (p === '\n') return <br key={i} />
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    const l = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/); if (l) return <a key={i} href={l[2]} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="underline underline-offset-2">{l[1]}</a>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>
    return <span key={i}>{p}</span>
  })}</>
}
function WikiDetail({ a }: { a: WikiArticle }) {
  const { quizzes, attempts, lang, t, me } = useApp()
  const [tr8, setTr8] = useState<{ body: string; blocks: WikiBlock[] | null } | null | 'loading' | 'failed'>(null)
  const [orig, setOrig] = useState(false)
  useEffect(() => {
    if (lang === 'DE' || a.fromNews || !supabase) { setTr8(null); return }
    setTr8('loading')
    supabase.functions.invoke('translate', { body: { action: 'article', id: a.id, lang } }).then(({ data, error }) => setTr8(error || !data?.ok ? 'failed' : { body: data.body, blocks: data.blocks }))
  }, [a.id, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!a.fromNews && supabase && me.id) supabase.from('wiki_views').upsert({ article_id: a.id, employee_id: me.id }, { onConflict: 'article_id,employee_id,day', ignoreDuplicates: true }).then(() => {}) }, [a.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const quiz = quizzes.find(q => a.fromNews ? q.newsId === a.id.slice(5) : q.articleId === a.id)
  // Artikel mit Test gelten erst nach bestandenem Test als gelesen (Wunsch der Inhaberin 22.10.)
  const quizPassed = !!quiz && attempts.some(x => x.quizId === quiz.id && x.employeeId === me.id && x.passed)
  const quizRef = useRef<HTMLDivElement>(null)
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
  const { read, runs } = useWikiRuns()
  const [ticked, setTickedState] = useState<Set<string>>(new Set())
  // Stand sofort mitführen, damit schnelle Klicks hintereinander nicht auf einem alten Stand aufsetzen
  const tickedRef = useRef(ticked)
  const setTicked = (v: Set<string> | ((x: Set<string>) => Set<string>)) => { const n = typeof v === 'function' ? v(tickedRef.current) : v; tickedRef.current = n; setTickedState(n) }
  const [busy, setBusy] = useState(false)
  // „Wichtig“-Banner oben (Vorlage der Inhaberin 22.10.): der erste Hinweis-Baustein, sonst der Abschnitt
  // „Wichtige Facts …“ der importierten Protokolle oder ein Absatz, der mit „Wichtig“ beginnt. Er fehlt dann unten.
  const allBlocks = shown?.blocks ?? null
  const banner = useMemo(() => wichtig(allBlocks), [allBlocks])
  const blocks = allBlocks && banner ? allBlocks.filter(x => !banner.used.has(x)) : allBlocks
  // Schritt-Modus (Wunsch der Inhaberin 21.10.): nummerierte Listen werden zu Schritten, sonst ab zwei Zwischentiteln
  // jeder Abschnitt ein Schritt. Aufzählungen werden dann zur Checkliste, Hinweise zur roten Regel.
  type Step = { key: string; title: string | null; body: WikiBlock[] | null; text: string | null; parts?: string[] }
  type Flow = WikiBlock | { t: 'steps'; from: number; to: number } | { t: 'check'; key: number; title?: string; items: string[] }
  // Teilschritte im Import: „-Kundin Farbkarte geben-Fräser desinfizieren“
  const splitParts = (x: string) => x.split(/\s*-\s*(?=[A-ZÄÖÜ])/).map(y => y.trim()).filter(Boolean).map(y => (y.match(/\*\*/g) ?? []).length % 2 ? y.replace(/\*\*/g, '') : y)
  const boldLead = (x?: string) => !!x && /^\*\*[^*]+\*\*/.test(x) && !/^\*\*[^*]+\*\*\s*·/.test(x)
  const shortLine = (b: WikiBlock) => b.t === 'p' && !!b.text && b.text.length <= 45 && !/[.:!?]$/.test(b.text) && !b.text.includes('**')
  const plan: { mode: 'steps' | 'sections' | 'plain'; pre: WikiBlock[]; steps: Step[]; flow: Flow[] } = (() => {
    const steps: Step[] = [], flow: Flow[] = []
    if (!blocks) return { mode: 'plain', pre: [], steps, flow }
    // 1) Schritte aus nummerierten Listen und aus Absätzen mit fettem Anfang, 2) Materiallisten aus kurzen Zeilen
    for (let i = 0; i < blocks.length; i++) {
      const x = blocks[i]
      if (x.t === 'ol') { const from = steps.length
        x.items?.forEach((it, j) => { const m = it.match(/^\*\*([^*]+)\*\*[:\s–-]*([\s\S]*)$/); steps.push({ key: `o${i}-${j}`, title: m ? m[1] : null, body: null, text: m ? m[2] : it }) })
        flow.push({ t: 'steps', from, to: steps.length }); continue }
      if (x.t === 'p' && boldLead(x.text) && boldLead(blocks[i + 1]?.text)) { const from = steps.length
        while (i < blocks.length && blocks[i].t === 'p' && boldLead(blocks[i].text)) {
          const m = blocks[i].text!.match(/^\*\*([^*]+)\*\*([\s\S]*)$/)!
          const head = splitParts(m[1].replace(/^\d+\.\s*/, '')), rest = [...head.slice(1), ...splitParts(m[2].replace(/^[\s:–-]+/, ''))]
          steps.push({ key: `b${i}`, title: head[0] ?? m[1], body: null, text: rest.length === 1 ? rest[0] : null, parts: rest.length > 1 ? rest : undefined }); i++ }
        i--; flow.push({ t: 'steps', from, to: steps.length }); continue }
      if (shortLine(x) && blocks.slice(i, i + 4).every(shortLine)) { const items: string[] = [], key = i
        const prev = flow[flow.length - 1], title = prev && 't' in prev && prev.t === 'h' ? (flow.pop() as WikiBlock).text : undefined
        while (i < blocks.length && shortLine(blocks[i])) items.push(blocks[i++].text!)
        i--; flow.push({ t: 'check', key, title, items }); continue }
      flow.push(x)
    }
    if (steps.length) return { mode: 'steps', pre: [], steps, flow }
    // Sonst ab zwei Zwischentiteln: jeder Abschnitt ein Schritt
    if (blocks.filter(x => x.t === 'h').length >= 2) {
      const pre: WikiBlock[] = []; let cur: Step | null = null
      blocks.forEach((x, i) => { if (x.t === 'h') { cur = { key: 'h' + i, title: x.text ?? '', body: [], text: null }; steps.push(cur) } else if (cur) cur.body!.push(x); else pre.push(x) })
      return { mode: 'sections', pre, steps, flow: [{ t: 'steps', from: 0, to: steps.length }] }
    }
    return { mode: 'plain', pre: [], steps, flow }
  })()
  const mode = plan.mode
  const total = plan.steps.length, doneN = plan.steps.filter(x => ticked.has(x.key)).length
  const timesDone = runs.get(a.id) ?? 0
  const tick = async (k: string) => {
    const next = new Set(tickedRef.current); if (next.has(k)) next.delete(k); else next.add(k)
    setTicked(next)
    if (total && plan.steps.every(x => next.has(x.key)) && supabase && me.id && !a.fromNews) {
      const { error } = await supabase.from('wiki_runs').insert({ article_id: a.id, employee_id: me.id, kind: 'durchgang' })
      if (!error) { toast(t('Durchgang gespeichert. Gut gemacht!')); reloadRuns(); setTimeout(() => setTicked(new Set()), 1200) }
    }
  }
  const confirmRead = async () => {
    if (!supabase || !me.id || a.fromNews) return
    setBusy(true)
    const { error } = await supabase.from('wiki_runs').insert({ article_id: a.id, employee_id: me.id, kind: 'gelesen' })
    setBusy(false)
    if (error && !/duplicate/i.test(error.message)) toast(t('Das hat nicht geklappt'), 'error'); else { toast(t('Gelesen und bestätigt')); reloadRuns() }
  }
  const checklist = (items: string[], i: number, title?: string) => {
    const keys = items.map((_, j) => `u${i}-${j}`), have = keys.filter(k => ticked.has(k)).length
    return <div key={i} className="rounded-[20px] bg-white p-4">
      <div className="flex items-baseline justify-between"><p className="rubric text-ink/80">{title ?? t('Checkliste')}</p><p className="text-[13.5px] text-mute tabular-nums">{t('{a} / {b} bereit', { a: have, b: keys.length })}</p></div>
      <div className="mt-3 space-y-2">{items.map((x, j) => { const on = ticked.has(keys[j])
        return <button key={j} onClick={() => setTicked(s0 => { const n = new Set(s0); if (n.has(keys[j])) n.delete(keys[j]); else n.add(keys[j]); return n })} className={`w-full min-h-[48px] rounded-[14px] px-3.5 py-2.5 flex items-center gap-3 text-left text-[16.5px] ${on ? 'bg-done-50' : 'bg-sage-50'}`}>
          <span className={`flex-1 ${on ? 'line-through text-mute' : ''}`}><Rich text={x} /></span>
          <span className={`w-6 h-6 rounded-[7px] flex items-center justify-center shrink-0 ${on ? 'bg-done text-white' : 'bg-white shadow-[inset_0_0_0_1.5px_#B9C4AF]'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
        </button> })}</div>
    </div>
  }
  const block = (b: WikiBlock, i: number, inStep = false): ReactNode => {
    switch (b.t) {
      case 'h': return <h2 key={i} className={`${b.level && b.level >= 3 ? 'text-[17px]' : 'text-[20px]'} font-medium tracking-tight pt-3`}>{b.text}</h2>
      case 'p': return <p key={i}><Rich text={b.text ?? ''} /></p>
      case 'quote': return inStep ? <div key={i} className="rounded-[14px] bg-note-50 px-3.5 py-2.5 text-[15.5px] text-[#6B4A16] flex gap-2"><AlertTriangle size={16} className="text-note shrink-0 mt-0.5" /><span><Rich text={b.text ?? ''} /></span></div>
        : <div key={i} className="rounded-[18px] bg-duty-50 px-4 py-3.5 flex gap-3 text-[#6E2A1F] shadow-[inset_0_0_0_1px_rgba(147,57,43,.18)]"><AlertTriangle size={20} className="text-duty shrink-0 mt-0.5" /><div><p className="rubric text-duty">{t('Wichtige Regel')}</p><p className="mt-1 text-[16.5px] leading-snug"><Rich text={b.text ?? ''} /></p></div></div>
      case 'ol': return <ol key={i} className="list-decimal pl-5 space-y-1.5">{b.items?.map((x, j) => <li key={j}><Rich text={x} /></li>)}</ol>
      case 'ul': return mode !== 'plain' && !inStep ? checklist(b.items ?? [], i, (() => { const prev = blocks?.[i - 1]; return prev?.t === 'h' ? prev.text : undefined })()) : <ul key={i} className="list-disc pl-5 space-y-1.5">{b.items?.map((x, j) => <li key={j}><Rich text={x} /></li>)}</ul>
      case 'img': return urls[b.src!] ? <img key={i} src={urls[b.src!]} alt="" loading="lazy" className="w-full rounded-[16px] bg-sage-100" /> : <div key={i} className="w-full aspect-[4/3] rounded-[16px] bg-sage-100" />
      case 'video': { if (b.src) return urls[b.src] ? <video key={i} src={urls[b.src]} controls playsInline className="w-full rounded-[16px] bg-olive-700" /> : <div key={i} className="w-full aspect-video rounded-[16px] bg-sage-100" />
        const id = b.url ? ytId(b.url) : null
        return id ? <iframe key={i} className="w-full aspect-video rounded-[16px]" src={`https://www.youtube-nocookie.com/embed/${id}`} title={t('Video')} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
          : <a key={i} href={b.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sage-800 underline"><Play size={16} />{t('Video öffnen')}</a> }
      case 'file': return <a key={i} href={urls[b.src!] ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[17px]"><span className="w-9 h-9 rounded-xl bg-sage-50 flex items-center justify-center text-sage-800 shrink-0"><FileText size={17} /></span><span className="flex-1 min-w-0 truncate">{b.name ?? t('Datei')}</span><ArrowUpRight size={16} className="text-sage-400" /></a>
      default: return null
    }
  }
  const stepCard = (x: Step, n: number) => { const on = ticked.has(x.key)
    return <div key={x.key} className={`rounded-[20px] p-4 transition ${on ? 'bg-done-50' : 'bg-white'}`}>
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-[10px] font-display text-[16px] flex items-center justify-center shrink-0 ${on ? 'bg-done text-white' : 'bg-olive-800 text-white'}`}>{on ? <Check size={16} strokeWidth={3} /> : n}</span>
        <div className={`flex-1 min-w-0 text-[16.5px] leading-relaxed ${on ? 'text-mute' : ''}`}>
          {x.title && <p className={`text-[17.5px] font-semibold leading-snug ${on ? 'line-through' : ''}`}>{x.title}</p>}
          {x.text && <p className={x.title ? 'mt-1' : ''}><Rich text={x.text} /></p>}
          {x.parts && <ul className="mt-1.5 space-y-1">{x.parts.map((y, j) => <li key={j} className="flex gap-2"><span className="mt-[11px] w-1.5 h-1.5 rounded-full bg-sage-400 shrink-0" /><span><Rich text={y} /></span></li>)}</ul>}
          {x.body && <div className="mt-1.5 space-y-2.5">{x.body.map((bb, j) => block(bb, j, true))}</div>}
        </div>
      </div>
      <div className="mt-3 flex justify-end"><button onClick={() => tick(x.key)} className={`h-10 px-3.5 rounded-full text-[15px] font-medium flex items-center gap-1.5 ${on ? `${TONE.done.bg} ${TONE.done.fg}` : 'bg-sage-50 text-ink/80'}`}>{on ? <><Check size={15} />{t('Erledigt')}</> : <><Circle size={15} />{t('Als erledigt markieren')}</>}</button></div>
    </div>
  }
  const isRead = read.has(a.id)
  const look = AREA_LOOK[areaOf(a.catKey, a.title)] ?? AREA_LOOK.studio, LookIcon = look.icon
  return (
    <article className="pb-4">
      <div className="px-5">
        {/* Kopf nach Vorlage der Inhaberin: Thema und Stand, Titel, Lesedauer, dann „Wichtig“ */}
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className={`px-2.5 py-1 rounded-[8px] text-[12.5px] font-semibold uppercase tracking-[.04em] inline-flex items-center gap-1.5 ${TONE[look.tone].bg} ${TONE[look.tone].fg}`}><LookIcon size={13} />{catName(a.cat)}</span>
          <span className="text-[13px] text-mute shrink-0">{t('aktualisiert {date}', { date: a.updated })}</span>
        </div>
        <h1 className="mt-3 text-[28px] font-medium tracking-tight leading-tight">{title}</h1>
        {intro && <p className="mt-2 text-[17px] text-mute leading-snug">{intro}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-[13px] font-semibold bg-white text-ink/80 inline-flex items-center gap-1"><Clock size={12} />{t('{n} Min. Lesedauer', { n: a.minutes })}</span>
          {quiz && <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold inline-flex items-center gap-1 ${quizPassed ? `${TONE.done.bg} ${TONE.done.fg}` : `${TONE.duty.bg} ${TONE.duty.fg}`}`}>{quizPassed ? <Check size={12} /> : <GraduationCap size={12} />}{quizPassed ? t('Test bestanden') : t('mit Test')}</span>}
          {(a.mediaKind === 'video' || a.mediaKind === 'youtube' || blocks?.some(x => x.t === 'video')) && <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${TONE.learn.bg} ${TONE.learn.fg}`}>{t('mit Video')}</span>}
          {a.accessLevel !== 'alle' && <span className="px-2.5 py-1 rounded-full text-[13px] bg-white text-ink/70 inline-flex items-center gap-1"><Lock size={12} />{a.accessLevel === 'buero' ? t('Büro') : t('Filialleitung')}</span>}
          {timesDone > 0 && <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${TONE.done.bg} ${TONE.done.fg}`}>{t('{n}× durchgemacht', { n: timesDone })}</span>}
        </div>
        {(banner || (quiz && !quizPassed)) && <div className="mt-4 rounded-[20px] bg-[#232821] px-4 py-3.5">
          <p className="flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[.05em] text-[#F2A99C]"><AlertTriangle size={17} />{t('Wichtig')}</p>
          {banner && <div className="mt-1.5 space-y-1.5 text-[16.5px] leading-snug text-white/90">{banner.show.map((x, i) => x.t === 'ul' || x.t === 'ol'
            ? <ul key={i} className="space-y-1">{x.items?.map((y, j) => <li key={j} className="flex gap-2"><span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" /><span><Rich text={y} /></span></li>)}</ul>
            : <p key={i}><Rich text={x.text ?? ''} /></p>)}</div>}
          {quiz && !quizPassed && <p className={`${banner ? 'mt-2 text-[14.5px] text-white/65' : 'mt-1.5 text-[16.5px] text-white/90'} leading-snug`}>{t('Gilt erst als gelesen, wenn du den Test am Ende bestanden hast.')}</p>}
        </div>}
        {lang !== 'DE' && !a.fromNews && <p className="mt-2 text-[14.5px] text-mute">{tr8 === 'loading' ? t('Wird übersetzt …') : tr8 === 'failed' ? t('Übersetzung gerade nicht möglich, Original wird angezeigt.') : <button onClick={() => setOrig(!orig)} className="text-olive-700">{orig ? t('Übersetzung anzeigen') : t('Automatisch übersetzt · Original')}</button>}</p>}
        {yt ? <iframe className="mt-5 w-full aspect-video rounded-[18px]" src={`https://www.youtube-nocookie.com/embed/${yt}`} title={a.title} allow="encrypted-media; picture-in-picture" allowFullScreen />
          : a.mediaKind === 'video' && own ? <video className="mt-5 w-full rounded-[18px] bg-olive-700" src={own} controls playsInline />
          : a.mediaKind === 'photo' && own ? <img className="mt-5 w-full rounded-[18px]" src={own} alt="" /> : null}
        {!full && <p className="mt-6 text-mute">{t('Lädt …')}</p>}
        {shown && mode === 'plain' && (blocks ? <div className="mt-5 space-y-3 text-[17.5px] leading-relaxed">{blocks.map((x, i) => block(x, i))}</div>
          : <div className="mt-5 space-y-3 text-[17.5px] leading-relaxed">{shown.body.split(/\n\n+/).filter(Boolean).map((x, i) => <p key={i}>{x}</p>)}</div>)}
        {shown && mode !== 'plain' && <div className="mt-5 space-y-3 text-[17.5px] leading-relaxed">
          {plan.pre.map((x, i) => block(x, 1000 + i))}
          {plan.flow.map((f, i) => 'from' in f ? <div key={'s' + i} className="space-y-3">
            {f.from === 0 && <div className="pt-2 flex items-baseline justify-between"><p className="rubric text-ink/80">{t('Schritt für Schritt')}</p><p className="text-[13.5px] text-mute tabular-nums">{t('{a} von {b} erledigt', { a: doneN, b: total })}</p></div>}
            {f.from === 0 && <Bar value={doneN} total={total} />}
            {plan.steps.slice(f.from, f.to).map((x, j) => stepCard(x, f.from + j + 1))}
          </div> : f.t === 'check' ? checklist(f.items, 5000 + f.key, f.title) : block(f, blocks!.indexOf(f)))}
        </div>}
        {quiz && full && <div ref={quizRef} className="scroll-mt-4"><QuizRunner quiz={quiz} onPassed={reloadRuns} /></div>}
      </div>
      {/* Unten fest: bestätigen und Marc fragen (Vorlage der Inhaberin) */}
      {!a.fromNews && full && <div className="sticky bottom-0 mt-6 px-4 pt-3 pb-3 bg-gradient-to-t from-sage-50 via-sage-50 to-sage-50/0">
        <div className="grid grid-cols-2 gap-2">
          {isRead ? <div className={`h-12 rounded-[16px] flex items-center justify-center gap-2 font-semibold whitespace-nowrap ${TONE.done.bg} ${TONE.done.fg}`}><Check size={18} />{t('Bestätigt')}</div>
            : quiz && !quizPassed ? <button onClick={() => quizRef.current?.scrollIntoView({ behavior: 'smooth' })} className="h-12 rounded-[16px] bg-olive-800 text-white font-semibold flex items-center justify-center gap-2 whitespace-nowrap"><GraduationCap size={18} />{t('Zum Test')}</button>
            : <button disabled={busy} onClick={confirmRead} className="h-12 px-2 rounded-[16px] bg-olive-800 text-white text-[15.5px] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60">{t('Gelesen & bestätigen')}</button>}
          <button onClick={() => openNewBenniChat(t('Ich lese gerade „{title}“. Fass mir die wichtigsten Punkte kurz zusammen, danach habe ich eine Frage.', { title: a.title }))} className={`h-12 px-2 rounded-[16px] text-[15.5px] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${TONE.note.bg} ${TONE.note.fg}`}><MessageCircle size={17} />{t('Frage an Marc')}</button>
        </div>
      </div>}
    </article>
  )
}
function Onboarding({ open }: { open: (s: Sub) => void }) {
  const { steps, obDone, toggleStep, wiki, t } = useApp()
  return (
    <div className="px-5 pb-10"><h1 className="mt-3 text-[26px] font-medium tracking-tight">{t('Onboarding')}</h1>
      <p className="mt-1 text-[15.5px] text-mute">{t('Alles für deine ersten Tage. Deine Respo sieht, wie weit du bist.')}</p>
      <Card onClick={() => open({ k: 'install' })} className="mt-4 p-4 flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-olive-700 text-white flex items-center justify-center"><Smartphone size={19} /></span><span className="flex-1"><span className="block text-[17px] font-medium">{t('Zuerst: TeamHub aufs Handy')}</span><span className="block text-[13px] text-mute">{t('Auf den Home-Bildschirm legen und Mitteilungen einschalten')}</span></span><ChevronRight size={18} className="text-sage-400" /></Card>
      <button onClick={() => openNewBenniChat(t('Lass uns mit dem Onboarding weiterlernen.'))} className="mt-3 w-full rounded-[16px] bg-white p-4 flex items-center gap-3 text-left"><BMark className="w-10 h-10 text-[17px]" /><span className="flex-1"><span className="block text-[17px] font-medium">{t('Mit Marc lernen')}</span><span className="block text-[13px] text-mute">{t('Schritt für Schritt, mit kurzer Kontrollfrage')}</span></span><ChevronRight size={18} className="text-sage-400" /></button>
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
  const mailUnread = useMailUnread()
  const unread = live(news).filter(n => n.mustRead && !read.has(n.id)).length
  const tiles: [string, string, typeof Users, Sub][] = [
    ['News', unread ? t('{n} ungelesen', { n: unread }) : t('alles gelesen'), Newspaper, { k: 'news-list' }], ['Kalender', t('Termine, Schulungen und Events'), CalendarDays, { k: 'events' }],
    ['Team', t('{n} Personen', { n: staff.filter(s => s.active).length }), Users, { k: 'team' }], ['Melden & Ideen', t('{n} offen', { n: tickets.filter(x => x.kind !== 'Learning' && x.status !== 'Erledigt').length }), Lightbulb, { k: 'tickets' }],
    ['Learning', t('Videos und Tipps aus den Studios'), GraduationCap, { k: 'tickets', learning: true }],
    ['Posteingang', mailUnread ? t('{n} ungelesen', { n: mailUnread }) : t('Deine Firmen-Mails'), Mail, { k: 'inbox' }],
    ['Zeit & Ferien', t('Stempeluhr, Ferien, Arbeitszeit'), Plane, { k: 'time' }],
  ]
  return (
    <div className="pb-10"><Title>{t('Menü')}</Title>
      <div className="px-5">
        <List>
          <Row title={`${me.first} ${me.last}`} sub={`${me.role} · ${me.branch}`} onClick={() => open({ k: 'me' })} />
        </List>
        <div className="mt-3"><List>
          {tiles.map(([title, sub, Icon, target]) => <Row key={title} icon={<Icon size={19} strokeWidth={1.6} />} title={t(title)} sub={sub} onClick={() => open(target)} />)}
        </List></div>
        {/* Aus Phorest: bleibt erreichbar, steht aber nicht mehr im Vordergrund (Inhaberin 21.10.) */}
        <Label>{t('Aus Phorest')}</Label>
        <List>
          <Row icon={<CalendarDays size={19} strokeWidth={1.6} />} title={t('Kundentermine')} sub={`${t('Alle Studios')} · ${t('live aus Phorest')}`} onClick={() => open({ k: 'book' })} />
          <Row icon={<Search size={19} strokeWidth={1.6} />} title={t('Kundenhistorie')} sub={t('Besuche und Notizen von Kunden')} onClick={() => open({ k: 'clients' })} />
          {me.app_role !== 'buero' && <Row icon={<TrendingUp size={19} strokeWidth={1.6} />} title={t('Meine Performance')} sub={t('Kennzahlen, Ziele und Bewertungen')} onClick={() => open({ k: 'perf' })} />}
        </List>
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

/* ---------- Kundenhistorie aus Phorest (Zusammenfassung durch Marc) ---------- */
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

/** Kundin im Detail: Kontakt, Angaben aus Phorest, Kundennotiz, Marc-Zusammenfassung mit Rückfragen, Termine. */
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

/** Zusammenfassung von Marc und direkt Fragen zur Kundin stellen (ohne eigenen Chat). */
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

function Profile({ s, open }: { s: Staff; open: (x: Sub) => void }) {
  const { t, me, privateChats } = useApp()
  const [busy, setBusy] = useState(false)
  const write = async () => { setBusy(true); const { data, error } = await supabase!.rpc('start_chat', { p_people: [s.id], p_title: null }); setBusy(false); if (error || !data) toast(t('Das hat nicht geklappt'), 'error'); else open({ k: 'chat', id: data as string }) }
  return (
    <div className="px-4 pb-10">
      <ProfileHead s={s} photo={s.photo} />
      {s.id !== me.id && privateChats && <button disabled={busy} onClick={write} className="mt-3 w-full h-12 rounded-[16px] bg-olive-800 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><MessageCircle size={18} />{t('Nachricht schreiben')}</button>}
      <div className="px-1"><Label>{t('Persönliches')}</Label>{s.about ? <Card className="p-4"><p className="text-[17px] leading-relaxed whitespace-pre-wrap">{s.about}</p></Card> : <p className="text-[15.5px] text-mute">{t('Noch nichts eingetragen.')}</p>}
        <Label>{t('Skills')}</Label>{s.skills.length ? <div className="flex flex-wrap gap-2">{s.skills.map(k => <span key={k} className="px-3 h-8 rounded-full bg-white text-[14.5px] flex items-center">{k}</span>)}</div> : <p className="text-[15.5px] text-mute">{t('Noch keine Skills eingetragen.')}</p>}
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
  const { me, staff, skills, photo, setPhotoFile, lang, setLang, t, reload } = useApp()
  const { signOut } = useAuth()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const saved = staff.find(x => x.id === me.id)?.about ?? ''
  const [about, setAbout] = useState(saved), [savingAbout, setSavingAbout] = useState(false)
  useEffect(() => { setAbout(saved) }, [saved])
  const saveAbout = async () => { setSavingAbout(true); const { error } = await supabase!.rpc('update_my_about', { p_about: about }); setSavingAbout(false); if (error) toast(t('Das hat nicht geklappt'), 'error'); else { toast(t('Gespeichert')); reload() } }
  return (
    <div className="px-4 pb-10">
      <ProfileHead s={me} photo={photo} onPhoto={() => file.current?.click()} busy={busy} />
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { setBusy(true); await setPhotoFile(f); setBusy(false) } }} />
      <div className="px-1">
      <Label>{t('Persönliches')}</Label>
      <Card className="p-4">
        <textarea value={about} onChange={e => setAbout(e.target.value)} rows={4} maxLength={600} placeholder={t('Was dürfen Kolleginnen über dich wissen? Zum Beispiel Hobbys, Lieblingsbehandlung, Sprachen.')} className="w-full resize-none outline-none bg-transparent text-[17px] leading-relaxed placeholder:text-mute" />
        {about.trim() !== (saved ?? '').trim() && <div className="mt-2 flex justify-end"><button disabled={savingAbout} onClick={saveAbout} className="h-10 px-4 rounded-[12px] bg-olive-700 text-white text-[15.5px] font-medium disabled:opacity-60">{t('Speichern')}</button></div>}
      </Card>
      <p className="mt-2 text-[13px] text-mute">{t('Sichtbar für alle im Team auf deinem Profil.')}</p>
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
    </div>
  )
}
/** Grosses Profilfoto mit Name und Rolle darüber (Inhaberin 21.10., Punkt 23) */
function ProfileHead({ s, photo, onPhoto, busy }: { s: Staff; photo: string | null; onPhoto?: () => void; busy?: boolean }) {
  const { t } = useApp()
  const initials = (s.first[0] ?? '') + (s.last[0] ?? '')
  return (
    <div className={`mt-2 relative ${photo ? 'h-[320px]' : 'h-[210px]'} rounded-[26px] overflow-hidden bg-studio-50 ${busy ? 'opacity-60' : ''}`}>
      {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <span className="absolute inset-x-0 top-0 bottom-16 flex items-center justify-center font-display text-[64px] text-studio/50">{initials}</span>}
      <span className="absolute inset-0 bg-gradient-to-b from-ink/0 via-ink/5 to-ink/70" />
      <div className="absolute left-5 right-5 bottom-4 text-white"><h1 className="text-[28px] leading-tight">{s.first} {s.last}</h1><p className="text-[16px] text-white/85">{s.role} · {t('Studio {name}', { name: s.branch })}</p></div>
      {onPhoto && <button onClick={onPhoto} aria-label={t('Foto ändern')} className="absolute top-3 right-3 h-10 px-3.5 rounded-full bg-white/90 text-ink text-[15px] font-medium flex items-center gap-1.5"><Camera size={16} />{photo ? t('Foto ändern') : t('Foto hinzufügen')}</button>}
    </div>
  )
}

function Tickets({ open, learning }: { open: (s: Sub) => void; learning?: boolean }) {
  const { tickets, addTicket, toggleVote, me, t, branches } = useApp()
  // Dritter Knopf „Learning“: Kolleginnen teilen Videos und Tipps, sichtbar für alle Studios (Inhaberin 20.10., Punkt 18)
  const [kind, setKind] = useState<'Meldung' | 'Idee' | 'Learning'>(learning ? 'Learning' : 'Meldung'), [text, setText] = useState(''), [ok, setOk] = useState(''), [photo, setPhoto] = useState<File | null>(null), [busy, setBusy] = useState(false)
  // Wer woanders aushilft, meldet für das Studio, in dem sie gerade ist
  const studios = branches.filter(b => !b.is_office)
  const [branchId, setBranchId] = useState(studios.some(b => b.id === me.branch_id) ? me.branch_id : studios[0]?.id ?? me.branch_id)
  const [pickB, setPickB] = useState(false)
  const [view, setView] = useState<'offen' | 'erledigt'>('offen')
  const file = useRef<HTMLInputElement>(null)
  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true); const good = await addTicket({ kind, title: text.trim(), photo: photo ?? undefined, ...(kind === 'Learning' ? { branchId: me.branch_id } : branchId === '*' ? { allStudios: true } : { branchId }) }); setBusy(false)
    if (good) { setText(''); setPhoto(null); setOk(kind === 'Learning' ? t('Geteilt. Alle Studios sehen es jetzt unter Learning.') : t('Gesendet. Du siehst hier, was daraus wird.')) } else setOk(t('Das hat nicht geklappt. Bitte versuche es noch einmal.'))
    setTimeout(() => setOk(''), 3000)
  }
  // Die Datenbank liefert nur, was diese Person sehen darf: eigene Meldungen, Ideen des Teams, als Leitung das Studio
  const list = tickets.filter(x => x.kind !== 'Learning' && (view === 'offen' ? x.status !== 'Erledigt' : x.status === 'Erledigt'))
    .sort((a, b) => b.votes - a.votes)
  const learnings = tickets.filter(x => x.kind === 'Learning')
  const isVideo = photo?.type.startsWith('video')
  return (
    <div className="pb-10"><Title>{kind === 'Learning' ? t('Learning') : t('Melden & Ideen')}</Title>
      <div className="px-5">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-[12px] bg-white">
          {(['Meldung', 'Idee', 'Learning'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={`h-10 rounded-[10px] text-[15.5px] flex items-center justify-center gap-1.5 transition ${kind === k ? 'bg-olive-700 text-white' : ''}`}>{k === 'Meldung' ? <AlertTriangle size={15} /> : k === 'Idee' ? <Lightbulb size={15} /> : <GraduationCap size={15} />}{t(k)}</button>)}
        </div>
        <Card className="mt-3 p-4">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={kind === 'Meldung' ? t('Was ist kaputt oder fehlt?') : kind === 'Learning' ? t('Was möchtest du dem Team zeigen? Zum Beispiel, wie du Brauen formst.') : t('Was könnten wir besser machen?')} className="w-full resize-none outline-none text-[17px] placeholder:text-mute bg-transparent" />
          <div className="mt-2 flex items-center justify-between gap-2 text-[14.5px] text-mute">
            <span className="flex items-center gap-3 min-w-0 whitespace-nowrap"><button onClick={() => file.current?.click()} className={`flex items-center gap-1 ${photo ? 'text-olive-700' : ''}`}>{isVideo ? <Video size={15} /> : <Camera size={15} />}{photo ? (isVideo ? t('Video dabei') : t('Foto dabei')) : t('Foto oder Video')}</button>{kind !== 'Learning' && <span className="relative"><button onClick={() => setPickB(!pickB)} className="flex items-center gap-1 hover:text-ink"><MapPin size={15} />{branchId === '*' ? t('Alle Studios') : branches.find(b => b.id === branchId)?.name ?? me.branch}<ChevronRight size={13} className={`transition ${pickB ? 'rotate-90' : ''}`} /></button>
              {pickB && <span className="absolute z-20 left-0 bottom-7 w-48 rounded-[12px] bg-white shadow-[0_12px_32px_-12px_rgba(29,34,28,.45)] p-1 flex flex-col">{[{ id: '*', name: t('Alle Studios') }, ...studios].map(b => <button key={b.id} onClick={() => { setBranchId(b.id); setPickB(false) }} className={`h-9 px-3 rounded-[8px] text-left text-[15.5px] flex items-center justify-between ${b.id === branchId ? 'bg-sage-50 text-ink' : 'text-ink/80 hover:bg-sage-50'}`}>{b.name}{b.id === branchId && <Check size={14} />}</button>)}</span>}
            </span>}</span>
            <button disabled={busy} onClick={submit} className="h-9 px-4 rounded-[10px] bg-olive-700 text-white flex items-center gap-1.5 shrink-0 disabled:opacity-60"><Send size={13} />{kind === 'Learning' ? t('Teilen') : t('Senden')}</button>
          </div>
          <input ref={file} type="file" accept="image/*,video/*" className="hidden" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
        </Card>
        {ok && <p className="mt-2 text-[13px] text-mute">{ok}</p>}
        {kind === 'Learning' ? <>
          <Label action={<span className="text-[13px] text-mute">{t('{n} geteilt', { n: learnings.length })}</span>}>{t('Aus den Studios')}</Label>
          {learnings.length === 0 && <Card><Empty>{t('Noch nichts geteilt. Zeig dem Team, wie du etwas machst, mit Video oder Foto.')}</Empty></Card>}
          <div className="space-y-3">{learnings.map(x => (
            <div key={x.id} className="rounded-[20px] bg-white overflow-hidden">
              {x.photo && (x.mediaKind === 'video' ? <video src={x.photo} controls playsInline preload="metadata" className="w-full max-h-[320px] bg-olive-800 object-cover" /> : <img src={x.photo} alt="" className="w-full max-h-[320px] object-cover" />)}
              <div className="p-4">
                <p className="text-[14px] text-mute">{x.who} · {x.branch} · {x.when}</p>
                <p className="mt-1 text-[17px] leading-snug">{x.title}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => toggleVote(x.id)} aria-pressed={x.voted} className={`h-9 px-3 rounded-full text-[14.5px] flex items-center gap-1.5 ${x.voted ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/80'}`}><ArrowBigUp size={15} />{t('Hilfreich')} · {x.votes}</button>
                  <button onClick={() => open({ k: 'ticket', id: x.id })} className="h-9 px-3 rounded-full bg-sage-50 text-[14.5px] text-ink/80">{x.comments.length ? t('{n} Kommentare', { n: x.comments.length }) : t('Kommentieren')}</button>
                </div>
              </div>
            </div>))}</div>
        </> : <>
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
        </>}
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
