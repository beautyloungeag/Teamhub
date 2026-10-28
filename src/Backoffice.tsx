import { useEffect, useRef, useState } from 'react'
import { Menu, LayoutDashboard, LifeBuoy, GraduationCap, Smartphone, Newspaper, ListChecks, Lightbulb, CalendarDays, Users, BookOpen, CalendarClock, TrendingUp, MessageCircle, Settings as SettingsIcon } from 'lucide-react'
import { ChatHub, ChatRoom, useChatUnread } from './Chats'
import { Terminbuch } from './Calendar'
import { useApp } from './store'
import { startParams } from './lib/start'
import { ASSISTANT } from './Mobile'

import { BMark } from './Logo'
import { SideNav } from './Nav'
import { useAuth } from './lib/auth'
import { BenniChat } from './BenniChat'
import { TeamAdmin } from './admin/Team'
import { TasksAdmin } from './admin/Tasks'
import { EventsAdmin } from './admin/Events'
import { StandbyAdmin } from './admin/Standby'
import { LearnAdmin } from './admin/Learn'
import { NewsAdmin } from './admin/News'
import { TicketsAdmin } from './admin/Tickets'
import { Overview } from './admin/Overview'
import { SettingsAdmin } from './admin/Settings'
import { StudioPerformance } from './Performance'
import { ProfileAdmin } from './admin/Profile'
import { WikiAdmin } from './admin/Wiki'

import { H } from './admin/kit'
import { confirmLeave } from './lib/unsaved'
import { useCompact, labelTables } from './lib/compact'
import { OnComputer } from './admin/kit'

type View = 'overview' | 'book' | 'news' | 'chats' | 'tasks' | 'tickets' | 'events' | 'standby' | 'learn' | 'team' | 'performance' | 'wiki' | 'settings' | 'benni' | 'me'
const NAV: [View, string, typeof Users][] = [['overview', 'Übersicht', LayoutDashboard], ['book', 'Kundentermine', CalendarClock], ['news', 'News', Newspaper], ['chats', 'Chats', MessageCircle], ['tasks', 'Aufgaben', ListChecks], ['tickets', 'Meldungen & Ideen', Lightbulb], ['events', 'Schulungen & Events', CalendarDays], ['standby', 'Aushilfe', LifeBuoy], ['learn', 'Lernen', GraduationCap], ['team', 'Team', Users], ['performance', 'Performance', TrendingUp], ['wiki', 'Wissen', BookOpen], ['settings', 'Einstellungen', SettingsIcon]]

