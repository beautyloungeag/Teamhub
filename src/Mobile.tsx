import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  Home, ListChecks, BookOpen, LayoutGrid, Sparkles, ChevronLeft, ChevronRight, Check, Camera, MapPin, Users,
  Search, Lightbulb, AlertTriangle, CalendarDays, Inbox, Send, Newspaper, Plane, Play, Video,
  ArrowUpRight, LogOut, Phone, ThumbsUp, GraduationCap, Link2, Lock, FileText, Smartphone, Share, PlusSquare, MoreVertical, ExternalLink, Monitor,
} from 'lucide-react'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { phorest, type MyDay, type TeamToday, type StaffWeek, type ClientHit, type ClientHistory } from './lib/phorest'
import { pushState, enablePush, disablePush, testPush, reportDevice, isStandalone, isIOS, isAndroid, canPromptInstall, promptInstall, type PushState } from './lib/push'
import { useApp, isoDay, type Lang, type News, type WikiArticle, type WikiBlock, type Staff } from './store'
import { Terminbuch, EventCalendar } from './Calendar'
import { tr, locale } from './lib/i18n'
import { Logo, BMark } from './Logo'
import { Comments, Media } from './TicketParts'
import { QuizRunner } from './QuizRunner'

// Name des KI-Reiters (im Vertrag „Marc Beau“, im abgestimmten Prototyp „Benni“)
export const ASSISTANT = 'Benni'

type Tab = 'home' | 'tasks' | 'ai' | 'wiki' | 'menu'
type Sub = null | { k: 'news-list' } | { k: 'news'; item: News } | { k: 'wiki'; item: WikiArticle } | { k: 'onboarding' } | { k: 'team' } | { k: 'profile'; item: Staff }
  | { k: 'me' } | { k: 'conn' } | { k: 'book' } | { k: 'tickets' } | { k: 'ticket'; id: string } | { k: 'clients' } | { k: 'events' } | { k: 'inbox' } | { k: 'time' } | { k: 'install' }

const ini = (s: { first: string; last: string }) => ((s.first[0] ?? '') + (s.last[0] ?? '')).toUpperCase()

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
    <span className="flex-1 min-w-0"><span className="block text-[15px] truncate">{title}</span>{sub && <span className="block text-xs text-mute truncate mt-0.5">{sub}</span>}</span>
    {right ?? <ChevronRight size={18} className="text-sage-400 shrink-0" />}
  </button>
)
const List = ({ children }: { children: ReactNode }) => <Card className="divide-y divide-sage-50 overflow-hidden">{children}</Card>
const Title = ({ children, sub, right }: { children: ReactNode; sub?: string; right?: ReactNode }) => (
  <div className="px-5 pt-3 pb-4 flex items-end justify-between gap-3">
    <div>{sub && <p className="text-[13px] text-mute">{sub}</p>}<h1 className="text-[30px] leading-tight">{children}</h1></div>{right}
  </div>
)
const Label = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex items-baseline justify-between mt-8 mb-2.5 px-1"><h2 className="rubric text-ink/70">{children}</h2>{action}</div>
)
const Chips = ({ items, value, onChange, label = x => x }: { items: string[]; value: string; onChange: (v: string) => void; label?: (x: string) => string }) => (
  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
    {items.map(x => <button key={x} onClick={() => onChange(x)} className={`shrink-0 px-3.5 h-8 rounded-full text-[13px] transition ${value === x ? 'bg-olive-700 text-white' : 'bg-white text-ink'}`}>{label(x)}</button>)}
  </div>
)
const Btn = ({ children, onClick, ghost, disabled }: { children: ReactNode; onClick?: () => void; ghost?: boolean; disabled?: boolean }) =>
  <button disabled={disabled} onClick={onClick} className={`w-full h-12 rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-60 ${ghost ? 'bg-white text-ink' : 'bg-olive-700 text-white'}`}>{children}</button>
const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="h-11 rounded-2xl bg-white px-3.5 flex items-center gap-2"><Search size={18} className="text-mute" />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-mute" /></div>
)
const Empty = ({ children }: { children: ReactNode }) => <p className="px-4 py-4 text-[14px] text-mute">{children}</p>

