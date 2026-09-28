import { useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  Home, ListChecks, BookOpen, LayoutGrid, Sparkles, ChevronLeft, ChevronRight, Check, Camera, MapPin, Users,
  Search, Lightbulb, AlertTriangle, CalendarDays, Inbox, Send, Newspaper, Plane, Play, Flag, Video,
  ArrowUpRight, Reply, LogOut, GraduationCap, Link2, Lock,
} from 'lucide-react'
import { useAuth } from './lib/auth'
import { useApp, type Lang } from './store'
import { Terminbuch, EventCalendar, PRATTELN_TODAY } from './Calendar'
import { STAFF, type Staff } from './staff'
import { NEWS, TASKS, WIKI, INBOX, WEEK, TEAM_TODAY, ONBOARDING, SKILL_CATALOG, BRANCHES, type News, type WikiArticle, type Mail } from './data'

type Tab = 'home' | 'tasks' | 'ai' | 'wiki' | 'menu'
type Sub = null | { k: 'news-list' } | { k: 'news'; item: News } | { k: 'wiki'; item: WikiArticle } | { k: 'onboarding' } | { k: 'team' } | { k: 'profile'; item: Staff }
  | { k: 'me' } | { k: 'conn' } | { k: 'book' } | { k: 'tickets' } | { k: 'events' } | { k: 'inbox' } | { k: 'mail'; item: Mail } | { k: 'time' }

const ini = (s: Staff) => (s.first[0] + (s.last[0] ?? '')).toUpperCase()

export default function Mobile() {
  const { signOut } = useAuth()
  return <Shell onLogout={signOut} />
}

/* ---------- Primitives ---------- */
const Card = ({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) =>
  onClick ? <button onClick={onClick} className={`w-full text-left rounded-[20px] bg-white ${className}`}>{children}</button>
    : <div className={`rounded-[20px] bg-white ${className}`}>{children}</div>
const Row = ({ icon, title, sub, onClick, right }: { icon?: ReactNode; title: string; sub?: string; onClick?: () => void; right?: ReactNode }) => (
  <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
    {icon && <span className="w-9 h-9 rounded-xl bg-sage-50 flex items-center justify-center text-sage-800 shrink-0">{icon}</span>}
    <span className="flex-1 min-w-0"><span className="block text-[15px] truncate">{title}</span>{sub && <span className="block text-xs text-mute truncate mt-0.5">{sub}</span>}</span>
    {right ?? <ChevronRight size={18} className="text-sage-400 shrink-0" />}
  </button>
)
const List = ({ children }: { children: ReactNode }) => <Card className="divide-y divide-sage-50 overflow-hidden">{children}</Card>
const Title = ({ children, sub, right }: { children: ReactNode; sub?: string; right?: ReactNode }) => (
  <div className="px-5 pt-3 pb-4 flex items-end justify-between gap-3">
    <div>{sub && <p className="text-[13px] text-mute">{sub}</p>}<h1 className="text-[30px] font-semibold tracking-tight leading-tight">{children}</h1></div>{right}
  </div>
)
const Label = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex items-baseline justify-between mt-7 mb-2.5 px-1"><h2 className="text-[13px] font-medium text-sage-800">{children}</h2>{action}</div>
)
const Chips = ({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) => (
  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
    {items.map(x => <button key={x} onClick={() => onChange(x)} className={`shrink-0 px-3.5 h-8 rounded-full text-[13px] transition ${value === x ? 'bg-ink text-white' : 'bg-white text-ink'}`}>{x}</button>)}
  </div>
)
const Btn = ({ children, onClick, ghost }: { children: ReactNode; onClick?: () => void; ghost?: boolean }) =>
  <button onClick={onClick} className={`w-full h-12 rounded-2xl font-medium flex items-center justify-center gap-2 ${ghost ? 'bg-white text-ink' : 'bg-ink text-white'}`}>{children}</button>
const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="h-11 rounded-2xl bg-white px-3.5 flex items-center gap-2"><Search size={18} className="text-mute" />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-mute" /></div>
)

