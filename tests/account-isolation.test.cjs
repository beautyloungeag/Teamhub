const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { React, loadTsx, defer, mount, flush } = require('./helpers/react-dom-harness.cjs');
const root = path.resolve(__dirname, '..');
const source = (p, stubs = {}, extra = '') => {
  if (!process.env.TEAMHUB_BASELINE_REF || p.endsWith('account-scope.ts')) return loadTsx(path.join(root, p), stubs, extra);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-baseline-'));
  const file = path.join(dir, path.basename(p));
  try {
    fs.writeFileSync(file, execFileSync('git', ['show', `${process.env.TEAMHUB_BASELINE_REF}:${p}`], { cwd: root }));
    return loadTsx(file, stubs, extra);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
const i18n = { tr: s => s, setCurrentLang() {}, savedLang: () => 'DE', locale: () => 'de-CH' };
const employee = (id, app_role = 'mitarbeiterin') => ({ id, email: `${id}@example.invalid`, first_name: id, last_name: 'Test', job_title: app_role, app_role, branch_id: 'studio-a', extra_branch_ids: [], skills: [], lang: 'DE', photo_path: null, branch_name: 'Studio A' });
const row = (id, title) => ({ id, kind: 'Anliegen', title, body: '', branch_id: 'studio-a', created_at: '2026-10-20T12:00:00Z', created_by: id, created_by_name: 'Synthetic', status: 'Neu' });
function query(result) {
  let signal;
  const q = new Proxy({}, { get(_, key) {
    if (key === 'then') return (yes, no) => Promise.resolve(typeof result === 'function' ? result() : result).then(yes, no);
    if (key === 'abortSignal') return s => { signal = s; return q };
    if (key === 'testSignal') return signal;
    return () => q;
  } });
  return q;
}
function channels() { return { channel: () => { const c = { on: () => c, subscribe: () => c }; return c }, removeChannel: async () => {} }; }

// These are actual React mount/update/unmount lifecycles. Only network/provider
// APIs are substituted; React hooks, effects, scheduling and context are real.
test('account boundary removes office-private data before a different employee renders', async () => {
  const scope = source('src/lib/account-scope.ts');
  const Auth = React.createContext(null);
  const auth = { useAuth: () => React.useContext(Auth), AuthProvider: ({ children }) => children };
  let identity = 'office', hold = false;
  const pending = defer();
  const sb = {
    ...channels(),
    from: table => query(table === 'tickets' ? (hold ? pending.promise : { data: [row(identity, identity + '-private-ticket')], error: null }) : { data: [], error: null }),
    rpc: name => query({ data: name === 'app_flags' ? { demo_data: false } : [], error: null }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), createSignedUrl: async () => ({ data: null }) }) },
  };
  const store = source('src/store.tsx', { './lib/auth': auth, './lib/supabase': { supabase: sb }, './lib/account-scope': scope, './lib/i18n': i18n, './Toast': { toast() {} } });
  const observed = [];
  const Screen = () => { const s = store.useApp(); observed.push([s.employee.id, s.tickets.map(x => x.title)]); return React.createElement('pre', null, s.employee.id + ':' + s.tickets.map(x => x.title).join(',')) };
  const app = source('src/App.tsx', { './store': store, './lib/auth': auth, './Mobile': { __esModule: true, default: Screen }, './Backoffice': { __esModule: true, default: Screen }, './lib/start': { startParams: new URLSearchParams() }, './Login': { __esModule: true, default: () => React.createElement('span', null, 'signed-out') }, './lib/i18n': i18n, './Toast': { Toaster: () => null } });
  const a = scope.setAccountScope('session-office', 'office');
  let state = { ready: true, employee: employee('office', 'buero'), scopeKey: String(a.version) };
  const render = () => React.createElement(Auth.Provider, { value: state }, React.createElement(app.default));
  const view = await mount(render());
  try {
    await flush(); assert.match(view.host.textContent, /office-private-ticket/);
    await flush(() => { scope.setAccountScope(null); state = { ready: true, employee: null, scopeKey: null }; });
    await view.render(render());
    identity = 'employee'; hold = true;
    const b = scope.setAccountScope('session-employee', 'employee');
    state = { ready: true, employee: employee('employee'), scopeKey: String(b.version) };
    await view.render(render());
    assert.equal(observed.some(([id, titles]) => id === 'employee' && titles.includes('office-private-ticket')), false, 'previous account ticket reached the new employee render');
    assert.doesNotMatch(view.host.textContent, /office-private-ticket/);
    await flush(() => pending.resolve({ data: [row('employee', 'employee-own-ticket')], error: null }));
    assert.match(view.host.textContent, /employee-own-ticket/);
  } finally { await view.close(); scope.setAccountScope(null); }
});

