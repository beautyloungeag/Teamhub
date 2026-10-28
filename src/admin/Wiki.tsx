import { useEffect, useId, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@tiptap/react'
import { Search, Trash2, ChevronRight, Sparkles, Smartphone, X } from 'lucide-react'
import { openBenniDraft } from '../BenniChat'
import { useApp, type WikiBlock } from '../store'
import { supabase } from '../lib/supabase'
import { emojiOf, catKey, EMOJI_CHOICES, AREAS, areaOf, assignedArea, fuzzyIncludes, type Area } from '../lib/wiki'
import { PREVIEW_KEY } from '../Mobile'
import { areaLook, AREA_ICONS, AREA_TONES, type AreaIcon } from '../lib/area-look'
import { TONE } from '../tones'
import { markUnsaved } from '../lib/unsaved'
import { toast } from '../Toast'
import { ArticleBody } from './ArticleBody'
import { H, New, Th, Field, Back, Empty, Status, DataRow, Select, Seg, Modal, btn, btn2, inpStone, retranslate, IconBox, Tag } from './kit'

// Wissen im Backoffice (nur Büro): gleiche Ansicht wie in der App, nur bearbeitbar.
// Themen als Kacheln mit Emoji, gegliedert nach den fünf Hauptbereichen der App (22.10.) → Artikel eines Themas → Artikel,
// direkt im Aussehen der App bearbeitet.
// Inhalt sind Bausteine (wiki_articles.blocks): Text, Überschrift, Listen, Hinweis, Bild, Video, Datei.
// Bearbeitet wird seit 26.10. in einem Dokument-Editor mit Werkzeugleiste (ArticleBody, Tiptap), nicht mehr Baustein für Baustein.

const LEVEL: Record<string, string> = { alle: 'Alle', filialleitung: 'Leitung und Büro', buero: 'Nur Büro' }
const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1)

export function WikiAdmin() {
  const [cat, setCat] = useState<string | null>(null)
  const [art, setArt] = useState<{ id: string | null; cat: string } | null>(null)
  // Neue Seite beginnt oben (28.10.: der neue Artikel öffnete in der Scroll-Position der Themenliste, der Titel war weg)
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }) }, [cat, art?.id, art === null])
  if (art) return <ArticleEditor id={art.id} category={art.cat} onBack={() => setArt(null)} onSaved={id => setArt({ id, cat: art.cat })} />
  if (cat !== null) return <CategoryPage name={cat} onBack={() => setCat(null)} onOpen={id => setArt({ id, cat })} onRenamed={setCat} />
  return <Home onCat={setCat} onOpen={(id, c) => setArt({ id, cat: c })} />
}

/* ---------- Übersicht ---------- */
// Seit 28.10. (Matteo): „Alle Artikel“ als Tabelle mit Filter, Sortierung, Prüfdatum und Mehrfachauswahl,
// daneben „Bereiche & Themen“, wo das Büro Bereiche und Kacheln selbst anlegt.
type Art = ReturnType<typeof useApp>['wiki'][number]
const LEVEL_RANK: Record<string, number> = { alle: 0, filialleitung: 1, buero: 2 }
let homeTab: 'alle' | 'struktur' = 'alle'
function Home({ onCat, onOpen }: { onCat: (name: string) => void; onOpen: (id: string | null, cat: string) => void }) {
  const [tab, setTabState] = useState(homeTab)
  const setTab = (x: typeof homeTab) => { homeTab = x; setTabState(x) }
  const [newTopic, setNewTopic] = useState<string | null>(null), [areaEdit, setAreaEdit] = useState<Area | 'neu' | null>(null)
  const { wiki } = useApp()
  const n = wiki.filter(a => !a.fromNews).length
  return (<>
    <H action={<div className="flex gap-2">{tab === 'struktur' && <><button onClick={() => setAreaEdit('neu')} className={btn2}>Neuer Bereich</button><button onClick={() => setNewTopic('')} className={btn2}>Neues Thema</button></>}<MarcWrite /><New onClick={() => onOpen(null, '')}>Neuer Artikel</New></div>}>Wissen</H>
    <div className="mb-6"><Seg value={tab} onChange={setTab} items={[['alle', <>Alle Artikel <span className="ml-1 text-mute tabular-nums">{n}</span></>], ['struktur', 'Bereiche & Themen']]} /></div>
    {tab === 'alle' ? <AllArticles onOpen={a => onOpen(a.id, a.catKey)} /> : <Structure onCat={onCat} onNewTopic={k => setNewTopic(k)} onEditArea={setAreaEdit} />}
    {newTopic !== null && <NewTopic area={newTopic} onClose={() => setNewTopic(null)} onDone={name => { setNewTopic(null); onOpen(null, name) }} />}
    {areaEdit && <AreaModal area={areaEdit === 'neu' ? null : areaEdit} onClose={() => setAreaEdit(null)} />}
  </>)
}

