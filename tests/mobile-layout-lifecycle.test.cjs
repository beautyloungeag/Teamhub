const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { React, loadTsx, mount, flush } = require('./helpers/react-dom-harness.cjs');
const base = path.resolve(__dirname, '..');

test('actual desktop hook keeps touch landscape mobile and responds to a real desktop capability change', async t => {
  const viewport = loadTsx(path.join(base, 'src/lib/mobile-viewport.ts'));
  const queries = [], listeners = new Set();
  let device = { width: 393, hover: 'none', pointer: 'coarse' };
  const matches = () => device.width >= 768 && device.hover === 'hover' && device.pointer === 'fine';
  const mql = { get matches() { return matches() }, addEventListener(name, fn) { assert.equal(name, 'change'); listeners.add(fn) }, removeEventListener(name, fn) { listeners.delete(fn) } };
  const previous = window.matchMedia;
  window.matchMedia = query => { queries.push(query); assert.equal(query, viewport.DESKTOP_MEDIA); return mql };
  t.after(() => { window.matchMedia = previous });
  const { useDesktop } = loadTsx(path.join(base, 'src/App.tsx'), {
    './lib/mobile-viewport': viewport, './store': {}, './lib/auth': {}, './Mobile': { default: () => null }, './Backoffice': { default: () => null },
    './lib/start': { startParams: new URLSearchParams() }, './Login': { default: () => null }, './lib/i18n': {}, './Toast': {},
  }, 'export { useDesktop };');
  function Probe() { return React.createElement('output', null, useDesktop() ? 'desktop' : 'mobile') }
  const ui = await mount(React.createElement(Probe)); t.after(() => ui.close());
  assert.equal(ui.host.textContent, 'mobile');
  await flush(() => { device = { width: 852, hover: 'none', pointer: 'coarse' }; listeners.forEach(fn => fn()) });
  assert.equal(ui.host.textContent, 'mobile', 'rotating an iPhone must not enable desktop routing');
  await flush(() => { device = { width: 1440, hover: 'hover', pointer: 'fine' }; listeners.forEach(fn => fn()) });
  assert.equal(ui.host.textContent, 'desktop', 'ordinary mouse desktop stays desktop');
  await flush(() => { device = { width: 767, hover: 'hover', pointer: 'fine' }; listeners.forEach(fn => fn()) });
  assert.equal(ui.host.textContent, 'mobile');
  await ui.close(); assert.equal(listeners.size, 0); assert.ok(queries.length >= 2);
});