test('late old store response is discarded after same-user session replacement', async () => {
  const scope = source('src/lib/account-scope.ts');
  const Auth = React.createContext(null);
  const auth = { useAuth: () => React.useContext(Auth) };
  const late = defer(); let first = true;
  const sb = { ...channels(), from: table => query(table === 'tickets' ? (first ? late.promise : { data: [row('same', 'new-session-ticket')], error: null }) : { data: [], error: null }), rpc: name => query({ data: name === 'app_flags' ? {} : [], error: null }), storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) } };
  const store = source('src/store.tsx', { './lib/auth': auth, './lib/supabase': { supabase: sb }, './lib/account-scope': scope, './lib/i18n': i18n, './Toast': { toast() {} } });
  let last;
  function Probe() { last = store.useApp(); return React.createElement('pre', null, last.tickets.map(x => x.title).join(',')) }
  const render = key => React.createElement(Auth.Provider, { value: { employee: employee('same') } }, React.createElement(store.AppProvider, { key }, React.createElement(Probe)));
  const a = scope.setAccountScope('old-session', 'same');
  const view = await mount(render(a.version));
  try {
    first = false;
    const b = scope.setAccountScope('new-session', 'same');
    await view.render(render(b.version)); await flush();
    assert.match(view.host.textContent, /new-session-ticket/);
    await flush(() => late.resolve({ data: [row('same', 'old-session-secret')], error: null }));
    assert.doesNotMatch(view.host.textContent, /old-session-secret/);
    assert.match(view.host.textContent, /new-session-ticket/);
  } finally { await view.close(); scope.setAccountScope(null); }
});

function authRig() {
  const scope = source('src/lib/account-scope.ts');
  const initial = defer(), logout = defer(), requests = [];
  let changed;
  const sb = {
    ...channels(), auth: { getSession: () => initial.promise, onAuthStateChange: f => { changed = f; return { data: { subscription: { unsubscribe() {} } } } }, signOut: () => logout.promise },
    rpc: () => { const d = defer(); requests.push(d); return query(d.promise) },
    from: () => query({ data: { name: 'Studio A' }, error: null }),
  };
  const api = source('src/lib/auth.tsx', { './supabase': { supabase: sb }, './account-scope': scope, './push': { disablePush: async () => {}, syncPushAccount() {} } });
  let state;
  const Consumer = () => { state = api.useAuth(); return React.createElement('pre', null, state.employee ? state.employee.id + ':' + state.employee.app_role : 'closed') };
  return { scope, initial, logout, requests, event: s => changed(s ? 'SIGNED_IN' : 'SIGNED_OUT', s), api, get state() { return state }, Consumer };
}
const session = (id, sid) => ({ access_token: 'header.' + Buffer.from(JSON.stringify({ session_id: sid })).toString('base64url') + '.signature', user: { id }, refresh_token: 'synthetic', expires_in: 3600, token_type: 'bearer' });

test('auth rejects initial getSession and profile responses superseded by later auth events', async () => {
  const r = authRig(); const view = await mount(React.createElement(r.api.AuthProvider, null, React.createElement(r.Consumer)));
  try {
    await flush(() => r.event(session('a', 'a1')));
    assert.equal(r.requests.length, 1);
    await flush(() => r.event(session('b', 'b1')));
    assert.equal(r.requests.length, 2);
    await flush(() => r.requests[1].resolve({ data: employee('b'), error: null }));
    await flush(() => r.requests[0].resolve({ data: employee('a', 'buero'), error: null }));
    await flush(() => r.initial.resolve({ data: { session: session('a', 'old') } }));
    assert.equal(r.state.employee.id, 'b');
    assert.match(view.host.textContent, /^b:/);
  } finally { await view.close(); }
});

