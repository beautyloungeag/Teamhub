import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth, type Employee } from './lib/auth'
import { supabase } from './lib/supabase'

import { tr, setCurrentLang, savedLang, locale, type Lang } from './lib/i18n'
export type { Lang }

/* ---------- Typen ---------- */
export type Staff = { id: string; first: string; last: string; branch: string; branch_id: string; role: string; skills: string[]; photo: string | null; app_role: string; active: boolean; email: string; phone?: string | null; appInstalled?: boolean; pushEnabled?: boolean }
export type News = { id: string; title: string; teaser: string; body: string; author: string; date: string; tag: string; mustRead: boolean; audience: string; audienceBranches: string[]; audienceGroups: string[]; audienceSkills: string[]; audiencePeople: string[]; publishAt: string; wikiCategory: string | null }
export type TaskItem = { id: string; title: string; time: string; group: string; prio: boolean; proof: boolean; articleId: string | null }
export type Template = { id: string; name: string; repeat: 'daily' | 'weekly' | 'monthly'; weekday: number | null; monthday: number | null; branchIds: string[]; items: TaskItem[]; active: boolean; proposed: boolean; sample: boolean }
export type Done = { by: string; at: string; photo: string | null }
export type Ticket = { id: string; kind: 'Meldung' | 'Idee'; title: string; body: string; branch: string; branchId: string; status: 'Neu' | 'Zugewiesen' | 'In Arbeit' | 'Erledigt'; who: string; when: string; assignee: string | null; photo: string | null; mediaKind: 'photo' | 'video'; viaAI: boolean; mine: boolean; votes: number; voted: boolean; comments: Comment[] }
export type Comment = { id: string; author: string; authorId: string | null; body: string; when: string }
export type Ev = { id: string; title: string; kind: string; description: string; startsAt: string; endsAt: string | null; place: string; link: string | null; capacity: number | null; registerUntil: string | null; audienceBranches: string[]; audienceSkills: string[]; taken: number }
export type WikiBlock = { t: 'h' | 'p' | 'ul' | 'ol' | 'quote' | 'img' | 'video' | 'file'; text?: string; items?: string[]; src?: string; url?: string; name?: string; level?: number }
export type WikiArticle = { id: string; cat: string; title: string; minutes: number; updated: string; body: string[]; mediaKind: string; mediaUrl: string | null; published: boolean; fromNews?: boolean; intro: string; tags: string[]; accessLevel: 'alle' | 'filialleitung' | 'buero'; imported: boolean }
export type Step = { id: string; title: string; minutes: number; articleId: string | null; proposed: boolean }
export type Branch = { id: string; name: string; is_office: boolean }
export type Quiz = { id: string; newsId: string | null; articleId: string | null; title: string; passPct: number; sample: boolean }
export type Attempt = { quizId: string; employeeId: string; scorePct: number; passed: boolean; at: string }
export type QuizQuestion = { id: string; sort: number; kind: 'single' | 'multi' | 'text'; prompt: string; options: string[] }
export type QuizResult = { score_pct: number; passed: boolean; pass_pct: number; correct: number; total: number; results: Record<string, boolean> }

// Gruppen aus der Funktion – gleiche Regel wie public.job_groups() in der Datenbank
export const GROUPS = ['Filialleitung', 'Kosmetikerinnen', 'Lernende', 'Büro'] as const
export const jobGroups = (title: string) => [
  /(respo|stv\.?\s*r|filialleit)/i.test(title) && 'Filialleitung', /kosmetik/i.test(title) && 'Kosmetikerinnen',
  /(lehrling|lernend|praktik|berufsbild)/i.test(title) && 'Lernende', /(büro|buero|\bhr\b|fibu|office)/i.test(title) && 'Büro',
].filter(Boolean) as string[]
// Wer gehört zur Zielgruppe einer News? Personen gewählt = genau diese; sonst Studio UND Gruppe UND Skill (leer = alle)
export const inNewsAudience = (s: Staff, n: Pick<News, 'audienceBranches' | 'audienceGroups' | 'audienceSkills' | 'audiencePeople'>) =>
  n.audiencePeople.length ? n.audiencePeople.includes(s.id)
    : (n.audienceBranches.length === 0 || n.audienceBranches.includes(s.branch_id)) && (n.audienceGroups.length === 0 || jobGroups(s.role).some(g => n.audienceGroups.includes(g)))
      && (n.audienceSkills.length === 0 || s.skills.some(k => n.audienceSkills.includes(k)))

