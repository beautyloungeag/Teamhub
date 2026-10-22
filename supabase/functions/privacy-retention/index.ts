import { createClient } from 'jsr:@supabase/supabase-js@2.117.2'
import { runCleanup } from './cleanup.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const secret = Deno.env.get('NOTIFY_SECRET')
  if (!secret || req.headers.get('x-notify-secret') !== secret) return json({ error: 'unauthorized' }, 401)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))
  try {
    if (body.action === 'preview') {
      const { data, error } = await db.rpc('privacy_retention_preview')
      if (error) throw new Error('preview_failed')
      return json(data)
    }
    if (body.action !== 'run') return json({ error: 'invalid_action' }, 400)
    return json(await runCleanup(db))
  } catch { return json({ error: 'retention_failed' }, 500) }
})
