const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { React, loadTsx, defer, mount, flush, type, click, key } = require('./helpers/react-dom-harness.cjs');
const base = path.resolve(__dirname, '..');
const message = (id, room = 'r1', body = id) => ({ id, room_id: room, sender_id: 'other', body, created_at: `2026-01-01T10:00:${id === 'new' ? '02' : '01'}.000Z` });
const success = data => ({ data, error: null });
function fixture() {
  const scope = loadTsx(path.join(base, 'src/lib/account-scope.ts'));
  scope.setAccountScope('session-a', 'employee-a');
  const ctx = { me: { id: 'employee-a', branch_id: 'b1' }, staff: [], branches: [{ id: 'b1', name: 'Test Studio' }], t: s => s, privateChats: false };
  const queries = [], channels = [], reads = [];
  let respond = q => q.table === 'chat_rooms' ? success({ id: q.filters.id || 'r1', kind: 'team', title: null }) : success([]);
  const client = {
    from(table) {
      const q = { table, filters: {}, action: 'select' };
      const builder = {};
      for (const method of ['select', 'insert', 'update', 'eq', 'order', 'limit', 'range', 'abortSignal', 'single', 'maybeSingle']) builder[method] = (...args) => {
        if (method === 'eq') q.filters[args[0]] = args[1];
        if (method === 'insert' || method === 'update') { q.action = method; q.payload = args[0] }
        if (method === 'limit') q.limit = args[0];
        if (method === 'abortSignal') q.signal = args[0];
        if (method === 'single' || method === 'maybeSingle') q.single = true;
        return builder;
      };
      builder.then = (yes, no) => { queries.push(q); return Promise.resolve().then(() => respond(q)).then(yes, no) };
      return builder;
    },
    rpc(name, args) {
      assert.equal(name, 'mark_chat_read');
      return { abortSignal() { reads.push(args); return Promise.resolve(success('2026-01-01T10:00:02Z')) } };
    },
    channel(name) {
      const ch = { name, callbacks: [], on(kind, config, fn) { this.callbacks.push({ config, fn }); return this }, subscribe(fn) { this.status = fn; channels.push(this); return this } };
      return ch;
    },
    removeChannel(ch) { ch.removed = true; return Promise.resolve() },
  };
  const mod = loadTsx(process.env.TEAMHUB_CHAT_SOURCE || path.join(base, 'src/Chats.tsx'), {
    './lib/account-scope': scope, './lib/supabase': { supabase: client }, './store': { useApp: () => ctx },
    './People': { Avatar: () => null }, './Logo': { BMark: () => null }, './lib/i18n': { locale: () => 'en-GB' },
    './lib/push': { refreshChatBadge: () => Promise.resolve() }, './Toast': { toast() {} }, './ViewportOverlay': { ViewportOverlay: ({ children }) => children },
    './lib/mobile-viewport': { scrollInPane() {} },
  });
  return { ctx, scope, queries, channels, reads, mod, respond(fn) { respond = fn }, emit(row, channel = channels.at(-1)) { channel.callbacks.find(c => c.config.event === 'INSERT').fn({ new: row }) }, status(status) { channels.at(-1).status(status) } };
}
// jsdom does not lay out. Explicit rectangles describe which *real rendered DOM*
// bubbles are visible; lifecycle, state, effects and event dispatch remain ReactDOM.
const rect = (top, bottom) => ({ x: 0, y: top, width: 320, height: bottom - top, top, bottom, left: 0, right: 320 });
function visible(host, ids = null) {
  const root = host.querySelector('.chat-screen');
  if (!root) return;
  root.getClientRects = () => [rect(0, 500)];
  const pane = root.querySelector('.overflow-y-auto');
  pane.getBoundingClientRect = () => rect(0, 400);
  for (const bubble of root.querySelectorAll('[data-chat-message-id]')) bubble.getBoundingClientRect = () => !ids || ids.includes(bubble.dataset.chatMessageId) ? rect(100, 150) : rect(450, 500);
  pane.dispatchEvent(new Event('scroll', { bubbles: true }));
}

test('real React: realtime insert during initial fetch survives snapshot; read ack waits for visible committed bubble', async t => {
  const f = fixture(), first = defer();
  f.respond(q => q.table === 'chat_messages' ? first.promise : q.table === 'chat_rooms' ? success({ id: 'r1', kind: 'team' }) : success([]));
  const ui = await mount(React.createElement(f.mod.ChatRoom, { id: 'r1', onBack() {} })); t.after(() => ui.close());
  await flush(() => f.emit(message('new', 'r1', 'Incoming realtime proof')));
  assert.equal(ui.host.querySelectorAll('[data-chat-message-id]').length, 0);
  assert.deepEqual(f.reads, []);
  await flush(() => first.resolve(success([message('old', 'r1', 'Snapshot proof')])));
  assert.match(ui.host.textContent, /Snapshot proof/);
  assert.match(ui.host.textContent, /Incoming realtime proof/, 'in-flight realtime row must remain displayed after snapshot');
  assert.deepEqual([...ui.host.querySelectorAll('[data-chat-message-id]')].map(n => n.dataset.chatMessageId), ['old', 'new']);
  assert.deepEqual(f.reads, [], 'not visible merely because fetched');
  await flush(() => visible(ui.host, ['old']));
  assert.deepEqual(f.reads, [{ p_room: 'r1', p_message: 'old' }]);
  await flush(() => visible(ui.host));
  assert.equal(f.reads.at(-1).p_message, 'new');
  await flush(() => f.emit(message('new')));
  assert.equal(ui.host.querySelectorAll('[data-chat-message-id="new"]').length, 1, 'realtime echo deduped');
});

