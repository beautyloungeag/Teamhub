/** A client lifetime, not an authorization decision. The server remains the
 * authority; this prevents a previous session's data/requests crossing into it. */
export type AccountScope = Readonly<{ key: string; employeeId: string; version: number; signal: AbortSignal }>
let current: AccountScope | null = null
let controller: AbortController | null = null
let version = 0
const listeners = new Set<(scope: AccountScope | null) => void>()

export function setAccountScope(key: string | null, employeeId?: string): AccountScope | null {
  if (key === current?.key && employeeId === current?.employeeId) return current
  if (!key && !current) return null
  controller?.abort()
  controller = key && employeeId ? new AbortController() : null
  current = controller ? Object.freeze({ key: key!, employeeId: employeeId!, version: ++version, signal: controller.signal }) : null
  // Reset module stores before React can render a different employee.
  for (const listener of listeners) listener(current)
  return current
}
export function captureAccountScope(expectedEmployeeId?: string): AccountScope | null {
  return current && (!expectedEmployeeId || current.employeeId === expectedEmployeeId) ? current : null
}
export function isCurrentAccountScope(scope: AccountScope | null | undefined): scope is AccountScope {
  return !!scope && scope === current && !scope.signal.aborted
}
export function onAccountScopeChange(listener: (scope: AccountScope | null) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function permissionFingerprint(employee: { id: string; app_role: string; job_title?: string; branch_id: string; extra_branch_ids?: string[]; skills?: string[] }) {
  return JSON.stringify([employee.id, employee.app_role, employee.job_title ?? '', employee.branch_id, [...(employee.extra_branch_ids ?? [])].sort(), [...(employee.skills ?? [])].sort()])
}
