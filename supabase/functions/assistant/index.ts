// KI-Reiter im TeamHub (BLTH-25): beantwortet interne Fragen aus dem freigegebenen
// Wissen, kennt eigene Termine und Schichten an jedem Tag aus Phorest (nur im Rahmen der Rolle) und schlägt bei
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
// Seltene Wörter zählen viel, Allerweltswörter („mache“, „muss“) kaum (IDF über alle
// Artikel). Titel/Stichwörter zählen vierfach, im Text höchstens drei Treffer je Wort.
// Zusammengesetzte Wörter („Kassenabschluss“) treffen auch ihre Teile („Abschluss Kasse“).
function hit(w: string, x: string) { return x.startsWith(w.slice(0, Math.max(5, w.length - 3))) || (w.length >= 8 && x.length >= 5 && w.includes(x)) }
function rank(q: string, arts: (Article & { tags?: string[] })[]) {
  const qw = [...new Set(words(q).filter((w) => w.length >= 4 && !STOP.has(w)))]
  const docs = arts.map((a) => ({ a, t: words(a.title + ' ' + (a.tags ?? []).join(' ')), b: words(a.body) }))
  const N = docs.length || 1
  const idf = new Map(qw.map((w) => [w, Math.log(1 + N / (1 + docs.filter((d) => d.t.some((x) => hit(w, x)) || d.b.some((x) => hit(w, x))).length))]))
  return docs.map(({ a, t, b }) => {
    let score = 0
    for (const w of qw) {
      const tf = Math.min(3, b.filter((x) => hit(w, x)).length), inTitle = t.some((x) => hit(w, x))
      score += (idf.get(w) ?? 0) * ((inTitle ? 4 : 0) + tf)
    }
    return { a, score }
  }).filter((x) => x.score >= 3).sort((x, y) => y.score - x.score)
}
const isBroken = (q: string) => /kaputt|defekt|funktioniert nicht|geht nicht|ausgefallen|fällt aus|tropft|leck/i.test(q)
const isShift = (q: string) => /dienst|schicht|arbeitet|arbeite ich|wer ist|im studio|termin|mein tag|heute bei mir|steht heute|was steht|habe ich heute/i.test(q)
// Kalendertag in Zürich als YYYY-MM-DD, verschoben um n Tage
const zDay = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(Date.now() + n * 864e5))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const authz = req.headers.get('Authorization') ?? ''
  const db = createClient(url, anon, { global: { headers: { Authorization: authz } } })
  const { data: me } = await db.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const body = await req.json().catch(() => ({}))
  // Nur Büro: welche Modelle der hinterlegte Schlüssel kennt (für die Einrichtung)
  if (body.action === 'models') {
    if (me.app_role !== 'buero') return json({ ok: false, error: 'forbidden' }, 403)
    const key = Deno.env.get('OPENAI_API_KEY'); if (!key) return json({ ok: false, error: 'no_key' })
    const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
    const d = await r.json().catch(() => ({}))
    return json({ ok: r.ok, status: r.status, models: (d.data ?? []).map((m: any) => m.id).filter((id: string) => /^(gpt|o\d|chatgpt)/.test(id)).sort(), error: d.error?.message })
  }
  const { message = '', history = [] } = body
  const q = String(message).slice(0, 2000)
  if (!q.trim()) return json({ ok: false, error: 'empty' }, 400)

  // Nur freigegebene Artikel, die diese Person per RLS sehen darf.
  const { data: arts } = await db.from('wiki_articles').select('id, category, title, body, tags').eq('published', true)
  const ranked = rank(q, (arts ?? []) as Article[])

  // Ohne KI: eigener Tag (heute) aus Phorest, nur wenn danach gefragt wird
  const phorestCall = (b: unknown) => fetch(`${url}/functions/v1/phorest`, { method: 'POST', headers: { Authorization: authz, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ ok: false }))
  const today = async () => {
    if (!isShift(q)) return null
    const [mine, team] = await Promise.all([phorestCall({ action: 'my_day' }), me.app_role !== 'mitarbeiterin' && me.branch_id !== 'buero' ? phorestCall({ action: 'team_today', branch: me.branch_id }) : Promise.resolve(null)])
    return { mine: mine?.ok ? mine : null, team: team?.ok ? team.team : null }
  }

  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ ok: true, mode: 'wissen', ...fallback(q, ranked.map((r) => r.a), await today(), me) })
  const { data: branchRows } = await db.from('branches').select('id, name, is_office')
  const studios = (branchRows ?? []).filter((b: any) => !b.is_office)
  const now = new Date()
  const dateLine = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  const timeLine = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(now)

  const context = ranked.slice(0, 4).map((r) => `### ${r.a.title} (${r.a.category}, id ${r.a.id})\n${r.a.body.slice(0, 3000)}`).join('\n\n')
  const sys = [
    `Du bist Benni, der interne Assistent im TeamHub der Beautylounge. Du sprichst mit ${me.first_name} (${me.job_title}, Studio ${me.branch_id}). Antworte kurz, freundlich, in der Sprache der Frage (Deutsch, Englisch oder Französisch). Schweizer Hochdeutsch (ss statt ß).`,
    'Beantworte Fachfragen NUR aus den Wissensartikeln (unten oder per read_article). Steht die Antwort nicht darin, sag das ehrlich und erfinde nichts.',
    'Kundinnen: Fragt jemand nach einer Kundin (Historie, letzte Besuche, Notizen, worauf achten), nutze client_history mit Name, E-Mail oder Telefon. Bei mehreren Treffern frag nach, welche gemeint ist. Fasse kurz zusammen: seit wann, häufigste Behandlungen, bei wem, letzter Besuch, wichtige Notizen (Allergien, Reklamationen, Wünsche). Nichts erfinden.',
    'Lernen: Will jemand lernen oder mit dem Onboarding weitermachen, nutze onboarding_status, nimm den ersten offenen Schritt, lies den Artikel mit read_article und erkläre ihn in einem kurzen Häppchen (höchstens 6 Sätze). Stelle danach eine einfache Kontrollfrage. Ist die Antwort im Kern richtig, lobe kurz und markiere den Schritt mit mark_step_done als erledigt, dann biete den nächsten an.',
    `Heute ist ${dateLine} (${zDay()}), es ist ${timeLine} Uhr in der Schweiz. Rechne Angaben wie „morgen“, „übermorgen“, „am Freitag“ oder „nächsten Dienstag“ selbst in ein Datum um.`,
    'Eigene Termine und Schichten: Fragt jemand nach seinen Terminen, Kundinnen oder seiner Schicht an einem Tag, nutze my_day mit dem Datum. Nenne Uhrzeit, Kundin und Behandlung, bei einer Frage nach einer bestimmten Uhrzeit den Termin, der dann läuft oder beginnt. Für Arbeitszeiten der nächsten sieben Tage nutze my_week. Steht nichts im Plan, sag das klar (zum Beispiel: an dem Tag frei).',
    'Will jemand wissen, worauf sie bei einer Kundin aus ihrem Plan achten soll, hol mit client_history und der client_id aus my_day deren Historie. Fehlt dir die client_id (zum Beispiel bei einer Anschlussfrage zu einem Termin von vorhin), ruf my_day für denselben Tag erneut auf und nimm sie von dort. Frag dafür nicht nach Name, E-Mail oder Telefon.',
    me.app_role !== 'mitarbeiterin' ? `Wer an einem Tag in einem Studio arbeitet, liefert team_day. Studios: ${studios.map((b: any) => `${b.name} (id ${b.id})`).join(', ')}.${me.app_role === 'filialleitung' ? ` Du darfst nur dein eigenes Studio (id ${me.branch_id}) abfragen.` : ''}` : 'Pläne von Kolleginnen kannst du nicht einsehen.',
    'Kannst du ein Anliegen nicht lösen (etwas ist kaputt, Personal- oder Betriebsanliegen), schlag eine Meldung vor. Verbesserungsvorschläge sind eine Idee.',
    'Gib am Ende ausschliesslich JSON zurück: {"text": string, "source_ids": string[], "ticket": null | {"kind": "Meldung"|"Idee", "title": string}}',
    `\n## Passende Wissensartikel\n${context || '(keine passenden Artikel)'}`,
  ].join('\n')
  const tools = [
    { type: 'function', function: { name: 'client_history', description: 'Sucht eine Kundin in Phorest und liefert ihre Besuche und Termin-Notizen der letzten 12 Monate. Bei mehreren Treffern kommt eine Auswahlliste.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Name, E-Mail oder Telefon' }, client_id: { type: 'string', description: 'falls aus einer Auswahlliste bekannt' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'my_day', description: 'Eigene Schicht und Kundentermine aus Phorest für einen Tag (Uhrzeit, Kundin, Behandlung, client_id).', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] } } },
    { type: 'function', function: { name: 'my_week', description: 'Eigene Arbeitszeiten der nächsten sieben Tage aus Phorest.', parameters: { type: 'object', properties: {} } } },
    ...(me.app_role !== 'mitarbeiterin' ? [{ type: 'function', function: { name: 'team_day', description: 'Wer an einem Tag in einem Studio arbeitet, mit Schicht und Anzahl Termine.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, branch: { type: 'string', description: 'Studio-id' } }, required: ['date'] } } }] : []),
    { type: 'function', function: { name: 'onboarding_status', description: 'Onboarding-Schritte dieser Mitarbeiterin mit erledigt/offen und Artikel-ID.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'read_article', description: 'Liest einen Wissensartikel (nur freigegebene, die diese Person sehen darf).', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
    { type: 'function', function: { name: 'mark_step_done', description: 'Markiert einen eigenen Onboarding-Schritt als erledigt, nachdem die Kontrollfrage richtig beantwortet wurde.', parameters: { type: 'object', properties: { step_id: { type: 'string' } }, required: ['step_id'] } } },
  ]
  // Datum prüfen: nur echte Tage zwischen 60 Tagen zurück und 60 Tagen voraus
  const okDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= zDay(-60) && d <= zDay(60)
  const runTool = async (name: string, args: any): Promise<unknown> => {
    if (name === 'my_day') {
      if (!okDate(args.date)) return { error: 'datum_ungueltig', erlaubt: `${zDay(-60)} bis ${zDay(60)}` }
      const d = await phorestCall({ action: 'my_day', date: args.date })
      if (!d.ok) return { error: 'phorest_unavailable' }
      if (!d.mapped) return { error: 'keiner_phorest_spalte_zugeordnet' }
      return { datum: d.date, schicht: d.shifts, termine: (d.appointments ?? []).map((a: any) => ({ von: a.start, bis: a.end, kundin: a.client, behandlung: a.service, client_id: a.client_id })) }
    }
    if (name === 'my_week') {
      const w = await phorestCall({ action: 'staff_week' })
      return w.ok ? (w.mapped ? { arbeitstage: w.days } : { error: 'keiner_phorest_spalte_zugeordnet' }) : { error: 'phorest_unavailable' }
    }
    if (name === 'team_day') {
      if (me.app_role === 'mitarbeiterin') return { error: 'nicht_erlaubt' }
      if (!okDate(args.date)) return { error: 'datum_ungueltig' }
      const branch = me.app_role === 'filialleitung' ? me.branch_id : String(args.branch ?? me.branch_id)
      const t = await phorestCall({ action: 'team_today', branch, date: args.date })
      return t.ok ? { datum: args.date, studio: branch, team: t.team } : { error: t.error ?? 'phorest_unavailable' }
    }
    if (name === 'client_history') {
      if (args.client_id) return await phorestCall({ action: 'client_history', client_id: args.client_id, months: 12 })
      const s = await phorestCall({ action: 'client_search', q: String(args.query ?? '') })
      if (!s.ok) return { error: 'phorest_unavailable' }
      if (s.clients.length === 1) return await phorestCall({ action: 'client_history', client_id: s.clients[0].client_id, months: 12 })
      return { auswahl: s.clients.map((c: any) => ({ client_id: c.client_id, name: c.name, seit: c.since, tel_endet_auf: c.phone_tail })) }
    }
    if (name === 'onboarding_status') {
      const [{ data: steps }, { data: done }, { data: flags }] = await Promise.all([
        db.from('onboarding_steps').select('id, title, minutes, article_id, sort, proposed, is_sample').order('sort'),
        db.from('onboarding_progress').select('step_id').eq('employee_id', me.id), db.rpc('app_flags')])
      const demo = (flags as any)?.demo_data !== false, d = new Set((done ?? []).map((x: any) => x.step_id))
      // Schritte ohne hinterlegten Artikel bekommen den am besten passenden Wissensartikel (nach Titel)
      return (steps ?? []).filter((x: any) => !x.proposed && (demo || !x.is_sample)).map((x: any) => {
        const guess = x.article_id ? null : rank(x.title, (arts ?? []) as Article[])[0]?.a
        return { step_id: x.id, titel: x.title, minuten: x.minutes, artikel_id: x.article_id ?? guess?.id ?? null, artikel_geschaetzt: !x.article_id && !!guess, erledigt: d.has(x.id) }
      })
    }
    if (name === 'read_article') {
      const { data } = await db.from('wiki_articles').select('id, title, category, body').eq('id', String(args.id ?? '')).eq('published', true).maybeSingle()
      return data ? { id: data.id, titel: data.title, kategorie: data.category, text: String(data.body ?? '').slice(0, 6000) } : { error: 'nicht_gefunden' }
    }
    if (name === 'mark_step_done') {
      const { error } = await db.from('onboarding_progress').insert({ step_id: String(args.step_id ?? ''), employee_id: me.id })
      return error && !/duplicate/.test(error.message) ? { error: 'nicht_gespeichert' } : { ok: true }
    }
    return { error: 'unbekannt' }
  }
  const msgs: any[] = [{ role: 'system', content: sys }, ...(Array.isArray(history) ? history.slice(-10).map((h: any) => ({ role: h.me ? 'user' : 'assistant', content: String(h.t ?? '').slice(0, 2000) })) : []), { role: 'user', content: q }]
  const readIds = new Set<string>()
  try {
    for (let round = 0; round < 5; round++) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: Deno.env.get('ASSISTANT_MODEL') ?? 'gpt-5.6-sol', messages: msgs, tools, reasoning_effort: 'none', response_format: { type: 'json_object' } }),  // Werkzeuge gehen in chat/completions nur ohne Reasoning
        signal: AbortSignal.timeout(90000),
      })
      if (!r.ok) throw new Error(`openai_${r.status}: ${(await r.text()).slice(0, 300)}`)
      const m = (await r.json()).choices?.[0]?.message
      if (m?.tool_calls?.length) {
        msgs.push(m)
        for (const c of m.tool_calls) {
          let args: any = {}; try { args = JSON.parse(c.function?.arguments ?? '{}') } catch { /* leer */ }
          if (c.function?.name === 'read_article' && args.id) readIds.add(String(args.id))
          const result = await runTool(c.function?.name, args)
          msgs.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result).slice(0, 12000) })
        }
        continue
      }
      const out = JSON.parse(m?.content ?? '{}')
      const byId = new Map((arts ?? []).map((a: any) => [a.id, a.title]))
      const answer: Answer = {
        text: String(out.text ?? ''),
        sources: [...new Set([...(out.source_ids ?? []), ...readIds])].filter((id: string) => byId.has(id)).map((id: string) => ({ id, title: byId.get(id) })),
        ...(out.ticket?.title ? { ticket: { kind: out.ticket.kind === 'Idee' ? 'Idee' : 'Meldung', title: String(out.ticket.title).slice(0, 200) } } : {}),
      }
      return json({ ok: true, mode: 'ki', ...answer })
    }
    throw new Error('too_many_rounds')
  } catch (e) {
    // Grund mitgeben (zeigt die App nicht an), damit Fehler nachvollziehbar sind
    return json({ ok: true, mode: 'wissen', reason: String(e).slice(0, 400), ...fallback(q, ranked.map((r) => r.a), await today(), me) })
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
