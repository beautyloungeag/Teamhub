import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Bold, FileText, GripVertical, Heading2, Image as ImageIcon, Italic, Link2, List, ListOrdered, Plus, Quote, Search, Trash2, Type, Video, ChevronRight, Upload } from 'lucide-react'
import { useApp, type WikiBlock } from '../store'
import { supabase } from '../lib/supabase'
import { emojiOf, catKey, EMOJI_CHOICES, AREAS, areaOf } from '../lib/wiki'
import { AREA_LOOK } from '../Mobile'
import { toast } from '../Toast'
import { H, New, Th, Back, Section, Empty, Status, DataRow, Select, Seg, Modal, btn, btn2, inpStone, retranslate, IconBox, Tag } from './kit'

// Wissen im Backoffice (nur Büro): gleiche Ansicht wie in der App, nur bearbeitbar.
// Themen als Kacheln mit Emoji, gegliedert nach den fünf Hauptbereichen der App (22.10.) → Artikel eines Themas → Artikel,
// direkt im Aussehen der App bearbeitet.
// Inhalt sind Bausteine (wiki_articles.blocks): Text, Überschrift, Listen, Hinweis, Bild, Video, Datei.

const LEVEL: Record<string, string> = { alle: 'Alle', filialleitung: 'Leitung und Büro', buero: 'Nur Büro' }
const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1)

export function WikiAdmin() {
  const [cat, setCat] = useState<string | null>(null)
  const [art, setArt] = useState<{ id: string | null; cat: string } | null>(null)
  if (art) return <ArticleEditor id={art.id} category={art.cat} onBack={() => setArt(null)} onSaved={id => setArt({ id, cat: art.cat })} />
  if (cat !== null) return <CategoryPage name={cat} onBack={() => setCat(null)} onOpen={id => setArt({ id, cat })} onRenamed={setCat} />
  return <Home onCat={setCat} onOpen={(id, c) => setArt({ id, cat: c })} />
}

/* ---------- Übersicht: Themen wie in der App ---------- */
function Home({ onCat, onOpen }: { onCat: (name: string) => void; onOpen: (id: string | null, cat: string) => void }) {
  const { wiki, catEmojis } = useApp()
  const own = wiki.filter(a => !a.fromNews)
  // Jedes Thema steht in dem Hauptbereich, in den die meisten seiner Artikel fallen (gleiche Regel wie in der App)
  const areaOfCat = (name: string) => { const n = new Map<string, number>(); own.filter(a => a.catKey === name).forEach(a => { const k = areaOf(a.catKey, a.title); n.set(k, (n.get(k) ?? 0) + 1) }); return [...n.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'studio' }
  const [q, setQ] = useState(''), [newTopic, setNewTopic] = useState(false)
  const cats = [...own.reduce((m, a) => { const c = m.get(a.catKey) ?? { name: a.catKey, n: 0, drafts: 0 }; c.n++; if (!a.published) c.drafts++; return m.set(a.catKey, c) }, new Map<string, { name: string; n: number; drafts: number }>()).values()]
    .sort((x, y) => y.n - x.n || x.name.localeCompare(y.name))
  const hits = q.length > 1 ? own.filter(a => [a.title, a.catKey, a.intro, ...a.tags].join(' ').toLowerCase().includes(q.toLowerCase())) : []
  return (<>
    <H action={<div className="flex gap-2"><button onClick={() => setNewTopic(true)} className={btn2}>Neues Thema</button><New onClick={() => onOpen(null, '')}>Neuer Artikel</New></div>}>Wissen</H>
    <div className="h-10 mb-6 max-w-md rounded-[10px] bg-sage-50 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Artikel suchen" className="flex-1 outline-none text-[14px] bg-transparent" /></div>
    {q.length > 1 ? <Section title="Treffer" count={hits.length}>
      {hits.length === 0 ? <Empty>Kein Artikel gefunden.</Empty> : <ArticleTable items={hits} onOpen={a => onOpen(a.id, a.catKey)} showCat />}
    </Section> : <div className="space-y-10">{AREAS.map(ar => { const look = AREA_LOOK[ar.key], Icon = look.icon, mine = cats.filter(c => areaOfCat(c.name) === ar.key)
      if (!mine.length) return null
      const n = own.filter(a => areaOf(a.catKey, a.title) === ar.key).length
      return <section key={ar.key}>
        <div className="flex items-center gap-3.5 mb-3"><IconBox tone={look.tone}><Icon size={20} /></IconBox>
          <div className="min-w-0"><h2 className="text-[20px] leading-tight">{ar.name}</h2><p className="text-[13px] text-mute">{ar.desc} · {n === 1 ? '1 Artikel' : `${n} Artikel`}</p></div></div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">{mine.map(c => (
          <button key={c.name} onClick={() => onCat(c.name)} className="group text-left rounded-[20px] bg-sage-50 hover:bg-sage-100 p-4 h-[120px] flex flex-col justify-between transition">
            <span className="flex items-start justify-between"><span className="text-[28px] leading-none" aria-hidden="true">{emojiOf(c.name, catEmojis)}</span><ChevronRight size={16} className="text-sage-400 group-hover:text-ink transition" /></span>
            <span className="min-w-0"><span className="block font-display text-[17px] leading-tight truncate">{cap(c.name)}</span>
              <span className="block text-[12.5px] text-mute mt-0.5">{c.n === 1 ? '1 Artikel' : `${c.n} Artikel`}{c.drafts ? ` · ${c.drafts} Entwurf${c.drafts > 1 ? 'e' : ''}` : ''}</span></span>
          </button>))}</div>
      </section> })}</div>}
    {newTopic && <NewTopic onClose={() => setNewTopic(false)} onDone={name => { setNewTopic(false); onOpen(null, name) }} />}
  </>)
}