/* ---------- Shell ---------- */
function Shell({ onLogout }: { onLogout: () => void }) {
  const { t, read } = useApp()
  const [tab, setTab] = useState<Tab>('home')
  const [stack, setStack] = useState<Sub[]>([])
  const sub = stack[stack.length - 1] ?? null
  const open = (s: Sub) => setStack(st => [...st, s])
  const back = () => setStack(st => st.slice(0, -1))
  const go = (x: Tab) => { setStack([]); setTab(x) }
  const scroller = useRef<HTMLDivElement>(null)
  const mustOpen = NEWS.filter(n => n.mustRead && !read.has(n.id)).length

  let screen: ReactNode
  switch (sub?.k) {
    case 'news-list': screen = <NewsList open={open} />; break
    case 'news': screen = <NewsDetail n={sub.item} />; break
    case 'wiki': screen = <WikiDetail a={sub.item} />; break
    case 'onboarding': screen = <Onboarding />; break
    case 'team': screen = <Team open={open} />; break
    case 'profile': screen = <Profile s={sub.item} />; break
    case 'me': screen = <MyProfile />; break
    case 'tickets': screen = <Tickets />; break
    case 'events': screen = <Events />; break
    case 'conn': screen = <Connections />; break
    case 'book': screen = <div className="px-5 pb-4 h-[calc(100dvh-150px)] md:h-[640px]"><h1 className="text-[26px] font-semibold tracking-tight mb-3">Kundentermine</h1><Terminbuch compact /></div>; break
    case 'inbox': screen = <InboxView open={open} />; break
    case 'mail': screen = <MailView m={sub.item} />; break
    case 'time': screen = <TimeOff open={open} />; break
    default:
      screen = tab === 'home' ? <Today open={open} go={go} /> : tab === 'tasks' ? <Tasks /> : tab === 'ai' ? <AI open={open} />
        : tab === 'wiki' ? <Wiki open={open} /> : <MenuView open={open} onLogout={onLogout} />
  }
  const key = (sub ? sub.k + ('item' in sub ? JSON.stringify((sub.item as { id?: number; first?: string }).id) : '') : tab) + stack.length
  const nav: [Tab, string, typeof Home][] = [['home', 'Heute', Home], ['tasks', 'Aufgaben', ListChecks], ['ai', 'KI', Sparkles], ['wiki', 'Wissen', BookOpen], ['menu', 'Menü', LayoutGrid]]
  return (
    <>
      <div ref={scroller} className="flex-1 overflow-y-auto no-scrollbar bg-sage-50/60">
        <div className="h-11" />
        {sub && <button onClick={back} className="px-4 pb-1 flex items-center gap-0.5 text-sage-800 text-[15px]"><ChevronLeft size={20} />{t('Zurück')}</button>}
        <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={tab === 'ai' && !sub ? 'h-[calc(100%-44px)]' : ''}>
          {screen}
        </motion.div>
      </div>
      <nav className="shrink-0 bg-white px-3 pb-7 pt-2 grid grid-cols-5 items-end">
        {nav.map(([x, label, Icon]) => {
          const on = tab === x && !sub
          if (x === 'ai') return (
            <button key={x} onClick={() => go(x)} className="flex flex-col items-center gap-1 py-0.5 text-[11px] text-ink">
              <span className={`w-11 h-8 rounded-full flex items-center justify-center ${on ? 'bg-ink text-white' : 'bg-sage-100 text-ink'}`}><Sparkles size={19} /></span>{t(label)}
            </button>
          )
          return (
            <button key={x} onClick={() => go(x)} className={`relative flex flex-col items-center gap-1 py-1 text-[11px] ${on ? 'text-ink' : 'text-mute'}`}>
              <Icon size={22} strokeWidth={on ? 2.2 : 1.7} />{t(label)}
              {x === 'home' && mustOpen > 0 && <span className="absolute top-0.5 right-[28%] w-2 h-2 rounded-full bg-[#C0634B]" />}
            </button>
          )
        })}
      </nav>
    </>
  )
}

/* ---------- Heute ---------- */
function Today({ open, go }: { open: (s: Sub) => void; go: (t: Tab) => void }) {
  const { me, t, done, read } = useApp()
  const pct = Math.round((done.size / TASKS.length) * 100)
  const next = TASKS.find(x => !done.has(x.id))
  const must = NEWS.filter(n => n.mustRead && !read.has(n.id))
  const isRespo = /Respo|Stv|Berufsbild/.test(me.role)
  const myAppts = PRATTELN_TODAY[0].blocks.filter(b => b.client)
  return (
    <div className="px-5 pb-10">
      <div className="pt-3 pb-5 flex items-end justify-between">
        <div><p className="text-[13px] text-mute">Freitag, 25. September</p><h1 className="text-[30px] font-semibold tracking-tight">{t('Hallo')} {me.first}</h1></div>
        <button onClick={() => open({ k: 'me' })} className="w-11 h-11 rounded-full bg-sage-200 flex items-center justify-center text-sm font-medium text-sage-800">{ini(me)}</button>
      </div>

      <div className="rounded-[20px] bg-ink text-white p-5">
        <div className="flex justify-between">
          <div><p className="text-xs text-white/55">{t('Deine Schicht heute')}</p><p className="text-[22px] font-medium mt-1">08:00 – 17:00</p>
            <p className="text-xs text-white/55 mt-1.5 flex items-center gap-1"><MapPin size={12} />Studio {me.branch}</p></div>
          <div className="text-right"><p className="text-4xl font-semibold leading-none">{myAppts.length}</p><p className="text-xs text-white/55 mt-1">{t('Termine')}</p></div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1">
          {WEEK.map(d => <div key={d.n} className={`rounded-lg py-1.5 text-center ${d.n === 25 ? 'bg-white text-ink' : 'text-white/70'}`}><p className="text-[10px]">{d.d}</p><p className="text-[13px] font-medium">{d.n}</p></div>)}
        </div>
      </div>

      {must.map(n => (
        <Card key={n.id} onClick={() => open({ k: 'news', item: n })} className="mt-3 p-4 flex gap-3 items-center !bg-[#F7ECE7]">
          <Flag size={18} className="text-[#C0634B] shrink-0" />
          <span className="flex-1"><span className="block text-xs text-[#9A4B37] font-medium">{t('Bitte lesen und bestätigen')}</span><span className="block text-[15px] font-medium mt-0.5">{n.title}</span></span>
          <ChevronRight size={18} className="text-[#9A4B37]" />
        </Card>
      ))}

      <Label action={<button onClick={() => go('tasks')} className="text-[13px] text-sage-800">{t('Alle')}</button>}>{t('Tagesaufgaben')}</Label>
      <Card onClick={() => go('tasks')} className="p-4">
        <div className="flex justify-between text-sm"><span>{done.size} / {TASKS.length} {t('erledigt')}</span><span className="text-mute">{pct} %</span></div>
        <div className="mt-2.5 h-1.5 rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-sage-600 rounded-full transition-all" style={{ width: pct + '%' }} /></div>
        {next && <p className="mt-3 text-[13px] text-mute">Als Nächstes: <span className="text-ink">{next.title}</span> · {next.time}</p>}
      </Card>

      <Label action={<button onClick={() => open({ k: 'book' })} className="text-[13px] text-sage-800">Alle Kundentermine</button>}>{t('Mein Tag · aus Phorest')}</Label>
      <List>
        {myAppts.map((a, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            <div className="w-11 shrink-0"><p className="text-[15px] font-medium">{hm(a.start)}</p><p className="text-xs text-mute">{hm(a.start + a.dur)}</p></div>
            <div className="flex-1 border-l-[3px] pl-3" style={{ borderColor: a.color }}><p className="text-[15px]">{a.client}</p><p className="text-[13px] text-mute">{a.service}</p></div>
          </div>
        ))}
      </List>
      <p className="mt-2 px-1 text-[11px] text-mute">Aus Phorest · Spalte „Bea (D/SR)“, Pratteln · zugeordnet über bea@beautylounge.ch</p>

      {isRespo && <>
        <Label>{t('Heute im Studio')} · {me.branch}</Label>
        <List>{TEAM_TODAY.map(p => <Row key={p.name} title={p.name} sub={`${p.shift} · ${p.appts} Termine`} right={<span />} />)}</List>
      </>}

      <Label action={<button onClick={() => open({ k: 'news-list' })} className="text-[13px] text-sage-800">{t('Alle')}</button>}>{t('News')}</Label>
      <List>{NEWS.filter(n => !n.mustRead).slice(0, 2).map(n => <Row key={n.id} title={n.title} sub={`${n.tag} · ${n.date}`} onClick={() => open({ k: 'news', item: n })} />)}</List>
    </div>
  )
}

