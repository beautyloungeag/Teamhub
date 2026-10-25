import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { adminCanSeePerson, adminEventAudience, adminEventReport, adminLearnPeople, adminNewsAudience, adminPickerPeople, eventParticipantCsv, isTestAccount } from '../src/lib/admin-audience.ts'
import type { Staff, News } from '../src/store.tsx'

// Use the actual established matcher from store, without loading its React/API
// runtime. No replacement matcher or copied group regex is used in these tests.
const source = ts.createSourceFile('store.tsx', readFileSync(new URL('../src/store.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const matching = source.statements.filter(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ['jobGroups', 'inNewsAudience'].includes(d.name.getText(source)))).map(n => n.getText(source)).join('\n')
const code = ts.transpileModule(matching, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} as { inNewsAudience: (s: Staff, n: Pick<News, 'audienceBranches' | 'audienceGroups' | 'audienceSkills' | 'audiencePeople'>) => boolean } }
new Function('exports', code)(module.exports)
const matchNews = module.exports.inNewsAudience
const s = (id: string, patch: Partial<Staff> = {}) => ({ id, first: id, last: 'Test', active: true, email: `${id}@example.invalid`, app_role: 'mitarbeiterin', branch_id: 'b1', branch: 'Test Studio', extra: [], skills: ['skill-a'], role: 'Kosmetikerin', ...patch } as Staff)
const office = s('office', { app_role: 'buero', branch_id: 'buero', role: 'Büro' })
const lead = s('lead', { app_role: 'filialleitung' })
const staff = [s('one'), s('two', { role: 'Lernende' }), s('wrong-skill', { skills: ['skill-b'] }), s('outside', { branch_id: 'b2' }), s('shared', { branch_id: 'b2', extra: ['b1'] }), s('test', { email: 'synthetic@aleksa.ai' }), s('inactive-test', { email: 'inactive@aleksa.ai', active: false }), office]
const news = { audiencePeople: [] as string[], audienceBranches: [] as string[], audienceGroups: [] as string[], audienceSkills: [] as string[] }
const ev = { id: 'event', audiencePeople: [] as string[], audienceBranches: [] as string[], audienceSkills: [] as string[] }
const ids = (rows: Staff[]) => rows.map(s => s.id)

test('broad News statistics exclude tests and office by default; explicit active recipients override group/skill criteria consistently', () => {
  assert.deepEqual(ids(adminNewsAudience(staff, office, news, matchNews)), ['one', 'two', 'wrong-skill', 'outside', 'shared'])
  const targeted = { ...news, audiencePeople: ['test', 'one', 'inactive-test'], audienceBranches: ['unrelated'], audienceSkills: ['missing'], audienceGroups: ['Büro'] }
  assert.deepEqual(ids(adminNewsAudience(staff, office, targeted, matchNews)), ['one', 'test'])
  const reads = new Set(['one', 'test'])
  const audience = adminNewsAudience(staff, office, targeted, matchNews)
  assert.equal(audience.filter(s => reads.has(s.id)).length, 2)
  assert.equal(audience.length, 2, 'explicit test recipients must never become a 0/0 report')
  assert.deepEqual(ids(adminNewsAudience(staff, office, { ...news, audienceGroups: ['Büro'] }, matchNews)), ['office'])
})

test('News branch/group/skill intersection applies equally to count and CSV input; explicit recipients never widen lead scope', () => {
  const constrained = { ...news, audienceBranches: ['b1'], audienceGroups: ['Kosmetikerinnen'], audienceSkills: ['skill-a'] }
  assert.deepEqual(ids(adminNewsAudience(staff, lead, constrained, matchNews)), ['one', 'shared'])
  assert.deepEqual(ids(adminNewsAudience(staff, lead, { ...news, audiencePeople: ['outside', 'one', 'test'] }, matchNews)), ['one', 'test'])
  assert.equal(adminCanSeePerson(lead, staff.find(s => s.id === 'outside')!), false)
})

test('event person selection is ANDed with branch/skills, unlike News override; test pickers retain active scoped tests', () => {
  const constrained = { ...ev, audiencePeople: ['test', 'one', 'two', 'outside', 'inactive-test'], audienceBranches: ['b1'], audienceSkills: ['skill-a'] }
  assert.deepEqual(ids(adminEventAudience(staff, lead, constrained)), ['one', 'two', 'test'])
  assert.deepEqual(ids(adminEventAudience(staff, lead, { ...constrained, audienceSkills: ['missing'] })), [])
  assert.ok(adminPickerPeople(staff, lead).some(s => s.id === 'test'))
  assert.ok(!adminPickerPeople(staff, lead).some(s => s.id === 'inactive-test' || s.id === 'outside'))
  assert.equal(isTestAccount(s('case', { email: 'SYNTHETIC@ALEKSA.AI' })), true)
})

test('existing authorised participants survive audience changes and stay in shared UI/CSV rows without leaking another studio', () => {
  const registrations = [
    { event_id: 'event', employee_id: 'one', coming: true, waitlist: false },
    { event_id: 'event', employee_id: 'test', coming: true, waitlist: false },
    { event_id: 'event', employee_id: 'outside', coming: true, waitlist: false },
    { event_id: 'event', employee_id: 'wrong-skill', coming: false, waitlist: false },
  ]
  const report = adminEventReport(staff, lead, { ...ev, audiencePeople: ['two'] }, registrations)
  assert.deepEqual(new Set(report.people.map(p => p.s.id)), new Set(['one', 'test', 'wrong-skill', 'two']))
  assert.equal(report.yes, 1); assert.equal(report.no, 1); assert.equal(report.open, 1); assert.equal(report.excludedTests, 1)
  const csv = eventParticipantCsv(report.people)
  assert.equal(csv.length, report.people.length); assert.ok(csv.some(r => r.Name === 'test Test' && r.Testkonto === 'ja'))
  assert.ok(!csv.some(r => r.Name === 'outside Test'))
  const explicit = adminEventReport(staff, lead, { ...ev, audiencePeople: ['one', 'test'] }, registrations)
  assert.equal(explicit.yes, 2); assert.equal(explicit.excludedTests, 0); assert.equal(explicit.open, 0)
})

test('waitlist positions use response order, and inactive real participants remain in historical rows', () => {
  const historical = s('past', { active: false })
  const registrations = [
    { event_id: 'event', employee_id: 'past', coming: true, waitlist: true, created_at: '2026-01-01T10:02:00Z' },
    { event_id: 'event', employee_id: 'one', coming: true, waitlist: true, created_at: '2026-01-01T10:01:00Z' },
  ]
  const report = adminEventReport([...staff, historical], lead, ev, registrations)
  assert.equal(report.people.find(p => p.s.id === 'one')?.pos, 1)
  assert.equal(report.people.find(p => p.s.id === 'past')?.pos, 2)
  assert.equal(report.wait, 2)
})

test('Learn opt-in is local and off by default, never permits inactive or out-of-scope tests', () => {
  assert.ok(!adminLearnPeople(staff, lead).some(s => isTestAccount(s)))
  assert.ok(adminLearnPeople(staff, lead, '', true).some(s => s.id === 'test'))
  assert.ok(!adminLearnPeople(staff, lead, '', true).some(s => s.id === 'inactive-test' || s.id === 'outside'))
  assert.deepEqual(ids(adminLearnPeople(staff, lead, 'b2', true)), ['shared'])
})
