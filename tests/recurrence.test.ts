import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dueOn, weekdaysOf } from '../src/lib/recurrence.ts'

test('Kopie für die Functions ist identisch', () => {
  assert.equal(readFileSync(new URL('../supabase/functions/_shared/recurrence.ts', import.meta.url), 'utf8'), readFileSync(new URL('../src/lib/recurrence.ts', import.meta.url), 'utf8'))
})

test('zweimal wöchentlich: Montag und Donnerstag', () => {
  const r = { repeat: 'weekly', weekday: 1, weekdays: [4, 1] }
  // 16.11.2026 ist ein Montag
  assert.deepEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map(d => dueOn(r, d)), [true, false, false, true, false])
  assert.deepEqual(weekdaysOf(r), [1, 4])
})

test('alte Wochenliste ohne weekdays gilt weiter am einen Wochentag', () => {
  assert.equal(dueOn({ repeat: 'weekly', weekday: 3, weekdays: null }, '2026-11-18'), true)
  assert.equal(dueOn({ repeat: 'weekly', weekday: 3, weekdays: null }, '2026-11-19'), false)
})

test('alle 2 Tage ab Starttag, auch über die Zeitumstellung', () => {
  const r = { repeat: 'interval', everyDays: 2, startDay: '2026-10-23' }
  assert.equal(dueOn(r, '2026-10-22'), false)
  assert.equal(dueOn(r, '2026-10-23'), true)
  assert.equal(dueOn(r, '2026-10-24'), false)
  assert.equal(dueOn(r, '2026-10-25'), true) // Zeitumstellung
  assert.equal(dueOn(r, '2026-10-27'), true)
  assert.equal(dueOn({ repeat: 'interval', everyDays: 3, startDay: '2026-11-16' }, '2026-11-22'), true)
})

test('täglich und monatlich unverändert', () => {
  assert.equal(dueOn({ repeat: 'daily' }, '2026-11-17'), true)
  assert.equal(dueOn({ repeat: 'monthly', monthday: 31 }, '2026-11-30'), true)
  assert.equal(dueOn({ repeat: 'monthly', monthday: 31 }, '2026-11-29'), false)
})
