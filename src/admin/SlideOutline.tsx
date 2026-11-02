// Folien-Ansicht im Wissens-Editor (29.10., Matteo: „direkt in der Folien-Ansicht arbeiten und dabei das Endprodukt sehen“).
// Links stehen die Folien, wie die App sie aus dem Text baut: Titel, Satz im Balken, Foto, was darunter steht. Antippen springt
// im Text an die Stelle und zeigt die Folie in der Handy-Vorschau. Folien mit eigener Überschrift lassen sich verschieben und löschen.
import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import { plain, type Slide } from '../lib/wiki-slides'

const norm = (x: string) => plain(x).replace(/\s*(\.\.\.|…|:)\s*$/, '').toLowerCase()

/** Inhalt einer Folie in Worten, damit man ohne Vorschau sieht, was darauf steht */
function contents(s: Slide): string[] {
  const out = new Set<string>()
  if (s.video) out.add('Video')
  for (const b of s.body) {
    if (b.k === 'text' || b.k === 'parts') out.add('Text')
    else if (b.k === 'check') out.add('Checkliste')
    else if (b.b.t === 'quote') out.add('Hinweis')
    else if (b.b.t === 'ul') out.add(b.b.check ? 'Checkliste' : 'Liste')
    else if (b.b.t === 'ol') out.add('Liste')
    else if (b.b.t === 'p' || b.b.t === 'h') out.add('Text')
    else if (b.b.t === 'img') out.add('Foto')
    else if (b.b.t === 'video') out.add('Video')
    else if (b.b.t === 'file') out.add('Datei')
  }
  return [...out]
}

/** Oberste Knoten des Dokuments mit Position */
function tops(ed: Editor) {
  const xs: { node: PMNode; pos: number }[] = []
  ed.state.doc.forEach((node, pos) => xs.push({ node, pos }))
  return xs
}

/** Die Überschrift im Text, mit der eine Folie beginnt (bei gleichen Titeln die passende Wiederholung) */
function headingOf(ed: Editor, slides: Slide[], i: number) {
  const s = slides[i]; if (!s || s.kind !== 'section') return null
  const want = norm(s.title), nth = slides.slice(0, i).filter(x => x.kind === 'section' && norm(x.title) === want).length
  const hs = tops(ed).map((x, k) => ({ ...x, k })).filter(x => x.node.type.name === 'heading' && norm(x.node.textContent) === want)
  return hs[nth] ?? null
}

/** Folie, in der der Cursor steht: nächste Überschrift davor, darin ein Schritt oder Punkt mit passendem Anfang */
export function slideAtCursor(ed: Editor, slides: Slide[]): number {
  const all = tops(ed), at = ed.state.selection.$from.index(0)
  let start = 0
  for (let k = Math.min(at, all.length - 1); k >= 0; k--) {
    const n = all[k].node
    if (n.type.name !== 'heading') continue
    const want = norm(n.textContent), nth = all.slice(0, k).filter(x => x.node.type.name === 'heading' && norm(x.node.textContent) === want).length
    const hits = slides.map((s, i) => ({ s, i })).filter(x => x.s.kind === 'section' && (norm(x.s.title) === want || (x.s.kicker?.k === 'text' && norm(x.s.kicker.text) === want)))
    if (hits[nth]) start = hits[nth].i
    break
  }
  // Schritt oder Aufzählungspunkt mit eigener Folie: Text des Absatzes, in dem der Cursor steht
  const $f = ed.state.selection.$from
  const here = norm($f.parent.textContent)
  if (here) for (let i = start; i < slides.length; i++) {
    const s = slides[i]
    if (i > start && s.kind === 'section') break
    if ((s.kind === 'step' || s.kind === 'photo') && norm(s.title) && here.startsWith(norm(s.title).slice(0, 40))) return i
  }
  return start
}