export default function Backoffice({ onSwitch }: { onSwitch?: () => void }) {
  const { me } = useApp()
  const { signOut } = useAuth()
  const [v, setV] = useState<View>(() => (startParams.get('bo') as View | null) ?? 'overview')
  const chatUnread = useChatUnread()
  useEffect(() => { if (startParams.has('bo') && location.search.includes('bo=')) history.replaceState(null, '', '/') }, [])
  // Filialleitung gestaltet für ihr Studio (News, Termine, Checklisten, Quiz zu eigenen News); Wissen und Studios pflegt das Büro.
  const nav = me.app_role === 'buero' ? NAV : NAV.filter(([k]) => ['overview', 'book', 'news', 'chats', 'tasks', 'tickets', 'events', 'standby', 'learn', 'team', 'performance', 'settings'].includes(k))
  const allowed = new Set(nav.map(([k]) => k))
  const go = (k: View) => { if (allowed.has(k) && confirmLeave()) setV(k) }
  // Menüwechsel fragt nach, wenn im Wissen-Editor noch etwas ungespeichert ist (27.10.)
  const to = (k: View) => { if (k !== v && !confirmLeave()) return; setV(k) }
  useEffect(() => { const f = () => setV('benni'); window.addEventListener('th-benni-office', f); return () => window.removeEventListener('th-benni-office', f) }, [])
  useEffect(() => { if (!allowed.has(v) && v !== 'benni' && v !== 'me') setV('overview') }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  // Handy und schmales Tablet (28.10.): Kopfzeile mit Menü statt Seitenleiste, Tabellen als Listen
  const compact = useCompact()
  const [drawer, setDrawer] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = mainRef.current; if (!el) return
    let raf = 0
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => labelTables(el)) }
    run()
    const mo = new MutationObserver(run); mo.observe(el, { childList: true, subtree: true })
    return () => { mo.disconnect(); cancelAnimationFrame(raf) }
  }, [])
  // Neue Seite beginnt oben (am Handy blieb sonst die Scrollposition der vorigen stehen)
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [v])
  const label = v === 'benni' ? `Frag ${ASSISTANT}` : v === 'me' ? 'Mein Profil' : NAV.find(([k]) => k === v)?.[1] ?? ''
  const closing = (f: () => void) => () => { setDrawer(false); f() }
  const navItems = nav.map(([k, l, I]) => ({ key: k, label: l, active: v === k, dot: k === 'chats' && chatUnread > 0, onClick: () => to(k), icon: <I size={18} strokeWidth={1.6} /> }))
  const extra = [...(onSwitch ? [{ key: 'switch', label: 'Mitarbeiterin-App', icon: <Smartphone size={18} strokeWidth={1.6} />, onClick: () => { if (confirmLeave()) onSwitch() } }] : []),
    { key: 'ai', label: `Frag ${ASSISTANT}`, active: v === 'benni', icon: <BMark className="w-[18px] h-[18px]" />, onClick: () => to('benni') }]
  // Am Handy vorerst nur am Computer: Wissen-Editor, Performance und Einstellungen (mit Protokoll); trotzdem öffnen geht
  const heavy = compact && (v === 'wiki' || v === 'performance' || v === 'settings')
  return (
    <div className="flex flex-col min-[900px]:flex-row h-full bg-white overflow-hidden">
      <div className="hidden min-[900px]:flex">
        <SideNav items={navItems} extra={extra} onProfile={() => to('me')} profileActive={v === 'me'} onLogout={signOut} />
      </div>
      <div className="office-topbar min-[900px]:hidden shrink-0 flex items-center gap-1 px-2 pb-1 border-b border-line bg-white">
        <button onClick={() => setDrawer(true)} aria-label="Menü öffnen" className="w-11 h-11 rounded-[10px] flex items-center justify-center text-ink hover:bg-sage-50"><Menu size={22} strokeWidth={1.8} />{chatUnread > 0 && <span className="sr-only">Ungelesene Chats</span>}</button>
        <p className="flex-1 min-w-0 truncate text-[17px] font-medium">{label}</p>
        {onSwitch && <button onClick={() => { if (confirmLeave()) onSwitch() }} className="h-10 px-3 rounded-[10px] bg-sage-50 text-[14px] flex items-center gap-1.5 shrink-0"><Smartphone size={16} strokeWidth={1.7} />App</button>}
      </div>
      {drawer && <div className="office-drawer min-[900px]:hidden fixed inset-0 z-50 flex" onClick={() => setDrawer(false)}>
        <div className="absolute inset-0 bg-ink/30" />
        <div className="relative h-full flex" onClick={e => e.stopPropagation()}>
          <SideNav drawer items={navItems.map(e => ({ ...e, onClick: closing(e.onClick) }))} extra={extra.map(e => ({ ...e, onClick: closing(e.onClick) }))}
            onProfile={closing(() => to('me'))} profileActive={v === 'me'} onLogout={signOut} onClose={() => setDrawer(false)} />
        </div>
      </div>}
      <main ref={mainRef} className={`flex-1 min-h-0 min-w-0 no-scrollbar ${v === 'benni' || v === 'chats' ? 'overflow-hidden bg-sage-50' : v === 'book' ? 'p-4 min-[900px]:p-8 flex flex-col overflow-hidden' : 'p-4 pb-10 min-[900px]:p-8 overflow-y-auto overflow-x-hidden'}`}>
        {heavy && <OnComputer key={v} title={v === 'wiki' ? 'Wissen bearbeitest du besser am Computer' : v === 'performance' ? 'Performance ist am Computer übersichtlicher' : 'Einstellungen und Protokoll am Computer'} hint={v === 'wiki' ? `Einen Artikel kann dir auch ${ASSISTANT} schreiben, mit Text, Fotos oder einem Dokument.` : v === 'performance' && me.app_role === 'filialleitung' ? 'Deine eigenen Zahlen siehst du in der App unter Menü.' : undefined} marc={`Frag ${ASSISTANT}`} onMarc={v === 'wiki' ? () => to('benni') : undefined}>{inner()}</OnComputer>}
        {!heavy && inner()}
      </main>
    </div>
  )
  function inner() {
    return <>
        {v === 'benni' && <BenniChat variant="app" backoffice />}
        {v === 'chats' && <OfficeChats compact={compact} onMarc={() => to('benni')} onTickets={() => to('tickets')} />}
        {v === 'me' && <ProfileAdmin onSettings={() => setV('settings')} />}
        {v === 'book' && <><H>Kundentermine</H><div className="flex-1 min-h-0"><Terminbuch /></div></>}
        {v === 'overview' && <Overview go={go} can={k => allowed.has(k as View)} />}{allowed.has('news') && v === 'news' && <NewsAdmin />}{v === 'tasks' && <TasksAdmin />}
        {v === 'tickets' && <TicketsAdmin />}{v === 'standby' && <StandbyAdmin />}{v === 'learn' && <LearnAdmin />}{v === 'events' && <EventsAdmin />}{allowed.has('team') && v === 'team' && <TeamAdmin />}{v === 'performance' && <StudioPerformance header={a => <H info="Kennzahlen aus Phorest je Person, Teamziele und neueste Bewertungen. Mitarbeiterinnen sehen in der App nur ihre eigenen Zahlen und die Teamziele." action={a}>Performance</H>} />}{allowed.has('wiki') && v === 'wiki' && <WikiAdmin />}{v === 'settings' && <SettingsAdmin />}
    </>
  }
}


// Chats im Backoffice (Matteo 28.10.: „finde ich am Computer nicht“): Liste links, offener Chat rechts
// Am Handy eins nach dem anderen: Liste, dann der Chat mit Zurück
function OfficeChats({ onMarc, onTickets, compact }: { onMarc: () => void; onTickets: () => void; compact: boolean }) {
  const [room, setRoom] = useState<string | null>(null)
  if (compact) return <div className="h-full min-h-0 flex flex-col">{room ? <ChatRoom key={room} id={room} onBack={() => setRoom(null)} />
    : <div className="h-full overflow-y-auto no-scrollbar pt-4"><ChatHub compact active={room} onOpenMarc={onMarc} onOpenTickets={onTickets} onOpenRoom={setRoom} /></div>}</div>
  return <div className="h-full grid grid-cols-[420px_minmax(0,1fr)]">
    <div className="h-full overflow-y-auto no-scrollbar border-r border-line pt-6"><ChatHub compact active={room} onOpenMarc={onMarc} onOpenTickets={onTickets} onOpenRoom={setRoom} /></div>
    <div className="h-full min-h-0 bg-white">{room ? <ChatRoom key={room} id={room} embedded onBack={() => setRoom(null)} />
      : <div className="h-full flex items-center justify-center text-[15px] text-mute">Wähle links einen Chat.</div>}</div>
  </div>
}
