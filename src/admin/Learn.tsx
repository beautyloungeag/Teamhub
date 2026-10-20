import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Lock, Plus, Trash2, X } from 'lucide-react'
import { useApp, fmtDate, inNewsAudience, type Quiz, type Staff, type Step } from '../store'
import { supabase } from '../lib/supabase'
import { notifyNow } from '../lib/push'
import { Avatar } from '../People'
import { toast } from '../Toast'
import { H, New, Th, Field, inpStone, btn, btn2, Err, retranslate, real, inBranch, Select, Seg, Modal, Chips, Back, Section, Status, Empty, ReadOnly } from './kit'
import { Donut } from './charts'

// Lernen: Fortschritt je Person, Lektionen (Benni geht sie mit Neuen durch) und Quiz.
// Lektionen und Quiz des Büros gelten für alle Studios; die Filialleitung ergänzt eigene für ihr Studio.

type Page = null | { k: 'quiz'; id: string } | { k: 'edit'; q: QuizEdit }
export function LearnAdmin() {
  const [tab, setTab] = useState<'fortschritt' | 'lektionen' | 'quiz'>('fortschritt')
  const [page, setPage] = useState<Page>(null), [lesson, setLesson] = useState<Step | 'neu' | null>(null)
  if (page?.k === 'quiz') return <QuizPage id={page.id} onBack={() => setPage(null)} onEdit={q => setPage({ k: 'edit', q })} />
  if (page?.k === 'edit') return <QuizEditor q={page.q} onBack={() => setPage(null)} />
  return (<>
    <H action={tab === 'lektionen' ? <New onClick={() => setLesson('neu')}>Neue Lektion</New> : tab === 'quiz' ? <New onClick={() => setPage({ k: 'edit', q: blankQuiz() })}>Neues Quiz</New> : undefined}>Lernen</H>
    <div className="mb-6"><Seg value={tab} onChange={setTab} items={[['fortschritt', 'Fortschritt'], ['lektionen', 'Lektionen'], ['quiz', 'Quiz']]} /></div>
    {tab === 'fortschritt' && <Progress />}
    {tab === 'lektionen' && <Lessons onOpen={setLesson} />}
    {tab === 'quiz' && <Quizzes onOpen={id => setPage({ k: 'quiz', id })} />}
    {lesson && <LessonModal step={lesson === 'neu' ? null : lesson} onClose={() => setLesson(null)} />}
  </>)
}

/* ---------- gemeinsame Daten ---------- */
function useScope() {
  const { staff, me, branches } = useApp()
  const office = me.app_role === 'buero'
  const [br, setBr] = useState('')
  const studios = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const people = staff.filter(s => real(s) && s.branch_id !== 'buero' && (office || studios.some(b => inBranch(s, b.id))) && (!br || inBranch(s, br))).sort((a, b) => a.first.localeCompare(b.first))
  return { people, studios, br, setBr }
}
function useLearnStats() {
  const { news, newsReads, quizzes, attempts, steps } = useApp()
  const [ob, setOb] = useState<{ employee_id: string; step_id: string }[] | null>(null)
  useEffect(() => { supabase!.from('onboarding_progress').select('employee_id, step_id').then(({ data }) => setOb(data ?? [])) }, [])
  const must = news.filter(n => n.mustRead && new Date(n.publishAt) <= new Date())
  return (p: Staff) => {
    const done = new Set((ob ?? []).filter(x => x.employee_id === p.id).map(x => x.step_id))
    const mine = steps.filter(s => s.branchIds.length === 0 || s.branchIds.some(b => inBranch(p, b)))
    const myMust = must.filter(n => inNewsAudience(p, n))
    const qz = quizzes.filter(q => !q.newsId || news.some(n => n.id === q.newsId && inNewsAudience(p, n)))
    const best = (qid: string) => { const a = attempts.filter(x => x.quizId === qid && x.employeeId === p.id); return { n: a.length, max: a.length ? Math.max(...a.map(x => x.scorePct)) : null, passed: a.some(x => x.passed), at: a.find(x => x.passed)?.at ?? null } }
    return {
      loaded: !!ob, steps: mine.map(s => ({ s, done: done.has(s.id) })), obDone: mine.filter(s => done.has(s.id)).length, obTotal: mine.length,
      must: myMust.map(n => ({ n, ok: newsReads.some(r => r.news_id === n.id && r.employee_id === p.id && r.confirmed_at) })),
      quizzes: qz.map(q => ({ q, ...best(q.id) })),
    }
  }
}
const quizStatus = (x: { passed: boolean; at: string | null; n: number; max: number | null }) => x.passed ? <Status kind="done">Bestanden{x.at ? ` am ${fmtDate(x.at, { day: 'numeric', month: 'numeric' })}` : ''}</Status>
  : x.n ? <Status kind="late">Nicht bestanden · {x.max} %, {x.n} {x.n === 1 ? 'Versuch' : 'Versuche'}</Status> : <Status kind="none">Noch nicht gemacht</Status>