/* ---------- News ---------- */
function NewsList({ open }: { open: (s: Sub) => void }) {
  const { read, t } = useApp()
  const [f, setF] = useState('Alle')
  return (
    <div className="pb-10"><Title>{t('News')}</Title>
      <div className="px-5"><Chips items={['Alle', 'Pflicht', 'Studio', 'Marketing', 'Team']} value={f} onChange={setF} />
        <div className="mt-4 space-y-3">
          {NEWS.filter(n => f === 'Alle' || n.tag === f).map(n => (
            <Card key={n.id} onClick={() => open({ k: 'news', item: n })} className="p-4">
              <div className="flex items-center gap-2 text-xs text-mute">
                <span className={n.mustRead ? 'text-[#C0634B] font-medium' : 'text-sage-800'}>{n.tag}</span>·<span>{n.date}</span>·<span>{n.audience}</span>
                {n.mustRead && (read.has(n.id) ? <span className="ml-auto flex items-center gap-1 text-sage-800"><Check size={12} />bestätigt</span> : <span className="ml-auto w-2 h-2 rounded-full bg-[#C0634B]" />)}
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
  const { read, confirm, t } = useApp()
  return (
    <article className="px-5 pb-10">
      <p className="text-xs text-mute mt-3">{n.tag} · {n.audience} · {n.date}</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight leading-tight">{n.title}</h1>
      <p className="mt-2 text-[13px] text-mute">von {n.author}</p>
      <div className="mt-5 space-y-4 text-[16px] leading-relaxed">{n.body.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>
      {n.toWiki && <p className="mt-4 text-[13px] text-sage-800 flex items-center gap-1"><BookOpen size={14} />Auch im Wissen unter Hygiene abgelegt</p>}
      {n.mustRead && <div className="mt-8">
        {read.has(n.id) ? <div className="h-12 rounded-2xl bg-sage-100 text-sage-800 flex items-center justify-center gap-2 font-medium"><Check size={18} />Gelesen und bestätigt</div>
          : <Btn onClick={() => confirm(n.id)}>{t('Gelesen und verstanden')}</Btn>}
      </div>}
    </article>
  )
}

/* ---------- Aufgaben ---------- */
function Tasks() {
  const { me, done, toggle, t } = useApp()
  const groups = [...new Set(TASKS.map(x => x.group))]
  const [photoFor, setPhotoFor] = useState<number | null>(null)
  return (
    <div className="pb-10"><Title sub={`Studio ${me.branch} · heute`}>{t('Aufgaben')}</Title>
      <div className="px-5">
        {groups.map(g => <div key={g}><Label>{g}</Label>
          <List>{TASKS.filter(x => x.group === g).map(x => {
            const d = done.get(x.id)
            return (
              <div key={x.id} className="flex items-center gap-3 px-4 py-3.5">
                <button onClick={() => x.proof && !d ? setPhotoFor(x.id) : toggle(x.id)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${d ? 'bg-sage-600 border-sage-600' : 'border-sage-200'}`}>{d && <Check size={14} className="text-white" strokeWidth={3} />}</button>
                <div className="flex-1 min-w-0">
                  <p className={`text-[15px] ${d ? 'text-mute line-through' : ''}`}>{x.title}</p>
                  <p className="text-xs text-mute mt-0.5 flex items-center gap-2">
                    {d ? <>{me.first} · {d}</> : <>{x.time}</>}
                    {x.prio && !d && <span className="text-[#C0634B]">Wichtig</span>}
                    {x.proof && <span className="flex items-center gap-0.5"><Camera size={12} />Foto</span>}
                  </p>
                </div>
              </div>
            )
          })}</List></div>)}
        <p className="mt-5 text-xs text-mute">Vorlagen, Wiederholungen und Fotonachweise legt das Büro fest. Jeden Morgen neu, alte Nachweise bleiben gespeichert.</p>
      </div>
      {photoFor && <Sheet onClose={() => setPhotoFor(null)}>
        <p className="font-medium text-[17px]">Foto als Nachweis</p>
        <div className="mt-4 aspect-[4/3] rounded-2xl bg-sage-100 flex items-center justify-center text-sage-800"><Camera size={32} /></div>
        <div className="mt-4"><Btn onClick={() => { toggle(photoFor); setPhotoFor(null) }}>Foto aufnehmen und abhaken</Btn></div>
      </Sheet>}
    </div>
  )
}
function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30" />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative w-full bg-paper rounded-t-[28px] p-6 pb-10" onClick={e => e.stopPropagation()}>{children}</motion.div>
    </div>
  )
}

/* ---------- KI (Benni) ---------- */
type Msg = { me: boolean; t: string; card?: ReactNode }
function AI({ open }: { open: (s: Sub) => void }) {
  const { me, addTicket, tickets } = useApp()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const ideas = ['Wer ist morgen in Reinach im Dienst?', 'Fasse die Kundenhistorie von Rita M. zusammen', 'Wie lange wirkt das Desinfektionsmittel?', 'Das Wachsgerät in Kabine 3 ist kaputt', 'Wie viele Ferientage habe ich noch?']

  const answer = (q: string): Msg => {
    const s = q.toLowerCase()
    if (/kaputt|defekt|funktioniert nicht|geht nicht/.test(s)) {
      const title = q.replace(/^(das|der|die)\s/i, '')
      return { me: false, t: 'Das kann ich nicht selbst lösen. Soll ich eine Meldung an die Facility erstellen?', card: <TicketDraft title={title} onSend={() => addTicket({ kind: 'Meldung', title, branch: me.branch, who: `${me.first} ${me.last[0]}.`, viaAI: true, photo: false })} /> }
    }
    if (/historie|kundin|kunde|notiz/.test(s)) return { me: false, t: 'Rita M., Kundin seit 2023, 14 Besuche. Kommt alle 5–6 Wochen zur Gesichtsbehandlung Classic, zuletzt am 14.08. bei Alma. Notiz: empfindliche Haut, keine Fruchtsäure. Hat zweimal Pflegeprodukte gekauft.', card: <Src>Quelle: Phorest, Kundenkartei</Src> }
    if (/dienst|morgen|frei|schicht|wer/.test(s)) return { me: false, t: 'Morgen, Samstag, sind in Reinach im Dienst:', card: <MiniList rows={[['Xenia R.', '09:00–15:00 · 6 Termine'], ['Mila F.', '09:00–13:00 · 3 Termine']]} src="Phorest, Dienstplan Reinach" /> }
    if (/ferien|urlaub|ferientag/.test(s)) return { me: false, t: 'Du hast noch 9 Ferientage für 2026. Beantragt sind 2 Tage im Oktober (15.–16.10.), noch nicht bestätigt.', card: <Src>Quelle: Timebutler</Src> }
    if (/desinf|hygiene|lash|wachs|wie/.test(s)) return { me: false, t: 'Laut Hygienerichtlinie 60 Sekunden einwirken lassen, danach mit einem frischen Tuch nachwischen und eine neue Auflage auflegen.', card: <button onClick={() => open({ k: 'wiki', item: WIKI[0] })} className="mt-2 text-[13px] text-sage-800 flex items-center gap-1"><BookOpen size={14} />Desinfektion nach jeder Behandlung<ArrowUpRight size={13} /></button> }
    return { me: false, t: 'Dazu finde ich nichts im Wissen. Ich kann dir eine Frage ans Büro als Idee oder Meldung weiterleiten.' }
  }
  const send = (q = v) => {
    if (!q.trim() || busy) return
    setMsgs(m => [...m, { me: true, t: q }]); setV(''); setBusy(true)
    setTimeout(() => { setMsgs(m => [...m, answer(q)]); setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50) }, 700)
  }
  const sentFromAI = tickets.filter(x => x.viaAI).length
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-5">
        {msgs.length === 0 ? (
          <div className="pt-6">
            <div className="w-14 h-14 rounded-2xl bg-ink text-white flex items-center justify-center"><Sparkles size={26} /></div>
            <h1 className="mt-5 text-[28px] font-semibold tracking-tight leading-tight">Hallo {me.first},<br />wie kann ich helfen?</h1>
            <p className="mt-2 text-[14px] text-mute">Benni kennt eure Termine und Dienstpläne aus Phorest, das Wissen, den Kalender und Timebutler. Was er nicht lösen kann, gibt er als Meldung weiter.</p>
            <div className="mt-6 space-y-2">{ideas.map(i => <button key={i} onClick={() => send(i)} className="w-full text-left rounded-2xl bg-white px-4 py-3 text-[14px]">{i}</button>)}</div>
          </div>
        ) : (
          <div className="pt-3 space-y-3 pb-4">
            {msgs.map((m, i) => (
              <div key={i} className={m.me ? 'flex justify-end' : ''}>
                <div className={`max-w-[88%] rounded-[20px] px-4 py-3 text-[15px] leading-snug ${m.me ? 'bg-ink text-white' : 'bg-white'}`}>{m.t}{m.card}</div>
              </div>
            ))}
            {busy && <div className="w-16 rounded-[20px] bg-white px-4 py-3 flex gap-1">{[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-sage-400 animate-pulse" style={{ animationDelay: i * 150 + 'ms' }} />)}</div>}
            {sentFromAI > 0 && <p className="text-center text-xs text-mute">Meldung liegt im Backoffice bei Renée</p>}
            <div ref={end} />
          </div>
        )}
      </div>
      <div className="sticky bottom-0 px-4 py-3 bg-sage-50/95 flex gap-2">
        <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Frag Benni …" className="flex-1 h-12 rounded-2xl bg-white px-4 text-[15px] outline-none placeholder:text-mute" />
        <button onClick={() => send()} className="w-12 h-12 rounded-2xl bg-ink text-white flex items-center justify-center"><Send size={18} /></button>
      </div>
    </div>
  )
}
const Src = ({ children }: { children: ReactNode }) => <p className="mt-2 text-xs text-mute">{children}</p>
const MiniList = ({ rows, src }: { rows: [string, string][]; src: string }) => (
  <div className="mt-2"><div className="rounded-xl bg-sage-50 divide-y divide-white">{rows.map(([a, b]) => <div key={a} className="px-3 py-2"><p className="text-[14px]">{a}</p><p className="text-xs text-mute">{b}</p></div>)}</div><Src>Quelle: {src}</Src></div>
)
function TicketDraft({ title, onSend }: { title: string; onSend: () => void }) {
  const [sent, setSent] = useState(false)
  return (
    <div className="mt-3 rounded-xl bg-sage-50 p-3">
      <p className="text-xs text-mute">Meldung · Facility</p><p className="text-[14px] font-medium mt-0.5">{title}</p>
      {sent ? <p className="mt-2 text-[13px] text-sage-800 flex items-center gap-1"><Check size={14} />Gesendet, du bekommst Bescheid</p>
        : <button onClick={() => { onSend(); setSent(true) }} className="mt-2.5 h-9 px-4 rounded-full bg-ink text-white text-[13px]">Meldung senden</button>}
    </div>
  )
}

/* ---------- Wissen ---------- */
function Wiki({ open }: { open: (s: Sub) => void }) {
  const { t } = useApp()
  const [q, setQ] = useState('')
  const cats = [...new Set(WIKI.map(a => a.cat))]
  const hits = WIKI.filter(a => (a.title + a.cat).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="pb-10"><Title>{t('Wissen')}</Title>
      <div className="px-5">
        <SearchBox value={q} onChange={setQ} placeholder={`${t('Suchen')}, z. B. Wachs`} />
        {!q && <Card onClick={() => open({ k: 'onboarding' })} className="mt-4 p-4 flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-sage-400 text-white flex items-center justify-center"><GraduationCap size={22} /></span>
          <span className="flex-1"><span className="block text-[15px] font-medium">Onboarding für Neue</span><span className="block text-xs text-mute mt-0.5">5 Schritte · 2 von 5 erledigt</span></span>
          <ChevronRight size={18} className="text-sage-400" />
        </Card>}
        {cats.map(c => { const items = hits.filter(a => a.cat === c); if (!items.length) return null
          return <div key={c}><Label>{c}</Label><List>{items.map(a => <Row key={a.id} icon={a.video ? <Video size={17} /> : <BookOpen size={17} />} title={a.title} sub={`${a.minutes} Min. · aktualisiert ${a.updated}`} onClick={() => open({ k: 'wiki', item: a })} />)}</List></div>
        })}
      </div>
    </div>
  )
}
function WikiDetail({ a }: { a: WikiArticle }) {
  return (
    <article className="px-5 pb-10">
      <p className="text-xs text-mute mt-3">{a.cat} · {a.minutes} Min. · aktualisiert {a.updated}</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight leading-tight">{a.title}</h1>
      {a.video ? <div className="mt-5 aspect-video rounded-[20px] bg-ink flex items-center justify-center"><span className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-white"><Play size={24} fill="currentColor" /></span></div>
        : <div className="mt-5 aspect-[16/9] rounded-[20px] bg-sage-100" />}
      <p className="mt-2 text-xs text-mute">{a.video ? 'Internes Video oder YouTube, im Artikel abspielbar' : 'Foto zum Artikel'}</p>
      <div className="mt-5 space-y-3 text-[16px] leading-relaxed">{a.body.map((p, i) => <p key={i}>{p}</p>)}</div>
    </article>
  )
}
function Onboarding() {
  const [done, setDone] = useState(new Set([0, 1]))
  return (
    <div className="px-5 pb-10"><h1 className="mt-3 text-[26px] font-semibold tracking-tight">Onboarding</h1>
      <p className="mt-1 text-[14px] text-mute">Alles für deine ersten Tage. Deine Respo sieht, wie weit du bist.</p>
      <div className="mt-4 h-1.5 rounded-full bg-sage-100 overflow-hidden"><div className="h-full bg-sage-600 transition-all" style={{ width: done.size / ONBOARDING.length * 100 + '%' }} /></div>
      <div className="mt-5 space-y-2">
        {ONBOARDING.map((s, i) => (
          <Card key={i} onClick={() => setDone(d => new Set(d).add(i))} className="p-4 flex items-center gap-3">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium ${done.has(i) ? 'bg-sage-600 text-white' : 'bg-sage-50 text-sage-800'}`}>{done.has(i) ? <Check size={15} /> : i + 1}</span>
            <span className="flex-1"><span className="block text-[15px]">{s.title}</span><span className="block text-xs text-mute">{s.minutes} Min.</span></span>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ---------- Menü ---------- */
function MenuView({ open, onLogout }: { open: (s: Sub) => void; onLogout: () => void }) {
  const { me, t, tickets, photo } = useApp()
  const tiles: [string, string, typeof Users, Sub][] = [
    ['News', '1 ungelesen', Newspaper, { k: 'news-list' }], ['Kalender', 'Termine, Schulungen, Ferien', CalendarDays, { k: 'events' }],
    ['Team', '50 Personen', Users, { k: 'team' }], ['Melden & Ideen', `${tickets.filter(x => x.status !== 'Erledigt').length} offen`, Lightbulb, { k: 'tickets' }],
    ['Posteingang', '2 ungelesen', Inbox, { k: 'inbox' }], ['Zeit & Ferien', 'Timebutler', Plane, { k: 'time' }],
  ]
  return (
    <div className="pb-10"><Title>{t('Menü')}</Title>
      <div className="px-5">
        <Card onClick={() => open({ k: 'me' })} className="p-4 flex items-center gap-3">
          <Avatar s={me} photo={photo} size="w-12 h-12" />
          <span className="flex-1"><span className="block font-medium">{me.first} {me.last}</span><span className="block text-[13px] text-mute">{me.role} · {me.branch}</span></span>
          <ChevronRight size={18} className="text-sage-400" />
        </Card>
        <Card onClick={() => open({ k: 'book' })} className="mt-3 p-4 flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-ink text-white flex items-center justify-center"><CalendarDays size={20} /></span>
          <span className="flex-1"><span className="block text-[15px] font-medium">Kundentermine</span><span className="block text-xs text-mute mt-0.5">Alle Studios · live aus Phorest</span></span>
          <ChevronRight size={18} className="text-sage-400" />
        </Card>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {tiles.map(([title, sub, Icon, target]) => (
            <Card key={title} onClick={() => open(target)} className="p-4 h-[112px] flex flex-col justify-between">
              <Icon size={22} className="text-sage-800" />
              <span><span className="block text-[15px] font-medium">{t(title)}</span><span className="block text-xs text-mute mt-0.5">{sub}</span></span>
            </Card>
          ))}
        </div>
        <Card onClick={() => open({ k: 'conn' })} className="mt-3 p-4 flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-sage-50 text-sage-800 flex items-center justify-center"><Link2 size={20} /></span>
          <span className="flex-1"><span className="block text-[15px] font-medium">Verbindungen</span><span className="block text-xs text-mute mt-0.5">Phorest, Timebutler, Postfach</span></span>
          <ChevronRight size={18} className="text-sage-400" />
        </Card>
        <button onClick={onLogout} className="mt-6 flex items-center gap-2 text-[15px] text-mute"><LogOut size={18} />{t('Abmelden')}</button>
      </div>
    </div>
  )
}
const Avatar = ({ s, photo, size = 'w-10 h-10' }: { s: Staff; photo?: string | null; size?: string }) =>
  photo ? <img src={photo} className={`${size} rounded-full object-cover`} /> : <span className={`${size} rounded-full bg-sage-200 flex items-center justify-center text-sm font-medium text-sage-800 shrink-0`}>{ini(s)}</span>

function Team({ open }: { open: (s: Sub) => void }) {
  const [q, setQ] = useState(''), [b, setB] = useState('Alle')
  const list = useMemo(() => STAFF.filter(s => (b === 'Alle' || s.branch === b) && `${s.first} ${s.last} ${s.role} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase())), [q, b])
  return (
    <div className="pb-10"><Title>Team</Title>
      <div className="px-5 space-y-3"><SearchBox value={q} onChange={setQ} placeholder="Name oder Skill, z. B. Pediküre" /><Chips items={['Alle', ...BRANCHES]} value={b} onChange={setB} />
        <p className="text-xs text-mute pt-1">{list.length} Personen</p>
        <List>{list.map(s => <Row key={s.id} icon={<Avatar s={s} size="w-9 h-9" />} title={`${s.first} ${s.last}`} sub={`${s.role} · ${s.branch}`} onClick={() => open({ k: 'profile', item: s })} />)}</List>
      </div>
    </div>
  )
}
function Profile({ s }: { s: Staff }) {
  return (
    <div className="px-5 pb-10 text-center">
      <div className="mt-4 flex justify-center"><Avatar s={s} size="w-24 h-24 text-2xl" /></div>
      <h1 className="mt-4 text-[24px] font-semibold tracking-tight">{s.first} {s.last}</h1><p className="text-mute">{s.role} · Studio {s.branch}</p>
      <div className="mt-6 text-left"><Label>Skills</Label><div className="flex flex-wrap gap-2">{s.skills.map(k => <span key={k} className="px-3 h-8 rounded-full bg-white text-[13px] flex items-center">{k}</span>)}</div>
        <div className="mt-6"><Btn ghost><Send size={16} />Nachricht schreiben</Btn></div></div>
    </div>
  )
}
function MyProfile() {
  const { me, skills, setSkills, photo, setPhoto, lang, setLang } = useApp()
  const file = useRef<HTMLInputElement>(null)
  const tog = (k: string) => setSkills(skills.includes(k) ? skills.filter(x => x !== k) : [...skills, k])
  return (
    <div className="px-5 pb-10">
      <div className="mt-3 flex flex-col items-center">
        <button onClick={() => file.current?.click()} className="relative"><Avatar s={me} photo={photo} size="w-24 h-24 text-2xl" />
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-ink text-white flex items-center justify-center border-2 border-paper"><Camera size={14} /></span></button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setPhoto(URL.createObjectURL(f)) }} />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight">{me.first} {me.last}</h1><p className="text-mute">{me.role} · Studio {me.branch}</p>
      </div>
      <Label>Meine Skills</Label>
      <div className="flex flex-wrap gap-2">{SKILL_CATALOG.map(k => <button key={k} onClick={() => tog(k)} className={`px-3 h-8 rounded-full text-[13px] ${skills.includes(k) ? 'bg-ink text-white' : 'bg-white'}`}>{k}</button>)}</div>
      <p className="mt-3 text-xs text-mute">Die Skill-Liste gibt das Büro vor. Kolleginnen finden dich darüber.</p>
      <Label>Sprache</Label>
      <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-white">{([['DE', 'Deutsch'], ['EN', 'English'], ['FR', 'Français']] as [Lang, string][]).map(([k, l]) => <button key={k} onClick={() => setLang(k)} className={`h-10 rounded-xl text-[14px] ${lang === k ? 'bg-ink text-white' : ''}`}>{l}</button>)}</div>
    </div>
  )
}

function Tickets() {
  const { tickets, addTicket, me } = useApp()
  const [kind, setKind] = useState<'Meldung' | 'Idee'>('Meldung'), [text, setText] = useState(''), [ok, setOk] = useState(false)
  const submit = () => { if (!text.trim()) return; addTicket({ kind, title: text, branch: me.branch, who: `${me.first} ${me.last[0]}.`, photo: kind === 'Meldung' }); setText(''); setOk(true); setTimeout(() => setOk(false), 2500) }
  return (
    <div className="pb-10"><Title>Melden & Ideen</Title>
      <div className="px-5">
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white">
          {(['Meldung', 'Idee'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={`h-10 rounded-xl text-[14px] flex items-center justify-center gap-1.5 ${kind === k ? 'bg-ink text-white' : ''}`}>{k === 'Meldung' ? <AlertTriangle size={15} /> : <Lightbulb size={15} />}{k}</button>)}
        </div>
        <Card className="mt-3 p-4">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={kind === 'Meldung' ? 'Was ist kaputt oder fehlt?' : 'Was könnten wir besser machen?'} className="w-full resize-none outline-none text-[15px] placeholder:text-mute bg-transparent" />
          <div className="mt-2 flex items-center justify-between text-[13px] text-mute">
            <span className="flex items-center gap-3"><span className="flex items-center gap-1"><Camera size={15} />Foto</span><span className="flex items-center gap-1"><MapPin size={15} />{me.branch}</span></span>
            <button onClick={submit} className="h-9 px-4 rounded-full bg-ink text-white flex items-center gap-1.5"><Send size={13} />Senden</button>
          </div>
        </Card>
        <p className="mt-2 text-xs text-mute">{ok ? 'Gesendet. Du siehst hier, was daraus wird.' : kind === 'Meldung' ? 'Geht sofort per E-Mail an die Facility und wird im Büro zugewiesen.' : 'Landet beim Büro.'}</p>
        <Label>Verlauf</Label>
        <List>{tickets.map(x => (
          <div key={x.id} className="px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-mute"><span className="text-sage-800">{x.kind}</span>·<span>{x.branch}</span>·<span>{x.when}</span>{x.viaAI && <span className="flex items-center gap-0.5"><Sparkles size={11} />über Benni</span>}</div>
            <p className="text-[15px] mt-1">{x.title}</p>
            <p className="text-xs mt-1"><Status s={x.status} />{x.assignee && <span className="text-mute"> · {x.assignee}</span>}</p>
          </div>
        ))}</List>
      </div>
    </div>
  )
}
export const Status = ({ s }: { s: string }) => {
  const c = s === 'Erledigt' ? 'text-sage-800' : s === 'Neu' ? 'text-[#C0634B]' : 'text-ink'
  return <span className={`font-medium ${c}`}>{s}</span>
}

function Events() {
  return <div className="pb-10"><Title sub="Termine, Schulungen und Abwesenheiten">Mein Kalender</Title><div className="px-5"><EventCalendar /></div></div>
}

function InboxView({ open }: { open: (s: Sub) => void }) {
  const { conn } = useApp()
  if (!conn.mail) return <NotConnected title="Posteingang" tool="dein Postfach" what="deine E-Mails von bea@beautylounge.ch" open={open} />
  return (
    <div className="pb-10"><Title sub="bea@beautylounge.ch">Posteingang</Title>
      <div className="px-5"><List>{INBOX.map(m => (
        <button key={m.id} onClick={() => open({ k: 'mail', item: m })} className="w-full px-4 py-3.5 flex gap-3 text-left">
          <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${m.unread ? 'bg-sage-600' : ''}`} />
          <span className="flex-1 min-w-0"><span className="flex justify-between"><span className={`text-[15px] ${m.unread ? 'font-medium' : ''}`}>{m.from}</span><span className="text-xs text-mute">{m.time}</span></span>
            <span className="block text-[14px] truncate">{m.subject}</span><span className="block text-[13px] text-mute truncate">{m.body}</span></span>
        </button>
      ))}</List></div>
    </div>
  )
}
function MailView({ m }: { m: Mail }) {
  const [r, setR] = useState(false)
  return (
    <div className="px-5 pb-10"><p className="text-xs text-mute mt-3">{m.from} · {m.time}</p><h1 className="mt-2 text-[24px] font-semibold tracking-tight">{m.subject}</h1>
      <p className="mt-4 text-[16px] leading-relaxed">{m.body}</p>
      <div className="mt-8">{r ? <Card className="p-4"><textarea rows={4} placeholder="Antwort schreiben …" className="w-full resize-none outline-none bg-transparent text-[15px]" /><div className="flex justify-end"><button className="h-9 px-4 rounded-full bg-ink text-white text-[13px]">Senden</button></div></Card>
        : <Btn ghost onClick={() => setR(true)}><Reply size={16} />Antworten</Btn>}</div>
    </div>
  )
}

function TimeOff({ open }: { open: (s: Sub) => void }) {
  const { conn } = useApp()
  const [sheet, setSheet] = useState(false), [sent, setSent] = useState(false), [clock, setClock] = useState<string | null>('07:58')
  if (!conn.timebutler) return <NotConnected title="Zeit & Ferien" tool="Timebutler" what="deinen Resturlaub, deine Anträge und die Stempeluhr" open={open} />
  return (
    <div className="pb-10"><Title sub="verbunden mit Timebutler">Zeit & Ferien</Title>
      <div className="px-5">
        <Card className="p-4 flex items-center justify-between">
          <span><span className="block text-xs text-mute">Heute</span><span className="block text-[17px] font-medium mt-0.5">{clock ? `Eingestempelt seit ${clock}` : 'Nicht eingestempelt'}</span></span>
          <button onClick={() => setClock(clock ? null : new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }))} className={`h-10 px-4 rounded-full text-[14px] ${clock ? 'bg-sage-100 text-sage-800' : 'bg-ink text-white'}`}>{clock ? 'Ausstempeln' : 'Einstempeln'}</button>
        </Card>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card className="p-4"><p className="text-xs text-mute">Ferien übrig</p><p className="text-[28px] font-semibold mt-1">9 <span className="text-[15px] font-normal text-mute">Tage</span></p></Card>
          <Card className="p-4"><p className="text-xs text-mute">Überstunden</p><p className="text-[28px] font-semibold mt-1">+6,5 <span className="text-[15px] font-normal text-mute">Std.</span></p><p className="text-[11px] text-mute">Stand heute Morgen</p></Card>
        </div>
        <Label>Meine Anträge</Label>
        <List>
          {sent && <Row icon={<Plane size={17} />} title="02.–03. November" sub="2 Tage · gerade beantragt" right={<span className="text-xs text-[#C0634B]">offen</span>} />}
          <Row icon={<Plane size={17} />} title="15.–16. Oktober" sub="2 Tage" right={<span className="text-xs text-[#C0634B]">offen</span>} />
          <Row icon={<Plane size={17} />} title="23.–31. Dezember" sub="5 Tage" right={<span className="text-xs text-sage-800">bestätigt</span>} />
        </List>
        <div className="mt-6"><Btn onClick={() => setSheet(true)}>Ferien beantragen</Btn></div>
        <p className="mt-3 text-xs text-mute">Alles läuft direkt in Timebutler: Antrag, Stempeluhr und Saldo. Einmal verbinden, danach bleibt die Anmeldung bestehen.</p>
      </div>
      {sheet && <Sheet onClose={() => setSheet(false)}>
        <p className="font-medium text-[17px]">Ferien beantragen</p>
        <div className="mt-4 grid grid-cols-2 gap-3">{[['Von', 'Mo 02.11.2026'], ['Bis', 'Di 03.11.2026']].map(([a, b]) => <div key={a}><p className="text-xs text-mute mb-1">{a}</p><div className="h-11 rounded-xl bg-white px-3 flex items-center text-[15px]">{b}</div></div>)}</div>
        <div className="mt-3"><p className="text-xs text-mute mb-1">Art</p><div className="h-11 rounded-xl bg-white px-3 flex items-center text-[15px]">Ferien · 2 Tage</div></div>
        <div className="mt-5"><Btn onClick={() => { setSent(true); setSheet(false) }}>An Timebutler senden</Btn></div>
      </Sheet>}
    </div>
  )
}

const hm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

function NotConnected({ title, tool, what, open }: { title: string; tool: string; what: string; open: (s: Sub) => void }) {
  return (
    <div className="pb-10"><Title>{title}</Title>
      <div className="px-5"><Card className="p-6 text-center">
        <span className="mx-auto w-12 h-12 rounded-2xl bg-sage-50 text-sage-800 flex items-center justify-center"><Link2 size={22} /></span>
        <p className="mt-4 text-[17px] font-medium">Verbinde {tool}</p>
        <p className="mt-1 text-[14px] text-mute">Einmal anmelden, danach siehst du hier {what}.</p>
        <div className="mt-5"><Btn onClick={() => open({ k: 'conn' })}>Jetzt verbinden</Btn></div>
      </Card></div>
    </div>
  )
}

const TOOLS: { k: string; name: string; logo: string; color: string; auto?: boolean; what: string }[] = [
  { k: 'phorest', name: 'Phorest', logo: 'P', color: '#1F2937', auto: true, what: 'Deine Termine und Schichten' },
  { k: 'timebutler', name: 'Timebutler', logo: 'T', color: '#0E7490', what: 'Ferien, Anträge, Stempeluhr' },
  { k: 'mail', name: 'Postfach', logo: '@', color: '#77816F', what: 'bea@beautylounge.ch' },
]
function Connections() {
  const { conn, connect, me } = useApp()
  const [sheet, setSheet] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const tool = TOOLS.find(t => t.k === sheet)
  const doConnect = () => { setBusy(true); setTimeout(() => { connect(sheet!, true); setBusy(false); setSheet(null) }, 900) }
  return (
    <div className="pb-10"><Title>Verbindungen</Title>
      <div className="px-5">
        <p className="text-[14px] text-mute -mt-2 mb-4">Deine Konten in anderen Tools. Einmal verbinden, danach bleibt die Anmeldung bestehen.</p>
        <List>{TOOLS.map(t => (
          <div key={t.k} className="flex items-center gap-3 px-4 py-3.5">
            <span className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-semibold" style={{ background: t.color }}>{t.logo}</span>
            <span className="flex-1 min-w-0"><span className="block text-[15px] font-medium">{t.name}</span>
              <span className="block text-xs text-mute truncate">{conn[t.k] ? (t.auto ? `Automatisch · ${me.first} (D/SR), Pratteln` : t.what) : t.what}</span></span>
            {conn[t.k] ? <span className="flex items-center gap-1 text-[13px] text-sage-800"><Check size={15} />{t.auto ? 'Aktiv' : 'Verbunden'}</span>
              : <button onClick={() => setSheet(t.k)} className="h-9 px-4 rounded-full bg-ink text-white text-[13px]">Verbinden</button>}
          </div>
        ))}</List>
        <p className="mt-3 text-xs text-mute">Phorest braucht keine eigene Anmeldung. TeamHub erkennt dich über deine Firmen-Mail und zeigt dir deine eigenen Termine. Weitere Tools kommen hier dazu.</p>
        {(conn.timebutler || conn.mail) && <button onClick={() => { connect('timebutler', false); connect('mail', false) }} className="mt-5 text-[13px] text-mute underline underline-offset-2">Verbindungen trennen (Demo zurücksetzen)</button>}
      </div>
      {tool && <Sheet onClose={() => setSheet(null)}>
        <div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-semibold" style={{ background: tool.color }}>{tool.logo}</span><p className="font-medium text-[17px]">Mit {tool.name} verbinden</p></div>
        <div className="mt-5 space-y-3">
          <div><p className="text-xs text-mute mb-1">E-Mail</p><div className="h-11 rounded-xl bg-white px-3 flex items-center text-[15px]">{me.first.toLowerCase()}@beautylounge.ch</div></div>
          <div><p className="text-xs text-mute mb-1">{tool.k === 'mail' ? 'Mail-Passwort' : 'Timebutler-Passwort'}</p><div className="h-11 rounded-xl bg-white px-3 flex items-center text-[15px] tracking-widest">••••••••</div></div>
        </div>
        <div className="mt-5"><Btn onClick={doConnect}>{busy ? 'Verbinde …' : 'Verbinden'}</Btn></div>
        {tool.k === 'timebutler' && <button onClick={doConnect} className="mt-2 w-full h-12 rounded-2xl bg-white text-[15px]">Mit Microsoft anmelden</button>}
        <p className="mt-3 text-xs text-mute flex items-center gap-1.5 justify-center"><Lock size={12} />{tool.k === 'mail' ? 'Zugang wird verschlüsselt gespeichert.' : 'Passwort wird nicht gespeichert, nur ein Zugangsschlüssel.'}</p>
      </Sheet>}
    </div>
  )
}
