import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { mailScopes } from '../supabase/functions/mailer/scopes.ts'

test('master switch controls both scopes; legacy enabled configuration remains compatible', () => {
  assert.deepEqual(mailScopes({ mail_enabled: false, facility_mail_enabled: true }), { enabled: false, facilityEnabled: false, eventEnabled: false })
  assert.deepEqual(mailScopes({ mail_enabled: true }), { enabled: true, facilityEnabled: true, eventEnabled: true })
  assert.deepEqual(mailScopes({ mail_enabled: true, event_mail_enabled: false }), { enabled: true, facilityEnabled: true, eventEnabled: false })
})

test('actual mailer forwards only a real report, preserves it and never processes invitations in facility-only mode', async () => {
  const now = new Date().toISOString()
  const tables: Record<string, any[]> = {
    app_settings: Object.entries({ mail_enabled: true, facility_mail_enabled: true, event_mail_enabled: false, facility_email: 'facility@example.invalid' }).map(([key, value]) => ({ key, value })),
    branches: [{ id: 'studio', name: 'QA Studio', facility_email: null }],
    tickets: [
      { id: 'report', kind: 'Meldung', title: 'QA repair', body: 'Synthetic', branch_id: 'studio', created_by_name: 'QA', created_at: now, is_sample: false, mail_status: null },
      { id: 'idea', kind: 'Idee', created_at: now, is_sample: false, mail_status: null },
      { id: 'learning', kind: 'Learning', created_at: now, is_sample: false, mail_status: null },
      { id: 'sample', kind: 'Meldung', created_at: now, is_sample: true, mail_status: null },
    ],
    events: [{ id: 'event', starts_at: '2099-01-01T12:00:00Z', invite_mailed_at: null, is_sample: false }],
    employees: [{ id: 'employee', email: 'never-send@example.invalid', active: true }],
    mail_log: [],
  }
  const queried: string[] = [], sent: any[] = []
  const db = { from(name: string) {
    queried.push(name)
    const filters: ((r: any) => boolean)[] = []
    let patch: any = null, insertion: any = null
    const chain: any = {
      select() { return chain }, limit() { return chain },
      eq(k: string, v: unknown) { filters.push(r => r[k] === v); return chain },
      is(k: string, v: unknown) { return chain.eq(k, v) },
      lt(k: string, v: string) { filters.push(r => r[k] < v); return chain },
      update(v: any) { patch = v; return chain }, insert(v: any) { insertion = v; return chain },
      then(resolve: (v: unknown) => unknown) {
        if (insertion) tables[name].push(insertion)
        const rows = (tables[name] ?? []).filter(r => filters.every(f => f(r)))
        if (patch) rows.forEach(r => Object.assign(r, patch))
        return Promise.resolve(resolve({ data: rows, error: null }))
      },
    }
    return chain
  } }
  let handler: (r: Request) => Promise<Response> = null as any
  const Deno = { env: { get: (name: string) => ({ NOTIFY_SECRET: 'qa-secret', RESEND_API_KEY: 'qa-key', APP_URL: 'https://app.example.invalid' }[name] ?? 'qa') }, serve: (h: typeof handler) => { handler = h } }
  const source = fs.readFileSync(new URL('../supabase/functions/mailer/index.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new Function('createClient', 'mailScopes', 'Deno', 'fetch', js)(() => db, mailScopes, Deno, async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.resend.com/emails')
    sent.push(JSON.parse(init.body as string))
    return new Response(JSON.stringify({ id: 'qa-send' }), { status: 200 })
  })
  const response = await handler(new Request('https://function.example.invalid', { method: 'POST', headers: { 'x-notify-secret': 'qa-secret', 'Content-Type': 'application/json' }, body: '{}' }))
  assert.deepEqual(await response.json(), { ok: true, sent: 1, failed: 0 })
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].to, ['facility@example.invalid'])
  assert.match(sent[0].html, /open=ticket:report/)
  assert.equal(tables.tickets.length, 4)
  assert.equal(tables.tickets[0].mail_status, 'gesendet')
  assert.equal(tables.tickets[1].mail_status, null)
  assert.equal(tables.events[0].invite_mailed_at, null)
  assert.equal(queried.includes('events'), false)
  assert.equal(queried.includes('event_registrations'), false)
  assert.equal(queried.includes('employees'), false)
})
