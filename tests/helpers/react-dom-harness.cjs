const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

// Set DOM globals before loading react-dom: its input-event support is detected
// at import time. These tests run in node:test's separate file processes.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://qa.invalid/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'MutationObserver']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key], writable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = fn => setTimeout(() => fn(Date.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
class Observer { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = Observer;
globalThis.IntersectionObserver = Observer;
const React = require('react');
const { createRoot } = require('react-dom/client');

function loadTsx(file, stubs = {}, expose = '') {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    // The production fixture disables Vite's local-only demo data switch.
    let source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.DEV', 'false');
    if (filename === path.resolve(file)) source += '\n' + expose;
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const resolve = id => {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), id);
        const found = ['', '.ts', '.tsx', '.js'].map(ext => base + ext).find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (!found) throw new Error('Cannot resolve test dependency ' + id);
        return load(found);
      }
      return require(id);
    };
    const fn = vm.runInThisContext('(function(require,module,exports){\n' + compiled + '\n})', { filename });
    fn(resolve, module, module.exports);
    return module.exports;
  }
  return load(file);
}
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } };
async function mount(element) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await React.act(async () => { root.render(element); await Promise.resolve() });
  return { host, root, async render(next) { await React.act(async () => { root.render(next); await Promise.resolve() }) }, async close() { await React.act(async () => root.unmount()); host.remove() } };
}
async function flush(work = () => {}) { await React.act(async () => { await work(); await new Promise(resolve => setTimeout(resolve, 5)) }) }
async function type(input, value) {
  const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve() });
}
async function click(button) { await React.act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve() }) }
async function key(element, key, options = {}) { await React.act(async () => { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options })); await Promise.resolve() }) }
module.exports = { React, dom, loadTsx, defer, mount, flush, type, click, key };
