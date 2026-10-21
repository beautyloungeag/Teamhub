import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useApp, type Poll, type PollQ, type PollValue } from './store'
import { supabase } from './lib/supabase'
import { toast } from './Toast'
import { locale } from './lib/i18n'

// Umfragen an News (Wunsch Renée 25.09.): Auswahl, Mehrfachauswahl, Skala 1–5, Freitext.
// Ergebnisse über poll_results(): Leitung mit Namen (ausser anonym), alle anderen nach eigener Antwort und nur wenn freigegeben.

export type PollAnswer = { value: PollValue; name: string | null; branch: string | null }
export type PollResult = { respondents: number; who: string[] | null; questions: (PollQ & { answers: PollAnswer[] })[] }

export async function loadPollResults(pollId: string): Promise<PollResult | null> {
  const { data, error } = await supabase!.rpc('poll_results', { p_poll: pollId })
  return error ? null : data as PollResult
}

export function usePollResults(pollId: string | null, enabled = true) {
  const [r, setR] = useState<PollResult | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { if (!pollId || !enabled) { setR(null); return } let alive = true; loadPollResults(pollId).then(x => { if (alive) setR(x) }); return () => { alive = false } }, [pollId, enabled, tick])
  return [r, () => setTick(x => x + 1)] as const
}

/** Ergebnis je Frage: Balken für Auswahl/Skala, Liste für Freitext. */
export function PollResults({ data, names = false, tone = 'white' }: { data: PollResult; names?: boolean; tone?: 'white' | 'stone' }) {
  const { t } = useApp()
  return <div className="space-y-5">{data.questions.map(q => {
    const n = q.answers.length
    if (q.kind === 'text') return <div key={q.id}><p className="text-[15.5px] font-medium">{q.prompt}</p>
      {n === 0 ? <p className="text-[14.5px] text-mute mt-1">{t('Noch keine Antworten.')}</p>
        : <ul className="mt-2 space-y-1.5">{q.answers.filter(a => String(a.value).trim()).map((a, i) => <li key={i} className={`rounded-[10px] px-3 py-2 text-[15px] ${tone === 'white' ? 'bg-sage-50' : 'bg-white'}`}>{String(a.value)}{names && a.name && <span className="block text-[13px] text-mute mt-0.5">{a.name}</span>}</li>)}</ul>}</div>
    const opts = q.kind === 'scale' ? ['1', '2', '3', '4', '5'] : q.options
    const counts = opts.map((_, i) => q.answers.filter(a => Array.isArray(a.value) ? a.value.includes(i) : Number(a.value) === (q.kind === 'scale' ? i + 1 : i)).length)
    const avg = q.kind === 'scale' && n ? (q.answers.reduce((s, a) => s + Number(a.value), 0) / n).toFixed(1) : null
    const max = Math.max(1, ...counts)
    return <div key={q.id}>
      <div className="flex items-baseline justify-between gap-3"><p className="text-[15.5px] font-medium">{q.prompt}</p>{avg && <span className="text-[14.5px] text-mute shrink-0">Ø {avg}</span>}</div>
      <div className="mt-2 space-y-1.5">{opts.map((o, i) => {
        const who = names ? q.answers.filter(a => Array.isArray(a.value) ? a.value.includes(i) : Number(a.value) === (q.kind === 'scale' ? i + 1 : i)).map(a => a.name).filter(Boolean) : []
        return <div key={i}>
          <div className="flex items-center gap-3 text-[14.5px]"><span className="w-28 shrink-0 truncate">{q.kind === 'scale' ? `${o}${i === 0 && q.options[0] ? ` · ${q.options[0]}` : i === 4 && q.options[1] ? ` · ${q.options[1]}` : ''}` : o}</span>
            <span className="flex-1 h-2 rounded-full bg-line overflow-hidden"><span className="block h-full rounded-full bg-olive-700" style={{ width: `${counts[i] / max * 100}%` }} /></span>
            <span className="w-14 text-right tabular-nums text-mute">{counts[i]}{n ? ` · ${Math.round(counts[i] / n * 100)}%` : ''}</span></div>
          {who.length > 0 && <p className="text-[12.5px] text-mute ml-[124px] mt-0.5 truncate">{who.join(', ')}</p>}
        </div> })}</div>
    </div>
  })}</div>
}