/** Alle Artikel als Tabelle (Matteo 28.10.): Filter, Sortierung, Prüfdatum, Mehrfachauswahl für Sammelaktionen */
let tableState = { q: '', area: '', status: '', level: '', due: false, sort: 'updated' as 'title' | 'area' | 'updated' | 'created' | 'review', dir: -1 }
function AllArticles({ onOpen }: { onOpen: (a: Art) => void }) {
  const { wiki, quizzes, reloadWiki, staff } = useApp()
  const [f, setF0] = useState(tableState)
  const setF = (x: Partial<typeof tableState>) => { tableState = { ...f, ...x }; setF0(tableState) }
  const [sel, setSel] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false), [move, setMove] = useState(false)
  const own = wiki.filter(a => !a.fromNews)
  const tested = new Set(quizzes.map(q => q.articleId))
  const today = new Date().toISOString().slice(0, 10)
  const areaName = (a: Art) => AREAS.find(x => x.key === areaOf(a.catKey, a.title))?.name ?? ''
  const list = own.filter(a => (!f.q || fuzzyIncludes(`${a.title} ${a.catKey} ${a.intro} ${a.tags.join(' ')}`, f.q))
    && (!f.area || areaOf(a.catKey, a.title) === f.area) && (!f.status || (f.status === 'on') === a.published)
    && (!f.level || a.accessLevel === f.level) && (!f.due || (!!a.reviewDue && a.reviewDue <= today)))
    .sort((x, y) => {
      const v = (a: Art) => f.sort === 'title' ? a.title.toLowerCase() : f.sort === 'area' ? `${areaName(a)} ${a.catKey}` : f.sort === 'created' ? a.createdAt ?? '' : f.sort === 'review' ? a.reviewDue ?? '9999' : a.at ?? ''
      return v(x) < v(y) ? -f.dir : v(x) > v(y) ? f.dir : 0
    })
  const allOn = list.length > 0 && list.every(a => sel.has(a.id))
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const chosen = own.filter(a => sel.has(a.id))
  const head = (key: typeof f.sort, label: string, w = '') => <th className={`${w} text-left font-normal text-xs text-mute px-3 py-2.5 border-b border-line`}><button onClick={() => setF(f.sort === key ? { dir: -f.dir } : { sort: key, dir: key === 'title' || key === 'area' || key === 'review' ? 1 : -1 })} className={f.sort === key ? 'text-ink' : 'hover:text-ink'}>{label}{f.sort === key ? (f.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>
  const done = async (msg: string) => { await reloadWiki(); retranslate(); setSel(new Set()); setBusy(false); toast(msg) }
  const setPublished = async (on: boolean) => {
    setBusy(true)
    const { error } = await supabase!.from('wiki_articles').update({ published: on, updated_at: new Date().toISOString() }).in('id', [...sel])
    if (error) { setBusy(false); toast('Das hat nicht geklappt', 'error'); return }
    await done(on ? `${sel.size} sichtbar gemacht` : `${sel.size} als Entwurf`)
  }
  const del = async () => {
    const q = chosen.filter(a => tested.has(a.id)).length
    if (!confirm(`${sel.size} ${sel.size === 1 ? 'Artikel' : 'Artikel'} endgültig löschen?${q ? ` ${q} davon haben einen Test, der mitgelöscht wird.` : ''} Lesestände gehen verloren. Das lässt sich nicht rückgängig machen.`)) return
    setBusy(true)
    const ids = [...sel]
    const { data } = await supabase!.from('wiki_articles').select('blocks, media_url').in('id', ids)
    const { error } = await supabase!.from('wiki_articles').delete().in('id', ids)
    if (error) { setBusy(false); toast('Löschen hat nicht geklappt', 'error'); return }
    // Fotos und Dateien der gelöschten Artikel mit entfernen
    const files = [...new Set((data ?? []).flatMap((r: { blocks: WikiBlock[] | null; media_url: string | null }) => [...pathsOf(r.blocks ?? []), r.media_url ?? '']).filter(x => x.startsWith('wiki/')))]
    for (let i = 0; i < files.length; i += 100) await supabase!.storage.from('media').remove(files.slice(i, i + 100))
    await done(ids.length === 1 ? 'Artikel gelöscht' : `${ids.length} Artikel gelöscht`)
  }
  const owner = (id?: string | null) => { const p = id ? staff.find(s => s.id === id) : null; return p ? `${p.first} ${p.last}` : '' }
  const fmt = (d?: string | null) => d ? new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(d)) : '–'
  return (<>
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="h-10 w-[260px] rounded-[10px] bg-sage-50 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={f.q} onChange={e => setF({ q: e.target.value })} placeholder="Artikel suchen" className="flex-1 min-w-0 outline-none text-[14px] bg-transparent" /></div>
      <Select compact className="w-52" value={f.area} onChange={v => setF({ area: v })} placeholder="Alle Bereiche" options={[{ value: '', label: 'Alle Bereiche' }, ...AREAS.map(a => ({ value: a.key, label: a.name }))]} />
      <Select compact className="w-36" value={f.status} onChange={v => setF({ status: v })} placeholder="Jeder Status" options={[{ value: '', label: 'Jeder Status' }, { value: 'on', label: 'Sichtbar' }, { value: 'off', label: 'Entwurf' }]} />
      <Select compact className="w-44" value={f.level} onChange={v => setF({ level: v })} placeholder="Für alle Rollen" options={[{ value: '', label: 'Für alle Rollen' }, ...Object.entries(LEVEL).map(([value, label]) => ({ value, label }))]} />
      <label className="h-10 px-3 rounded-[10px] bg-sage-50 flex items-center gap-2 text-[13.5px] cursor-pointer"><input type="checkbox" checked={f.due} onChange={e => setF({ due: e.target.checked })} />Prüfung fällig</label>
      <span className="ml-auto text-[13px] text-mute tabular-nums">{list.length} von {own.length}</span>
    </div>
    {/* Unten schwebend, damit die Tabelle beim Auswählen nicht verrutscht */}
    {sel.size > 0 && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-3 py-2 rounded-[14px] bg-olive-800 text-white flex items-center gap-2 text-[13.5px] shadow-[0_16px_40px_-12px_rgba(29,34,28,.55)] whitespace-nowrap">
      <span className="mr-2 tabular-nums">{sel.size} ausgewählt</span>
      <button disabled={busy} onClick={() => setPublished(true)} className="h-8 px-3 rounded-[8px] bg-white/15 hover:bg-white/25">Sichtbar machen</button>
      <button disabled={busy} onClick={() => setPublished(false)} className="h-8 px-3 rounded-[8px] bg-white/15 hover:bg-white/25">Als Entwurf</button>
      <button disabled={busy} onClick={() => setMove(true)} className="h-8 px-3 rounded-[8px] bg-white/15 hover:bg-white/25">Thema ändern …</button>
      <button disabled={busy} onClick={del} className="h-8 px-3 rounded-[8px] bg-[#B5432F] hover:bg-[#9c3826] flex items-center gap-1.5"><Trash2 size={14} />Löschen</button>
      <button onClick={() => setSel(new Set())} aria-label="Auswahl aufheben" className="ml-1 h-8 px-3 rounded-[8px] hover:bg-white/15">Abbrechen</button>
    </div>}
    {list.length === 0 ? <Empty>Kein Artikel passt zu diesen Filtern.</Empty> :
    <table className="tbl w-full text-[14px] table-fixed"><thead><tr>
      <th className="w-10 px-3 py-2.5 border-b border-line"><input type="checkbox" aria-label="Alle auswählen" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(list.map(a => a.id)))} /></th>
      {head('title', 'Artikel')}{head('area', 'Bereich · Thema', 'w-[210px]')}
      <th className="w-[140px] text-left font-normal text-xs text-mute px-3 py-2.5 border-b border-line">Sichtbar für</th>
      <th className="w-[110px] text-left font-normal text-xs text-mute px-3 py-2.5 border-b border-line">Status</th>
      {head('review', 'Prüfen bis', 'w-[105px]')}{head('updated', 'Geändert', 'w-[100px]')}
    </tr></thead>
      <tbody className="divide-y divide-line">{list.map(a => { const look = areaLook(areaOf(a.catKey, a.title)), I = look.icon, late = !!a.reviewDue && a.reviewDue <= today
        return <tr key={a.id} onClick={() => onOpen(a)} className={`cursor-pointer ${sel.has(a.id) ? 'bg-sage-50' : 'hover:bg-sage-50/70'}`}>
          <td className="px-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`${a.title} auswählen`} checked={sel.has(a.id)} onChange={() => toggle(a.id)} /></td>
          <td className="px-3 py-2.5"><span className="flex items-center gap-3 min-w-0"><IconBox tone={look.tone} size="w-8 h-8 rounded-[10px]"><I size={15} /></IconBox><span className="min-w-0"><span className="flex items-center gap-2 min-w-0"><span className="truncate">{a.title}</span>{tested.has(a.id) && <Tag tone="duty">mit Test</Tag>}</span><span className="block text-[12.5px] text-mute truncate">{[a.intro, owner(a.ownerId) && `verantwortlich: ${owner(a.ownerId)}`].filter(Boolean).join(' · ')}</span></span></span></td>
          <td className="px-3 text-[13px]"><span className="block truncate">{areaName(a)}</span><span className="block text-mute truncate">{cap(a.catKey)}</span></td>
          <td className="px-3 text-ink/80 truncate text-[13px]">{LEVEL[a.accessLevel]}</td>
          <td className="px-3">{a.published ? <Status kind="yes">Sichtbar</Status> : <Status kind="none">Entwurf</Status>}</td>
          <td className={`px-3 tabular-nums text-[13px] ${late ? 'text-alert' : 'text-mute'}`}>{fmt(a.reviewDue)}</td>
          <td className="px-3 tabular-nums text-[13px] text-mute">{fmt(a.at)}</td>
        </tr> })}</tbody></table>}
    {sel.size > 0 && <div className="h-20" />}
    {move && <MoveModal ids={[...sel]} onClose={() => setMove(false)} onDone={() => { setMove(false); void done('Thema geändert') }} />}
  </>)
}

