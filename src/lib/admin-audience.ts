import type { Staff, News, Ev } from '../store'

export type NewsAudience = Pick<News, 'audienceBranches' | 'audienceGroups' | 'audienceSkills' | 'audiencePeople'>
export type EventAudience = Pick<Ev, 'audienceBranches' | 'audienceSkills' | 'audiencePeople'>
export type Registration = { event_id: string; employee_id: string; coming: boolean; waitlist: boolean; created_at?: string }
export const isTestAccount = (s: Pick<Staff, 'email'>) => /@aleksa\.ai$/i.test(s.email)
export const staffInBranch = (s: Pick<Staff, 'branch_id' | 'extra'>, branch: string) => s.branch_id === branch || (s.extra ?? []).includes(branch)
export const adminCanSeePerson = (me: Pick<Staff, 'id' | 'app_role' | 'branch_id' | 'extra'>, s: Staff) =>
  me.app_role === 'buero' || (me.app_role === 'filialleitung' && [me.branch_id, ...(me.extra ?? [])].some(b => staffInBranch(s, b)))
const countedTarget = (s: Staff, selected: string[]) => s.active && (!isTestAccount(s) || selected.includes(s.id))

// Explicit test recipients are real recipients of this content, while broad
// production audiences retain their existing exclusion of development accounts.
// The established News matcher is supplied by store, preserving its exact
// person-override vs branch AND group AND skill semantics in both UI and CSV.
export function adminNewsAudience(staff: Staff[], me: Staff, n: NewsAudience, matches: (s: Staff, n: NewsAudience) => boolean) {
  return staff.filter(s => adminCanSeePerson(me, s) && countedTarget(s, n.audiencePeople)
    && (n.audiencePeople.length > 0 || n.audienceGroups.includes('Büro') || s.branch_id !== 'buero') && matches(s, n))
}
export function matchesEventAudience(s: Staff, ev: EventAudience) {
  return (!ev.audiencePeople.length || ev.audiencePeople.includes(s.id))
    && (!ev.audienceBranches.length || ev.audienceBranches.some(b => staffInBranch(s, b)))
    && (!ev.audienceSkills.length || s.skills.some(k => ev.audienceSkills.includes(k)))
}
export function adminEventAudience(staff: Staff[], me: Staff, ev: EventAudience) {
  return staff.filter(s => adminCanSeePerson(me, s) && countedTarget(s, ev.audiencePeople)
    && (s.branch_id !== 'buero' || ev.audiencePeople.includes(s.id)) && matchesEventAudience(s, ev))
}
export function adminPickerPeople(staff: Staff[], me: Staff) {
  return staff.filter(s => s.active && adminCanSeePerson(me, s))
}
export function adminLearnPeople(staff: Staff[], me: Staff, branch = '', includeTests = false) {
  return staff.filter(s => s.active && (includeTests || !isTestAccount(s)) && s.branch_id !== 'buero'
    && adminCanSeePerson(me, s) && (!branch || staffInBranch(s, branch)))
}
export type EventPerson = { s: Staff; kind: 'kommen' | 'warten' | 'nein' | 'offen'; at?: string; pos?: number }
export function adminEventReport(staff: Staff[], me: Staff, ev: EventAudience & { id: string }, registrations: Registration[]) {
  const scoped = new Map(staff.filter(s => adminCanSeePerson(me, s)).map(s => [s.id, s]))
  const aud = adminEventAudience(staff, me, ev)
  // Preserve actual authorised responses, even after their audience/active state
  // changes. Never turn another studio's registration into an exported ID/name.
  const regs = registrations.filter(r => r.event_id === ev.id && scoped.has(r.employee_id))
  const waitOrder = regs.filter(r => r.coming && r.waitlist).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.employee_id.localeCompare(b.employee_id))
  const people: EventPerson[] = regs.map(r => ({ s: scoped.get(r.employee_id)!, kind: !r.coming ? 'nein' : r.waitlist ? 'warten' : 'kommen', at: r.created_at, pos: r.waitlist ? waitOrder.indexOf(r) + 1 : undefined }))
  for (const s of aud) if (!regs.some(r => r.employee_id === s.id)) people.push({ s, kind: 'offen' })
  const order = { kommen: 0, warten: 1, offen: 2, nein: 3 }
  people.sort((a, b) => order[a.kind] - order[b.kind] || (a.pos ?? 0) - (b.pos ?? 0) || a.s.first.localeCompare(b.s.first))
  const counted = regs.filter(r => { const s = scoped.get(r.employee_id)!; return !isTestAccount(s) || (s.active && ev.audiencePeople.includes(s.id)) })
  return { aud, regs, people, excludedTests: regs.length - counted.length,
    yes: counted.filter(r => r.coming && !r.waitlist).length, wait: counted.filter(r => r.coming && r.waitlist).length,
    no: counted.filter(r => !r.coming).length, open: people.filter(p => p.kind === 'offen').length }
}
export const eventParticipantCsv = (people: EventPerson[]) => people.map(p => ({ Name: `${p.s.first} ${p.s.last}`, Studio: p.s.branch, Funktion: p.s.role,
  Testkonto: isTestAccount(p.s) ? 'ja' : 'nein', Antwort: { kommen: 'kommt', warten: `Warteliste ${p.pos}`, nein: 'kommt nicht', offen: 'keine Antwort' }[p.kind] }))
