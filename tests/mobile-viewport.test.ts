import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DESKTOP_MEDIA, visibleFrame, paneScrollTop, installMobileViewport } from '../src/lib/mobile-viewport.ts'

test('visible viewport accounts for keyboard height and pan together; stale closed-keyboard offset is bounded', () => {
  assert.deepEqual(visibleFrame(800, { height: 340, offsetTop: 180, scale: 1 }), { height: 340, top: 180 })
  assert.deepEqual(visibleFrame(800, { height: 800, offsetTop: 180, scale: 1 }), { height: 800, top: 0 })
  assert.deepEqual(visibleFrame(800, { height: 340, offsetTop: 900, scale: 1 }), { height: 340, top: 460 })
  assert.deepEqual(visibleFrame(800, { height: 340, offsetTop: -30, scale: 1 }), { height: 340, top: 0 })
})
test('zoom preserves the existing layout and absent or invalid viewport has a full-height fallback', () => {
  assert.equal(visibleFrame(800, { height: 400, offsetTop: 100, scale: 2 }), null)
  assert.deepEqual(visibleFrame(800, null), { height: 800, top: 0 })
  assert.deepEqual(visibleFrame(800, { height: NaN, offsetTop: 0, scale: 1 }), { height: 800, top: 0 })
})
test('focused fields scroll only the pane by the minimum distance; long transcripts stay bounded', () => {
  const pane = { top: 60, height: 200, scrollTop: 100, scrollHeight: 1000 }
  assert.equal(paneScrollTop(pane, { top: 100, bottom: 144 }), 100)
  assert.equal(paneScrollTop(pane, { top: 280, bottom: 324 }), 176)
  assert.equal(paneScrollTop(pane, { top: 0, bottom: 44 }), 28)
  assert.equal(paneScrollTop(pane, { top: 2000, bottom: 2044 }, 'end'), 800)
  assert.equal(paneScrollTop(pane, { top: -500, bottom: -456 }, 'start'), 0)
})
test('resize AND pan events update the shell; zoom, keyboard dismissal and listener cleanup preserve usable geometry', () => {
  const names = ['window','document','innerHeight','innerWidth','HTMLElement','requestAnimationFrame','cancelAnimationFrame']
  const originals = Object.fromEntries(names.map(k => [k, Object.getOwnPropertyDescriptor(globalThis,k)]))
  const styles = new Map<string,string>(), queue = new Map<number,FrameRequestCallback>()
  const win = new EventTarget(), doc = new EventTarget(), vv = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 })
  class Element { matches() { return true } parentElement = null }
  const root = { clientHeight:800, style:{setProperty:(k:string,v:string)=>styles.set(k,v)},dataset:{} as Record<string,string>,classList:{contains:()=>false} }
  Object.assign(win,{visualViewport:vv})
  Object.assign(doc,{documentElement:root,activeElement:null,body:{}})
  let seq=0
  try {
    Object.assign(globalThis,{window:win,document:doc,innerHeight:800,innerWidth:393,HTMLElement:Element,requestAnimationFrame:(f:FrameRequestCallback)=>{queue.set(++seq,f);return seq},cancelAnimationFrame:(id:number)=>queue.delete(id)})
    const flush=()=>{for(const [id,f] of [...queue]){queue.delete(id);f(0)}}
    const stop=installMobileViewport()
    Object.assign(doc,{activeElement:new Element()});doc.dispatchEvent(new Event('focusin'))
    vv.height=340;vv.offsetTop=140;vv.dispatchEvent(new Event('resize'));flush()
    assert.equal(styles.get('--app-height'),'340px');assert.equal(styles.get('--app-top'),'140px');assert.equal(root.dataset.keyboardOpen,'true')
    vv.offsetTop=200;vv.dispatchEvent(new Event('scroll'));flush();assert.equal(styles.get('--app-top'),'200px')
    vv.scale=2;vv.height=170;vv.dispatchEvent(new Event('resize'));flush();assert.equal(styles.get('--app-height'),'340px')
    vv.scale=1;vv.height=800;vv.dispatchEvent(new Event('resize'));flush();assert.equal(styles.get('--app-top'),'0px');assert.equal(root.dataset.keyboardOpen,'false')
    Object.assign(globalThis,{innerWidth:852,innerHeight:393});root.clientHeight=393;vv.height=160;vv.offsetTop=0;vv.dispatchEvent(new Event('resize'));flush()
    assert.equal(root.dataset.keyboardOpen,'true');assert.equal(styles.get('--app-height'),'160px')
    stop();vv.height=400;vv.dispatchEvent(new Event('resize'));assert.equal(queue.size,0)
  } finally { for(const k of names){const d=originals[k];if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k)} }
})

// Source contract: changing only JS routing or only the frame CSS would leave
// md:hidden navigation / md:flex sidebars inconsistent on a landscape phone.
test('landscape touch keeps one mobile canvas predicate across routing, md utilities and keyboard/login rules', () => {
  assert.equal(DESKTOP_MEDIA, '(min-width: 768px) and (hover: hover) and (pointer: fine)')
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const mobile = readFileSync(new URL('../src/Mobile.tsx', import.meta.url), 'utf8')
  assert.ok(css.includes('@custom-variant md {\n  @media ' + DESKTOP_MEDIA + ' { @slot; }'))
  assert.equal(css.split('@media not all and ' + DESKTOP_MEDIA).length - 1, 4)
  assert.ok(css.includes('@media ' + DESKTOP_MEDIA + '{.app-top-space'))
  assert.ok(!css.includes('@media(max-width:767px)'))
  assert.equal(app.split('matchMedia(DESKTOP_MEDIA)').length - 1, 2)
  assert.ok(mobile.includes('matchMedia(DESKTOP_MEDIA).matches'))
})

test('short keyboard frames can scroll an oversized composer into view and attachments cannot stack four rows', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const chat = readFileSync(new URL('../src/BenniChat.tsx', import.meta.url), 'utf8')
  assert.ok(css.includes('.chat-screen{overflow-x:hidden;overflow-y:auto;overflow-wrap:anywhere}'))
  assert.ok(css.includes('.chat-composer-attachments{flex-wrap:nowrap;overflow-x:auto;'))
  assert.ok(css.includes('.chat-composer-attachments>span{flex-shrink:0}'))
  assert.ok(chat.includes('className="chat-composer-attachments'))
  // Extreme keyboard frame: header + attachments + composer exceed available
  // height. Both the text field and the final send control remain reachable in
  // the canvas, while scrolling is clamped to its content (not the document).
  const canvas = { top: 80, height: 160, scrollTop: 0, scrollHeight: 320 }
  assert.equal(paneScrollTop(canvas, { top: 290, bottom: 334 }), 106)
  assert.equal(paneScrollTop(canvas, { top: 350, bottom: 394 }), 160)
})
