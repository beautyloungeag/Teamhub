// Mitarbeiterin anlegen oder deaktivieren (nur Büro). Legt das Anmeldekonto still an —
// es geht keine Einladung raus; anmelden kann sie sich, sobald sie die App-Adresse hat.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await user.rpc('current_employee')
  if (me?.app_role !== 'buero') return json({ ok: false, error: 'forbidden' }, 403)
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const b = await req.json().catch(() => ({}))

  if (b.action === 'create') {
    const email = String(b.email ?? '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) || !b.first_name || !b.last_name || !b.branch_id) return json({ ok: false, error: 'missing_fields' }, 400)
    const role = ['mitarbeiterin', 'filialleitung', 'buero'].includes(b.app_role) ? b.app_role : 'mitarbeiterin'
    const { data: emp, error } = await admin.from('employees').insert({
      email, first_name: String(b.first_name).trim(), last_name: String(b.last_name).trim(), job_title: String(b.job_title ?? '').trim(),
      app_role: role, branch_id: b.branch_id, phone: b.phone ?? null,
    }).select('id').single()
    if (error) return json({ ok: false, error: /duplicate/.test(error.message) ? 'exists' : error.message }, 400)
    // Trigger link_auth_user verknüpft das Konto per E-Mail
    const { error: ae } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (ae && !/already/i.test(ae.message)) return json({ ok: false, error: 'auth_failed', detail: ae.message, employee_id: emp.id }, 500)
    return json({ ok: true, employee_id: emp.id })
  }
  if (b.action === 'set_active') {
    const { error } = await admin.from('employees').update({ active: !!b.active, updated_at: new Date().toISOString() }).eq('id', b.employee_id)
    return error ? json({ ok: false, error: error.message }, 400) : json({ ok: true })
  }
  return json({ ok: false, error: 'unknown_action' }, 400)
})
