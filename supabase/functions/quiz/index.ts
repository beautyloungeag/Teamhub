// Quiz auswerten (ersetzt submit_quiz im Browser, weil Freitext-Antworten eine KI brauchen).
// Auswahlfragen prüft der Code, Freitext bewertet das Sprachmodell gegen die Vorgabe (rubric).
// Die Lösungen verlassen den Server nie; zurück gehen nur richtig/falsch und bei Freitext ein Satz Rückmeldung.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { aiJson } from '../_shared/openai.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await user.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const body = await req.json().catch(() => ({}))
  const quizId = String(body.quiz_id ?? ''), answers = (body.answers ?? {}) as Record<string, number[] | string>
  // Sichtbarkeit prüft die Datenbank mit den Rechten der Person
  const { error: vis } = await user.rpc('quiz_for_me', { p_quiz: quizId })
  if (vis) return json({ ok: false, error: 'not_visible' }, 403)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const [{ data: quiz }, { data: qs }] = await Promise.all([
    admin.from('quizzes').select('pass_pct, news_id').eq('id', quizId).single(),
    admin.from('quiz_questions').select('id, kind, prompt, options, correct, rubric').eq('quiz_id', quizId).order('sort'),
  ])
  if (!quiz || !qs?.length) return json({ ok: false, error: 'no_questions' }, 400)

  const results: Record<string, boolean> = {}, feedback: Record<string, string> = {}
  for (const q of qs.filter((x) => x.kind !== 'text')) {
    const given = [...new Set((Array.isArray(answers[q.id]) ? answers[q.id] as number[] : []).map(Number))].sort()
    const want = [...(q.correct ?? [])].sort()
    results[q.id] = given.length === want.length && given.every((v, i) => v === want[i])
  }
  const texts = qs.filter((x) => x.kind === 'text')
  if (texts.length) {
    try {
      const out = await aiJson<{ results: { id: string; correct: boolean; feedback: string }[] }>(
        [
          'Du bewertest Antworten von Mitarbeiterinnen eines Kosmetikstudios in einem internen Lern-Quiz.',
          'Je Frage gibt es eine Vorgabe, woran eine richtige Antwort zu erkennen ist. Bewerte nur den Inhalt, nicht Rechtschreibung oder Stil.',
          'Eine Antwort ist richtig, wenn sie das Wesentliche der Vorgabe trifft, auch mit eigenen Worten. Leere oder ausweichende Antworten sind falsch.',
          'Die Rückmeldung ist ein kurzer, freundlicher Satz in der Sprache der Antwort. Bei falschen Antworten sag, was fehlt, ohne die Musterlösung wörtlich zu verraten.',
          'Gib nur JSON zurück: {"results":[{"id":string,"correct":boolean,"feedback":string}]}',
        ].join('\n'),
        JSON.stringify(texts.map((q) => ({ id: q.id, frage: q.prompt, vorgabe: q.rubric, antwort: String(answers[q.id] ?? '').slice(0, 2000) }))),
      )
      for (const q of texts) { const r = out.results?.find((x) => x.id === q.id); results[q.id] = !!r?.correct; if (r?.feedback) feedback[q.id] = String(r.feedback).slice(0, 400) }
    } catch {
      return json({ ok: false, error: 'ai_unavailable' }, 503)
    }
  }
  const total = qs.length, ok = Object.values(results).filter(Boolean).length
  const pct = Math.round(ok * 100 / total), passed = pct >= quiz.pass_pct
  await admin.from('quiz_attempts').insert({ quiz_id: quizId, employee_id: me.id, score_pct: pct, passed, answers, results })
  if (passed && quiz.news_id) {
    await admin.from('news_reads').upsert({ news_id: quiz.news_id, employee_id: me.id, confirmed_at: new Date().toISOString() }, { onConflict: 'news_id,employee_id', ignoreDuplicates: false })
  }
  return json({ ok: true, score_pct: pct, passed, pass_pct: quiz.pass_pct, correct: ok, total, results, feedback })
})
