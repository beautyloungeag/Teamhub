// Inhalt eines Wissensartikels bearbeiten wie in Word (26.10., Renée: „+-Zeichen benutzerunfreundlich, Bilder zu gross,
// Listen lassen sich nicht einfügen“): feste Werkzeugleiste oben, Text und Listen aus Word oder Mails einfach einfügen,
// Bilder per Knopf, Einfügen oder Hineinziehen. Gespeichert wird weiter im Bausteine-Format (lib/wiki-doc.ts).
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { ListItem } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { AlertTriangle, Bold, FileText, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Pilcrow, Video, MonitorPlay } from 'lucide-react'
import type { WikiBlock } from '../store'
import { blocksToHtml, docToBlocks, hasListLines, textToHtml, type J } from '../lib/wiki-doc'

// Bilder, Videos und Dateien bekommen einen sichtbaren Entfernen-Knopf (27.10.: vorher nur per Markieren und Rücktaste,
// das findet niemand). Der Knopf löscht genau diesen Knoten.
function removable(dom: HTMLElement, label: string, getPos: (() => number | undefined) | boolean, editor: Editor) {
  const x = document.createElement('button'); x.type = 'button'; x.className = 'wiki-x'; x.title = label; x.setAttribute('aria-label', label); x.textContent = '×'; x.contentEditable = 'false'
  x.addEventListener('mousedown', (e) => e.preventDefault())
  x.addEventListener('click', () => { const pos = typeof getPos === 'function' ? getPos() : null; if (pos == null) return
    const n = editor.state.doc.nodeAt(pos); if (n) editor.view.dispatch(editor.state.tr.delete(pos, pos + n.nodeSize)) })
  dom.append(x)
}

// Video, YouTube und Dateien als feste Karte im Text (nicht editierbar, verschieb- und löschbar)
const Media = Node.create({
  name: 'media', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() {
    const a = (name: string, attr: string) => ({ default: null, parseHTML: (el: HTMLElement) => el.getAttribute(attr), renderHTML: (v: Record<string, any>) => v[name] ? { [attr]: v[name] } : {} })
    return { kind: a('kind', 'data-media'), src: a('src', 'data-src'), url: a('url', 'data-url'), name: a('name', 'data-name') }
  },
  parseHTML: () => [{ tag: 'div[data-media]' }],
  renderHTML({ HTMLAttributes, node }) {
    const k = node.attrs.kind
    const label = k === 'yt' ? `YouTube-Video · ${node.attrs.url ?? ''}` : k === 'video' ? `Video · ${node.attrs.name || 'hochgeladen'}` : `Datei · ${node.attrs.name || 'Anhang'}`
    return ['div', mergeAttributes(HTMLAttributes, { class: 'wiki-media' }), label]
  },
  addNodeView() {
    return ({ node, getPos, editor, HTMLAttributes }) => {
      const k = node.attrs.kind
      const dom = document.createElement('div'); dom.className = 'wiki-media'
      for (const [a, v] of Object.entries(HTMLAttributes)) if (v != null && a !== 'class') dom.setAttribute(a, String(v))
      const t = document.createElement('span'); t.className = 'wiki-media-label'
      t.textContent = k === 'yt' ? `YouTube-Video · ${node.attrs.url ?? ''}` : k === 'video' ? `Video · ${node.attrs.name || 'hochgeladen'}` : `Datei · ${node.attrs.name || 'Anhang'}`
      dom.append(t)
      removable(dom, k === 'file' ? 'Datei entfernen' : 'Video entfernen', getPos, editor)
      return { dom, ignoreMutation: () => true, stopEvent: (e) => (e.target as HTMLElement)?.classList?.contains('wiki-x') }
    }
  },
})
const WikiImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), path: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-path'), renderHTML: (v: Record<string, any>) => v.path ? { 'data-path': v.path } : {} } }
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div'); dom.className = 'wiki-img'
      const img = document.createElement('img'); img.src = node.attrs.src; img.alt = ''; if (node.attrs.path) img.dataset.path = node.attrs.path
      dom.append(img); removable(dom, 'Foto entfernen', getPos, editor)
      return { dom, ignoreMutation: () => true, stopEvent: (e) => (e.target as HTMLElement)?.classList?.contains('wiki-x') }
    }
  },
}).configure({ inline: false, allowBase64: false })