function ArticleTable({ items, onOpen, showCat }: { items: ReturnType<typeof useApp>['wiki']; onOpen: (a: ReturnType<typeof useApp>['wiki'][number]) => void; showCat?: boolean }) {
  const { quizzes } = useApp()
  const tested = new Set(quizzes.map(q => q.articleId))
  const icon = (a: ReturnType<typeof useApp>['wiki'][number]) => { const look = AREA_LOOK[areaOf(a.catKey, a.title)] ?? AREA_LOOK.studio, I = look.icon; return <IconBox tone={look.tone} size="w-8 h-8 rounded-[10px]"><I size={15} /></IconBox> }
  return <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Artikel</Th>{showCat && <th className="w-[160px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Thema</th>}<th className="w-[190px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Sichtbar für</th><th className="w-[130px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Aktualisiert</th><th className="w-[130px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Status</th><th className="w-10 border-b border-line" /></tr></thead>
    <tbody className="divide-y divide-line">{items.map(a => <tr key={a.id} onClick={() => onOpen(a)} className="cursor-pointer hover:bg-sage-50/70">
      <td className="px-4 py-3"><span className="flex items-center gap-3 min-w-0">{icon(a)}<span className="min-w-0"><span className="flex items-center gap-2 min-w-0"><span className="truncate">{a.title}</span>{tested.has(a.id) && <Tag tone="duty">mit Test</Tag>}{(a.mediaKind === 'video' || a.mediaKind === 'youtube') && <Tag tone="learn">Video</Tag>}</span>{a.intro && <span className="block text-[12.5px] text-mute truncate">{a.intro}</span>}</span></span></td>
      {showCat && <td className="px-4 text-mute truncate">{cap(a.catKey)}</td>}
      <td className="px-4 text-ink/80 truncate">{LEVEL[a.accessLevel]}</td>
      <td className="px-4 text-mute">{a.updated}</td>
      <td className="px-4">{a.published ? <Status kind="yes">Sichtbar</Status> : <Status kind="none">Entwurf</Status>}</td>
      <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
    </tr>)}</tbody></table>
}

/* ---------- Ein Thema: Emoji und Name ändern, Artikel ---------- */
function CategoryPage({ name, onBack, onOpen, onRenamed }: { name: string; onBack: () => void; onOpen: (id: string | null) => void; onRenamed: (n: string) => void }) {
  const { wiki, catEmojis, reloadWiki } = useApp()
  const items = wiki.filter(a => !a.fromNews && a.catKey === name).sort((x, y) => x.title.localeCompare(y.title))
  const [title, setTitle] = useState(cap(name))
  useEffect(() => setTitle(cap(name)), [name])
  const rename = async () => {
    const n = title.trim()
    if (!n || n === cap(name) || n === name) { setTitle(cap(name)); return }
    if (!confirm(`Thema „${cap(name)}“ in „${n}“ umbenennen? Alle ${items.length} Artikel ziehen mit.`)) { setTitle(cap(name)); return }
    const { error } = await supabase!.rpc('rename_wiki_category', { p_old: name, p_new: n })
    if (error) { toast('Umbenennen hat nicht geklappt', 'error'); setTitle(cap(name)); return }
    await reloadWiki(); retranslate(); toast('Thema umbenannt'); onRenamed(n)
  }
  return (<div className="max-w-[1100px]">
    <Back onClick={onBack}>Wissen</Back>
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <EmojiButton name={name} emoji={emojiOf(name, catEmojis)} />
        <div className="min-w-0">
          <input value={title} onChange={e => setTitle(e.target.value)} onBlur={rename} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} title="Namen ändern" className="font-display text-[30px] leading-tight bg-transparent outline-none rounded-[8px] -ml-1 px-1 hover:bg-sage-50 focus:bg-sage-50 w-full" />
          <p className="text-[13px] text-mute">{items.length === 1 ? '1 Artikel' : `${items.length} Artikel`} · Emoji und Name lassen sich anklicken und ändern</p>
        </div>
      </div>
      <New onClick={() => onOpen(null)}>Neuer Artikel</New>
    </div>
    <div className="mt-8">{items.length === 0 ? <Empty>Noch kein Artikel in diesem Thema.</Empty> : <ArticleTable items={items} onOpen={a => onOpen(a.id)} />}</div>
  </div>)
}

function EmojiButton({ name, emoji, big = true }: { name: string; emoji: string; big?: boolean }) {
  const { reloadWiki } = useApp()
  const [open, setOpen] = useState(false), [own, setOwn] = useState('')
  const pick = async (e: string) => {
    setOpen(false)
    const { error } = await supabase!.from('wiki_categories').upsert({ key: catKey(name), emoji: e, updated_at: new Date().toISOString() })
    if (error) toast('Speichern hat nicht geklappt', 'error'); else { await reloadWiki(); toast('Emoji gespeichert') }
  }
  return <span className="relative shrink-0">
    <button onClick={() => setOpen(!open)} title="Emoji ändern" className={`${big ? 'w-16 h-16 text-[32px]' : 'w-10 h-10 text-[22px]'} rounded-[16px] bg-sage-50 hover:bg-sage-100 flex items-center justify-center transition`}>{emoji}</button>
    {open && <><div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
      <div className="absolute z-40 mt-2 w-[328px] rounded-[14px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-3">
        <div className="grid grid-cols-8 gap-1">{EMOJI_CHOICES.map(e => <button key={e} onClick={() => pick(e)} className={`h-9 rounded-[8px] text-[20px] hover:bg-sage-50 ${e === emoji ? 'bg-sage-100' : ''}`}>{e}</button>)}</div>
        <div className="mt-3 flex gap-2"><input value={own} onChange={e => setOwn(e.target.value)} placeholder="Eigenes Emoji" className={`${inpStone} !h-9`} /><button disabled={!own.trim()} onClick={() => pick(own.trim())} className={`${btn2} !h-9 disabled:opacity-50`}>Nehmen</button></div>
      </div></>}
  </span>
}

function NewTopic({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState(''), [emoji, setEmoji] = useState('📄')
  const go = async () => {
    const n = name.trim(); if (!n) return
    await supabase!.from('wiki_categories').upsert({ key: catKey(n), emoji, updated_at: new Date().toISOString() })
    onDone(n)
  }
  return <Modal title="Neues Thema" onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={!name.trim()} onClick={go} className={`${btn} disabled:opacity-50`}>Ersten Artikel schreiben</button></>}>
    <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="Name, z. B. Hygiene" className={inpStone} />
    <p className="mt-4 text-xs text-mute mb-1.5">Emoji</p>
    <div className="grid grid-cols-10 gap-1">{EMOJI_CHOICES.map(e => <button key={e} onClick={() => setEmoji(e)} className={`h-9 rounded-[8px] text-[20px] hover:bg-sage-50 ${e === emoji ? 'bg-sage-100' : ''}`}>{e}</button>)}</div>
    <p className="mt-3 text-[12.5px] text-mute">Ein Thema erscheint in der App, sobald ein Artikel darin freigegeben ist.</p>
  </Modal>
}

/* ---------- Artikel: so wie in der App, direkt bearbeitbar ---------- */
type B = WikiBlock & { k: string }
const uid = () => Math.random().toString(36).slice(2, 10)
const withKeys = (bs: WikiBlock[]): B[] => bs.map(b => ({ ...b, k: uid() }))
const TEXTY = new Set(['p', 'h', 'quote', 'ul', 'ol'])

// **fett**, *kursiv*, [Text](Link) ⇄ HTML im Editierfeld
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const mdToHtml = (s: string) => esc(s)
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u.replace(/"/g, '&quot;')}">${t}</a>`)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<i>$1</i>').replace(/\n/g, '<br>')
function htmlToMd(el: Node): string {
  let out = ''
  el.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE) { out += n.textContent ?? ''; return }
    if (!(n instanceof HTMLElement)) return
    const inner = htmlToMd(n), tag = n.tagName
    if (tag === 'BR') out += '\n'
    else if (tag === 'B' || tag === 'STRONG' || (tag === 'SPAN' && /bold|[6-9]00/.test(n.style.fontWeight))) out += inner.trim() ? `**${inner}**` : inner
    else if (tag === 'I' || tag === 'EM') out += inner.trim() ? `*${inner}*` : inner
    else if (tag === 'A') out += `[${inner}](${n.getAttribute('href') ?? ''})`
    else if (tag === 'DIV' || tag === 'P') out += (out && !out.endsWith('\n') ? '\n' : '') + inner
    else out += inner
  })
  return out.replace(/ /g, ' ')
}
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
const ytId = (u: string) => u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1]

/** Ein Textfeld im Aussehen der App. Inhalt wird nur beim Laden gesetzt, sonst springt der Cursor. */
function Editable({ value, onChange, className, placeholder, onKeyDown, focus, onFocused, rich = true }: {
  value: string; onChange: (v: string) => void; className: string; placeholder: string; onKeyDown?: (e: KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => void
  focus?: 'end' | 'start' | null; onFocused?: () => void; rich?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.innerHTML = rich ? mdToHtml(value) : esc(value) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current; if (!focus || !el) return
    el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(focus === 'start')
    const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); onFocused?.()
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} contentEditable suppressContentEditableWarning data-ph={placeholder} data-rich={rich ? '1' : undefined}
    onInput={e => onChange(rich ? htmlToMd(e.currentTarget) : e.currentTarget.innerText.replace(/\n/g, ' '))}
    onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')) }}
    onKeyDown={e => onKeyDown?.(e, e.currentTarget)}
    className={`outline-none empty:before:content-[attr(data-ph)] empty:before:text-sage-400 ${className}`} />
}

const caretAtStart = (el: HTMLElement) => { const s = window.getSelection(); if (!s?.rangeCount) return false; const r = s.getRangeAt(0).cloneRange(); r.setStart(el, 0); return r.toString().length === 0 }
/** Text ab dem Cursor aus dem Feld schneiden (Enter teilt einen Absatz). */
function cutTail(el: HTMLElement): string {
  const s = window.getSelection(); if (!s?.rangeCount) return ''
  const r = s.getRangeAt(0), tail = document.createRange()
  tail.setStart(r.endContainer, r.endOffset)
  if (el.lastChild) tail.setEndAfter(el.lastChild); else tail.setEnd(el, 0)
  const div = document.createElement('div'); div.appendChild(tail.extractContents())
  return htmlToMd(div).trim()
}

const BLOCK_TYPES: [WikiBlock['t'], string, typeof Type][] = [['p', 'Text', Type], ['h', 'Überschrift', Heading2], ['ul', 'Aufzählung', List], ['ol', 'Nummerierte Liste', ListOrdered], ['quote', 'Hinweis', Quote]]
const textOf = (b: WikiBlock) => b.t === 'ul' || b.t === 'ol' ? (b.items ?? []).join('\n') : b.text ?? ''
function convert(b: B, t: WikiBlock['t']): B {
  const txt = textOf(b)
  return t === 'ul' || t === 'ol' ? { k: b.k, t, items: txt.split("\n").filter((x, _i, a) => x.trim() || a.length === 1) } : { k: b.k, t, text: t === 'h' ? plain(txt).replace(/\n/g, ' ') : txt, ...(t === 'h' ? { level: 2 } : {}) }
}

type Row = { title: string; intro: string; category: string; access_level: string; published: boolean; owner_id: string | null; blocks: WikiBlock[] | null; body: string; media_kind: string; media_url: string | null }
function ArticleEditor({ id, category, onBack, onSaved }: { id: string | null; category: string; onBack: () => void; onSaved: (id: string) => void }) {
  const { wiki, staff, reloadWiki, quizzes } = useApp()
  const cats = [...new Set(wiki.filter(a => !a.fromNews).map(a => a.catKey))].sort((a, b) => a.localeCompare(b))
  const [loaded, setLoaded] = useState(!id)
  const [title, setTitle] = useState(''), [intro, setIntro] = useState(''), [cat, setCat] = useState(category)
  const [level, setLevel] = useState('alle'), [published, setPublished] = useState(!id ? false : true), [owner, setOwner] = useState('')
  const [blocks, setBlocks] = useState<B[]>(id ? [] : [{ k: uid(), t: 'p', text: '' }])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState<{ k: string; at: 'end' | 'start'; item?: number } | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const pending = useRef<{ at: number; kind: 'img' | 'video' | 'file' } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const sign = async (paths: string[]) => {
    const need = paths.filter(p => p && !/^https?:/.test(p) && !urls[p]); if (!need.length) return
    const { data } = await supabase!.storage.from('media').createSignedUrls(need, 3600)
    setUrls(u => ({ ...u, ...Object.fromEntries((data ?? []).filter(x => x.signedUrl && x.path).map(x => [x.path!, x.signedUrl as string])) }))
  }
  useEffect(() => {
    if (!id) return
    supabase!.from('wiki_articles').select('title, intro, category, access_level, published, owner_id, blocks, body, media_kind, media_url').eq('id', id).single().then(({ data }) => {
      const r = data as Row | null; if (!r) return
      // Altes Einzelmedium (Foto/Video oben) wird zum ersten Baustein, damit es nur noch ein Modell gibt
      const lead: WikiBlock[] = r.media_url && r.media_kind !== 'none' ? [r.media_kind === 'youtube' ? { t: 'video', url: r.media_url } : { t: r.media_kind === 'video' ? 'video' : 'img', src: r.media_url }] : []
      const bs: WikiBlock[] = [...lead, ...(r.blocks ?? (r.body ? r.body.split(/\n\n+/).filter(Boolean).map(text => ({ t: 'p' as const, text })) : []))]
      setTitle(r.title); setIntro(r.intro ?? ''); setCat(r.category); setLevel(r.access_level); setPublished(r.published); setOwner(r.owner_id ?? '')
      setBlocks(withKeys(bs.length ? bs : [{ t: 'p', text: '' }])); setLoaded(true)
      sign(bs.map(b => b.src ?? '').filter(Boolean))
    })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const change = (k: string, patch: Partial<WikiBlock>) => { setBlocks(bs => bs.map(b => b.k === k ? { ...b, ...patch } : b)); setDirty(true) }
  const insertAt = (at: number, b: WikiBlock, f: 'end' | 'start' = 'end') => { const nb = { ...b, k: uid() }; setBlocks(bs => [...bs.slice(0, at), nb, ...bs.slice(at)]); setDirty(true); if (TEXTY.has(b.t)) setFocus({ k: nb.k, at: f, item: 0 }); return nb.k }
  const remove = (k: string, focusPrev = false) => setBlocks(bs => { const i = bs.findIndex(b => b.k === k); const next = bs.filter(b => b.k !== k); if (focusPrev && i > 0 && TEXTY.has(bs[i - 1].t)) setFocus({ k: bs[i - 1].k, at: 'end', item: (bs[i - 1].items?.length ?? 1) - 1 }); setDirty(true); return next.length ? next : [{ k: uid(), t: 'p', text: '' }] })
  const move = (k: string, d: -1 | 1) => setBlocks(bs => { const i = bs.findIndex(b => b.k === k), j = i + d; if (j < 0 || j >= bs.length) return bs; const c = [...bs];[c[i], c[j]] = [c[j], c[i]]; setDirty(true); return c })
  const idx = (k: string) => blocks.findIndex(b => b.k === k)

  const pickFile = (at: number, kind: 'img' | 'video' | 'file') => { pending.current = { at, kind }; if (file.current) { file.current.accept = kind === 'img' ? 'image/*' : kind === 'video' ? 'video/*' : ''; file.current.click() } }
  const upload = async (f: File) => {
    const p = pending.current; if (!p) return
    if (f.size > 200 * 1024 * 1024) { toast('Die Datei ist grösser als 200 MB.', 'error'); return }
    setBusy(true)
    const path = `wiki/${level}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase!.storage.from('media').upload(path, f, { contentType: f.type })
    setBusy(false)
    if (error) { toast('Hochladen hat nicht geklappt', 'error'); return }
    await sign([path])
    insertAt(p.at, p.kind === 'file' ? { t: 'file', src: path, name: f.name } : { t: p.kind, src: path })
  }

  const save = async () => {
    if (!title.trim()) { toast('Bitte einen Titel eingeben.', 'error'); return }
    if (!cat.trim()) { toast('Bitte ein Thema wählen.', 'error'); return }
    setBusy(true)
    // Dateien liegen nach Sichtbarkeit getrennt (Speicherrechte). Hat sich die Sichtbarkeit geändert, ziehen sie mit.
    const clean: WikiBlock[] = []
    for (const { k: _k, ...b } of blocks) {
      if (TEXTY.has(b.t) && !textOf(b).trim()) continue
      if (b.src && !b.src.startsWith(`wiki/${level}/`) && b.src.startsWith('wiki/')) {
        const to = `wiki/${level}/${b.src.split('/').pop()}`
        const { error } = await supabase!.storage.from('media').move(b.src, to)
        if (!error) b.src = to
      }
      if (b.t === 'ul' || b.t === 'ol') b.items = (b.items ?? []).filter(x => x.trim())
      clean.push(b)
    }
    const text = [intro.trim(), ...clean.map(b => plain(textOf(b)))].filter(Boolean).join('\n\n')
    const words = text.split(/\s+/).filter(Boolean).length + clean.filter(b => b.t === 'img').length * 15
    const row = { title: title.trim(), intro: intro.trim(), category: cat.trim(), access_level: level, published, owner_id: owner || null, blocks: clean, body: text,
      minutes: Math.max(1, Math.round(words / 180)), media_kind: 'none', media_url: null, updated_at: new Date().toISOString() }
    const r = id ? await supabase!.from('wiki_articles').update(row).eq('id', id).select('id').single() : await supabase!.from('wiki_articles').insert({ ...row, sort: 0 }).select('id').single()
    setBusy(false)
    if (r.error || !r.data) { toast('Speichern hat nicht geklappt', 'error'); return }
    setDirty(false); await reloadWiki(); retranslate(); toast('Gespeichert')
    if (!id) onSaved(r.data.id)
  }
  const del = async () => {
    if (!id || !confirm(`Artikel „${title}“ endgültig löschen?`)) return
    const { error } = await supabase!.from('wiki_articles').delete().eq('id', id)
    if (error) { toast('Löschen hat nicht geklappt', 'error'); return }
    await reloadWiki(); toast('Gelöscht'); onBack()
  }
  const back = () => { if (dirty && !confirm('Änderungen verwerfen?')) return; onBack() }
  const quiz = id ? quizzes.find(q => q.articleId === id) : null

  if (!loaded) return <div className="max-w-[1100px]"><Back onClick={onBack}>{cap(category) || 'Wissen'}</Back><p className="text-mute">Lädt …</p></div>
  return (<div className="max-w-[1100px]">
    <Back onClick={back}>{cap(category) || 'Wissen'}</Back>
    <div className="grid grid-cols-[minmax(0,720px)_280px] gap-12 items-start">
      <article className="min-w-0 pb-24">
        <Editable rich={false} value={title} onChange={v => { setTitle(v); setDirty(true) }} placeholder="Titel" className="text-[30px] font-medium tracking-tight leading-tight" />
        <Editable rich={false} value={intro} onChange={v => { setIntro(v); setDirty(true) }} placeholder="Kurzfassung in einem Satz (optional)" className="mt-2 text-[16px] text-mute leading-snug" />
        <div className="mt-6">
          <Insert onAdd={(t) => t === 'img' || t === 'video' || t === 'file' ? pickFile(0, t) : t === 'yt' ? insertAt(0, { t: 'video', url: '' }) : insertAt(0, t === 'ul' || t === 'ol' ? { t, items: [''] } : { t, text: '', ...(t === 'h' ? { level: 2 } : {}) })} />
          {blocks.map((b, i) => <div key={b.k}>
            <BlockShell b={b} first={i === 0} last={i === blocks.length - 1} menu={menu === b.k} setMenu={o => setMenu(o ? b.k : null)}
              onType={t => { setBlocks(bs => bs.map(x => x.k === b.k ? convert(x, t) : x)); setDirty(true); setMenu(null) }}
              onMove={d => { move(b.k, d); setMenu(null) }} onDelete={() => { remove(b.k); setMenu(null) }}>
              <BlockBody b={b} urls={urls} focus={focus?.k === b.k ? focus : null} clearFocus={() => setFocus(null)}
                onChange={p => change(b.k, p)}
                onSplit={(rest) => insertAt(idx(b.k) + 1, { t: b.t === 'quote' ? 'quote' : 'p', text: rest }, 'start')}
                onExitList={() => insertAt(idx(b.k) + 1, { t: 'p', text: '' })}
                onRemove={() => remove(b.k, true)} />
            </BlockShell>
            <Insert onAdd={(t) => t === 'img' || t === 'video' || t === 'file' ? pickFile(i + 1, t) : t === 'yt' ? insertAt(i + 1, { t: 'video', url: '' }) : insertAt(i + 1, t === 'ul' || t === 'ol' ? { t, items: [''] } : { t, text: '', ...(t === 'h' ? { level: 2 } : {}) })} />
          </div>)}
        </div>
        <input ref={file} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
        <SelectionBar />
      </article>

      <aside className="sticky top-0 space-y-6">
        <div className="flex gap-2"><button disabled={busy || (!dirty && !!id)} onClick={save} className={`${btn} flex-1 disabled:opacity-50`}>{busy ? 'Speichert …' : id ? 'Speichern' : 'Artikel anlegen'}</button></div>
        <p className="-mt-4 h-4 text-[12.5px] text-brass">{dirty ? 'Ungespeicherte Änderungen' : ''}</p>
        <div>
          <DataRow label="Status" value={<Seg value={published ? 'on' : 'off'} onChange={v => { setPublished(v === 'on'); setDirty(true) }} items={[['off', 'Entwurf'], ['on', 'Sichtbar']]} />} />
          <DataRow label="Thema" value={<Select compact className="w-40" value={cat} onChange={v => { setCat(v); setDirty(true) }} placeholder="Thema wählen" options={[...new Set([...cats, ...(cat ? [cat] : [])])].map(c => ({ value: c, label: cap(c) }))} />} />
          <DataRow label="Sichtbar für" value={<Select compact className="w-40" value={level} onChange={v => { setLevel(v); setDirty(true) }} options={Object.entries(LEVEL).map(([value, label]) => ({ value, label }))} />} />
          <DataRow label="Verantwortlich" value={<Select compact className="w-40" value={owner} onChange={v => { setOwner(v); setDirty(true) }} placeholder="Niemand" options={[{ value: '', label: 'Niemand' }, ...staff.filter(x => x.active && x.app_role !== 'mitarbeiterin' && !x.email.includes('+')).map(x => ({ value: x.id, label: `${x.first} ${x.last}` }))]} />} />
          <DataRow label="Quiz" value={quiz ? <span>{quiz.title}</span> : <span className="text-mute">keins, anlegen unter Lernen → Quiz</span>} />
        </div>
        <p className="text-[12.5px] text-mute leading-relaxed">Zwischen den Absätzen erscheint beim Darüberfahren ein Plus: dort fügst du Text, Überschriften, Listen, Bilder, Videos und Dateien ein. Text markieren zeigt fett, kursiv und Link.</p>
        {id && <button onClick={del} className="text-[13px] text-mute hover:text-alert flex items-center gap-1.5"><Trash2 size={14} />Artikel löschen</button>}
      </aside>
    </div>
  </div>)
}

/** Plus zwischen den Bausteinen: fügt einen neuen ein. */
function Insert({ onAdd }: { onAdd: (t: WikiBlock['t'] | 'yt') => void }) {
  const [open, setOpen] = useState(false)
  const items: [WikiBlock['t'] | 'yt', string, typeof Type][] = [['p', 'Text', Type], ['h', 'Überschrift', Heading2], ['ul', 'Aufzählung', List], ['ol', 'Nummerierte Liste', ListOrdered], ['quote', 'Hinweis', Quote], ['img', 'Bild hochladen', ImageIcon], ['video', 'Video hochladen', Video], ['yt', 'YouTube-Link', Video], ['file', 'Datei (PDF, Word …)', FileText]]
  return <div className="group relative h-4 -my-1 flex items-center">
    <div className={`absolute left-0 right-0 h-px ${open ? 'bg-sage-400' : 'bg-transparent group-hover:bg-line'} transition`} />
    <button onClick={() => setOpen(!open)} title="Baustein einfügen" className={`relative z-10 -ml-9 w-6 h-6 rounded-full flex items-center justify-center transition ${open ? 'bg-olive-700 text-white opacity-100' : 'bg-white border border-line text-mute opacity-0 group-hover:opacity-100 hover:text-ink'}`}><Plus size={14} /></button>
    {open && <><div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
      <div className="absolute z-40 top-5 left-0 w-56 rounded-[12px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-1">
        {items.map(([t, l, I]) => <button key={t + l} onClick={() => { setOpen(false); onAdd(t) }} className="w-full h-9 px-2.5 rounded-[8px] flex items-center gap-2.5 text-[13.5px] hover:bg-sage-50"><I size={15} className="text-mute" />{l}</button>)}
      </div></>}
  </div>
}

/** Rahmen um einen Baustein: links beim Darüberfahren ein Griff mit Typ, Verschieben, Löschen. */
function BlockShell({ b, first, last, menu, setMenu, onType, onMove, onDelete, children }: { b: B; first: boolean; last: boolean; menu: boolean; setMenu: (o: boolean) => void; onType: (t: WikiBlock['t']) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; children: ReactNode }) {
  return <div className="group/b relative">
    <button onClick={() => setMenu(!menu)} title="Baustein" className={`absolute -left-9 top-1 w-6 h-7 rounded-[6px] flex items-center justify-center text-mute hover:text-ink hover:bg-sage-50 transition ${menu ? 'opacity-100 bg-sage-50' : 'opacity-0 group-hover/b:opacity-100'}`}><GripVertical size={15} /></button>
    {menu && <><div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
      <div className="absolute z-40 -left-9 top-9 w-52 rounded-[12px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-1">
        {TEXTY.has(b.t) && <>{BLOCK_TYPES.map(([t, l, I]) => <button key={t} onClick={() => onType(t)} className={`w-full h-9 px-2.5 rounded-[8px] flex items-center gap-2.5 text-[13.5px] hover:bg-sage-50 ${b.t === t ? 'text-olive-700 font-medium' : ''}`}><I size={15} className="text-mute" />{l}</button>)}<div className="my-1 h-px bg-line" /></>}
        <button disabled={first} onClick={() => onMove(-1)} className="w-full h-9 px-2.5 rounded-[8px] flex items-center gap-2.5 text-[13.5px] hover:bg-sage-50 disabled:opacity-40"><ArrowUp size={15} className="text-mute" />Nach oben</button>
        <button disabled={last} onClick={() => onMove(1)} className="w-full h-9 px-2.5 rounded-[8px] flex items-center gap-2.5 text-[13.5px] hover:bg-sage-50 disabled:opacity-40"><ArrowDown size={15} className="text-mute" />Nach unten</button>
        <button onClick={onDelete} className="w-full h-9 px-2.5 rounded-[8px] flex items-center gap-2.5 text-[13.5px] hover:bg-sage-50 text-alert/90"><Trash2 size={15} />Entfernen</button>
      </div></>}
    {children}
  </div>
}

function BlockBody({ b, urls, focus, clearFocus, onChange, onSplit, onExitList, onRemove }: {
  b: B; urls: Record<string, string>; focus: { at: 'end' | 'start'; item?: number } | null; clearFocus: () => void
  onChange: (p: Partial<WikiBlock>) => void; onSplit: (rest: string) => void; onExitList: () => void; onRemove: () => void
}) {
  const [itemFocus, setItemFocus] = useState<{ i: number; at: 'end' | 'start' } | null>(null)
  const txtKeys = (e: KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const rest = cutTail(el); onChange({ text: b.t === 'h' ? el.innerText.trim() : htmlToMd(el).trim() }); onSplit(rest) }
    else if (e.key === 'Backspace' && !el.innerText.trim() && caretAtStart(el)) { e.preventDefault(); onRemove() }
  }
  const pad = 'py-1.5'
  switch (b.t) {
    case 'h': return <Editable rich={false} value={b.text ?? ''} onChange={v => onChange({ text: v })} placeholder="Überschrift" focus={focus?.at} onFocused={clearFocus} onKeyDown={txtKeys} className={`text-[20px] font-medium tracking-tight pt-4 pb-1`} />
    case 'p': return <Editable value={b.text ?? ''} onChange={v => onChange({ text: v })} placeholder="Text schreiben …" focus={focus?.at} onFocused={clearFocus} onKeyDown={txtKeys} className={`text-[16px] leading-relaxed ${pad}`} />
    case 'quote': return <div className="my-1.5 border-l-[3px] border-sage-400 pl-3"><Editable value={b.text ?? ''} onChange={v => onChange({ text: v })} placeholder="Hinweis" focus={focus?.at} onFocused={clearFocus} onKeyDown={txtKeys} className="text-[16px] leading-relaxed text-sage-800 py-0.5" /></div>
    case 'ul': case 'ol': {
      const items = b.items?.length ? b.items : ['']
      const L = b.t === 'ul' ? 'ul' : 'ol'
      return <L className={`${b.t === 'ul' ? 'list-disc' : 'list-decimal'} pl-6 space-y-1 text-[16px] leading-relaxed ${pad}`}>{items.map((x, j) => <li key={`${b.k}-${j}-${items.length}`}>
        <Editable value={x} onChange={v => onChange({ items: items.map((y, n) => n === j ? v : y) })} placeholder="Punkt" className=""
          focus={itemFocus?.i === j ? itemFocus.at : focus && (focus.item ?? 0) === j ? focus.at : null} onFocused={() => { setItemFocus(null); clearFocus() }}
          onKeyDown={(e, el) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!el.innerText.trim()) { onChange({ items: items.filter((_, n) => n !== j) }); onExitList(); return }
              const rest = cutTail(el); const now = htmlToMd(el).trim()
              onChange({ items: [...items.slice(0, j), now, rest, ...items.slice(j + 1)] }); setItemFocus({ i: j + 1, at: 'start' })
            } else if (e.key === 'Backspace' && !el.innerText.trim() && caretAtStart(el)) {
              e.preventDefault()
              if (items.length === 1) { onRemove(); return }
              onChange({ items: items.filter((_, n) => n !== j) }); setItemFocus({ i: Math.max(0, j - 1), at: 'end' })
            }
          }} />
      </li>)}</L>
    }
    case 'img': return <div className={pad}>{b.src && urls[b.src] ? <img src={urls[b.src]} alt="" className="w-full rounded-[16px] bg-sage-100" /> : <div className="w-full aspect-[4/3] rounded-[16px] bg-sage-100 flex items-center justify-center text-mute"><ImageIcon size={22} /></div>}</div>
    case 'video': {
      if (b.src) return <div className={pad}>{urls[b.src] ? <video src={urls[b.src]} controls playsInline className="w-full rounded-[16px] bg-olive-700" /> : <div className="w-full aspect-video rounded-[16px] bg-sage-100" />}</div>
      const id = b.url ? ytId(b.url) : null
      return <div className={`${pad} space-y-2`}>
        {id ? <iframe className="w-full aspect-video rounded-[16px]" src={`https://www.youtube-nocookie.com/embed/${id}`} title="Video" allow="encrypted-media; picture-in-picture" allowFullScreen /> : null}
        <input value={b.url ?? ''} onChange={e => onChange({ url: e.target.value })} placeholder="YouTube-Link einfügen, z. B. https://youtu.be/…" className={inpStone} autoFocus={!b.url} />
      </div>
    }
    case 'file': return <div className={`${pad}`}><div className="flex items-center gap-3 rounded-2xl bg-sage-50 px-4 py-3 text-[15px]"><span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-sage-800 shrink-0"><FileText size={17} /></span>
      <input value={b.name ?? ''} onChange={e => onChange({ name: e.target.value })} placeholder="Name der Datei" className="flex-1 min-w-0 bg-transparent outline-none" />
      {b.src && urls[b.src] && <a href={urls[b.src]} target="_blank" rel="noreferrer" className="text-[13px] text-olive-700 hover:underline flex items-center gap-1"><Upload size={13} className="rotate-180" />Öffnen</a>}</div></div>
    default: return null
  }
}

