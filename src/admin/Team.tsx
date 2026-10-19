import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Mail, Phone, Search, Smartphone, Bell, X } from 'lucide-react'
import { useApp, addDays, fmtDate, inNewsAudience, type Staff } from '../store'
import { supabase } from '../lib/supabase'
import { phorest, type StaffWeek } from '../lib/phorest'
import { Avatar, ContactRow } from '../People'
import { toast } from '../Toast'
import { H, New, Sec, Th, Bar, Field, inpStone, btn, btn2, Err, isTest, inBranch, Select, Modal, Dot, InfoTip } from './kit'

// Team: Liste mit Filtern über die ganze Breite; ein Klick öffnet die Seite der Person (mit Blättern).
// Filialleitung: eigenes Studio (Personen anlegen, Skills, Funktion, deaktivieren). Büro: alle Studios, Rechte, löschen.

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase!.functions.invoke('admin-employee', { body })
  if (!error) return data
  try { return (await (error as { context?: Response }).context?.json()) ?? { ok: false, error: 'failed' } } catch { return { ok: false, error: 'failed' } }
}
const ROLE: Record<string, string> = { mitarbeiterin: 'Mitarbeiterin', filialleitung: 'Filialleitung', buero: 'Büro' }

export function TeamAdmin() {
  const { staff, branches, me } = useApp()
  const office = me.app_role === 'buero'
  const myB = [me.branch_id, ...(me.extra ?? [])].filter(x => x !== 'buero')
  const studios = branches.filter(x => office || myB.includes(x.id))
  const visible = staff.filter(s => office || myB.some(x => inBranch(s, x)))
  const [q, setQ] = useState(''), [fn, setFn] = useState(''), [br, setBr] = useState(''), [sk, setSk] = useState(''), [st, setSt] = useState('aktiv')
  const [sel, setSel] = useState<string | null>(null), [create, setCreate] = useState(false), [catalog, setCatalog] = useState(false)
  const roles = [...new Set(visible.map(s => s.role).filter(Boolean))].sort()
  const skills = [...new Set(visible.flatMap(s => s.skills))].sort()
  const list = useMemo(() => visible.filter(s =>
    (st === 'alle' || (st === 'aktiv' ? s.active : !s.active)) && (!fn || s.role === fn) && (!br || inBranch(s, br))
    && (!sk || (sk === '-' ? s.skills.length === 0 : s.skills.includes(sk)))
    && `${s.first} ${s.last} ${s.role} ${s.email} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase())
  ).sort((a, b) => a.first.localeCompare(b.first)), [visible, q, fn, br, sk, st])
  const idx = list.findIndex(s => s.id === sel)
  const person = visible.find(s => s.id === sel)

  if (person) return <PersonPage p={person} pos={idx >= 0 ? { i: idx, n: list.length } : null}
    onBack={() => setSel(null)} onStep={d => { const n = list[idx + d]; if (n) setSel(n.id) }} />

  return (<>
    <H info="Eine Person anklicken: Kontakt, Skills, Funktion und Lernstand. Neue Personen bekommen keine Einladung, sie melden sich mit ihrer Firmen-Mail und einem Code an."
      action={<div className="flex gap-2">{office && <button onClick={() => setCatalog(true)} className={btn2}>Skills verwalten</button>}<New onClick={() => setCreate(true)}>Person anlegen</New></div>}>
      {office ? 'Team' : `Team · ${studios.map(x => x.name).join(', ')}`}
    </H>
    <div className="flex flex-wrap gap-2 mb-2">
      <div className="h-10 flex-1 min-w-[240px] rounded-[10px] bg-sage-50 px-3 flex items-center gap-2"><Search size={16} className="text-mute" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, E-Mail oder Skill" className="flex-1 outline-none text-[14px] bg-transparent" />{q && <button onClick={() => setQ('')} className="text-mute"><X size={14} /></button>}</div>
      <Select tone="stone" className="w-48" value={fn} onChange={setFn} options={[{ value: '', label: 'Alle Funktionen' }, ...roles.map(r => ({ value: r, label: r }))]} />
      {studios.filter(x => !x.is_office).length > 1 && <Select tone="stone" className="w-40" value={br} onChange={setBr} options={[{ value: '', label: 'Alle Studios' }, ...studios.map(x => ({ value: x.id, label: x.name }))]} />}
      <Select tone="stone" className="w-44" value={sk} onChange={setSk} options={[{ value: '', label: 'Alle Skills' }, { value: '-', label: 'Ohne Skills' }, ...skills.map(k => ({ value: k, label: k }))]} />
      <Select tone="stone" className="w-36" value={st} onChange={setSt} options={[{ value: 'aktiv', label: 'Aktiv' }, { value: 'inaktiv', label: 'Deaktiviert' }, { value: 'alle', label: 'Alle' }]} />
    </div>
    <p className="text-[12.5px] text-mute mb-2 px-1">{list.length} {list.length === 1 ? 'Person' : 'Personen'}</p>
    <table className="tbl w-full text-[14px]"><thead><tr><Th>Name</Th><Th>Funktion</Th><Th>Studio</Th><Th>Skills</Th><Th>App</Th><Th /></tr></thead>
      <tbody className="divide-y divide-line">
        {list.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-mute">Niemand passt zu den Filtern.</td></tr>}
        {list.map(s => <tr key={s.id} onClick={() => setSel(s.id)} className={`cursor-pointer hover:bg-sage-50/70 ${s.active ? '' : 'opacity-50'}`}>
          <td className="px-4 py-2.5"><span className="flex items-center gap-3"><Avatar s={s} photo={s.photo} size="w-8 h-8 text-[12px]" /><span>{s.first} {s.last}</span>{isTest(s) && <span className="text-xs text-mute">Testkonto</span>}</span></td>
          <td className="px-4 text-mute">{s.role}{s.app_role !== 'mitarbeiterin' && <span className="ml-2 text-xs text-olive-700">{ROLE[s.app_role]}</span>}</td>
          <td className="px-4 text-mute">{s.branch}</td>
          <td className="px-4">{s.skills.length ? <span className="flex flex-wrap gap-1">{s.skills.slice(0, 3).map(k => <span key={k} className="px-2 h-6 rounded-[6px] bg-sage-50 text-[12px] flex items-center">{k}</span>)}{s.skills.length > 3 && <span className="text-[12px] text-mute self-center">+{s.skills.length - 3}</span>}</span> : <span className="text-[13px] text-brass">noch keine</span>}</td>
          <td className="px-4"><span className="flex gap-2 text-mute" title={`${s.appInstalled ? 'App installiert' : 'App nicht installiert'} · ${s.pushEnabled ? 'Mitteilungen an' : 'Mitteilungen aus'}`}><Smartphone size={15} className={s.appInstalled ? 'text-olive-700' : 'text-sage-200'} /><Bell size={15} className={s.pushEnabled ? 'text-olive-700' : 'text-sage-200'} /></span></td>
          <td className="px-3 text-right"><ChevronRight size={16} className="text-sage-400 inline" /></td>
        </tr>)}
      </tbody></table>
    {create && <CreatePerson studios={studios.filter(x => office || !x.is_office)} office={office} onClose={() => setCreate(false)} onDone={id => { setCreate(false); setSel(id) }} />}
    {catalog && <SkillCatalog onClose={() => setCatalog(false)} />}
  </>)
}

function CreatePerson({ studios, office, onClose, onDone }: { studios: { id: string; name: string; is_office: boolean }[]; office: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const { reload } = useApp()
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', job_title: 'Kosmetikerin', app_role: 'mitarbeiterin', branch_id: studios.find(x => !x.is_office)?.id ?? '' })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true); setErr('')
    const r = await call({ action: 'create', ...f, app_role: office ? f.app_role : 'mitarbeiterin' })
    setBusy(false)
    if (!r?.ok) { setErr(r?.error === 'exists' ? 'Diese E-Mail gibt es schon.' : r?.error === 'missing_fields' ? 'Vorname, Nachname, eine gültige E-Mail und Studio sind nötig.' : r?.error === 'auth_failed' ? 'Das Login-Konto liess sich nicht anlegen. Bitte noch einmal versuchen.' : r?.error === 'forbidden' ? 'Für dieses Studio darfst du niemanden anlegen.' : 'Anlegen hat nicht geklappt.'); return }
    toast('Person angelegt'); await reload(); onDone(r.employee_id)
  }
  return (
    <Modal title="Person anlegen" onClose={onClose} footer={<><button onClick={onClose} className={btn2}>Abbrechen</button><button disabled={busy} onClick={create} className={btn}>{busy ? 'Legt an …' : 'Anlegen'}</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vorname"><input autoFocus value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} className={inpStone} /></Field>
        <Field label="Nachname"><input value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} className={inpStone} /></Field>
        <div className="col-span-2"><Field label="Firmen-Mail"><input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="vorname@beautylounge.ch" className={inpStone} /></Field></div>
        <Field label="Funktion"><input value={f.job_title} onChange={e => setF({ ...f, job_title: e.target.value })} className={inpStone} /></Field>
        <Select label="Studio" tone="stone" value={f.branch_id} onChange={v => setF({ ...f, branch_id: v })} options={studios.map(x => ({ value: x.id, label: x.name }))} />
        {office && <div className="col-span-2"><Select label="Rechte" tone="stone" value={f.app_role} onChange={v => setF({ ...f, app_role: v })} options={[
          { value: 'mitarbeiterin', label: 'Mitarbeiterin', hint: 'App für den Studio-Alltag' }, { value: 'filialleitung', label: 'Filialleitung', hint: 'Dazu Backoffice fürs eigene Studio' }, { value: 'buero', label: 'Büro', hint: 'Alle Studios und Inhalte' }]} /></div>}
      </div>
      <p className="mt-4 text-[12.5px] text-mute">Es geht keine Einladung raus. Sie meldet sich mit ihrer Firmen-Mail an und bekommt einen Code per E-Mail.</p>
      <div className="mt-2"><Err m={err} /></div>
    </Modal>
  )
}

function SkillCatalog({ onClose }: { onClose: () => void }) {
  const { skillCatalog, staff, reload } = useApp()
  const [skill, setSkill] = useState('')
  const add = async () => { if (!skill.trim()) return; const { error } = await supabase!.from('skills').insert({ name: skill.trim(), sort: skillCatalog.length }); setSkill(''); toast(error ? 'Gibt es schon' : 'Skill angelegt', error ? 'error' : 'ok'); await reload() }
  const del = async (k: string) => { const n = staff.filter(x => x.skills.includes(k)).length; if (!confirm(`Skill „${k}“ löschen?${n ? ` ${n} Personen verlieren ihn aus dem Profil.` : ''}`)) return; const { error } = await supabase!.rpc('delete_skill', { p_name: k }); toast(error ? 'Löschen hat nicht geklappt' : 'Skill gelöscht', error ? 'error' : 'ok'); await reload() }
  return (
    <Modal title="Skills verwalten" onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">{skillCatalog.map(k => <span key={k} className="pl-2.5 pr-1.5 h-8 rounded-[8px] bg-sage-50 text-[13px] flex items-center gap-1.5">{k}<button onClick={() => del(k)} aria-label={`${k} löschen`} className="w-5 h-5 rounded-full text-mute hover:text-alert flex items-center justify-center"><X size={12} /></button></span>)}</div>
      <div className="mt-4 flex gap-2"><input value={skill} onChange={e => setSkill(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Neuer Skill" className={inpStone} /><button onClick={add} className={btn}>Hinzufügen</button></div>
    </Modal>
  )
}

/* ---------- Seite einer Person ---------- */
function PersonPage({ p, pos, onBack, onStep }: { p: Staff; pos: { i: number; n: number } | null; onBack: () => void; onStep: (d: number) => void }) {
  const { skillCatalog, reload, me, branches, standby, quizzes, attempts, steps, news, newsReads } = useApp()
  const office = me.app_role === 'buero', self = p.id === me.id
  const studios = branches.filter(b => office || [me.branch_id, ...(me.extra ?? [])].includes(b.id))
  const [skills, setSkills] = useState(p.skills)
  const [d, setD] = useState({ job_title: p.role, app_role: p.app_role, branch_id: p.branch_id })
  const [ob, setOb] = useState<Set<string> | null>(null), [week, setWeek] = useState<StaffWeek | null>(null)
  useEffect(() => { setSkills(p.skills); setD({ job_title: p.role, app_role: p.app_role, branch_id: p.branch_id }) }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setOb(null); setWeek(null)
    supabase!.from('onboarding_progress').select('step_id').eq('employee_id', p.id).then(({ data }) => setOb(new Set((data ?? []).map(x => x.step_id))))
    phorest<StaffWeek>({ action: 'staff_week', employee_id: p.id }).then(setWeek)
  }, [p.id])
  // Blättern mit den Pfeiltasten
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest('input,textarea')) return; if (e.key === 'ArrowLeft') onStep(-1); if (e.key === 'ArrowRight') onStep(1) }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onStep])
  const dirty = d.job_title !== p.role || d.app_role !== p.app_role || d.branch_id !== p.branch_id
  const tog = async (k: string) => {
    const next = skills.includes(k) ? skills.filter(x => x !== k) : [...skills, k]
    setSkills(next)
    const { error } = await supabase!.from('employees').update({ skills: next, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) { setSkills(skills); toast('Speichern hat nicht geklappt', 'error') } else { toast('Skills gespeichert'); reload() }
  }
  const save = async () => {
    const patch = office ? d : { job_title: d.job_title }
    const { error } = await supabase!.from('employees').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', p.id)
    toast(error ? 'Speichern hat nicht geklappt' : 'Gespeichert', error ? 'error' : 'ok'); if (!error) reload()
  }
  const must = news.filter(n => n.mustRead && new Date(n.publishAt) <= new Date() && inNewsAudience(p, n))
  const mustOk = must.filter(n => newsReads.some(r => r.news_id === n.id && r.employee_id === p.id && r.confirmed_at)).length
  const passed = new Set(attempts.filter(a => a.employeeId === p.id && a.passed).map(a => a.quizId))
  const tried = new Set(attempts.filter(a => a.employeeId === p.id).map(a => a.quizId))
  const sbDays = standby.filter(x => x.employee_id === p.id && x.day >= addDays(0) && x.day <= addDays(60)).map(x => x.day).sort()
  const day = (x: string) => fmtDate(x + 'T12:00:00Z', { weekday: 'short', day: 'numeric', month: 'numeric' })
  const card = 'rounded-[16px] border border-line'
  return (<>
    <div className="flex items-center justify-between mb-6">
      <button onClick={onBack} className="h-9 pl-2 pr-3 -ml-2 rounded-[10px] hover:bg-sage-50 flex items-center gap-1.5 text-[14px] text-ink/80"><ArrowLeft size={16} />Team</button>
      {pos && <div className="flex items-center gap-1 text-[13px] text-mute">
        <button onClick={() => onStep(-1)} disabled={pos.i === 0} aria-label="Vorherige Person" className="w-9 h-9 rounded-full hover:bg-sage-50 flex items-center justify-center disabled:opacity-30"><ChevronLeft size={18} /></button>
        <span className="tabular-nums w-16 text-center">{pos.i + 1} von {pos.n}</span>
        <button onClick={() => onStep(1)} disabled={pos.i === pos.n - 1} aria-label="Nächste Person" className="w-9 h-9 rounded-full hover:bg-sage-50 flex items-center justify-center disabled:opacity-30"><ChevronRight size={18} /></button>
      </div>}
    </div>
    <div className="flex items-center gap-5">
      <Avatar s={p} photo={p.photo} size="w-20 h-20 text-[24px]" />
      <div className="min-w-0">
        <h1 className="text-[30px] leading-tight">{p.first} {p.last}</h1>
        <p className="text-[14px] text-mute mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{p.role} · {p.branch}</span>
          {p.app_role !== 'mitarbeiterin' && <span className="text-olive-700">{ROLE[p.app_role]}</span>}
          {p.active ? <Dot tone="ok">Aktiv</Dot> : <Dot tone="mute">Deaktiviert</Dot>}
          {isTest(p) && <span>Testkonto</span>}
        </p>
      </div>
    </div>

    <div className="grid grid-cols-[1.1fr_1fr] gap-8 mt-8">
      <div className="space-y-8 min-w-0">
        <section><Sec>Kontakt</Sec>
          <div className={`${card} divide-y divide-line`}>
            {p.phone ? <ContactRow label="Telefon" value={p.phone} href={`tel:${p.phone.replace(/\s/g, '')}`} icon={<Phone size={15} />} action="Anrufen" /> : <p className="px-4 py-3 text-[14px] text-mute">Keine Telefonnummer hinterlegt</p>}
            <ContactRow label="E-Mail" value={p.email} href={`mailto:${p.email}`} icon={<Mail size={15} />} action="E-Mail schreiben" />
          </div></section>
        <section><Sec>Skills</Sec>
          <div className="flex flex-wrap gap-1.5">{skillCatalog.map(k => <button key={k} onClick={() => tog(k)} className={`px-3 h-9 rounded-[10px] text-[13.5px] transition ${skills.includes(k) ? 'bg-olive-700 text-white' : 'bg-sage-50 text-ink/80 hover:bg-sage-100'}`}>{k}</button>)}</div>
          <p className="mt-2 text-[12.5px] text-mute">Antippen zum Vergeben oder Entfernen. Wird sofort gespeichert.</p></section>
        <section><Sec>Funktion{office ? ' und Rechte' : ''}</Sec>
          <div className="grid grid-cols-2 gap-3">
            {office ? <Field label="Funktion"><input value={d.job_title} onChange={e => setD({ ...d, job_title: e.target.value })} className={inpStone} /></Field>
              : <input value={d.job_title} onChange={e => setD({ ...d, job_title: e.target.value })} aria-label="Funktion" className={inpStone} />}
            {office && <Select label="Studio" tone="stone" value={d.branch_id} onChange={v => setD({ ...d, branch_id: v })} options={studios.map(x => ({ value: x.id, label: x.name }))} />}
            {office && <Select label="Rechte" tone="stone" disabled={self} value={d.app_role} onChange={v => setD({ ...d, app_role: v as Staff['app_role'] })} options={[{ value: 'mitarbeiterin', label: 'Mitarbeiterin' }, { value: 'filialleitung', label: 'Filialleitung' }, { value: 'buero', label: 'Büro' }]} />}
          </div>
          {dirty && <div className="mt-3 flex gap-2"><button onClick={save} className={btn}>Speichern</button><button onClick={() => setD({ job_title: p.role, app_role: p.app_role, branch_id: p.branch_id })} className={btn2}>Verwerfen</button></div>}
        </section>
      </div>

      <div className="space-y-8 min-w-0">
        <section><Sec>Diese Woche · aus Phorest</Sec>
          <div className={`${card} divide-y divide-line`}>
            {!week ? <p className="px-4 py-3 text-[14px] text-mute">Lädt …</p> : !week.ok || !week.mapped ? <p className="px-4 py-3 text-[14px] text-mute">Keine Schichten in Phorest gefunden.</p>
              : Array.from({ length: 7 }, (_, i) => addDays(i)).map(x => { const sh = week.days.filter(s => s.date === x)
                return <div key={x} className="px-4 py-2.5 flex justify-between text-[14px]"><span className="text-ink/80">{day(x)}</span>{sh.length ? <span className="tabular-nums">{sh.map(s => `${s.start}–${s.end}`).join(', ')}</span> : <span className="text-mute">frei</span>}</div> })}
          </div></section>
        <section><Sec>Lernstand</Sec>
          <div className={`${card} p-4 space-y-4 text-[14px]`}>
            <div><div className="flex justify-between mb-1.5"><span>Onboarding</span><span className="text-mute tabular-nums">{ob ? `${steps.filter(s => ob.has(s.id)).length} von ${steps.length}` : '…'}</span></div><Bar p={ob && steps.length ? steps.filter(s => ob.has(s.id)).length / steps.length * 100 : 0} /></div>
            <div><div className="flex justify-between mb-1.5"><span>Pflicht-News bestätigt</span><span className="text-mute tabular-nums">{mustOk} von {must.length}</span></div><Bar p={must.length ? mustOk / must.length * 100 : 0} /></div>
            <div className="flex justify-between"><span>Quiz bestanden</span><span className="text-mute tabular-nums">{passed.size} von {quizzes.length}{tried.size > passed.size ? ` · ${tried.size - passed.size} nicht bestanden` : ''}</span></div>
          </div></section>
        <section><Sec>App und Aushilfe</Sec>
          <div className={`${card} divide-y divide-line text-[14px]`}>
            <div className="px-4 py-2.5 flex justify-between"><span>App auf dem Handy</span>{p.appInstalled ? <Dot tone="ok">installiert</Dot> : <Dot tone="mute">noch nicht</Dot>}</div>
            <div className="px-4 py-2.5 flex justify-between"><span>Mitteilungen</span>{p.pushEnabled ? <Dot tone="ok">an</Dot> : <Dot tone="mute">aus</Dot>}</div>
            <div className="px-4 py-2.5 flex justify-between gap-4"><span>Kann aushelfen</span><span className="text-mute text-right">{sbDays.length ? sbDays.slice(0, 4).map(day).join(' · ') + (sbDays.length > 4 ? ` +${sbDays.length - 4}` : '') : 'keine Tage eingetragen'}</span></div>
          </div></section>
      </div>
    </div>

    {!self && (office || p.app_role !== 'buero') && <div className="mt-10 pt-5 border-t border-line flex items-center gap-3 text-[14px]">
      <button onClick={async () => { if (!confirm(p.active ? `${p.first} ${p.last} deaktivieren? Sie kann sich dann nicht mehr anmelden. Ihr Verlauf bleibt.` : `${p.first} ${p.last} wieder aktivieren?`)) return; const r = await call({ action: 'set_active', employee_id: p.id, active: !p.active }); toast(r?.ok ? (p.active ? 'Deaktiviert' : 'Aktiviert') : 'Das hat nicht geklappt', r?.ok ? 'ok' : 'error'); await reload() }} className={btn2}>{p.active ? 'Deaktivieren' : 'Wieder aktivieren'}</button>
      {office && <button onClick={async () => { if (!confirm(`${p.first} ${p.last} endgültig löschen? Profil, Lesebestätigungen, Quiz-Ergebnisse und Login werden entfernt. Meldungen und Nachweise behalten ihren Namen. Das lässt sich nicht rückgängig machen.`)) return; const r = await call({ action: 'delete', employee_id: p.id }); toast(r?.ok ? 'Gelöscht' : 'Löschen hat nicht geklappt', r?.ok ? 'ok' : 'error'); if (r?.ok) { onBack(); await reload() } }} className="h-10 px-4 rounded-[10px] text-alert/80 hover:text-alert hover:bg-alert/5 transition">Endgültig löschen</button>}
      <span className="ml-auto"><InfoTip side="left" text="Deaktivierte Personen können sich nicht mehr anmelden, ihr Verlauf bleibt. Löschen kann nur das Büro." /></span>
    </div>}
  </>)
}