/** Ausfüllen in der App (unter der News). */
export function PollForm({ poll }: { poll: Poll }) {
  const { pollAnswers, submitPoll, t } = useApp()
  const answered = poll.questions.some(q => pollAnswers.has(q.id))
  const closed = poll.closesAt ? new Date(poll.closesAt) < new Date() : false
  const [edit, setEdit] = useState(!answered && !closed)
  const init = () => Object.fromEntries(poll.questions.map(q => [q.id, pollAnswers.get(q.id) ?? (q.kind === 'multi' ? [] : q.kind === 'text' ? '' : -1)])) as Record<string, PollValue>
  const [v, setV] = useState<Record<string, PollValue>>(init)
  const [busy, setBusy] = useState(false)
  const [res, refresh] = usePollResults(poll.id, answered && poll.showResults)
  const ready = poll.questions.every(q => q.kind === 'text' || (q.kind === 'multi' ? (v[q.id] as number[]).length > 0 : Number(v[q.id]) >= (q.kind === 'scale' ? 1 : 0)))
  const send = async () => {
    setBusy(true)
    const ok = await submitPoll(poll.id, v)
    setBusy(false)
    if (ok) { toast(t('Danke, deine Antwort ist gespeichert')); setEdit(false); refresh() } else toast(t('Das hat nicht geklappt'), 'error')
  }
  const box = (on: boolean, round: boolean) => <span className={`w-5 h-5 shrink-0 flex items-center justify-center ${round ? 'rounded-full' : 'rounded-[6px]'} ${on ? 'bg-olive-700 text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92]'}`}>{on && <Check size={12} strokeWidth={3} />}</span>
  return (
    <section className="mt-8 rounded-[16px] bg-white p-4">
      <p className="rubric text-brass">{t('Umfrage')}</p>
      <p className="text-[14px] text-mute mt-1">{poll.anonymous ? t('Anonym: niemand sieht, wer was geantwortet hat.') : t('Die Leitung sieht deine Antwort mit Namen.')}
        {poll.closesAt && ` · ${closed ? t('beendet') : t('offen bis {d}', { d: new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(poll.closesAt)) })}`}</p>
      {edit ? <div className="mt-4 space-y-5">
        {poll.questions.map(q => <div key={q.id}>
          <p className="text-[17px] font-medium">{q.prompt}</p>
          {q.kind === 'text' && <textarea value={String(v[q.id] ?? '')} onChange={e => setV({ ...v, [q.id]: e.target.value })} rows={3} placeholder={t('Deine Antwort (optional)')} className="mt-2 w-full rounded-[12px] bg-sage-50 p-3 text-[17px] outline-none resize-none" />}
          {q.kind === 'scale' && <div className="mt-2"><div className="grid grid-cols-5 gap-1.5">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setV({ ...v, [q.id]: n })} className={`h-11 rounded-[10px] text-[17px] tabular-nums transition ${Number(v[q.id]) === n ? 'bg-olive-700 text-white' : 'bg-sage-50'}`}>{n}</button>)}</div>
            {(q.options[0] || q.options[1]) && <div className="mt-1 flex justify-between text-[12.5px] text-mute"><span>{q.options[0]}</span><span>{q.options[1]}</span></div>}</div>}
          {(q.kind === 'single' || q.kind === 'multi') && <div className="mt-2 divide-y divide-sage-50">{q.options.map((o, i) => {
            const on = q.kind === 'multi' ? (v[q.id] as number[]).includes(i) : Number(v[q.id]) === i
            return <button key={i} onClick={() => setV({ ...v, [q.id]: q.kind === 'multi' ? (on ? (v[q.id] as number[]).filter(x => x !== i) : [...(v[q.id] as number[]), i]) : i })} className="w-full flex items-center gap-3 py-2.5 text-left text-[17px]">{box(on, q.kind === 'single')}{o}</button> })}</div>}
        </div>)}
        <button disabled={!ready || busy} onClick={send} className="w-full h-12 rounded-[10px] bg-olive-700 text-white text-[17px] font-medium disabled:opacity-40">{busy ? t('Sendet …') : t('Antwort abschicken')}</button>
      </div> : <div className="mt-4">
        {answered ? <p className="text-[15.5px] flex items-center gap-2"><Check size={16} className="text-ok" />{t('Du hast teilgenommen.')}{!closed && <button onClick={() => { setV(init()); setEdit(true) }} className="text-olive-700 ml-auto text-[14.5px]">{t('Antwort ändern')}</button>}</p>
          : <p className="text-[15.5px] text-mute">{t('Die Umfrage ist beendet.')}</p>}
        {answered && poll.showResults && res && <div className="mt-5"><p className="text-[14px] text-mute mb-3">{res.respondents === 1 ? t('Eine Person hat teilgenommen') : t('{n} haben teilgenommen', { n: res.respondents })}</p><PollResults data={res} /></div>}
      </div>}
    </section>
  )
}
