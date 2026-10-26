// Wissen bearbeiten mit einem normalen Dokument-Editor (Tiptap, 26.10. nach Renées Rückmeldung) — gespeichert wird
// weiter im Bausteine-Format (wiki_articles.blocks), damit App-Folien, Übersetzung und Marc unverändert bleiben.
// blocksToHtml: Bausteine → HTML für den Editor. docToBlocks: Editor-Inhalt (JSON) → Bausteine.
// textToHtml: eingefügter Klartext mit Aufzählungszeichen (• - * 1.) wird zu echten Listen.
import type { WikiBlock } from '../store'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** **fett**, *kursiv*, [Text](Link), Zeilenumbruch → HTML */
export const mdInline = (s: string) => esc(s)
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>')

export function blocksToHtml(bs: WikiBlock[], urls: Record<string, string>): string {
  return bs.map((b) => {
    switch (b.t) {
      case 'h': return `<h${b.level === 3 ? 3 : 2}>${esc(b.text ?? '')}</h${b.level === 3 ? 3 : 2}>`
      case 'p': return `<p>${mdInline(b.text ?? '')}</p>`
      case 'quote': return `<blockquote><p>${mdInline(b.text ?? '')}</p></blockquote>`
      case 'ul': case 'ol': return `<${b.t}>${(b.items ?? []).map((x) => `<li><p>${mdInline(x)}</p></li>`).join('')}</${b.t}>`
      case 'img': return b.src ? `<img src="${esc(urls[b.src] ?? (/^https?:/.test(b.src) ? b.src : ''))}" data-path="${esc(b.src)}">` : ''
      case 'video': return b.src ? `<div data-media="video" data-src="${esc(b.src)}" data-name="${esc(b.name ?? '')}"></div>` : b.url ? `<div data-media="yt" data-url="${esc(b.url)}"></div>` : ''
      case 'file': return b.src ? `<div data-media="file" data-src="${esc(b.src)}" data-name="${esc(b.name ?? '')}"></div>` : ''
      default: return ''
    }
  }).join('')
}

type Mark = { type: string; attrs?: Record<string, any> }
export type J = { type: string; attrs?: Record<string, any>; content?: J[]; text?: string; marks?: Mark[] }

const inline = (nodes: J[] = []) => nodes.map((n) => {
  if (n.type === 'hardBreak') return '\n'
  if (n.type !== 'text' || !n.text) return ''
  let t = n.text
  const has = (m: string) => n.marks?.some((x) => x.type === m)
  // Leerzeichen am Rand bleiben ausserhalb der Sterne, sonst greift **fett** nicht
  const lead = t.match(/^\s*/)![0], tail = t.match(/\s*$/)![0], core = t.trim()
  if (core) {
    t = core
    if (has('bold')) t = `**${t}**`
    if (has('italic')) t = `*${t}*`
    const link = n.marks?.find((x) => x.type === 'link')?.attrs?.href
    if (link) t = `[${t}](${link})`
    t = lead + t + tail
  }
  return t
}).join('')
const textOf = (n: J): string => n.type === 'text' ? n.text ?? '' : (n.content ?? []).map(textOf).join(n.type === 'paragraph' ? '' : ' ')

// Listen flach machen (Unterlisten werden weitere Punkte). Bilder, Videos oder Dateien in einem Listenpunkt
// teilen die Liste an dieser Stelle, damit beim Speichern nichts verloren geht.
function listBlocks(list: J, tag: 'ul' | 'ol', out: WikiBlock[]) {
  let items: string[] = []
  const flush = () => { if (items.length) out.push({ t: tag, items }); items = [] }
  const walk = (l: J) => {
    for (const li of l.content ?? []) for (const c of li.content ?? []) {
      if (c.type === 'paragraph') { const x = inline(c.content).trim(); if (x) items.push(x) }
      else if (c.type === 'bulletList' || c.type === 'orderedList') walk(c)
      else if (c.type === 'image' || c.type === 'media') { flush(); out.push(...docToBlocks({ type: 'doc', content: [c] })) }
      else { const x = textOf(c).trim(); if (x) items.push(x) }
    }
  }
  walk(list); flush()
}

export function docToBlocks(doc: J): WikiBlock[] {
  const out: WikiBlock[] = []
  for (const n of doc.content ?? []) {
    if (n.type === 'paragraph') { const text = inline(n.content).trim(); if (text) out.push({ t: 'p', text }) }
    else if (n.type === 'heading') { const text = textOf(n).trim(); if (text) out.push({ t: 'h', text, level: Number(n.attrs?.level) >= 3 ? 3 : 2 }) }
    else if (n.type === 'bulletList' || n.type === 'orderedList') listBlocks(n, n.type === 'bulletList' ? 'ul' : 'ol', out)
    else if (n.type === 'blockquote') { const text = (n.content ?? []).map((p) => p.type === 'paragraph' ? inline(p.content).trim() : textOf(p).trim()).filter(Boolean).join('\n'); if (text) out.push({ t: 'quote', text }) }
    else if (n.type === 'image') { if (n.attrs?.path) out.push({ t: 'img', src: n.attrs.path }) }
    else if (n.type === 'media') {
      const a = n.attrs ?? {}
      if (a.kind === 'yt' && a.url) out.push({ t: 'video', url: a.url })
      else if (a.kind === 'video' && a.src) out.push({ t: 'video', src: a.src, ...(a.name ? { name: a.name } : {}) })
      else if (a.kind === 'file' && a.src) out.push({ t: 'file', src: a.src, name: a.name || 'Datei' })
    }
    else if (n.type === 'codeBlock') { const text = textOf(n).trim(); if (text) out.push({ t: 'p', text }) }
  }
  return out
}

const BULLET = /^\s*(?:[•·▪◦‣]\s*|[-–*]\s+)/
const NUMBER = /^\s*\d{1,3}[.)]\s+/
/** Eingefügter Klartext → HTML: Aufzählungszeilen werden Listen, Leerzeilen trennen Absätze. */
export function textToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null, para: string[] = []
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(esc).join('<br>')}</p>`); para = [] }
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li><p>${esc(x)}</p></li>`).join('')}</${list.tag}>`); list = null }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const tag = BULLET.test(line) && line.replace(BULLET, '').trim() ? 'ul' : NUMBER.test(line) ? 'ol' : null
    if (tag) {
      flushPara()
      if (list && list.tag !== tag) flushList()
      if (!list) list = { tag, items: [] }
      list.items.push(line.replace(tag === 'ul' ? BULLET : NUMBER, '').trim())
    } else if (!line.trim()) { flushPara(); flushList() }
    else { flushList(); para.push(line.trim()) }
  }
  flushPara(); flushList()
  return out.join('')
}
export const hasListLines = (text: string) => text.split(/\r?\n/).filter((l) => BULLET.test(l) || NUMBER.test(l)).length >= 2
