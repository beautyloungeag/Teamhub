import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

type Outcome = { data: any; error: any }
const success = (data: any): Outcome => ({ data, error: null })
function rig({ outcome = success({ ok: true, score_pct: 50, passed: false, total: 2, correct: 1, results: { choice: true, text: false } }), throwSave = false, throwAI = false, text = false } = {}) {
  let handler!: (req: Request) => Promise<Response>
  const calls: { name: string; args: any }[] = [], tables: string[] = []
  const quiz = { pass_pct: 100, article_id: 'article', news_id: null }
  const questions = [
    { id: 'choice', kind: 'single', prompt: 'Choose', options: ['Yes', 'No'], correct: [0], rubric: '' },
    ...(text ? [{ id: 'text', kind: 'text', prompt: 'Explain', options: [], correct: [], rubric: 'Understand the procedure' }] : []),
  ]
  const chain = (value: Outcome) => { const q: any = { then: (yes: any, no: any) => Promise.resolve(value).then(yes, no) }; for (const name of ['select', 'eq', 'single', 'order']) q[name] = () => q; return q }
  const user = { rpc: (name: string) => Promise.resolve(success(name === 'current_employee' ? { id: 'employee', app_role: 'mitarbeiterin' } : [])) }
  const admin = {
    from: (table: string) => { tables.push(table); return chain(success(table === 'quizzes' ? quiz : questions)) },
    rpc: async (name: string, args: any) => { calls.push({ name, args }); if (throwSave) throw new Error('lost transport'); return outcome },
  }
  const Deno = { env: { get: (key: string) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : 'anon' }, serve: (fn: typeof handler) => { handler = fn } }
  const source = fs.readFileSync(new URL('../supabase/functions/quiz/index.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  new Function('createClient', 'aiJson', 'Deno', js)((_url: string, key: string) => key === 'service' ? admin : user, async () => { if (throwAI) throw new Error('grader unavailable'); return { results: [{ id: 'text', correct: true, feedback: 'Understood' }] } }, Deno)
  const send = () => handler(new Request('https://qa.invalid/quiz', { method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' }, body: JSON.stringify({ quiz_id: 'quiz', answers: { choice: [0], text: 'Synthetic answer' } }) }))
  return { calls, tables, quiz, questions, send }
}

test('quiz returns only the canonical persisted grade, never a local optimistic score', async () => {
  const r = rig({ text: true }); const response = await r.send(); const data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.score_pct, 50); assert.equal(data.passed, false)
  assert.equal(r.calls.length, 1); assert.equal(r.calls[0].name, 'record_quiz_attempt')
  assert.deepEqual(r.calls[0].args.p_quiz_snapshot, r.quiz)
  assert.deepEqual(r.calls[0].args.p_question_snapshot, Object.fromEntries(r.questions.map(({ id, ...q }) => [id, q])))
  assert.deepEqual(r.calls[0].args.p_results, { choice: true, text: true })
  assert.deepEqual(r.tables, ['quizzes', 'quiz_questions'], 'all writes belong to one SQL transaction')
})
for (const [name, code, status, error] of [
  ['persistence failure', '23514', 503, 'save_failed'],
  ['quiz edited during grading', '40001', 409, 'quiz_changed'],
  ['access revoked during grading', '42501', 403, 'not_visible'],
] as const) test(`quiz rejects ${name} instead of reporting success`, async () => {
  const r = rig({ outcome: { data: null, error: { code } } }); const response = await r.send()
  assert.equal(response.status, status); assert.deepEqual(await response.json(), { ok: false, error })
})
test('quiz treats missing persistence acknowledgement and thrown transport as failure', async () => {
  for (const options of [{ outcome: success(null) }, { throwSave: true }]) {
    const r = rig(options); const response = await r.send()
    assert.equal(response.status, 503); assert.equal((await response.json()).ok, false)
  }
})
test('unavailable free-text grading cannot create any result or completion', async () => {
  const r = rig({ text: true, throwAI: true }); const response = await r.send()
  assert.equal(response.status, 503); assert.equal((await response.json()).error, 'ai_unavailable'); assert.equal(r.calls.length, 0)
})
