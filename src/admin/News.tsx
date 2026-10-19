import { useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { useApp, inNewsAudience, GROUPS, type News } from '../store'
import { supabase } from '../lib/supabase'
import { notifyNow } from '../lib/push'
import { BMark } from '../Logo'
import { Avatar } from '../People'
import { toast } from '../Toast'
import { H, New, Th, Bar, Field, inpStone, btn, btn2, Err, retranslate, real, inBranch, Select, Modal, Chips } from './kit'

// News: Büro für alle Studios, Filialleitung für ihr Studio. Zielgruppe nach Studio, Gruppe, Skill oder Personen,
// Pflicht mit Lesebestätigung, zeitgesteuert, Entwurf und Bild von Benni.

export function useAudience() {
  const { staff } = useApp()
  return (n: Pick<News, 'audienceBranches' | 'audienceGroups' | 'audienceSkills' | 'audiencePeople'>) =>
    staff.filter(s => real(s) && (n.audiencePeople.length || n.audienceGroups.includes('Büro') ? true : s.branch_id !== 'buero') && inNewsAudience(s, n))
}

export function NewsAdmin() {
  const { news, newsReads, me, reload, quizzes } = useApp()
  const audience = useAudience()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])]
  // Filialleitung sieht News für ihr Studio und ihre eigenen
  const list = news.filter(n => office || n.authorId === me.id || n.audienceBranches.length === 0 || n.audienceBranches.some(b => mine.includes(b)))
  const [sel, setSel] = useState<string | null>(null), [compose, setCompose] = useState(false)
  const n = list.find(x => x.id === sel) ?? list[0]
  const reachOf = (x: News) => audience(x).filter(s => office || mine.some(b => inBranch(s, b)))
  const pctOf = (x: News) => { const p = reachOf(x); return p.length ? Math.round(p.filter(s => newsReads.some(r => r.news_id === x.id && r.employee_id === s.id && r.confirmed_at)).length / p.length * 100) : 0 }
  const people = n ? reachOf(n) : []
  const canDelete = (x: News) => office || x.authorId === me.id
  return (<>
    <H info={office ? 'News an alle oder an Studios, Gruppen, Skills und einzelne Personen. Pflicht-News brauchen eine Lesebestätigung.' : 'News für dein Studio. Pflicht-News brauchen eine Lesebestätigung, du siehst, wer bestätigt hat.'}
      action={<New onClick={() => setCompose(true)}>Neue News</New>}>News</H>
    {list.length === 0 ? <p className="text-[14px] text-mute">Noch keine News. Oben rechts schreibst du eine, Benni hilft beim Entwurf.</p> : (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-8">
      <table className="tbl w-full text-[14px] self-start"><thead><tr><Th>Titel</Th><Th>Zielgruppe</Th><Th>Datum</Th><Th>Gelesen</Th></tr></thead>
        <tbody className="divide-y divide-line">{list.map(x => { const p = x.mustRead ? pctOf(x) : null, planned = new Date(x.publishAt) > new Date()
          return <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${n?.id === x.id ? 'bg-sage-50' : 'hover:bg-sage-50/70'}`}>
            <td className="px-4 py-3">{x.title}{x.mustRead && <span className="ml-2 text-xs text-brass">Pflicht</span>}{planned && <span className="ml-2 text-xs text-mute">geplant</span>}<p className="text-xs text-mute">{x.author}</p></td>
            <td className="px-4 text-mute">{x.audience}</td><td className="px-4 text-mute">{x.date}</td>
            <td className="px-4 w-32">{p !== null ? <span className="flex items-center gap-2"><Bar p={p} /><span className="text-xs text-mute">{p}%</span></span> : <span className="text-xs text-mute">–</span>}</td></tr> })}</tbody></table>
      {n && <aside className="self-start rounded-[20px] border border-line p-5">
        <p className="font-medium text-[16px]">{n.title}</p>
        <p className="text-[12.5px] text-mute mt-1">{n.author} · {n.date}{n.mustRead ? ` · ${people.filter(s => newsReads.some(r => r.news_id === n.id && r.employee_id === s.id && r.confirmed_at)).length} von ${people.length} bestätigt` : ''}</p>
        {n.teaser && <p className="mt-3 text-[13.5px] text-ink/80">{n.teaser}</p>}
        {n.mustRead ? <ul className="mt-4 max-h-[420px] overflow-y-auto no-scrollbar divide-y divide-line">{people.map(s => { const r = newsReads.find(x => x.news_id === n.id && x.employee_id === s.id)
          return <li key={s.id} className="py-2 flex items-center gap-2.5 text-[13px]"><Avatar s={s} photo={s.photo} size="w-6 h-6 text-[10px]" /><span className="flex-1 truncate">{s.first} {s.last} <span className="text-mute">· {s.branch}</span></span>{r?.confirmed_at ? <Check size={15} className="text-ok" /> : <span className="text-xs text-mute">{r ? 'geöffnet' : 'offen'}</span>}</li> })}</ul>
          : <p className="mt-4 text-[13px] text-mute">Ohne Lesebestätigung · erreicht {people.length} Personen</p>}
        {canDelete(n) && <button onClick={async () => { if (confirm(`„${n.title}“ löschen?${quizzes.some(q => q.newsId === n.id) ? ' Das Quiz dazu und alle Ergebnisse werden mit gelöscht.' : ''} Lesebestätigungen gehen verloren.`)) { const { error } = await supabase!.from('news').delete().eq('id', n.id); if (error) { toast('Löschen hat nicht geklappt', 'error'); return } setSel(null); await reload(); toast('News gelöscht') } }} className="mt-4 text-[13px] text-mute hover:text-alert flex items-center gap-1"><Trash2 size={13} />Löschen</button>}
      </aside>}
    </div>)}
    {compose && <Compose onClose={() => setCompose(false)} />}
  </>)
}

function Compose({ onClose }: { onClose: () => void }) {
  const { branches, me, reload, skillCatalog, staff } = useApp()
  const audience = useAudience()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])].filter(b => b !== 'buero')
  const studios = branches.filter(b => !b.is_office && (office || mine.includes(b.id)))
  const [f, setF] = useState({ title: '', teaser: '', body: '', tag: 'Studio', must: false, branches: office ? [] as string[] : [me.branch_id], groups: [] as string[], skills: [] as string[], people: [] as string[], when: '', wiki: '', image: '' })
  const [brief, setBrief] = useState(''), [imgPrompt, setImgPrompt] = useState(''), [ai, setAi] = useState<'' | 'text' | 'image'>(''), [preview, setPreview] = useState<string | null>(null)
  const [pq, setPq] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const reach = audience({ audienceBranches: f.branches, audienceGroups: f.groups, audienceSkills: f.skills, audiencePeople: f.people }).length
  const draft = async () => {
    if (!brief.trim() || ai) return
    setAi('text'); setErr('')
    const { data, error } = await supabase!.functions.invoke('newsdraft', { body: { action: 'text', brief } })
    setAi('')
    if (error || !data?.ok) { setErr('Benni konnte gerade keinen Entwurf schreiben.'); return }
    setF(v => ({ ...v, title: data.title, teaser: data.teaser, body: data.body })); setImgPrompt(data.image_prompt || data.title)
  }
  const image = async () => {
    const prompt = imgPrompt || f.title
    if (!prompt.trim() || ai) return
    setAi('image'); setErr('')
    const { data, error } = await supabase!.functions.invoke('newsdraft', { body: { action: 'image', prompt } })
    setAi('')
    if (error || !data?.ok) { setErr('Das Bild konnte gerade nicht erzeugt werden.'); return }
    setF(v => ({ ...v, image: data.path }))
    const { data: u } = await supabase!.storage.from('media').createSignedUrl(data.path, 3600); setPreview(u?.signedUrl ?? null)
  }
  const publish = async () => {
    if (!f.title.trim() || !f.body.trim()) { setErr('Titel und Text sind nötig.'); return }
    if (!office && !f.branches.length && !f.people.length) { setErr('Bitte dein Studio als Zielgruppe wählen.'); return }
    setBusy(true); setErr('')
    // Filialleitung: Personen-News laufen über das eigene Studio als Rahmen
    const br = !office && f.people.length && !f.branches.length ? [me.branch_id] : f.branches
    const { error } = await supabase!.from('news').insert({
      title: f.title.trim(), teaser: f.teaser.trim() || f.body.trim().slice(0, 140), body: f.body.trim(), tag: f.must ? 'Pflicht' : f.tag, must_read: f.must,
      audience_branches: br, audience_groups: f.groups, audience_skills: f.skills, audience_people: f.people, image_path: f.image || null, author_id: me.id, author_name: `${me.first} ${me.last}`,
      publish_at: f.when ? new Date(f.when).toISOString() : new Date().toISOString(), wiki_category: f.wiki || null,
    })
    setBusy(false)
    if (error) { setErr('Veröffentlichen hat nicht geklappt.'); return }
    toast(f.when ? 'News eingeplant' : 'News veröffentlicht'); await reload(); notifyNow(); retranslate(); onClose()
  }
  const pool = staff.filter(s => s.active && !f.people.includes(s.id) && (office || mine.some(b => inBranch(s, b))) && `${s.first} ${s.last}`.toLowerCase().includes(pq.toLowerCase()))
  return (
    <Modal width={960} title="Neue News" onClose={onClose} footer={<><span className="mr-auto text-[13px] text-olive-700">Erreicht {reach} {reach === 1 ? 'Person' : 'Personen'}</span><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={publish} className={btn}>{f.when ? 'Einplanen' : 'Veröffentlichen'}</button></>}>
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6">
        <div className="space-y-3">
          <div className="flex gap-2 items-center rounded-[12px] bg-sage-50 p-2"><BMark className="w-7 h-7" working={!!ai} />
            <input value={brief} onChange={e => setBrief(e.target.value)} onKeyDown={e => e.key === 'Enter' && draft()} placeholder="Worum geht es? Benni schreibt einen Entwurf" className="flex-1 h-9 bg-transparent px-1 text-[14px] outline-none" />
            <button disabled={!brief.trim() || !!ai} onClick={draft} className="h-9 px-3 rounded-[8px] bg-olive-700 text-white text-[13px] disabled:opacity-40">{ai === 'text' ? 'Schreibt …' : 'Entwurf schreiben'}</button></div>
          <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Titel" className="w-full text-[20px] font-medium outline-none" />
          <input value={f.teaser} onChange={e => setF({ ...f, teaser: e.target.value })} placeholder="Kurzfassung für die Karte (optional)" className="w-full text-[15px] outline-none text-ink/70" />
          <textarea value={f.body} onChange={e => setF({ ...f, body: e.target.value })} rows={9} placeholder="Text. Absätze mit einer Leerzeile trennen." className="w-full resize-none outline-none text-[15px] rounded-[12px] bg-sage-50 p-3" />
          {preview ? <div className="relative"><img src={preview} alt="" className="w-full aspect-[3/2] object-cover rounded-[12px]" /><button onClick={() => { setF({ ...f, image: '' }); setPreview(null) }} className="absolute top-2 right-2 h-8 px-3 rounded-[8px] bg-white/90 text-[13px]">Bild entfernen</button></div>
            : <div className="flex gap-2"><input value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} placeholder="Bild beschreiben (optional)" className={inpStone} />
              <button disabled={!(imgPrompt || f.title).trim() || !!ai} onClick={image} className={`${btn2} shrink-0 disabled:opacity-40`}>{ai === 'image' ? 'Bild entsteht …' : 'Bild erzeugen'}</button></div>}
        </div>
        <div className="space-y-4 text-[14px]">
          {f.people.length === 0 ? <>
            <div><span className="block text-xs text-mute mb-1.5">Studios{office ? ' (nichts gewählt = alle)' : ''}</span><Chips tone="stone" items={studios.map(b => ({ value: b.id, label: b.name }))} value={f.branches} onChange={v => setF({ ...f, branches: v })} /></div>
            <div><span className="block text-xs text-mute mb-1.5">Gruppen</span><Chips tone="stone" items={GROUPS.filter(g => office || g !== 'Büro').map(g => ({ value: g, label: g }))} value={f.groups} onChange={v => setF({ ...f, groups: v })} /></div>
            {skillCatalog.length > 0 && <div><span className="block text-xs text-mute mb-1.5">Skills</span><Chips tone="stone" items={skillCatalog.map(k => ({ value: k, label: k }))} value={f.skills} onChange={v => setF({ ...f, skills: v })} /></div>}
          </> : <div><span className="block text-xs text-mute mb-1.5">Personen</span><div className="flex flex-wrap gap-1.5">{f.people.map(id => { const p = staff.find(x => x.id === id); return <button key={id} onClick={() => setF({ ...f, people: f.people.filter(x => x !== id) })} className="px-2.5 h-8 rounded-[8px] text-[13px] bg-olive-700 text-white flex items-center gap-1">{p ? `${p.first} ${p.last}` : id}<X size={12} /></button> })}</div></div>}
          <div className="relative"><input value={pq} onChange={e => setPq(e.target.value)} placeholder="Oder einzelne Personen …" className={inpStone} />
            {pq.trim().length > 1 && <div className="absolute z-10 left-0 right-0 mt-1 rounded-[12px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-1 max-h-48 overflow-y-auto">{pool.slice(0, 8).map(s => <button key={s.id} onClick={() => { setF({ ...f, people: [...f.people, s.id] }); setPq('') }} className="w-full text-left px-3 py-2 rounded-[8px] text-[13px] hover:bg-sage-50">{s.first} {s.last} <span className="text-mute">· {s.branch}</span></button>)}{pool.length === 0 && <p className="px-3 py-2 text-[13px] text-mute">Niemand gefunden.</p>}</div>}</div>
          <Select label="Kategorie" tone="stone" value={f.tag} onChange={v => setF({ ...f, tag: v })} options={['Studio', 'Marketing', 'Team', 'Hygiene'].map(x => ({ value: x, label: x }))} />
          <button type="button" onClick={() => setF({ ...f, must: !f.must })} className={`w-full h-11 rounded-[10px] px-3 flex items-center gap-2.5 text-left transition ${f.must ? 'bg-brass/15 text-ink' : 'bg-sage-50 text-ink/80'}`}>
            <span className={`w-5 h-5 rounded-[6px] flex items-center justify-center ${f.must ? 'bg-brass text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92]'}`}>{f.must && <Check size={12} strokeWidth={3} />}</span>Pflicht mit Lesebestätigung</button>
          <Field label="Veröffentlichen (leer = sofort)"><input type="datetime-local" value={f.when} onChange={e => setF({ ...f, when: e.target.value })} className={inpStone} /></Field>
          <Field label="Auch ins Wissen (Kategorie, optional)"><input value={f.wiki} onChange={e => setF({ ...f, wiki: e.target.value })} placeholder="z. B. Hygiene" className={inpStone} /></Field>
          <Err m={err} />
        </div>
      </div>
    </Modal>
  )
}
