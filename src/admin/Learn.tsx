import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { useApp, fmtDate, inNewsAudience, type Quiz, type Staff } from '../store'
import { supabase } from '../lib/supabase'
import { Avatar } from '../People'
import { toast } from '../Toast'
import { H, New, Sec, Th, Bar, Field, inpStone, btn, btn2, Err, retranslate, real, inBranch, Select, Seg, Modal, Dot } from './kit'

// Lernen: wer wie weit ist (Onboarding, Pflicht-News, Quiz), Quiz anlegen (Büro alles, Filialleitung zu eigenen News)
// und die Onboarding-Schritte samt Strenge der Kontrollfragen.

export function LearnAdmin() {
  const { me, news } = useApp()
  const office = me.app_role === 'buero'
  const [tab, setTab] = useState<'fortschritt' | 'quiz' | 'onboarding'>('fortschritt')
  const [quiz, setQuiz] = useState<QuizEdit | null>(null), [step, setStep] = useState(false)
  const ownNews = news.filter(n => n.authorId === me.id)
  return (<>
    <H info="Fortschritt: wer im Onboarding, bei Pflicht-News und Quiz wie weit ist. Quiz: Fragen zu einer News oder einem Artikel, mit Nachweis je Person. Onboarding: die Lernschritte, die Benni mit Neuen durchgeht."
      action={tab === 'quiz' && (office || ownNews.length > 0) ? <New onClick={() => setQuiz(blankQuiz(office ? 'news' : 'news'))}>Neues Quiz</New> : tab === 'onboarding' && office ? <New onClick={() => setStep(true)}>Neuer Schritt</New> : undefined}>Lernen</H>
    <div className="mb-6"><Seg value={tab} onChange={setTab} items={[['fortschritt', 'Fortschritt'], ['quiz', 'Quiz'], ['onboarding', 'Onboarding']]} /></div>
    {tab === 'fortschritt' && <Progress />}
    {tab === 'quiz' && <Quizzes onEdit={setQuiz} />}
    {tab === 'onboarding' && <Onboarding />}
    {quiz && <QuizModal q={quiz} onClose={() => setQuiz(null)} />}
    {step && <StepModal onClose={() => setStep(false)} />}
  </>)
}