test('logout invalidates synchronously; new session and demotion replace scope but last_seen does not', async () => {
  const r = authRig(); const view = await mount(React.createElement(r.api.AuthProvider, null, React.createElement(r.Consumer)));
  try {
    await flush(() => r.event(session('same', 'one')));
    await flush(() => r.requests[0].resolve({ data: employee('same', 'buero'), error: null }));
    const first = r.scope.captureAccountScope('same'), firstEmployee = r.state.employee;
    await flush(() => window.dispatchEvent(new Event('focus')));
    await flush(() => r.requests[1].resolve({ data: { ...employee('same', 'buero'), last_seen_at: new Date().toISOString() }, error: null }));
    assert.equal(r.scope.captureAccountScope(), first);
    assert.equal(r.state.employee, firstEmployee, 'harmless metadata should not reload every provider');
    await flush(() => window.dispatchEvent(new Event('focus')));
    await flush(() => r.requests[2].resolve({ data: employee('same'), error: null }));
    const demoted = r.scope.captureAccountScope();
    assert.notEqual(demoted, first); assert.equal(first.signal.aborted, true);
    await flush(() => r.event(session('same', 'two')));
    assert.equal(r.scope.captureAccountScope(), null, 'old scope must close before replacement profile resolves');
    await flush(() => r.requests[3].resolve({ data: employee('same'), error: null }));
    assert.notEqual(r.scope.captureAccountScope(), demoted);
    let done;
    await flush(() => { done = r.state.signOut() });
    assert.equal(r.scope.captureAccountScope(), null); assert.equal(r.state.employee, null);
    await flush(() => r.event(session('same', 'two')));
    assert.equal(r.scope.captureAccountScope(), null, 'pending logout must reject an old auth event');
    await flush(() => r.logout.resolve({ error: null })); await done;
  } finally { await view.close(); }
});

test('mailbox cache is absent on the first new-account paint and late mailbox results cannot repopulate it', async () => {
  const scope = source('src/lib/account-scope.ts');
  const App = React.createContext(null);
  const waiting = [], list = [];
  const box = subject => ({ data: { ok: true, connected: true, configured: true, address: 'test@example.invalid', total: 1, items: [{ uid: 1, seen: false, subject, snippet: '', date: null, from: { name: 'Synthetic', address: 'sender@example.invalid' }, attachments: 0 }] } });
  const sb = { functions: { invoke: (_name, options) => { const d = defer(); waiting.push(d); list.push(options); return d.promise } } };
  const mail = source('src/Mail.tsx', { './tones': loadTsx(path.join(root, 'src/tones.ts')), './lib/account-scope': scope, './lib/supabase': { supabase: sb }, './store': { useApp: () => React.useContext(App) }, './lib/i18n': i18n, './Toast': { toast() {} }, './ViewportOverlay': { ViewportOverlay: ({ children }) => children } });
  const render = (id, key) => React.createElement(App.Provider, { value: { employee: employee(id), t: s => s } }, React.createElement(mail.Inbox, { key, onOpen() {} }));
  const a = scope.setAccountScope('a-one', 'a');
  const view = await mount(render('a', a.version));
  try {
    await flush(() => waiting[0].resolve(box('private A subject')));
    assert.match(view.host.textContent, /private A subject/);
    await flush(() => view.host.querySelector('[aria-label="Aktualisieren"]').click());
    const b = scope.setAccountScope('b-one', 'b');
    await view.render(render('b', b.version));
    assert.doesNotMatch(view.host.textContent, /private A subject/);
    assert.equal(list[1].signal.aborted, true);
    await flush(() => waiting[1].resolve(box('late A subject')));
    assert.doesNotMatch(view.host.textContent, /late A subject/);
    await flush(() => waiting[2].resolve(box('private B subject')));
    assert.match(view.host.textContent, /private B subject/);
    // A new login with the same employee ID must not reuse the previous session.
    const b2 = scope.setAccountScope('b-two', 'b');
    await view.render(render('b', b2.version));
    assert.doesNotMatch(view.host.textContent, /private B subject/);
    await flush(() => waiting[3].resolve(box('new B session')));
    assert.match(view.host.textContent, /new B session/);
  } finally { await view.close(); scope.setAccountScope(null); }
});

