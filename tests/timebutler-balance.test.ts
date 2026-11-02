import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, balanceColumn, minutesOf, parseBalances, usersByEmail } from '../supabase/functions/timebutler/balance.ts'

test('csv with semicolons, quotes, BOM and CRLF', () => {
  assert.deepEqual(parseCsv('﻿a;"b;c";"d ""x"""\r\n1;2;3\r\n\r\n'), [['a', 'b;c', 'd "x"'], ['1', '2', '3']])
})

test('balance column is the final "as of" column, not the period balance', () => {
  // Spalten laut Timebutler-Hilfe „Overtime balance as of the cut-off date“
  const en = ['User ID', 'User', 'Planned working time', 'Effective working time', 'Balance', 'Working time balance from last year', 'Paid out overtime', 'Overtime balance as of 02.11.2026']
  assert.equal(balanceColumn(en), 7)
  const de = ['User ID', 'Nutzer', 'Soll-Arbeitszeit', 'Saldo', 'Saldo aus Vorjahr', 'Ausbezahlte Überstunden', 'Überstundenguthaben zum 02.11.2026']
  assert.equal(balanceColumn(de), 6)
  assert.equal(balanceColumn(['User ID', 'A', 'B']), 2)
})

test('minutes from minutes=true and from industrial hours', () => {
  assert.equal(minutesOf('450'), 450)
  assert.equal(minutesOf('-90'), -90)
  assert.equal(minutesOf('7.5 h'), 450)
  assert.equal(minutesOf('-1,25 h'), -75)
  assert.equal(minutesOf(''), null)
  assert.equal(minutesOf('n/a'), null)
})

test('balances per user with the whole row kept', () => {
  const csv = 'User ID;User;Balance;Overtime balance as of 02.11.2026\n101;Muster Anna;30;735\n102;Test Bea;-15;-120\n'
  const { header, rows } = parseBalances(csv)
  assert.equal(header.length, 4)
  assert.deepEqual(rows.map(r => [r.userid, r.minutes]), [['101', 735], ['102', -120]])
  assert.equal(rows[0].row['User'], 'Muster Anna')
})

test('users csv maps lower-case email to userid', () => {
  const csv = 'User ID;Last name;First name;Employee number;E-mail address;Phone\n101;Muster;Anna;;Anna.Muster@Beautylounge.ch;\n102;Test;Bea;7;;\n'
  const m = usersByEmail(csv)
  assert.equal(m.get('anna.muster@beautylounge.ch'), '101')
  assert.equal(m.size, 1)
})
