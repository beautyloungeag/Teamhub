// KI-Reiter im TeamHub (BLTH-25): beantwortet interne Fragen aus dem freigegebenen
// Wissen, kennt den eigenen Tag aus Phorest (nur im Rahmen der Rolle) und schlägt bei
// nicht lösbaren Anliegen eine Meldung vor. Schreibt selbst nichts — die Meldung schickt
// die Mitarbeiterin mit einem Tipp ab.
// Secrets: OPENAI_API_KEY (optional; ohne ihn antwortet der Reiter nur aus dem Wissen),
//          ASSISTANT_MODEL (optional).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

type Article = { id: string; category: string; title: string; body: string }
type Answer = { text: string; sources: { id: string; title: string }[]; ticket?: { kind: 'Meldung' | 'Idee'; title: string } }

const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9äöü]+/).filter((w) => w.length > 2)
const STOP = new Set(['wie', 'was', 'wer', 'die', 'der', 'das', 'und', 'ist', 'ich', 'mit', 'fur', 'fuer', 'bei', 'wird', 'eine', 'einen', 'lange', 'kann', 'habe', 'noch', 'soll', 'darf', 'muss'])
function rank(q: string, arts: Article[]) {
  const qw = words(q).filter((w) => w.length >= 4 && !STOP.has(w))
  return arts.map((a) => {
    const t = words(a.title), b = words(a.body)
    const score = qw.reduce((s, w) => s + (t.some((x) => x.startsWith(w.slice(0, 5))) ? 3 : 0) + b.filter((x) => x.startsWith(w.slice(0, 5))).length, 0)
    return { a, score }
  }).filter((x) => x.score >= 2).sort((x, y) => y.score - x.score)
}
const isBroken = (q: string) => /kaputt|defekt|funktioniert nicht|geht nicht|ausgefallen|fällt aus|tropft|leck/i.test(q)
const isShift = (q: string) => /dienst|schicht|arbeitet|arbeite ich|wer ist|im studio|termine|mein tag|heute bei mir|steht heute|was steht|habe ich heute/i.test(q)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const authz = req.headers.get('Authorization') ?? ''
  const db = createClient(url, anon, { global: { headers: { Authorization: authz } } })
  const { data: me } = await db.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const { message = '', history = [] } = await req.json().catch(() => ({}))
  const q = String(message).slice(0, 2000)
  if (!q.trim()) return json({ ok: false, error: 'empty' }, 400)

  // Nur freigegebene Artikel, die diese Person per RLS sehen darf.
  const { data: arts } = await db.from('wiki_articles').select('id, category, title, body').eq('published', true)
  const ranked = rank(q, (arts ?? []) as Article[])

  // Eigener Tag aus Phorest, nur wenn danach gefragt wird (spart Zeit und Daten).
  let day: any = null
  if (isShift(q)) {
    const call = (b: unknown) => fetch(`${url}/functions/v1/phorest`, { method: 'POST', headers: { Authorization: authz, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => null)
    const [mine, team] = await Promise.all([call({ action: 'my_day' }), me.app_role !== 'mitarbeiterin' && me.branch_id !== 'buero' ? call({ action: 'team_today', branch: me.branch_id }) : Promise.resolve(null)])
    day = { mine: mine?.ok ? mine : null, team: team?.ok ? team.team : null }
  }

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ ok: true, mode: 'wissen', ...fallback(q, ranked.map((r) => r.a), day, me) })

  const context = ranked.slice(0, 4).map((r) => `### ${r.a.title} (${r.a.category}, id ${r.a.id})\n${r.a.body.slice(0, 3000)}`).join('\n\n')
  const sys = [
    `Du bist der interne Assistent im TeamHub der Beautylounge. Du sprichst mit ${me.first_name} (${me.job_title}, Studio ${me.branch_id}). Antworte kurz, freundlich, in der Sprache der Frage (Deutsch, Englisch oder Französisch).`,
    'Beantworte Fachfragen NUR aus den unten stehenden Wissensartikeln. Steht die Antwort nicht darin, sag das ehrlich und erfinde nichts.',
    'Kannst du ein Anliegen nicht lösen (etwas ist kaputt, Personal- oder Betriebsanliegen), schlag eine Meldung vor. Verbesserungsvorschläge sind eine Idee.',
    'Kundendaten, Preise oder Termine anderer Personen nennst du nur, wenn sie unten im Tagesplan stehen.',
    'Gib ausschliesslich JSON zurück: {"text": string, "source_ids": string[], "ticket": null | {"kind": "Meldung"|"Idee", "title": string}}',
    `\n## Wissensartikel\n${context || '(keine passenden Artikel)'}`,
    day ? `\n## Tagesplan aus Phorest\n${JSON.stringify(day).slice(0, 4000)}` : '',
  ].join('\n')
  const msgs = [{ role: 'system', content: sys }, ...(Array.isArray(history) ? history.slice(-8).map((h: any) => ({ role: h.me ? 'user' : 'assistant', content: String(h.t ?? '').slice(0, 1500) })) : []), { role: 'user', content: q }]
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('ASSISTANT_MODEL') ?? 'gpt-5.6-sol', messages: msgs, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) throw new Error(`openai_${r.status}`)
    const out = JSON.parse((await r.json()).choices?.[0]?.message?.content ?? '{}')
    const byId = new Map((arts ?? []).map((a: any) => [a.id, a.title]))
    const answer: Answer = {
      text: String(out.text ?? ''),
      sources: (out.source_ids ?? []).filter((id: string) => byId.has(id)).map((id: string) => ({ id, title: byId.get(id) })),
      ...(out.ticket?.title ? { ticket: { kind: out.ticket.kind === 'Idee' ? 'Idee' : 'Meldung', title: String(out.ticket.title).slice(0, 200) } } : {}),
    }
    return json({ ok: true, mode: 'ki', ...answer })
  } catch {
    return json({ ok: true, mode: 'wissen', ...fallback(q, ranked.map((r) => r.a), day, me) })
  }
})

// Ohne Sprachmodell: bestes passendes Wissen, Tagesplan oder Meldungsvorschlag.
function fallback(q: string, arts: Article[], day: any, me: any): Answer {
  if (isBroken(q)) return { text: 'Das kann ich nicht selbst lösen. Soll ich eine Meldung an die Facility erstellen?', sources: [], ticket: { kind: 'Meldung', title: q.replace(/^(das|der|die)\s/i, '').slice(0, 200) } }
  if (day) {
    const m = day.mine
    const parts: string[] = []
    if (m?.mapped && m.shifts?.length) parts.push(`Deine Schicht heute: ${m.shifts.map((s: any) => `${s.start}–${s.end}`).join(', ')}, ${m.appointments.length} Termine.`)
    else if (m && !m.mapped) parts.push('Du bist noch keiner Phorest-Spalte zugeordnet.')
    if (day.team?.length) parts.push(`Heute im Studio: ${day.team.map((t: any) => `${t.name} ${t.start}–${t.end}`).join(', ')}.`)
    if (parts.length) return { text: parts.join(' '), sources: [] }
  }
  const a = arts[0]
  if (a) {
    const first = a.body.split(/\n\n+/).slice(0, 3).join(' ')
    return { text: `Aus dem Wissen „${a.title}“: ${first.slice(0, 600)}`, sources: [{ id: a.id, title: a.title }] }
  }
  return { text: 'Dazu finde ich nichts im Wissen. Ich kann deine Frage als Idee oder Meldung ans Büro weitergeben.', sources: [], ticket: { kind: 'Idee', title: q.slice(0, 200) } }
}