/* ---------- Fortschritt je Person ---------- */
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
    const myMust = must.filter(n => inNewsAudience(p, n))
    const qz = quizzes.filter(q => !q.newsId || myMust.some(n => n.id === q.newsId) || news.some(n => n.id === q.newsId && inNewsAudience(p, n)))
    const best = (qid: string) => { const a = attempts.filter(x => x.quizId === qid && x.employeeId === p.id); return { n: a.length, max: a.length ? Math.max(...a.map(x => x.scorePct)) : null, passed: a.some(x => x.passed), at: a.find(x => x.passed)?.at ?? null } }
    return {
      loaded: !!ob, steps: steps.map(s => ({ s, done: done.has(s.id) })), obDone: steps.filter(s => done.has(s.id)).length, obTotal: steps.length,
      must: myMust.map(n => ({ n, ok: newsReads.some(r => r.news_id === n.id && r.employee_id === p.id && r.confirmed_at) })),
      quizzes: qz.map(q => ({ q, ...best(q.id) })),
    }
  }
}
function Progress() {
  const { people, studios, br, setBr } = useScope()
  const stats = useLearnStats()
  const [sel, setSel] = useState<Staff | null>(null)
  const rows = people.map(p => ({ p, st: stats(p) }))
  const frac = (a: number, b: number) => <span className="text-[12.5px] text-mute tabular-nums w-12 text-right shrink-0">{a}/{b}</span>
  return (<>
    {studios.length > 1 && <div className="mb-4"><Select tone="stone" className="w-44" value={br} onChange={setBr} options={[{ value: '', label: 'Alle Studios' }, ...studios.map(b => ({ value: b.id, label: b.name }))]} /></div>}
    <table className="tbl w-full text-[14px]"><thead><tr><Th>Person</Th><Th>Onboarding</Th><Th>Pflicht-News bestätigt</Th><Th>Quiz bestanden</Th></tr></thead>
      <tbody className="divide-y divide-line">{rows.map(({ p, st }) => { const mOk = st.must.filter(x => x.ok).length, qOk = st.quizzes.filter(x => x.passed).length
        return <tr key={p.id} onClick={() => setSel(p)} className="cursor-pointer hover:bg-sage-50/70">
          <td className="px-4 py-2.5"><span className="flex items-center gap-3"><Avatar s={p} photo={p.photo} size="w-8 h-8 text-[12px]" /><span><span className="block">{p.first} {p.last}</span><span className="block text-[12px] text-mute">{p.role} · {p.branch}</span></span></span></td>
          <td className="px-4 w-64"><span className="flex items-center gap-3"><Bar p={st.obTotal ? st.obDone / st.obTotal * 100 : 0} />{st.loaded ? frac(st.obDone, st.obTotal) : <span className="w-12" />}</span></td>
          <td className="px-4 w-56"><span className="flex items-center gap-3"><Bar p={st.must.length ? mOk / st.must.length * 100 : 0} tone={mOk < st.must.length ? 'brass' : 'olive'} />{frac(mOk, st.must.length)}</span></td>
          <td className="px-4 w-40 text-mute tabular-nums">{qOk} von {st.quizzes.length}</td>
        </tr> })}</tbody></table>
    {sel && <PersonLearn p={sel} st={stats(sel)} onClose={() => setSel(null)} />}
  </>)
}
function PersonLearn({ p, st, onClose }: { p: Staff; st: ReturnType<ReturnType<typeof useLearnStats>>; onClose: () => void }) {
  const tick = (ok: boolean) => ok ? <span className="w-5 h-5 rounded-full bg-olive-700 text-white flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3} /></span> : <span className="w-5 h-5 rounded-full shadow-[inset_0_0_0_1.5px_#C8CDC5] shrink-0" />
  return (
    <Modal width={620} title={<span className="flex items-center gap-3"><Avatar s={p} photo={p.photo} size="w-9 h-9 text-[13px]" />{p.first} {p.last}</span>} onClose={onClose}>
      <Sec>{`Onboarding · ${st.obDone} von ${st.obTotal}`}</Sec>
      <ul className="rounded-[14px] border border-line divide-y divide-line mb-6">{st.steps.map(({ s, done }) => <li key={s.id} className="px-4 py-2.5 flex items-center gap-3 text-[14px]">{tick(done)}<span className={`flex-1 ${done ? 'text-mute' : ''}`}>{s.title}</span><span className="text-[12px] text-mute">{s.minutes} Min.</span></li>)}</ul>
      <Sec>Pflicht-News</Sec>
      <ul className="rounded-[14px] border border-line divide-y divide-line mb-6">{st.must.length === 0 && <li className="px-4 py-2.5 text-[14px] text-mute">Keine Pflicht-News für diese Person.</li>}
        {st.must.map(({ n, ok }) => <li key={n.id} className="px-4 py-2.5 flex items-center gap-3 text-[14px]">{tick(ok)}<span className="flex-1">{n.title}</span><span className="text-[12px] text-mute">{ok ? 'bestätigt' : 'offen'}</span></li>)}</ul>
      <Sec>Quiz</Sec>
      <ul className="rounded-[14px] border border-line divide-y divide-line">{st.quizzes.length === 0 && <li className="px-4 py-2.5 text-[14px] text-mute">Kein Quiz.</li>}
        {st.quizzes.map(x => <li key={x.q.id} className="px-4 py-2.5 flex items-center gap-3 text-[14px]">{tick(x.passed)}<span className="flex-1">{x.q.title}</span><span className="text-[12px] text-mute">{x.passed ? `bestanden${x.at ? ` am ${fmtDate(x.at, { day: 'numeric', month: 'numeric' })}` : ''}` : x.n ? `${x.max} % · ${x.n} Versuche` : 'noch nicht gemacht'}</span></li>)}</ul>
    </Modal>
  )
}

/* ---------- Quiz ---------- */
type QEdit = { kind: 'single' | 'multi' | 'text'; prompt: string; options: string[]; correct: number[]; rubric: string }
type QuizEdit = { id?: string; target: 'news' | 'article'; newsId: string; articleId: string; title: string; passPct: number; qs: QEdit[] }
const emptyQ = (): QEdit => ({ kind: 'single', prompt: '', options: ['', ''], correct: [], rubric: '' })
const blankQuiz = (target: 'news' | 'article'): QuizEdit => ({ target, newsId: '', articleId: '', title: '', passPct: 80, qs: [emptyQ()] })

function Quizzes({ onEdit }: { onEdit: (q: QuizEdit) => void }) {
  const { quizzes, news, wiki, me, reload } = useApp()
  const { people } = useScope()
  const stats = useLearnStats()
  const office = me.app_role === 'buero'
  const [sel, setSel] = useState<string | null>(null)
  const canEdit = (q: Quiz) => office || (!!q.newsId && news.find(n => n.id === q.newsId)?.authorId === me.id)
  const target = (q: Quiz) => q.newsId ? { kind: 'News', title: news.find(n => n.id === q.newsId)?.title ?? '–' } : { kind: 'Wissen', title: wiki.find(a => a.id === q.articleId)?.title ?? '–' }
  const who = (q: Quiz) => people.filter(p => stats(p).quizzes.some(x => x.q.id === q.id))
  const open = async (q: Quiz) => {
    const { data } = await supabase!.from('quiz_questions').select('kind, prompt, options, correct, rubric').eq('quiz_id', q.id).order('sort')
    onEdit({ id: q.id, target: q.newsId ? 'news' : 'article', newsId: q.newsId ?? '', articleId: q.articleId ?? '', title: q.title, passPct: q.passPct,
      qs: (data ?? []).map((x: any) => ({ kind: x.kind, prompt: x.prompt, options: x.kind === 'text' ? ['', ''] : x.options, correct: x.correct ?? [], rubric: x.rubric ?? '' })) })
  }
  const q = quizzes.find(x => x.id === sel)
  if (!quizzes.length) return <p className="text-[14px] text-mute">Noch kein Quiz. {office ? 'Oben rechts legst du eines an.' : 'Ein Quiz gehört zu einer deiner News: erst unter News eine anlegen, dann hier das Quiz.'}</p>
  return (
    <div className={`grid gap-8 ${q ? 'grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>
      <table className="tbl w-full text-[14px] self-start"><thead><tr><Th>Quiz</Th><Th>Gehört zu</Th><Th>Bestanden</Th><Th /></tr></thead>
        <tbody className="divide-y divide-line">{quizzes.map(x => { const ps = who(x), pc = ps.filter(p => stats(p).quizzes.find(y => y.q.id === x.id)?.passed).length
          return <tr key={x.id} onClick={() => setSel(x.id === sel ? null : x.id)} className={`cursor-pointer ${sel === x.id ? 'bg-sage-50' : 'hover:bg-sage-50/70'}`}>
            <td className="px-4 py-3">{x.title || target(x).title}{x.sample && <span className="ml-2 text-xs text-mute">Beispiel</span>}<p className="text-xs text-mute">bestanden ab {x.passPct} %</p></td>
            <td className="px-4 text-mute">{target(x).kind} · {target(x).title}</td>
            <td className="px-4 w-48"><span className="flex items-center gap-2"><Bar p={ps.length ? pc / ps.length * 100 : 0} /><span className="text-xs text-mute tabular-nums">{pc}/{ps.length}</span></span></td>
            <td className="px-3 text-right">{canEdit(x) && <button onClick={e => { e.stopPropagation(); open(x) }} className="text-[13px] text-olive-700">Bearbeiten</button>}</td>
          </tr> })}</tbody></table>
      {q && <aside className="self-start rounded-[20px] border border-line p-5">
        <p className="font-medium">{q.title || target(q).title}</p><p className="text-xs text-mute mt-1">{target(q).kind} · bestanden ab {q.passPct} %</p>
        {canEdit(q) && <button onClick={async () => { if (confirm('Dieses Quiz löschen? Die Ergebnisse gehen verloren.')) { await supabase!.from('quizzes').delete().eq('id', q.id); setSel(null); await reload(); toast('Quiz gelöscht') } }} className="mt-2 text-[13px] text-mute hover:text-alert flex items-center gap-1"><Trash2 size={13} />Löschen</button>}
        <div className="mt-4"><Sec>Nachweis</Sec><ul className="divide-y divide-line max-h-[480px] overflow-y-auto no-scrollbar">{who(q).map(p => { const b = stats(p).quizzes.find(y => y.q.id === q.id)!
          return <li key={p.id} className="py-2 flex items-center gap-2.5 text-[13px]"><Avatar s={p} photo={p.photo} size="w-6 h-6 text-[10px]" /><span className="flex-1 truncate">{p.first} {p.last}</span>
            {b.passed ? <Dot tone="ok">{b.at ? fmtDate(b.at, { day: '2-digit', month: '2-digit' }) : 'bestanden'}</Dot> : b.n ? <span className="text-mute">{b.max} % · {b.n}×</span> : <span className="text-mute">offen</span>}</li> })}</ul></div>
      </aside>}
    </div>
  )
}

function QuizModal({ q, onClose }: { q: QuizEdit; onClose: () => void }) {
  const { news, wiki, quizzes, me, reload } = useApp()
  const office = me.app_role === 'buero'
  const [edit, setEdit] = useState(q), [aq, setAq] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const taken = new Set(quizzes.filter(x => x.id !== edit.id).map(x => x.newsId ?? x.articleId))
  const newsOpts = news.filter(n => (office || n.authorId === me.id) && !taken.has(n.id))
  const arts = useMemo(() => wiki.filter(a => !a.fromNews && !taken.has(a.id) && aq.trim().length > 1 && `${a.title} ${a.cat}`.toLowerCase().includes(aq.toLowerCase())).slice(0, 8), [wiki, aq]) // eslint-disable-line react-hooks/exhaustive-deps
  const setQ = (i: number, patch: Partial<QEdit>) => setEdit({ ...edit, qs: edit.qs.map((x, j) => j === i ? { ...x, ...patch } : x) })
  const save = async () => {
    const ref = edit.target === 'news' ? edit.newsId : edit.articleId
    const qs = edit.qs.map(x => ({ ...x, options: x.options.map(o => o.trim()) })).filter(x => x.prompt.trim())
    if (!ref) { setErr(edit.target === 'news' ? 'Bitte eine News wählen.' : 'Bitte einen Artikel wählen.'); return }
    if (!qs.length) { setErr('Mindestens eine Frage ist nötig.'); return }
    const bad = qs.findIndex(x => x.kind === 'text' ? !x.rubric.trim() : x.options.filter(Boolean).length < 2 || x.correct.length === 0 || x.correct.some(c => !x.options[c]))
    if (bad >= 0) { setErr(qs[bad].kind === 'text' ? `Frage ${bad + 1}: bitte beschreiben, woran eine richtige Antwort zu erkennen ist.` : `Frage ${bad + 1}: mindestens zwei Antworten und eine richtige markieren.`); return }
    setBusy(true); setErr('')
    const row = { news_id: edit.target === 'news' ? ref : null, article_id: edit.target === 'article' ? ref : null, title: edit.title.trim(), pass_pct: Math.min(100, Math.max(1, edit.passPct)), updated_at: new Date().toISOString() }
    const { data, error } = edit.id ? await supabase!.from('quizzes').update(row).eq('id', edit.id).select('id').single() : await supabase!.from('quizzes').insert(row).select('id').single()
    if (error || !data) { setBusy(false); setErr(/duplicate|unique/.test(error?.message ?? '') ? 'Dazu gibt es schon ein Quiz.' : 'Speichern hat nicht geklappt.'); return }
    const { error: de } = await supabase!.from('quiz_questions').delete().eq('quiz_id', data.id)
    if (de) { setBusy(false); setErr('Speichern hat nicht geklappt.'); return }
    const { error: qe } = await supabase!.from('quiz_questions').insert(qs.map((x, i) => {
      if (x.kind === 'text') return { quiz_id: data.id, sort: i, kind: 'text', prompt: x.prompt.trim(), options: [], correct: [], rubric: x.rubric.trim() }
      const keep = x.options.map((o, j) => o ? j : -1).filter(j => j >= 0)
      return { quiz_id: data.id, sort: i, kind: x.kind, prompt: x.prompt.trim(), options: keep.map(j => x.options[j]), correct: x.correct.filter(c => keep.includes(c)).map(c => keep.indexOf(c)), rubric: '' } }))
    setBusy(false)
    if (qe) { setErr('Die Fragen liessen sich nicht speichern. Bitte noch einmal speichern.'); return }
    toast('Quiz gespeichert'); await reload(); retranslate(); onClose()
  }
  const kindSeg = (i: number, x: QEdit) => <Seg value={x.kind} onChange={k => setQ(i, { kind: k, correct: k === 'single' ? x.correct.slice(0, 1) : x.correct })} items={[['single', 'Eine richtig'], ['multi', 'Mehrere'], ['text', 'Freitext']]} />
  return (
    <Modal width={820} title={edit.id ? 'Quiz bearbeiten' : 'Neues Quiz'} onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={save} className={btn}>Speichern</button></>}>
      <div className="grid grid-cols-[1fr_200px] gap-3 mb-5">
        {office && <div className="col-span-2"><Seg value={edit.target} onChange={k => setEdit({ ...edit, target: k })} items={[['news', 'Zu einer News'], ['article', 'Zu einem Wissensartikel']]} /></div>}
        {edit.target === 'news' ? <Select label="News" tone="stone" value={edit.newsId} onChange={v => setEdit({ ...edit, newsId: v, title: edit.title || (news.find(n => n.id === v)?.title ?? '') })} placeholder={newsOpts.length ? 'News wählen …' : 'Keine News ohne Quiz'} options={newsOpts.map(n => ({ value: n.id, label: n.title, hint: n.date }))} />
          : <Field label="Artikel">{edit.articleId ? <div className="flex items-center gap-2 h-10 px-3 rounded-[10px] bg-sage-50"><span className="flex-1 truncate">{wiki.find(a => a.id === edit.articleId)?.title}</span><button onClick={() => setEdit({ ...edit, articleId: '' })} className="text-mute"><X size={14} /></button></div>
            : <div className="relative"><input value={aq} onChange={e => setAq(e.target.value)} placeholder="Artikel suchen …" className={inpStone} />
              {arts.length > 0 && <div className="absolute z-10 left-0 right-0 mt-1 rounded-[12px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-1 max-h-56 overflow-y-auto">{arts.map(a => <button key={a.id} onClick={() => { setEdit({ ...edit, articleId: a.id, title: edit.title || a.title }); setAq('') }} className="w-full text-left px-3 py-2 rounded-[8px] text-[13.5px] hover:bg-sage-50">{a.title} <span className="text-mute">· {a.cat}</span></button>)}</div>}</div>}</Field>}
        <Field label="Bestanden ab (%)"><input type="number" min={1} max={100} value={edit.passPct} onChange={e => setEdit({ ...edit, passPct: Number(e.target.value) })} className={inpStone} /></Field>
        <div className="col-span-2"><Field label="Titel"><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} className={inpStone} /></Field></div>
      </div>
      <div className="space-y-3">{edit.qs.map((x, i) => <div key={i} className="rounded-[14px] border border-line p-4">
        <div className="flex items-center gap-3"><span className="text-mute text-[13px] w-5">{i + 1}.</span>
          <input value={x.prompt} onChange={e => setQ(i, { prompt: e.target.value })} placeholder="Frage" className={`${inpStone} font-medium`} />
          {kindSeg(i, x)}
          <button onClick={() => setEdit({ ...edit, qs: edit.qs.filter((_, j) => j !== i) })} title="Frage entfernen" className="w-8 h-8 rounded-full text-mute hover:text-alert flex items-center justify-center shrink-0"><Trash2 size={15} /></button></div>
        {x.kind === 'text' ? <div className="mt-3 pl-8"><textarea value={x.rubric} onChange={e => setQ(i, { rubric: e.target.value })} rows={2} placeholder="Woran erkennt Benni eine richtige Antwort? z. B. „Schutz vor Keimen, keine Übertragung zwischen Kundinnen“" className="w-full rounded-[10px] bg-sage-50 px-3 py-2 text-[14px] outline-none resize-none" /></div>
          : <div className="mt-3 pl-8 space-y-1.5">{x.options.map((o, j) => { const on = x.correct.includes(j)
            return <div key={j} className="flex items-center gap-2">
              <button title="Als richtig markieren" onClick={() => setQ(i, { correct: x.kind === 'single' ? [j] : on ? x.correct.filter(c => c !== j) : [...x.correct, j] })} className={`w-5 h-5 shrink-0 flex items-center justify-center ${x.kind === 'single' ? 'rounded-full' : 'rounded-[6px]'} ${on ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92]'}`}>{on && <Check size={12} strokeWidth={3} />}</button>
              <input value={o} onChange={e => setQ(i, { options: x.options.map((y, k) => k === j ? e.target.value : y) })} placeholder={`Antwort ${j + 1}`} className="flex-1 h-9 rounded-[8px] bg-sage-50 px-3 text-[14px] outline-none" />
              {x.options.length > 2 && <button onClick={() => setQ(i, { options: x.options.filter((_, k) => k !== j), correct: x.correct.filter(c => c !== j).map(c => c > j ? c - 1 : c) })} className="text-mute hover:text-ink"><X size={14} /></button>}
            </div> })}
            <button onClick={() => setQ(i, { options: [...x.options, ''] })} className="text-[13px] text-olive-700 pt-1">Antwort hinzufügen</button></div>}
      </div>)}</div>
      <button onClick={() => setEdit({ ...edit, qs: [...edit.qs, emptyQ()] })} className="mt-3 h-9 px-3 rounded-[10px] text-[13.5px] text-olive-700 hover:bg-sage-50 flex items-center gap-1.5"><Plus size={15} />Frage hinzufügen</button>
      <div className="mt-2"><Err m={err} /></div>
    </Modal>
  )
}

