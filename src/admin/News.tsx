import { useEffect, useState } from 'react'
import { Bell, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useApp, inNewsAudience, GROUPS, type News } from '../store'
import { supabase } from '../lib/supabase'
import { notifyNow } from '../lib/push'
import { downloadCsv } from '../lib/csv'
import { BMark } from '../Logo'
import { Avatar } from '../People'
import { PollResults, usePollResults } from '../Poll'
import { toast } from '../Toast'
import { H, New, Th, Bar, Field, inpStone, btn, btn2, Err, retranslate, real, isTest, inBranch, Select, Modal, Chips } from './kit'

// News: Büro für alle Studios, Filialleitung für ihr Studio. Zielgruppe nach Studio, Gruppe, Skill oder Personen,
// Pflicht mit Lesebestätigung, zeitgesteuert, Entwurf und Bild von Benni, Umfrage anhängen, nachträglich bearbeiten.

export function useAudience() {
  const { staff } = useApp()
  return (n: Pick<News, 'audienceBranches' | 'audienceGroups' | 'audienceSkills' | 'audiencePeople'>) =>
    staff.filter(s => real(s) && (n.audiencePeople.length || n.audienceGroups.includes('Büro') ? true : s.branch_id !== 'buero') && inNewsAudience(s, n))
}

