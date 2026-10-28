import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth, type Employee } from './lib/auth'
import { supabase } from './lib/supabase'
import { captureAccountScope, isCurrentAccountScope, type AccountScope } from './lib/account-scope'

import { setWikiStructure, type AreaRow } from './lib/wiki'
import { tr, setCurrentLang, savedLang, locale, type Lang } from './lib/i18n'
import { toast } from './Toast'
export type { Lang }

/* ---------- Typen ---------- */
export type Staff = { id: string; first: string; last: string; branch: string; branch_id: string; role: string; skills: string[]; photo: string | null; app_role: string; active: boolean; email: string; phone?: string | null; appInstalled?: boolean; pushEnabled?: boolean; extra?: string[]; about?: string | null; kind?: 'lehrling' | 'praktikantin' | null; deputyId?: string | null }
// Abwesenheit (Stellvertretung, 28.10.): in dieser Zeit gehen Aufgaben an die Ersatzperson
export type Absence = { id: string; employeeId: string; from: string; until: string; note: string }
export type News = { id: string; title: string; teaser: string; body: string; author: string; authorId: string | null; date: string; tag: string; mustRead: boolean; audience: string; audienceBranches: string[]; audienceGroups: string[]; audienceSkills: string[]; audiencePeople: string[]; publishAt: string; wikiCategory: string | null; image: string | null; orig: { title: string; teaser: string; body: string } | null }
export type TaskItem = { id: string; title: string; time: string; group: string; prio: boolean; proof: boolean; articleId: string | null; linkUrl: string | null }
export type Template = { id: string; name: string; repeat: 'daily' | 'weekly' | 'monthly'; weekday: number | null; monthday: number | null; branchIds: string[]; items: TaskItem[]; active: boolean; proposed: boolean; sample: boolean }
export type Done = { by: string; byId: string | null; at: string; photo: string | null }
export type Ticket = { id: string; kind: 'Meldung' | 'Idee' | 'Learning' | 'Anliegen'; title: string; body: string; branch: string; branchId: string; allStudios: boolean; status: 'Neu' | 'Zugewiesen' | 'In Arbeit' | 'Erledigt'; who: string; when: string; assignee: string | null; photo: string | null; mediaKind: 'photo' | 'video'; viaAI: boolean; mine: boolean; votes: number; voted: boolean; comments: Comment[] }
export type Comment = { id: string; author: string; authorId: string | null; body: string; when: string }
export type Ev = { id: string; title: string; kind: string; description: string; startsAt: string; endsAt: string | null; place: string; link: string | null; capacity: number | null; registerUntil: string | null; audienceBranches: string[]; audienceSkills: string[]; audiencePeople: string[]; phorestSync: boolean; phorestPaid: boolean; taken: number; waiting: number; createdBy: string | null; raw: { title: string; description: string; place: string }; image: string | null; imagePath: string | null; createdAt: string }
// Bild oder Video zu einem Aufzählungspunkt (26.10., Renée): media[j] gehört zu items[j]
export type ItemMedia = { t: 'img' | 'video'; src?: string; url?: string; name?: string }
export type WikiBlock = { t: 'h' | 'p' | 'ul' | 'ol' | 'quote' | 'img' | 'video' | 'file'; text?: string; items?: string[]; media?: (ItemMedia | null)[]; src?: string; url?: string; name?: string; level?: number }
export type WikiArticle = { id: string; cat: string; catKey: string; title: string; minutes: number; updated: string; at: string; body: string[]; mediaKind: string; mediaUrl: string | null; published: boolean; fromNews?: boolean; intro: string; tags: string[]; accessLevel: 'alle' | 'filialleitung' | 'buero'; imported: boolean; createdAt?: string; reviewDue?: string | null; ownerId?: string | null }
export type Step = { id: string; title: string; minutes: number; articleId: string | null; proposed: boolean; branchIds: string[] }
export type Branch = { id: string; name: string; is_office: boolean }
export type Quiz = { id: string; newsId: string | null; articleId: string | null; title: string; passPct: number; sample: boolean }
export type Attempt = { quizId: string; employeeId: string; scorePct: number; passed: boolean; at: string }
export type QuizQuestion = { id: string; sort: number; kind: 'single' | 'multi' | 'text'; prompt: string; options: string[] }
export type PollQ = { id: string; kind: 'single' | 'multi' | 'scale' | 'text'; prompt: string; options: string[] }
export type Poll = { id: string; newsId: string; anonymous: boolean; showResults: boolean; closesAt: string | null; questions: PollQ[] }
export type PollValue = number | number[] | string
export type QuizResult = { score_pct: number; passed: boolean; pass_pct: number; correct: number; total: number; results: Record<string, boolean>; feedback?: Record<string, string>; error?: string }

// Gruppen aus der Funktion – gleiche Regel wie public.job_groups() in der Datenbank
export const GROUPS = ['Filialleitung', 'Kosmetikerinnen', 'Lernende', 'Büro'] as const
export const jobGroups = (title: string) => [
  /(respo|stv\.?\s*r|filialleit)/i.test(title) && 'Filialleitung', /kosmetik/i.test(title) && 'Kosmetikerinnen',
  /(lehrling|lernend|praktik|berufsbild)/i.test(title) && 'Lernende', /(büro|buero|\bhr\b|fibu|office)/i.test(title) && 'Büro',
].filter(Boolean) as string[]
// Wer gehört zur Zielgruppe einer News? Personen gewählt = genau diese; sonst Studio UND Gruppe UND Skill (leer = alle)
export const inNewsAudience = (s: Staff, n: Pick<News, 'audienceBranches' | 'audienceGroups' | 'audienceSkills' | 'audiencePeople'>) =>
  n.audiencePeople.length ? n.audiencePeople.includes(s.id)
    : (n.audienceBranches.length === 0 || [s.branch_id, ...(s.extra ?? [])].some(b => n.audienceBranches.includes(b))) && (n.audienceGroups.length === 0 || jobGroups(s.role).some(g => n.audienceGroups.includes(g)))
      && (n.audienceSkills.length === 0 || s.skills.some(k => n.audienceSkills.includes(k)))

