// Wissensartikel als Folien (Vorlage der Inhaberin 26.10.): oben eine Wischgalerie, je Folie ein Foto mit der
// wichtigsten Info im Balken, darunter Text und Video. Die Folien entstehen aus den vorhandenen Bausteinen, damit
// alle importierten Artikel ohne Nacharbeit funktionieren:
// - jede Zwischenüberschrift und jeder Schritt beginnt eine Folie,
// - das erste Bild danach wird das Folienfoto, jedes weitere Bild eine eigene Folie,
// - der erste kurze Satz wandert in den Balken und fehlt dafür im Text darunter.
import type { WikiBlock } from '../store'

export type SlideStep = { key: string; title: string | null; text: string | null; parts?: string[] }
export type SlideItem =
  | { k: 'block'; b: WikiBlock }
  | { k: 'step'; step: SlideStep; no: number }
  | { k: 'check'; key: number; title?: string; items: string[] }
  | { k: 'section'; key: string; no: number; title: string }
export type SlideBody =
  | { k: 'block'; b: WikiBlock }
  | { k: 'check'; key: number; title?: string; items: string[] }
  | { k: 'text'; text: string }
  | { k: 'parts'; parts: string[] }
export type Kicker = { k: 'step'; no: number; total: number } | { k: 'photo'; no: number; total: number } | { k: 'wichtig' } | { k: 'text'; text: string }
export type Slide = { key: string; kind: 'cover' | 'section' | 'step' | 'photo' | 'quiz'; kicker?: Kicker; title: string; sub?: string; photo?: string; body: SlideBody[]; stepKey?: string }

export const plain = (x: string) => x.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim()
const balance = (x: string) => ((x.match(/\*\*/g) ?? []).length % 2 ? x.replace(/\*\*/g, '') : x)

/** Erster kurzer Satz für den Balken, Rest für den Text darunter. */
export function lead(text: string, max = 140): { sub?: string; rest: string } {
  const flat = plain(text)
  if (!flat) return { rest: '' }
  if (flat.length <= max) return { sub: flat, rest: '' }
  const m = text.match(/^([\s\S]{12,}?[.!?])(\s+)(?=\S)/)
  if (m && plain(m[1]).length <= max) return { sub: plain(m[1]), rest: balance(text.slice(m[0].length)) }
  return { rest: text }
}

const isWichtig = (x: string) => /^wichtig/i.test(x.trim())

export function buildSlides(items: SlideItem[], cover: { title: string; intro?: string }, totalSteps: number): Slide[] {
  const coverSlide: Slide = { key: 'cover', kind: 'cover', title: cover.title, sub: cover.intro || undefined, body: [] }
  const slides: Slide[] = [coverSlide]
  let cur = coverSlide, pending: string | null = null
  let lastP: { slide: Slide; where: 'sub' | 'body'; text: string; item?: SlideBody } | null = null
  const empty = (s: Slide) => s !== coverSlide && !s.photo && !s.body.length && !s.sub && !s.stepKey
  const open = (s: Slide) => {
    if (empty(cur)) { slides.pop(); pending = cur.title } // Überschrift ohne Inhalt: wird Oberzeile der nächsten Folie
    if (pending && !s.kicker) s.kicker = { k: 'text', text: pending }
    pending = null
    slides.push(s); cur = s
  }
  const heading = (key: string, title: string, stepKey?: string) =>
    open({ key, kind: 'section', title: title.replace(/\s*(\.\.\.|…|:)\s*$/, ''), kicker: isWichtig(title) ? { k: 'wichtig' } : undefined, body: [], stepKey })
  items.forEach((it, i) => {
    if (it.k === 'section') { lastP = null; return heading('s' + it.key, it.title, it.key) }
    if (it.k === 'step') {
      const s = it.step
      let title = s.title ?? '', sub: string | undefined, body: SlideBody[] = []
      if (s.parts?.length) {
        const first = s.parts[0]
        if (plain(first).length <= 120) { sub = plain(first); body = s.parts.length > 1 ? [{ k: 'parts', parts: s.parts.slice(1) }] : [] }
        else body = [{ k: 'parts', parts: s.parts }]
      } else if (s.text) {
        if (title) { const l = lead(s.text); sub = l.sub; if (l.rest) body = [{ k: 'text', text: l.rest }] }
        else { const l = lead(s.text, 90); title = l.sub ?? plain(s.text).slice(0, 80); if (l.rest || !l.sub) body = [{ k: 'text', text: l.sub ? l.rest : s.text }] }
      }
      lastP = null
      return open({ key: 's' + s.key, kind: 'step', kicker: { k: 'step', no: it.no, total: totalSteps }, title: title || `${it.no}`, sub, body, stepKey: s.key })
    }
    // Materialliste mit Überschrift: eigene Folie (Vorlage: „Wische nach rechts für die Materialien“)
    if (it.k === 'check') { lastP = null
      if (it.title) return open({ key: 'c' + it.key, kind: 'section', title: it.title, body: [{ k: 'check', key: it.key, items: it.items }] })
      return void cur.body.push({ k: 'check', key: it.key, items: it.items }) }
    const b = it.b
    if (b.t === 'h') { lastP = null; return heading('h' + i, b.text ?? '') }
    if (b.t === 'img') {
      if (!b.src) return
      if (!cur.photo) { cur.photo = b.src; lastP = null; return }
      // Kurzer Satz direkt vor dem Bild ist dessen Bildunterschrift
      let title = cur.title
      if (lastP && plain(lastP.text).length <= 140) {
        title = plain(lastP.text)
        if (lastP.where === 'sub') lastP.slide.sub = undefined; else lastP.slide.body.splice(lastP.slide.body.indexOf(lastP.item!), 1)
      }
      lastP = null
      return open({ key: 'p' + i, kind: 'photo', title, photo: b.src, body: [] })
    }
    // Erster Absatz einer Folie ohne Balkentext: kurzer Satz in den Balken
    if (b.t === 'p' && cur !== coverSlide && !cur.sub && !cur.body.length && b.text) {
      const l = lead(b.text)
      if (l.sub) { cur.sub = l.sub; lastP = l.rest ? null : { slide: cur, where: 'sub', text: b.text }; if (l.rest) cur.body.push({ k: 'text', text: l.rest }); return }
    }
    const item: SlideBody = { k: 'block', b }
    cur.body.push(item)
    lastP = b.t === 'p' && b.text ? { slide: cur, where: 'body', text: b.text, item } : null
  })
  if (empty(cur)) slides.pop()
  // Mehrere Bilder hintereinander: „Bild 2 von 3“
  for (let i = 0; i < slides.length; i++) {
    if (slides[i].kind !== 'photo') continue
    let start = i; while (start > 0 && slides[start].kind === 'photo') start--
    let end = i; while (end + 1 < slides.length && slides[end + 1].kind === 'photo') end++
    for (let j = i; j <= end; j++) slides[j].kicker = { k: 'photo', no: j - start + 1, total: end - start + 1 }
    i = end
  }
  return slides
}