test('empty or hidden/inert chat is never acknowledged and reconnect replaces stale snapshot', async t => {
  const f = fixture(); let rows = [];
  f.respond(q => q.table === 'chat_messages' ? success(rows) : q.table === 'chat_rooms' ? success({ id: 'r1', kind: 'team' }) : success([]));
  const ui = await mount(React.createElement(f.mod.ChatRoom, { id: 'r1', onBack() {} })); t.after(() => ui.close());
  await flush(() => visible(ui.host)); assert.deepEqual(f.reads, []);
  rows = [message('old')]; await flush(() => f.status('SUBSCRIBED'));
  ui.host.setAttribute('inert', ''); await flush(() => visible(ui.host)); assert.deepEqual(f.reads, []);
  ui.host.removeAttribute('inert');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  await flush(() => visible(ui.host)); assert.deepEqual(f.reads, []);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  await flush(() => f.status('CHANNEL_ERROR'));
  assert.match(ui.host.textContent, /Chatverbindung/);
  rows = [message('new')]; await flush(() => f.status('SUBSCRIBED'));
  assert.equal(ui.host.querySelector('[data-chat-message-id="old"]'), null);
  assert.ok(ui.host.querySelector('[data-chat-message-id="new"]'));
  await flush(() => visible(ui.host)); assert.equal(f.reads.at(-1).p_message, 'new');
});

test('room and account changes fence pending fetches, messages, acknowledgements and old draft', async t => {
  const f = fixture(), old = defer();
  f.respond(q => q.table === 'chat_messages' && q.filters.room_id === 'r1' ? old.promise : q.table === 'chat_messages' ? success([message('new', 'r2')]) : q.table === 'chat_rooms' ? success({ id: q.filters.id, kind: 'team' }) : success([]));
  const el = id => React.createElement(f.mod.ChatRoom, { id, onBack() {} });
  const ui = await mount(el('r1')); t.after(() => ui.close()); const oldChannel = f.channels[0];
  await type(ui.host.querySelector('textarea'), 'old draft');
  await ui.render(el('r2'));
  await flush(() => { old.resolve(success([message('old')])); f.emit(message('old'), oldChannel) });
  assert.equal(ui.host.querySelector('textarea').value, '');
  assert.equal(ui.host.querySelector('[data-chat-message-id="old"]'), null);
  await flush(() => f.scope.setAccountScope('session-b', 'employee-b'));
  assert.equal(ui.host.textContent, '');
  await flush(() => f.emit(message('new', 'r2')));
  assert.deepEqual(f.reads, []);
  assert.ok(f.queries.filter(q => q.filters.room_id === 'r1').every(q => q.signal.aborted));
});

test('failed load exposes retry; send is guarded and ambiguous failure reuses one message id', async t => {
  const f = fixture(), send1 = defer(); let failLoad = true, attempts = 0;
  f.respond(q => {
    if (q.table === 'chat_rooms') return success({ id: 'r1', kind: 'team' });
    if (q.action === 'insert') { attempts++; return attempts === 1 ? send1.promise : success({ ...q.payload, created_at: '2026-01-01T10:00:01Z' }) }
    if (q.table === 'chat_messages' && q.filters.id) return success(null);
    if (q.table === 'chat_messages') return failLoad ? { data: null, error: new Error('offline') } : success([]);
    return success([]);
  });
  const ui = await mount(React.createElement(f.mod.ChatRoom, { id: 'r1', onBack() {} })); t.after(() => ui.close());
  assert.match(ui.host.textContent, /Nachrichten konnten nicht geladen/);
  failLoad = false; await click([...ui.host.querySelectorAll('button')].find(b => b.textContent === 'Erneut versuchen'));
  const area = ui.host.querySelector('textarea'); await type(area, 'test body');
  await React.act(async () => { area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await Promise.resolve() });
  assert.equal(attempts, 1, 'defensive in-flight guard under same React event batch');
  await flush(() => send1.resolve({ data: null, error: new Error('lost response') }));
  assert.match(ui.host.textContent, /Entwurf bleibt erhalten/); assert.equal(area.value, 'test body');
  await click(ui.host.querySelector('button[aria-label="Senden"]'));
  const inserts = f.queries.filter(q => q.action === 'insert');
  assert.equal(inserts.length, 2); assert.equal(inserts[0].payload.id, inserts[1].payload.id);
  assert.equal(area.value, ''); assert.equal(ui.host.querySelectorAll('[data-chat-message-id]').length, 1);
});

test('summaries query each room latest row and do not replace failures with empty success', async () => {
  const f = fixture();
  const rooms = ['busy', 'quiet'].map(id => ({ id, kind: 'team', last_message_at: '2026-01-01T10:00:01Z' }));
  f.respond(q => q.table === 'chat_rooms' ? success(rooms) : q.table === 'chat_members' ? success([]) : success([message(q.filters.room_id, q.filters.room_id)]));
  const summary = await f.mod.loadChatSummaries('employee-a');
  assert.equal(summary.length, 2); assert.equal(summary[1].unread, true);
  assert.deepEqual(f.queries.filter(q => q.table === 'chat_messages').map(q => [q.filters.room_id, q.limit]), [['busy', 1], ['quiet', 1]]);
  f.respond(() => ({ data: null, error: new Error('network') }));
  await assert.rejects(f.mod.loadChatSummaries('employee-a'), /network/);
});
