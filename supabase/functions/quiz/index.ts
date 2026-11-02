// Quiz auswerten (ersetzt submit_quiz im Browser, weil Freitext-Antworten eine KI brauchen).
// Auswahlfragen prüft der Code, Freitext bewertet das Sprachmodell gegen das Lernziel (rubric). action 'try': Probeantwort im Backoffice.
// Die Lösungen verlassen den Server nie; zurück gehen nur richtig/falsch und bei Freitext ein Satz Rückmeldung.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { aiJson } from '../_shared/openai.ts'

// Persistence contract: pilot-quiz-atomic-v1 (migration 20261025230806).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Bewertung von Freitext: das Lernziel (rubric) sagt, was die Person verstanden haben soll
const GRADER = [
  'Du bewertest Antworten von Mitarbeiterinnen eines Kosmetikstudios in einem internen Lern-Quiz.',
  'Je Frage gibt es ein Lernziel (vorgabe) der Leitung: was die Person verstanden haben soll und worauf es ankommt.',
  'Bewerte, ob die Antwort zeigt, dass das im Kern verstanden wurde. Nur der Inhalt zählt, nicht Rechtschreibung oder Stil.',
  'Richtig ist eine Antwort, wenn sie das Wesentliche des Lernziels trifft, auch mit eigenen Worten. Falsch ist sie, wenn ein im Lernziel als wichtig genannter Punkt fehlt oder falsch ist, oder wenn sie leer oder ausweichend ist.',
  'Die Rückmeldung ist ein kurzer, freundlicher Satz in der Sprache der Antwort. Bei falschen Antworten sag, was fehlt, ohne die Musterlösung wörtlich zu verraten.',
  'Gib nur JSON zurück: {"results":[{"id":string,"correct":boolean,"feedback":string}]}',
].join('\n')

