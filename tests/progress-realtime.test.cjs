const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { React, loadTsx, defer, mount, flush } = require('./helpers/react-dom-harness.cjs');
const root = path.resolve(__dirname, '..');
const profile = { id: 'lead', email: 'lead@example.invalid', first_name: 'Synthetic', last_name: 'Lead', app_role: 'filialleitung', job_title: 'Respo', branch_id: 'studio', extra_branch_ids: [], skills: [], lang: 'DE', photo_path: null, branch_name: 'Studio' };
const i18n = { tr: s => s, setCurrentLang() {}, savedLang: () => 'DE', locale: () => 'de-CH' };
function query(result) { const q = new Proxy({}, { get(_, key) { return key === 'then' ? (yes, no) => Promise.resolve(typeof result === 'function' ? result() : result).then(yes, no) : () => q } }); return q }
function rig() {
  const scope = loadTsx(path.join(root, 'src/lib/account-scope.ts'));
  const handlers = new Map(), reads = [], rows = {};
  let latest, holdNextRegistration = null;
  const sb = {
    channel: () => { const c = { on: (_type, spec, fn) => { handlers.set(spec.table, fn); return c }, subscribe: () => c }; return c }, removeChannel: async () => {},
    from: table => { const held = table === 'event_registrations' ? holdNextRegistration : null; if (held) holdNextRegistration = null; return query(() => { reads.push(table); return held ? held.promise : { data: rows[table] ?? [], error: null } }) },
    rpc: name => query(() => { reads.push('rpc:' + name); return { data: name === 'app_flags' ? {} : name === 'event_counts' ? [{ event_id: 'training', taken: (rows.event_registrations ?? []).filter(x => x.coming && !x.waitlist).length }] : [], error: null } }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
  };
  rows.events = [{ id: 'training', title: 'Training', kind: 'Schulung', starts_at: '2026-11-01T12:00:00Z', audience_branches: [], audience_people: [], audience_skills: [] }];
  const api = loadTsx(path.join(root, 'src/store.tsx'), { './lib/auth': { useAuth: () => ({ employee: profile }) }, './lib/supabase': { supabase: sb }, './lib/account-scope': scope, './lib/i18n': i18n, './Toast': { toast() {} } });
  const Probe = () => { latest = api.useApp(); return React.createElement('pre', null, JSON.stringify({ registrations: latest.registrations.length, taken: latest.events[0]?.taken, attempts: latest.attempts.length, reads: latest.newsReads.length, completed: latest.completionsToday.length, onboarding: latest.obDone.size, revision: latest.progressVersion })) };
  scope.setAccountScope('lead-session', 'lead');
  return { api, scope, rows, reads, handlers, Probe, get state() { return latest }, holdRegistration(value) { holdNextRegistration = value } };
}
const row = { event_id: 'training', employee_id: 'student', coming: true, waitlist: false, created_at: '2026-10-25T12:00:00Z' };

test('cross-role progress events refetch only affected RLS data in one bounded batch', async () => {
  const r = rig(), view = await mount(React.createElement(r.api.AppProvider, null, React.createElement(r.Probe)));
  try {
    await flush(); const revision = r.state.progressVersion; r.reads.length = 0;
    r.rows.event_registrations = [row];
    r.rows.quiz_attempts = [{ quiz_id: 'quiz', employee_id: 'student', score_pct: 100, passed: true, created_at: '2026-10-25T12:00:00Z' }];
    r.rows.news_reads = [{ news_id: 'news', employee_id: 'student', confirmed_at: '2026-10-25T12:00:00Z' }];
    r.rows.task_completions = [{ item_id: 'task', branch_id: 'studio' }];
    r.rows.onboarding_progress = [{ step_id: 'step' }];
    await flush(async () => {
      for (let i = 0; i < 12; i++) for (const table of ['event_registrations', 'quiz_attempts', 'news_reads', 'task_completions', 'onboarding_progress', 'wiki_runs']) r.handlers.get(table)({ new: { private: 'never render untrusted event data' } });
      await new Promise(resolve => setTimeout(resolve, 340));
    });
    assert.equal(r.state.registrations.length, 1); assert.equal(r.state.events[0].taken, 1);
    assert.equal(r.state.attempts[0].passed, true); assert.equal(r.state.newsReads.length, 1);
    assert.equal(r.state.completionsToday.length, 1); assert.equal(r.state.obDone.size, 1);
    assert.equal(r.state.progressVersion, revision + 1);
    assert.deepEqual(r.reads.sort(), ['event_registrations', 'rpc:event_counts', 'quiz_attempts', 'news_reads', 'task_completions', 'onboarding_progress'].sort());
    assert.doesNotMatch(view.host.textContent, /untrusted|private/);
  } finally { await view.close(); r.scope.setAccountScope(null); }
});

test('a late full reload cannot overwrite newer registration progress', async () => {
  const r = rig(), view = await mount(React.createElement(r.api.AppProvider, null, React.createElement(r.Probe)));
  try {
    await flush(); const old = defer(); r.holdRegistration(old); let reload;
    await flush(() => { reload = r.state.reload() });
    r.rows.event_registrations = [row];
    await flush(async () => { r.handlers.get('event_registrations')({}); await new Promise(resolve => setTimeout(resolve, 340)) });
    assert.equal(r.state.registrations.length, 1); assert.equal(r.state.events[0].taken, 1);
    await flush(() => old.resolve({ data: [], error: null })); await reload;
    assert.equal(r.state.registrations.length, 1); assert.equal(r.state.events[0].taken, 1);
  } finally { await view.close(); r.scope.setAccountScope(null); }
});

test('pending progress responses and queued bursts stop when the access scope changes', async () => {
  const r = rig(), view = await mount(React.createElement(r.api.AppProvider, null, React.createElement(r.Probe)));
  try {
    await flush(); const late = defer(); r.holdRegistration(late);
    await flush(async () => { r.handlers.get('event_registrations')({}); await new Promise(resolve => setTimeout(resolve, 340)) });
    await flush(() => { r.handlers.get('quiz_attempts')({}); r.scope.setAccountScope('lead-new-session', 'lead') });
    const before = r.state.progressVersion;
    await flush(() => late.resolve({ data: [row], error: null }));
    assert.equal(r.state.progressVersion, before); assert.equal(r.state.registrations.length, 0);
    r.reads.length = 0;
    await flush(async () => { await new Promise(resolve => setTimeout(resolve, 800)) });
    assert.equal(r.reads.length, 0, 'obsolete queued progress must not issue another query');
  } finally { await view.close(); r.scope.setAccountScope(null); }
});
