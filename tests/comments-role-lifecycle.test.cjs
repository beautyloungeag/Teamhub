const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { React, loadTsx, defer, mount, flush, type, click, key } = require('./helpers/react-dom-harness.cjs');
const base = path.resolve(__dirname, '..');
const h = React.createElement;
const person = { id: 'employee-target', first: 'Test', last: 'Person', role: 'Role before', app_role: 'mitarbeiterin', branch_id: 'b1', branch: 'Test Studio', skills: [], extra: [], active: true, email: 'test@example.invalid' };
function scopeFor(id) { const scope = loadTsx(path.join(base, 'src/lib/account-scope.ts')); scope.setAccountScope('test-session', id); return scope }
function commentFixture() {
  const scope = scopeFor('me'); let send = () => Promise.resolve(true);
  const ctx = { me: { id: 'me' }, staff: [person], t: s => s, addComment: (...args) => send(...args) };
  const { Comments } = loadTsx(path.join(base, 'src/TicketParts.tsx'), { './lib/account-scope': scope, './store': { useApp: () => ctx }, './People': { Avatar: () => null } });
  return { scope, ctx, Comments, send(fn) { send = fn } };
}
const ticket = { id: 'ticket-1', comments: [{ id: 'c1', authorId: person.id, author: 'Untrusted display name', body: 'Test comment', when: 'now' }] };

test('comments use profile author, preserve failed draft with retry, guard pending send and refresh other comments', async t => {
  const f = commentFixture(), pending = defer(); const calls = []; let count = 0;
  f.send((...args) => { calls.push(args); return ++count === 1 ? pending.promise : Promise.resolve(true) });
  const ui = await mount(h(f.Comments, { tk: ticket })); t.after(() => ui.close());
  assert.match(ui.host.textContent, /Test Person/); assert.doesNotMatch(ui.host.textContent, /Untrusted display name/);
  const area = ui.host.querySelector('textarea'), button = ui.host.querySelector('button');
  assert.equal(button.getAttribute('aria-label'), 'Kommentar senden'); assert.match(button.className, /h-11 w-11/);
  await type(area, 'A useful\ncomment');
  await React.act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve() });
  assert.equal(calls.length, 1);
  await flush(() => pending.resolve(false));
  assert.match(ui.host.querySelector('[role="alert"]').textContent, /Entwurf bleibt erhalten/);
  assert.equal(area.value, 'A useful\ncomment');
  await click(button); assert.equal(calls.length, 2); assert.equal(area.value, '');
  await ui.render(h(f.Comments, { tk: { ...ticket, comments: [...ticket.comments, { id: 'c2', body: 'Reply from another person', when: 'now', authorId: null, author: 'Unverified deleted author' }] } }));
  assert.match(ui.host.textContent, /Reply from another person/); assert.match(ui.host.textContent, /Ehemalige Person/); assert.doesNotMatch(ui.host.textContent, /Unverified deleted author/);
});

test('comments mobile Enter and IME do not send; ticket/account switch clears drafts and pending errors', async t => {
  const f = commentFixture(), pending = defer(); let count = 0; f.send(() => { count++; return pending.promise });
  const ui = await mount(h(f.Comments, { tk: ticket })); t.after(() => ui.close());
  await type(ui.host.querySelector('textarea'), 'first draft');
  window.matchMedia = () => ({ matches: false });
  await key(ui.host.querySelector('textarea'), 'Enter'); assert.equal(count, 0);
  window.matchMedia = () => ({ matches: true });
  await key(ui.host.querySelector('textarea'), 'Enter', { isComposing: true }); assert.equal(count, 0);
  await click(ui.host.querySelector('button')); assert.equal(count, 1);
  await ui.render(h(f.Comments, { tk: { id: 'ticket-2', comments: [] } }));
  assert.equal(ui.host.querySelector('textarea').value, '');
  await flush(() => pending.reject(new Error('offline'))); assert.equal(ui.host.querySelector('[role="alert"]'), null);
  await type(ui.host.querySelector('textarea'), 'second draft');
  await flush(() => f.scope.setAccountScope('different-session', 'other'));
  assert.equal(ui.host.textContent, '');
});