/** Ausgewählte Artikel in ein anderes Thema verschieben; liegt es in einem geschützten Bereich, zieht die Sichtbarkeit mit */
function MoveModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const { wiki } = useApp()
  const cats = [...new Set(wiki.filter(a => !a.fromNews).map(a => a.catKey))].sort((a, b) => a.localeCompare(b))
  const [cat, setCat] = useState(''), [busy, setBusy] = useState(false)
  const go = async () => {
    if (!cat) return
    setBusy(true)
    const { error } = await supabase!.from('wiki_articles').update({ category: cat, updated_at: new Date().toISOString() }).in('id', ids)
    if (!error) await enforceAreaLevel(cat)
    setBusy(false)
    if (error) { toast('Das hat nicht geklappt', 'error'); return }
    onDone()
  }
  return <Modal title={`${ids.length} ${ids.length === 1 ? 'Artikel' : 'Artikel'} verschieben`} onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={!cat || busy} onClick={go} className={btn}>Verschieben</button></>}>
    <Select value={cat} onChange={setCat} placeholder="Thema wählen" tone="stone" options={cats.map(c => ({ value: c, label: `${cap(c)} · ${AREAS.find(a => a.key === areaOf(c, ''))?.name ?? ''}` }))} />
  </Modal>
}

/** Liegt ein Thema in einem Bereich nur für Leitung oder Büro, werden seine Artikel mindestens so geschützt (inkl. Dateien) */
async function enforceAreaLevel(cat: string) {
  const area = AREAS.find(a => a.key === assignedArea(cat))
  if (!area || area.access === 'alle') return 0
  const { data } = await supabase!.from('wiki_articles').select('id, access_level, blocks').eq('category', cat)
  let n = 0
  for (const r of (data ?? []) as { id: string; access_level: string; blocks: WikiBlock[] | null }[]) {
    if (LEVEL_RANK[r.access_level] >= LEVEL_RANK[area.access]) continue
    const { blocks } = await moveFiles(r.blocks ?? [], area.access)
    const { error } = await supabase!.from('wiki_articles').update({ access_level: area.access, blocks }).eq('id', r.id)
    if (!error) n++
  }
  return n
}
/** Dateien liegen nach Sichtbarkeit getrennt (Speicherrechte): beim Wechsel ziehen sie in den Ordner der neuen Stufe */
async function moveFiles(src: WikiBlock[], level: string): Promise<{ blocks: WikiBlock[]; moved: boolean }> {
  let moved = false
  const move = async (p: string) => {
    if (!p.startsWith('wiki/') || p.startsWith(`wiki/${level}/`)) return p
    const to = `wiki/${level}/${p.split('/').pop()}`
    const { error } = await supabase!.storage.from('media').move(p, to)
    if (error) return p
    moved = true; return to
  }
  const blocks: WikiBlock[] = []
  for (const b0 of src) {
    const b = { ...b0 }
    if (b.src) b.src = await move(b.src)
    if (b.media) b.media = await Promise.all(b.media.map(async m => m?.src ? { ...m, src: await move(m.src) } : m))
    blocks.push(b)
  }
  return { blocks, moved }
}