/** Im Text zur Folie springen */
export function revealSlide(ed: Editor, slides: Slide[], i: number) {
  const s = slides[i]; if (!s) return
  let pos: number | null = null
  if (s.kind === 'cover') pos = 1
  const h = headingOf(ed, slides, i)
  if (h) pos = h.pos + h.node.nodeSize - 1
  if (pos == null && norm(s.title)) {
    const want = norm(s.title).slice(0, 40)
    ed.state.doc.descendants((n, p) => { if (pos != null) return false; if (n.isTextblock && norm(n.textContent).startsWith(want)) { pos = p + n.nodeSize - 1; return false } return true })
  }
  if (pos == null) return
  const at = Math.min(pos, ed.state.doc.content.size)
  ed.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(at).run()
  // Der Editor setzt den Fokus erst im nächsten Frame und scrollt dabei an den Textanfang: danach den Absatz selbst in die Mitte holen
  const { node } = ed.view.domAtPos(at)
  const el = (node instanceof HTMLElement ? node : node.parentElement)?.closest('h2, h3, p, li, blockquote, figure') ?? null
  requestAnimationFrame(() => setTimeout(() => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30))
}

/** Abschnitt einer Folie mit eigener Überschrift: von der Überschrift bis zur nächsten */
function sectionRange(ed: Editor, slides: Slide[], i: number) {
  const h = headingOf(ed, slides, i); if (!h) return null
  const all = tops(ed), nk = all.findIndex((x, k) => k > h.k && x.node.type.name === 'heading')
  // Leere Zeilen am Ende gehören nicht zur Folie (sonst wandert die leere Schlusszeile mit und lässt eine Lücke)
  let end = nk < 0 ? all.length : nk
  while (end - 1 > h.k && all[end - 1].node.type.name === 'paragraph' && !all[end - 1].node.textContent.trim()) end--
  return { from: h.pos, to: end < all.length ? all[end].pos : ed.state.doc.content.size, k: h.k }
}

export function moveSlide(ed: Editor, slides: Slide[], i: number, dir: -1 | 1) {
  const me = sectionRange(ed, slides, i); if (!me) return false
  // Nachbar ist die vorige bzw. nächste Folie mit eigener Überschrift
  let j = i + dir
  while (j > 0 && j < slides.length && !headingOf(ed, slides, j)) j += dir
  const other = j > 0 && j < slides.length ? sectionRange(ed, slides, j) : null
  if (!other) return false
  const [a, b] = dir < 0 ? [other, me] : [me, other]
  const doc = ed.state.doc, A = doc.slice(a.from, a.to).content, B = doc.slice(b.from, b.to).content
  const tr = ed.state.tr.replaceWith(a.from, b.to, B.append(A))
  // Cursor in die verschobene Überschrift, damit die Markierung links mit der Folie mitwandert
  const start = dir < 0 ? a.from : a.from + B.size, head = tr.doc.nodeAt(start)
  if (head) tr.setSelection(TextSelection.create(tr.doc, start + head.nodeSize - 1))
  ed.view.dispatch(tr)
  return true
}

export function deleteSlide(ed: Editor, slides: Slide[], i: number) {
  const r = sectionRange(ed, slides, i); if (!r) return false
  ed.view.dispatch(ed.state.tr.delete(r.from, r.to))
  return true
}