function teamFixture() {
  const me = { ...person, id: 'office', app_role: 'buero' }, scope = scopeFor(me.id);
  const ctx = { me, skillCatalog: ['Test skill'], staff: [person], branches: [{ id: 'b1', name: 'Test Studio' }, { id: 'b2', name: 'Other Studio' }], standby: [], quizzes: [], attempts: [], steps: [], news: [], newsReads: [], reload: () => Promise.resolve() };
  const updates = [], calls = [], notices = []; let response = q => ({ data: q.table === 'employees' ? { id: person.id } : [], error: null });
  const client = {
    from(table) {
      const q = { table, filters: {}, payload: null }, builder = {};
      for (const method of ['select', 'update', 'eq', 'abortSignal', 'maybeSingle']) builder[method] = (...args) => { if (method === 'update') q.payload = args[0]; if (method === 'eq') q.filters[args[0]] = args[1]; return builder };
      builder.then = (yes, no) => { if (q.payload) updates.push(q); return Promise.resolve().then(() => response(q)).then(yes, no) };
      return builder;
    },
    functions: { invoke: async (fn, { body }) => { calls.push(body); return { data: { ok: true }, error: null } } },
  };
  const kit = new Proxy({
    Select: ({ label = 'role', value, onChange, options, disabled }) => h('select', { 'aria-label': label, value, disabled, onChange: e => onChange(e.target.value) }, options.map(o => h('option', { key: o.value, value: o.value }, o.label))),
    Dot: ({ children }) => h('span', null, children),
    Field: ({ label, children }) => h('label', null, label, children),
    DataRow: ({ label, value }) => h('div', null, label, value), isTest: () => false, inBranch: (p, b) => p.branch_id === b,
    btn: 'btn', btn2: 'btn2', inpStone: 'input',
  }, { get: (target, name) => Object.hasOwn(target, name) ? target[name] : ({ children }) => h('div', null, children) });
  const { PersonPage } = loadTsx(process.env.TEAMHUB_ROLE_SOURCE || path.join(base, 'src/admin/Team.tsx'), {
    '../lib/account-scope': scope, '../lib/supabase': { supabase: client }, '../lib/phorest': { phorest: async () => ({ ok: false }) },
    '../store': { useApp: () => ctx, addDays: () => '2026-01-01', fmtDate: () => 'day', inNewsAudience: () => true },
    '../People': { Avatar: () => null }, '../Toast': { toast: (...args) => notices.push(args) }, '../Performance': { PersonPerformance: () => null }, './kit': kit,
  }, 'export { PersonPage };');
  globalThis.confirm = () => true;
  return { scope, ctx, updates, calls, notices, PersonPage, respond(fn) { response = fn } };
}
function select(node, value) { return React.act(async () => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve() }) }
const page = (f, p) => h(f.PersonPage, { p, pos: null, onBack() {}, onStep() {} });
const saveButton = host => [...host.querySelectorAll('button')].find(b => b.textContent === 'Speichern');

test('real same-ID role refresh never re-submits role through profile save; untouched server fields follow latest data', async t => {
  const f = teamFixture(); const ui = await mount(page(f, person)); t.after(() => ui.close());
  assert.equal(ui.host.querySelectorAll('select[aria-label="role"]').length, 1, 'only one role editor');
  await select(ui.host.querySelector('select[aria-label="role"]'), 'filialleitung');
  assert.deepEqual(f.calls, [{ action: 'set_role', employee_id: person.id, app_role: 'filialleitung' }]);
  await ui.render(page(f, { ...person, app_role: 'filialleitung', branch_id: 'b2' }));
  const displayedBranch = ui.host.querySelector('select[aria-label="Studio"]').value;
  await type(ui.host.querySelector('input'), 'Edited job');
  await click(saveButton(ui.host));
  assert.equal(f.updates.length, 1); assert.equal(f.updates[0].payload.job_title, 'Edited job');
  assert.ok(!Object.hasOwn(f.updates[0].payload, 'app_role'), 'profile save must never revert the separately updated role');
  assert.equal(displayedBranch, 'b2');
  assert.ok(!Object.hasOwn(f.updates[0].payload, 'branch_id'));
  assert.equal(f.updates[0].filters.job_title, person.role, 'conditional write protects unseen concurrent edits');
});

test('same-ID server updates preserve draft but block conflicting write; server race/failure keeps retry draft', async t => {
  const f = teamFixture(); const ui = await mount(page(f, person)); t.after(() => ui.close());
  await type(ui.host.querySelector('input'), 'My draft');
  await ui.render(page(f, { ...person, role: 'Concurrent job' }));
  assert.equal(ui.host.querySelector('input').value, 'My draft');
  await click(saveButton(ui.host)); assert.equal(f.updates.length, 0); assert.match(ui.host.querySelector('[role="alert"]').textContent, /inzwischen geändert/);
  await click([...ui.host.querySelectorAll('button')].find(b => b.textContent === 'Verwerfen'));
  assert.equal(ui.host.querySelector('input').value, 'Concurrent job');
  await type(ui.host.querySelector('input'), 'New draft');
  f.respond(q => q.table === 'employees' ? { data: null, error: null } : { data: [], error: null });
  await click(saveButton(ui.host)); assert.equal(f.updates.length, 1);
  assert.match(ui.host.querySelector('[role="alert"]').textContent, /inzwischen geändert/); assert.equal(ui.host.querySelector('input').value, 'New draft');
});