/** Bereiche mit ihren Themen-Kacheln; das Büro legt Bereiche und Themen an und ordnet zu */
function Structure({ onCat, onNewTopic, onEditArea }: { onCat: (name: string) => void; onNewTopic: (area: string) => void; onEditArea: (a: Area) => void }) {
  const { wiki, catEmojis, catAreas, wikiStructure } = useApp()
  void wikiStructure
  const own = wiki.filter(a => !a.fromNews)
  // Jedes Thema steht in dem Bereich, in den die meisten seiner Artikel fallen (gleiche Regel wie in der App)
  const areaOfCat = (name: string) => assignedArea(name) ?? (() => { const n = new Map<string, number>(); own.filter(a => a.catKey === name).forEach(a => { const k = areaOf(a.catKey, a.title); n.set(k, (n.get(k) ?? 0) + 1) }); return [...n.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? areaOf(name, '') })()
  const cats = [...own.reduce((m, a) => { const c = m.get(a.catKey) ?? { name: a.catKey, n: 0, drafts: 0 }; c.n++; if (!a.published) c.drafts++; return m.set(a.catKey, c) }, new Map<string, { name: string; n: number; drafts: number }>()).values()]
  // Leere Themen, die schon einem Bereich zugeordnet sind, stehen auch da
  for (const k of Object.keys(catAreas)) if (!cats.some(c => catKey(c.name) === k)) cats.push({ name: k, n: 0, drafts: 0 })
  cats.sort((x, y) => y.n - x.n || x.name.localeCompare(y.name))
  return <div className="space-y-10">{AREAS.map(ar => { const look = areaLook(ar.key), Icon = look.icon, mine = cats.filter(c => areaOfCat(c.name) === ar.key)
    const n = own.filter(a => areaOf(a.catKey, a.title) === ar.key).length
    return <section key={ar.key}>
      <div className="flex items-center gap-3.5 mb-3"><IconBox tone={look.tone}><Icon size={20} /></IconBox>
        <div className="min-w-0 flex-1"><h2 className="text-[20px] leading-tight flex items-center gap-2">{ar.name}{ar.access !== 'alle' && <Tag tone="studio">{ar.access === 'buero' ? 'Nur Büro' : 'Nur Leitung und Büro'}</Tag>}</h2><p className="text-[13px] text-mute">{ar.desc}{ar.desc ? ' · ' : ''}{n === 1 ? '1 Artikel' : `${n} Artikel`}</p></div>
        <button onClick={() => onNewTopic(ar.key)} className="text-[13px] text-olive-700 hover:underline">Neues Thema hier</button>
        <button onClick={() => onEditArea(ar)} className="h-8 px-3 rounded-[8px] bg-sage-50 hover:bg-sage-100 text-[13px]">Bereich bearbeiten</button></div>
      {mine.length === 0 ? <p className="text-[13.5px] text-mute">Noch keine Themen in diesem Bereich. Lege mit „Neues Thema hier“ eine Kachel an.</p> :
      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">{mine.map(c => (
        <button key={c.name} onClick={() => onCat(c.name)} className="group text-left rounded-[20px] bg-sage-50 hover:bg-sage-100 p-4 h-[120px] flex flex-col justify-between transition">
          <span className="flex items-start justify-between"><span className="text-[28px] leading-none" aria-hidden="true">{emojiOf(c.name, catEmojis)}</span><ChevronRight size={16} className="text-sage-400 group-hover:text-ink transition" /></span>
          <span className="min-w-0"><span className="block font-display text-[17px] leading-tight truncate">{cap(c.name)}</span>
            <span className="block text-[12.5px] text-mute mt-0.5">{c.n === 1 ? '1 Artikel' : `${c.n} Artikel`}{c.drafts ? ` · ${c.drafts} Entwurf${c.drafts > 1 ? 'e' : ''}` : ''}</span></span>
        </button>))}</div>}
    </section> })}</div>
}