/* ---------- Datum (Europe/Zurich) ---------- */
export const TZ = 'Europe/Zurich'
export const isoDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
export const fmtDate = (s: string, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: '2-digit' }) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, ...o }).format(new Date(s))
// Stunde als Zahl in Zürcher Zeit (formatToParts, weil de-CH „16 Uhr“ formatiert)
export const zurichHour = (d = new Date()) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d); const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0); return g('hour') % 24 + g('minute') / 60 }
export const fmtTime = (s: string) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(s))
const relWhen = (s: string) => {
  const d = isoDay(new Date(s)), today = isoDay(), y = isoDay(new Date(Date.now() - 864e5))
  return d === today ? `${tr('Heute')}, ${fmtTime(s)}` : d === y ? tr('Gestern') : fmtDate(s, { day: '2-digit', month: '2-digit' })
}
const isoDow = (day: string) => ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1
// Gilt die Vorlage heute für diese Filiale?
export const appliesOn = (t: Template, day: string, branch: string) =>
  (t.branchIds.length === 0 || t.branchIds.includes(branch)) &&
  (t.repeat === 'daily' || (t.repeat === 'weekly' && t.weekday === isoDow(day)) || (t.repeat === 'monthly' && t.monthday === Number(day.slice(8, 10))))

type Ctx = {
  me: Staff; employee: Employee
  lang: Lang; setLang: (l: Lang) => void; t: (s: string, vars?: Record<string, string | number>) => string
  loading: boolean; reload: () => Promise<void>
  branches: Branch[]; staff: Staff[]; skillCatalog: string[]
  news: News[]; read: Set<string>; opened: Set<string>; openNews: (id: string) => void; confirm: (id: string) => Promise<void>
  newsReads: { news_id: string; employee_id: string; confirmed_at: string | null }[]
  templates: Template[]; tasks: TaskItem[]; done: Map<string, Done>; toggle: (id: string, photo?: File) => Promise<void>
  completionsToday: { item_id: string; branch_id: string }[]
  tickets: Ticket[]; addTicket: (t: { kind: 'Meldung' | 'Idee'; title: string; body?: string; photo?: File; viaAI?: boolean }) => Promise<boolean>
  addComment: (ticketId: string, body: string) => Promise<boolean>; toggleVote: (ticketId: string) => Promise<void>
  assign: (id: string, a: string) => Promise<void>; setStatus: (id: string, s: Ticket['status']) => Promise<void>
  events: Ev[]; joined: Set<string>; declined: Set<string>; toggleEvent: (id: string) => Promise<string | null>; declineEvent: (id: string) => Promise<void>
  registrations: { event_id: string; employee_id: string; coming: boolean }[]
  standby: { employee_id: string; day: string; note: string }[]; toggleStandby: (day: string) => Promise<void>
  demoData: boolean; setDemoData: (on: boolean) => Promise<void>
  quizzes: Quiz[]; attempts: Attempt[]; submitQuiz: (quizId: string, answers: Record<string, number[]>) => Promise<QuizResult | null>
  wiki: WikiArticle[]; reloadWiki: () => Promise<void>; steps: Step[]; allSteps: Step[]; obDone: Set<string>; toggleStep: (id: string) => Promise<void>
  skills: string[]; setSkills: (s: string[]) => void
  photo: string | null; setPhotoFile: (f: File) => Promise<void>
  myPhorest: { branch_id: string; staff_id: string }[]
  signedUrl: (bucket: string, path: string) => Promise<string | null>
}
const C = createContext<Ctx | null>(null)
export const useApp = () => useContext(C)!

const toStaff = (e: any, branches: Branch[], photos: Map<string, string>): Staff => ({
  id: e.id, first: e.first_name, last: e.last_name, branch: branches.find(b => b.id === e.branch_id)?.name ?? e.branch_id, branch_id: e.branch_id,
  role: e.job_title, skills: e.skills ?? [], photo: e.photo_path ? photos.get(e.photo_path) ?? null : null, app_role: e.app_role, active: e.active, email: e.email, phone: e.phone ?? null, appInstalled: !!e.app_installed_at, pushEnabled: !!e.push_enabled,
})

