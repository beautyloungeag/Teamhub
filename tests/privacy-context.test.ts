import test from 'node:test'
import assert from 'node:assert/strict'
import { appendToolRound, contextPathAllowed, privateRequest, readContext, saveContext } from '../supabase/functions/assistant/privacy-context.ts'

test('stateless tool rounds preserve reasoning, attachments and tool results', () => {
  const file = { role: 'user', content: [{ type: 'input_file', file_data: 'data:application/pdf;base64,QA' }] }
  const reasoning = { type: 'reasoning', encrypted_content: 'encrypted-test' }
  const call = { type: 'function_call', call_id: 'call_1', name: 'read_article', arguments: '{}' }
  const result = { type: 'function_call_output', call_id: 'call_1', output: 'QA article' }
  const input = appendToolRound([file], [reasoning, call], [result])
  const restored = readContext(JSON.parse(saveContext(null, 'model', 'owner', input)), 'model', 'owner')
  assert.deepEqual(restored?.turns[0], [file, reasoning, call, result])
  assert.equal(readContext(restored, 'model', 'other-role'), null)
  assert.equal(readContext(restored, 'other-model', 'owner'), null)
})

test('cannot opt back into provider storage or reuse a hosted conversation', () => {
  assert.deepEqual(privateRequest({ model: 'm', store: true, previous_response_id: 'old', conversation: 'c' }), { model: 'm', store: false })
})

test('private file reference must belong to this employee and this chat', () => {
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
  assert.equal(contextPathAllowed(`${a}/${b}/${a}.json`, a, b), true)
  assert.equal(contextPathAllowed(`${b}/${a}/${a}.json`, a, b), false)
  assert.equal(contextPathAllowed(`${a}/${b}/../${a}.json`, a, b), false)
})

test('bounded state prunes complete old turns, never an orphan tool result', () => {
  let c = null
  for (let i = 0; i < 15; i++) c = readContext(JSON.parse(saveContext(c, 'm', 's', [{ role: 'user', content: `turn ${i}` }])), 'm', 's')
  assert.equal(c?.turns.length, 12)
  assert.equal(c?.turns[0][0].content, 'turn 3')
})