/* ---------- Fortschritt ---------- */
function Progress() {
  const { people, studios, br, setBr } = useScope()
  const stats = useLearnStats()
  const [sel, setSel] = useState<Staff | null>(null)
  const rows = people.map(p => ({ p, st: stats(p) }))
  const sum = (f: (x: typeof rows[number]['st']) => [number, number]) => rows.reduce((a, r) => { const [x, y] = f(r.st); return [a[0] + x, a[1] + y] }, [0, 0])
  const [obA, obB] = sum(st => [st.obDone, st.obTotal]), [mA, mB] = sum(st => [st.must.filter(x => x.ok).length, st.must.length]), [qA, qB] = sum(st => [st.quizzes.filter(x => x.passed).length, st.quizzes.length])
  const bar = (a: number, b: number, tone = 'bg-olive-700') => <span className="flex items-center gap-3"><span className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${b ? a / b * 100 : 0}%` }} /></span><span className="text-[12.5px] text-mute tabular-nums w-10 text-right">{a}/{b}</span></span>
  return (<>
    <div className="flex flex-wrap items-center justify-between gap-6 mb-10">
      <div className="flex items-center gap-10">
        {([['Lektionen erledigt', obA, obB], ['Pflicht-News bestätigt', mA, mB], ['Quiz bestanden', qA, qB]] as const).map(([l, a, b]) =>
          <span key={l} className="flex items-center gap-3"><Donut value={a} total={b} size={60} stroke={7} /><span><span className="block text-[13px] text-mute">{l}</span><span className="block font-display text-[20px] tabular-nums leading-tight">{a} von {b}</span></span></span>)}
      </div>
      {studios.length > 1 && <Seg value={br} onChange={setBr} items={[['', 'Alle Studios'], ...studios.map(b => [b.id, b.name] as [string, string])]} />}
    </div>
    <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Person</Th><th className="w-[220px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Lektionen</th><th className="w-[220px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Pflicht-News</th><th className="w-[160px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Quiz</th><th className="w-10 border-b border-line" /></tr></thead>
      <tbody className="divide-y divide-line">{rows.map(({ p, st }) => { const mOk = st.must.filter(x => x.ok).length, qOk = st.quizzes.filter(x => x.passed).length
        return <tr key={p.id} onClick={() => setSel(p)} className="cursor-pointer hover:bg-sage-50/70">
          <td className="px-4 py-2.5"><span className="flex items-center gap-3 min-w-0"><Avatar s={p} photo={p.photo} size="w-8 h-8 text-[12px]" /><span className="min-w-0"><span className="block truncate">{p.first} {p.last}</span><span className="block text-[12.5px] text-mute truncate">{p.role} · {p.branch}</span></span></span></td>
          <td className="px-4">{st.loaded ? bar(st.obDone, st.obTotal) : null}</td>
          <td className="px-4">{bar(mOk, st.must.length, mOk < st.must.length ? 'bg-brass' : 'bg-olive-700')}</td>
          <td className="px-4 text-[13px] tabular-nums">{st.quizzes.length ? `${qOk} von ${st.quizzes.length}` : <span className="text-mute">–</span>}</td>
          <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
        </tr> })}</tbody></table>
    {sel && <PersonLearn p={sel} st={stats(sel)} onClose={() => setSel(null)} />}
  </>)
}
function PersonLearn({ p, st, onClose }: { p: Staff; st: ReturnType<ReturnType<typeof useLearnStats>>; onClose: () => void }) {
  const row = (ok: boolean, title: string, right: React.ReactNode, key: string) => <li key={key} className="py-2.5 flex items-center justify-between gap-4 text-[14px]"><span className={ok ? 'text-mute' : ''}>{title}</span>{right}</li>
  return (
    <Modal width={640} title={<span className="flex items-center gap-3"><Avatar s={p} photo={p.photo} size="w-9 h-9 text-[13px]" />{p.first} {p.last}</span>} onClose={onClose}>
      <Section title="Lektionen" count={`${st.obDone} von ${st.obTotal}`}><ul className="divide-y divide-line mb-6">{st.steps.map(({ s, done }) => row(done, s.title, done ? <Status kind="done">Erledigt</Status> : <Status kind="none">Offen</Status>, s.id))}</ul></Section>
      <Section title="Pflicht-News" count={`${st.must.filter(x => x.ok).length} von ${st.must.length}`}>{st.must.length === 0 ? <Empty>Keine Pflicht-News für diese Person.</Empty> : <ul className="divide-y divide-line mb-6">{st.must.map(({ n, ok }) => row(ok, n.title, ok ? <Status kind="done">Bestätigt</Status> : <Status kind="none">Offen</Status>, n.id))}</ul>}</Section>
      <Section title="Quiz" count={`${st.quizzes.filter(x => x.passed).length} von ${st.quizzes.length}`}>{st.quizzes.length === 0 ? <Empty>Kein Quiz.</Empty> : <ul className="divide-y divide-line">{st.quizzes.map(x => row(x.passed, x.q.title, quizStatus(x), x.q.id))}</ul>}</Section>
    </Modal>
  )
}

/* ---------- Lektionen ---------- */
function Lessons({ onOpen }: { onOpen: (s: Step) => void }) {
  const { steps, wiki, me, branches } = useApp()
  const { people } = useScope()
  const stats = useLearnStats()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])]
  const canEdit = (s: Step) => office || (s.branchIds.length > 0 && s.branchIds.every(b => mine.includes(b)))
  const doneBy = (s: Step) => { const ps = people.filter(p => s.branchIds.length === 0 || s.branchIds.some(b => inBranch(p, b))); return [ps.filter(p => stats(p).steps.some(x => x.s.id === s.id && x.done)).length, ps.length] }
  return (<>
    <LearnSettings />
    {steps.length === 0 ? <Empty>Noch keine Lektionen.</Empty> :
    <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Lektion</Th><th className="w-[260px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Lernstoff</th><th className="w-[150px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Für</th><th className="w-[200px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Erledigt</th><th className="w-10 border-b border-line" /></tr></thead>
      <tbody className="divide-y divide-line">{steps.map((s, i) => { const [a, b] = doneBy(s), ed = canEdit(s)
        return <tr key={s.id} onClick={() => ed && onOpen(s)} className={ed ? 'cursor-pointer hover:bg-sage-50/70' : ''}>
          <td className="px-4 py-3"><span className="flex items-baseline gap-2 min-w-0"><span className="text-mute tabular-nums text-[13px] w-5 shrink-0">{i + 1}.</span><span className="truncate">{s.title}</span></span><span className="block text-[12.5px] text-mute pl-7">{s.minutes} Min.</span></td>
          <td className="px-4 text-ink/80 truncate">{wiki.find(a => a.id === s.articleId)?.title ?? <span className="text-mute">passender Artikel aus dem Wissen</span>}</td>
          <td className="px-4 text-mute truncate">{s.branchIds.length ? s.branchIds.map(id => branches.find(x => x.id === id)?.name).join(', ') : 'Alle Studios'}</td>
          <td className="px-4"><span className="flex items-center gap-3"><span className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full rounded-full bg-olive-700" style={{ width: `${b ? a / b * 100 : 0}%` }} /></span><span className="text-[12.5px] text-mute tabular-nums w-10 text-right">{a}/{b}</span></span></td>
          <td className="px-2 text-right text-mute">{ed ? <ChevronRight size={15} className="inline" /> : <Lock size={13} className="inline text-sage-400" aria-label="vom Büro" />}</td>
        </tr> })}</tbody></table>}
    {!office && <p className="mt-3"><ReadOnly>Lektionen mit Schloss kommen vom Büro und gelten für alle Studios. Eigene für dein Studio legst du oben rechts an.</ReadOnly></p>}
  </>)
}
function LessonModal({ step, onClose }: { step: Step | null; onClose: () => void }) {
  const { wiki, steps, reload, me, branches } = useApp()
  const office = me.app_role === 'buero'
  const own = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [title, setTitle] = useState(step?.title ?? ''), [minutes, setMinutes] = useState(String(step?.minutes ?? 10)), [article, setArticle] = useState(step?.articleId ?? '')
  const [studios, setStudios] = useState<string[]>(step?.branchIds ?? (office ? [] : [me.branch_id])), [err, setErr] = useState('')
  const save = async () => {
    if (!title.trim()) { setErr('Titel ist nötig.'); return }
    if (!office && !studios.length) { setErr('Bitte dein Studio wählen.'); return }
    const row = { title: title.trim(), minutes: Number(minutes) || 10, article_id: article || null, branch_ids: studios }
    const { error } = step ? await supabase!.from('onboarding_steps').update(row).eq('id', step.id) : await supabase!.from('onboarding_steps').insert({ ...row, sort: steps.length, proposed: false })
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    toast(step ? 'Lektion gespeichert' : 'Lektion angelegt'); await reload(); retranslate(); onClose()
  }
  const del = async () => { if (!step || !confirm(`Lektion „${step.title}“ löschen? Der Fortschritt dazu geht verloren.`)) return; const { error } = await supabase!.from('onboarding_steps').delete().eq('id', step.id); toast(error ? 'Das hat nicht geklappt' : 'Gelöscht', error ? 'error' : 'ok'); await reload(); onClose() }
  return (
    <Modal width={620} title={step ? 'Lektion bearbeiten' : 'Neue Lektion'} onClose={onClose} footer={<>
      {step && <button onClick={del} className="mr-auto h-10 px-3 rounded-[10px] text-[13.5px] text-mute hover:text-alert flex items-center gap-1.5"><Trash2 size={14} />Löschen</button>}
      <button onClick={onClose} className={btn2}>Abbrechen</button><button onClick={save} className={btn}>{step ? 'Speichern' : 'Anlegen'}</button></>}>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Titel"><input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Kasse und Gutscheine" className={inpStone} /></Field>
        <Field label="Dauer (Min.)"><input type="number" min={1} value={minutes} onChange={e => setMinutes(e.target.value)} className={inpStone} /></Field>
        <div className="col-span-2"><Select label="Lernstoff (Wissensartikel)" tone="stone" value={article} onChange={setArticle} placeholder="Benni sucht selbst den passenden Artikel" options={[{ value: '', label: 'Benni sucht selbst den passenden Artikel' }, ...wiki.filter(a => a.published && !a.fromNews).map(a => ({ value: a.id, label: a.title, hint: a.cat }))]} /></div>
        <div className="col-span-2"><span className="block text-xs text-mute mb-1.5">Für {office ? '(kein Studio = alle)' : ''}</span><Chips tone="stone" items={own.map(b => ({ value: b.id, label: b.name }))} value={studios} onChange={setStudios} /></div>
      </div>
      <div className="mt-3"><Err m={err} /></div>
    </Modal>
  )
}

/** Wie streng Benni prüft: Kontrollfragen je Lektion und Mindestzahl richtiger. Ändern kann das Büro. */
function LearnSettings() {
  const { me } = useApp()
  const isBuero = me.app_role === 'buero'
  const [n, setN] = useState<number | null>(null), [m, setM] = useState(2)
  useEffect(() => { supabase!.rpc('app_flags').then(({ data }) => { const d = data as { learn_questions?: number; learn_min_correct?: number } | null; setN(Number(d?.learn_questions) || 3); setM(Number(d?.learn_min_correct) || 2) }) }, [])
  const save = async (nn: number, mm: number) => {
    const min = Math.min(mm, nn); setN(nn); setM(min)
    const at = new Date().toISOString()
    const r = await supabase!.from('app_settings').upsert([{ key: 'learn_questions', value: nn, updated_at: at }, { key: 'learn_min_correct', value: min, updated_at: at }])
    toast(r.error ? 'Speichern hat nicht geklappt' : 'Gespeichert', r.error ? 'error' : 'ok')
  }
  if (n === null) return null
  const pick = (vals: number[], cur: number, on: (k: number) => void) => <span className="inline-flex gap-0.5 p-0.5 rounded-[9px] bg-sage-50 align-middle mx-1">{vals.map(k =>
    <button key={k} onClick={() => on(k)} className={`w-8 h-7 rounded-[7px] text-[13px] tabular-nums transition-colors ${cur === k ? 'bg-olive-700 text-white' : 'text-ink/70 hover:bg-white'}`}>{k}</button>)}</span>
  return (
    <div className="mb-8 pb-6 border-b border-line flex flex-wrap items-center justify-between gap-4 text-[14px]">
      {isBuero ? <p className="leading-[2.2]">Benni stellt nach jeder Lektion{pick([1, 2, 3, 4, 5], n, k => save(k, m))}Kontrollfragen, bestanden ab{pick(Array.from({ length: n }, (_, i) => i + 1), m, k => save(n, k))}richtigen.</p>
        : <p>Benni stellt nach jeder Lektion <span className="font-medium">{n} Kontrollfragen</span>, bestanden ab <span className="font-medium">{m} richtigen</span>.</p>}
      {!isBuero && <ReadOnly>Stellt das Büro ein</ReadOnly>}
    </div>
  )
}

/* ---------- Quiz ---------- */
type QEdit = { kind: 'single' | 'multi' | 'text'; prompt: string; options: string[]; correct: number[]; rubric: string }
type QuizEdit = { id?: string; target: 'neu' | 'news' | 'article'; newsId: string; articleId: string; title: string; text: string; branches: string[] | null; passPct: number; qs: QEdit[] }
const emptyQ = (): QEdit => ({ kind: 'single', prompt: '', options: ['', ''], correct: [], rubric: '' })
const blankQuiz = (): QuizEdit => ({ target: 'neu', newsId: '', articleId: '', title: '', text: '', branches: null, passPct: 80, qs: [emptyQ()] })

function useQuizMeta() {
  const { news, wiki, me } = useApp()
  const office = me.app_role === 'buero'
  return {
    canEdit: (q: Quiz) => office || (!!q.newsId && news.find(n => n.id === q.newsId)?.authorId === me.id),
    target: (q: Quiz) => q.newsId ? { kind: 'News', title: news.find(n => n.id === q.newsId)?.title ?? '–' } : { kind: 'Wissen', title: wiki.find(a => a.id === q.articleId)?.title ?? '–' },
  }
}
function Quizzes({ onOpen }: { onOpen: (id: string) => void }) {
  const { quizzes } = useApp()
  const { people } = useScope()
  const stats = useLearnStats()
  const { target } = useQuizMeta()
  if (!quizzes.length) return <Empty>Noch kein Quiz.</Empty>
  return (
    <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Quiz</Th><th className="w-[300px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Gehört zu</th><th className="w-[220px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Bestanden</th><th className="w-10 border-b border-line" /></tr></thead>
      <tbody className="divide-y divide-line">{quizzes.map(x => { const ps = people.filter(p => stats(p).quizzes.some(y => y.q.id === x.id)), pc = ps.filter(p => stats(p).quizzes.find(y => y.q.id === x.id)?.passed).length
        return <tr key={x.id} onClick={() => onOpen(x.id)} className="cursor-pointer hover:bg-sage-50/70">
          <td className="px-4 py-3"><span className="block truncate">{x.title || target(x).title}{x.sample && <span className="ml-2 text-xs text-mute">Beispiel</span>}</span><span className="block text-[12.5px] text-mute">bestanden ab {x.passPct} %</span></td>
          <td className="px-4 text-mute truncate">{target(x).kind} · {target(x).title}</td>
          <td className="px-4"><span className="flex items-center gap-3"><span className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full rounded-full bg-olive-700" style={{ width: `${ps.length ? pc / ps.length * 100 : 0}%` }} /></span><span className="text-[12.5px] text-mute tabular-nums w-10 text-right">{pc}/{ps.length}</span></span></td>
          <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
        </tr> })}</tbody></table>
  )
}

function QuizPage({ id, onBack, onEdit }: { id: string; onBack: () => void; onEdit: (q: QuizEdit) => void }) {
  const { quizzes, reload } = useApp()
  const { people } = useScope()
  const stats = useLearnStats()
  const { canEdit, target } = useQuizMeta()
  const q = quizzes.find(x => x.id === id)
  const [who, setWho] = useState<'alle' | 'ok' | 'nein' | 'offen'>('alle')
  if (!q) return <><Back onClick={onBack}>Lernen</Back><Empty>Dieses Quiz gibt es nicht mehr.</Empty></>
  const rows = people.map(p => ({ p, x: stats(p).quizzes.find(y => y.q.id === q.id) })).filter((r): r is { p: Staff; x: NonNullable<typeof r.x> } => !!r.x)
  const ok = rows.filter(r => r.x.passed).length, fail = rows.filter(r => !r.x.passed && r.x.n).length, open = rows.filter(r => !r.x.n).length
  const list = rows.filter(r => who === 'alle' || (who === 'ok' ? r.x.passed : who === 'nein' ? !r.x.passed && r.x.n : !r.x.n))
  const edit = async () => {
    const { data } = await supabase!.from('quiz_questions').select('kind, prompt, options, correct, rubric').eq('quiz_id', q.id).order('sort')
    onEdit({ id: q.id, target: q.newsId ? 'news' : 'article', newsId: q.newsId ?? '', articleId: q.articleId ?? '', title: q.title, text: '', branches: null, passPct: q.passPct,
      qs: (data ?? []).map((x: { kind: QEdit['kind']; prompt: string; options: string[]; correct: number[] | null; rubric: string | null }) => ({ kind: x.kind, prompt: x.prompt, options: x.kind === 'text' ? ['', ''] : x.options, correct: x.correct ?? [], rubric: x.rubric ?? '' })) })
  }
  const del = async () => { if (!confirm('Dieses Quiz löschen? Die Ergebnisse gehen verloren.')) return; await supabase!.from('quizzes').delete().eq('id', q.id); await reload(); toast('Quiz gelöscht'); onBack() }
  return (
    <div className="max-w-[1000px]">
      <Back onClick={onBack}>Lernen</Back>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0"><p className="text-[13px] text-mute">{target(q).kind} · {target(q).title} · bestanden ab {q.passPct} %</p><h1 className="text-[28px] leading-tight mt-1">{q.title || target(q).title}</h1></div>
        {canEdit(q) && <div className="flex items-center gap-2 shrink-0"><button onClick={del} title="Löschen" className="w-10 h-10 rounded-[10px] text-mute hover:text-alert hover:bg-sage-50 flex items-center justify-center"><Trash2 size={16} /></button><button onClick={edit} className={btn2}>Bearbeiten</button></div>}
      </div>
      <div className="flex items-center gap-6 my-8"><Donut value={ok} total={rows.length} size={84} stroke={9} />
        <ul className="space-y-1 text-[14px]"><li><span className="tabular-nums font-medium">{ok}</span> bestanden</li><li><span className="tabular-nums font-medium">{fail}</span> nicht bestanden</li><li><span className="tabular-nums font-medium">{open}</span> noch nicht gemacht</li></ul></div>
      <Section title="Ergebnisse" count={rows.length}>
        <div className="mb-3"><Seg value={who} onChange={setWho} items={[['alle', 'Alle'], ['ok', `Bestanden ${ok}`], ['nein', `Nicht bestanden ${fail}`], ['offen', `Offen ${open}`]]} /></div>
        {list.length === 0 ? <Empty>Niemand in dieser Auswahl.</Empty> :
        <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Person</Th><th className="w-[180px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Studio</th><th className="w-[320px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Stand</th></tr></thead>
          <tbody className="divide-y divide-line">{list.map(({ p, x }) => <tr key={p.id}>
            <td className="px-4 py-2.5"><span className="flex items-center gap-3 min-w-0"><Avatar s={p} photo={p.photo} size="w-8 h-8 text-[12px]" /><span className="truncate">{p.first} {p.last}</span></span></td>
            <td className="px-4 text-mute">{p.branch}</td><td className="px-4">{quizStatus(x)}</td></tr>)}</tbody></table>}
      </Section>
    </div>
  )
}

function QuizEditor({ q, onBack }: { q: QuizEdit; onBack: () => void }) {
  const { news, wiki, quizzes, me, employee, reload, branches } = useApp()
  const office = me.app_role === 'buero'
  const own = branches.filter(b => !b.is_office && (office || [me.branch_id, ...(me.extra ?? [])].includes(b.id)))
  const [edit, setEdit] = useState<QuizEdit>({ ...q, branches: q.branches ?? (office ? [] : [me.branch_id]) }), [aq, setAq] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const taken = new Set(quizzes.filter(x => x.id !== edit.id).map(x => x.newsId ?? x.articleId))
  const newsOpts = news.filter(n => (office || n.authorId === me.id) && !taken.has(n.id))
  const arts = useMemo(() => wiki.filter(a => !a.fromNews && !taken.has(a.id) && aq.trim().length > 1 && `${a.title} ${a.cat}`.toLowerCase().includes(aq.toLowerCase())).slice(0, 8), [wiki, aq]) // eslint-disable-line react-hooks/exhaustive-deps
  const setQ = (i: number, patch: Partial<QEdit>) => setEdit({ ...edit, qs: edit.qs.map((x, j) => j === i ? { ...x, ...patch } : x) })
  const save = async () => {
    const qs = edit.qs.map(x => ({ ...x, options: x.options.map(o => o.trim()) })).filter(x => x.prompt.trim())
    if (edit.target === 'neu' && (!edit.title.trim() || !edit.text.trim())) { setErr('Titel und Lernstoff sind nötig.'); return }
    if (edit.target === 'neu' && !office && !edit.branches?.length) { setErr('Bitte dein Studio wählen.'); return }
    if (edit.target === 'news' && !edit.newsId) { setErr('Bitte eine News wählen.'); return }
    if (edit.target === 'article' && !edit.articleId) { setErr('Bitte einen Artikel wählen.'); return }
    if (!qs.length) { setErr('Mindestens eine Frage ist nötig.'); return }
    const bad = qs.findIndex(x => x.kind === 'text' ? !x.rubric.trim() : x.options.filter(Boolean).length < 2 || x.correct.length === 0 || x.correct.some(c => !x.options[c]))
    if (bad >= 0) { setErr(qs[bad].kind === 'text' ? `Frage ${bad + 1}: bitte beschreiben, woran eine richtige Antwort zu erkennen ist.` : `Frage ${bad + 1}: mindestens zwei Antworten und eine richtige markieren.`); return }
    setBusy(true); setErr('')
    // Neuer Lernstoff: wird als Pflicht-News mit Lesebestätigung veröffentlicht, das Quiz hängt daran
    let newsId = edit.target === 'news' ? edit.newsId : null
    if (edit.target === 'neu') {
      const { data: n, error } = await supabase!.from('news').insert({ title: edit.title.trim(), teaser: edit.text.trim().slice(0, 140), body: edit.text.trim(), tag: 'Pflicht', must_read: true, audience_branches: edit.branches ?? [], author_id: employee.id, author_name: `${me.first} ${me.last}`, publish_at: new Date().toISOString() }).select('id').single()
      if (error || !n) { setBusy(false); setErr('Der Lernstoff liess sich nicht veröffentlichen.'); return }
      newsId = n.id
    }
    const row = { news_id: newsId, article_id: edit.target === 'article' ? edit.articleId : null, title: edit.title.trim(), pass_pct: Math.min(100, Math.max(1, edit.passPct)), updated_at: new Date().toISOString() }
    const { data, error } = edit.id ? await supabase!.from('quizzes').update(row).eq('id', edit.id).select('id').single() : await supabase!.from('quizzes').insert(row).select('id').single()
    if (error || !data) { setBusy(false); setErr(/duplicate|unique/.test(error?.message ?? '') ? 'Dazu gibt es schon ein Quiz.' : 'Speichern hat nicht geklappt.'); return }
    await supabase!.from('quiz_questions').delete().eq('quiz_id', data.id)
    const { error: qe } = await supabase!.from('quiz_questions').insert(qs.map((x, i) => {
      if (x.kind === 'text') return { quiz_id: data.id, sort: i, kind: 'text', prompt: x.prompt.trim(), options: [], correct: [], rubric: x.rubric.trim() }
      const keep = x.options.map((o, j) => o ? j : -1).filter(j => j >= 0)
      return { quiz_id: data.id, sort: i, kind: x.kind, prompt: x.prompt.trim(), options: keep.map(j => x.options[j]), correct: x.correct.filter(c => keep.includes(c)).map(c => keep.indexOf(c)), rubric: '' } }))
    setBusy(false)
    if (qe) { setErr('Die Fragen liessen sich nicht speichern. Bitte noch einmal speichern.'); return }
    toast(edit.target === 'neu' ? 'Lernstoff und Quiz veröffentlicht' : 'Quiz gespeichert'); await reload(); if (edit.target === 'neu') notifyNow(); retranslate(); onBack()
  }
  const label = 'w-[150px] shrink-0 text-[13.5px] text-mute pt-2.5'
  return (
    <div className="max-w-[900px]">
      <Back onClick={onBack}>Lernen</Back>
      <div className="flex items-start justify-between gap-6 mb-6">
        <input autoFocus value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder={edit.target === 'neu' ? 'Titel des Lernstoffs, z. B. Neue Pflegelinie' : 'Titel des Quiz'} className="flex-1 font-display text-[28px] leading-tight outline-none bg-transparent placeholder:text-sage-400" />
        <button disabled={busy} onClick={save} className={`${btn} shrink-0`}>{edit.target === 'neu' && !edit.id ? 'Veröffentlichen' : 'Speichern'}</button>
      </div>
      <div className="divide-y divide-line border-y border-line mb-10">
        {!edit.id && <div className="flex items-start gap-4 py-3"><span className={label}>Lernstoff</span>
          <div className="flex-1"><Seg value={edit.target} onChange={k => setEdit({ ...edit, target: k })} items={[['neu', 'Neu schreiben'], ['news', 'Zu einer News'], ...(office ? [['article', 'Zu einem Wissensartikel'] as ['article', string]] : [])]} />
            <p className="text-[12.5px] text-mute mt-1.5">{edit.target === 'neu' ? 'Erscheint als Pflicht-News mit dem Quiz darunter, alle im Studio bekommen eine Mitteilung.' : edit.target === 'news' ? 'Das Quiz erscheint unter einer bestehenden News.' : 'Das Quiz erscheint unter dem Artikel im Wissen.'}</p></div></div>}
        {edit.target === 'neu' && !edit.id && <>
          <div className="flex items-start gap-4 py-3"><span className={label}>Text</span><textarea value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} rows={6} placeholder="Was sollen alle wissen? Absätze mit einer Leerzeile trennen." className="flex-1 rounded-[10px] bg-sage-50 px-3 py-2.5 text-[14.5px] outline-none resize-none" /></div>
          <div className="flex items-start gap-4 py-3"><span className={label}>Für</span><div className="flex-1 pt-1"><Chips tone="stone" items={own.map(b => ({ value: b.id, label: b.name }))} value={edit.branches ?? []} onChange={v => setEdit({ ...edit, branches: v })} />{office && !edit.branches?.length && <p className="text-[12.5px] text-mute mt-1.5">Kein Studio gewählt: alle Studios.</p>}</div></div>
        </>}
        {edit.target === 'news' && <div className="flex items-start gap-4 py-3"><span className={label}>News</span>
          {edit.id ? <span className="pt-2.5 text-[14px]">{news.find(n => n.id === edit.newsId)?.title}</span>
            : <Select className="flex-1" tone="stone" value={edit.newsId} onChange={v => setEdit({ ...edit, newsId: v, title: edit.title || (news.find(n => n.id === v)?.title ?? '') })} placeholder={newsOpts.length ? 'News wählen …' : office ? 'Keine News ohne Quiz' : 'Du hast noch keine eigene News ohne Quiz'} options={newsOpts.map(n => ({ value: n.id, label: n.title, hint: n.date }))} />}</div>}
        {edit.target === 'article' && <div className="flex items-start gap-4 py-3"><span className={label}>Artikel</span>
          <div className="flex-1">{edit.articleId ? <div className="flex items-center gap-2 h-10 px-3 rounded-[10px] bg-sage-50"><span className="flex-1 truncate">{wiki.find(a => a.id === edit.articleId)?.title}</span>{!edit.id && <button onClick={() => setEdit({ ...edit, articleId: '' })} className="text-mute"><X size={14} /></button>}</div>
            : <div className="relative"><input value={aq} onChange={e => setAq(e.target.value)} placeholder="Artikel suchen …" className={inpStone} />
              {arts.length > 0 && <div className="absolute z-10 left-0 right-0 mt-1 rounded-[12px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-1 max-h-56 overflow-y-auto">{arts.map(a => <button key={a.id} onClick={() => { setEdit({ ...edit, articleId: a.id, title: edit.title || a.title }); setAq('') }} className="w-full text-left px-3 py-2 rounded-[8px] text-[13.5px] hover:bg-sage-50">{a.title} <span className="text-mute">· {a.cat}</span></button>)}</div>}</div>}</div></div>}
        <div className="flex items-center gap-4 py-3"><span className={`${label} !pt-0`}>Bestanden ab</span><span className="flex items-center gap-2"><input type="number" min={1} max={100} value={edit.passPct} onChange={e => setEdit({ ...edit, passPct: Number(e.target.value) })} className="w-20 h-9 rounded-[8px] bg-sage-50 px-3 text-[14px] outline-none tabular-nums" /><span className="text-mute">% richtig</span></span></div>
      </div>

      <Section title="Fragen" count={edit.qs.length}>
        <div className="divide-y divide-line border-t border-line">{edit.qs.map((x, i) => <div key={i} className="py-4">
          <div className="flex items-center gap-3"><span className="text-mute text-[13px] w-5 tabular-nums">{i + 1}.</span>
            <input value={x.prompt} onChange={e => setQ(i, { prompt: e.target.value })} placeholder="Frage" className="flex-1 h-10 rounded-[8px] px-2 bg-transparent hover:bg-sage-50 focus:bg-sage-50 outline-none text-[15px] font-medium" />
            <Seg value={x.kind} onChange={k => setQ(i, { kind: k, correct: k === 'single' ? x.correct.slice(0, 1) : x.correct })} items={[['single', 'Eine richtig'], ['multi', 'Mehrere'], ['text', 'Freitext']]} />
            <button onClick={() => setEdit({ ...edit, qs: edit.qs.filter((_, j) => j !== i) })} title="Frage entfernen" className="w-8 h-8 rounded-[8px] text-mute hover:text-alert hover:bg-sage-50 flex items-center justify-center shrink-0"><Trash2 size={15} /></button></div>
          {x.kind === 'text' ? <div className="mt-2 pl-8"><textarea value={x.rubric} onChange={e => setQ(i, { rubric: e.target.value })} rows={2} placeholder="Woran erkennt Benni eine richtige Antwort? z. B. „Schutz vor Keimen, keine Übertragung zwischen Kunden“" className="w-full rounded-[10px] bg-sage-50 px-3 py-2 text-[14px] outline-none resize-none" /></div>
            : <div className="mt-2 pl-8 space-y-1">{x.options.map((o, j) => { const on = x.correct.includes(j)
              return <div key={j} className="group flex items-center gap-2">
                <button title={on ? 'Richtige Antwort' : 'Als richtig markieren'} onClick={() => setQ(i, { correct: x.kind === 'single' ? [j] : on ? x.correct.filter(c => c !== j) : [...x.correct, j] })} className={`w-5 h-5 shrink-0 flex items-center justify-center ${x.kind === 'single' ? 'rounded-full' : 'rounded-[6px]'} ${on ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92]'}`}>{on && <Check size={12} strokeWidth={3} />}</button>
                <input value={o} onChange={e => setQ(i, { options: x.options.map((y, k) => k === j ? e.target.value : y) })} placeholder={`Antwort ${j + 1}`} className="flex-1 h-9 rounded-[8px] px-2 bg-transparent hover:bg-sage-50 focus:bg-sage-50 outline-none text-[14px]" />
                {x.options.length > 2 && <button onClick={() => setQ(i, { options: x.options.filter((_, k) => k !== j), correct: x.correct.filter(c => c !== j).map(c => c > j ? c - 1 : c) })} className="text-mute hover:text-ink opacity-0 group-hover:opacity-100"><X size={14} /></button>}
              </div> })}
              <button onClick={() => setQ(i, { options: [...x.options, ''] })} className="text-[13px] text-olive-700 pt-1 pl-7">Antwort hinzufügen</button></div>}
        </div>)}</div>
        <button onClick={() => setEdit({ ...edit, qs: [...edit.qs, emptyQ()] })} className="mt-2 h-9 px-2 rounded-[8px] text-[13.5px] text-olive-700 hover:bg-sage-50 flex items-center gap-1.5"><Plus size={15} />Frage hinzufügen</button>
        <div className="mt-3"><Err m={err} /></div>
      </Section>
    </div>
  )
}
