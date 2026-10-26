// Wissensartikel als Folien (Vorlage der Inhaberin 26.10.): oben eine Wischgalerie, je Folie ein Foto mit der
// wichtigsten Info im Balken, darunter Text und Video. Die Folien entstehen aus den vorhandenen Bausteinen, damit
// alle importierten Artikel ohne Nacharbeit funktionieren:
// - jede Zwischenüberschrift und jeder Schritt beginnt eine Folie,
// - das erste Bild danach wird das Folienfoto, jedes weitere Bild eine eigene Folie,
// - der erste kurze Satz wandert in den Balken und fehlt dafür im Text darunter.
import type { ItemMedia, WikiBlock } from '../store'

export type SlideStep = { key: string; title: string | null; text: string | null; parts?: string[]; media?: ItemMedia | null }
export type SlideItem =
  | { k: 'block'; b: WikiBlock }
  | { k: 'step'; step: SlideStep; no: number }
  | { k: 'check'; key: number; title?: string; items: string[] }
  | { k: 'section'; key: string; no: number; title: string }
  | { k: 'point'; key: string; text: string; media: ItemMedia | null }
export type SlideBody =
  | { k: 'block'; b: WikiBlock }
  | { k: 'check'; key: number; title?: string; items: string[] }
  | { k: 'text'; text: string }
  | { k: 'parts'; parts: string[] }
export type Kicker = { k: 'step'; no: number; total: number } | { k: 'photo'; no: number; total: number } | { k: 'point'; no: number; total: number } | { k: 'wichtig' } | { k: 'video' } | { k: 'text'; text: string }
export type Slide = { key: string; kind: 'cover' | 'section' | 'step' | 'photo' | 'quiz'; kicker?: Kicker; title: string; sub?: string; photo?: string; video?: ItemMedia; body: SlideBody[]; stepKey?: string; no?: number }

export const plain = (x: string) => x.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim()
const balance = (x: string) => ((x.match(/\*\*/g) ?? []).length % 2 ? x.replace(/\*\*/g, '') : x)

/** Erster kurzer Satz für den Balken, Rest für den Text darunter. */
export function lead(text: string, max = 140): { sub?: string; rest: string } {
  const flat = plain(text)
  if (!flat) return { rest: '' }
  if (flat.length <= max) return { sub: flat, rest: '' }
  const m = text.match(/^([\s\S]{12,}?[.!?])(\s+)(?=\S)/)
  if (m && plain(m[1]).length <= max) return { sub: plain(m[1]), rest: balance(text.slice(m[0].length)) }
  // Langer erster Satz: Anfang in den Balken, der ganze Text bleibt darunter (26.10., „Hinweise erscheinen random“)
  return { sub: cut(flat, Math.min(max, 120)), rest: text }
}
/** Auf ein Wortende kürzen, mit … */
export const cut = (x: string, n: number) => x.length <= n ? x : x.slice(0, n).replace(/\s+\S*$/, '').replace(/[\s,;:–-]+$/, '') + ' …'

/** Liste mit Bildern oder Videos an Punkten: jeder Punkt wird eine eigene Folie (mit oder ohne Bild), damit die
 *  Reihenfolge erhalten bleibt. Listen ganz ohne Bilder bleiben wie bisher. */
export function expandList(b: WikiBlock, key: string): SlideItem[] {
  if ((b.t !== 'ul' && b.t !== 'ol') || !b.media?.some(Boolean)) return [{ k: 'block', b }]
  return (b.items ?? []).map((x, j): SlideItem => ({ k: 'point', key: `${key}-${j}`, text: x, media: b.media?.[j] ?? null }))
}

const isWichtig = (x: string) => /^wichtig/i.test(x.trim())

