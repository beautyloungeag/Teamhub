import { useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useApp, type Quiz, type QuizQuestion, type QuizResult } from './store'

// Quiz am Ende einer News oder eines Wissensartikels. Lösungen kennt nur der Server (submit_quiz).
export function QuizRunner({ quiz }: { quiz: Quiz }) {
  const { attempts, me, submitQuiz, t } = useApp()
  const mine = attempts.filter(a => a.quizId === quiz.id && a.employeeId === me.id)
  const passed = mine.find(a => a.passed)
  const last = mine[mine.length - 1]
  const [qs, setQs] = useState<QuizQuestion[] | null>(null)
  const [ans, setAns] = useState<Record<string, number[] | string>>({})
  const [res, setRes] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')

  const start = async () => {
    setBusy(true); setErr(''); setRes(null); setAns({})
    const { data, error } = await supabase!.rpc('quiz_for_me', { p_quiz: quiz.id })
    setBusy(false)
    if (error) { setErr(t('Das Quiz lässt sich gerade nicht laden.')); return }
    setQs((data ?? []) as QuizQuestion[])
  }
  const pick = (q: QuizQuestion, i: number) => setAns(a => {
    const cur = (a[q.id] ?? []) as number[]
    return { ...a, [q.id]: q.kind === 'single' ? [i] : cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i] }
  })
  const done = qs ? qs.every(q => q.kind === 'text' ? String(ans[q.id] ?? '').trim().length > 2 : ((ans[q.id] ?? []) as number[]).length > 0) : false
  const submit = async () => {
    setBusy(true); setErr('')
    const r = await submitQuiz(quiz.id, ans)
    setBusy(false)
    if (!r || r.error) { setErr(r?.error === 'ai_unavailable' ? t('Die Auswertung der Freitext-Antworten klappt gerade nicht. Bitte gleich noch einmal.') : t('Das hat nicht geklappt. Bitte versuche es noch einmal.')); return }
    setRes(r)
  }

  // Noch nicht gestartet
  if (!qs) return (
    <div className="mt-10 rounded-[16px] bg-white px-4 py-4">
      <p className="rubric text-olive-700">{t('Kurzes Quiz')}</p>
      <p className="mt-2 text-[15px]">{passed ? t('Bestanden mit {n} %', { n: Math.max(...mine.filter(a => a.passed).map(a => a.scorePct)) }) : t('Bestanden ab {n} % richtigen Antworten', { n: quiz.passPct })}</p>
      {!passed && last && <p className="mt-1 text-[13px] text-mute">{t('Letzter Versuch: {n} %', { n: last.scorePct })}</p>}
      {err && <p className="mt-2 text-[13px] text-alert">{err}</p>}
      <button disabled={busy} onClick={start} className={`mt-4 w-full h-12 rounded-[10px] font-medium disabled:opacity-60 ${passed ? 'bg-sage-50 text-ink' : 'bg-olive-700 text-white'}`}>{passed ? t('Nochmal üben') : last ? t('Nochmal versuchen') : t('Quiz starten')}</button>
    </div>
  )

  // Ergebnis
  if (res) return (
    <div className="mt-10">
      <p className="rubric text-olive-700">{t('Ergebnis')}</p>
      <p className="font-display text-[44px] leading-none mt-3">{res.score_pct} %</p>
      <p className="mt-2 text-[15px]">{res.passed ? t('Bestanden. Danke!') : t('Noch nicht bestanden. Ab {n} % klappt es.', { n: res.pass_pct })}</p>
      <div className="mt-4 rounded-[16px] bg-white divide-y divide-line">{qs.map((q, i) => (
        <div key={q.id} className="px-4 py-3 flex gap-3 items-start text-[14px]"><span className={`mt-1.5 w-[7px] h-[7px] rounded-full shrink-0 ${res.results[q.id] ? 'bg-ok' : 'bg-alert'}`} /><span className="flex-1">{i + 1}. {q.prompt}{res.feedback?.[q.id] && <span className="block text-[13px] text-mute mt-1">{res.feedback[q.id]}</span>}</span><span className="text-mute text-[13px] shrink-0">{res.results[q.id] ? t('richtig') : t('falsch')}</span></div>
      ))}</div>
      {!res.passed && <button onClick={() => { setRes(null); setAns({}) }} className="mt-4 w-full h-12 rounded-[10px] bg-olive-700 text-white font-medium">{t('Nochmal versuchen')}</button>}
      {res.passed && <button onClick={() => { setQs(null); setRes(null) }} className="mt-4 w-full h-12 rounded-[10px] bg-sage-50 font-medium">{t('Fertig')}</button>}
    </div>
  )

  // Fragen
  return (
    <div className="mt-10">
      <p className="rubric text-olive-700">{t('Kurzes Quiz')} · {t('{n} Fragen', { n: qs.length })}</p>
      <div className="mt-3 space-y-3">{qs.map((q, i) => (
        <div key={q.id} className="rounded-[16px] bg-white px-4 py-3">
          <p className="text-[15px] font-medium">{i + 1}. {q.prompt}</p>
          {q.kind === 'multi' && <p className="text-xs text-mute mt-0.5">{t('Mehrere Antworten richtig')}</p>}
          {q.kind === 'text' ? <textarea value={String(ans[q.id] ?? '')} onChange={e => setAns(a => ({ ...a, [q.id]: e.target.value }))} rows={3} placeholder={t('Deine Antwort in eigenen Worten')} className="mt-2 w-full rounded-[10px] bg-sage-50 px-3 py-2 text-[15px] outline-none resize-none placeholder:text-mute" />
          : <div className="mt-2">{q.options.map((o, j) => { const on = ((ans[q.id] ?? []) as number[]).includes(j)
            return <button key={j} onClick={() => pick(q, j)} className="w-full flex items-center gap-3 py-2.5 text-left text-[15px] border-t border-line first:border-t-0">
              <span className={`w-5 h-5 shrink-0 flex items-center justify-center transition ${q.kind === 'single' ? 'rounded-full' : 'rounded-[6px]'} ${on ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92]'}`}>{on && <Check size={12} strokeWidth={3} />}</span>{o}</button> })}</div>}
        </div>
      ))}</div>
      {err && <p className="mt-2 text-[13px] text-alert">{err}</p>}
      <button disabled={!done || busy} onClick={submit} className="mt-4 w-full h-12 rounded-[10px] bg-olive-700 text-white font-medium disabled:opacity-40">{busy ? t('Wird ausgewertet …') : t('Auswerten')}</button>
    </div>
  )
}