export function AppProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth()
  const [lang, setLangState] = useState<Lang>(savedLang)
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
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [demoData, setDemoState] = useState(true)
  const [allSteps, setAllSteps] = useState<Step[]>([])
  const steps = useMemo(() => allSteps.filter(x => !x.proposed), [allSteps])
  const [obDone, setObDone] = useState<Set<string>>(new Set())
  const [myPhorest, setMyPhorest] = useState<Ctx['myPhorest']>([])
  const newsForWiki = useRef<any[]>([])
  const [wikiRows, setWikiRows] = useState<any[]>([])
  // Wissen: nur Liste laden (ohne Inhalte), einmal beim Start und nach Änderungen im Backoffice
  const reloadWiki = useCallback(async () => {
    if (!supabase || !employee) return
    const { data } = await supabase.from('wiki_articles').select('id, category, title, minutes, updated_at, media_kind, media_url, published, access_level, tags, intro, source_id, is_sample').order('category').order('sort').order('title')
    setWikiRows(data ?? [])
  }, [employee])

  const signedUrl = useCallback(async (bucket: string, path: string) => {
    if (!supabase) return null
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  }, [])

  const reload = useCallback(async () => {
    if (!supabase || !employee) return
    const sb = supabase
    const today = isoDay()
    const [br, em, sk, nw, rd, tt, ti, tc, tk, ev, cnt, rg, wk, ob, obp, mp, fl, tcm, tvt, sbd, qz, qa] = await Promise.all([
      sb.from('branches').select('id, name, is_office').order('sort'),
      sb.from('employees').select('id, email, phone, first_name, last_name, job_title, app_role, branch_id, skills, photo_path, active, app_installed_at, push_enabled').order('first_name'),
      sb.from('skills').select('name').order('sort'),
      sb.from('news').select('*').order('publish_at', { ascending: false }),
      sb.from('news_reads').select('news_id, employee_id, confirmed_at'),
      sb.from('task_templates').select('*').or('active.eq.true,proposed.eq.true').order('sort'),
      sb.from('task_items').select('*').order('sort'),
      sb.from('task_completions').select('item_id, branch_id, done_by_name, done_at, photo_path, day').eq('day', today),
      sb.from('tickets').select('*').order('created_at', { ascending: false }),
      sb.from('events').select('*').order('starts_at'),
      sb.rpc('event_counts'),
      sb.from('event_registrations').select('event_id, employee_id, coming'),
      Promise.resolve({ data: null }),
      sb.from('onboarding_steps').select('*').order('sort'),
      sb.from('onboarding_progress').select('step_id').eq('employee_id', employee.id),
      sb.from('employee_phorest').select('branch_id, staff_id').eq('employee_id', employee.id),
      sb.rpc('app_flags'),
      sb.from('ticket_comments').select('id, ticket_id, author_id, author_name, body, created_at').order('created_at'),
      sb.from('ticket_votes').select('ticket_id, employee_id'),
      sb.from('standby_days').select('employee_id, day, note').gte('day', today).order('day'),
      sb.from('quizzes').select('id, news_id, article_id, title, pass_pct, is_sample'),
      sb.from('quiz_attempts').select('quiz_id, employee_id, score_pct, passed, created_at').order('created_at'),
    ])
    const demo = (fl.data as any)?.demo_data !== false
    setDemoState(demo)
    const keep = (rows: any[] | null) => (rows ?? []).filter((r: any) => demo || !r.is_sample)
    const brs = (br.data ?? []) as Branch[]
    const bname = (id: string) => brs.find(b => b.id === id)?.name ?? id
    setBranches(brs)
    // Profilfotos liegen privat; signierte Links in einem Rutsch
    const paths = (em.data ?? []).map((e: any) => e.photo_path).filter(Boolean)
    const photos = new Map<string, string>()
    if (paths.length) {
      const { data } = await sb.storage.from('profile-photos').createSignedUrls(paths, 3600)
      for (const x of data ?? []) if (x.signedUrl && x.path) photos.set(x.path, x.signedUrl)
    }
    setStaff((em.data ?? []).map((e: any) => toStaff(e, brs, photos)))
    setSkillCatalog((sk.data ?? []).map((s: any) => s.name))
    setNews(keep(nw.data).map((n: any) => ({
      id: n.id, title: n.title, teaser: n.teaser, body: n.body, author: n.author_name || 'Büro', tag: n.tag, mustRead: n.must_read,
      date: fmtDate(n.publish_at), audience: n.audience_people?.length ? `${n.audience_people.length} ${n.audience_people.length === 1 ? 'Person' : 'Personen'}` : [n.audience_branches?.length ? n.audience_branches.map(bname).join(', ') : 'Alle Studios', ...(n.audience_groups ?? []), ...(n.audience_skills ?? [])].join(' · '),
      audienceBranches: n.audience_branches ?? [], audienceGroups: n.audience_groups ?? [], audienceSkills: n.audience_skills ?? [], audiencePeople: n.audience_people ?? [],
      publishAt: n.publish_at, wikiCategory: n.wiki_category,
    })))
    setNewsReads((rd.data ?? []) as Ctx['newsReads'])
    const items = (ti.data ?? []) as any[]
    setTemplates(keep(tt.data).map((x: any) => ({
      id: x.id, name: x.name, repeat: x.repeat, weekday: x.weekday, monthday: x.monthday, branchIds: x.branch_ids ?? [],
      items: items.filter(i => i.template_id === x.id).map(i => ({ id: i.id, title: i.title, time: i.due_time ? String(i.due_time).slice(0, 5) : '', group: x.name, prio: i.prio, proof: i.proof_photo, articleId: i.article_id ?? null })),
      active: x.active, proposed: x.proposed, sample: x.is_sample,
    })))
    setCompletions(tc.data ?? [])
    const counts = new Map(((cnt.data ?? []) as any[]).map(c => [c.event_id, c.taken]))
    setEvents(keep(ev.data).map((e: any) => ({
      id: e.id, title: e.title, kind: e.kind, description: e.description, startsAt: e.starts_at, endsAt: e.ends_at, place: e.place, link: e.link,
      capacity: e.capacity, registerUntil: e.register_until, audienceBranches: e.audience_branches ?? [], audienceSkills: e.audience_skills ?? [], taken: counts.get(e.id) ?? 0,
    })))
    setRegistrations((rg.data ?? []) as Ctx['registrations'])
    const tkPhotos = new Map<string, string>()
    const tks = keep(tk.data)
    const tp = tks.map((x: any) => x.photo_path).filter(Boolean)
    if (tp.length) { const { data } = await sb.storage.from('ticket-photos').createSignedUrls(tp, 3600); for (const x of data ?? []) if (x.signedUrl && x.path) tkPhotos.set(x.path, x.signedUrl) }
    const votes = (tvt.data ?? []) as { ticket_id: string; employee_id: string }[]
    const coms = (tcm.data ?? []) as any[]
    setTickets(tks.map((x: any) => ({
      id: x.id, kind: x.kind, title: x.title, body: x.body, branch: bname(x.branch_id), branchId: x.branch_id, status: x.status, who: x.created_by_name,
      when: relWhen(x.created_at), assignee: x.assignee, photo: x.photo_path ? tkPhotos.get(x.photo_path) ?? null : null, mediaKind: x.media_kind ?? 'photo', viaAI: x.via_ai,
      mine: x.created_by === employee.id, votes: votes.filter(v => v.ticket_id === x.id).length, voted: votes.some(v => v.ticket_id === x.id && v.employee_id === employee.id),
      comments: coms.filter(c => c.ticket_id === x.id).map(c => ({ id: c.id, author: c.author_name, authorId: c.author_id, body: c.body, when: relWhen(c.created_at) })),
    })))
    setStandby((sbd.data ?? []) as Ctx['standby'])
    setQuizzes(keep(qz.data).map((q: any) => ({ id: q.id, newsId: q.news_id, articleId: q.article_id, title: q.title, passPct: q.pass_pct, sample: q.is_sample })))
    setAttempts((qa.data ?? []).map((a: any) => ({ quizId: a.quiz_id, employeeId: a.employee_id, scorePct: a.score_pct, passed: a.passed, at: a.created_at })))
    newsForWiki.current = nw.data ?? []
    void wk
    setAllSteps(keep(ob.data).map((s: any) => ({ id: s.id, title: s.title, minutes: s.minutes, articleId: s.article_id, proposed: !!s.proposed })))
    setObDone(new Set((obp.data ?? []).map((x: any) => x.step_id)))
    setMyPhorest((mp.data ?? []) as Ctx['myPhorest'])
    setLoading(false)
  }, [employee])

  useEffect(() => {
    if (!employee) return
    // Profil gewinnt; nur wenn dort noch der Standard steht, übernimmt es die beim Anmelden gewählte Sprache
    const chosen = savedLang()
    if (employee.lang === 'DE' && chosen !== 'DE') { setLangState(chosen); supabase?.rpc('update_my_profile', { p_lang: chosen }) }
    else setLangState(employee.lang)
    reload(); reloadWiki()
    // Zurück in die App (Homescreen) → frische Daten, damit der „Reset“ um Mitternacht greift
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [employee, reload, reloadWiki])

  const meStaff = useMemo<Staff>(() => staff.find(s => s.id === employee?.id) ?? {
    id: employee?.id ?? '', first: employee?.first_name ?? '', last: employee?.last_name ?? '', branch: employee?.branch_name ?? '', branch_id: employee?.branch_id ?? '',
    role: employee?.job_title ?? '', skills: employee?.skills ?? [], photo: null, app_role: employee?.app_role ?? 'mitarbeiterin', active: true, email: employee?.email ?? '',
  }, [staff, employee])

  const wiki = useMemo<WikiArticle[]>(() => {
    const arts: WikiArticle[] = wikiRows.filter((a: any) => demoData || !a.is_sample).map((a: any) => ({
      id: a.id, cat: a.category, title: a.title, minutes: a.minutes, updated: fmtDate(a.updated_at, { day: '2-digit', month: '2-digit', year: 'numeric' }),
      body: [], mediaKind: a.media_kind, mediaUrl: a.media_url, published: a.published, intro: a.intro ?? '', tags: a.tags ?? [], accessLevel: a.access_level, imported: !!a.source_id,
    }))
    // News mit Wissens-Kategorie erscheinen auch im Wissen (BLTH-16 News-zu-Wiki)
    for (const n of newsForWiki.current) if (n.wiki_category && new Date(n.publish_at) <= new Date()) arts.push({
      id: 'news-' + n.id, cat: n.wiki_category, title: n.title, minutes: Math.max(1, Math.round(String(n.body).split(/\s+/).length / 180)),
      updated: fmtDate(n.publish_at, { day: '2-digit', month: '2-digit', year: 'numeric' }), body: String(n.body).split(/\n\n+/), mediaKind: 'none', mediaUrl: null, published: true, fromNews: true,
      intro: n.teaser ?? '', tags: [], accessLevel: 'alle', imported: false,
    })
    return arts
  }, [wikiRows, news, demoData]) // eslint-disable-line react-hooks/exhaustive-deps
  const today = isoDay()
  const myBranch = employee?.branch_id ?? ''
  // „Alle Studios“ meint die Studios, nicht das Büro: das Büro bekommt nur ausdrücklich zugewiesene Vorlagen
  const officeBranch = branches.find(b => b.id === myBranch)?.is_office ?? false
  const tasks = useMemo(() => templates.filter(x => x.active && appliesOn(x, today, myBranch) && (!officeBranch || x.branchIds.includes(myBranch))).flatMap(x => x.items).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')), [templates, today, myBranch, officeBranch])
  const done = useMemo(() => new Map(completions.filter(c => c.branch_id === myBranch).map(c => [c.item_id, { by: c.done_by_name, at: fmtTime(c.done_at), photo: c.photo_path }])), [completions, myBranch])
  const myReads = newsReads.filter(r => r.employee_id === employee?.id)
  const read = useMemo(() => new Set(myReads.filter(r => r.confirmed_at).map(r => r.news_id)), [myReads])
  const opened = useMemo(() => new Set(myReads.map(r => r.news_id)), [myReads])
  const joined = useMemo(() => new Set(registrations.filter(r => r.employee_id === employee?.id && r.coming).map(r => r.event_id)), [registrations, employee])
  const declined = useMemo(() => new Set(registrations.filter(r => r.employee_id === employee?.id && !r.coming).map(r => r.event_id)), [registrations, employee])

  if (!employee) return <C.Provider value={null}>{children}</C.Provider>
  const sb = supabase!
  const name = `${employee.first_name} ${employee.last_name.slice(0, 1)}.`
  const upload = async (bucket: string, file: File, stem: string) => {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${employee.id}/${stem}.${ext}`
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
    return error ? null : path
  }

  const value: Ctx = {
    me: meStaff, employee, lang, t, loading, reload,
    setLang: (l) => { setLangState(l); sb.rpc('update_my_profile', { p_lang: l }) },
    branches, staff, skillCatalog, news, read, opened, newsReads,
    openNews: (id) => { if (!opened.has(id)) sb.rpc('open_news', { p_news: id }).then(() => setNewsReads(r => [...r, { news_id: id, employee_id: employee.id, confirmed_at: null }])) },
    confirm: async (id) => {
      const { error } = await sb.rpc('confirm_news', { p_news: id })
      if (!error) setNewsReads(r => r.map(x => x.news_id === id && x.employee_id === employee.id ? { ...x, confirmed_at: new Date().toISOString() } : x))
    },
    templates, tasks, done, completionsToday: completions,
    toggle: async (id, photo) => {
      if (done.has(id)) {
        await sb.from('task_completions').delete().match({ item_id: id, branch_id: myBranch, day: today })
      } else {
        const path = photo ? await upload('task-proofs', photo, `${today}-${id}`) : null
        await sb.from('task_completions').insert({ item_id: id, branch_id: myBranch, day: today, done_by: employee.id, done_by_name: name, photo_path: path })
      }
      await reload()
    },
    tickets,
    addTicket: async ({ kind, title, body = '', photo, viaAI = false }) => {
      const path = photo ? await upload('ticket-photos', photo, `${Date.now()}`) : null
      const { error } = await sb.from('tickets').insert({ kind, title, body, branch_id: myBranch, created_by: employee.id, created_by_name: name, via_ai: viaAI, photo_path: path, media_kind: photo?.type.startsWith('video') ? 'video' : 'photo' })
      if (!error) await reload()
      return !error
    },
    addComment: async (ticketId, body) => {
      const { error } = await sb.from('ticket_comments').insert({ ticket_id: ticketId, author_id: employee.id, author_name: `${employee.first_name} ${employee.last_name}`, body: body.trim() })
      if (!error) await reload()
      return !error
    },
    toggleVote: async (ticketId) => {
      const tk = tickets.find(x => x.id === ticketId)
      if (tk?.voted) await sb.from('ticket_votes').delete().match({ ticket_id: ticketId, employee_id: employee.id })
      else await sb.from('ticket_votes').insert({ ticket_id: ticketId, employee_id: employee.id })
      await reload()
    },
    assign: async (id, a) => { await sb.from('tickets').update({ assignee: a || null, status: a ? 'Zugewiesen' : 'Neu' }).eq('id', id); await reload() },
    setStatus: async (id, s) => { await sb.from('tickets').update({ status: s }).eq('id', id); await reload() },
    events, joined, declined, registrations, standby, demoData, quizzes, attempts,
    submitQuiz: async (quizId, answers) => {
      const { data, error } = await sb.rpc('submit_quiz', { p_quiz: quizId, p_answers: answers })
      if (error) return null
      await reload()
      return data as QuizResult
    },
    toggleEvent: async (id) => {
      const { error } = joined.has(id)
        ? await sb.from('event_registrations').delete().match({ event_id: id, employee_id: employee.id })
        : await sb.rpc('register_event', { p_event: id })
      await reload()
      if (!error) return null
      return /full/.test(error.message) ? 'Leider ausgebucht.' : /deadline/.test(error.message) ? 'Die Anmeldefrist ist vorbei.' : 'Das hat nicht geklappt.'
    },
    declineEvent: async (id) => { await sb.rpc('decline_event', { p_event: id }); await reload() },
    toggleStandby: async (day) => {
      if (standby.some(x => x.employee_id === employee.id && x.day === day)) await sb.from('standby_days').delete().match({ employee_id: employee.id, day })
      else await sb.from('standby_days').insert({ employee_id: employee.id, day })
      await reload()
    },
    setDemoData: async (on) => { await sb.from('app_settings').upsert({ key: 'demo_data', value: on, updated_at: new Date().toISOString() }); await reload(); await reloadWiki() },
    wiki, reloadWiki, steps, allSteps, obDone,
    toggleStep: async (id) => {
      if (obDone.has(id)) await sb.from('onboarding_progress').delete().match({ step_id: id, employee_id: employee.id })
      else await sb.from('onboarding_progress').insert({ step_id: id, employee_id: employee.id })
      await reload()
    },
    skills: meStaff.skills,
    setSkills: (s) => { setStaff(list => list.map(x => x.id === employee.id ? { ...x, skills: s } : x)); sb.rpc('update_my_profile', { p_skills: s }) },
    photo: meStaff.photo,
    setPhotoFile: async (f) => { const p = await upload('profile-photos', f, 'avatar'); if (p) { await sb.rpc('update_my_profile', { p_photo_path: p }); await reload() } },
    myPhorest, signedUrl,
  }
  return <C.Provider value={value}>{children}</C.Provider>
}