/** Beim Markieren von Text: fett, kursiv, Link. */
function SelectionBar() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const on = () => {
      const s = window.getSelection()
      const host = s?.anchorNode ? (s.anchorNode instanceof HTMLElement ? s.anchorNode : s.anchorNode.parentElement)?.closest('[data-rich]') : null
      if (!s || s.isCollapsed || !host) { setPos(null); return }
      const r = s.getRangeAt(0).getBoundingClientRect(); setPos({ x: r.left + r.width / 2, y: r.top })
    }
    document.addEventListener('selectionchange', on); return () => document.removeEventListener('selectionchange', on)
  }, [])
  if (!pos) return null
  const run = (cmd: string, arg?: string) => { document.execCommand(cmd, false, arg); const el = window.getSelection()?.anchorNode?.parentElement?.closest('[data-rich]'); el?.dispatchEvent(new Event('input', { bubbles: true })) }
  const btnC = 'w-8 h-8 rounded-[7px] flex items-center justify-center hover:bg-white/10'
  return createPortal(<div onMouseDown={e => e.preventDefault()} style={{ left: pos.x, top: pos.y - 44 }} className="fixed z-50 -translate-x-1/2 flex items-center gap-0.5 rounded-[10px] bg-ink text-white p-1 shadow-lg">
    <button title="Fett" onClick={() => run('bold')} className={btnC}><Bold size={15} /></button>
    <button title="Kursiv" onClick={() => run('italic')} className={btnC}><Italic size={15} /></button>
    <button title="Link" onClick={() => { const u = prompt('Link (https://…)'); if (u) run('createLink', /^https?:\/\//.test(u) ? u : `https://${u}`) }} className={btnC}><Link2 size={15} /></button>
  </div>, document.body)
}
