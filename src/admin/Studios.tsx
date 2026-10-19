import { useEffect, useState } from 'react'
import { ArrowUp, ArrowDown, X } from 'lucide-react'
import { useApp, fmtDate, fmtTime } from '../store'
import { supabase } from '../lib/supabase'
import { New, Panel, Th, Field, inp, btn, btn2, Err, real } from './kit'

// Studios, Beispielinhalte und E-Mail-Versand (nur Büro) — seit 20.10. unter Einstellungen.

/* ---------- Studios (nur Büro; RLS branches_write) ---------- */
type StudioRow = { id: string; name: string; is_office: boolean; sort: number; phorest_branch_id: string | null; facility_email: string | null }
const slug = (n: string) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export function StudiosAdmin() {
  const { staff, reload } = useApp()
  const [rows, setRows] = useState<StudioRow[] | null>(null), [err, setErr] = useState(''), [form, setForm] = useState(false)
  const [f, setF] = useState({ name: '', phorest_branch_id: '' }), [edit, setEdit] = useState<StudioRow | null>(null)
  const load = async () => { const { data } = await supabase!.from('branches').select('id, name, is_office, sort, phorest_branch_id, facility_email').order('sort'); setRows((data ?? []) as StudioRow[]) }
  useEffect(() => { load() }, [])
  const count = (id: string) => staff.filter(s => real(s) && s.branch_id === id).length
  const done = async (error: { message: string } | null, msg: string) => { if (error) { setErr(msg); return false } setErr(''); await load(); await reload(); return true }
  const add = async () => {
    const name = f.name.trim(), id = slug(name)
    if (!name || !id) { setErr('Bitte einen Namen eingeben.'); return }
    if (rows?.some(r => r.id === id || r.name.toLowerCase() === name.toLowerCase())) { setErr('Dieses Studio gibt es schon.'); return }
    const sort = Math.max(0, ...(rows ?? []).filter(r => !r.is_office).map(r => r.sort)) + 1
    const { error } = await supabase!.from('branches').insert({ id, name, sort, phorest_branch_id: f.phorest_branch_id.trim() || null })
    // Büro bleibt unten
    if (!error) for (const o of (rows ?? []).filter(r => r.is_office && r.sort <= sort)) await supabase!.from('branches').update({ sort: sort + 1 }).eq('id', o.id)
    if (await done(error, 'Anlegen hat nicht geklappt.')) { setF({ name: '', phorest_branch_id: '' }); setForm(false) }
  }
  const save = async () => {
    if (!edit || !edit.name.trim()) return
    const { error } = await supabase!.from('branches').update({ name: edit.name.trim(), phorest_branch_id: edit.phorest_branch_id?.trim() || null, facility_email: edit.facility_email?.trim() || null }).eq('id', edit.id)
    if (await done(error, 'Speichern hat nicht geklappt. Gibt es den Namen schon?')) setEdit(null)
  }
  const move = async (i: number, d: -1 | 1) => {
    if (!rows) return
    const a = rows[i], b = rows[i + d]; if (!a || !b) return
    await supabase!.from('branches').update({ sort: b.sort }).eq('id', a.id)
    const { error } = await supabase!.from('branches').update({ sort: a.sort }).eq('id', b.id)
    await done(error, 'Reihenfolge konnte nicht gespeichert werden.')
  }
  const remove = async (r: StudioRow) => {
    if (count(r.id) > 0 || staff.some(s => s.branch_id === r.id)) { setErr(`${r.name} hat noch Personen. Bitte zuerst umziehen oder deaktivieren.`); return }
    if (!confirm(`${r.name} löschen?`)) return
    const { error } = await supabase!.from('branches').delete().eq('id', r.id)
    await done(error, `${r.name} wird noch verwendet (Aufgaben, Meldungen oder Phorest) und kann nicht gelöscht werden.`)
  }
  return (<>
    <div className="flex justify-end mb-4"><New onClick={() => setForm(!form)}>Studio anlegen</New></div>
    {form && <Panel className="p-6 mb-8"><div className="grid grid-cols-2 gap-3">
      <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="z. B. Liestal" className={inp} /></Field>
      <Field label="Phorest-Filial-ID (optional)"><input value={f.phorest_branch_id} onChange={e => setF({ ...f, phorest_branch_id: e.target.value })} className={inp} /></Field>
    </div><div className="mt-4 flex items-center gap-3"><button onClick={add} className={btn}>Anlegen</button></div></Panel>}
    <Err m={err} />
    <div className="mt-2"><table className="tbl w-full text-[14px]"><thead><tr><Th>Studio</Th><Th>Personen</Th><Th>Phorest</Th><Th>Facility-Mail</Th><Th> </Th></tr></thead>
      <tbody className="divide-y divide-line">{(rows ?? []).map((r, i) => edit?.id === r.id
        ? <tr key={r.id}><td className="px-4 py-2"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} className={`${inp} !bg-sage-50`} /></td><td className="px-4 text-mute">{count(r.id)}</td>
            <td className="px-4"><input value={edit.phorest_branch_id ?? ''} onChange={e => setEdit({ ...edit, phorest_branch_id: e.target.value })} className={`${inp} !bg-sage-50`} /></td>
            <td className="px-4"><input value={edit.facility_email ?? ''} onChange={e => setEdit({ ...edit, facility_email: e.target.value })} placeholder="zentrale Adresse" className={`${inp} !bg-sage-50`} /></td>
            <td className="px-4 whitespace-nowrap"><button onClick={save} className="h-8 px-3 rounded-[8px] bg-olive-700 text-white text-[13px]">Speichern</button><button onClick={() => setEdit(null)} className="ml-3 text-[13px] text-mute hover:text-ink">Abbrechen</button></td></tr>
        : <tr key={r.id}><td className="px-4 py-2.5">{r.name}{r.is_office && <span className="ml-2 text-xs text-mute">Büro</span>}</td><td className="px-4 text-mute">{count(r.id)}</td>
            <td className="px-4 text-mute text-[13px]">{r.is_office ? '–' : <span className="inline-flex items-center gap-1.5"><span className={`w-[7px] h-[7px] rounded-full ${r.phorest_branch_id ? 'bg-ok' : 'bg-sage-400'}`} />{r.phorest_branch_id ? 'verbunden' : 'nicht verbunden'}</span>}</td>
            <td className="px-4 text-mute text-[13px]">{r.facility_email || 'zentrale Adresse'}</td>
            <td className="px-4 whitespace-nowrap text-right"><button aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-mute disabled:opacity-30"><ArrowUp size={15} /></button><button aria-label="nach unten" disabled={i === (rows?.length ?? 0) - 1} onClick={() => move(i, 1)} className="p-1 text-mute disabled:opacity-30"><ArrowDown size={15} /></button>
              <button onClick={() => setEdit(r)} className="ml-3 text-[13px] text-mute hover:text-ink">Bearbeiten</button>{!r.is_office && <button onClick={() => remove(r)} className="ml-3 text-[13px] text-mute hover:text-ink">Löschen</button>}</td></tr>)}</tbody></table></div>
  </>)
}