/* ---------- Onboarding ---------- */
function Onboarding() {
  const { steps, wiki, me, reload } = useApp()
  const { people } = useScope()
  const stats = useLearnStats()
  const office = me.app_role === 'buero'
  const doneBy = (id: string) => people.filter(p => stats(p).steps.some(x => x.s.id === id && x.done)).length
  return (<>
    <LearnSettings />
    <table className="tbl w-full text-[14px]"><thead><tr><Th>Schritt</Th><Th>Dauer</Th><Th>Lernstoff</Th><Th>Erledigt</Th><Th /></tr></thead>
      <tbody className="divide-y divide-line">{steps.map((s, i) => <tr key={s.id}>
        <td className="px-4 py-3"><span className="text-mute mr-2 tabular-nums">{i + 1}.</span>{s.title}</td>
        <td className="px-4 text-mute">{s.minutes} Min.</td>
        <td className="px-4 text-mute">{wiki.find(a => a.id === s.articleId)?.title ?? 'passender Artikel aus dem Wissen'}</td>
        <td className="px-4 w-48"><span className="flex items-center gap-2"><Bar p={people.length ? doneBy(s.id) / people.length * 100 : 0} /><span className="text-xs text-mute tabular-nums">{doneBy(s.id)}/{people.length}</span></span></td>
        <td className="px-3 text-right">{office && <button title="Schritt entfernen" onClick={async () => { if (confirm(`Schritt „${s.title}“ entfernen? Der Fortschritt dazu geht verloren.`)) { const { error } = await supabase!.from('onboarding_steps').delete().eq('id', s.id); toast(error ? 'Das hat nicht geklappt' : 'Entfernt', error ? 'error' : 'ok'); await reload() } }} className="w-8 h-8 rounded-full text-mute hover:text-alert inline-flex items-center justify-center"><Trash2 size={14} /></button>}</td>
      </tr>)}</tbody></table>
    {!office && <p className="mt-3 text-[12.5px] text-mute">Die Schritte pflegt das Büro, sie gelten für alle Studios.</p>}
  </>)
}
function StepModal({ onClose }: { onClose: () => void }) {
  const { wiki, steps, reload } = useApp()
  const [title, setTitle] = useState(''), [minutes, setMinutes] = useState('10'), [article, setArticle] = useState(''), [err, setErr] = useState('')
  const save = async () => {
    if (!title.trim()) { setErr('Titel ist nötig.'); return }
    const { error } = await supabase!.from('onboarding_steps').insert({ title: title.trim(), minutes: Number(minutes) || 10, article_id: article || null, sort: steps.length, proposed: false })
    if (error) { setErr('Speichern hat nicht geklappt.'); return }
    toast('Schritt angelegt'); await reload(); retranslate(); onClose()
  }
  return (
    <Modal title="Neuer Onboarding-Schritt" onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button onClick={save} className={btn}>Anlegen</button></>}>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Titel"><input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Kasse und Gutscheine" className={inpStone} /></Field>
        <Field label="Dauer (Min.)"><input type="number" min={1} value={minutes} onChange={e => setMinutes(e.target.value)} className={inpStone} /></Field>
        <div className="col-span-2"><Select label="Lernstoff (Wissensartikel)" tone="stone" value={article} onChange={setArticle} placeholder="Benni sucht selbst den passenden Artikel" options={wiki.filter(a => a.published && !a.fromNews).map(a => ({ value: a.id, label: a.title, hint: a.cat }))} /></div>
      </div>
      <p className="mt-3 text-[12.5px] text-mute">Benni erklärt den Schritt mit Lernkarten aus diesem Artikel und stellt danach die Kontrollfragen.</p>
      <div className="mt-2"><Err m={err} /></div>
    </Modal>
  )
}