/* ---------- Shell ---------- */
function Shell({ onLogout, onSwitch }: { onLogout: () => void; onSwitch?: () => void }) {
  const { t, read, news, loading } = useApp()
  const [tab, setTab] = useState<Tab>('home')
  const [stack, setStack] = useState<Sub[]>([])
  const sub = stack[stack.length - 1] ?? null
  const open = (s: Sub) => setStack(st => [...st, s])
  const back = () => setStack(st => st.slice(0, -1))
  const go = (x: Tab) => { setStack([]); setTab(x) }
  const scroller = useRef<HTMLDivElement>(null)
  const mustOpen = news.filter(n => n.mustRead && !read.has(n.id)).length
  // Tipp auf eine Mitteilung: ?open=news:<id> | events | tickets
  const openUrl = (u: string) => {
    const o = new URL(u, location.origin).searchParams.get('open') ?? ''
    if (o.startsWith('news:')) { const n = news.find(x => x.id === o.slice(5)); if (n) open({ k: 'news', item: n }) }
    else if (o === 'events') open({ k: 'events' }); else if (o === 'tickets') open({ k: 'tickets' })
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
    case 'onboarding': screen = <Onboarding open={open} />; break
    case 'team': screen = <Team open={open} />; break
    case 'profile': screen = <Profile s={sub.item} />; break
    case 'me': screen = <MyProfile />; break
    case 'tickets': screen = <Tickets open={open} />; break
    case 'ticket': screen = <TicketDetail id={sub.id} />; break
    case 'clients': screen = <ClientHistoryView />; break
    case 'events': screen = <Events />; break
    case 'conn': screen = <Connections />; break
    case 'book': screen = <div className="px-5 pb-4 h-[calc(100dvh-150px)] md:h-[calc(100dvh-110px)]"><h1 className="text-[26px] font-medium tracking-tight mb-3">{t('Kundentermine')}</h1><Terminbuch compact /></div>; break
    case 'inbox': screen = <ExternalTool kind="mail" />; break
    case 'time': screen = <ExternalTool kind="timebutler" />; break
    case 'install': screen = <Install />; break
    default:
      screen = tab === 'home' ? <Today open={open} go={go} /> : tab === 'tasks' ? <Tasks open={open} /> : tab === 'ai' ? <AI open={open} />
        : tab === 'wiki' ? <Wiki open={open} /> : <MenuView open={open} onLogout={onLogout} />
  }
  const key = (sub ? sub.k + ('item' in sub ? String((sub.item as { id?: string }).id) : '') : tab) + stack.length
  const nav: [Tab, string, typeof Home][] = [['home', 'Heute', Home], ['tasks', 'Aufgaben', ListChecks], ['ai', 'Benni', Sparkles], ['wiki', 'Wissen', BookOpen], ['menu', 'Menü', LayoutGrid]]
  return (
    <div className="flex-1 min-h-0 flex">
      {/* Desktop: Navigation als Seitenleiste wie im Backoffice */}
      <aside className="hidden md:flex w-60 shrink-0 bg-olive-800 p-4 flex-col">
        <Logo className="w-32 text-white mx-2 mt-1" />
        <nav className="mt-6 space-y-0.5">
          {nav.map(([x, label, Icon]) => {
            const on = tab === x && !sub
            return (
              <button key={x} onClick={() => go(x)} className={`relative w-full h-10 px-3 rounded-[10px] flex items-center gap-3 text-[14px] ${on ? 'bg-white/10 text-white' : 'text-sage-200 hover:bg-white/5'}`}>
                {x === 'ai' ? <BMark className="w-[18px] h-[18px] text-[10px]" inverse /> : <Icon size={18} strokeWidth={1.6} />}{x === 'ai' ? label : t(label)}
                {x === 'home' && mustOpen > 0 && <span className="ml-auto w-2 h-2 rounded-full bg-brass" />}
              </button>
            )
          })}
        </nav>
        {onSwitch && <button onClick={onSwitch} className="mt-auto h-10 px-3 rounded-[10px] flex items-center gap-3 text-[14px] text-sage-200 hover:bg-white/5"><Monitor size={18} strokeWidth={1.6} />{t('Büro-Backoffice')}</button>}
      </aside>
      <div className="relative flex-1 min-w-0 flex flex-col">
        <div ref={scroller} className="flex-1 overflow-y-auto no-scrollbar bg-sage-50">
          <div className="w-full md:max-w-[760px] md:mx-auto h-full">
            <div className="h-11 md:h-8" />
            {sub && <button onClick={back} className="px-4 pb-1 flex items-center gap-0.5 text-sage-800 text-[15px]"><ChevronLeft size={20} />{t('Zurück')}</button>}
            {loading ? <p className="px-5 pt-10 text-mute">{t('Lädt …')}</p> :
              <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={tab === 'ai' && !sub ? 'h-[calc(100%-44px)]' : ''}>
                {screen}
              </motion.div>}
          </div>
        </div>
        <nav className="md:hidden shrink-0 bg-white border-t border-line px-3 pb-7 pt-2 grid grid-cols-5 items-end">
          {nav.map(([x, label, Icon]) => {
            const on = tab === x && !sub
            if (x === 'ai') return (
              <button key={x} onClick={() => go(x)} className={`flex flex-col items-center gap-1 py-0.5 text-[11px] ${on ? 'text-olive-800' : 'text-mute'}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-display text-[13px] ${on ? 'bg-olive-700 text-white' : 'bg-sage-100 text-olive-700'}`}>B</span>{label}
              </button>
            )
            return (
              <button key={x} onClick={() => go(x)} className={`relative flex flex-col items-center gap-1 py-1 text-[11px] ${on ? 'text-olive-800' : 'text-mute'}`}>
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

/* ---------- Heute ---------- */
function useMyDay() {
  const [day, setDay] = useState<MyDay | null>(null)
  useEffect(() => { phorest<MyDay>({ action: 'my_day' }).then(setDay) }, [])
  return day
}
function weekDays() {
  const now = new Date(isoDay() + 'T12:00:00Z'), dow = (now.getUTCDay() + 6) % 7
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(now.getTime() + (i - dow) * 864e5); return { d: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i], n: d.getUTCDate(), today: i === dow } })
}
function Today({ open, go }: { open: (s: Sub) => void; go: (t: Tab) => void }) {
  const { me, t, done, read, tasks, news } = useApp()
  const day = useMyDay()
  const [team, setTeam] = useState<TeamToday | null>(null)
  const isLead = me.app_role === 'filialleitung'
  useEffect(() => { if (isLead) phorest<TeamToday>({ action: 'team_today', branch: me.branch_id }).then(setTeam) }, [isLead, me.branch_id])
  const pct = tasks.length ? Math.round((tasks.filter(x => done.has(x.id)).length / tasks.length) * 100) : 0
  const next = tasks.find(x => !done.has(x.id))
  const must = news.filter(n => n.mustRead && !read.has(n.id))
  const shift = day?.shifts?.[0]
  const dateLabel = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return (
    <div className="px-5 pb-10">
      <div className="pt-3 pb-5">
        <p className="text-[13px] text-mute">{dateLabel}</p><h1 className="text-[30px] leading-tight mt-0.5">{t('Hallo')} {me.first}</h1>
      </div>

      <div className="rounded-[16px] bg-olive-800 text-white p-5">
        <p className="font-display text-[40px] leading-none tracking-tight">{!day ? '…' : shift ? `${shift.start} – ${shift.end}` : day.mapped ? t('Frei') : '–'}</p>
        <p className="text-[14px] text-sage-200 mt-2">{t('Studio {name}', { name: me.branch })}{day?.appointments ? ` · ${day.appointments.length} ${t('Termine')}` : ''}</p>
        <div className="mt-5 grid grid-cols-7 gap-1">
          {weekDays().map(d => <div key={d.n} className={`rounded-[10px] py-2 text-center ${d.today ? 'bg-white text-olive-800' : 'text-sage-400'}`}><p className="text-[11px]">{t(d.d)}</p><p className={`font-display text-[16px] mt-0.5 ${d.today ? '' : 'text-white'}`}>{d.n}</p></div>)}
        </div>
      </div>

      <ReadyCard open={open} />
      {must.length > 0 && <div className="mt-3"><List>{must.map(n => (
        <button key={n.id} onClick={() => open({ k: 'news', item: n })} className="w-full text-left px-4 py-3.5 flex items-center gap-3">
          <span className="flex-1 min-w-0"><span className="block rubric !text-[10px] text-brass">{t('Bitte lesen und bestätigen')}</span><span className="block text-[15px] font-medium mt-1 truncate">{n.title}</span></span>
          <ChevronRight size={18} className="text-sage-400 shrink-0" />
        </button>
      ))}</List></div>}

      <Label action={<button onClick={() => go('tasks')} className="text-[13px] text-sage-800">{t('Alle')}</button>}>{t('Tagesaufgaben')}</Label>
      <Card onClick={() => go('tasks')} className="p-4">
        <div className="flex justify-between text-sm"><span>{tasks.filter(x => done.has(x.id)).length} / {tasks.length} {t('erledigt')}</span><span className="text-mute">{pct} %</span></div>
        <div className="mt-2.5 h-[3px] rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-olive-700 rounded-full transition-all" style={{ width: pct + '%' }} /></div>
        {next && <p className="mt-3 text-[13px] text-mute">{t('Als Nächstes:')} <span className="text-ink">{next.title}</span>{next.time && ` · ${next.time}`}</p>}
      </Card>

      <Label action={<button onClick={() => open({ k: 'book' })} className="text-[13px] text-sage-800">{t('Alle Kundentermine')}</button>}>{t('Mein Tag · aus Phorest')}</Label>
      <List>
        {!day && <Empty>{t('Lädt aus Phorest …')}</Empty>}
        {day && !day.ok && <Empty>{t('Phorest ist gerade nicht erreichbar. Bitte später noch einmal öffnen.')}</Empty>}
        {day?.ok && !day.mapped && <Empty>{t('Du bist noch keiner Phorest-Spalte zugeordnet. Das Büro prüft deine Firmen-Mail in Phorest.')}</Empty>}
        {day?.ok && day.mapped && day.appointments.length === 0 && <Empty>{t('Heute keine Termine.')}</Empty>}
        {day?.appointments?.map((a, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            <div className="w-11 shrink-0"><p className="font-display text-[15px]">{a.start}</p><p className="text-xs text-mute">{a.end}</p></div>
            <div className="flex-1 border-l border-line pl-3"><p className="text-[15px]">{a.client}</p><p className="text-[13px] text-mute">{a.service}</p></div>
          </div>
        ))}
      </List>
      {day?.mapped && <p className="mt-2 px-1 text-[11px] text-mute">{t('Aus Phorest · zugeordnet über {email}', { email: me.email })}</p>}

      {isLead && <>
        <Label>{t('Heute im Studio')} · {me.branch}</Label>
        <List>
          {!team && <Empty>{t('Lädt …')}</Empty>}
          {team && !team.ok && <Empty>{t('Phorest ist gerade nicht erreichbar.')}</Empty>}
          {team?.team?.map(p => <Row key={p.name + p.start} title={p.name} sub={t('{start}–{end} · {n} Termine', { start: p.start, end: p.end, n: p.appointments })} right={<span />} />)}
        </List>
      </>}

      <Label action={<button onClick={() => open({ k: 'news-list' })} className="text-[13px] text-sage-800">{t('Alle')}</button>}>{t('News')}</Label>
      <List>{news.filter(n => !n.mustRead).slice(0, 2).map(n => <Row key={n.id} title={n.title} sub={`${n.tag} · ${n.date}`} onClick={() => open({ k: 'news', item: n })} />)}
        {news.filter(n => !n.mustRead).length === 0 && <Empty>{t('Keine News.')}</Empty>}</List>
    </div>
  )
}

/* ---------- News ---------- */
function NewsList({ open }: { open: (s: Sub) => void }) {
  const { read, t, news } = useApp()
  const [f, setF] = useState('Alle')
  const tags = ['Alle', ...new Set(news.map(n => n.tag))]
  return (
    <div className="pb-10"><Title>{t('News')}</Title>
      <div className="px-5"><Chips items={tags} value={f} onChange={setF} label={x => x === 'Alle' ? t('Alle') : x} />
        <div className="mt-4 space-y-3">
          {news.filter(n => f === 'Alle' || n.tag === f).map(n => (
            <Card key={n.id} onClick={() => open({ k: 'news', item: n })} className="p-4">
              <div className="flex items-center gap-2 text-xs text-mute">
                <span className={n.mustRead ? 'text-brass font-medium' : 'text-sage-800'}>{n.tag}</span>·<span>{n.date}</span>·<span className="truncate">{n.audience}</span>
                {n.mustRead && (read.has(n.id) ? <span className="ml-auto flex items-center gap-1 text-sage-800"><Check size={12} />{t('bestätigt')}</span> : <span className="ml-auto w-2 h-2 rounded-full bg-brass" />)}
              </div>
              <p className="mt-1.5 text-[16px] font-medium leading-snug">{n.title}</p><p className="mt-1 text-[14px] text-mute leading-snug">{n.teaser}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
function NewsDetail({ n }: { n: News }) {
  const { read, confirm, openNews, quizzes, t } = useApp()
  const quiz = quizzes.find(q => q.newsId === n.id)
  const [busy, setBusy] = useState(false)
  // „Gelesen & verstanden“ geht erst, nachdem die News geöffnet wurde — das Öffnen wird hier gespeichert.
  useEffect(() => { openNews(n.id) }, [n.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <article className="px-5 pb-10">
      <p className="text-xs text-mute mt-3">{n.tag} · {n.audience} · {n.date}</p>
      <h1 className="mt-2 text-[26px] font-medium tracking-tight leading-tight">{n.title}</h1>
      <p className="mt-2 text-[13px] text-mute">{t('von {name}', { name: n.author })}</p>
      {n.image && <img src={n.image} alt="" className="mt-5 w-full aspect-[3/2] object-cover rounded-[16px] bg-sage-100" />}
      <div className="mt-5 space-y-4 text-[16px] leading-relaxed">{n.body.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>
      {n.wikiCategory && <p className="mt-4 text-[13px] text-sage-800 flex items-center gap-1"><BookOpen size={14} />{t('Auch im Wissen unter {cat} abgelegt', { cat: n.wikiCategory })}</p>}
      {n.mustRead && read.has(n.id) && <div className="mt-8 h-12 rounded-[10px] bg-sage-100 text-olive-800 flex items-center justify-center gap-2 font-medium"><Check size={18} />{t('Gelesen und bestätigt')}</div>}
      {n.mustRead && !read.has(n.id) && !quiz && <div className="mt-8"><Btn disabled={busy} onClick={async () => { setBusy(true); await confirm(n.id); setBusy(false) }}>{t('Gelesen und verstanden')}</Btn></div>}
      {quiz && <QuizRunner quiz={quiz} />}
    </article>
  )
}

/* ---------- Aufgaben ---------- */
function Tasks({ open }: { open: (s: Sub) => void }) {
  const { me, done, toggle, t, tasks, wiki } = useApp()
  const groups = [...new Set(tasks.map(x => x.group))]
  const [photoFor, setPhotoFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const run = async (id: string, f?: File) => { setBusy(id); await toggle(id, f); setBusy(null) }
  return (
    <div className="pb-10"><Title sub={t('Studio {name} · heute', { name: me.branch })}>{t('Aufgaben')}</Title>
      <div className="px-5">
        {tasks.length === 0 && <Card className="p-4 text-[14px] text-mute">{t('Für dein Studio sind heute keine Aufgaben hinterlegt.')}</Card>}
        {groups.map(g => <div key={g}><Label>{g}</Label>
          <List>{tasks.filter(x => x.group === g).map(x => {
            const d = done.get(x.id)
            return (
              <div key={x.id} className="flex items-center gap-3 px-4 py-3.5">
                <button disabled={busy === x.id} onClick={() => x.proof && !d ? setPhotoFor(x.id) : run(x.id)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${d ? 'bg-sage-600 border-sage-600' : 'border-sage-200'} ${busy === x.id ? 'opacity-50' : ''}`}>{d && <Check size={14} className="text-white" strokeWidth={3} />}</button>
                <div className="flex-1 min-w-0">
                  <p className={`text-[15px] ${d ? 'text-mute line-through' : ''}`}>{x.title}</p>
                  <p className="text-xs text-mute mt-0.5 flex items-center gap-2">
                    {d ? <>{d.by} · {d.at}</> : <>{x.time}</>}
                    {x.prio && !d && <span className="text-brass">{t('Wichtig')}</span>}
                    {x.proof && <span className="flex items-center gap-0.5"><Camera size={12} />{t('Foto')}</span>}
                  </p>
                </div>
                {x.articleId && wiki.find(w => w.id === x.articleId) && <button onClick={() => open({ k: 'wiki', item: wiki.find(w => w.id === x.articleId)! })} className="w-8 h-8 rounded-lg bg-sage-50 text-sage-800 flex items-center justify-center shrink-0" title={t('Anleitung im Wissen')}><BookOpen size={15} /></button>}
              </div>
            )
          })}</List></div>)}
        <p className="mt-5 text-xs text-mute">{t('Vorlagen, Wiederholungen und Fotonachweise legt das Büro fest. Jeden Morgen neu, alte Nachweise bleiben gespeichert.')}</p>
      </div>
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => { const f = e.target.files?.[0]; const id = photoFor; e.target.value = ''; if (f && id) { setPhotoFor(null); await run(id, f) } }} />
      {photoFor && <Sheet onClose={() => setPhotoFor(null)}>
        <p className="font-medium text-[17px]">{t('Foto als Nachweis')}</p>
        <p className="mt-1 text-[14px] text-mute">{t('Das Foto wird mit deinem Namen und der Uhrzeit gespeichert.')}</p>
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
type Msg = { me: boolean; t: string; sources?: { id: string; title: string }[]; ticket?: { kind: 'Meldung' | 'Idee'; title: string } }
function AI({ open }: { open: (s: Sub) => void }) {
  const { addTicket, wiki, t } = useApp()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const ideas = ['Was steht heute bei mir an?', 'Lass uns mit dem Onboarding weiterlernen.', 'Wie entferne ich Shellac ohne Nagelschaden?', 'Das Wachsgerät in Kabine 3 ist kaputt']
  useEffect(() => { let q: string | null = null; try { q = sessionStorage.getItem('th-benni-ask'); sessionStorage.removeItem('th-benni-ask') } catch { /* privat */ } if (q) send(q) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (q = v) => {
    if (!q.trim() || busy || !supabase) return
    const history = msgs
    setMsgs(m => [...m, { me: true, t: q }]); setV(''); setBusy(true)
    const { data, error } = await supabase.functions.invoke('assistant', { body: { message: q, history } })
    setMsgs(m => [...m, error || !data?.ok ? { me: false, t: t('Ich bin gerade nicht erreichbar. Bitte versuche es gleich noch einmal.') } : { me: false, t: data.text, sources: data.sources, ticket: data.ticket }])
    setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-5">
        {msgs.length === 0 ? (
          <div className="pt-6">
            <BMark className="w-12 h-12 text-[18px]" />
            <h1 className="mt-5 text-[28px] leading-tight">{t('Frag {name}', { name: ASSISTANT })}</h1>
            <div className="mt-6"><List>{ideas.map(i => <button key={i} onClick={() => send(t(i))} className="w-full text-left px-4 py-3.5 text-[15px] flex items-center gap-3"><span className="flex-1">{t(i)}</span><ArrowUpRight size={16} className="text-sage-400 shrink-0" /></button>)}</List></div>
          </div>
        ) : (
          <div className="pt-3 space-y-3 pb-4">
            {msgs.map((m, i) => (
              <div key={i} className={m.me ? 'flex justify-end' : ''}>
                <div className={`max-w-[88%] rounded-[16px] px-4 py-3 text-[15px] leading-snug ${m.me ? 'bg-olive-700 text-white' : 'bg-white'}`}>{m.t}
                  {m.sources?.map(s => { const a = wiki.find(x => x.id === s.id); return a && <button key={s.id} onClick={() => open({ k: 'wiki', item: a })} className="mt-2 text-[13px] text-sage-800 flex items-center gap-1"><BookOpen size={14} />{s.title}<ArrowUpRight size={13} /></button> })}
                  {m.ticket && <TicketDraft kind={m.ticket.kind} title={m.ticket.title} onSend={() => addTicket({ kind: m.ticket!.kind, title: m.ticket!.title, viaAI: true })} />}
                </div>
              </div>
            ))}
            {busy && <div className="w-16 rounded-[16px] bg-white px-4 py-3 flex gap-1">{[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-sage-400 animate-pulse" style={{ animationDelay: i * 150 + 'ms' }} />)}</div>}
            <div ref={end} />
          </div>
        )}
      </div>
      <div className="sticky bottom-0 px-4 py-3 bg-sage-50/95 flex gap-2">
        <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={t('Frag {name} …', { name: ASSISTANT })} className="flex-1 h-12 rounded-2xl bg-white px-4 text-[15px] outline-none placeholder:text-mute" />
        <button onClick={() => send()} className="w-12 h-12 rounded-2xl bg-olive-700 text-white flex items-center justify-center"><Send size={18} /></button>
      </div>
    </div>
  )
}
function TicketDraft({ kind, title, onSend }: { kind: 'Meldung' | 'Idee'; title: string; onSend: () => Promise<boolean> }) {
  const { t } = useApp()
  const [state, setState] = useState<'draft' | 'busy' | 'sent' | 'error'>('draft')
  return (
    <div className="mt-3 rounded-xl bg-sage-50 p-3">
      <p className="text-xs text-mute">{kind === 'Meldung' ? t('Meldung · Facility') : t('Idee · Büro')}</p><p className="text-[14px] font-medium mt-0.5">{title}</p>
      {state === 'sent' ? <p className="mt-2 text-[13px] text-sage-800 flex items-center gap-1"><Check size={14} />{t('Gesendet, du siehst den Stand unter Melden & Ideen')}</p>
        : <button disabled={state === 'busy'} onClick={async () => { setState('busy'); setState(await onSend() ? 'sent' : 'error') }} className="mt-2.5 h-9 px-4 rounded-full bg-olive-700 text-white text-[13px] disabled:opacity-60">{state === 'error' ? t('Nochmal senden') : kind === 'Meldung' ? t('Meldung senden') : t('Idee senden')}</button>}
    </div>
  )
}

/* ---------- Wissen ---------- */
function Wiki({ open }: { open: (s: Sub) => void }) {
  const { t, wiki, steps, obDone } = useApp()
  const [q, setQ] = useState('')
  const cats = [...new Set(wiki.map(a => a.cat))]
  const hits = wiki.filter(a => [a.title, a.cat, a.intro, ...a.tags, ...a.body].join(' ').toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="pb-10"><Title>{t('Wissen')}</Title>
      <div className="px-5">
        <SearchBox value={q} onChange={setQ} placeholder={t('Suchen, z. B. Wachs')} />
        {!q && steps.length > 0 && <Card onClick={() => open({ k: 'onboarding' })} className="mt-4 p-4 flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-sage-400 text-white flex items-center justify-center"><GraduationCap size={22} /></span>
          <span className="flex-1"><span className="block text-[15px] font-medium">{t('Onboarding für Neue')}</span><span className="block text-xs text-mute mt-0.5">{t('{n} Schritte · {d} von {n} erledigt', { n: steps.length, d: steps.filter(s => obDone.has(s.id)).length })}</span></span>
          <ChevronRight size={18} className="text-sage-400" />
        </Card>}
        {cats.map(c => { const items = hits.filter(a => a.cat === c); if (!items.length) return null
          return <div key={c}><Label>{c}</Label><List>{items.map(a => <Row key={a.id} icon={a.mediaKind === 'video' || a.mediaKind === 'youtube' ? <Video size={17} /> : a.fromNews ? <Newspaper size={17} /> : <BookOpen size={17} />} title={a.title} sub={t('{n} Min. · aktualisiert {date}', { n: a.minutes, date: a.updated })} onClick={() => open({ k: 'wiki', item: a })} />)}</List></div>
        })}
        {q && hits.length === 0 && <p className="mt-6 text-[14px] text-mute">{t('Nichts gefunden. Frag {name} oder schick eine Idee ans Büro.', { name: ASSISTANT })}</p>}
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
  const { quizzes, t } = useApp()
  const quiz = quizzes.find(q => a.fromNews ? q.newsId === a.id.slice(5) : q.articleId === a.id)
  const [full, setFull] = useState<{ body: string; blocks: WikiBlock[] | null } | null>(a.fromNews ? { body: a.body.join('\n\n'), blocks: null } : null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    if (a.fromNews || !supabase) return
    supabase.from('wiki_articles').select('body, blocks').eq('id', a.id).maybeSingle().then(async ({ data }) => {
      setFull({ body: data?.body ?? '', blocks: (data?.blocks as WikiBlock[] | null) ?? null })
      const paths = [...new Set(((data?.blocks ?? []) as WikiBlock[]).filter(b => (b.t === 'img' || b.t === 'file') && b.src).map(b => b.src!))]
      if (a.mediaUrl && !/^https?:/.test(a.mediaUrl)) paths.push(a.mediaUrl)
      if (paths.length) {
        const { data: signed } = await supabase!.storage.from('media').createSignedUrls(paths, 3600)
        setUrls(Object.fromEntries((signed ?? []).filter(x => x.signedUrl && x.path).map(x => [x.path!, x.signedUrl as string])))
      }
    })
  }, [a])
  const yt = a.mediaKind === 'youtube' && a.mediaUrl ? ytId(a.mediaUrl) : null
  const own = a.mediaUrl ? (urls[a.mediaUrl] ?? (/^https?:/.test(a.mediaUrl) ? a.mediaUrl : null)) : null
  return (
    <article className="px-5 pb-10">
      <p className="text-xs text-mute mt-3">{a.cat} · {t('{n} Min. · aktualisiert {date}', { n: a.minutes, date: a.updated })}{a.accessLevel !== 'alle' && <span className="ml-1.5 inline-flex items-center gap-0.5"><Lock size={11} />{a.accessLevel === 'buero' ? t('Büro') : t('Filialleitung')}</span>}</p>
      <h1 className="mt-2 text-[26px] font-medium tracking-tight leading-tight">{a.title}</h1>
      {a.intro && <p className="mt-2 text-[15px] text-mute leading-snug">{a.intro}</p>}
      {yt ? <iframe className="mt-5 w-full aspect-video rounded-[16px]" src={`https://www.youtube-nocookie.com/embed/${yt}`} title={a.title} allow="encrypted-media; picture-in-picture" allowFullScreen />
        : a.mediaKind === 'video' && own ? <video className="mt-5 w-full rounded-[16px] bg-olive-700" src={own} controls playsInline />
        : a.mediaKind === 'photo' && own ? <img className="mt-5 w-full rounded-[16px]" src={own} alt="" /> : null}
      {!full && <p className="mt-6 text-mute">{t('Lädt …')}</p>}
      {full?.blocks ? <div className="mt-5 space-y-3 text-[16px] leading-relaxed">{full.blocks.map((b, i) => {
        switch (b.t) {
          case 'h': return <h2 key={i} className={`${b.level && b.level >= 3 ? 'text-[17px]' : 'text-[20px]'} font-medium tracking-tight pt-3`}>{b.text}</h2>
          case 'p': return <p key={i}><Rich text={b.text ?? ''} /></p>
          case 'quote': return <p key={i} className="border-l-[3px] border-sage-400 pl-3 text-sage-800"><Rich text={b.text ?? ''} /></p>
          case 'ul': case 'ol': { const L = b.t === 'ul' ? 'ul' : 'ol'
            return <L key={i} className={`${b.t === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 space-y-1.5`}>{b.items?.map((x, j) => <li key={j}><Rich text={x} /></li>)}</L> }
          case 'img': return urls[b.src!] ? <img key={i} src={urls[b.src!]} alt="" loading="lazy" className="w-full rounded-[16px] bg-sage-100" /> : <div key={i} className="w-full aspect-[4/3] rounded-[16px] bg-sage-100" />
          case 'video': { const id = b.url ? ytId(b.url) : null
            return id ? <iframe key={i} className="w-full aspect-video rounded-[16px]" src={`https://www.youtube-nocookie.com/embed/${id}`} title={t('Video')} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
              : <a key={i} href={b.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sage-800 underline"><Play size={16} />{t('Video öffnen')}</a> }
          case 'file': return <a key={i} href={urls[b.src!] ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[15px]"><span className="w-9 h-9 rounded-xl bg-sage-50 flex items-center justify-center text-sage-800 shrink-0"><FileText size={17} /></span><span className="flex-1 min-w-0 truncate">{b.name ?? t('Datei')}</span><ArrowUpRight size={16} className="text-sage-400" /></a>
          default: return null
        }
      })}</div> : full && <div className="mt-5 space-y-3 text-[16px] leading-relaxed">{full.body.split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>}
      {quiz && full && <QuizRunner quiz={quiz} />}
    </article>
  )
}
function Onboarding({ open }: { open: (s: Sub) => void }) {
  const { steps, obDone, toggleStep, wiki, t } = useApp()
  return (
    <div className="px-5 pb-10"><h1 className="mt-3 text-[26px] font-medium tracking-tight">{t('Onboarding')}</h1>
      <p className="mt-1 text-[14px] text-mute">{t('Alles für deine ersten Tage. Deine Respo sieht, wie weit du bist.')}</p>
      <Card onClick={() => open({ k: 'install' })} className="mt-4 p-4 flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-olive-700 text-white flex items-center justify-center"><Smartphone size={19} /></span><span className="flex-1"><span className="block text-[15px] font-medium">{t('Zuerst: TeamHub aufs Handy')}</span><span className="block text-xs text-mute">{t('Auf den Home-Bildschirm legen und Mitteilungen einschalten')}</span></span><ChevronRight size={18} className="text-sage-400" /></Card>
      <button onClick={() => { try { sessionStorage.setItem('th-benni-ask', t('Lass uns mit dem Onboarding weiterlernen.')) } catch { /* privat */ } window.dispatchEvent(new Event('th-benni')) }} className="mt-3 w-full rounded-[16px] bg-white p-4 flex items-center gap-3 text-left"><BMark className="w-10 h-10 text-[15px]" /><span className="flex-1"><span className="block text-[15px] font-medium">{t('Mit Benni lernen')}</span><span className="block text-xs text-mute">{t('Schritt für Schritt, mit kurzer Kontrollfrage')}</span></span><ChevronRight size={18} className="text-sage-400" /></button>
      <div className="mt-4 h-[3px] rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-olive-700 transition-all" style={{ width: (steps.length ? steps.filter(s => obDone.has(s.id)).length / steps.length * 100 : 0) + '%' }} /></div>
      <div className="mt-5 space-y-2">
        {steps.map((s, i) => { const art = wiki.find(w => w.id === s.articleId)
          return <div key={s.id} className="rounded-[16px] bg-white p-4 flex items-center gap-3">
            <button onClick={() => toggleStep(s.id)} className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium shrink-0 ${obDone.has(s.id) ? 'bg-sage-600 text-white' : 'bg-sage-50 text-sage-800'}`}>{obDone.has(s.id) ? <Check size={15} /> : i + 1}</button>
            <button onClick={() => art ? open({ k: 'wiki', item: art }) : toggleStep(s.id)} className="flex-1 text-left"><span className="block text-[15px]">{s.title}</span><span className="block text-xs text-mute">{t('{n} Min.', { n: s.minutes })}{art ? ' · ' + t('Artikel öffnen') : ''}</span></button>
          </div> })}
      </div>
    </div>
  )
}

/* ---------- Menü ---------- */
function MenuView({ open, onLogout }: { open: (s: Sub) => void; onLogout: () => void }) {
  const { me, t, tickets, news, read, staff, events, joined } = useApp()
  const unread = news.filter(n => n.mustRead && !read.has(n.id)).length
  const upcoming = events.filter(e => new Date(e.startsAt) > new Date()).length
  const tiles: [string, string, typeof Users, Sub][] = [
    ['News', unread ? t('{n} ungelesen', { n: unread }) : t('alles gelesen'), Newspaper, { k: 'news-list' }], ['Kalender', t('{n} Termine · {m} angemeldet', { n: upcoming, m: joined.size }), CalendarDays, { k: 'events' }],
    ['Team', t('{n} Personen', { n: staff.filter(s => s.active).length }), Users, { k: 'team' }], ['Melden & Ideen', t('{n} offen', { n: tickets.filter(x => x.status !== 'Erledigt').length }), Lightbulb, { k: 'tickets' }],
    ['Posteingang', t('Webmail'), Inbox, { k: 'inbox' }], ['Zeit & Ferien', 'Timebutler', Plane, { k: 'time' }],
  ]
  return (
    <div className="pb-10"><Title>{t('Menü')}</Title>
      <div className="px-5">
        <List>
          <Row title={`${me.first} ${me.last}`} sub={`${me.role} · ${me.branch}`} onClick={() => open({ k: 'me' })} />
        </List>
        <div className="mt-3"><List>
          <Row icon={<CalendarDays size={19} strokeWidth={1.6} />} title={t('Kundentermine')} sub={`${me.app_role === 'buero' ? t('Alle Studios') : t('Dein Studio')} · ${t('live aus Phorest')}`} onClick={() => open({ k: 'book' })} />
          <Row icon={<Search size={19} strokeWidth={1.6} />} title={t('Kundenhistorie')} sub={t('Besuche und Notizen einer Kundin')} onClick={() => open({ k: 'clients' })} />
          {tiles.map(([title, sub, Icon, target]) => <Row key={title} icon={<Icon size={19} strokeWidth={1.6} />} title={t(title)} sub={sub} onClick={() => open(target)} />)}
        </List></div>
        <div className="mt-3"><List>
          <Row icon={<Link2 size={19} strokeWidth={1.6} />} title={t('Verbindungen')} sub={t('Phorest, Timebutler, Postfach')} onClick={() => open({ k: 'conn' })} />
        </List></div>
        <button onClick={onLogout} className="mt-6 flex items-center gap-2 text-[15px] text-mute"><LogOut size={18} />{t('Abmelden')}</button>
      </div>
    </div>
  )
}
export const Avatar = ({ s, photo, size = 'w-10 h-10' }: { s: { first: string; last: string }; photo?: string | null; size?: string }) =>
  photo ? <img src={photo} alt="" className={`${size} rounded-full object-cover shrink-0`} /> : <span className={`${size} rounded-full bg-sage-200 flex items-center justify-center text-sm font-medium text-sage-800 shrink-0`}>{ini(s)}</span>

function Team({ open }: { open: (s: Sub) => void }) {
  const { staff, branches, t } = useApp()
  const [q, setQ] = useState(''), [b, setB] = useState('Alle')
  const list = useMemo(() => staff.filter(s => s.active && (b === 'Alle' || s.branch === b) && `${s.first} ${s.last} ${s.role} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase())), [q, b, staff])
  return (
    <div className="pb-10"><Title>{t('Team')}</Title>
      <div className="px-5 space-y-3"><SearchBox value={q} onChange={setQ} placeholder={t('Name oder Skill, z. B. Pediküre')} /><Chips items={['Alle', ...branches.map(x => x.name)]} value={b} onChange={setB} label={x => x === 'Alle' ? t('Alle') : x} />
        <p className="text-xs text-mute pt-1">{t('{n} Personen', { n: list.length })}</p>
        <List>{list.map(s => <Row key={s.id} icon={<Avatar s={s} photo={s.photo} size="w-9 h-9" />} title={`${s.first} ${s.last}`} sub={`${s.role} · ${s.branch}${s.skills.length ? ' · ' + s.skills.slice(0, 3).join(', ') : ''}`} onClick={() => open({ k: 'profile', item: s })} />)}</List>
      </div>
    </div>
  )
}

/* ---------- Kundenhistorie aus Phorest (Zusammenfassung durch Benni) ---------- */
function ClientHistoryView() {
  const { t } = useApp()
  const [q, setQ] = useState(''), [hits, setHits] = useState<ClientHit[] | null>(null), [h, setH] = useState<ClientHistory | null>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const search = async () => {
    if (q.trim().length < 3 || busy) return
    setBusy(true); setErr(''); setH(null)
    const r = await phorest<{ ok: boolean; clients: ClientHit[] }>({ action: 'client_search', q })
    setBusy(false)
    if (!r.ok) { setErr(t('Phorest ist gerade nicht erreichbar. Bitte später noch einmal öffnen.')); return }
    setHits(r.clients)
  }
  const pick = async (c: ClientHit) => {
    setBusy(true); setErr('')
    const r = await phorest<ClientHistory>({ action: 'client_history', client_id: c.client_id, months: 12, summary: true })
    setBusy(false)
    if (!r.ok) { setErr(t('Phorest ist gerade nicht erreichbar. Bitte später noch einmal öffnen.')); return }
    setH(r)
  }
  const fmt = (d: string) => d ? new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: '2-digit' }).format(new Date(d + 'T12:00:00Z')) : ''
  return (
    <div className="pb-10"><Title>{t('Kundenhistorie')}</Title>
      <div className="px-5">
        {!h && <>
          <div className="flex gap-2"><div className="flex-1"><SearchBox value={q} onChange={setQ} placeholder={t('Name, E-Mail oder Telefon')} /></div>
            <button disabled={busy || q.trim().length < 3} onClick={search} className="h-11 px-4 rounded-[10px] bg-olive-700 text-white text-[14px] disabled:opacity-40">{t('Suchen')}</button></div>
          {err && <p className="mt-3 text-[13px] text-alert">{err}</p>}
          {busy && <p className="mt-4 text-[14px] text-mute">{t('Lädt aus Phorest …')}</p>}
          {hits && !busy && <div className="mt-4"><List>{hits.length === 0 && <Empty>{t('Keine Kundin gefunden.')}</Empty>}
            {hits.map(c => <Row key={c.client_id} title={c.name} sub={[c.since && t('seit {d}', { d: fmt(c.since) }), c.phone_tail && `…${c.phone_tail}`].filter(Boolean).join(' · ')} onClick={() => pick(c)} />)}</List></div>}
        </>}
        {h && <>
          <button onClick={() => setH(null)} className="text-[14px] text-olive-700">{t('Andere Kundin suchen')}</button>
          <h2 className="mt-3 text-[24px] leading-tight">{h.client.name}</h2>
          <p className="text-[13px] text-mute mt-1">{[h.client.since && t('Kundin seit {d}', { d: fmt(h.client.since) }), h.client.last_visit && t('zuletzt {d}', { d: fmt(h.client.last_visit) }), h.client.preferred && t('bevorzugt {n}', { n: h.client.preferred })].filter(Boolean).join(' · ')}</p>
          {h.summary && <div className="mt-5 rounded-[16px] bg-white px-4 py-4"><p className="rubric text-olive-700 flex items-center gap-2"><BMark className="w-5 h-5 text-[10px]" />{t('Zusammenfassung')}</p>
            <div className="mt-2 text-[15px] leading-relaxed space-y-1">{h.summary.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div></div>}
          <Label>{t('Besuche der letzten {n} Monate', { n: h.months })}</Label>
          <List>{h.visits.length === 0 && <Empty>{t('Keine Besuche in diesem Zeitraum.')}</Empty>}{h.visits.map((v, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex justify-between gap-3 text-[14px]"><span className={v.cancelled ? 'line-through text-mute' : ''}>{v.service}</span><span className="text-mute shrink-0">{fmt(v.date)}</span></div>
              <p className="text-xs text-mute mt-0.5">{[v.branch, v.staff, v.cancelled && t('abgesagt')].filter(Boolean).join(' · ')}</p>
              {v.notes && <p className="text-[13px] mt-1.5 text-ink/80 whitespace-pre-wrap">{v.notes}</p>}
            </div>))}</List>
        </>}
      </div>
    </div>
  )
}

/* ---------- Arbeitszeiten der Woche (aus Phorest) ---------- */
function WeekShifts({ id }: { id?: string }) {
  const { t, branches } = useApp()
  const [w, setW] = useState<StaffWeek | null>(null)
  useEffect(() => { setW(null); phorest<StaffWeek>({ action: 'staff_week', employee_id: id }).then(setW) }, [id])
  const days = Array.from({ length: 7 }, (_, i) => isoDay(new Date(Date.now() + i * 864e5)))
  const label = (d: string) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(d + 'T12:00:00Z'))
  if (!w) return <Empty>{t('Lädt aus Phorest …')}</Empty>
  if (!w.ok || !w.mapped) return <Empty>{t('Keine Arbeitszeiten aus Phorest.')}</Empty>
  return <List>{days.map(d => { const x = w.days.filter(s => s.date === d)
    return <div key={d} className="px-4 py-2.5 flex justify-between text-[14px]"><span className="text-ink/80">{label(d)}</span>{x.length ? <span>{x.map(s => `${s.start}–${s.end}${branches.length && x.length > 1 ? ' ' + (branches.find(b => b.id === s.branch_id)?.name ?? '') : ''}`).join(', ')}</span> : <span className="text-mute">{t('frei')}</span>}</div> })}</List>
}
/* ---------- Aushilfe-Tage (Pikett) ---------- */
function StandbyPicker() {
  const { standby, toggleStandby, me, t } = useApp()
  const mine = new Set(standby.filter(x => x.employee_id === me.id).map(x => x.day))
  const days = Array.from({ length: 56 }, (_, i) => isoDay(new Date(Date.now() + (i + 1) * 864e5)))
  const dow = (d: string) => (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7
  const pad = dow(days[0])
  const [busy, setBusy] = useState<string | null>(null)
  return (<div>
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-mute mb-1">{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(x => <span key={x}>{t(x)}</span>)}</div>
    <div className="grid grid-cols-7 gap-1">{Array.from({ length: pad }, (_, i) => <span key={'p' + i} />)}{days.map(d => { const on = mine.has(d), first = d.slice(8) === '01' || d === days[0]
      return <button key={d} disabled={busy === d} onClick={async () => { setBusy(d); await toggleStandby(d); setBusy(null) }} className={`h-10 rounded-[10px] text-[13px] transition ${on ? 'bg-olive-700 text-white' : 'bg-white'} ${busy === d ? 'opacity-50' : ''}`}>
        {first ? new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: 'numeric', month: 'numeric' }).format(new Date(d + 'T12:00:00Z')) : Number(d.slice(8))}</button> })}</div>
    <p className="mt-2 text-xs text-mute">{t('{n} Tage eingetragen', { n: mine.size })}</p>
  </div>)
}

function Profile({ s }: { s: Staff }) {
  const { t } = useApp()
  return (
    <div className="px-5 pb-10 text-center">
      <div className="mt-4 flex justify-center"><Avatar s={s} photo={s.photo} size="w-24 h-24 text-2xl" /></div>
      <h1 className="mt-4 text-[24px] font-medium tracking-tight">{s.first} {s.last}</h1><p className="text-mute">{s.role} · {t('Studio {name}', { name: s.branch })}</p>
      <div className="mt-6 text-left"><Label>{t('Skills')}</Label>{s.skills.length ? <div className="flex flex-wrap gap-2">{s.skills.map(k => <span key={k} className="px-3 h-8 rounded-full bg-white text-[13px] flex items-center">{k}</span>)}</div> : <p className="text-[14px] text-mute">{t('Noch keine Skills eingetragen.')}</p>}
        <Label>{t('Arbeitszeiten diese Woche')}</Label><WeekShifts id={s.id} />
        <div className="mt-6 grid gap-2">{s.phone && <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="w-full h-12 rounded-[10px] font-medium flex items-center justify-center gap-2 bg-olive-700 text-white"><Phone size={16} />{t('Anrufen')}</a>}
          <a href={`mailto:${s.email}`} className="w-full h-12 rounded-[10px] font-medium flex items-center justify-center gap-2 bg-white text-ink"><Send size={16} />{t('E-Mail schreiben')}</a></div></div>
    </div>
  )
}
function MyProfile() {
  const { me, skills, setSkills, photo, setPhotoFile, lang, setLang, skillCatalog, t } = useApp()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const tog = (k: string) => setSkills(skills.includes(k) ? skills.filter(x => x !== k) : [...skills, k])
  return (
    <div className="px-5 pb-10">
      <div className="mt-3 flex flex-col items-center">
        <button onClick={() => file.current?.click()} className={`relative ${busy ? 'opacity-50' : ''}`}><Avatar s={me} photo={photo} size="w-24 h-24 text-2xl" />
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-olive-700 text-white flex items-center justify-center border-2 border-paper"><Camera size={14} /></span></button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { setBusy(true); await setPhotoFile(f); setBusy(false) } }} />
        <h1 className="mt-4 text-[24px] font-medium tracking-tight">{me.first} {me.last}</h1><p className="text-mute">{me.role} · {t('Studio {name}', { name: me.branch })}</p>
      </div>
      <Label>{t('Meine Skills')}</Label>
      <div className="flex flex-wrap gap-2">{skillCatalog.map(k => <button key={k} onClick={() => tog(k)} className={`px-3 h-8 rounded-full text-[13px] ${skills.includes(k) ? 'bg-olive-700 text-white' : 'bg-white'}`}>{k}</button>)}</div>
      <p className="mt-3 text-xs text-mute">{t('Die Skill-Liste gibt das Büro vor. Kolleginnen finden dich darüber.')}</p>
      <Label>{t('Meine Arbeitszeiten')}</Label>
      <WeekShifts />
      <Label>{t('Ich kann aushelfen an')}</Label>
      <StandbyPicker />
      <Label>{t('Mitteilungen')}</Label>
      <PushToggle />
      <Label>{t('Sprache')}</Label>
      <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-white">{([['DE', 'Deutsch'], ['EN', 'English'], ['FR', 'Français']] as [Lang, string][]).map(([k, l]) => <button key={k} onClick={() => setLang(k)} className={`h-10 rounded-xl text-[14px] ${lang === k ? 'bg-olive-700 text-white' : ''}`}>{l}</button>)}</div>
    </div>
  )
}

function Tickets({ open }: { open: (s: Sub) => void }) {
  const { tickets, addTicket, toggleVote, me, t } = useApp()
  const [kind, setKind] = useState<'Meldung' | 'Idee'>('Meldung'), [text, setText] = useState(''), [ok, setOk] = useState(''), [photo, setPhoto] = useState<File | null>(null), [busy, setBusy] = useState(false)
  const [view, setView] = useState<'offen' | 'erledigt'>('offen')
  const file = useRef<HTMLInputElement>(null)
  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true); const good = await addTicket({ kind, title: text.trim(), photo: photo ?? undefined }); setBusy(false)
    if (good) { setText(''); setPhoto(null); setOk(t('Gesendet. Du siehst hier, was daraus wird.')) } else setOk(t('Das hat nicht geklappt. Bitte versuche es noch einmal.'))
    setTimeout(() => setOk(''), 3000)
  }
  // Die Datenbank liefert nur, was diese Person sehen darf: eigene Meldungen, Ideen des Teams, als Leitung das Studio
  const list = tickets.filter(x => view === 'offen' ? x.status !== 'Erledigt' : x.status === 'Erledigt')
    .sort((a, b) => (b.kind === 'Idee' ? b.votes : 0) - (a.kind === 'Idee' ? a.votes : 0))
  const isVideo = photo?.type.startsWith('video')
  return (
    <div className="pb-10"><Title>{t('Melden & Ideen')}</Title>
      <div className="px-5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-[12px] bg-white">
          {(['Meldung', 'Idee'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={`h-10 rounded-[10px] text-[14px] flex items-center justify-center gap-1.5 transition ${kind === k ? 'bg-olive-700 text-white' : ''}`}>{k === 'Meldung' ? <AlertTriangle size={15} /> : <Lightbulb size={15} />}{t(k)}</button>)}
        </div>
        <Card className="mt-3 p-4">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={kind === 'Meldung' ? t('Was ist kaputt oder fehlt?') : t('Was könnten wir besser machen?')} className="w-full resize-none outline-none text-[15px] placeholder:text-mute bg-transparent" />
          <div className="mt-2 flex items-center justify-between text-[13px] text-mute">
            <span className="flex items-center gap-3"><button onClick={() => file.current?.click()} className={`flex items-center gap-1 ${photo ? 'text-olive-700' : ''}`}>{isVideo ? <Video size={15} /> : <Camera size={15} />}{photo ? (isVideo ? t('Video dabei') : t('Foto dabei')) : t('Foto oder Video')}</button><span className="flex items-center gap-1"><MapPin size={15} />{me.branch}</span></span>
            <button disabled={busy} onClick={submit} className="h-9 px-4 rounded-[10px] bg-olive-700 text-white flex items-center gap-1.5 disabled:opacity-60"><Send size={13} />{t('Senden')}</button>
          </div>
          <input ref={file} type="file" accept="image/*,video/*" className="hidden" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
        </Card>
        {ok && <p className="mt-2 text-xs text-mute">{ok}</p>}
        <div className="mt-8 mb-2.5 px-1 flex items-center justify-between"><h2 className="rubric text-ink/70">{t('Verlauf')}</h2>
          <div className="flex gap-1 p-0.5 rounded-[8px] bg-white">{(['offen', 'erledigt'] as const).map(k => <button key={k} onClick={() => setView(k)} className={`h-7 px-2.5 rounded-[6px] text-[12px] transition ${view === k ? 'bg-olive-700 text-white' : 'text-ink/60'}`}>{t(k === 'offen' ? 'Offen' : 'Erledigt')}</button>)}</div></div>
        <List>{list.length === 0 && <Empty>{view === 'offen' ? t('Nichts offen.') : t('Noch nichts erledigt.')}</Empty>}{list.map(x => (
          <div key={x.id} className="px-4 py-3 flex gap-3 items-start">
            <button onClick={() => open({ k: 'ticket', id: x.id })} className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 text-xs text-mute"><span className="text-olive-700">{t(x.kind)}</span>·<span>{x.branch}</span>·<span>{x.when}</span>{!x.mine && <span>· {x.who}</span>}</div>
              <p className="text-[15px] mt-1">{x.title}</p>
              <p className="text-xs mt-1 flex items-center gap-2"><Status s={x.status} />{x.assignee && <span className="text-mute">· {x.assignee}</span>}{x.comments.length > 0 && <span className="text-mute">· {t('{n} Kommentare', { n: x.comments.length })}</span>}</p>
            </button>
            {x.kind === 'Idee' && <button onClick={() => toggleVote(x.id)} aria-pressed={x.voted} className={`shrink-0 w-11 py-1.5 rounded-[10px] flex flex-col items-center text-[12px] transition ${x.voted ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/70'}`}><ThumbsUp size={14} />{x.votes}</button>}
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
      {x.body && <p className="mt-2 text-[15px] whitespace-pre-wrap">{x.body}</p>}
      <p className="mt-2 text-[13px] text-mute flex items-center gap-2"><Status s={x.status} />{x.assignee && <span>· {x.assignee}</span>}<span>· {x.who}, {x.when}</span></p>
      {x.photo && <div className="mt-4"><Media tk={x} /></div>}
      {x.kind === 'Idee' && <button onClick={() => toggleVote(x.id)} className={`mt-4 h-10 px-4 rounded-[10px] text-[14px] flex items-center gap-2 transition ${x.voted ? 'bg-olive-700 text-white' : 'bg-white'}`}><ThumbsUp size={15} />{x.voted ? t('Du unterstützt das') : t('Unterstützen')} · {x.votes}</button>}
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
          <p className="mt-1 text-[14px] text-mute">{tb ? t('Melde dich dort mit deinem Timebutler-Zugang an. TeamHub speichert dafür kein Passwort.') : t('Melde dich mit {email} und deinem Postfach-Passwort an. TeamHub speichert dafür kein Passwort.', { email: me.email })}</p>
          <div className="mt-4 space-y-2">
            {tb && app && <a href={app} target="_blank" rel="noreferrer" className="h-12 rounded-2xl bg-olive-700 text-white flex items-center justify-center gap-2 text-[15px] font-medium">{t('Timebutler-App öffnen oder installieren')}</a>}
            <a href={tb ? TOOL_LINKS.timebutlerWeb : TOOL_LINKS.webmail} target="_blank" rel="noreferrer" className={`h-12 rounded-2xl flex items-center justify-center gap-2 text-[15px] font-medium ${tb && app ? 'bg-white border border-sage-200' : 'bg-olive-700 text-white'}`}>{t('Im Browser öffnen')}<ExternalLink size={16} /></a>
          </div>
        </Card>
        <p className="px-1 text-xs text-mute">{tb ? t('Wo steht was: Kundentermine und Schichten kommen aus Phorest, Schulungen und Events aus TeamHub, Ferien und Arbeitszeit aus Timebutler.') : t('Der Posteingang direkt im TeamHub folgt in einem späteren Schritt.')}</p>
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
        <p className="text-[14px] text-mute -mt-2 mb-4">{t('Deine Konten in anderen Tools.')}</p>
        <List>{rows.map(c => (
          <div key={c.k} className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-medium" style={{ background: c.color }}>{c.logo}</span>
            <span className="flex-1 min-w-0"><span className="block text-[15px] font-medium">{c.name}</span><span className="block text-xs text-mute truncate">{c.what}</span></span>
            {c.on ? <span className="flex items-center gap-1 text-[13px] text-sage-800"><Check size={15} />{t('Aktiv')}</span> : 'link' in c ? <a href={c.k === 'mail' ? TOOL_LINKS.webmail : TOOL_LINKS.timebutlerWeb} target="_blank" rel="noreferrer" className="text-[13px] text-sage-800 flex items-center gap-1">{t('Öffnen')}<ExternalLink size={13} /></a> : <span className="text-[13px] text-mute flex items-center gap-1"><Lock size={13} />{c.k === 'phorest' ? t('offen') : t('bald')}</span>}
          </div>
        ))}</List>
        <p className="mt-3 text-xs text-mute">{t('Phorest braucht keine eigene Anmeldung. TeamHub erkennt dich über deine Firmen-Mail und zeigt dir deine eigenen Termine.')}</p>
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
  if (hide || st === null || (isStandalone() && (st === 'on' || st === 'unsupported'))) return null
  const label = !isStandalone() ? t('Auf den Home-Bildschirm legen') : t('Mitteilungen einschalten')
  return (
    <div className="mt-3 rounded-[16px] bg-white px-4 py-3.5 flex gap-3 items-center">
      <button onClick={() => open({ k: 'install' })} className="flex-1 text-left text-[15px] text-olive-700 font-medium">{label}</button>
      <button onClick={() => { setHide(true); try { localStorage.setItem('th-ready-hide', '1') } catch { /* privat */ } }} className="text-[13px] text-mute">{t('Später')}</button>
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
  if (!st) return <Card className="p-4 text-[14px] text-mute">…</Card>
  return (
    <Card className="p-4">
      <p className="text-[14px]">{info[st]}</p>
      <div className="mt-3 flex gap-2">
        {st === 'off' && <button disabled={busy} onClick={async () => { setBusy(true); const r = await enablePush(me.id); setBusy(false); refresh(); if (r === 'denied') setMsg(t('Du hast Mitteilungen abgelehnt.')) }} className="h-10 px-4 rounded-full bg-olive-700 text-white text-[14px] disabled:opacity-60">{t('Einschalten')}</button>}
        {st === 'on' && <><button disabled={busy} onClick={async () => { setBusy(true); const ok = await testPush(); setBusy(false); setMsg(ok ? t('Probe-Mitteilung ist unterwegs.') : t('Konnte keine Probe senden.')) }} className="h-10 px-4 rounded-full bg-white border border-sage-200 text-[14px]">{t('Probe senden')}</button>
          <button onClick={async () => { await disablePush(); refresh() }} className="h-10 px-4 rounded-full text-[14px] text-mute">{t('Ausschalten')}</button></>}
      </div>
      {msg && <p className="mt-2 text-[13px] text-mute">{msg}</p>}
    </Card>
  )
}
function Install() {
  const { t } = useApp()
  const [st, refresh] = usePush()
  const standalone = isStandalone(), ios = isIOS(), android = isAndroid()
  const Step = ({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) => (
    <div className="flex gap-3 items-start px-4 py-3.5"><span className="w-7 h-7 rounded-full bg-sage-50 text-sage-800 text-[13px] font-medium flex items-center justify-center shrink-0">{n}</span><span className="flex-1 text-[15px]">{children}</span><span className="text-sage-800">{icon}</span></div>
  )
  return (
    <div className="pb-10"><Title sub={t('In zwei Minuten erledigt')}>{t('TeamHub aufs Handy')}</Title>
      <div className="px-5 space-y-3">
        <Card className="p-4 flex items-center gap-3"><span className={`w-8 h-8 rounded-full flex items-center justify-center ${standalone ? 'bg-sage-600 text-white' : 'bg-sage-50 text-sage-800'}`}>{standalone ? <Check size={15} /> : 1}</span><span className="flex-1 text-[15px]">{standalone ? t('Liegt auf dem Home-Bildschirm') : t('Auf den Home-Bildschirm legen')}</span></Card>
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
        <Card className="p-4 flex items-center gap-3"><span className={`w-8 h-8 rounded-full flex items-center justify-center ${st === 'on' ? 'bg-sage-600 text-white' : 'bg-sage-50 text-sage-800'}`}>{st === 'on' ? <Check size={15} /> : 2}</span><span className="flex-1 text-[15px]">{t('Mitteilungen einschalten')}</span></Card>
        <PushToggle />
        <p className="text-xs text-mute px-1">{t('Ohne Mitteilungen geht nichts verloren: Pflicht-News und Aufgaben stehen immer auf „Heute“. Deine Respo sieht im Backoffice, wer startklar ist.')}</p>
      </div>
    </div>
  )
}
