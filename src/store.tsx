import { createContext, useContext, useState, type ReactNode } from 'react'
import { STAFF, type Staff } from './staff'
import { TICKETS, EVENTS, type Ticket } from './data'

export type Lang = 'DE' | 'EN' | 'FR'
const DICT: Record<string, [string, string]> = {
  'Heute': ['Today', "Aujourd'hui"], 'Aufgaben': ['Tasks', 'Tâches'], 'KI': ['AI', 'IA'], 'Wissen': ['Knowledge', 'Savoir'], 'Menü': ['Menu', 'Menu'],
  'News': ['News', 'Actualités'], 'Team': ['Team', 'Équipe'], 'Kalender': ['Calendar', 'Calendrier'], 'Melden & Ideen': ['Report & ideas', 'Signaler & idées'],
  'Posteingang': ['Inbox', 'Boîte de réception'], 'Zeit & Ferien': ['Time & holidays', 'Temps & congés'], 'Mein Profil': ['My profile', 'Mon profil'],
  'Hallo': ['Hello', 'Bonjour'], 'Deine Schicht heute': ['Your shift today', "Ton service aujourd'hui"], 'Termine': ['Appointments', 'Rendez-vous'],
  'Bitte lesen und bestätigen': ['Please read and confirm', 'Merci de lire et confirmer'], 'Tagesaufgaben': ['Daily tasks', 'Tâches du jour'],
  'Mein Tag · aus Phorest': ['My day · from Phorest', 'Ma journée · de Phorest'], 'erledigt': ['done', 'fait'], 'Zurück': ['Back', 'Retour'],
  'Gelesen und verstanden': ['Read and understood', 'Lu et compris'], 'Anmelden': ['Sign in', 'Se connecter'], 'Anmeldecode senden': ['Send sign-in code', 'Envoyer le code'],
  'Diese Woche': ['This week', 'Cette semaine'], 'Heute im Studio': ['In the studio today', "Au studio aujourd'hui"], 'Alle': ['All', 'Tous'], 'Abmelden': ['Sign out', 'Se déconnecter'],
  'Onboarding': ['Onboarding', 'Intégration'], 'Suchen': ['Search', 'Rechercher'],
}

type Ctx = {
  me: Staff; setMe: (s: Staff) => void
  lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string
  read: Set<number>; confirm: (id: number) => void
  done: Map<number, string>; toggle: (id: number) => void
  tickets: Ticket[]; addTicket: (t: Omit<Ticket, 'id' | 'when' | 'status'>) => void; assign: (id: number, a: string) => void; setStatus: (id: number, s: Ticket['status']) => void
  joined: Set<number>; toggleEvent: (id: number) => void
  skills: string[]; setSkills: (s: string[]) => void
  photo: string | null; setPhoto: (p: string | null) => void
  conn: Record<string, boolean>; connect: (k: string, v: boolean) => void
}
const C = createContext<Ctx | null>(null)
export const useApp = () => useContext(C)!

const now = () => new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Staff>(STAFF.find(s => s.first === 'Bea') ?? STAFF[0])
  const [lang, setLang] = useState<Lang>('DE')
  const [read, setRead] = useState(new Set([2, 3, 4]))
  const [done, setDone] = useState(new Map([[1, '07:44'], [2, '07:52'], [3, '07:58']]))
  const [tickets, setTickets] = useState(TICKETS)
  const [joined, setJoined] = useState(new Set([2]))
  const [skills, setSkills] = useState(['Berufsbildung', 'Pediküre', 'Shellac', 'Waxing'])
  const [photo, setPhoto] = useState<string | null>(null)
  const [conn, setConn] = useState<Record<string, boolean>>({ phorest: true, timebutler: false, mail: false })
  const t = (s: string) => lang === 'DE' ? s : (DICT[s]?.[lang === 'EN' ? 0 : 1] ?? s)
  return (
    <C.Provider value={{
      me, setMe, lang, setLang, t,
      read, confirm: id => setRead(r => new Set(r).add(id)),
      done, toggle: id => setDone(d => { const n = new Map(d); n.has(id) ? n.delete(id) : n.set(id, now()); return n }),
      tickets,
      addTicket: tk => setTickets(ts => [{ ...tk, id: Date.now(), when: 'Gerade eben', status: 'Neu' }, ...ts]),
      assign: (id, a) => setTickets(ts => ts.map(x => x.id === id ? { ...x, assignee: a, status: x.status === 'Neu' ? 'Zugewiesen' : x.status } : x)),
      setStatus: (id, s) => setTickets(ts => ts.map(x => x.id === id ? { ...x, status: s } : x)),
      joined, toggleEvent: id => setJoined(j => { const n = new Set(j); n.has(id) ? n.delete(id) : n.add(id); return n }),
      skills, setSkills, photo, setPhoto, conn, connect: (k, v) => setConn(c => ({ ...c, [k]: v })),
    }}>{children}</C.Provider>
  )
}
export { EVENTS }