// Fragenpool (29.10., Matteo): je Durchgang N zufällige Fragen in zufälliger Reihenfolge, die Antworten jeder Frage gemischt.
// Die Ziehung liegt in quiz_draws; der Browser kennt nur die gemischten Positionen, die Rückübersetzung macht der Server.
const shuffle = <T,>(xs: T[]): T[] => {
  const a = [...xs], r = new Uint32Array(a.length); crypto.getRandomValues(r)
  for (let i = a.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
type QRow = { id: string; sort: number; kind: string; prompt: string; options: string[]; i18n?: Record<string, { prompt?: string; options?: string[] }> | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await user.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const body = await req.json().catch(() => ({}))
  // Ausprobieren im Backoffice: eine Beispielantwort gegen das Lernziel bewerten, ohne etwas zu speichern
  if (body.action === 'try') {
    if (me.app_role !== 'buero' && me.app_role !== 'filialleitung') return json({ ok: false, error: 'forbidden' }, 403)
    try {
      const out = await aiJson<{ results: { id: string; correct: boolean; feedback: string }[] }>(GRADER,
        JSON.stringify([{ id: 'x', frage: String(body.prompt ?? '').slice(0, 500), vorgabe: String(body.rubric ?? '').slice(0, 2000), antwort: String(body.answer ?? '').slice(0, 2000) }]))
      const r = out.results?.[0]
      return json({ ok: true, correct: !!r?.correct, feedback: String(r?.feedback ?? '').slice(0, 400) })
    } catch { return json({ ok: false, error: 'ai_unavailable' }, 503) }
  }
  const quizId = String(body.quiz_id ?? ''), answers = (body.answers ?? {}) as Record<string, number[] | string>
  if (body.action === 'draw') {
    // Sichtbarkeit prüft die Datenbank mit den Rechten der Person; quiz_for_me liefert die Fragen ohne Lösungen
    const { data: visible, error: vis } = await user.rpc('quiz_for_me', { p_quiz: quizId })
    if (vis) return json({ ok: false, error: 'not_visible' }, 403)
    const pool = (visible ?? []) as QRow[]
    if (!pool.length) return json({ ok: false, error: 'no_questions' }, 400)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: qz } = await admin.from('quizzes').select('draw_count').eq('id', quizId).single()
    const n = qz?.draw_count && qz.draw_count < pool.length ? qz.draw_count : pool.length
    const picked = shuffle(pool).slice(0, n)
    const orders: Record<string, number[]> = {}
    for (const q of picked) if (q.kind !== 'text') orders[q.id] = shuffle(q.options.map((_, i) => i))
    const { data: draw, error: de } = await admin.from('quiz_draws').insert({ quiz_id: quizId, employee_id: me.id, question_ids: picked.map((q) => q.id), option_orders: orders }).select('id').single()
    if (de || !draw) return json({ ok: false, error: 'draw_failed' }, 503)
    const perm = (xs: string[] | undefined, o: number[] | undefined) => !xs || !o || xs.length !== o.length ? xs : o.map((i) => xs[i])
    return json({ ok: true, draw_id: draw.id, questions: picked.map((q) => ({
      id: q.id, sort: q.sort, kind: q.kind, prompt: q.prompt, options: perm(q.options, orders[q.id]) ?? q.options,
      i18n: q.i18n ? Object.fromEntries(Object.entries(q.i18n).map(([l, x]) => [l, { ...x, options: perm(x?.options, orders[q.id]) }])) : null,
    })) })
  }
  // Sichtbarkeit prüft die Datenbank mit den Rechten der Person
  const { error: vis } = await user.rpc('quiz_for_me', { p_quiz: quizId })
  if (vis) return json({ ok: false, error: 'not_visible' }, 403)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // Gezogene Fragen: nur diese werten, gemischte Antwortpositionen zurück auf die gespeicherten
  const drawId = body.draw_id ? String(body.draw_id) : null
  const { data: draw } = drawId ? await admin.from('quiz_draws').select('question_ids, option_orders').eq('id', drawId).eq('quiz_id', quizId).eq('employee_id', me.id).is('used_at', null).maybeSingle() : { data: null }
  if (drawId && !draw) return json({ ok: false, error: 'draw_invalid' }, 409)
  const [{ data: quiz }, { data: qs }] = await Promise.all([
    admin.from('quizzes').select('pass_pct, news_id, article_id').eq('id', quizId).single(),
    admin.from('quiz_questions').select('id, kind, prompt, options, correct, rubric').eq('quiz_id', quizId).order('sort'),
  ])
  if (!quiz || !qs?.length) return json({ ok: false, error: 'no_questions' }, 400)
  const asked = draw ? qs.filter((q) => (draw.question_ids as string[]).includes(q.id)) : qs
  const orders = (draw?.option_orders ?? {}) as Record<string, number[]>
  const stored: Record<string, number[] | string> = {}
  for (const q of asked) {
    const a = answers[q.id]
    stored[q.id] = q.kind === 'text' ? String(a ?? '') : (Array.isArray(a) ? a : []).map(Number).map((i) => orders[q.id]?.[i] ?? i)
  }

  const results: Record<string, boolean> = {}, feedback: Record<string, string> = {}
  for (const q of asked.filter((x) => x.kind !== 'text')) {
    const given = [...new Set(stored[q.id] as number[])].sort()
    const want = [...(q.correct ?? [])].sort()
    results[q.id] = given.length === want.length && given.every((v, i) => v === want[i])
  }
  const texts = asked.filter((x) => x.kind === 'text')
  if (texts.length) {
    try {
      const out = await aiJson<{ results: { id: string; correct: boolean; feedback: string }[] }>(
        GRADER,
        JSON.stringify(texts.map((q) => ({ id: q.id, frage: q.prompt, vorgabe: q.rubric, antwort: String(answers[q.id] ?? '').slice(0, 2000) }))),
      )
      for (const q of texts) { const r = out.results?.find((x) => x.id === q.id); results[q.id] = !!r?.correct; if (r?.feedback) feedback[q.id] = String(r.feedback).slice(0, 400) }
    } catch {
      return json({ ok: false, error: 'ai_unavailable' }, 503)
    }
  }
  // Commit the attempt and read markers together. The RPC rechecks active
  // authorization and rejects quiz edits made while grading was in flight.
  const questionSnapshot = Object.fromEntries(qs.map(({ id, ...question }) => [id, question]))
  const { data: saved, error: saveError } = await Promise.resolve(admin.rpc('record_quiz_attempt', {
    p_employee: me.id, p_quiz: quizId, p_answers: stored, p_results: results,
    p_quiz_snapshot: quiz, p_question_snapshot: questionSnapshot, ...(drawId ? { p_draw: drawId } : {}),
  })).catch(() => ({ data: null, error: { code: 'transport_error' } }))
  if (saveError || !saved?.ok) {
    const code = saveError?.code
    return json({ ok: false, error: code === '42501' ? 'not_visible' : code === '40001' ? 'quiz_changed' : code === '22023' ? 'draw_invalid' : 'save_failed' }, code === '42501' ? 403 : code === '40001' || code === '22023' ? 409 : 503)
  }
  return json({ ...saved, feedback })
})
