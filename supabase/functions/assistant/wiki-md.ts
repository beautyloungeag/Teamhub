// Marc schreibt Wissensartikel als einfaches Markdown; hier wird daraus das Bausteine-Format (wiki_articles.blocks),
// dasselbe wie im Editor. Bilder stehen als Platzhalter im Text:
//   [[foto N]]  = N-tes Foto, das die Person in dieser Nachricht angehängt hat
//   [[bild K]]  = K-tes Bild, das schon im Artikel ist (Nummer aus wiki_outline)
//   [[video URL]] = YouTube-Link
// Ein Platzhalter am Ende eines Aufzählungspunkts gehört zu diesem Punkt (in der App eine eigene Folie).
export type Block = { t: string; text?: string; items?: string[]; media?: (Media | null)[]; src?: string; url?: string; name?: string; level?: number }
export type Media = { t: 'img' | 'video'; src?: string; url?: string; name?: string }

const TOKEN = /\[\[\s*(foto|bild|video)\s+([^\]]+?)\s*\]\]/i
const BULLET = /^\s*(?:[-•*·]\s+)/
const NUMBER = /^\s*\d{1,3}[.)]\s+/

/** Platzhalter → Medium. Fotos aus dem Chat bekommen vorläufig `staged:N`, die Ausführung ersetzt sie. */
function media(kind: string, arg: string, old: string[]): Media | null {
  const k = kind.toLowerCase()
  if (k === 'video') return /^https?:\/\//.test(arg) ? { t: 'video', url: arg } : null
  const n = Math.round(Number(arg))
  if (!(n >= 1)) return null
  if (k === 'foto') return { t: 'img', src: `staged:${n - 1}` }
  return old[n - 1] ? { t: 'img', src: old[n - 1] } : null
}
const asBlock = (m: Media): Block => m.t === 'img' ? { t: 'img', src: m.src } : { t: 'video', ...(m.src ? { src: m.src } : { url: m.url }) }

export function mdToBlocks(md: string, oldImages: string[] = []): { blocks: Block[]; bad: string[] } {
  const out: Block[] = [], bad: string[] = []
  let para: string[] = [], list: { t: 'ul' | 'ol'; items: string[]; media: (Media | null)[] } | null = null
  const flushPara = () => { if (para.length) out.push({ t: 'p', text: para.join('\n') }); para = [] }
  const flushList = () => {
    if (list) out.push(list.media.some(Boolean) ? { t: list.t, items: list.items, media: list.media } : { t: list.t, items: list.items })
    list = null
  }
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) { flushPara(); flushList(); continue }
    const tag = BULLET.test(line) ? 'ul' : NUMBER.test(line) ? 'ol' : null
    if (tag) {
      flushPara()
      if (list && list.t !== tag) flushList()
      if (!list) list = { t: tag, items: [], media: [] }
      let text = line.replace(tag === 'ul' ? BULLET : NUMBER, '')
      const m = text.match(TOKEN)
      let med: Media | null = null
      if (m) { med = media(m[1], m[2], oldImages); if (!med) bad.push(m[0]); text = text.replace(TOKEN, '').trim() }
      list.items.push(text.trim()); list.media.push(med)
      continue
    }
    flushList()
    const tok = line.trim().match(new RegExp(`^${TOKEN.source}$`, 'i'))
    if (tok) { flushPara(); const m = media(tok[1], tok[2], oldImages); if (m) out.push(asBlock(m)); else bad.push(tok[0]); continue }
    const h = line.match(/^(#{1,3})\s+(.+)$/)
    if (h) { flushPara(); out.push({ t: 'h', text: h[2].trim(), level: h[1].length >= 3 ? 3 : 2 }); continue }
    const q = line.match(/^\s*(?:>\s*|hinweis:\s*)(.+)$/i)
    if (q) { flushPara(); const last = out[out.length - 1]; if (last?.t === 'quote') last.text += '\n' + q[1].trim(); else out.push({ t: 'quote', text: q[1].trim() }); continue }
    para.push(line.trim())
  }
  flushPara(); flushList()
  return { blocks: out, bad }
}

const plain = (x: string) => x.replace(/\*\*/g, '').replace(/\*([^*\n]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
/** Volltext für Suche und Lesedauer, wie beim Speichern im Editor */
export function bodyOf(intro: string, blocks: Block[]): string {
  return [intro, ...blocks.map((b) => b.t === 'ul' || b.t === 'ol' ? (b.items ?? []).join('\n') : b.text ?? '').map(plain)].filter((x) => x.trim()).join('\n\n')
}
export function minutesOf(body: string, blocks: Block[]): number {
  const imgs = blocks.filter((b) => b.t === 'img').length + blocks.flatMap((b) => b.media ?? []).filter((m) => m?.t === 'img').length
  return Math.max(1, Math.round((body.split(/\s+/).filter(Boolean).length + imgs * 15) / 180))
}
/** Bildpfade eines Artikels in Lesereihenfolge (für [[bild K]]) */
export function imagesOf(blocks: Block[]): string[] {
  return blocks.flatMap((b) => [b.t === 'img' && b.src ? b.src : null, ...(b.media ?? []).map((m) => m?.t === 'img' ? m.src ?? null : null)]).filter((x): x is string => !!x)
}
