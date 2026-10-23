import test from 'node:test'
import assert from 'node:assert/strict'
import { wikiProgress } from '../src/lib/wiki-progress.ts'

test('adding a quiz invalidates the displayed legacy read state until this employee passes', () => {
  const rows = [{ article_id: 'a', kind: 'gelesen' }, { article_id: 'a', kind: 'durchgang' }]
  assert.equal(wikiProgress(rows, [], [], 'me').read.has('a'), true)
  const quizzes = [{ id: 'q', articleId: 'a' }]
  for (const attempts of [[], [{ quizId: 'q', employeeId: 'other', passed: true }], [{ quizId: 'q', employeeId: 'me', passed: false }]]) {
    const p = wikiProgress(rows, quizzes, attempts, 'me')
    assert.equal(p.read.has('a'), false)
    assert.equal(p.runs.get('a'), 1)
  }
  assert.equal(wikiProgress(rows, quizzes, [{ quizId: 'q', employeeId: 'me', passed: true }], 'me').read.has('a'), true)
})

test('changing the quiz association requires passing the new quiz; untested articles retain completion', () => {
  const rows = [{ article_id: 'a', kind: 'gelesen' }, { article_id: 'b', kind: 'durchgang' }]
  const p = wikiProgress(rows, [{ id: 'new', articleId: 'a' }], [{ quizId: 'old', employeeId: 'me', passed: true }], 'me')
  assert.deepEqual([...p.read], ['b'])
})