test('todo and standby shared stores clear synchronously and reject old requests', async () => {
  const scope = source('src/lib/account-scope.ts');
  const App = React.createContext(null);
  const waiting = new Map();
  const sb = { from: table => { const d = defer(); if (!waiting.has(table)) waiting.set(table, []); waiting.get(table).push(d); return query(d.promise) } };
  const common = { './lib/account-scope': scope, './lib/supabase': { supabase: sb }, './store': { useApp: () => React.useContext(App), isoDay: () => '2026-10-25', addDays: () => '2026-10-11' }, './lib/i18n': i18n, './Toast': { toast() {} }, './ViewportOverlay': { ViewportOverlay: ({ children }) => children } };
  const todos = source('src/Todos.tsx', common);
  const standby = source('src/standby.ts', common);
  const history = [];
  function Probe() { const app = React.useContext(App), t = todos.useTodos(), s = standby.useStandbyRequests(); const labels = [...t.map(x => x.title), ...s.requests.map(x => x.note)]; history.push([app.employee.id, labels]); return React.createElement('pre', null, labels.join(',')) }
  const render = (id, key) => React.createElement(App.Provider, { value: { employee: employee(id) } }, React.createElement(Probe, { key }));
  const a = scope.setAccountScope('a', 'a');
  const view = await mount(render('a', a.version));
  try {
    await flush(() => { waiting.get('todos')[0].resolve({ data: [{ title: 'A private todo' }] }); waiting.get('standby_requests')[0].resolve({ data: [{ note: 'A private standby' }] }); waiting.get('standby_responses')[0].resolve({ data: [] }); });
    assert.match(view.host.textContent, /A private todo/);
    let lateTodo, lateStandby;
    await flush(() => { lateTodo = todos.reloadTodos(); lateStandby = standby.reloadStandby() });
    await React.act(async () => { const b = scope.setAccountScope('b', 'b'); view.root.render(render('b', b.version)); });
    assert.doesNotMatch(view.host.textContent, /A private/);
    await flush(() => { waiting.get('todos')[1].resolve({ data: [{ title: 'late A' }] }); waiting.get('standby_requests')[1].resolve({ data: [{ note: 'late A' }] }); waiting.get('standby_responses')[1].resolve({ data: [] }); });
    await Promise.all([lateTodo, lateStandby]);
    assert.doesNotMatch(view.host.textContent, /late A/);
    await flush(() => { waiting.get('todos')[2].resolve({ data: [{ title: 'B todo' }] }); waiting.get('standby_requests')[2].resolve({ data: [{ note: 'B standby' }] }); waiting.get('standby_responses')[2].resolve({ data: [] }); });
    assert.match(view.host.textContent, /B todo,B standby/);
    assert.equal(history.some(([id, labels]) => id === 'b' && labels.some(x => /^A |^late A/.test(x))), false);
  } finally { await view.close(); scope.setAccountScope(null); }
});