/** Neue Folie hinter dem Abschnitt, in dem der Cursor steht: Überschrift „Neue Folie“ (markiert, zum Überschreiben) und eine leere Zeile */
export function addSlide(ed: Editor) {
  const all = tops(ed), at = ed.state.selection.$from.index(0)
  const next = all.slice(at + 1).find(x => x.node.type.name === 'heading')
  // Am Ende: vor die leere Schlusszeile, sonst bleibt eine Lücke über der neuen Folie
  const last = all[all.length - 1], tail = !next && last && last.node.type.name === 'paragraph' && !last.node.textContent.trim() && all.length > 1
  const pos = next ? next.pos : tail ? last.pos : ed.state.doc.content.size
  ed.chain().insertContentAt(pos, [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Neue Folie' }] }, { type: 'paragraph' }]).run()
  ed.chain().focus().setTextSelection({ from: pos + 1, to: pos + 11 }).scrollIntoView().run()
}

export function SlideOutline({ slides, active, show, editor, onPick, onMoved }: { slides: Slide[]; active: number; show: (path?: string) => string | null; editor: Editor | null; onPick: (i: number) => void; onMoved?: () => void }) {
  const [ask, setAsk] = useState<number | null>(null)
  const movable = (i: number) => !!editor && !!headingOf(editor, slides, i)
  return <div className="space-y-1.5">
    <p className="text-[12px] uppercase tracking-[.06em] text-mute px-1">Folien · {slides.length}</p>
    {slides.map((s, i) => { const src = show(s.photo), on = i === active, own = movable(i)
      const kick = s.kind === 'cover' ? 'Titelfolie' : s.kicker?.k === 'step' ? `Schritt ${s.kicker.no}` : s.kicker?.k === 'photo' ? `Bild ${s.kicker.no}` : s.kicker?.k === 'point' ? `Punkt ${s.kicker.no}` : s.kicker?.k === 'wichtig' ? 'Wichtig' : `Folie ${i + 1}`
      return <div key={s.key + i} className={`group rounded-[12px] border transition ${on ? 'border-olive-700 bg-white shadow-[0_6px_18px_-12px_rgba(29,34,28,.45)]' : 'border-line bg-white hover:border-sage-300'}`}>
        <button type="button" onClick={() => onPick(i)} className="w-full text-left p-2 flex gap-2.5">
          <span className="w-12 h-12 rounded-[8px] overflow-hidden bg-olive-900 shrink-0 flex items-center justify-center text-white/70">{src ? <img src={src} alt="" className="w-full h-full object-cover" /> : s.video ? <span className="text-[10px]">Video</span> : <ImageIcon size={16} />}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] uppercase tracking-[.05em] text-mute">{i + 1} · {kick}</span>
            <span className="block text-[13px] font-medium leading-snug line-clamp-2">{s.title || 'Ohne Titel'}</span>
            {s.sub && <span className="block text-[11.5px] text-mute leading-snug line-clamp-2"><span className="text-ink/60">Balken:</span> {s.sub}</span>}
            {contents(s).length > 0 && <span className="mt-1 flex flex-wrap gap-1">{contents(s).map(c => <span key={c} className={`px-1.5 rounded-[5px] text-[10.5px] leading-[17px] ${c === 'Hinweis' ? 'bg-duty-50 text-duty' : 'bg-sage-50 text-ink/70'}`}>{c}</span>)}</span>}
          </span>
        </button>
        {/* Verschieben und Löschen nur bei Folien mit eigener Überschrift, Bestätigung in der Karte statt Browser-Dialog */}
        {own && editor && (ask === i
          ? <div className="px-2 pb-2 flex items-center gap-1.5 text-[12px]"><span className="flex-1 text-alert">Folie mit Inhalt löschen?</span>
              <button type="button" onClick={() => { if (deleteSlide(editor, slides, i)) onMoved?.(); setAsk(null) }} className="h-7 px-2 rounded-[7px] bg-alert text-white">Löschen</button>
              <button type="button" onClick={() => setAsk(null)} className="h-7 px-2 rounded-[7px] bg-sage-50">Nein</button></div>
          : <div className={`px-2 pb-1.5 flex items-center gap-0.5 ${on ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
              <button type="button" title="Nach oben" aria-label="Folie nach oben" onClick={() => { if (moveSlide(editor, slides, i, -1)) onMoved?.() }} className="w-7 h-7 rounded-[7px] text-mute hover:bg-sage-50 flex items-center justify-center"><ArrowUp size={14} /></button>
              <button type="button" title="Nach unten" aria-label="Folie nach unten" onClick={() => { if (moveSlide(editor, slides, i, 1)) onMoved?.() }} className="w-7 h-7 rounded-[7px] text-mute hover:bg-sage-50 flex items-center justify-center"><ArrowDown size={14} /></button>
              <button type="button" title="Folie löschen" aria-label="Folie löschen" onClick={() => setAsk(i)} className="ml-auto w-7 h-7 rounded-[7px] text-mute hover:text-alert hover:bg-sage-50 flex items-center justify-center"><Trash2 size={14} /></button>
            </div>)}
      </div> })}
    {editor && <button type="button" onClick={() => addSlide(editor)} className="w-full h-10 rounded-[12px] border border-dashed border-sage-300 text-[13px] text-olive-700 hover:bg-sage-50 flex items-center justify-center gap-1.5"><Plus size={15} />Neue Folie</button>}
  </div>
}
