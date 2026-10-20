// Personen verwalten. Büro: alles. Filialleitung: im eigenen Studio Mitarbeiterinnen anlegen,
// deaktivieren und wieder aktivieren. Endgültig löschen nur das Büro.
// Legt das Anmeldekonto still an — es geht keine Einladung raus; anmelden kann sie sich mit
// ihrer Firmen-Mail und dem Code, sobald sie die App-Adresse hat.
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
  const office = me?.app_role === 'buero', lead = me?.app_role === 'filialleitung'
  if (!office && !lead) return json({ ok: false, error: 'forbidden' }, 403)
  // Studios der Filialleitung (ohne Büro)
  const mine: string[] = [me.branch_id, ...(me.extra_branch_ids ?? [])].filter((b: string) => b && b !== 'buero')
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const b = await req.json().catch(() => ({}))
  // Protokoll: Änderungen an Personen laufen hier mit Dienstrechten, deshalb trägt die Function sie selbst ein
  const log = (action: 'insert' | 'update' | 'delete', id: string, title: string, branches: string[], changes: unknown = null) =>
    admin.from('audit_log').insert({ actor_id: me.id, actor_name: `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim(), action, entity: 'employees', entity_id: id, title, branch_ids: branches, changes })

  if (b.action === 'create') {
    const email = String(b.email ?? '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) || !b.first_name || !b.last_name || !b.branch_id) return json({ ok: false, error: 'missing_fields' }, 400)
    if (lead && !mine.includes(b.branch_id)) return json({ ok: false, error: 'forbidden' }, 403)
    const role = office && ['mitarbeiterin', 'filialleitung', 'buero'].includes(b.app_role) ? b.app_role : 'mitarbeiterin'
    const { data: emp, error } = await admin.from('employees').insert({
      email, first_name: String(b.first_name).trim(), last_name: String(b.last_name).trim(), job_title: String(b.job_title ?? '').trim(),
      app_role: role, branch_id: b.branch_id, phone: b.phone ?? null, skills: Array.isArray(b.skills) ? b.skills : [],
    }).select('id').single()
    if (error) return json({ ok: false, error: /duplicate/.test(error.message) ? 'exists' : error.message }, 400)
    // Trigger link_auth_user verknüpft das Konto per E-Mail. Ohne Login-Konto keine halbe Person zurücklassen.
    const { error: ae } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (ae && !/already/i.test(ae.message)) { await admin.from('employees').delete().eq('id', emp.id); return json({ ok: false, error: 'auth_failed', detail: ae.message }, 500) }
    await log('insert', emp.id, `${String(b.first_name).trim()} ${String(b.last_name).trim()}`, [b.branch_id], { job_title: String(b.job_title ?? '').trim(), app_role: role })
    return json({ ok: true, employee_id: emp.id })
  }

  // Für set_active, set_role und delete: Zielperson laden und Rechte prüfen
  const { data: target } = await admin.from('employees').select('id, auth_user_id, branch_id, extra_branch_ids, app_role, first_name, last_name, active').eq('id', String(b.employee_id ?? '')).maybeSingle()
  if (!target) return json({ ok: false, error: 'not_found' }, 404)
  if (target.id === me.id && (b.action === 'delete' || b.action === 'set_role' || !b.active)) return json({ ok: false, error: 'self' }, 400)
  if (lead && (!mine.includes(target.branch_id) || target.app_role === 'buero')) return json({ ok: false, error: 'forbidden' }, 403)

  if (b.action === 'set_active') {
    const { error } = await admin.from('employees').update({ active: !!b.active, updated_at: new Date().toISOString() }).eq('id', target.id)
    if (!error) await log('update', target.id, `${target.first_name} ${target.last_name}`, [target.branch_id, ...(target.extra_branch_ids ?? [])], { active: [target.active, !!b.active] })
    return error ? json({ ok: false, error: error.message }, 400) : json({ ok: true })
  }
  // Rolle vergeben: nur das Büro, die eigene Rolle nie (sonst sperrt man sich aus)
  if (b.action === 'set_role') {
    if (!office) return json({ ok: false, error: 'forbidden' }, 403)
    const role = String(b.app_role ?? '')
    if (!['mitarbeiterin', 'filialleitung', 'buero'].includes(role)) return json({ ok: false, error: 'bad_role' }, 400)
    const { error } = await admin.from('employees').update({ app_role: role, updated_at: new Date().toISOString() }).eq('id', target.id)
    if (!error) await log('update', target.id, `${target.first_name} ${target.last_name}`, [target.branch_id, ...(target.extra_branch_ids ?? [])], { app_role: [target.app_role, role] })
    return error ? json({ ok: false, error: error.message }, 400) : json({ ok: true })
  }
  if (b.action === 'delete') {
    if (!office) return json({ ok: false, error: 'forbidden' }, 403)
    // Verlauf bleibt erhalten (Meldungen, Nachweise behalten den Namen), persönliche Daten gehen mit
    const { error } = await admin.from('employees').delete().eq('id', target.id)
    if (error) return json({ ok: false, error: error.message }, 400)
    if (target.auth_user_id) await admin.auth.admin.deleteUser(target.auth_user_id).catch(() => null)
    await log('delete', target.id, `${target.first_name} ${target.last_name}`, [target.branch_id, ...(target.extra_branch_ids ?? [])])
    return json({ ok: true })
  }
  return json({ ok: false, error: 'unknown_action' }, 400)
})
