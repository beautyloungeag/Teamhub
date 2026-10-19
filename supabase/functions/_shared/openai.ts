// Gemeinsamer Zugang zu OpenAI für die TeamHub-Functions (Secret OPENAI_API_KEY, Modell AI_MODEL).
export const aiModel = () => Deno.env.get('AI_MODEL') ?? Deno.env.get('ASSISTANT_MODEL') ?? 'gpt-5.6-sol'
export const hasAI = () => !!Deno.env.get('OPENAI_API_KEY')

// Chat-Aufruf mit JSON-Antwort. Wirft bei Fehlern, damit der Aufrufer ehrlich „nicht verfügbar“ melden kann.
export async function aiJson<T = any>(system: string, user: string, opts: { model?: string; timeoutMs?: number } = {}): Promise<T> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('no_key')
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: opts.model ?? aiModel(), messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90000),
  })
  if (!r.ok) throw new Error(`openai_${r.status}`)
  return JSON.parse((await r.json()).choices?.[0]?.message?.content ?? '{}') as T
}