test('ticket realtime is coalesced, fetches only authorized ticket data, and persists comment acknowledgement even when refresh fails', async () => {
  const scope = source('src/lib/account-scope.ts');
  const auth = { useAuth: () => ({ employee: fixtureEmployee }) };
  const fixtureEmployee = employee('worker');
  const handlers = [], reads = [];
  let broken = false, serverComment = null, latest, insertCount = 0;
  const sb = { ...channels(),
    channel: () => { const c = { on: (_type, _filter, fn) => { handlers.push(fn); return c }, subscribe: () => c }; return c },
    from: table => {
      let insert = null;
      const q = query(() => {
        reads.push(table);
        if (insert) { insertCount++; serverComment = { id: insert.id, ticket_id: insert.ticket_id, author_id: 'worker', author_name: 'Canonical author', body: 'Saved once', created_at: '2026-10-25T12:00:00Z' }; return { data: serverComment, error: null } }
        if (broken && ['tickets', 'ticket_comments', 'ticket_votes'].includes(table)) return { data: null, error: new Error('offline') };
        return { data: table === 'tickets' ? [row('ticket', 'Shared ticket')] : table === 'ticket_comments' && serverComment ? [{ ...serverComment, ticket_id: 'ticket' }] : [], error: null };
      });
      return new Proxy(q, { get(target, key) { if (key === 'insert') return value => { insert = value; return q }; return Reflect.get(target, key) } });
    },
    rpc: name => query({ data: name === 'app_flags' ? {} : [], error: null }), storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
  };
  const store = source('src/store.tsx', { './lib/auth': auth, './lib/supabase': { supabase: sb }, './lib/account-scope': scope, './lib/i18n': i18n, './Toast': { toast() {} } });
  function Probe() { latest = store.useApp(); return React.createElement('pre', null, latest.tickets.flatMap(x => x.comments.map(c => c.body)).join(',')) }
  scope.setAccountScope('worker', 'worker');
  const view = await mount(React.createElement(store.AppProvider, null, React.createElement(Probe)));
  try {
    await flush(); reads.length = 0;
    await flush(async () => { for (let i = 0; i < 15; i++) for (const fn of handlers) fn({ old: { private: 'must not be trusted' } }); await new Promise(r => setTimeout(r, 120)); });
    assert.deepEqual(reads.sort(), ['ticket_comments', 'ticket_votes', 'tickets'].sort());
    broken = true; let saved;
    await flush(async () => { saved = await latest.addComment('ticket', 'Saved once') });
    assert.equal(saved, true); assert.equal(insertCount, 1);
    assert.match(view.host.textContent, /Saved once/);
  } finally { await view.close(); scope.setAccountScope(null); }
});

test('assistant chat creation and transcript requests cannot populate a replacement session', async () => {
  const scope = source('src/lib/account-scope.ts');
  const pending = [];
  const sb = { from: table => { const d = defer(); pending.push({ table, ...d }); return query(d.promise) }, auth: { getSession: async () => { throw new Error('obsolete creation must not start an assistant request') } } };
  const stubs = { './lib/account-scope': scope, './lib/supabase': { supabase: sb }, './lib/i18n': i18n, './store': { useApp: () => ({ employee: employee('a') }), isoDay() {}, addDays() {} }, './Toast': { toast() {} }, './ViewportOverlay': { ViewportOverlay: ({ children }) => children }, './lib/mobile-viewport': { scrollInPane() {} }, './ContactLock': {}, './Logo': {}, './BenniOrb': {}, './People': {}, './TicketParts': {}, './Todos': { reloadTodos() {} } };
  const benni = source('src/BenniChat.tsx', stubs, 'export { useBenni, loadChats, openChat, sendMessage };');
  let state, after = 0;
  function Probe() { state = benni.useBenni(); return React.createElement('pre', null, state.chats.map(x => x.title + ':' + (x.msgs ?? []).map(m => m.t)).join(',')) }
  scope.setAccountScope('a-one', 'a');
  const view = await mount(React.createElement(Probe));
  try {
    let loading;
    await flush(() => { loading = benni.loadChats('a') });
    await flush(() => pending[0].resolve({ data: [{ id: 'a-chat', title: 'A title', updated_at: '2026-10-25T12:00:00Z' }], error: null })); await loading;
    assert.match(view.host.textContent, /A title/);
    let transcript;
    await flush(() => { transcript = benni.openChat('a-chat') });
    await flush(() => scope.setAccountScope('a-two', 'a'));
    await flush(() => pending[1].resolve({ data: [{ id: 'private-message', role: 'assistant', text: 'Old private answer', data: {}, created_at: '2026-10-25T12:00:00Z' }], error: null })); await transcript;
    assert.equal(state.chats.length, 0);
    let sending;
    await flush(() => { sending = benni.sendMessage('a', 'Old question', [], { model: 'standard', web: false }, 'error', () => after++) });
    await flush(() => scope.setAccountScope('b-one', 'b'));
    await flush(() => pending[2].resolve({ data: { id: 'obsolete-created-chat', title: 'Old title', updated_at: '2026-10-25T12:00:00Z' }, error: null })); await sending;
    assert.equal(state.chats.length, 0); assert.equal(state.creating, false); assert.equal(after, 0);
    assert.doesNotMatch(view.host.textContent, /Old|A title/);
  } finally { await view.close(); scope.setAccountScope(null); }
});