// Aufzählungspunkt mit eigenem Bild oder Video (26.10., Renée: „Aufzählungszeichen ohne Bilder sind unnütz“).
// Das Medium hängt als Attribut am Punkt, rechts als Vorschau mit Entfernen. In der App wird der Punkt eine eigene Folie.
const MediaItem = ListItem.extend({
  addAttributes() {
    const a = (attr: string) => ({ default: null, keepOnSplit: false, parseHTML: (el: HTMLElement) => el.getAttribute(attr), renderHTML: (v: Record<string, any>) => v[attr.slice(5)] ? { [attr]: v[attr.slice(5)] } : {} })
    return { m: a('data-m'), src: a('data-src'), url: a('data-url'), name: a('data-name'), show: a('data-show') }
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const li = document.createElement('li'), body = document.createElement('div')
      body.className = 'wiki-li-body'; li.append(body)
      let cur = node, box: HTMLElement | null = null
      const draw = () => {
        box?.remove(); box = null
        const { m, show, url, name } = cur.attrs
        li.classList.toggle('wiki-li-media', !!m)
        // Ohne Bild: kleiner Knopf rechts am Punkt (beim Darüberfahren), damit niemand den Cursor-Trick kennen muss (27.10.)
        if (!m) {
          box = document.createElement('span'); box.className = 'wiki-li-add'; box.contentEditable = 'false'
          const add = document.createElement('button'); add.type = 'button'; add.textContent = '+ Foto'; add.title = 'Foto oder Video zu diesem Punkt'
          add.addEventListener('mousedown', (e) => e.preventDefault())
          add.addEventListener('click', () => { const pos = typeof getPos === 'function' ? getPos() : null; if (pos == null) return
            editor.view.dom.dispatchEvent(new CustomEvent('wiki-li-photo', { detail: pos })) })
          box.append(add); li.append(box)
          return
        }
        box = document.createElement('span'); box.className = 'wiki-li-thumb'; box.contentEditable = 'false'
        const yt = m === 'yt' && url ? String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1] : null
        if ((m === 'img' && show) || yt) { const img = document.createElement('img'); img.src = yt ? `https://i.ytimg.com/vi/${yt}/mqdefault.jpg` : show; img.alt = ''; box.append(img) }
        else if (m === 'video' && show) { const v = document.createElement('video'); v.src = `${show}#t=0.1`; v.muted = true; v.preload = 'metadata'; v.playsInline = true; box.append(v) }
        else { const t = document.createElement('span'); t.className = 'wiki-li-vid'; t.textContent = m === 'yt' ? 'YouTube' : name || 'Video'; box.append(t) }
        if (m !== 'img') { const p = document.createElement('span'); p.className = 'wiki-li-play'; p.textContent = '▶'; box.append(p) }
        box.title = m === 'img' ? (name ?? '') : (url ?? name ?? 'Video')
        const x = document.createElement('button'); x.type = 'button'; x.className = 'wiki-li-x'; x.title = 'Bild vom Punkt entfernen'; x.setAttribute('aria-label', 'Bild vom Punkt entfernen'); x.textContent = '×'
        x.addEventListener('mousedown', (e) => e.preventDefault())
        x.addEventListener('click', () => { const pos = typeof getPos === 'function' ? getPos() : null; if (pos == null) return
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, m: null, src: null, url: null, name: null, show: null })) })
        box.append(x); li.append(box)
      }
      draw()
      return {
        dom: li, contentDOM: body,
        update: (n) => { if (n.type !== cur.type) return false; const changed = n.attrs !== cur.attrs; cur = n; if (changed) draw(); return true },
        ignoreMutation: (mu) => !!box && box.contains(mu.target as globalThis.Node),
        stopEvent: (e) => !!box && box.contains(e.target as globalThis.Node),
      }
    }
  },
})

/** Position des Aufzählungspunkts, in dem der Cursor steht (sonst null) */
function itemAt(ed: Editor, at?: number): number | null {
  const $from = at != null ? ed.state.doc.resolve(Math.min(at, ed.state.doc.content.size)) : ed.state.selection.$from
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'listItem') return $from.before(d)
  return null
}

export type Upload = (f: File) => Promise<{ path: string; url: string } | null>