/** Bereich anlegen oder ändern: Name, Beschreibung, Zeichen, Farbe, für wen sichtbar */
function AreaModal({ area, onClose }: { area: Area | null; onClose: () => void }) {
  const { reloadWiki, wiki } = useApp()
  const [f, setF] = useState({ name: area?.name ?? '', desc: area?.desc ?? '', icon: area?.icon ?? 'book', tone: area?.tone ?? 'note', access: area?.access ?? 'alle' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const name = f.name.trim(); if (!name) return
    setBusy(true)
    const key = area?.key ?? (name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bereich') + (AREAS.some(a => a.key === name.toLowerCase()) ? '-' + Date.now().toString(36).slice(-4) : '')
    const row = { key, name, description: f.desc.trim(), icon: f.icon, tone: f.tone, access_level: f.access, sort: area?.sort ?? Math.max(0, ...AREAS.map(a => a.sort)) + 10 }
    const { error } = await supabase!.from('wiki_areas').upsert(row)
    if (error) { setBusy(false); toast('Speichern hat nicht geklappt', 'error'); return }
    await reloadWiki()
    // Strenger geworden: Artikel der zugeordneten Themen mitziehen
    let n = 0
    if (f.access !== 'alle') for (const c of new Set(wiki.filter(a => !a.fromNews && assignedArea(a.catKey) === key).map(a => a.catKey))) n += await enforceAreaLevel(c)
    if (n) await reloadWiki()
    retranslate(); setBusy(false); toast(area ? `Bereich gespeichert${n ? `, ${n} Artikel geschützt` : ''}` : 'Bereich angelegt'); onClose()
  }
  const del = async () => {
    if (!area) return
    const topics = new Set(wiki.filter(a => !a.fromNews && assignedArea(a.catKey) === area.key).map(a => a.catKey))
    if (!confirm(`Bereich „${area.name}“ löschen?${topics.size ? ` Die ${topics.size} Themen darin bleiben erhalten und werden wieder automatisch eingeordnet.` : ''}`)) return
    setBusy(true)
    const { error } = await supabase!.from('wiki_areas').delete().eq('key', area.key)
    setBusy(false)
    if (error) { toast('Löschen hat nicht geklappt', 'error'); return }
    await reloadWiki(); toast('Bereich gelöscht'); onClose()
  }
  return <Modal title={area ? 'Bereich bearbeiten' : 'Neuer Bereich'} onClose={onClose} footer={<>{area && <button onClick={del} className="mr-auto text-[13px] text-mute hover:text-alert flex items-center gap-1.5"><Trash2 size={14} />Bereich löschen</button>}<button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={!f.name.trim() || busy} onClick={save} className={btn}>{area ? 'Speichern' : 'Anlegen'}</button></>}>
    <div className="space-y-3">
      <Field label="Name"><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="z. B. Filialleitung" className={inpStone} /></Field>
      <Field label="Kurzbeschreibung"><input value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} placeholder="z. B. Kasse, Personal, Abläufe für die Leitung" className={inpStone} /></Field>
      <div><span className="block text-xs text-mute mb-1.5">Zeichen</span><div className="flex flex-wrap gap-1.5">{(Object.keys(AREA_ICONS) as AreaIcon[]).map(k => { const I = AREA_ICONS[k]; return <button key={k} onClick={() => setF({ ...f, icon: k })} aria-label={k} className={`w-10 h-10 rounded-[10px] flex items-center justify-center ${f.icon === k ? 'bg-olive-700 text-white' : 'bg-sage-50 hover:bg-sage-100'}`}><I size={18} /></button> })}</div></div>
      <div><span className="block text-xs text-mute mb-1.5">Farbe</span><div className="flex flex-wrap gap-1.5">{AREA_TONES.map(k => <button key={k} onClick={() => setF({ ...f, tone: k })} aria-label={k} className={`w-10 h-10 rounded-[10px] ${TONE[k].bg} flex items-center justify-center ${f.tone === k ? 'ring-2 ring-olive-700' : ''}`}><span className={`w-4 h-4 rounded-full ${TONE[k].solid}`} /></button>)}</div></div>
      <Field label="Sichtbar für"><Select tone="stone" value={f.access} onChange={v => setF({ ...f, access: v as Area['access'] })} options={Object.entries(LEVEL).map(([value, label]) => ({ value, label }))} /></Field>
      {f.access !== 'alle' && <p className="text-[12.5px] text-mute">Artikel in den Themen dieses Bereichs werden automatisch auf „{LEVEL[f.access]}“ gesetzt, damit sie nur diese Rollen sehen.</p>}
    </div>
  </Modal>
}

function ArticleTable({ items, onOpen }: { items: Art[]; onOpen: (a: Art) => void }) {
  const { quizzes } = useApp()
  const tested = new Set(quizzes.map(q => q.articleId))
  return <table className="tbl w-full text-[14px] table-fixed"><thead><tr><Th>Artikel</Th><th className="w-[190px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Sichtbar für</th><th className="w-[130px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Aktualisiert</th><th className="w-[130px] text-left font-normal text-xs text-mute px-4 py-2.5 border-b border-line">Status</th><th className="w-10 border-b border-line" /></tr></thead>
    <tbody className="divide-y divide-line">{items.map(a => { const look = areaLook(areaOf(a.catKey, a.title)), I = look.icon
      return <tr key={a.id} onClick={() => onOpen(a)} className="cursor-pointer hover:bg-sage-50/70">
      <td className="px-4 py-3"><span className="flex items-center gap-3 min-w-0"><IconBox tone={look.tone} size="w-8 h-8 rounded-[10px]"><I size={15} /></IconBox><span className="min-w-0"><span className="flex items-center gap-2 min-w-0"><span className="truncate">{a.title}</span>{tested.has(a.id) && <Tag tone="duty">mit Test</Tag>}</span>{a.intro && <span className="block text-[12.5px] text-mute truncate">{a.intro}</span>}</span></span></td>
      <td className="px-4 text-ink/80 truncate">{LEVEL[a.accessLevel]}</td>
      <td className="px-4 text-mute">{a.updated}</td>
      <td className="px-4">{a.published ? <Status kind="yes">Sichtbar</Status> : <Status kind="none">Entwurf</Status>}</td>
      <td className="px-2 text-right text-mute"><ChevronRight size={15} className="inline" /></td>
    </tr> })}</tbody></table>
}

/* ---------- Ein Thema: Emoji und Name ändern, Artikel ---------- */
function CategoryPage({ name, onBack, onOpen, onRenamed }: { name: string; onBack: () => void; onOpen: (id: string | null) => void; onRenamed: (n: string) => void }) {
  const { wiki, catEmojis, reloadWiki } = useApp()
  // Neueste zuerst wie in der App (26.10.)
  const items = wiki.filter(a => !a.fromNews && a.catKey === name).sort((x, y) => (y.at ?? '').localeCompare(x.at ?? '') || x.title.localeCompare(y.title))
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
  // Thema einem Bereich zuordnen (28.10.); ein geschützter Bereich schützt auch die Artikel darin
  const area = assignedArea(name) ?? ''
  const setArea = async (k: string) => {
    const target = AREAS.find(a => a.key === k)
    if (target && target.access !== 'alle' && !confirm(`„${cap(name)}“ in „${target.name}“ verschieben? Die ${items.length} Artikel sind danach nur noch für ${LEVEL[target.access]} sichtbar.`)) return
    const { error } = await supabase!.from('wiki_categories').upsert({ key: catKey(name), area_key: k || null, updated_at: new Date().toISOString() })
    if (error) { toast('Das hat nicht geklappt', 'error'); return }
    await reloadWiki()
    const n = k ? await enforceAreaLevel(name) : 0
    if (n) await reloadWiki()
    toast(n ? `Bereich geändert, ${n} Artikel geschützt` : 'Bereich geändert')
  }
  return (<div className="max-w-[1100px]">
    <Back onClick={onBack}>Wissen</Back>
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <EmojiButton name={name} emoji={emojiOf(name, catEmojis)} />
        <div className="min-w-0">
          <input value={title} onChange={e => setTitle(e.target.value)} onBlur={rename} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} title="Namen ändern" className="font-display text-[30px] leading-tight bg-transparent outline-none rounded-[8px] -ml-1 px-1 hover:bg-sage-50 focus:bg-sage-50 w-full" />
          <p className="text-[13px] text-mute">{items.length === 1 ? '1 Artikel' : `${items.length} Artikel`} · Emoji und Name lassen sich anklicken und ändern</p>
          <div className="mt-2 flex items-center gap-2 text-[13px]"><span className="text-mute">Bereich</span><Select compact className="w-60" value={area} onChange={setArea} placeholder="Automatisch" options={[{ value: '', label: `Automatisch (${AREAS.find(a => a.key === areaOf(name, ''))?.name ?? ''})` }, ...AREAS.map(a => ({ value: a.key, label: a.name }))]} /></div>
        </div>
      </div>
      <div className="flex gap-2 shrink-0"><MarcWrite topic={name} /><New onClick={() => onOpen(null)}>Neuer Artikel</New></div>
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

function NewTopic({ area: area0, onClose, onDone }: { area?: string; onClose: () => void; onDone: (name: string) => void }) {
  const { reloadWiki } = useApp()
  const [name, setName] = useState(''), [emoji, setEmoji] = useState('📄'), [area, setArea] = useState(area0 || '')
  const go = async () => {
    const n = name.trim(); if (!n) return
    const { error } = await supabase!.from('wiki_categories').upsert({ key: catKey(n), emoji, area_key: area || null, updated_at: new Date().toISOString() })
    if (error) { toast('Speichern hat nicht geklappt', 'error'); return }
    await reloadWiki()
    onDone(n)
  }
  return <Modal title="Neues Thema" onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={!name.trim()} onClick={go} className={`${btn} disabled:opacity-50`}>Ersten Artikel schreiben</button></>}>
    <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="Name, z. B. Hygiene" className={inpStone} />
    <div className="mt-3"><Select tone="stone" value={area} onChange={setArea} placeholder="Bereich wählen (sonst automatisch)" options={[{ value: '', label: 'Automatisch einordnen' }, ...AREAS.map(a => ({ value: a.key, label: a.name }))]} /></div>
    <p className="mt-4 text-xs text-mute mb-1.5">Emoji</p>
    <div className="grid grid-cols-10 gap-1">{EMOJI_CHOICES.map(e => <button key={e} onClick={() => setEmoji(e)} className={`h-9 rounded-[8px] text-[20px] hover:bg-sage-50 ${e === emoji ? 'bg-sage-100' : ''}`}>{e}</button>)}</div>
    <p className="mt-3 text-[12.5px] text-mute">Ein Thema erscheint in der App, sobald ein Artikel darin freigegeben ist.</p>
  </Modal>
}

/* ---------- Artikel: so wie in der App, direkt bearbeitbar ---------- */
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
const textOf = (b: WikiBlock) => b.t === 'ul' || b.t === 'ol' ? (b.items ?? []).join('\n') : b.text ?? ''
// Alle Dateipfade eines Artikels, auch Bilder und Videos an Aufzählungspunkten
const pathsOf = (bs: WikiBlock[]) => bs.flatMap(b => [b.src ?? '', ...(b.media ?? []).map(m => m?.src ?? '')])
const TEXTY = new Set(['p', 'h', 'quote', 'ul', 'ol'])

/** Titel und Kurzfassung: einfaches Textfeld im Aussehen der App. Inhalt wird nur beim Laden gesetzt, sonst springt der Cursor. */
function Editable({ value, onChange, className, placeholder, onNext, elRef, autoFocus }: { value: string; onChange: (v: string) => void; className: string; placeholder: string; onNext?: () => void; elRef?: MutableRefObject<HTMLDivElement | null>; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (elRef) elRef.current = ref.current })
  useEffect(() => { if (ref.current) ref.current.innerText = value }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} contentEditable suppressContentEditableWarning data-ph={placeholder}
    onInput={e => onChange(e.currentTarget.innerText.replace(/\n/g, ' '))}
    onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s*\n\s*/g, ' ')) }}
    onKeyDown={e => { if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); onNext?.() } }}
    className={`outline-none empty:before:content-[attr(data-ph)] empty:before:text-sage-400 ${className}`} />
}

