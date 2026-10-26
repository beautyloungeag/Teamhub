// Inhalt eines Wissensartikels bearbeiten wie in Word (26.10., Renée: „+-Zeichen benutzerunfreundlich, Bilder zu gross,
// Listen lassen sich nicht einfügen“): feste Werkzeugleiste oben, Text und Listen aus Word oder Mails einfach einfügen,
// Bilder per Knopf, Einfügen oder Hineinziehen. Gespeichert wird weiter im Bausteine-Format (lib/wiki-doc.ts).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { Bold, FileText, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Pilcrow, Quote, Video, MonitorPlay } from 'lucide-react'
import type { WikiBlock } from '../store'
import { blocksToHtml, docToBlocks, hasListLines, textToHtml, type J } from '../lib/wiki-doc'

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
})
const WikiImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), path: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-path'), renderHTML: (v: Record<string, any>) => v.path ? { 'data-path': v.path } : {} } }
  },
}).configure({ inline: false, allowBase64: false })

export type Upload = (f: File) => Promise<{ path: string; url: string } | null>

export function ArticleBody({ initial, urls, onChange, upload }: { initial: WikiBlock[]; urls: Record<string, string>; onChange: (b: WikiBlock[]) => void; upload: Upload }) {
  const file = useRef<HTMLInputElement>(null), kind = useRef<'img' | 'video' | 'file'>('img')
  const [busy, setBusy] = useState(false)
  const insertFiles = async (ed: Editor, files: File[], at?: number) => {
    if (!files.length) return
    setBusy(true)
    for (const f of files) {
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
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false, horizontalRule: false, underline: false, link: { openOnClick: false, autolink: true } }),
      WikiImage, Media,
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
  useEffect(() => { editorRef.current = editor }, [editor])
  if (!editor) return null
  const pick = (k: 'img' | 'video' | 'file') => { kind.current = k; if (file.current) { file.current.accept = k === 'img' ? 'image/*' : k === 'video' ? 'video/*' : ''; file.current.multiple = k === 'img'; file.current.click() } }
  const link = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const u = prompt('Link (https://…), leer = Link entfernen', prev ?? '')
    if (u === null) return
    if (!u.trim()) { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: /^https?:\/\//.test(u) ? u : `https://${u}` }).run()
  }
  const yt = () => { const u = prompt('YouTube-Link einfügen (z. B. https://youtu.be/…)'); if (u?.trim()) editor.chain().focus().insertContent([{ type: 'media', attrs: { kind: 'yt', url: u.trim() } }, { type: 'paragraph' }]).run() }
  const B = ({ on, label, icon, run, text }: { on?: boolean; label: string; icon: ReactNode; run: () => void; text?: boolean }) =>
    <button type="button" title={label} aria-label={label} aria-pressed={on} onMouseDown={e => e.preventDefault()} onClick={run}
      className={`h-8 ${text ? 'px-2 gap-1.5' : 'w-8'} rounded-[8px] flex items-center justify-center text-[13.5px] transition ${on ? 'bg-olive-700 text-white' : 'text-ink/80 hover:bg-sage-50'}`}>{icon}{text && <span>{label}</span>}</button>
  const sep = <span className="w-px h-5 bg-line mx-0.5" />
  return (
    <div className="wiki-editor">
      <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-white/95 backdrop-blur border-b border-line flex flex-wrap items-center gap-0.5">
        <B text label="Text" icon={<Pilcrow size={15} />} on={editor.isActive('paragraph')} run={() => editor.chain().focus().setParagraph().run()} />
        <B text label="Überschrift" icon={<Heading2 size={16} />} on={editor.isActive('heading', { level: 2 })} run={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <B label="Kleine Überschrift" icon={<Heading3 size={16} />} on={editor.isActive('heading', { level: 3 })} run={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        {sep}
        <B label="Fett" icon={<Bold size={15} />} on={editor.isActive('bold')} run={() => editor.chain().focus().toggleBold().run()} />
        <B label="Kursiv" icon={<Italic size={15} />} on={editor.isActive('italic')} run={() => editor.chain().focus().toggleItalic().run()} />
        <B label="Link" icon={<Link2 size={15} />} on={editor.isActive('link')} run={link} />
        {sep}
        <B label="Aufzählung" icon={<List size={16} />} on={editor.isActive('bulletList')} run={() => editor.chain().focus().toggleBulletList().run()} />
        <B label="Nummerierte Liste" icon={<ListOrdered size={16} />} on={editor.isActive('orderedList')} run={() => editor.chain().focus().toggleOrderedList().run()} />
        <B label="Hinweis (wichtige Regel)" icon={<Quote size={15} />} on={editor.isActive('blockquote')} run={() => editor.chain().focus().toggleBlockquote().run()} />
        {sep}
        <B text label="Bild" icon={<ImageIcon size={16} />} run={() => pick('img')} />
        <B label="Video hochladen" icon={<Video size={16} />} run={() => pick('video')} />
        <B label="YouTube-Link" icon={<MonitorPlay size={16} />} run={yt} />
        <B label="Datei (PDF, Word …)" icon={<FileText size={15} />} run={() => pick('file')} />
        {busy && <span className="ml-auto text-[12.5px] text-mute pr-1">Lädt hoch …</span>}
      </div>
      <EditorContent editor={editor} className="pt-4" />
      <input ref={file} type="file" className="hidden" onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; void insertFiles(editor, fs) }} />
    </div>
  )
}