test('lead cannot edit own skills/function; office can edit own function but not studio/role', async t => {
  const f = teamFixture(); f.ctx.me = { ...person, app_role: 'filialleitung' }; f.scope.setAccountScope('lead-session', person.id);
  const ui = await mount(page(f, f.ctx.me)); t.after(() => ui.close());
  assert.equal(ui.host.querySelector('input').disabled, true);
  assert.equal([...ui.host.querySelectorAll('button')].find(b => b.textContent === 'Test skill').disabled, true);
  assert.equal(ui.host.querySelector('select'), null);
  f.ctx.me = { ...person, app_role: 'buero' }; f.scope.setAccountScope('office-self', person.id);
  await ui.render(page(f, f.ctx.me));
  assert.equal(ui.host.querySelector('input').disabled, false);
  assert.equal(ui.host.querySelector('select[aria-label="Studio"]').disabled, true);
  assert.equal(ui.host.querySelector('select[aria-label="role"]'), null);
});

test('lead can view shared staff without editing profiles owned by an outside primary studio or office', async t => {
  const f = teamFixture(); f.ctx.me = { ...person, id: 'lead', app_role: 'filialleitung' }; f.scope.setAccountScope('lead-session', 'lead');
  const outside = { ...person, branch_id: 'b2', extra: ['b1'] };
  const ui = await mount(page(f, outside)); t.after(() => ui.close());
  assert.equal(ui.host.querySelector('input').disabled, true);
  assert.equal([...ui.host.querySelectorAll('button')].find(b => b.textContent === 'Test skill').disabled, true);
  assert.equal([...ui.host.querySelectorAll('button')].find(b => b.textContent === 'Deaktivieren'), undefined);
  await ui.render(page(f, { ...person, app_role: 'buero' }));
  assert.equal(ui.host.querySelector('input').disabled, true);
});

test('concurrent skill editors cannot erase another saved skill; update-zero is a conflict with no success toast', async t => {
  const f = teamFixture(); f.ctx.skillCatalog = ['First skill', 'Second skill']; let stored = [], reloads = 0;
  f.ctx.reload = async () => { reloads++ };
  f.respond(q => {
    if (!q.payload?.skills) return { data: [], error: null };
    const expected = stored.length ? '{"First skill"}' : '{}';
    if (q.filters.skills !== expected) return { data: null, error: null };
    stored = [...q.payload.skills]; return { data: { id: person.id }, error: null };
  });
  const a = await mount(page(f, person)), b = await mount(page(f, person));
  t.after(async () => { await a.close(); await b.close() });
  const btn = (ui, name) => [...ui.host.querySelectorAll('button')].find(x => x.textContent === name);
  await click(btn(a, 'First skill'));
  assert.deepEqual(stored, ['First skill']); assert.equal(f.updates[0].filters.skills, '{}');
  await click(btn(b, 'Second skill'));
  assert.deepEqual(stored, ['First skill'], 'stale whole-array write must not erase the first editor’s change');
  assert.match(b.host.querySelector('[role="alert"]').textContent, /inzwischen geändert/);
  assert.equal(f.notices.filter(x => x[0] === 'Skills gespeichert').length, 1);
  assert.equal(reloads, 2);
  assert.doesNotMatch(btn(b, 'Second skill').className, /bg-olive-700/, 'unconfirmed optimistic state resets');
  await b.render(page(f, { ...person, skills: ['First skill'] }));
  await click(btn(b, 'Second skill'));
  assert.equal(f.updates[2].filters.skills, '{"First skill"}');
  assert.deepEqual(stored, ['First skill', 'Second skill']);
  assert.equal(b.host.querySelector('[role="alert"]'), null);
});

test('skill UPDATE returning zero rows after scope revocation never reports saved', async t => {
  const f = teamFixture(); f.respond(q => ({ data: q.payload ? null : [], error: null }));
  const ui = await mount(page(f, person)); t.after(() => ui.close());
  await click([...ui.host.querySelectorAll('button')].find(x => x.textContent === 'Test skill'));
  assert.match(ui.host.querySelector('[role="alert"]').textContent, /nicht mehr bearbeitbar/);
  assert.equal(f.notices.some(x => x[0] === 'Skills gespeichert'), false);
});

test('skill comparison encodes empty, comma, quote and backslash values as PostgreSQL text arrays', () => {
  const { postgresTextArray } = loadTsx(path.join(base, 'src/lib/person-profile-draft.ts'));
  assert.equal(postgresTextArray([]), '{}');
  assert.equal(postgresTextArray(['A,B', 'A"B', 'A\\B', '', 'NULL']), '{"A,B","A\\"B","A\\\\B","","NULL"}');
});