/* ---------- Datum (Europe/Zurich) ---------- */
export const TZ = 'Europe/Zurich'
export const isoDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
// Kalendertage zählen statt 24-Stunden-Schritte (sonst doppelt oder fehlend bei der Zeitumstellung)
export const addDays = (n: number, base = isoDay()) => { const [y, m, d] = base.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
export const fmtDate = (s: string, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: '2-digit' }) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, ...o }).format(new Date(s))
// Stunde als Zahl in Zürcher Zeit (formatToParts, weil de-CH „16 Uhr“ formatiert)
export const zurichHour = (d = new Date()) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d); const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0); return g('hour') % 24 + g('minute') / 60 }
export const fmtTime = (s: string) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(s))
const relWhen = (s: string) => {
  const d = isoDay(new Date(s)), today = isoDay(), y = addDays(-1)
  return d === today ? `${tr('Heute')}, ${fmtTime(s)}` : d === y ? tr('Gestern') : fmtDate(s, { day: '2-digit', month: '2-digit' })
}
const isoDow = (day: string) => ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1
// Gilt die Vorlage heute für diese Filiale?
export const appliesOn = (t: Template, day: string, branch: string) =>
  (t.branchIds.length === 0 || t.branchIds.includes(branch)) &&
  (t.repeat === 'daily' || (t.repeat === 'weekly' && t.weekday === isoDow(day)) || (t.repeat === 'monthly' && Math.min(t.monthday ?? 1, new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate()) === Number(day.slice(8, 10))))

type Ctx = {
  me: Staff; employee: Employee
  lang: Lang; setLang: (l: Lang) => void; t: (s: string, vars?: Record<string, string | number>) => string
  loading: boolean; loadError: boolean; progressVersion: number; reload: () => Promise<void>; refreshTickets: () => Promise<void>
  branches: Branch[]; staff: Staff[]; skillCatalog: string[]
  news: News[]; read: Set<string>; opened: Set<string>; openNews: (id: string) => void; confirm: (id: string) => Promise<void>
  newsReads: { news_id: string; employee_id: string; confirmed_at: string | null }[]
  templates: Template[]; tasks: TaskItem[]; done: Map<string, Done>; toggle: (id: string, photo?: File, branchId?: string) => Promise<void>
  /** Checklisten anderer Studios, die ich heute vertretungsweise mache (Stellvertretung, 28.10.) */
  coverTasks: { branchId: string; branch: string; who: string; items: TaskItem[]; done: Map<string, Done> }[]
  completionsToday: { item_id: string; branch_id: string }[]
  tickets: Ticket[]; addTicket: (t: { kind: 'Meldung' | 'Idee' | 'Learning' | 'Anliegen'; title: string; body?: string; photo?: File; viaAI?: boolean; branchId?: string; allStudios?: boolean }) => Promise<boolean>
  addComment: (ticketId: string, body: string) => Promise<boolean>; toggleVote: (ticketId: string) => Promise<void>
  assign: (id: string, a: string) => Promise<void>; setStatus: (id: string, s: Ticket['status']) => Promise<void>
  events: Ev[]; joined: Set<string>; declined: Set<string>; waiting: Set<string>; toggleEvent: (id: string) => Promise<string | null>; declineEvent: (id: string) => Promise<void>
  registrations: { event_id: string; employee_id: string; coming: boolean; waitlist: boolean; created_at?: string }[]
  polls: Poll[]; pollAnswers: Map<string, PollValue>; submitPoll: (pollId: string, answers: Record<string, PollValue>) => Promise<boolean>
  standby: { employee_id: string; day: string; note: string }[]; toggleStandby: (day: string) => Promise<void>
  demoData: boolean; setDemoData: (on: boolean) => Promise<void>
  /** Einzel- und eigene Gruppenchats (Büro schaltet sie ein, app_settings chat_private) */
  privateChats: boolean
  quizzes: Quiz[]; attempts: Attempt[]; submitQuiz: (quizId: string, answers: Record<string, number[] | string>) => Promise<QuizResult | null>
  wiki: WikiArticle[]; reloadWiki: () => Promise<void>; catEmojis: Record<string, string>; wikiStructure: number; catAreas: Record<string, string>;
  absences: Absence[]; covering: Staff[]; reloadAbsences: () => Promise<void>; steps: Step[]; allSteps: Step[]; obDone: Set<string>; toggleStep: (id: string) => Promise<void>
  skills: string[]
  photo: string | null; setPhotoFile: (f: File) => Promise<void>
  myPhorest: { branch_id: string; staff_id: string }[]
  signedUrl: (bucket: string, path: string) => Promise<string | null>
}
const C = createContext<Ctx | null>(null)
// Automatische Übersetzung (Function translate): Feld in der Profilsprache, sonst Deutsch
const tx = (row: any, field: string, lang: Lang) => (lang !== 'DE' && row?.i18n?.[lang]?.[field]) || row?.[field]
export const useApp = () => useContext(C)!

const toStaff = (e: any, branches: Branch[], photos: Map<string, string>): Staff => ({
  id: e.id, first: e.first_name, last: e.last_name, branch: branches.find(b => b.id === e.branch_id)?.name ?? e.branch_id, branch_id: e.branch_id, extra: e.extra_branch_ids ?? [],
  role: e.job_title, skills: e.skills ?? [], photo: e.photo_path ? photos.get(e.photo_path) ?? null : null, app_role: e.app_role, active: e.active, email: e.email, phone: e.phone ?? null, appInstalled: !!e.app_installed_at, pushEnabled: !!e.push_enabled, about: e.about ?? null,
  kind: e.staff_kind ?? null, deputyId: e.deputy_id ?? null,
})