export function NewsAdmin() {
  const { news, newsReads, me, reload, quizzes, polls } = useApp()
  const audience = useAudience()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])]
  // Filialleitung sieht News für ihr Studio und ihre eigenen
  const list = news.filter(n => office || n.authorId === me.id || n.audienceBranches.length === 0 || n.audienceBranches.some(b => mine.includes(b)))
  const [sel, setSel] = useState<string | null>(null), [compose, setCompose] = useState<News | 'neu' | null>(null)
  const n = list.find(x => x.id === sel) ?? list[0]
  const reachOf = (x: News) => audience(x).filter(s => office || mine.some(b => inBranch(s, b)))
  const pctOf = (x: News) => { const p = reachOf(x); return p.length ? Math.round(p.filter(s => newsReads.some(r => r.news_id === x.id && r.employee_id === s.id && r.confirmed_at)).length / p.length * 100) : 0 }
  const people = n ? reachOf(n) : []
  const canEdit = (x: News) => office || x.authorId === me.id
  const poll = n ? polls.find(p => p.newsId === n.id) : undefined
  return (<>
    <H info={office ? 'News an alle oder an Studios, Gruppen, Skills und einzelne Personen. Pflicht-News brauchen eine Lesebestätigung, an jede News lässt sich eine Umfrage hängen.' : 'News für dein Studio. Pflicht-News brauchen eine Lesebestätigung, du siehst, wer bestätigt hat. An jede News lässt sich eine Umfrage hängen.'}
      action={<New onClick={() => setCompose('neu')}>Neue News</New>}>News</H>
    {list.length === 0 ? <p className="text-[14px] text-mute">Noch keine News. Oben rechts schreibst du eine, Benni hilft beim Entwurf.</p> : (
    <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-8">
      <table className="tbl w-full text-[14px] self-start"><thead><tr><Th>Titel</Th><Th>Zielgruppe</Th><Th>Datum</Th><Th>Gelesen</Th></tr></thead>
        <tbody className="divide-y divide-line">{list.map(x => { const p = x.mustRead ? pctOf(x) : null, planned = new Date(x.publishAt) > new Date()
          return <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer ${n?.id === x.id ? 'bg-sage-50' : 'hover:bg-sage-50/70'}`}>
            <td className="px-4 py-3">{x.title}{x.mustRead && <span className="ml-2 text-xs text-brass">Pflicht</span>}{polls.some(pl => pl.newsId === x.id) && <span className="ml-2 text-xs text-olive-700">Umfrage</span>}{planned && <span className="ml-2 text-xs text-mute">geplant</span>}<p className="text-xs text-mute">{x.author}</p></td>
            <td className="px-4 text-mute">{x.audience}</td><td className="px-4 text-mute">{x.date}</td>
            <td className="px-4 w-32">{p !== null ? <span className="flex items-center gap-2"><Bar p={p} /><span className="text-xs text-mute">{p}%</span></span> : <span className="text-xs text-mute">–</span>}</td></tr> })}</tbody></table>
      {n && <aside className="self-start rounded-[20px] border border-line p-5">
        <div className="flex items-start justify-between gap-3"><p className="font-medium text-[16px]">{n.title}</p>
          {canEdit(n) && <div className="flex gap-1 shrink-0">
            <button onClick={() => setCompose(n)} title="Bearbeiten" className="w-8 h-8 rounded-full text-mute hover:text-ink hover:bg-sage-50 flex items-center justify-center"><Pencil size={14} /></button>
            <button onClick={async () => { if (confirm(`„${n.title}“ löschen?${quizzes.some(q => q.newsId === n.id) ? ' Das Quiz dazu und alle Ergebnisse werden mit gelöscht.' : ''}${poll ? ' Die Umfrage und alle Antworten werden mit gelöscht.' : ''} Lesebestätigungen gehen verloren.`)) { const { error } = await supabase!.from('news').delete().eq('id', n.id); if (error) { toast('Löschen hat nicht geklappt', 'error'); return } setSel(null); await reload(); toast('News gelöscht') } }} title="Löschen" className="w-8 h-8 rounded-full text-mute hover:text-alert hover:bg-sage-50 flex items-center justify-center"><Trash2 size={14} /></button>
          </div>}</div>
        <p className="text-[12.5px] text-mute mt-1">{n.author} · {n.date}{n.mustRead ? ` · ${people.filter(s => newsReads.some(r => r.news_id === n.id && r.employee_id === s.id && r.confirmed_at)).length} von ${people.length} bestätigt` : ''}</p>
        {n.teaser && <p className="mt-3 text-[13.5px] text-ink/80">{n.teaser}</p>}
        {poll && <PollPanel key={poll.id} pollId={poll.id} anonymous={poll.anonymous} closed={!!poll.closesAt && new Date(poll.closesAt) < new Date()} title={n.title} reach={people.length} />}
        {n.mustRead ? <ul className="mt-4 max-h-[420px] overflow-y-auto no-scrollbar divide-y divide-line">{people.map(s => { const r = newsReads.find(x => x.news_id === n.id && x.employee_id === s.id)
          return <li key={s.id} className="py-2 flex items-center gap-2.5 text-[13px]"><Avatar s={s} photo={s.photo} size="w-6 h-6 text-[10px]" /><span className="flex-1 truncate">{s.first} {s.last} <span className="text-mute">· {s.branch}</span></span>{r?.confirmed_at ? <Check size={15} className="text-ok" /> : <span className="text-xs text-mute">{r ? 'geöffnet' : 'offen'}</span>}</li> })}</ul>
          : <p className="mt-4 text-[13px] text-mute">Ohne Lesebestätigung · erreicht {people.length} Personen</p>}
      </aside>}
    </div>)}
    {compose && <Compose edit={compose === 'neu' ? null : compose} onClose={() => setCompose(null)} />}
  </>)
}

/* Ergebnis einer Umfrage in der Seitenspalte: Teilnahme, Ergebnis je Frage (mit Namen, ausser anonym), erinnern, CSV */
function PollPanel({ pollId, anonymous, closed, title, reach }: { pollId: string; anonymous: boolean; closed: boolean; title: string; reach: number }) {
  const [r] = usePollResults(pollId)
  const [busy, setBusy] = useState(false)
  const remind = async () => {
    setBusy(true)
    const { data } = await supabase!.functions.invoke('notify', { body: { action: 'remind_poll', poll_id: pollId } })
    setBusy(false)
    toast(data?.ok ? (data.sent ? `Erinnerung an ${data.people} ${data.people === 1 ? 'Person' : 'Personen'} geschickt` : 'Erinnerung gesendet, aber niemand hat Mitteilungen eingeschaltet') : 'Das hat nicht geklappt', data?.ok ? 'ok' : 'error')
  }
  const csv = () => r && downloadCsv(`Umfrage ${title}`, r.questions.flatMap(q => q.answers.map(a => ({ Frage: q.prompt, Antwort: Array.isArray(a.value) ? a.value.map(i => q.options[i]).join(', ') : q.kind === 'single' ? q.options[Number(a.value)] : String(a.value), Name: a.name ?? (anonymous ? 'anonym' : '') }))))
  return <div className="mt-4 pt-4 border-t border-line">
    <div className="flex items-baseline justify-between"><p className="rubric text-olive-700">Umfrage{anonymous ? ' · anonym' : ''}{closed ? ' · beendet' : ''}</p>{r && <span className="text-[12.5px] text-mute">{r.respondents} von {reach} haben teilgenommen</span>}</div>
    {!r ? <p className="text-[13px] text-mute mt-2">Lädt …</p> : <div className="mt-3 max-h-[380px] overflow-y-auto no-scrollbar"><PollResults data={r} names={!anonymous} /></div>}
    <div className="mt-3 flex gap-2">
      {!closed && r && r.respondents < reach && <button disabled={busy} onClick={remind} className={`${btn2} flex-1 flex items-center justify-center gap-2 !h-9 text-[13px]`}><Bell size={14} />{busy ? 'Sendet …' : 'Offene erinnern'}</button>}
      {r && r.respondents > 0 && <button onClick={csv} className={`${btn2} !h-9 text-[13px]`}>Als CSV</button>}
    </div>
  </div>
}

type QDraft = { id?: string; kind: 'single' | 'multi' | 'scale' | 'text'; prompt: string; options: string[] }
type PollDraft = { id?: string; anonymous: boolean; show_results: boolean; closes: string; questions: QDraft[]; locked: boolean }
const KIND: [QDraft['kind'], string][] = [['single', 'Eine Antwort'], ['multi', 'Mehrere Antworten'], ['scale', 'Skala 1–5'], ['text', 'Freitext']]
const localInput = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''

function Compose({ edit, onClose }: { edit: News | null; onClose: () => void }) {
  const { branches, me, reload, skillCatalog, staff, polls } = useApp()
  const audience = useAudience()
  const office = me.app_role === 'buero'
  const mine = [me.branch_id, ...(me.extra ?? [])].filter(b => b !== 'buero')
  const studios = branches.filter(b => !b.is_office && (office || mine.includes(b.id)))
  const [f, setF] = useState({ title: '', teaser: '', body: '', tag: 'Studio', must: false, branches: office ? [] as string[] : [me.branch_id], groups: [] as string[], skills: [] as string[], people: [] as string[], when: '', wiki: '', image: '' })
  const [poll, setPoll] = useState<PollDraft | null>(null)
  const [brief, setBrief] = useState(''), [imgPrompt, setImgPrompt] = useState(''), [ai, setAi] = useState<'' | 'text' | 'image'>(''), [preview, setPreview] = useState<string | null>(null)
  const [pq, setPq] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(!edit)
  // Bearbeiten: Originaltext (Deutsch) aus der Datenbank, nicht die angezeigte Übersetzung
  useEffect(() => {
    if (!edit) return
    (async () => {
      const { data: n } = await supabase!.from('news').select('*').eq('id', edit.id).single()
      if (n) setF({ title: n.title, teaser: n.teaser ?? '', body: n.body ?? '', tag: n.must_read ? 'Studio' : n.tag ?? 'Studio', must: n.must_read, branches: n.audience_branches ?? [], groups: n.audience_groups ?? [], skills: n.audience_skills ?? [], people: n.audience_people ?? [],
        when: new Date(n.publish_at) > new Date() ? localInput(n.publish_at) : '', wiki: n.wiki_category ?? '', image: n.image_path ?? '' })
      if (n?.image_path) { const { data: u } = await supabase!.storage.from('media').createSignedUrl(n.image_path, 3600); setPreview(u?.signedUrl ?? null) }
      const p = polls.find(x => x.newsId === edit.id)
      if (p) {
        const [{ data: qs }, { count }] = await Promise.all([supabase!.from('poll_questions').select('id, kind, prompt, options').eq('poll_id', p.id).order('sort'), supabase!.from('poll_answers').select('question_id', { count: 'exact', head: true }).eq('poll_id', p.id)])
        setPoll({ id: p.id, anonymous: p.anonymous, show_results: p.showResults, closes: localInput(p.closesAt), questions: (qs ?? []) as QDraft[], locked: (count ?? 0) > 0 })
      }
      setLoaded(true)
    })()
  }, [edit?.id]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const pollError = () => {
    if (!poll) return ''
    if (!poll.questions.length) return 'Die Umfrage braucht mindestens eine Frage.'
    for (const q of poll.questions) {
      if (!q.prompt.trim()) return 'Jede Frage braucht einen Text.'
      if ((q.kind === 'single' || q.kind === 'multi') && q.options.filter(o => o.trim()).length < 2) return `„${q.prompt}“ braucht mindestens zwei Antworten.`
    }
    return ''
  }
  const savePoll = async (newsId: string) => {
    if (!poll) return null
    const row = { anonymous: poll.anonymous, show_results: poll.show_results, closes_at: poll.closes ? new Date(poll.closes).toISOString() : null }
    let id = poll.id
    if (id) { const { error } = await supabase!.from('polls').update(row).eq('id', id); if (error) return error }
    else { const { data, error } = await supabase!.from('polls').insert({ ...row, news_id: newsId, created_by: me.id }).select('id').single(); if (error) return error; id = data.id }
    if (poll.locked) return null
    await supabase!.from('poll_questions').delete().eq('poll_id', id!)
    const { error } = await supabase!.from('poll_questions').insert(poll.questions.map((q, i) => ({ poll_id: id, sort: i, kind: q.kind, prompt: q.prompt.trim(), options: q.kind === 'scale' ? q.options.slice(0, 2).map(o => o.trim()) : q.kind === 'text' ? [] : q.options.map(o => o.trim()).filter(Boolean) })))
    return error
  }
  const publish = async () => {
    if (!f.title.trim() || !f.body.trim()) { setErr('Titel und Text sind nötig.'); return }
    if (!office && !f.branches.length && !f.people.length) { setErr('Bitte dein Studio als Zielgruppe wählen.'); return }
    const pe = pollError(); if (pe) { setErr(pe); return }
    setBusy(true); setErr('')
    // Filialleitung: Personen-News laufen über das eigene Studio als Rahmen
    const br = !office && f.people.length && !f.branches.length ? [me.branch_id] : f.branches
    const row = {
      title: f.title.trim(), teaser: f.teaser.trim() || f.body.trim().slice(0, 140), body: f.body.trim(), tag: f.must ? 'Pflicht' : f.tag, must_read: f.must,
      audience_branches: br, audience_groups: f.groups, audience_skills: f.skills, audience_people: f.people, image_path: f.image || null, wiki_category: f.wiki || null,
    }
    let id = edit?.id ?? null, error: { message: string } | null = null
    if (edit) {
      const upd: Record<string, unknown> = { ...row }
      if (f.when) upd.publish_at = new Date(f.when).toISOString()
      ;({ error } = await supabase!.from('news').update(upd).eq('id', edit.id))
    } else {
      const r = await supabase!.from('news').insert({ ...row, author_id: me.id, author_name: `${me.first} ${me.last}`, publish_at: f.when ? new Date(f.when).toISOString() : new Date().toISOString() }).select('id').single()
      error = r.error; id = r.data?.id ?? null
    }
    if (!error && id && poll) error = await savePoll(id)
    if (!error && edit && !poll) { const old = polls.find(p => p.newsId === edit.id); if (old) ({ error } = await supabase!.from('polls').delete().eq('id', old.id)) }
    setBusy(false)
    if (error) { setErr(edit ? 'Speichern hat nicht geklappt.' : 'Veröffentlichen hat nicht geklappt.'); return }
    toast(edit ? 'News gespeichert' : f.when ? 'News eingeplant' : 'News veröffentlicht'); await reload(); if (!edit) notifyNow(); retranslate(); onClose()
  }
  const pool = staff.filter(s => s.active && !f.people.includes(s.id) && (office || mine.some(b => inBranch(s, b))) && `${s.first} ${s.last}`.toLowerCase().includes(pq.toLowerCase()))
  const setQ = (i: number, q: Partial<QDraft>) => poll && setPoll({ ...poll, questions: poll.questions.map((x, j) => j === i ? { ...x, ...q } : x) })
  const toggle = (on: boolean, label: string, onClick: () => void, disabled = false) => <button type="button" disabled={disabled} onClick={onClick} className={`h-9 px-3 rounded-[9px] flex items-center gap-2 text-[13px] transition disabled:opacity-50 ${on ? 'bg-olive-700 text-white' : 'bg-white text-ink/80'}`}>{on && <Check size={13} strokeWidth={2.6} />}{label}</button>
  return (
    <Modal width={980} title={edit ? 'News bearbeiten' : 'Neue News'} onClose={onClose} footer={<><span className="mr-auto text-[13px] text-olive-700">Erreicht {reach} {reach === 1 ? 'Person' : 'Personen'}{edit ? ' · beim Speichern geht keine neue Mitteilung raus' : ''}</span><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy || !loaded} onClick={publish} className={btn}>{edit ? 'Speichern' : f.when ? 'Einplanen' : 'Veröffentlichen'}</button></>}>
      {!loaded ? <p className="text-[14px] text-mute py-6">Lädt …</p> : <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6">
        <div className="space-y-3">
          {!edit && <div className="flex gap-2 items-center rounded-[12px] bg-sage-50 p-2"><BMark className="w-7 h-7" working={!!ai} />
            <input value={brief} onChange={e => setBrief(e.target.value)} onKeyDown={e => e.key === 'Enter' && draft()} placeholder="Worum geht es? Benni schreibt einen Entwurf" className="flex-1 h-9 bg-transparent px-1 text-[14px] outline-none" />
            <button disabled={!brief.trim() || !!ai} onClick={draft} className="h-9 px-3 rounded-[8px] bg-olive-700 text-white text-[13px] disabled:opacity-40">{ai === 'text' ? 'Schreibt …' : 'Entwurf schreiben'}</button></div>}
          <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Titel" className="w-full text-[20px] font-medium outline-none" />
          <input value={f.teaser} onChange={e => setF({ ...f, teaser: e.target.value })} placeholder="Kurzfassung für die Karte (optional)" className="w-full text-[15px] outline-none text-ink/70" />
          <textarea value={f.body} onChange={e => setF({ ...f, body: e.target.value })} rows={8} placeholder="Text. Absätze mit einer Leerzeile trennen." className="w-full resize-none outline-none text-[15px] rounded-[12px] bg-sage-50 p-3" />
          {preview ? <div className="relative"><img src={preview} alt="" className="w-full aspect-[3/2] object-cover rounded-[12px]" /><button onClick={() => { setF({ ...f, image: '' }); setPreview(null) }} className="absolute top-2 right-2 h-8 px-3 rounded-[8px] bg-white/90 text-[13px]">Bild entfernen</button></div>
            : <div className="flex gap-2"><input value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} placeholder="Bild beschreiben (optional)" className={inpStone} />
              <button disabled={!(imgPrompt || f.title).trim() || !!ai} onClick={image} className={`${btn2} shrink-0 disabled:opacity-40`}>{ai === 'image' ? 'Bild entsteht …' : 'Bild erzeugen'}</button></div>}

          {/* Umfrage */}
          {!poll ? <button onClick={() => setPoll({ anonymous: false, show_results: true, closes: '', questions: [{ kind: 'single', prompt: '', options: ['', ''] }], locked: false })} className="w-full h-11 rounded-[12px] border border-dashed border-sage-400 text-[14px] text-olive-700 flex items-center justify-center gap-2 hover:bg-sage-50"><Plus size={15} />Umfrage anhängen</button>
            : <div className="rounded-[14px] bg-sage-50 p-4">
              <div className="flex items-center justify-between"><p className="font-medium text-[15px]">Umfrage</p>{!poll.locked && <button onClick={() => setPoll(null)} className="text-[13px] text-mute hover:text-alert">Entfernen</button>}</div>
              {poll.locked && <p className="text-[12.5px] text-mute mt-1">Es gibt schon Antworten. Die Fragen bleiben deshalb fest, Einstellungen lassen sich ändern.</p>}
              <div className="mt-3 space-y-3">{poll.questions.map((q, i) => <div key={i} className="rounded-[12px] bg-white p-3">
                <div className="flex gap-2"><input disabled={poll.locked} value={q.prompt} onChange={e => setQ(i, { prompt: e.target.value })} placeholder={`Frage ${i + 1}`} className="flex-1 h-9 rounded-[8px] bg-sage-50 px-3 text-[14px] outline-none disabled:opacity-70" />
                  <Select compact tone="stone" disabled={poll.locked} className="w-44" value={q.kind} onChange={v => setQ(i, { kind: v as QDraft['kind'], options: v === 'scale' ? ['', ''] : v === 'text' ? [] : q.options.length >= 2 ? q.options : ['', ''] })} options={KIND.map(([v, l]) => ({ value: v, label: l }))} />
                  {!poll.locked && poll.questions.length > 1 && <button onClick={() => setPoll({ ...poll, questions: poll.questions.filter((_, j) => j !== i) })} aria-label="Frage entfernen" className="w-9 h-9 rounded-[8px] text-mute hover:text-alert flex items-center justify-center"><X size={15} /></button>}</div>
                {(q.kind === 'single' || q.kind === 'multi') && <div className="mt-2 space-y-1.5">{q.options.map((o, k) => <div key={k} className="flex gap-2 items-center">
                  <span className={`w-4 h-4 shrink-0 shadow-[inset_0_0_0_1.5px_#979E92] ${q.kind === 'single' ? 'rounded-full' : 'rounded-[5px]'}`} />
                  <input disabled={poll.locked} value={o} onChange={e => setQ(i, { options: q.options.map((x, j) => j === k ? e.target.value : x) })} placeholder={`Antwort ${k + 1}`} className="flex-1 h-8 rounded-[8px] bg-sage-50 px-3 text-[13.5px] outline-none disabled:opacity-70" />
                  {!poll.locked && q.options.length > 2 && <button onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== k) })} aria-label="Antwort entfernen" className="text-mute hover:text-alert"><X size={14} /></button>}</div>)}
                  {!poll.locked && q.options.length < 10 && <button onClick={() => setQ(i, { options: [...q.options, ''] })} className="text-[13px] text-olive-700 ml-6">Antwort hinzufügen</button>}</div>}
                {q.kind === 'scale' && <div className="mt-2 grid grid-cols-2 gap-2"><input disabled={poll.locked} value={q.options[0] ?? ''} onChange={e => setQ(i, { options: [e.target.value, q.options[1] ?? ''] })} placeholder="1 bedeutet (z. B. gar nicht)" className="h-8 rounded-[8px] bg-sage-50 px-3 text-[13.5px] outline-none" /><input disabled={poll.locked} value={q.options[1] ?? ''} onChange={e => setQ(i, { options: [q.options[0] ?? '', e.target.value] })} placeholder="5 bedeutet (z. B. sehr)" className="h-8 rounded-[8px] bg-sage-50 px-3 text-[13.5px] outline-none" /></div>}
                {q.kind === 'text' && <p className="mt-2 text-[12.5px] text-mute">Freie Antwort, optional für die Teilnehmenden.</p>}
              </div>)}</div>
              {!poll.locked && poll.questions.length < 10 && <button onClick={() => setPoll({ ...poll, questions: [...poll.questions, { kind: 'single', prompt: '', options: ['', ''] }] })} className="mt-2 text-[13px] text-olive-700 flex items-center gap-1"><Plus size={14} />Frage hinzufügen</button>}
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                {toggle(poll.anonymous, 'Anonym', () => setPoll({ ...poll, anonymous: !poll.anonymous }), poll.locked)}
                {toggle(poll.show_results, 'Ergebnis für Teilnehmende sichtbar', () => setPoll({ ...poll, show_results: !poll.show_results }))}
                <label className="flex items-center gap-2 text-[13px] text-mute ml-auto">Endet<input type="datetime-local" value={poll.closes} onChange={e => setPoll({ ...poll, closes: e.target.value })} className="h-9 rounded-[9px] bg-white px-2 text-[13px] text-ink outline-none" /></label>
              </div>
            </div>}
        </div>
        <div className="space-y-4 text-[14px]">
          {f.people.length === 0 ? <>
            <div><span className="block text-xs text-mute mb-1.5">Studios{office ? ' (nichts gewählt = alle)' : ''}</span><Chips tone="stone" items={studios.map(b => ({ value: b.id, label: b.name }))} value={f.branches} onChange={v => setF({ ...f, branches: v })} /></div>
            <div><span className="block text-xs text-mute mb-1.5">Gruppen</span><Chips tone="stone" items={GROUPS.filter(g => office || g !== 'Büro').map(g => ({ value: g, label: g }))} value={f.groups} onChange={v => setF({ ...f, groups: v })} /></div>
            {skillCatalog.length > 0 && <div><span className="block text-xs text-mute mb-1.5">Skills</span><Chips tone="stone" items={skillCatalog.map(k => ({ value: k, label: k }))} value={f.skills} onChange={v => setF({ ...f, skills: v })} /></div>}
          </> : <div><span className="block text-xs text-mute mb-1.5">Personen</span><div className="flex flex-wrap gap-1.5">{f.people.map(id => { const p = staff.find(x => x.id === id); return <button key={id} onClick={() => setF({ ...f, people: f.people.filter(x => x !== id) })} className="px-2.5 h-8 rounded-[8px] text-[13px] bg-olive-700 text-white flex items-center gap-1">{p ? `${p.first} ${p.last}${isTest(p) ? ' (Testkonto)' : ''}` : id}<X size={12} /></button> })}</div></div>}
          <div className="relative"><input value={pq} onChange={e => setPq(e.target.value)} placeholder="Oder einzelne Personen …" className={inpStone} />
            {pq.trim().length > 1 && <div className="absolute z-10 left-0 right-0 mt-1 rounded-[12px] bg-white border border-line shadow-[0_16px_40px_-16px_rgba(29,34,28,.35)] p-1 max-h-48 overflow-y-auto">{pool.slice(0, 8).map(s => <button key={s.id} onClick={() => { setF({ ...f, people: [...f.people, s.id] }); setPq('') }} className="w-full text-left px-3 py-2 rounded-[8px] text-[13px] hover:bg-sage-50">{s.first} {s.last}{isTest(s) ? ' (Testkonto)' : ''} <span className="text-mute">· {s.branch}</span></button>)}{pool.length === 0 && <p className="px-3 py-2 text-[13px] text-mute">Niemand gefunden.</p>}</div>}</div>
          <Select label="Kategorie" tone="stone" value={f.tag} onChange={v => setF({ ...f, tag: v })} options={['Studio', 'Marketing', 'Team', 'Hygiene'].map(x => ({ value: x, label: x }))} />
          <button type="button" onClick={() => setF({ ...f, must: !f.must })} className={`w-full h-11 rounded-[10px] px-3 flex items-center gap-2.5 text-left transition ${f.must ? 'bg-brass/15 text-ink' : 'bg-sage-50 text-ink/80'}`}>
            <span className={`w-5 h-5 rounded-[6px] flex items-center justify-center ${f.must ? 'bg-brass text-white' : 'shadow-[inset_0_0_0_1.5px_#979E92]'}`}>{f.must && <Check size={12} strokeWidth={3} />}</span>Pflicht mit Lesebestätigung</button>
          <Field label={edit ? 'Veröffentlichung verschieben (leer = bleibt)' : 'Veröffentlichen (leer = sofort)'}><input type="datetime-local" value={f.when} onChange={e => setF({ ...f, when: e.target.value })} className={inpStone} /></Field>
          <Field label="Auch ins Wissen (Kategorie, optional)"><input value={f.wiki} onChange={e => setF({ ...f, wiki: e.target.value })} placeholder="z. B. Hygiene" className={inpStone} /></Field>
          <Err m={err} />
        </div>
      </div>}
    </Modal>
  )
}
