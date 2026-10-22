// Provider-independent conversation state. Never send previous_response_id.
export type Item = Record<string, any>
export type Context = { version: 1; model: string; scope: string; turns: Item[][] }
export const CONTEXT_BUCKET = 'assistant-context'
export const MAX_CONTEXT_BYTES = 48 * 1024 * 1024
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export function contextPathAllowed(path: unknown, employee: string, chat: string): path is string {
  return typeof path === 'string' && new RegExp(`^${uuid}/${uuid}/${uuid}\\.json$`, 'i').test(path)
    && path.startsWith(`${employee}/${chat}/`)
}

export function readContext(raw: unknown, model: string, scope: string): Context | null {
  const c = raw as Context
  if (!c || c.version !== 1 || c.model !== model || c.scope !== scope || !Array.isArray(c.turns)
    || c.turns.length > 12 || c.turns.some(t => !Array.isArray(t) || t.some(i => !i || typeof i !== 'object' || Array.isArray(i)))) return null
  return new TextEncoder().encode(JSON.stringify(c)).length <= MAX_CONTEXT_BYTES ? c : null
}

export function saveContext(previous: Context | null, model: string, scope: string, turn: Item[]): string {
  const c: Context = { version: 1, model, scope, turns: [...(previous?.turns ?? []), turn].slice(-12) }
  let data = JSON.stringify(c)
  while (new TextEncoder().encode(data).length > MAX_CONTEXT_BYTES && c.turns.length > 1) {
    c.turns.shift()
    data = JSON.stringify(c)
  }
  if (new TextEncoder().encode(data).length > MAX_CONTEXT_BYTES) throw new Error('context_too_large')
  return data
}

export function appendToolRound(input: Item[], output: Item[], results: Item[]): Item[] {
  // Includes encrypted reasoning, web-search results and all function calls.
  // Tool outputs alone cannot continue a stateless Responses request.
  return [...input, ...output, ...results]
}

export function privateRequest(payload: Record<string, unknown>) {
  const { previous_response_id: _previous, conversation: _conversation, ...rest } = payload
  return { ...rest, store: false }
}