test('performance promise cache is session scoped and a delayed old response is never reused', async () => {
  const scope = source('src/lib/account-scope.ts'), waiting = [];
  const perf = source('src/Performance.tsx', { './lib/account-scope': scope, './lib/phorest': { phorest: () => { const d = defer(); waiting.push(d); return d.promise } }, './lib/supabase': { supabase: null }, './lib/i18n': i18n, './store': { isoDay: () => '2026-10-25', addDays: () => '2026-10-20' }, './Toast': { toast() {} }, './lib/csv': {}, './admin/kit': {} });
  scope.setAccountScope('a-one', 'a');
  const body = { from: '2026-10-20', to: '2026-10-25' };
  const old = perf.loadPerf(body);
  assert.equal(perf.loadPerf(body), old, 'within-session cache should still deduplicate');
  scope.setAccountScope('a-two', 'a');
  const next = perf.loadPerf(body);
  assert.notEqual(old, next); assert.equal(waiting.length, 2);
  waiting[0].resolve({ ok: true, private: 'old-data' });
  assert.deepEqual(await old, { ok: false, error: 'session_changed' });
  waiting[1].resolve({ ok: true, metrics: {} });
  assert.equal((await next).ok, true);
  scope.setAccountScope(null);
});


test('a committed comment with lost acknowledgement keeps its UUID across an uncertain retry', async () => {
  const scope = source('src/lib/account-scope.ts'), fixtureEmployee = employee('worker');
  const records = new Map(), attemptedIds = [];
  let uncertain = false, verifyOffline = false, latest;
  const sb = { ...channels(),
    from: table => {
      if (table !== 'ticket_comments') return query({ data: table === 'tickets' ? [row('ticket', 'Shared ticket')] : [], error: null });
      let payload, selectedId;
      const q = new Proxy({}, { get(_, key) {
        if (key === 'then') return (yes, no) => Promise.resolve().then(() => {
          if (payload) {
            attemptedIds.push(payload.id);
            if (records.has(payload.id)) return { data: null, error: { code: '23505' } };
            const canonical = { ...payload, author_name: 'Canonical worker', created_at: '2026-10-25T12:00:00Z' };
            records.set(payload.id, canonical);
            if (uncertain) throw new Error('response lost after commit');
            return { data: canonical, error: null };
          }
          if (selectedId) {
            if (verifyOffline) throw new Error('read-back unavailable');
            return { data: records.get(selectedId) ?? null, error: null };
          }
          return { data: [...records.values()], error: null };
        }).then(yes, no);
        return (...args) => { if (key === 'insert') payload = args[0]; if (key === 'eq' && args[0] === 'id') selectedId = args[1]; return q };
      } });
      return q;
    },
    rpc: name => query({ data: name === 'app_flags' ? {} : [], error: null }), storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
  };
  const store = source('src/store.tsx', { './lib/auth': { useAuth: () => ({ employee: fixtureEmployee }) }, './lib/supabase': { supabase: sb }, './lib/account-scope': scope, './lib/i18n': i18n, './Toast': { toast() {} } });
  function Probe() { latest = store.useApp(); return React.createElement('pre', null, latest.tickets.flatMap(x => x.comments.map(c => c.body)).join(',')) }
  scope.setAccountScope('worker', 'worker');
  const view = await mount(React.createElement(store.AppProvider, null, React.createElement(Probe)));
  try {
    await flush(); uncertain = true; verifyOffline = true;
    let saved;
    await flush(async () => { saved = await latest.addComment('ticket', 'One comment') });
    assert.equal(saved, false, 'uncertain persistence keeps the draft');
    assert.equal(records.size, 1);
    uncertain = false; verifyOffline = false;
    await flush(async () => { saved = await latest.addComment('ticket', 'One comment') });
    assert.equal(saved, true);
    assert.equal(records.size, 1, 'retry must not insert a duplicate comment');
    assert.equal(attemptedIds.length, 2); assert.equal(attemptedIds[0], attemptedIds[1]);
    assert.equal(view.host.textContent, 'One comment');
  } finally { await view.close(); scope.setAccountScope(null); }
});
