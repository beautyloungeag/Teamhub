import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleFrame, paneScrollTop, installMobileViewport } from '../src/lib/mobile-viewport.ts'

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
    Object.assign(globalThis,{innerWidth:740,innerHeight:360});root.clientHeight=360;vv.height=260;vv.offsetTop=0;vv.dispatchEvent(new Event('resize'));flush()
    assert.equal(root.dataset.keyboardOpen,'true');assert.equal(styles.get('--app-height'),'260px')
    stop();vv.height=400;vv.dispatchEvent(new Event('resize'));assert.equal(queue.size,0)
  } finally { for(const k of names){const d=originals[k];if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k)} }
})