/** Wie streng Benni beim Onboarding prüft: Anzahl Kontrollfragen je Lektion und Mindestzahl richtiger Antworten. */
function LearnSettings() {
  const { me } = useApp()
  const isBuero = me.app_role === 'buero'
  const [n, setN] = useState<number | null>(null), [m, setM] = useState(2)
  useEffect(() => { supabase!.rpc('app_flags').then(({ data }) => { const d = data as any; setN(Number(d?.learn_questions) || 3); setM(Number(d?.learn_min_correct) || 2) }) }, [])
  const save = async (nn: number, mm: number) => {
    const min = Math.min(mm, nn); setN(nn); setM(min)
    const at = new Date().toISOString()
    const r = await supabase!.from('app_settings').upsert([{ key: 'learn_questions', value: nn, updated_at: at }, { key: 'learn_min_correct', value: min, updated_at: at }])
    toast(r.error ? 'Speichern hat nicht geklappt' : 'Gespeichert', r.error ? 'error' : 'ok')
  }
  if (n === null) return null
  const seg = (on: boolean) => `w-9 h-8 rounded-[8px] text-[13px] tabular-nums transition ${on ? 'bg-olive-700 text-white' : 'text-ink/70 hover:bg-white'} disabled:hover:bg-transparent disabled:cursor-default`
  return (
    <div className="mb-6 rounded-[16px] bg-sage-50 px-6 py-4 grid grid-cols-[1fr_auto_auto] gap-8 items-center">
      <div><p className="font-medium text-[14.5px]">Kontrollfragen bei Benni</p>
        <p className="text-[13px] text-mute mt-0.5">Erst wenn genug richtig sind, gilt ein Schritt als erledigt.{!isBuero && ' Einstellen kann das Büro.'}</p></div>
      <div><p className="text-xs text-mute mb-1.5">Fragen je Lektion</p>
        <div className="flex gap-1 p-1 rounded-[10px] bg-white/60">{[1, 2, 3, 4, 5].map(k => <button key={k} disabled={!isBuero} onClick={() => save(k, m)} className={seg(n === k)}>{k}</button>)}</div></div>
      <div><p className="text-xs text-mute mb-1.5">Bestanden ab … richtigen</p>
        <div className="flex gap-1 p-1 rounded-[10px] bg-white/60">{Array.from({ length: n }, (_, i) => i + 1).map(k => <button key={k} disabled={!isBuero} onClick={() => save(n, k)} className={seg(m === k)}>{k}</button>)}</div></div>
    </div>
  )
}