export function buildSlides(items: SlideItem[], cover: { title: string; intro?: string }, _totalSteps?: number): Slide[] {
  // Schritte fortlaufend zählen (zusammengefasste kurze Listen zählen nicht mit)
  const totalSteps = items.filter((x) => x.k === 'step').length
  let stepNo = 0
  const coverSlide: Slide = { key: 'cover', kind: 'cover', title: cover.title, sub: cover.intro || undefined, body: [] }
  const slides: Slide[] = [coverSlide]
  let cur = coverSlide, pending: string | null = null
  let lastP: { slide: Slide; where: 'sub' | 'body'; text: string; item?: SlideBody } | null = null
  const empty = (s: Slide) => s !== coverSlide && !s.photo && !s.video && !s.body.length && !s.sub && !s.stepKey && !s.key.startsWith('pt') && !s.key.startsWith('a')
  const open = (s: Slide) => {
    if (empty(cur)) { slides.pop(); pending = cur.title } // Überschrift ohne Inhalt: wird Oberzeile der nächsten Folie
    if (pending && !s.kicker) s.kicker = { k: 'text', text: pending }
    pending = null
    slides.push(s); cur = s
  }
  // Kurzer Satz direkt vor einem Bild oder Video ist dessen Bildunterschrift
  const caption = () => {
    const p = lastP; lastP = null
    if (!p || plain(p.text).length > 140) return null
    if (p.where === 'sub') p.slide.sub = undefined; else p.slide.body.splice(p.slide.body.indexOf(p.item!), 1)
    return plain(p.text)
  }
  const mediaOf = (m?: ItemMedia | null): Partial<Slide> => !m ? {} : m.t === 'img' ? (m.src ? { photo: m.src } : {}) : { video: m }
  // Thema für Bilder und Videos ohne Unterschrift: die letzte Überschrift, nicht der Titel eines Aufzählungspunkts
  let topic = cover.title
  const fallback = () => cur.key.startsWith('pt') ? topic : cur.title
  // Text nach einer Liste mit Bildern gehört nicht zum letzten Punkt (27.10., Renée: „Hinweise erscheinen random“):
  // er beginnt eine eigene Folie, sein erster Satz steht im Balken, ein Hinweis trägt „Wichtig“
  const afterPoints = () => cur.key.startsWith('pt')
  const leaveList = (i: number, b: WikiBlock) => {
    if (b.t === 'quote' && b.text) { const l = lead(b.text, 90); return open({ key: 'a' + i, kind: 'section', kicker: { k: 'wichtig' }, title: l.sub ?? cut(plain(b.text), 80), body: l.rest ? [{ k: 'text', text: l.rest }] : [] }) }
    if (b.t === 'p' && b.text) { const l = lead(b.text, 90); return open({ key: 'a' + i, kind: 'section', title: l.sub ?? cut(plain(b.text), 80), body: l.rest ? [{ k: 'text', text: l.rest }] : [] }) }
    return open({ key: 'a' + i, kind: 'section', title: topic, body: [{ k: 'block', b }] })
  }
  const heading = (key: string, title: string, stepKey?: string) =>
    open({ key, kind: 'section', title: title.replace(/\s*(\.\.\.|…|:)\s*$/, ''), kicker: isWichtig(title) ? { k: 'wichtig' } : undefined, body: [], stepKey })
  items.forEach((it, i) => {
    if (it.k === 'section') { lastP = null; topic = it.title; return heading('s' + it.key, it.title, it.key) }
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
      stepNo++
      return open({ key: 's' + s.key, kind: 'step', kicker: { k: 'step', no: stepNo, total: totalSteps }, title: title || `${stepNo}`, sub, body, stepKey: s.key, ...mediaOf(s.media) })
    }
    // Aufzählungspunkt mit eigenem Bild oder Video: eine Folie, der Punkt steht im Balken
    if (it.k === 'point') { lastP = null
      const l = lead(it.text, 90), title = l.sub ?? (plain(it.text).slice(0, 80) || topic)
      return open({ key: 'pt' + it.key, kind: 'photo', title, body: l.rest ? [{ k: 'text', text: l.rest }] : [], ...mediaOf(it.media) }) }
    // Materialliste mit Überschrift: eigene Folie (Vorlage: „Wische nach rechts für die Materialien“)
    if (it.k === 'check') { lastP = null
      if (it.title || afterPoints()) return open({ key: 'c' + it.key, kind: 'section', title: it.title ?? topic, body: [{ k: 'check', key: it.key, items: it.items }] })
      return void cur.body.push({ k: 'check', key: it.key, items: it.items }) }
    const b = it.b
    if (b.t === 'h') { lastP = null; topic = b.text ?? topic; return heading('h' + i, b.text ?? '') }
    if (afterPoints() && b.t !== 'img' && b.t !== 'video') { lastP = null; return void leaveList(i, b) }
    if (afterPoints() && b.t === 'img' && b.src) return open({ key: 'p' + i, kind: 'photo', title: topic, photo: b.src, body: [] })
    if (afterPoints() && b.t === 'video' && (b.src || b.url)) return open({ key: 'v' + i, kind: 'photo', title: topic, video: { t: 'video', ...(b.src ? { src: b.src } : { url: b.url }) }, body: [] })
    // Hinweis: steht auf der Folie, zu der er gehört, ganz oben unter dem Bild (vorher teils auf der Titelfolie, teils klein unten)
    if (b.t === 'quote') { const at = cur.body.findIndex((x) => !(x.k === 'block' && x.b.t === 'quote')); cur.body.splice(at < 0 ? cur.body.length : at, 0, { k: 'block', b }); return }
    // Video: in den Banner der Folie, zum Antippen; hat die Folie schon ein Bild, eine eigene Folie
    if (b.t === 'video' && (b.src || b.url)) {
      const v: ItemMedia = { t: 'video', ...(b.src ? { src: b.src } : { url: b.url }), ...(b.name ? { name: b.name } : {}) }
      if (!cur.photo && !cur.video) { cur.video = v; lastP = null; return }
      const title = caption() ?? fallback()
      return open({ key: 'v' + i, kind: 'photo', title, video: v, body: [] })
    }
    if (b.t === 'img') {
      if (!b.src) return
      if (!cur.photo && !cur.video) { cur.photo = b.src; lastP = null; return }
      return open({ key: 'p' + i, kind: 'photo', title: caption() ?? fallback(), photo: b.src, body: [] })
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
  // Mehrere Bilder hintereinander: „Bild 2 von 3“ (Aufzählungspunkte und Videos zählen nicht mit)
  const pic = (x?: Slide) => !!x && x.kind === 'photo' && !!x.photo && !x.key.startsWith('pt')
  for (let i = 0; i < slides.length; i++) {
    if (!pic(slides[i])) continue
    let start = i; while (start > 0 && pic(slides[start - 1])) start--
    // Das Foto der Folie davor ist Bild 1
    if (start > 0 && slides[start - 1].photo && !slides[start - 1].key.startsWith('pt')) start--
    let end = i; while (end + 1 < slides.length && pic(slides[end + 1])) end++
    if (end > start) for (let j = i; j <= end; j++) slides[j].kicker = { k: 'photo', no: j - start + 1, total: end - start + 1 }
    i = end
  }
  // Punkte einer Bilderliste: „Punkt 2 von 3“, ohne Bild steht die Nummer gross im Banner
  const list = (x: Slide) => x.key.startsWith('pt') ? x.key.slice(0, x.key.lastIndexOf('-')) : null
  for (let i = 0; i < slides.length; i++) {
    const l = list(slides[i]); if (!l) continue
    let end = i; while (end + 1 < slides.length && list(slides[end + 1]) === l) end++
    for (let j = i; j <= end; j++) { slides[j].no = j - i + 1; if (!slides[j].kicker) slides[j].kicker = { k: 'point', no: j - i + 1, total: end - i + 1 } }
    i = end
  }
  for (const x of slides) if (x.video && !x.kicker && x.kind !== 'cover') x.kicker = { k: 'video' }
  return slides
}

// Schritt-Erkennung (vorher in WikiDetail): nummerierte Listen und Absätze mit fettem Anfang werden Schritte,
// kurze Zeilen hintereinander eine Materialliste, sonst ab zwei Zwischentiteln je Abschnitt ein Schritt.
export type Step = { key: string; title: string | null; body: WikiBlock[] | null; text: string | null; parts?: string[]; media?: ItemMedia | null }
export type Flow = WikiBlock | { t: 'steps'; from: number; to: number } | { t: 'check'; key: number; title?: string; items: string[] }
export type Plan = { mode: 'steps' | 'sections' | 'plain'; pre: WikiBlock[]; steps: Step[]; flow: Flow[] }
// Teilschritte im Import: „-Kundin Farbkarte geben-Fräser desinfizieren“
const splitParts = (x: string) => x.split(/\s*-\s*(?=[A-ZÄÖÜ])/).map(y => y.trim()).filter(Boolean).map(y => (y.match(/\*\*/g) ?? []).length % 2 ? y.replace(/\*\*/g, '') : y)
const boldLead = (x?: string) => !!x && /^\*\*[^*]+\*\*/.test(x) && !/^\*\*[^*]+\*\*\s*·/.test(x)
const shortLine = (b: WikiBlock) => b.t === 'p' && !!b.text && b.text.length <= 45 && !/[.:!?]$/.test(b.text) && !b.text.includes('**')

export function planArticle(blocks: WikiBlock[] | null): Plan {
  const steps: Step[] = [], flow: Flow[] = []
  if (!blocks) return { mode: 'plain', pre: [], steps, flow }
  // Bilder zwischen Schritten (vom Büro ergänzt) unterbrechen die Schrittfolge nicht
  const boldAfterImages = (j: number) => { while (blocks[j]?.t === 'img') j++; return blocks[j]?.t === 'p' && boldLead(blocks[j].text) }
  const afterSteps = () => { for (let k = flow.length - 1; k >= 0; k--) { const f = flow[k]; if (f.t === 'steps') return true; if (f.t !== 'img') return false } return false }
  for (let i = 0; i < blocks.length; i++) {
    const x = blocks[i]
    if (x.t === 'ol') { const from = steps.length
      x.items?.forEach((it, j) => { const m = it.match(/^\*\*([^*]+)\*\*[:\s–-]*([\s\S]*)$/); steps.push({ key: `o${i}-${j}`, title: m ? m[1] : null, body: null, text: m ? m[2] : it, media: x.media?.[j] ?? null }) })
      flow.push({ t: 'steps', from, to: steps.length }); continue }
    if (x.t === 'p' && boldLead(x.text) && (boldLead(blocks[i + 1]?.text) || afterSteps() || (blocks[i + 1]?.t === 'img' && boldAfterImages(i + 1)))) { const from = steps.length
      while (i < blocks.length && blocks[i].t === 'p' && boldLead(blocks[i].text)) {
        const m = blocks[i].text!.match(/^\*\*([^*]+)\*\*([\s\S]*)$/)!
        const head = splitParts(m[1].replace(/^\d+\.\s*/, '')), rest = [...head.slice(1), ...splitParts(m[2].replace(/^[\s:–-]+/, ''))]
        steps.push({ key: `b${i}`, title: head[0] ?? m[1], body: null, text: rest.length === 1 ? rest[0] : null, parts: rest.length > 1 ? rest : undefined }); i++ }
      i--; flow.push({ t: 'steps', from, to: steps.length }); continue }
    if (shortLine(x) && blocks.slice(i, i + 4).every(shortLine)) { const items: string[] = [], key = i
      const prev = flow[flow.length - 1], title = prev && prev.t === 'h' ? (flow.pop() as WikiBlock).text : undefined
      while (i < blocks.length && shortLine(blocks[i])) items.push(blocks[i++].text!)
      i--; flow.push({ t: 'check', key, title, items }); continue }
    flow.push(x)
  }
  if (steps.length) return { mode: 'steps', pre: [], steps, flow }
  if (blocks.filter(x => x.t === 'h').length >= 2) {
    const pre: WikiBlock[] = []; let cur: Step | null = null
    blocks.forEach((x, i) => { if (x.t === 'h') { cur = { key: 'h' + i, title: x.text ?? '', body: [], text: null }; steps.push(cur) } else if (cur) cur.body!.push(x); else pre.push(x) })
    return { mode: 'sections', pre, steps, flow: [{ t: 'steps', from: 0, to: steps.length }] }
  }
  return { mode: 'plain', pre: [], steps, flow }
}