// Artikel mit Marc schreiben (26.10., Renée: „Artikel mit der KI erstellen geht noch nicht?“): öffnet Marc mit vorbereitetem Auftrag
function MarcWrite({ topic }: { topic?: string }) {
  return <button onClick={() => openBenniDraft(`Schreib einen Wissensartikel${topic ? ` im Thema ${topic}` : ''} aus diesem Text (oder aus der angehängten Datei): `)} className={`${btn2} flex items-center gap-1.5`}><Sparkles size={15} />Mit Marc schreiben</button>
}

type Row = { title: string; intro: string; category: string; access_level: string; published: boolean; owner_id: string | null; blocks: WikiBlock[] | null; body: string; media_kind: string; media_url: string | null; review_due: string | null }
function ArticleEditor({ id, category, onBack, onSaved }: { id: string | null; category: string; onBack: () => void; onSaved: (id: string) => void }) {
  const { wiki, staff, reloadWiki, quizzes } = useApp()
  const cats = [...new Set(wiki.filter(a => !a.fromNews).map(a => a.catKey))].sort((a, b) => a.localeCompare(b))
  const [title, setTitle] = useState(''), [intro, setIntro] = useState(''), [cat, setCat] = useState(category)
  const [level, setLevel] = useState('alle'), [published, setPublished] = useState(!id ? false : true), [owner, setOwner] = useState(''), [review, setReview] = useState('')
  // Inhalt: Startstand für den Editor (mit Bildadressen) und laufender Stand als Bausteine
  const [doc, setDoc] = useState<{ blocks: WikiBlock[]; urls: Record<string, string>; ver: number } | null>(id ? null : { blocks: [], urls: {}, ver: 0 })
  const blocks = useRef<WikiBlock[]>([])
  // Nach dem ersten Speichern bekommt der Artikel seine id: nicht neu laden, der Editor hat den Stand schon
  const justCreated = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const editorRef = useRef<Editor | null>(null), introRef = useRef<HTMLDivElement | null>(null)
  const guard = useId()
  useEffect(() => { markUnsaved(guard, dirty) }, [dirty, guard])
  useEffect(() => () => markUnsaved(guard, false), [guard])

  const sign = async (paths: string[]) => {
    const need = [...new Set(paths.filter(p => p && !/^https?:/.test(p)))]; if (!need.length) return {}
    const { data } = await supabase!.storage.from('media').createSignedUrls(need, 6 * 3600)
    return Object.fromEntries((data ?? []).filter(x => x.signedUrl && x.path).map(x => [x.path!, x.signedUrl as string])) as Record<string, string>
  }
  useEffect(() => {
    if (!id || id === justCreated.current) return
    supabase!.from('wiki_articles').select('title, intro, category, access_level, published, owner_id, blocks, body, media_kind, media_url, review_due').eq('id', id).single().then(async ({ data }) => {
      const r = data as Row | null; if (!r) return
      // Altes Einzelmedium (Foto/Video oben) wird zum ersten Baustein, damit es nur noch ein Modell gibt
      const lead: WikiBlock[] = r.media_url && r.media_kind !== 'none' ? [r.media_kind === 'youtube' ? { t: 'video', url: r.media_url } : { t: r.media_kind === 'video' ? 'video' : 'img', src: r.media_url }] : []
      const bs: WikiBlock[] = [...lead, ...(r.blocks ?? (r.body ? r.body.split(/\n\n+/).filter(Boolean).map(text => ({ t: 'p' as const, text })) : []))]
      setTitle(r.title); setIntro(r.intro ?? ''); setCat(r.category); setLevel(r.access_level); setPublished(r.published); setOwner(r.owner_id ?? ''); setReview(r.review_due ?? '')
      blocks.current = bs
      setDoc({ blocks: bs, urls: await sign(pathsOf(bs)), ver: 0 })
    })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (f: File) => {
    if (f.size > 200 * 1024 * 1024) { toast('Die Datei ist grösser als 200 MB.', 'error'); return null }
    const path = `wiki/${level}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase!.storage.from('media').upload(path, f, { contentType: f.type })
    if (error) { toast('Hochladen hat nicht geklappt', 'error'); return null }
    const u = await sign([path])
    return { path, url: u[path] ?? '' }
  }

  const save = async () => {
    if (!title.trim()) { toast('Bitte einen Titel eingeben.', 'error'); return }
    if (!cat.trim()) { toast('Bitte ein Thema wählen.', 'error'); return }
    // Thema in einem geschützten Bereich (z. B. Filialleitung): der Artikel ist mindestens so geschützt
    const lvl = LEVEL_RANK[level] < LEVEL_RANK[areaAccess] ? areaAccess : level
    if (lvl !== level) setLevel(lvl)
    setBusy(true)
    // Dateien liegen nach Sichtbarkeit getrennt (Speicherrechte). Hat sich die Sichtbarkeit geändert, ziehen sie mit.
    const clean: WikiBlock[] = []
    let moved = false
    for (const src of blocks.current) {
      const b = { ...src }
      if (TEXTY.has(b.t) && !textOf(b).trim() && !b.media?.some(Boolean)) continue
      const move = async (src: string) => {
        if (!src.startsWith('wiki/') || src.startsWith(`wiki/${lvl}/`)) return src
        const to = `wiki/${lvl}/${src.split('/').pop()}`
        const { error } = await supabase!.storage.from('media').move(src, to)
        if (error) return src
        moved = true; return to
      }
      if (b.src) b.src = await move(b.src)
      if (b.t === 'ul' || b.t === 'ol') {
        // Leere Punkte fallen weg, ausser sie tragen ein Bild oder Video
        const keep = (b.items ?? []).map((x, j) => !!x.trim() || !!b.media?.[j])
        const media = b.media ? await Promise.all(b.media.map(async m => m?.src ? { ...m, src: await move(m.src) } : m)) : undefined
        b.items = (b.items ?? []).filter((_, j) => keep[j])
        if (media) { const m2 = media.filter((_, j) => keep[j]); if (m2.some(Boolean)) b.media = m2; else delete b.media }
      }
      clean.push(b)
    }
    const text = [intro.trim(), ...clean.map(b => plain(textOf(b)))].filter(Boolean).join('\n\n')
    const words = text.split(/\s+/).filter(Boolean).length + (clean.filter(b => b.t === 'img').length + clean.flatMap(b => b.media ?? []).filter(m => m?.t === 'img').length) * 15
    const row = { title: title.trim(), intro: intro.trim(), category: cat.trim(), access_level: lvl, published, owner_id: owner || null, review_due: review || null, blocks: clean, body: text,
      minutes: Math.max(1, Math.round(words / 180)), media_kind: 'none', media_url: null, updated_at: new Date().toISOString() }
    const r = id ? await supabase!.from('wiki_articles').update(row).eq('id', id).select('id').single() : await supabase!.from('wiki_articles').insert({ ...row, sort: 0 }).select('id').single()
    setBusy(false)
    if (r.error || !r.data) { toast('Speichern hat nicht geklappt', 'error'); return }
    blocks.current = clean
    // Verschobene Dateien haben neue Pfade: Editor mit dem gespeicherten Stand neu aufbauen
    if (moved) setDoc({ blocks: clean, urls: await sign(pathsOf(clean)), ver: (doc?.ver ?? 0) + 1 })
    setDirty(false); await reloadWiki(); retranslate(); toast('Gespeichert')
    if (!id) { justCreated.current = r.data.id; onSaved(r.data.id) }
  }
  // Cmd/Ctrl+S speichert wie in Word
  const saveRef = useRef(save); saveRef.current = save
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saveRef.current() } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [])
  // Vorschau wie in der App: aktueller Stand inklusive Ungespeichertem, in einem Handy-Rahmen (27.10.)
  const openPreview = async () => {
    const bs = blocks.current
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify({ id, title, intro, blocks: bs, urls: await sign(pathsOf(bs)), category: cat || 'Wissen', accessLevel: level })) } catch { toast('Vorschau ging gerade nicht', 'error'); return }
    setPreview(true)
  }
  const del = async () => {
    if (!id || !confirm(`Artikel „${title}“ endgültig löschen?`)) return
    const { error } = await supabase!.from('wiki_articles').delete().eq('id', id)
    if (error) { toast('Löschen hat nicht geklappt', 'error'); return }
    await reloadWiki(); toast('Gelöscht'); onBack()
  }
  const back = () => { if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return; markUnsaved(guard, false); onBack() }
  const quiz = id ? quizzes.find(q => q.articleId === id) : null
  const areaOfCat = AREAS.find(a => a.key === assignedArea(cat))
  const areaAccess = areaOfCat?.access ?? 'alle'
  const LEVEL_TEXT: Record<string, string> = { alle: 'alle Mitarbeiterinnen', filialleitung: 'Filialleitung und Büro', buero: 'nur das Büro' }

  if (!doc) return <div className="max-w-[1100px]"><Back onClick={onBack}>{cap(category) || 'Wissen'}</Back><p className="text-mute">Lädt …</p></div>
  return (<div className="max-w-[1100px]">
    {/* Feste Leiste oben (27.10.): Speichern und Vorschau sind immer erreichbar, auch tief im Artikel */}
    <div className="sticky -top-8 z-30 -mx-8 -mt-8 px-8 pt-8 pb-2.5 bg-white flex items-center gap-2">
      <Back onClick={back}>{cap(category) || 'Wissen'}</Back>
      <span className="ml-auto mb-4 text-[13px] text-brass">{dirty ? 'Ungespeicherte Änderungen' : ''}</span>
      <button onClick={openPreview} className={`${btn2} mb-4 flex items-center gap-1.5`}><Smartphone size={15} />In der App ansehen</button>
      {id && <button onClick={() => { if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return; markUnsaved(guard, false); openBenniDraft(`Fass den Wissensartikel „${title}“ (id ${id}) neu: `) }} className={`${btn2} mb-4 hidden lg:flex items-center gap-1.5`}><Sparkles size={15} />Mit Marc neu fassen</button>}
      <button disabled={busy || (!dirty && !!id)} onClick={save} title="Speichern (⌘S)" className={`${btn} mb-4 min-w-[120px] disabled:opacity-50`}>{busy ? 'Speichert …' : id ? (dirty ? 'Speichern' : 'Gespeichert') : 'Artikel anlegen'}</button>
    </div>
    <div className="grid xl:grid-cols-[minmax(0,720px)_240px] gap-x-10 gap-y-6 items-start">
      <article className="min-w-0 pb-10">
        <Editable autoFocus={!id} value={title} onChange={v => { setTitle(v); setDirty(true) }} onNext={() => introRef.current?.focus()} placeholder="Titel" className="text-[30px] font-medium tracking-tight leading-tight" />
        <Editable elRef={introRef} value={intro} onChange={v => { setIntro(v); setDirty(true) }} onNext={() => { const ed = editorRef.current; if (!ed) return; ed.view.dom.focus(); ed.commands.setTextSelection(1) }} placeholder="Kurzfassung in einem Satz (optional)" className="mt-2 text-[16px] text-mute leading-snug" />
        <div className="mt-5"><ArticleBody key={doc.ver} editorOut={editorRef} initial={doc.blocks} urls={doc.urls} upload={upload} onChange={b => { blocks.current = b; setDirty(true) }} /></div>
      </article>

      <aside className="order-first xl:order-none xl:sticky xl:top-[76px] space-y-5">
        {/* Status zuerst und in Worten: ein Entwurf ist in der App nicht zu sehen */}
        <div className={`rounded-[14px] px-4 py-3 ${published ? 'bg-done-50' : 'bg-sage-50'}`}>
          <div className="flex items-center justify-between gap-3"><span className="text-[13px] text-mute">Status</span><Seg value={published ? 'on' : 'off'} onChange={v => { setPublished(v === 'on'); setDirty(true) }} items={[['off', 'Entwurf'], ['on', 'Sichtbar']]} /></div>
          <p className="mt-2 text-[13px] leading-snug text-ink/80">{published ? `In der App sichtbar für ${LEVEL_TEXT[level]}.` : 'Entwurf: in der App noch nicht sichtbar. Zum Veröffentlichen „Sichtbar“ wählen und speichern.'}</p>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-1 gap-x-8">
          <DataRow label="Thema" value={<Select compact className="w-[136px]" value={cat} onChange={v => { setCat(v); setDirty(true) }} placeholder="Thema wählen" options={[...new Set([...cats, ...(cat ? [cat] : [])])].map(c => ({ value: c, label: cap(c) }))} />} />
          <DataRow label="Sichtbar für" value={<Select compact className="w-[136px]" value={LEVEL_RANK[level] < LEVEL_RANK[areaAccess] ? areaAccess : level} onChange={v => { setLevel(v); setDirty(true) }} options={Object.entries(LEVEL).filter(([value]) => LEVEL_RANK[value] >= LEVEL_RANK[areaAccess]).map(([value, label]) => ({ value, label }))} />} />
          {areaAccess !== 'alle' && <p className="-mt-1 mb-1 text-[12px] text-mute">Bereich „{areaOfCat?.name}“: nur für {LEVEL[areaAccess]}.</p>}
          {/* Prüfdatum (28.10., Matteo): wann der Artikel wieder angeschaut werden soll; in „Alle Artikel“ filterbar */}
          <DataRow label="Prüfen bis" value={<input type="date" value={review} onChange={e => { setReview(e.target.value); setDirty(true) }} className="h-9 w-[136px] rounded-[10px] bg-sage-50 px-2 text-[13px] outline-none" />} />
          <DataRow label="Verantwortlich" value={<Select compact className="w-[136px]" value={owner} onChange={v => { setOwner(v); setDirty(true) }} placeholder="Niemand" options={[{ value: '', label: 'Niemand' }, ...staff.filter(x => x.active && x.app_role !== 'mitarbeiterin' && !x.email.includes('+')).map(x => ({ value: x.id, label: `${x.first} ${x.last}` }))]} />} />
          <DataRow label="Quiz" value={quiz ? <span>{quiz.title}</span> : <span className="text-mute">Keins</span>} />
        </div>
        <p className="hidden xl:block text-[12.5px] text-mute leading-relaxed">Jede Überschrift beginnt in der App eine neue Folie. Fährst du über einen Aufzählungspunkt, kannst du ihm mit „+ Foto“ ein eigenes Bild geben. Wie es aussieht, zeigt „In der App ansehen“.</p>
        {id && <button onClick={del} className="text-[13px] text-mute hover:text-alert flex items-center gap-1.5"><Trash2 size={14} />Artikel löschen</button>}
      </aside>
    </div>
    {preview && <PhonePreview onClose={() => setPreview(false)} />}
  </div>)
}

// Handy-Rahmen mit der echten App-Ansicht: die App läuft im Rahmen mit Handybreite, damit Folien und Bildformate stimmen
function PhonePreview({ onClose }: { onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 backdrop-blur-[6px] p-6" onMouseDown={onClose}>
    <div onMouseDown={e => e.stopPropagation()} className="flex flex-col items-center gap-3">
      <div className="rounded-[44px] bg-[#1d221c] p-[10px] shadow-[0_30px_80px_-30px_rgba(0,0,0,.6)]">
        <iframe title="Vorschau in der App" src="/?vorschau=1" className="block w-[375px] h-[min(760px,calc(100dvh-140px))] rounded-[34px] bg-paper border-0" />
      </div>
      <div className="flex items-center gap-3"><p className="text-[13px] text-white">So sieht der Artikel in der App aus, mit allen ungespeicherten Änderungen.</p>
        <button onClick={onClose} className="h-9 px-3 rounded-[10px] bg-white text-[13.5px] flex items-center gap-1.5"><X size={15} />Schliessen</button></div>
    </div>
  </div>
}
