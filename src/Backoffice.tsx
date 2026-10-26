import { useEffect, useState } from 'react'
import { LayoutDashboard, LifeBuoy, GraduationCap, Smartphone, Newspaper, ListChecks, Lightbulb, CalendarDays, Users, BookOpen, CalendarClock, TrendingUp, Settings as SettingsIcon } from 'lucide-react'
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

type View = 'overview' | 'book' | 'news' | 'tasks' | 'tickets' | 'events' | 'standby' | 'learn' | 'team' | 'performance' | 'wiki' | 'settings' | 'benni' | 'me'
const NAV: [View, string, typeof Users][] = [['overview', 'Übersicht', LayoutDashboard], ['book', 'Kundentermine', CalendarClock], ['news', 'News', Newspaper], ['tasks', 'Aufgaben', ListChecks], ['tickets', 'Meldungen & Ideen', Lightbulb], ['events', 'Schulungen & Events', CalendarDays], ['standby', 'Aushilfe', LifeBuoy], ['learn', 'Lernen', GraduationCap], ['team', 'Team', Users], ['performance', 'Performance', TrendingUp], ['wiki', 'Wissen', BookOpen], ['settings', 'Einstellungen', SettingsIcon]]

export default function Backoffice({ onSwitch }: { onSwitch?: () => void }) {
  const { me } = useApp()
  const { signOut } = useAuth()
  const [v, setV] = useState<View>(() => (startParams.get('bo') as View | null) ?? 'overview')
  useEffect(() => { if (startParams.has('bo') && location.search.includes('bo=')) history.replaceState(null, '', '/') }, [])
  // Filialleitung gestaltet für ihr Studio (News, Termine, Checklisten, Quiz zu eigenen News); Wissen und Studios pflegt das Büro.
  const nav = me.app_role === 'buero' ? NAV : NAV.filter(([k]) => ['overview', 'book', 'news', 'tasks', 'tickets', 'events', 'standby', 'learn', 'team', 'performance', 'settings'].includes(k))
  const allowed = new Set(nav.map(([k]) => k))
  const go = (k: View) => { if (allowed.has(k)) setV(k) }
  useEffect(() => { const f = () => setV('benni'); window.addEventListener('th-benni-office', f); return () => window.removeEventListener('th-benni-office', f) }, [])
  useEffect(() => { if (!allowed.has(v) && v !== 'benni' && v !== 'me') setV('overview') }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex h-full bg-white overflow-hidden">
      <SideNav
        items={nav.map(([k, l, I]) => ({ key: k, label: l, active: v === k, onClick: () => setV(k), icon: <I size={18} strokeWidth={1.6} /> }))}
        extra={[...(onSwitch ? [{ key: 'switch', label: 'Mitarbeiterin-App', icon: <Smartphone size={18} strokeWidth={1.6} />, onClick: onSwitch }] : []),
          { key: 'ai', label: `Frag ${ASSISTANT}`, active: v === 'benni', icon: <BMark className="w-[18px] h-[18px]" />, onClick: () => setV('benni') }]}
        onProfile={() => setV('me')} profileActive={v === 'me'} onLogout={signOut} />
      <main className={`flex-1 no-scrollbar ${v === 'benni' ? 'overflow-hidden bg-sage-50' : v === 'book' ? 'p-8 flex flex-col overflow-hidden' : 'p-8 overflow-y-auto'}`}>
        {v === 'benni' && <BenniChat variant="app" backoffice />}
        {v === 'me' && <ProfileAdmin onSettings={() => setV('settings')} />}
        {v === 'book' && <><H>Kundentermine</H><div className="flex-1 min-h-0"><Terminbuch /></div></>}
        {v === 'overview' && <Overview go={go} can={k => allowed.has(k as View)} />}{allowed.has('news') && v === 'news' && <NewsAdmin />}{v === 'tasks' && <TasksAdmin />}
        {v === 'tickets' && <TicketsAdmin />}{v === 'standby' && <StandbyAdmin />}{v === 'learn' && <LearnAdmin />}{v === 'events' && <EventsAdmin />}{allowed.has('team') && v === 'team' && <TeamAdmin />}{v === 'performance' && <StudioPerformance header={a => <H info="Kennzahlen aus Phorest je Person, Teamziele und neueste Bewertungen. Mitarbeiterinnen sehen in der App nur ihre eigenen Zahlen und die Teamziele." action={a}>Performance</H>} />}{allowed.has('wiki') && v === 'wiki' && <WikiAdmin />}{v === 'settings' && <SettingsAdmin />}
      </main>
    </div>
  )
}