export function ArticleBody({ initial, urls, onChange, upload, editorOut }: { initial: WikiBlock[]; urls: Record<string, string>; onChange: (b: WikiBlock[]) => void; upload: Upload; editorOut?: MutableRefObject<Editor | null> }) {
  const file = useRef<HTMLInputElement>(null), kind = useRef<'img' | 'video' | 'file'>('img')
  const [busy, setBusy] = useState(false), [vidMenu, setVidMenu] = useState(false)
  const insertFiles = async (ed: Editor, files: File[], at?: number) => {
    if (!files.length) return
    setBusy(true)
    // Cursor in einer Aufzählung: Bild oder Video gehört zum Punkt. Weitere Dateien werden neue Punkte darunter.
    let li = itemAt(ed, at)
    for (const f of files) {
      if (li != null && (f.type.startsWith('image/') || f.type.startsWith('video/'))) {
        const r = await upload(f); if (!r) continue
        const attrs = { m: f.type.startsWith('image/') ? 'img' : 'video', src: r.path, show: r.url, name: f.name, url: null }
        const node = ed.state.doc.nodeAt(li)
        if (node && !node.attrs.m) ed.view.dispatch(ed.state.tr.setNodeMarkup(li, undefined, { ...node.attrs, ...attrs }))
        else if (node) {
          const pos = li + node.nodeSize
          ed.chain().insertContentAt(pos, { type: 'listItem', attrs, content: [{ type: 'paragraph' }] }).run()
          li = pos
        }
        continue
      }
      const r = await upload(f); if (!r) continue
      const node = f.type.startsWith('image/') ? { type: 'image', attrs: { src: r.url, path: r.path } }
        : { type: 'media', attrs: { kind: f.type.startsWith('video/') ? 'video' : 'file', src: r.path, name: f.name } }
      // Danach eine leere Zeile mit Cursor, sonst ersetzt das nächste Tippen das markierte Bild
      const content = [node, { type: 'paragraph' }]
      const chain = ed.chain().focus()
      ;(at != null ? chain.insertContentAt(at, content) : chain.insertContent(content)).run()
    }
    setBusy(false)
  }
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ listItem: false, heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false, horizontalRule: false, underline: false, link: { openOnClick: false, autolink: true } }),
      MediaItem, WikiImage, Media,
      Placeholder.configure({ placeholder: 'Hier schreiben … Text aus Word oder einer Mail kannst du einfach einfügen, Aufzählungen bleiben erhalten.' }),
    ],
    content: blocksToHtml(initial, urls) || '<p></p>',
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'wiki-editor-body outline-none' },
      // Fotos einfügen (Bildschirmfoto, Kopie aus dem Finder) und Klartext mit Aufzählungszeichen als echte Liste
      handlePaste: (_view, event) => {
        const ed = editorRef.current; if (!ed) return false
        const files = [...(event.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'))
        if (files.length) { event.preventDefault(); void insertFiles(ed, files); return true }
        const html = event.clipboardData?.getData('text/html') ?? '', text = event.clipboardData?.getData('text/plain') ?? ''
        // Word macht Listen zu Absätzen mit Zeichen davor (MsoListParagraph): dann lieber den Text mit Zeichen deuten
        const wordList = /MsoListParagraph|mso-list/i.test(html)
        if ((!html || wordList) && hasListLines(text)) { event.preventDefault(); ed.chain().focus().insertContent(textToHtml(text)).run(); return true }
        if (!html && text.includes('\n')) { event.preventDefault(); ed.chain().focus().insertContent(textToHtml(text)).run(); return true }
        return false
      },
      handleDrop: (view, event, _slice, moved) => {
        const ed = editorRef.current; if (!ed || moved) return false
        const files = [...(event.dataTransfer?.files ?? [])]
        if (!files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertFiles(ed, files, pos)
        return true
      },
    },
    onUpdate: ({ editor: ed }) => onChange(docToBlocks(ed.getJSON() as J)),
  })
  const editorRef = useRef<Editor | null>(null)
  useEffect(() => { editorRef.current = editor; if (editorOut) editorOut.current = editor }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps
  // „+ Foto“ am Aufzählungspunkt: Cursor in diesen Punkt, dann Dateiauswahl
  useEffect(() => {
    if (!editor) return
    const f = (e: Event) => { const pos = (e as CustomEvent<number>).detail; editor.chain().focus().setTextSelection(pos + 2).run(); pick('img', true) }
    const dom = editor.view.dom; dom.addEventListener('wiki-li-photo', f); return () => dom.removeEventListener('wiki-li-photo', f)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  if (!editor) return null
  const pick = (k: 'img' | 'video' | 'file', both = false) => { kind.current = k; if (file.current) { file.current.accept = both ? 'image/*,video/*' : k === 'img' ? 'image/*' : k === 'video' ? 'video/*' : ''; file.current.multiple = k === 'img' && !both; file.current.click() } }
  const link = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const u = prompt('Link (https://…), leer = Link entfernen', prev ?? '')
    if (u === null) return
    if (!u.trim()) { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: /^https?:\/\//.test(u) ? u : `https://${u}` }).run()
  }
  const yt = () => {
    const u = prompt('YouTube-Link einfügen (z. B. https://youtu.be/…)')?.trim(); if (!u) return
    const li = itemAt(editor), node = li != null ? editor.state.doc.nodeAt(li) : null
    if (li != null && node) editor.view.dispatch(editor.state.tr.setNodeMarkup(li, undefined, { ...node.attrs, m: 'yt', url: u, src: null, show: null, name: null }))
    else editor.chain().focus().insertContent([{ type: 'media', attrs: { kind: 'yt', url: u } }, { type: 'paragraph' }]).run()
  }
  const B = ({ on, label, icon, run, text, tip }: { on?: boolean; label: string; icon: ReactNode; run: () => void; text?: boolean; tip?: string }) =>
    <button type="button" title={tip ?? label} aria-label={tip ?? label} aria-pressed={on} onMouseDown={e => e.preventDefault()} onClick={run}
      className={`h-8 shrink-0 ${text ? 'px-2 gap-1.5' : 'w-8'} rounded-[8px] flex items-center justify-center text-[13.5px] transition ${on ? 'bg-olive-700 text-white' : 'text-ink/80 hover:bg-sage-50'}`}>{icon}{text && <span>{label}</span>}</button>
  const sep = <span className="w-px h-5 bg-line mx-0.5 shrink-0" />
  // Beschriftungen bleiben gleich, egal wo der Cursor steht (27.10.: „Bild zum Punkt“ liess die Leiste umbrechen und den Text springen)
  return (
    <div className="wiki-editor">
      <div className="sticky top-[62px] z-20 -mx-2 px-2 py-2 bg-white border-b border-line flex flex-wrap items-center gap-px">
        <B text label="Text" icon={<Pilcrow size={15} />} on={editor.isActive('paragraph') && !editor.isActive('listItem') && !editor.isActive('blockquote')} run={() => editor.chain().focus().setParagraph().run()} />
        <B text label="Überschrift" tip="Überschrift (beginnt in der App eine neue Folie)" icon={<Heading2 size={16} />} on={editor.isActive('heading', { level: 2 })} run={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <B label="Zwischentitel" icon={<Heading3 size={16} />} on={editor.isActive('heading', { level: 3 })} run={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        {sep}
        <B label="Fett" icon={<Bold size={15} />} on={editor.isActive('bold')} run={() => editor.chain().focus().toggleBold().run()} />
        <B label="Kursiv" icon={<Italic size={15} />} on={editor.isActive('italic')} run={() => editor.chain().focus().toggleItalic().run()} />
        <B label="Link" icon={<Link2 size={15} />} on={editor.isActive('link')} run={link} />
        {sep}
        <B text label="Liste" tip="Aufzählung" icon={<List size={16} />} on={editor.isActive('bulletList')} run={() => editor.chain().focus().toggleBulletList().run()} />
        <B label="Nummerierte Liste (Schritte)" icon={<ListOrdered size={16} />} on={editor.isActive('orderedList')} run={() => editor.chain().focus().toggleOrderedList().run()} />
        <B text label="Hinweis" tip="Hinweis: erscheint in der App rot als wichtige Regel" icon={<AlertTriangle size={15} />} on={editor.isActive('blockquote')} run={() => editor.chain().focus().toggleBlockquote().run()} />
        {sep}
        <B text label="Foto" tip="Foto einfügen (steht der Cursor in einem Aufzählungspunkt, gehört es zu diesem Punkt)" icon={<ImageIcon size={16} />} run={() => pick('img')} />
        {/* Video: hochladen oder YouTube-Link, ein Knopf statt zwei */}
        <span className="relative shrink-0">
          <B text label="Video" tip="Video hochladen oder YouTube-Link" icon={<Video size={16} />} on={vidMenu} run={() => setVidMenu(!vidMenu)} />
          {vidMenu && <><span className="fixed inset-0 z-30" onMouseDown={() => setVidMenu(false)} />
            <span className="absolute left-0 top-9 z-40 w-[200px] rounded-[12px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-1 flex flex-col">
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setVidMenu(false); pick('video') }} className="h-9 px-2.5 rounded-[8px] hover:bg-sage-50 flex items-center gap-2 text-[13.5px]"><Video size={15} />Video hochladen</button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setVidMenu(false); yt() }} className="h-9 px-2.5 rounded-[8px] hover:bg-sage-50 flex items-center gap-2 text-[13.5px]"><MonitorPlay size={15} />YouTube-Link</button>
            </span></>}
        </span>
        <B label="Datei (PDF, Word …)" icon={<FileText size={15} />} run={() => pick('file')} />
        {busy && <span className="ml-auto text-[12.5px] text-mute pr-1">Lädt hoch …</span>}
      </div>
      <EditorContent editor={editor} className="pt-4" />
      {/* Klick in die freie Fläche unter dem Text setzt den Cursor ans Ende */}
      <div className="min-h-[30vh] cursor-text" onMouseDown={e => { e.preventDefault(); editor.chain().focus('end').run() }} />
      <input ref={file} type="file" className="hidden" onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; void insertFiles(editor, fs) }} />
    </div>
  )
}