/* ---------- Beispielinhalte ein/aus (gilt für alle) ---------- */
export function DemoSwitch() {
  const { demoData, setDemoData } = useApp()
  const [busy, setBusy] = useState(false)
  return (
    <div className="pb-6 border-b border-line flex items-start justify-between gap-4">
      <div><p className="rubric text-ink/70">Beispielinhalte</p>
        <p className="text-[14px] mt-3">Beispiel-News, -Schulungen, -Aufgaben und -Artikel {demoData ? 'werden angezeigt' : 'sind ausgeblendet'}</p>
        <p className="text-xs text-mute mt-1">Gilt für alle. Vor dem Pilot ausschalten. Gelöscht wird nichts.</p></div>
      <button disabled={busy} role="switch" aria-checked={demoData} onClick={async () => { if (!confirm(demoData ? 'Beispielinhalte für alle ausblenden?' : 'Beispielinhalte für alle wieder einblenden?')) return; setBusy(true); await setDemoData(!demoData); setBusy(false) }}
        className={`relative shrink-0 w-11 h-6 rounded-full transition disabled:opacity-50 ${demoData ? 'bg-olive-700' : 'bg-sage-200'}`}><span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${demoData ? 'left-[23px]' : 'left-[3px]'}`} /></button>
    </div>
  )
}

/* ---------- E-Mail-Versand (Facility, Einladungen, Erinnerungen) ---------- */
type MailLog = { at: string; kind: string; recipient: string; subject: string; status: string; error: string | null }
export function MailSettings() {
  const [st, setSt] = useState<{ keySet: boolean; enabled: boolean; from: string; log: MailLog[] } | null>(null)
  const [central, setCentral] = useState(''), [days, setDays] = useState(2), [msg, setMsg] = useState(''), [preview, setPreview] = useState<string | null>(null)
  const load = async () => {
    const { data } = await supabase!.functions.invoke('mailer', { body: { action: 'status' } })
    setSt(data?.ok ? data : { keySet: false, enabled: false, from: '', log: [] })
    const { data: rows } = await supabase!.from('app_settings').select('key, value')
    for (const r of rows ?? []) { if (r.key === 'facility_email') setCentral(String(r.value ?? '')); if (r.key === 'event_reminder_days') setDays(Number(r.value) || 2) }
  }
  useEffect(() => { load() }, [])
  const put = (key: string, value: unknown) => supabase!.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() })
  const toggle = async () => {
    if (!st) return
    if (!st.enabled && !confirm('E-Mail-Versand einschalten? Ab dann gehen echte Mails an Facility und Mitarbeiterinnen (Einladungen, Erinnerungen).')) return
    await put('mail_enabled', !st.enabled); await load()
  }
  const save = async () => {
    const [a, b] = await Promise.all([put('facility_email', central.trim()), put('event_reminder_days', Math.max(1, Math.min(14, days)))])
    setMsg(a.error || b.error ? 'Speichern hat nicht geklappt.' : 'Gespeichert.'); setTimeout(() => setMsg(''), 2500)
  }
  const showPreview = async () => { const { data } = await supabase!.functions.invoke('mailer', { body: { action: 'preview' } }); setPreview(data?.html ?? null) }
  if (!st) return null
  return (
    <div className="pt-6">
      <div className="flex items-start justify-between gap-4">
        <div><p className="rubric text-ink/70">E-Mail-Versand</p>
          <p className="text-[14px] mt-3 inline-flex items-center gap-2"><span className={`w-[7px] h-[7px] rounded-full ${st.keySet && st.enabled ? 'bg-ok' : 'bg-sage-400'}`} />{!st.keySet ? 'Kein Resend-Schlüssel, es geht nichts raus' : st.enabled ? `Eingeschaltet · Absender ${st.from}` : 'Ausgeschaltet, es geht nichts raus'}</p></div>
        <button disabled={!st.keySet} onClick={toggle} className={`${st.enabled ? btn2 : btn} shrink-0 disabled:opacity-40`}>{st.enabled ? 'Ausschalten' : 'Einschalten'}</button>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_180px_auto] gap-3 items-end">
        <Field label="Zentrale Facility-Adresse (für Studios ohne eigene)"><input value={central} onChange={e => setCentral(e.target.value)} placeholder="facility@beautylounge.ch" className={`${inp} !bg-sage-50`} /></Field>
        <Field label="Erinnerung vor Schulung (Tage)"><input type="number" min={1} max={14} value={days} onChange={e => setDays(Number(e.target.value))} className={`${inp} !bg-sage-50`} /></Field>
        <div className="flex items-center gap-3"><button onClick={save} className={btn}>Speichern</button><button onClick={showPreview} className="text-[13px] text-olive-700">Vorschau</button></div>
      </div>
      {msg && <p className="mt-2 text-[13px] text-sage-800">{msg}</p>}
      {preview && <div className="mt-4 rounded-[16px] border border-line overflow-hidden"><div className="flex justify-between px-3 py-2 text-xs text-mute bg-sage-50"><span>Vorschau einer Facility-Meldung (wird nicht versendet)</span><button onClick={() => setPreview(null)}><X size={13} /></button></div><iframe title="Vorschau" srcDoc={preview} className="w-full h-[420px] bg-white" /></div>}
      {st.log.length > 0 && <table className="tbl mt-6 w-full text-[13px]"><thead><tr><Th>Zeit</Th><Th>Art</Th><Th>An</Th><Th>Betreff</Th><Th>Status</Th></tr></thead>
        <tbody className="divide-y divide-line">{st.log.map((l, i) => <tr key={i}><td className="px-4 py-2 text-mute">{fmtDate(l.at, { day: '2-digit', month: '2-digit' })} {fmtTime(l.at)}</td><td className="px-4">{l.kind}</td><td className="px-4 text-mute">{l.recipient}</td><td className="px-4">{l.subject}</td><td className={`px-4 ${l.status === 'fehler' ? 'text-alert' : 'text-mute'}`} title={l.error ?? ''}>{l.status}</td></tr>)}</tbody></table>}
    </div>
  )
}

