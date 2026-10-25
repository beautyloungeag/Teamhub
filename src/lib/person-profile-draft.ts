export type EditableProfile = { job_title: string; branch_id: string }
export type ProfileDraft = Partial<{ [K in keyof EditableProfile]: { base: string; value: string } }>

export function profilePatch(draft: ProfileDraft, current: EditableProfile, office: boolean) {
  const patch: Partial<EditableProfile> = {}
  for (const field of ['job_title', 'branch_id'] as const) {
    const edit = draft[field]
    if (!edit || (field === 'branch_id' && !office) || edit.value === current[field]) continue
    if (edit.base !== current[field]) return { conflict: true as const, patch: {} }
    patch[field] = edit.value
  }
  // Role is deliberately not an editable profile field. A stale profile save
  // can never undo a separate, already-confirmed role change.
  return { conflict: false as const, patch }
}

/** PostgREST eq on text[] needs PostgreSQL's quoted array literal, not a JS
 * array's comma-joined string. Quote every item, including commas/backslashes. */
export const postgresTextArray = (values: string[]) => `{${values.map(value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
