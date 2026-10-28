// Visibility is independent of registration. The database enforces the same audience rule.
export function assignedToEvent(person: { id: string; app_role: string; branch_id: string; extra?: string[]; skills: string[] }, event: { audienceBranches: string[]; audienceSkills: string[]; audiencePeople: string[] }) {
  if (person.app_role === 'buero') return true
  return (!event.audienceBranches.length || [person.branch_id, ...(person.extra ?? [])].some(b => event.audienceBranches.includes(b)))
    && (!event.audienceSkills.length || person.skills.some(s => event.audienceSkills.includes(s)))
    && (!event.audiencePeople.length || event.audiencePeople.includes(person.id))
}

/** Bild einer Schulung oder eines Events ohne eigenes Foto (28.10., Renée: „Schulungen sollten auch mit Bild abgebildet werden“) */
export const eventPhoto = (kind: string) => kind === 'Schulung' ? '/login-studio.webp' : kind === 'Team' ? '/hero-empfang.jpg' : '/hero-studio.jpg'