// Fetch pagination must fail explicitly; an unavailable table is not an empty list.
async function allRows(q: () => any, scope: AccountScope) {
  const out: any[] = []
  for (let from = 0; from < 50000; from += 1000) {
    if (!isCurrentAccountScope(scope)) throw new Error('account_changed')
    const { data, error } = await q().range(from, from + 999).abortSignal(scope.signal)
    if (error) throw error
    out.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) break
  }
  return { data: out }
}
async function signedMap(bucket: string, paths: string[], scope: AccountScope) {
  const result = new Map<string, string>()
  if (!paths.length || !supabase || !isCurrentAccountScope(scope)) return result
  const { data } = await supabase.storage.from(bucket).createSignedUrls([...new Set(paths)], 3600)
  if (!isCurrentAccountScope(scope)) return result
  for (const x of data ?? []) if (x.signedUrl && x.path) result.set(x.path, x.signedUrl)
  return result
}
function ticketSnapshot(tks: any[], comments: any[], votes: { ticket_id: string; employee_id: string }[], photos: Map<string, string>, branches: Branch[], employeeId: string): Ticket[] {
  return tks.map(x => ({
    id: x.id, kind: x.kind, title: x.title, body: x.body, branch: x.all_studios ? tr('Alle Studios') : branches.find(b => b.id === x.branch_id)?.name ?? x.branch_id,
    branchId: x.branch_id, allStudios: !!x.all_studios, status: x.status, who: x.created_by_name,
    when: relWhen(x.created_at), assignee: x.assignee, photo: x.photo_path ? photos.get(x.photo_path) ?? null : null, mediaKind: x.media_kind ?? 'photo', viaAI: x.via_ai,
    mine: x.created_by === employeeId, votes: votes.filter(v => v.ticket_id === x.id).length, voted: votes.some(v => v.ticket_id === x.id && v.employee_id === employeeId),
    comments: comments.filter(c => c.ticket_id === x.id).map(c => ({ id: c.id, author: c.author_name, authorId: c.author_id, body: c.body, when: relWhen(c.created_at) })),
  }))
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth()
  const [scope] = useState(() => captureAccountScope(employee?.id))
  const mounted = useRef(true), requestVersion = useRef(0), wikiVersion = useRef(0), ticketVersion = useRef(0), hadData = useRef(false)
  const [loadError, setLoadError] = useState(false)
  const [wikiError, setWikiError] = useState(false)
  const [progressVersion, setProgressVersion] = useState(0)
  const progressRequestVersion = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestVersion.current++; wikiVersion.current++; ticketVersion.current++ } }, [])
  const current = useCallback(() => mounted.current && isCurrentAccountScope(scope), [scope])
  const [lang, setLangState] = useState<Lang>(() => employee?.lang ?? savedLang())
  setCurrentLang(lang) // Datumsformate und tr() außerhalb von Komponenten folgen der gewählten Sprache
  const t = (s: string, vars?: Record<string, string | number>) => tr(s, vars, lang)
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<Branch[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [skillCatalog, setSkillCatalog] = useState<string[]>([])
  const [news, setNews] = useState<News[]>([])
  const [newsReads, setNewsReads] = useState<Ctx['newsReads']>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [completions, setCompletions] = useState<any[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [registrations, setRegistrations] = useState<Ctx['registrations']>([])
  const [standby, setStandby] = useState<Ctx['standby']>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollAnswers, setPollAnswers] = useState<Map<string, PollValue>>(new Map())
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [demoData, setDemoState] = useState(true)
  const [privateChats, setPrivateChats] = useState(false)
  const [allSteps, setAllSteps] = useState<Step[]>([])
  const steps = useMemo(() => allSteps.filter(x => !x.proposed), [allSteps])
  const [obDone, setObDone] = useState<Set<string>>(new Set())
  const [myPhorest, setMyPhorest] = useState<Ctx['myPhorest']>([])
  const newsForWiki = useRef<any[]>([])
  const [wikiRows, setWikiRows] = useState<any[]>([])
  const [catEmojis, setCatEmojis] = useState<Record<string, string>>({})
  const [wikiStructure, setWikiStructureVer] = useState(0), [catAreas, setCatAreas] = useState<Record<string, string>>({})
  const [absences, setAbsences] = useState<Absence[]>([])
  // Wissen: nur Liste laden (ohne Inhalte), einmal beim Start und nach Änderungen im Backoffice
  const reloadWiki = useCallback(async () => {
    if (!supabase || !employee || !scope || !current()) return
    const version = ++wikiVersion.current
    const [articles, categories, areas] = await Promise.all([
      supabase.from('wiki_articles').select('id, category, title, minutes, updated_at, created_at, review_due, media_kind, media_url, published, access_level, tags, intro, source_id, is_sample, owner_id, i18n_en:i18n->EN, i18n_fr:i18n->FR').order('category').order('sort').order('title').abortSignal(scope.signal),
      supabase.from('wiki_categories').select('key, emoji, area_key').abortSignal(scope.signal),
      supabase.from('wiki_areas').select('key, name, description, icon, tone, access_level, sort').order('sort').abortSignal(scope.signal),
    ]).catch(() => [{ data: null, error: true }, { data: null, error: true }, { data: null, error: true }])
    if (!current() || version !== wikiVersion.current) return
    if (articles.error || categories.error) { setWikiError(true); return }
    setWikiError(false)
    setWikiRows(articles.data ?? [])
    setCatEmojis(Object.fromEntries((categories.data ?? []).filter((c: { emoji: string | null }) => c.emoji).map((c: { key: string; emoji: string }) => [c.key, c.emoji])))
    // Bereiche und Zuordnung der Themen (Büro, seit 28.10.); ohne Tabelle bleiben die eingebauten fünf
    if (!areas.error) setWikiStructure((areas.data ?? []) as AreaRow[], (categories.data ?? []) as { key: string; area_key: string | null }[])
    setCatAreas(Object.fromEntries((categories.data ?? []).filter((c: { area_key: string | null }) => c.area_key).map((c: { key: string; area_key: string }) => [c.key, c.area_key])))
    setWikiStructureVer(v => v + 1)
  }, [employee, scope, current])
  const reloadAbsences = useCallback(async () => {
    if (!supabase || !employee || !scope || !current()) return
    const { data, error } = await supabase.from('employee_absences').select('id, employee_id, from_day, until_day, note').gte('until_day', addDays(-1)).order('from_day').abortSignal(scope.signal)
    if (current() && !error) setAbsences((data ?? []).map((a: any) => ({ id: a.id, employeeId: a.employee_id, from: a.from_day, until: a.until_day, note: a.note ?? '' })))
  }, [employee, scope, current])

  const signedUrl = useCallback(async (bucket: string, path: string) => {
    if (!supabase || !current()) return null
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
    return current() ? data?.signedUrl ?? null : null
  }, [current])

  // A retry after an uncertain transport result must address the same insert.
  // Cleared with this provider's account/session lifetime.
  const pendingComments = useRef(new Map<string, string>())
  const ticketInputs = useRef({ branches, demoData })
  useEffect(() => { ticketInputs.current = { branches, demoData } }, [branches, demoData])
  const ticketJob = useRef<{ running: Promise<void> | null; again: boolean }>({ running: null, again: false })
  const refreshTickets = useCallback((): Promise<void> => {
    if (!supabase || !employee || !scope || !current()) return Promise.resolve()
    const job = ticketJob.current
    if (job.running) { job.again = true; ticketVersion.current++; return job.running }
    const run = async () => {
      do {
        job.again = false
        const version = ++ticketVersion.current
        const [rows, comments, votes] = await Promise.all([
          allRows(() => supabase!.from('tickets').select('*').order('created_at', { ascending: false }), scope),
          allRows(() => supabase!.from('ticket_comments').select('id, ticket_id, author_id, author_name, body, created_at').order('created_at'), scope),
          allRows(() => supabase!.from('ticket_votes').select('ticket_id, employee_id').order('ticket_id'), scope),
        ])
        if (!current()) return
        const input = ticketInputs.current
        const tks = rows.data.filter(x => input.demoData || !x.is_sample)
        const photos = await signedMap('ticket-photos', tks.map(x => x.photo_path).filter(Boolean), scope)
        if (current() && version === ticketVersion.current) setTickets(ticketSnapshot(tks, comments.data, votes.data, photos, input.branches, employee.id))
      } while (job.again && current())
    }
    const running = run().finally(() => { if (job.running === running) job.running = null })
    job.running = running
    return running
  }, [employee, scope, current])

  // Progress events are invalidations only. Batch bursts and refetch only the
  // affected authorized tables; never merge a Realtime payload into user data.
  type ProgressTable = 'event_registrations' | 'task_completions' | 'news_reads' | 'quiz_attempts' | 'onboarding_progress' | 'wiki_runs'
  const progressJob = useRef<{ pending: Set<ProgressTable>; running: boolean; timer: ReturnType<typeof setTimeout> | null }>({ pending: new Set(), running: false, timer: null })
  const refreshProgressRef = useRef<() => void>(() => {})
  const refreshProgress = useCallback(() => {
    const job = progressJob.current
    if (!supabase || !employee || !scope || !current() || !hadData.current || job.running || !job.pending.size) return
    const changed = new Set(job.pending); job.pending.clear(); job.running = true
    const version = ++progressRequestVersion.current
    const all = (table: ProgressTable, columns: string, order: string) => changed.has(table) ? allRows(() => supabase!.from(table).select(columns).order(order), scope) : Promise.resolve(null)
    void (async () => {
      try {
        const [registrations, counts, completions, reads, attempts, onboarding] = await Promise.all([
          all('event_registrations', 'event_id, employee_id, coming, waitlist, created_at', 'created_at'),
          changed.has('event_registrations') ? supabase!.rpc('event_counts').abortSignal(scope.signal) : Promise.resolve(null),
          changed.has('task_completions') ? supabase!.from('task_completions').select('item_id, branch_id, done_by, done_by_name, done_at, photo_path, day').eq('day', isoDay()).abortSignal(scope.signal) : Promise.resolve(null),
          all('news_reads', 'news_id, employee_id, confirmed_at', 'news_id'),
          all('quiz_attempts', 'quiz_id, employee_id, score_pct, passed, created_at', 'created_at'),
          changed.has('onboarding_progress') ? supabase!.from('onboarding_progress').select('step_id').eq('employee_id', employee.id).abortSignal(scope.signal) : Promise.resolve(null),
        ])
        if (!current() || version !== progressRequestVersion.current) return
        if ([registrations, counts, completions, reads, attempts, onboarding].some(r => r && 'error' in r && r.error)) throw new Error('progress_unavailable')
        if (registrations && counts) {
          const rows = registrations.data as Ctx['registrations']
          const taken = new Map(((counts.data ?? []) as { event_id: string; taken: number }[]).map(c => [c.event_id, c.taken]))
          setRegistrations(rows)
          setEvents(events => events.map(event => ({ ...event, taken: taken.get(event.id) ?? 0, waiting: rows.filter(r => r.event_id === event.id && r.coming && r.waitlist).length })))
        }
        if (completions) setCompletions(completions.data ?? [])
        if (reads) setNewsReads(reads.data as Ctx['newsReads'])
        if (attempts) setAttempts(attempts.data.map((a: any) => ({ quizId: a.quiz_id, employeeId: a.employee_id, scorePct: a.score_pct, passed: a.passed, at: a.created_at })))
        if (onboarding) setObDone(new Set((onboarding.data ?? []).map(x => x.step_id)))
        // Local historical/task/wiki queries use this revision for their own
        // account-fenced refetch. wiki_runs itself stays scoped in those views.
        setProgressVersion(n => n + 1)
      } catch {
        // Preserve the last verified state; focus and the existing 120s refresh
        // recover outages without presenting failed queries as empty progress.
      } finally {
        job.running = false
        if (current() && job.pending.size && !job.timer) job.timer = setTimeout(() => { job.timer = null; refreshProgressRef.current() }, 750)
      }
    })()
  }, [employee, scope, current])
  refreshProgressRef.current = refreshProgress

  const reload = useCallback(async () => {
    if (!supabase || !employee || !scope || !current()) return
    const version = ++requestVersion.current, ticketRevision = ++ticketVersion.current, progressRevision = progressRequestVersion.current
    if (!hadData.current) setLoading(true)
    setLoadError(false)
    void reloadWiki()
    void reloadAbsences()
    const valid = () => current() && version === requestVersion.current
    try {
    const sb = supabase
    const today = isoDay()
    // Alle Seiten holen: PostgREST gibt höchstens 1000 Zeilen je Abfrage zurück
    const all = (q: () => any) => allRows(q, scope)
    const [br, em, sk, nw, rd, tt, ti, tc, tk, ev, cnt, rg, wk, ob, obp, mp, fl, tcm, tvt, sbd, qz, qa, pl, plq, pla] = await Promise.all([
      sb.from('branches').select('id, name, is_office').order('sort').abortSignal(scope.signal),
      sb.from('employees').select('id, email, phone, first_name, last_name, job_title, app_role, branch_id, extra_branch_ids, skills, photo_path, active, app_installed_at, push_enabled, about, staff_kind, deputy_id').order('first_name').abortSignal(scope.signal),
      sb.from('skills').select('name').order('sort').abortSignal(scope.signal),
      sb.from('news').select('*').order('publish_at', { ascending: false }).abortSignal(scope.signal),
      all(() => sb.from('news_reads').select('news_id, employee_id, confirmed_at').order('news_id')),
      sb.from('task_templates').select('*').order('sort').abortSignal(scope.signal),
      sb.from('task_items').select('*').order('sort').abortSignal(scope.signal),
      sb.from('task_completions').select('item_id, branch_id, done_by, done_by_name, done_at, photo_path, day').eq('day', today).abortSignal(scope.signal),
      sb.from('tickets').select('*').order('created_at', { ascending: false }).abortSignal(scope.signal),
      sb.from('events').select('*').order('starts_at').abortSignal(scope.signal),
      sb.rpc('event_counts').abortSignal(scope.signal),
      all(() => sb.from('event_registrations').select('event_id, employee_id, coming, waitlist, created_at').order('created_at')),
      Promise.resolve({ data: null, error: null }),
      sb.from('onboarding_steps').select('*').order('sort').abortSignal(scope.signal),
      sb.from('onboarding_progress').select('step_id').eq('employee_id', employee.id).abortSignal(scope.signal),
      sb.from('employee_phorest').select('branch_id, staff_id').eq('employee_id', employee.id).abortSignal(scope.signal),
      sb.rpc('app_flags').abortSignal(scope.signal),
      all(() => sb.from('ticket_comments').select('id, ticket_id, author_id, author_name, body, created_at').order('created_at')),
      all(() => sb.from('ticket_votes').select('ticket_id, employee_id').order('ticket_id')),
      sb.from('standby_days').select('employee_id, day, note').gte('day', today).order('day').abortSignal(scope.signal),
      sb.from('quizzes').select('id, news_id, article_id, title, pass_pct, is_sample, i18n').abortSignal(scope.signal),
      all(() => sb.from('quiz_attempts').select('quiz_id, employee_id, score_pct, passed, created_at').order('created_at')),
      sb.from('polls').select('id, news_id, anonymous, show_results, closes_at').abortSignal(scope.signal),
      sb.from('poll_questions').select('id, poll_id, sort, kind, prompt, options, i18n').order('sort').abortSignal(scope.signal),
      sb.from('poll_answers').select('question_id, value').eq('employee_id', employee.id).abortSignal(scope.signal),
    ])
    if (!valid()) return
    const failures = [br, em, sk, nw, rd, tt, ti, tc, tk, ev, cnt, rg, ob, obp, mp, fl, tcm, tvt, sbd, qz, qa, pl, plq, pla].some(x => 'error' in x && x.error)
    if (failures) throw new Error('app_data_unavailable')
    const demo = (fl.data as any)?.demo_data !== false
    const keep = (rows: any[] | null) => (rows ?? []).filter((r: any) => demo || !r.is_sample)
    const brs = (br.data ?? []) as Branch[]
    const bname = (id: string) => brs.find(b => b.id === id)?.name ?? id
    const tks = keep(tk.data)
    const [photos, nImgs, tkPhotos] = await Promise.all([
      signedMap('profile-photos', (em.data ?? []).map((e: any) => e.photo_path).filter(Boolean), scope),
      signedMap('media', [...keep(nw.data).map((n: any) => n.image_path), ...keep(ev.data).map((e: any) => e.image_path)].filter(Boolean), scope),
      signedMap('ticket-photos', tks.map((x: any) => x.photo_path).filter(Boolean), scope),
    ])
    if (!valid()) return
    const progressCurrent = progressRevision === progressRequestVersion.current
    setDemoState(demo)
    setPrivateChats((fl.data as any)?.chat_private === true)
    setBranches(brs)
    ticketInputs.current = { branches: brs, demoData: demo }
    setStaff((em.data ?? []).map((e: any) => toStaff(e, brs, photos)))
    setSkillCatalog((sk.data ?? []).map((s: any) => s.name))
    setNews(keep(nw.data).map((n: any) => ({
      id: n.id, title: tx(n, 'title', lang), teaser: tx(n, 'teaser', lang), body: tx(n, 'body', lang), author: n.author_name || tr('Büro'), authorId: n.author_id ?? null, tag: n.tag, mustRead: n.must_read,
      date: fmtDate(n.publish_at), audience: n.audience_people?.length ? `${n.audience_people.length} ${n.audience_people.length === 1 ? tr('Person') : tr('Personen')}` : [n.audience_branches?.length ? n.audience_branches.map(bname).join(', ') : tr('Alle Studios'), ...(n.audience_groups ?? []), ...(n.audience_skills ?? [])].join(' · '),
      audienceBranches: n.audience_branches ?? [], audienceGroups: n.audience_groups ?? [], audienceSkills: n.audience_skills ?? [], audiencePeople: n.audience_people ?? [],
      publishAt: n.publish_at, wikiCategory: n.wiki_category, image: n.image_path ? nImgs.get(n.image_path) ?? null : null,
      orig: lang !== 'DE' && n.i18n?.[lang] ? { title: n.title, teaser: n.teaser, body: n.body } : null,
    })))
    if (progressCurrent) setNewsReads((rd.data ?? []) as Ctx['newsReads'])
    const items = (ti.data ?? []) as any[]
    setTemplates(keep(tt.data).map((x: any) => ({
      id: x.id, name: tx(x, 'name', lang), repeat: x.repeat, weekday: x.weekday, monthday: x.monthday, branchIds: x.branch_ids ?? [],
      items: items.filter(i => i.template_id === x.id).map(i => ({ id: i.id, title: tx(i, 'title', lang), time: i.due_time ? String(i.due_time).slice(0, 5) : '', group: tx(x, 'name', lang), prio: i.prio, proof: i.proof_photo, articleId: i.article_id ?? null, linkUrl: i.link_url ?? null })),
      active: x.active, proposed: x.proposed, sample: x.is_sample,
    })))
    if (progressCurrent) setCompletions(tc.data ?? [])
    const counts = new Map(((cnt.data ?? []) as any[]).map(c => [c.event_id, c.taken]))
    setEvents(previous => keep(ev.data).map((e: any) => ({
      id: e.id, title: tx(e, 'title', lang), kind: e.kind, description: tx(e, 'description', lang), startsAt: e.starts_at, endsAt: e.ends_at, place: tx(e, 'place', lang), link: e.link, createdBy: e.created_by ?? null, raw: { title: e.title, description: e.description ?? '', place: e.place ?? '' },
      capacity: e.capacity, registerUntil: e.register_until, audienceBranches: e.audience_branches ?? [], audienceSkills: e.audience_skills ?? [], audiencePeople: e.audience_people ?? [], phorestSync: !!e.phorest_sync, phorestPaid: e.phorest_paid !== false, taken: progressCurrent ? counts.get(e.id) ?? 0 : previous.find(x => x.id === e.id)?.taken ?? 0,
      waiting: !progressCurrent ? previous.find(x => x.id === e.id)?.waiting ?? 0 : ((rg.data ?? []) as any[]).filter(r => r.event_id === e.id && r.coming && r.waitlist).length,
      image: e.image_path ? nImgs.get(e.image_path) ?? null : null, imagePath: e.image_path ?? null, createdAt: e.created_at,
    })))
    if (progressCurrent) setRegistrations((rg.data ?? []) as Ctx['registrations'])
    if (ticketRevision === ticketVersion.current) setTickets(ticketSnapshot(tks, tcm.data ?? [], tvt.data ?? [], tkPhotos, brs, employee.id))
    setStandby((sbd.data ?? []) as Ctx['standby'])
    setQuizzes(keep(qz.data).map((q: any) => ({ id: q.id, newsId: q.news_id, articleId: q.article_id, title: tx(q, 'title', lang), passPct: q.pass_pct, sample: q.is_sample })))
    const pqs = (plq.data ?? []) as any[]
    setPolls(((pl.data ?? []) as any[]).map(p => ({ id: p.id, newsId: p.news_id, anonymous: p.anonymous, showResults: p.show_results, closesAt: p.closes_at,
      questions: pqs.filter(q => q.poll_id === p.id).map(q => ({ id: q.id, kind: q.kind, prompt: tx(q, 'prompt', lang), options: (lang !== 'DE' && q.i18n?.[lang]?.options) || q.options || [] })) })))
    setPollAnswers(new Map(((pla.data ?? []) as any[]).map(a => [a.question_id, a.value])))
    if (progressCurrent) setAttempts((qa.data ?? []).map((a: any) => ({ quizId: a.quiz_id, employeeId: a.employee_id, scorePct: a.score_pct, passed: a.passed, at: a.created_at })))
    newsForWiki.current = keep(nw.data).map((n: any) => ({ ...n, title: tx(n, 'title', lang), teaser: tx(n, 'teaser', lang), body: tx(n, 'body', lang) }))
    void wk
    setAllSteps(keep(ob.data).map((s: any) => ({ id: s.id, title: tx(s, 'title', lang), minutes: s.minutes, articleId: s.article_id, proposed: !!s.proposed, branchIds: s.branch_ids ?? [] })))
    if (progressCurrent) setObDone(new Set((obp.data ?? []).map((x: any) => x.step_id)))
    setMyPhorest((mp.data ?? []) as Ctx['myPhorest'])
    hadData.current = true
    setProgressVersion(n => n + 1)
    setLoading(false)
    refreshProgress()
    } catch {
      if (valid()) { setLoadError(true); setLoading(false) }
    }
  }, [employee, lang, scope, current, reloadWiki, reloadAbsences, refreshProgress])

  useEffect(() => {
    if (!employee) return
    void reload()
    // Frische Daten: beim Zurückkehren in die App, alle zwei Minuten im Vordergrund und nach Mitternacht
    let day = isoDay()
    const fresh = () => { if (document.visibilityState !== 'visible') return; if (isoDay() !== day) { day = isoDay() } reload() }
    const onVis = () => { if (document.visibilityState === 'visible') fresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    const iv = window.setInterval(fresh, 120000)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); window.clearInterval(iv) }
  }, [employee, reload, reloadWiki])

  useEffect(() => {
    if (!supabase || !employee || !current()) return
    let active = true, timer: ReturnType<typeof setTimeout> | null = null
    const invalidate = () => {
      if (!active || !current() || timer) return
      timer = setTimeout(() => { timer = null; void refreshTickets().catch(() => {}) }, 100)
    }
    const channel = supabase.channel('tickets:' + employee.id + ':' + scope?.version)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_comments' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_votes' }, invalidate)
      .subscribe(status => { if (status === 'SUBSCRIBED') invalidate() })
    const fallback = window.setInterval(() => { if (document.visibilityState === 'visible') invalidate() }, 15000)
    return () => { active = false; if (timer) clearTimeout(timer); window.clearInterval(fallback); void supabase!.removeChannel(channel) }
  }, [employee, scope, current, refreshTickets])

  useEffect(() => {
    if (!supabase || !employee || !current()) return
    const job = progressJob.current
    let alive = true
    const invalidate = (table: ProgressTable) => {
      if (!alive || !current()) return
      job.pending.add(table)
      if (!job.timer && !job.running) job.timer = setTimeout(() => { job.timer = null; refreshProgressRef.current() }, 300)
    }
    const tables: ProgressTable[] = ['event_registrations', 'task_completions', 'news_reads', 'quiz_attempts', 'onboarding_progress', 'wiki_runs']
    let channel = supabase.channel('progress:' + employee.id + ':' + scope?.version)
    for (const table of tables) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => invalidate(table))
    channel.subscribe(status => { if (status === 'SUBSCRIBED') for (const table of tables) invalidate(table) })
    return () => { alive = false; if (job.timer) clearTimeout(job.timer); job.timer = null; job.pending.clear(); void supabase!.removeChannel(channel) }
  }, [employee, scope, current])

  const meStaff = useMemo<Staff>(() => staff.find(s => s.id === employee?.id) ?? {
    id: employee?.id ?? '', first: employee?.first_name ?? '', last: employee?.last_name ?? '', branch: employee?.branch_name ?? '', branch_id: employee?.branch_id ?? '',
    role: employee?.job_title ?? '', skills: employee?.skills ?? [], photo: null, app_role: employee?.app_role ?? 'mitarbeiterin', active: true, email: employee?.email ?? '',
  }, [staff, employee])

  const wiki = useMemo<WikiArticle[]>(() => {
    const arts: WikiArticle[] = wikiRows.filter((a: any) => demoData || !a.is_sample).map((a: any) => ({
      id: a.id, catKey: a.category, cat: lang === 'EN' ? a.i18n_en?.category ?? a.category : lang === 'FR' ? a.i18n_fr?.category ?? a.category : a.category,
      title: lang === 'EN' ? a.i18n_en?.title ?? a.title : lang === 'FR' ? a.i18n_fr?.title ?? a.title : a.title, minutes: a.minutes, updated: fmtDate(a.updated_at, { day: '2-digit', month: '2-digit', year: 'numeric' }), at: a.updated_at,
      body: [], mediaKind: a.media_kind, mediaUrl: a.media_url, published: a.published, intro: (lang === 'EN' ? a.i18n_en?.intro : lang === 'FR' ? a.i18n_fr?.intro : null) || a.intro || '', tags: a.tags ?? [], accessLevel: a.access_level, imported: !!a.source_id, createdAt: a.created_at, reviewDue: a.review_due ?? null, ownerId: a.owner_id ?? null,
    }))
    // News mit Wissens-Kategorie erscheinen auch im Wissen (BLTH-16 News-zu-Wiki)
    for (const n of newsForWiki.current) if (n.wiki_category && new Date(n.publish_at) <= new Date()) arts.push({
      id: 'news-' + n.id, catKey: n.wiki_category, cat: arts.find(x => x.catKey === n.wiki_category)?.cat ?? n.wiki_category, title: n.title, minutes: Math.max(1, Math.round(String(n.body).split(/\s+/).length / 180)),
      updated: fmtDate(n.publish_at, { day: '2-digit', month: '2-digit', year: 'numeric' }), at: n.publish_at, body: String(n.body).split(/\n\n+/), mediaKind: 'none', mediaUrl: null, published: true, fromNews: true,
      intro: n.teaser ?? '', tags: [], accessLevel: 'alle', imported: false,
    })
    return arts
  }, [wikiRows, news, demoData, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  const today = isoDay()
  const myBranch = employee?.branch_id ?? ''
  // „Alle Studios“ meint die Studios, nicht das Büro: das Büro bekommt nur ausdrücklich zugewiesene Vorlagen
  const officeBranch = branches.find(b => b.id === myBranch)?.is_office ?? false
  const tasks = useMemo(() => templates.filter(x => x.active && appliesOn(x, today, myBranch) && (!officeBranch || x.branchIds.includes(myBranch))).flatMap(x => x.items).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')), [templates, today, myBranch, officeBranch])
  const done = useMemo(() => new Map(completions.filter(c => c.branch_id === myBranch && c.day === today).map(c => [c.item_id, { by: c.done_by_name, byId: c.done_by ?? null, at: fmtTime(c.done_at), photo: c.photo_path }])), [completions, myBranch, today])
  // Wen vertrete ich heute? (Ersatzperson eingetragen und Abwesenheit läuft)
  const covering = useMemo(() => staff.filter(s => s.active && s.deputyId === employee?.id && absences.some(a => a.employeeId === s.id && a.from <= today && a.until >= today)), [staff, absences, employee, today])
  const coverTasks = useMemo(() => [...new Set(covering.map(c => c.branch_id))].filter(b => b && b !== myBranch && b !== 'buero').map(b => ({
    branchId: b, branch: branches.find(x => x.id === b)?.name ?? b, who: covering.filter(c => c.branch_id === b).map(c => c.first).join(', '),
    items: templates.filter(x => x.active && !x.proposed && appliesOn(x, today, b)).flatMap(x => x.items).sort((a, c) => (a.time || '99').localeCompare(c.time || '99')),
    done: new Map(completions.filter(c => c.branch_id === b && c.day === today).map(c => [c.item_id, { by: c.done_by_name, byId: c.done_by ?? null, at: fmtTime(c.done_at), photo: c.photo_path }])),
  })).filter(x => x.items.length), [covering, myBranch, branches, templates, completions, today])
  const myReads = newsReads.filter(r => r.employee_id === employee?.id)
  const read = useMemo(() => new Set(myReads.filter(r => r.confirmed_at).map(r => r.news_id)), [myReads])
  const opened = useMemo(() => new Set(myReads.map(r => r.news_id)), [myReads])
  const joined = useMemo(() => new Set(registrations.filter(r => r.employee_id === employee?.id && r.coming).map(r => r.event_id)), [registrations, employee])
  const waiting = useMemo(() => new Set(registrations.filter(r => r.employee_id === employee?.id && r.coming && r.waitlist).map(r => r.event_id)), [registrations, employee])
  const declined = useMemo(() => new Set(registrations.filter(r => r.employee_id === employee?.id && !r.coming).map(r => r.event_id)), [registrations, employee])

  if (!employee) return <C.Provider value={null}>{children}</C.Provider>
  const sb = supabase!
  const name = `${employee.first_name} ${employee.last_name.slice(0, 1)}.`
  const upload = async (bucket: string, file: File, stem: string) => {
    if (!current()) return null
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${employee.id}/${stem}.${ext}`
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
    return error || !current() ? null : path
  }

  const value: Ctx = {
    me: meStaff, employee, lang, t, loading, loadError: loadError || wikiError, progressVersion, reload, refreshTickets,
    setLang: (l) => { if (!current()) return; setLangState(l); sb.rpc('update_my_profile', { p_lang: l }).abortSignal(scope!.signal).then(({ error }) => { if (!current()) return; if (error) toast(tr('Sprache nicht gespeichert', undefined, l), 'error'); else toast(tr('Sprache geändert', undefined, l)) }) },
    branches, staff, skillCatalog, news, read, opened, newsReads,
    openNews: (id) => { if (current() && !opened.has(id)) sb.rpc('open_news', { p_news: id }).abortSignal(scope!.signal).then(({ error }) => { if (current() && !error) setNewsReads(r => [...r, { news_id: id, employee_id: employee.id, confirmed_at: null }]) }) },
    confirm: async (id) => {
      if (!current()) return
      const { error } = await sb.rpc('confirm_news', { p_news: id }).abortSignal(scope!.signal)
      if (current() && !error) setNewsReads(r => r.map(x => x.news_id === id && x.employee_id === employee.id ? { ...x, confirmed_at: new Date().toISOString() } : x))
    },
    templates, tasks, done, completionsToday: completions, coverTasks,
    toggle: async (id, photo, branchId) => {
      if (!current()) return
      const br = branchId ?? myBranch
      const isDone = br === myBranch ? done.has(id) : completions.some(c => c.item_id === id && c.branch_id === br && c.day === today)
      if (isDone) {
        await sb.from('task_completions').delete().match({ item_id: id, branch_id: br, day: today }).abortSignal(scope!.signal)
      } else {
        const path = photo ? await upload('task-proofs', photo, `${today}-${id}-${Date.now()}`) : null
        if (!current() || (photo && !path)) return
        await sb.from('task_completions').insert({ item_id: id, branch_id: br, day: today, done_by: employee.id, done_by_name: name, photo_path: path }).abortSignal(scope!.signal)
      }
      await reload()
    },
    tickets,
    addTicket: async ({ kind, title, body = '', photo, viaAI = false, branchId, allStudios = false }) => {
      if (!current()) return false
      const path = photo ? await upload('ticket-photos', photo, `${Date.now()}`) : null
      if (!current() || (photo && !path)) return false
      const { error } = await sb.from('tickets').insert({ kind, title, body, branch_id: branchId ?? myBranch, all_studios: kind === 'Anliegen' ? false : allStudios, created_by: employee.id, created_by_name: name, via_ai: viaAI, photo_path: path, media_kind: photo?.type.startsWith('video') ? 'video' : 'photo' }).abortSignal(scope!.signal)
      if (!current()) return false
      if (!error) { await reload(); if (!current()) return false; toast(tr(kind === 'Idee' ? 'Idee gesendet' : kind === 'Learning' ? 'Mit dem Team geteilt' : kind === 'Anliegen' ? 'Anliegen vertraulich gesendet' : 'Meldung gesendet')) } else toast(tr('Senden hat nicht geklappt'), 'error')
      return !error
    },
    addComment: async (ticketId, body) => {
      const text = body.trim()
      if (!current() || !text) return false
      const retryKey = JSON.stringify([ticketId, text])
      let id = pendingComments.current.get(retryKey)
      if (!id) { id = crypto.randomUUID(); pendingComments.current.set(retryKey, id) }
      const fields = 'id, ticket_id, author_id, author_name, body, created_at'
      let row: { id: string; ticket_id: string; author_id: string; author_name: string; body: string; created_at: string } | null = null
      try {
        const { data, error } = await sb.from('ticket_comments').insert({ id, ticket_id: ticketId, author_id: employee.id, author_name: `${employee.first_name} ${employee.last_name}`, body: text }).select(fields).abortSignal(scope!.signal).single()
        if (!current()) return false
        if (!error) row = data
      } catch { /* An insert may have committed even if its acknowledgement was lost. */ }
      if (!current()) return false
      if (!row) {
        try {
          const { data, error } = await sb.from('ticket_comments').select(fields).eq('id', id).abortSignal(scope!.signal).maybeSingle()
          if (!current()) return false
          if (!error) row = data
        } catch { /* Keep the UUID and draft for an idempotent retry. */ }
      }
      if (!current() || !row || row.id !== id || row.ticket_id !== ticketId || row.author_id !== employee.id || row.body !== text) return false
      const saved = row
      pendingComments.current.delete(retryKey)
      ticketVersion.current++
      setTickets(rows => rows.map(tk => tk.id !== ticketId || tk.comments.some(c => c.id === saved.id) ? tk : { ...tk, comments: [...tk.comments, { id: saved.id, authorId: saved.author_id, author: saved.author_name, body: saved.body, when: relWhen(saved.created_at) }] }))
      void refreshTickets().catch(() => {})
      return true
    },
    toggleVote: async (ticketId) => {
      if (!current()) return
      const tk = tickets.find(x => x.id === ticketId)
      if (tk?.voted) await sb.from('ticket_votes').delete().match({ ticket_id: ticketId, employee_id: employee.id }).abortSignal(scope!.signal)
      else await sb.from('ticket_votes').insert({ ticket_id: ticketId, employee_id: employee.id }).abortSignal(scope!.signal)
      await reload()
    },
    assign: async (id, a) => {
      if (!current()) return
      const cur = tickets.find(x => x.id === id)?.status
      const status = a && cur === 'Neu' ? 'Zugewiesen' : !a && cur === 'Zugewiesen' ? 'Neu' : cur
      await sb.from('tickets').update({ assignee: a || null, status }).eq('id', id).abortSignal(scope!.signal); await reload()
    },
    setStatus: async (id, s) => { if (!current()) return; await sb.from('tickets').update({ status: s }).eq('id', id).abortSignal(scope!.signal); await reload() },
    events, joined, declined, waiting, registrations, standby, demoData, privateChats, quizzes, attempts, polls, pollAnswers,
    submitPoll: async (pollId, answers) => {
      if (!current()) return false
      const rows = Object.entries(answers).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)).map(([question_id, value]) => ({ question_id, poll_id: pollId, employee_id: employee.id, value }))
      if (!rows.length) return false
      const { error } = await sb.from('poll_answers').upsert(rows, { onConflict: 'question_id,employee_id' }).abortSignal(scope!.signal)
      if (!error) await reload()
      return !error
    },
    submitQuiz: async (quizId, answers) => {
      if (!current()) return { error: 'session_changed' } as QuizResult
      // Auswertung in der Function `quiz` (Freitext bewertet die KI); Lösungen bleiben auf dem Server
      const { data, error } = await sb.functions.invoke('quiz', { body: { quiz_id: quizId, answers }, signal: scope!.signal })
      if (!current()) return { error: 'session_changed' } as QuizResult
      if (error) { let e = 'failed'; try { e = (await (error as { context?: Response }).context?.json())?.error ?? e } catch { /* egal */ } return { error: e } as QuizResult }
      await reload()
      return current() ? data as QuizResult : { error: 'session_changed' } as QuizResult
    },
    toggleEvent: async (id) => {
      if (!current()) return 'Die Sitzung hat sich geändert.'
      const { data, error } = joined.has(id)
        ? await sb.from('event_registrations').delete().match({ event_id: id, employee_id: employee.id }).abortSignal(scope!.signal).then(r => ({ data: null, error: r.error }))
        : await sb.rpc('register_event', { p_event: id }).abortSignal(scope!.signal)
      await reload()
      if (!current()) return 'Die Sitzung hat sich geändert.'
      if (!error) { toast(joined.has(id) ? (waiting.has(id) ? tr('Von der Warteliste genommen') : tr('Abgemeldet')) : data === 'waitlist' ? tr('Auf der Warteliste') : tr('Angemeldet')); return null }
      return /full/.test(error.message) ? 'Leider ausgebucht.' : /deadline/.test(error.message) ? 'Die Anmeldefrist ist vorbei.' : 'Das hat nicht geklappt.'
    },
    declineEvent: async (id) => { if (!current()) return; const { error } = await sb.rpc('decline_event', { p_event: id }).abortSignal(scope!.signal); await reload(); if (!current()) return; toast(error ? tr('Das hat nicht geklappt') : tr('Abgesagt'), error ? 'error' : 'ok') },
    toggleStandby: async (day) => {
      if (!current()) return
      const had = standby.some(x => x.employee_id === employee.id && x.day === day)
      const { error } = had ? await sb.from('standby_days').delete().match({ employee_id: employee.id, day }).abortSignal(scope!.signal) : await sb.from('standby_days').insert({ employee_id: employee.id, day }).abortSignal(scope!.signal)
      await reload()
      if (!current()) return
      toast(error ? tr('Das hat nicht geklappt') : had ? tr('Aushilfe-Tag entfernt') : tr('Aushilfe-Tag eingetragen'), error ? 'error' : 'ok')
    },
    setDemoData: async (on) => { if (!current()) return; await sb.from('app_settings').upsert({ key: 'demo_data', value: on, updated_at: new Date().toISOString() }).abortSignal(scope!.signal); await reload(); await reloadWiki() },
    wiki, reloadWiki, catEmojis, wikiStructure, catAreas, absences, covering, reloadAbsences, steps, allSteps, obDone,
    toggleStep: async (id) => {
      if (!current()) return
      if (obDone.has(id)) await sb.from('onboarding_progress').delete().match({ step_id: id, employee_id: employee.id }).abortSignal(scope!.signal)
      else await sb.from('onboarding_progress').insert({ step_id: id, employee_id: employee.id }).abortSignal(scope!.signal)
      await reload()
    },
    skills: meStaff.skills,
    photo: meStaff.photo,
    setPhotoFile: async (f) => { const p = await upload('profile-photos', f, `avatar-${Date.now()}`); if (!current()) return; if (p) { await sb.rpc('update_my_profile', { p_photo_path: p }).abortSignal(scope!.signal); await reload(); if (!current()) return; toast(tr('Profilbild gespeichert')) } else toast(tr('Das Bild liess sich nicht hochladen'), 'error') },
    myPhorest, signedUrl,
  }
  return <C.Provider value={value}>{children}</C.Provider>
}
