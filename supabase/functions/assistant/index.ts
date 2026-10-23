// Marc, der Assistent im TeamHub (BLTH-25). Kennt die Person, die fragt (Rolle, Studio, Lage im
// TeamHub), holt sich Termine, Kundinnen, Kolleginnen, Behandlungen und mehr selbst aus Phorest,
// beantwortet Fachfragen nur aus dem freigegebenen Wissen und schlägt bei nicht lösbaren Anliegen
// eine Meldung vor. Schreibt selbst nur den eigenen Onboarding-Fortschritt und die eigenen Chats.
// Body: {chat_id?, message, files?, model?: schnell|standard|stark, web?, stream?}. Mit chat_id speichert die
// Function Frage und Antwort selbst (benni_chats/benni_messages) und gibt dem Chat beim ersten Mal einen Titel.
// Mit {stream: true} kommen Arbeitsschritte als NDJSON ({step, detail} | {title}), am Ende {done: true, …}.
// Secrets: OPENAI_API_KEY (optional; ohne ihn antwortet Marc nur aus dem Wissen),
//          ASSISTANT_MODEL, ASSISTANT_REASONING, TITLE_MODEL (optional).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { appendToolRound, CONTEXT_BUCKET, contextPathAllowed, privateRequest, readContext, saveContext, type Context, type Item } from './privacy-context.ts'
import { contactPolicy } from './contact-policy.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

type Article = { id: string; category: string; title: string; body: string }
type Answer = { text: string; sources: { id: string; title: string }[]; ticket?: { kind: 'Meldung' | 'Idee'; title: string } }
type File = { name: string; mime: string; data?: string; text?: string }
// Modellwahl in der Eingabeleiste
const MODELS: Record<string, { id: string; effort: string }> = {
  schnell: { id: 'gpt-5.4-mini', effort: 'low' },
  standard: { id: Deno.env.get('ASSISTANT_MODEL') ?? 'gpt-5.6-sol', effort: Deno.env.get('ASSISTANT_REASONING') ?? 'low' },
  stark: { id: 'gpt-6.1-sol', effort: 'medium' },
}

const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9äöü]+/).filter((w) => w.length > 2)
const STOP = new Set(['wie', 'was', 'wer', 'die', 'der', 'das', 'und', 'ist', 'ich', 'mit', 'fur', 'fuer', 'bei', 'wird', 'eine', 'einen', 'lange', 'kann', 'habe', 'noch', 'soll', 'darf', 'muss'])
// Seltene Wörter zählen viel, Allerweltswörter kaum (IDF über alle Artikel). Titel/Stichwörter
// zählen vierfach, im Text höchstens drei Treffer je Wort. Zusammengesetzte Wörter treffen auch ihre Teile.
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
// Kalendertage in Zürich zählen (nicht 24-Stunden-Schritte, sonst Fehler bei der Zeitumstellung)
const zDay = (n = 0) => { const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date()).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const isoDow = (day: string) => ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1
const ROLE = { mitarbeiterin: 'Mitarbeiterin', filialleitung: 'Filialleitung', buero: 'Büro' } as Record<string, string>

// Wo was in der App liegt, damit Marc Wege erklären kann
const APP_GUIDE = `Handy-App (alle Rollen), unten fünf Reiter: Heute, Aufgaben, Marc, Wissen, Menü.
- Heute: Schicht und Anzahl Termine aus Phorest, Abschnitt „Bitte lesen“ für Pflicht-News, Tagesaufgaben mit Fortschritt, „Mein Tag“ (eigene Kundentermine), News. Filialleitung zusätzlich „Heute im Studio“.
- Aufgaben, zwei Bereiche: „Für mich“ = einzelne Aufgaben mit Frist, die Filialleitung oder Büro einer Person oder dem ganzen Studio geben (mit Mitteilung), plus eigene To-dos („Eigenes To-do hinzufügen“). „Studio-Checklisten“ = feste Abläufe des Studios, jeden Tag neu (Vorlagen vom Büro, z. B. Öffnung, Mittag, Schliessung, Wochenputz), jede Liste mit „bis“-Zeit; wer etwas erledigt, hakt es für alle ab, bei manchen mit Foto. Name und Uhrzeit werden gespeichert. Filialleitung und Büro weisen einzelne Aufgaben im Backoffice unter Aufgaben zu.
- Wissen: Suche, Onboarding für Neue („Mit Marc lernen“), alle Artikel des bisherigen Wikis. Unter manchen Artikeln und Pflicht-News ein Quiz (bestanden ab 80 %).
- Wissen ist nach Kategorien geordnet (Karten mit Bild), darin die Artikel als Liste.
- Marc: mehrere Chats (oben „Chats“, neuer Chat, löschen), Dateien und Fotos anhängen (Büroklammer), diktieren (Mikrofon), Modell wählen (Schnell, Standard, Gründlich) und Websuche einschalten.
- Eigenes Profil: am Handy über das Bild oben rechts auf „Heute“ oder im Menü, am Desktop unten in der Seitenleiste. Dort Arbeitszeiten der Woche, Aushilfe-Tage, Sprache DE/EN/FR, Mitteilungen, Profilbild. Skills vergibt die Filialleitung oder das Büro.
- Menü: Kundentermine (eigenes Studio live aus Phorest, Büro alle; Tipp auf einen Termin zeigt Notizen und Historie), Kundenhistorie (Besuche und Notizen einer Kundin), News, Kalender (eigene Termine aus Phorest sowie Schulungen und Events mit „Ich komme“ / „Ich komme nicht“, Filter oben), Team (Kolleginnen mit Telefon und E-Mail), Melden & Ideen (Meldung mit Foto oder Video für ein wählbares Studio, Meldungen und Ideen der anderen sehen und mit dem Pfeil nach oben unterstützen, kommentieren), Zeit & Ferien (Timebutler), Verbindungen.
- Pflicht-News gelten erst als bestätigt, wenn man sie öffnet und unten „Gelesen und verstanden“ tippt. Hat sie ein Quiz, gilt sie mit dem bestandenen Quiz als bestätigt.
- Ferien beantragen und Zeiterfassung laufen in Timebutler (Menü → Zeit & Ferien), nicht im TeamHub.
Backoffice am Desktop (Filialleitung für das eigene Studio, Büro für alle): Übersicht, Kundentermine, News (nur Büro, mit Marc-Entwurf), Aufgaben (Vorlagen anlegen nur Büro), Meldungen & Ideen, Schulungen & Events, Aushilfe (wer kann an einem Tag einspringen), Lernen (Quiz und Nachweise), Team & Skills (Filialleitung: eigenes Studio, Personen anlegen, Skills vergeben, deaktivieren; löschen nur Büro), Studios und Wissen (beide nur Büro). Am Handy gibt es kein Backoffice.`

function phorestGuide(ids: string) {
  return `Liest Phorest direkt (nur GET). Pfad relativ zum Business, ohne Domain. Filial-IDs: ${ids}.
- branch → Filialen mit Adresse
- branch/{id}/staff?size=200 → Mitarbeitende (firstName, lastName, staffCategoryName, disqualifiedServices = diese Services macht die Person NICHT)
- branch/{id}/staff/worktimetable?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&size=200 → Dienstplan (nur je einzelnen Tag zuverlässig)
- branch/{id}/appointment?from_date=…&to_date=…&size=500[&client_id=…] → Termine (serviceName, staffId, clientId, startTime, endTime, state, activationState, price); Zeitfenster höchstens 31 Tage
- branch/{id}/service?size=500 → Behandlungen (name, duration in Minuten, price in CHF, categoryName, internetEnabled = online buchbar, disqualifiedStaff)
- branch/{id}/service-category → Kategorien · branch/{id}/package → Pakete · branch/{id}/course → Kurse/Abos
- branch/{id}/product?size=300 → Produkte (brandName, price CHF, quantityInStock, minQuantity)
- branch/{id}/room · branch/{id}/machine → Räume, Geräte
- branch/{id}/review?size=50 → Bewertungen (rating 1–5, text, staffFirstName, reviewDate)
- client?firstName=…&lastName=… | client?email=… | client?phone=41… → Kundensuche · client/{id} → Profil (clientSince, lastVisit, preferredStaffId, notes = Kundennotiz, gender, loyaltyCard.points)
- voucher?size=50 → Gutscheine (serialNumber, remainingBalance, expiryDate)
Paging mit size und page. Für eigene Termine, Studio-Tage, Kundinnen und Behandlungen zuerst die einfacheren Werkzeuge nutzen.`
}

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
  const { message = '', stream = false } = body
  const files: File[] = (Array.isArray(body.files) ? body.files : []).slice(0, 4)
    .filter((f: any) => f && typeof f.name === 'string' && (typeof f.text === 'string' || (typeof f.data === 'string' && f.data.length < 14e6)))
    .map((f: any) => ({ name: String(f.name).slice(0, 120), mime: String(f.mime ?? 'application/octet-stream'), data: f.data, text: typeof f.text === 'string' ? f.text.slice(0, 60000) : undefined }))
  const q = String(message).slice(0, 4000).trim() || (files.length ? 'Schau dir bitte die Datei an.' : '')
  if (!q) return json({ ok: false, error: 'empty' }, 400)
  const tier = MODELS[body.model] ? String(body.model) : 'standard'
  const web = body.web === true

  // Gespräch: eigener Chat (RLS), Verlauf aus der Datenbank, Frage sofort speichern
  const chatId: string | null = typeof body.chat_id === 'string' && body.chat_id ? body.chat_id : null
  let chat: { id: string; title: string } | null = null
  let history: { me: boolean; t: string }[] = Array.isArray(body.history) ? body.history : []
  let contextRef: string | null = null
  let newContext: string | null = null
  let contextSaved = true
  if (chatId) {
    const { data: c } = await db.from('benni_chats').select('id, title').eq('id', chatId).maybeSingle()
    if (!c) return json({ ok: false, error: 'chat_not_found' }, 404)
    chat = c
    const { data: rows } = await db.from('benni_messages').select('role, text, data, created_at').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(16)
    const list = (rows ?? []).reverse() as any[]
    history = list.map((r) => ({ me: r.role === 'user', t: r.text + (r.data?.files?.length ? ` [Anhang: ${r.data.files.map((f: any) => f.name).join(', ')}]` : '') }))
    const lastA = [...list].reverse().find((r) => r.role === 'assistant')
    // Conversation state stays in our private storage, not at the model provider.
    if (contextPathAllowed(lastA?.data?.context_path, me.id, chatId)
      && Date.now() - new Date(lastA.created_at).getTime() < 25 * 864e5) contextRef = lastA.data.context_path
    await db.from('benni_messages').insert({ chat_id: chatId, role: 'user', text: q, data: files.length ? { files: files.map((f) => ({ name: f.name, kind: f.mime.startsWith('image/') ? 'image' : 'file' })) } : {} })
  }

  // Arbeitsschritte an die App (nur bei stream)
  const enc = new TextEncoder()
  let out: ReadableStreamDefaultController<Uint8Array> | null = null
  const emit = (o: Record<string, unknown>) => { try { out?.enqueue(enc.encode(JSON.stringify(o) + '\n')) } catch { /* Verbindung zu */ } }

  const phorestCall = (b: unknown) => fetch(`${url}/functions/v1/phorest`, { method: 'POST', headers: { Authorization: authz, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ ok: false }))

  const work = async (): Promise<Record<string, unknown>> => {
    // Nur freigegebene Artikel, die diese Person per RLS sehen darf; Beispielartikel nur mit Beispiel-Schalter
    const [{ data: arts }, { data: fl0 }] = await Promise.all([db.from('wiki_articles').select('id, category, title, body, tags, is_sample').eq('published', true), db.rpc('app_flags')])
    const demoOn = (fl0 as any)?.demo_data !== false
    const articles = ((arts ?? []) as any[]).filter((a) => demoOn || !a.is_sample) as (Article & { tags?: string[] })[]
    const ranked = rank(q, articles)
    const byId = new Map(articles.map((a) => [a.id, a.title]))

    const today = async () => {
      if (!isShift(q)) return null
      const [mine, team] = await Promise.all([phorestCall({ action: 'my_day' }), me.app_role !== 'mitarbeiterin' && me.branch_id !== 'buero' ? phorestCall({ action: 'team_today', branch: me.branch_id }) : Promise.resolve(null)])
      return { mine: mine?.ok ? mine : null, team: team?.ok ? team.team : null }
    }
    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) return { ok: true, mode: 'wissen', ...fallback(q, ranked.map((r) => r.a), await today(), me) }

    emit({ step: 'think' })
    const nowIso = new Date().toISOString(), day0 = zDay()
    const [flagsR, branchR, newsR, readsR, evR, regR, tkR, obR, obDoneR, sbR, tplR, itemR, compR, todoR] = await Promise.all([
      db.rpc('app_flags'),
      db.from('branches').select('id, name, is_office, phorest_branch_id').order('sort'),
      db.from('news').select('id, title, teaser, must_read, publish_at, is_sample').lte('publish_at', nowIso).order('publish_at', { ascending: false }).limit(12),
      db.from('news_reads').select('news_id, confirmed_at').eq('employee_id', me.id),
      db.from('events').select('id, title, kind, starts_at, place, register_until, capacity, is_sample').gte('starts_at', nowIso).order('starts_at').limit(8),
      db.from('event_registrations').select('event_id, coming').eq('employee_id', me.id),
      db.from('tickets').select('id, kind, title, status, updated_at, is_sample').eq('created_by', me.id).order('updated_at', { ascending: false }).limit(6),
      db.from('onboarding_steps').select('id, title, proposed, is_sample').order('sort'),
      db.from('onboarding_progress').select('step_id').eq('employee_id', me.id),
      db.from('standby_days').select('day').eq('employee_id', me.id).gte('day', day0).order('day').limit(10),
      db.from('task_templates').select('id, name, repeat, weekday, monthday, branch_ids, is_sample').eq('active', true),
      db.from('task_items').select('id, template_id, title, due_time, prio, proof_photo').order('sort'),
      db.from('task_completions').select('item_id, branch_id, done_by_name, done_at').eq('day', day0),
      db.from('todos').select('id, title, due_at, assignee_id, branch_id, created_by, created_by_name').is('done_at', null).order('due_at', { ascending: true, nullsFirst: false }).limit(60),
    ])
    const demo = (flagsR.data as any)?.demo_data !== false
    // Kontrollfragen je Lektion und Mindestzahl richtiger Antworten (Backoffice → Lernen)
    const qN = Math.min(10, Math.max(3, Number((flagsR.data as any)?.learn_questions) || 3))
    const qMin = Math.min(qN, Math.max(1, Number((flagsR.data as any)?.learn_min_correct) || qN))
    const keep = (x: any) => demo || !x.is_sample
    const branches = (branchR.data ?? []) as any[]
    const studio = branches.find((b) => b.id === me.branch_id)?.name ?? me.branch_id
    const studios = branches.filter((b) => !b.is_office)
    const confirmed = new Set((readsR.data ?? []).filter((r: any) => r.confirmed_at).map((r: any) => r.news_id))
    const news = (newsR.data ?? []).filter(keep)
    const mustOpen = news.filter((n: any) => n.must_read && !confirmed.has(n.id))
    const regs = new Map((regR.data ?? []).map((r: any) => [r.event_id, r.coming]))
    const events = (evR.data ?? []).filter(keep)
    const fmtD = (s: string) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(s))
    // Tagesaufgaben des eigenen Studios (gleiche Regel wie in der App)
    const myBranch = me.branch_id
    const tpls = (tplR.data ?? []).filter(keep).filter((t: any) => myBranch !== 'buero' && ((t.branch_ids ?? []).length === 0 || t.branch_ids.includes(myBranch)) &&
      (t.repeat === 'daily' || (t.repeat === 'weekly' && t.weekday === isoDow(day0)) || (t.repeat === 'monthly' && Math.min(t.monthday ?? 1, new Date(Date.UTC(Number(day0.slice(0, 4)), Number(day0.slice(5, 7)), 0)).getUTCDate()) === Number(day0.slice(8, 10)))))
    const items = (itemR.data ?? []).filter((i: any) => tpls.some((t: any) => t.id === i.template_id))
    const doneItems = new Map((compR.data ?? []).filter((c: any) => c.branch_id === myBranch).map((c: any) => [c.item_id, c]))
    const openItems = items.filter((i: any) => !doneItems.has(i.id)).sort((a: any, b: any) => String(a.due_time ?? '99').localeCompare(String(b.due_time ?? '99')))
    const steps = (obR.data ?? []).filter((s: any) => !s.proposed && keep(s))
    const obDone = new Set((obDoneR.data ?? []).map((x: any) => x.step_id))

    const myBr = [me.branch_id, ...(me.extra_branch_ids ?? [])]
    const myTodos = (todoR.data ?? []).filter((x: any) => x.assignee_id === me.id || (!x.assignee_id && myBr.includes(x.branch_id)))
    const lage = [
      myTodos.length ? `- Offene Aufgaben für dich (Aufgaben → Für mich): ${myTodos.slice(0, 8).map((x: any) => `„${x.title}“${x.due_at ? ` bis ${fmtD(x.due_at)}` : ''}${x.created_by !== me.id && x.created_by_name ? ` von ${x.created_by_name}` : ''}`).join('; ')}` : '- Keine offenen Aufgaben für dich.',
      mustOpen.length ? `- Pflicht-News noch nicht bestätigt: ${mustOpen.map((n: any) => `„${n.title}“`).join(', ')}` : '- Alle Pflicht-News sind bestätigt.',
      news.length ? `- Neueste News: ${news.slice(0, 5).map((n: any) => `„${n.title}“ (${n.publish_at.slice(0, 10)}, id ${n.id})`).join('; ')}` : '',
      myBranch === 'buero' ? '' : `- Tagesaufgaben ${studio} heute: ${items.length - openItems.length} von ${items.length} erledigt${openItems.length ? `; offen als Nächstes: ${openItems.slice(0, 4).map((i: any) => `${i.title}${i.due_time ? ` (${String(i.due_time).slice(0, 5)})` : ''}`).join(', ')}` : ''}. Listen heute: ${tpls.map((t: any) => t.name).join(', ') || 'keine'}.`,
      events.length ? `- Kommende Schulungen und Events: ${events.map((e: any) => `„${e.title}“ ${fmtD(e.starts_at)}${e.place ? ` in ${e.place}` : ''} (${regs.get(e.id) === true ? 'angemeldet' : regs.get(e.id) === false ? 'abgesagt' : 'noch keine Antwort'})`).join('; ')}` : '- Keine kommenden Events.',
      (tkR.data ?? []).filter(keep).length ? `- Eigene Meldungen und Ideen: ${(tkR.data ?? []).filter(keep).map((t: any) => `${t.kind} „${t.title}“ (${t.status})`).join('; ')}` : '',
      steps.length ? `- Onboarding: ${steps.filter((s: any) => obDone.has(s.id)).length} von ${steps.length} Schritten erledigt.` : '',
      (sbR.data ?? []).length ? `- Eingetragene Aushilfe-Tage: ${(sbR.data ?? []).map((x: any) => x.day).join(', ')}` : '',
    ].filter(Boolean).join('\n')

    const now = new Date()
    const dateLine = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)
    const timeLine = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(now)
    const lead = me.app_role !== 'mitarbeiterin'
    const context = ranked.slice(0, 4).map((r) => `### ${r.a.title} (${r.a.category}, id ${r.a.id})\n${r.a.body.slice(0, 2500)}`).join('\n\n')

    const sys = [
      'Du bist Marc (voller Name Marc Beau; früher hiess der Assistent Benni, wer dich so nennt, meint dich), der Assistent im TeamHub der Beautylounge AG, einer Gruppe von Kosmetikstudios in der Region Basel. Du hilfst dem Team im Alltag: Termine, Kundinnen, Kolleginnen und Behandlungen aus Phorest (dem Kassen- und Buchungssystem), Wissen aus dem internen Wiki, Aufgaben, News, Schulungen und Meldungen.',
      `\n## Wer mit dir spricht\n${me.first_name} ${me.last_name}, ${me.job_title}, Rolle ${ROLE[me.app_role] ?? me.app_role}, Studio ${studio}.${(me.skills ?? []).length ? ` Skills: ${me.skills.join(', ')}.` : ''}`,
      `Heute ist ${dateLine} (${day0}), es ist ${timeLine} Uhr in der Schweiz.`,
      `\n## Lage im TeamHub (jetzt)\n${lage}`,
      '\n## So arbeitest du',
      '- Denk mit: Überleg, was die Person eigentlich wissen will, und hol es dir selbst mit den Werkzeugen, bevor du antwortest. Rückfragen nur, wenn es wirklich mehrdeutig ist (z. B. mehrere Kundinnen gleichen Namens).',
      '- Sag nie, dass du etwas nicht einsehen kannst, bevor du das passende Werkzeug versucht hast. Klappt ein Werkzeug nicht, sag ehrlich, was fehlt.',
      '- Phorest ist die Quelle für Termine, Schichten, Kundinnen, freie Zeiten, Behandlungen, Preise und Dauer. Eigener Tag: my_day. Eigene Woche: my_week. Wer arbeitet, wer hat wann frei, alle Termine eines Studios: studio_day. Kundin (Historie, letzte Besuche, nächster Termin, worauf achten): client_history. Behandlungen, Preis, Dauer, online buchbar: services.' + (lead ? ' Alles andere aus Phorest (Produkte und Lager, Bewertungen, Gutscheine, Pakete, Räume, Geräte, wer welche Behandlung macht): phorest_read.' : ''),
      '- Zeitangaben wie heute, morgen, übermorgen, Freitag, nächste Woche oder „um 14 Uhr“ rechnest du selbst in ein Datum um. Bei einer Uhrzeit nennst du den Termin, der dann beginnt oder läuft.',
      '- „Worauf muss ich bei ihr achten“ oder „Was hatte sie zuletzt“ zu einer Kundin aus einem Plan: client_history mit der client_id aus my_day oder studio_day. Fehlt sie bei einer Anschlussfrage, hol den Tag erneut. Frag dafür nicht nach Name, E-Mail oder Telefon.',
      ...(lead ? [] : ['- Telefonnummern, E-Mail-Adressen, Adressen und Geburtstage von Kundinnen gibt es für dich nicht (Regel von Beautylounge, nur Respo, Stv. Respo und Büro sehen sie). Fragt jemand danach, sag freundlich, dass die Respo sie hat, und hilf mit Historie, Lieblingsbehandlungen und Zusatzverkauf.']),
      '- Geht es um eine bestimmte Kundin (Karte, Kontakt, Telefon, E-Mail, Historie, nächster Termin, „zeig mir …“), ruf client_history auf (mit der client_id aus my_day oder studio_day, sonst mit dem Namen) und setz client_card auf ihre client_id: Die App zeigt dann eine Kundenkarte mit Kontakt, Besuchen, nächsten Terminen und Notizen. Im Text dann nur das Wichtigste in 1 bis 3 Sätzen, nichts aus der Karte doppelt aufzählen.',
      '- Fachfragen (Behandlungen, Hygiene, Abläufe, Geräte, Regeln) beantwortest du nur aus dem Wissen: zuerst die Vorauswahl unten, sonst search_knowledge und read_article. Steht es nicht drin, sag das ehrlich und erfinde nichts.',
      '- Fragen zu News: news. Wege in der App erklärst du mit dem App-Leitfaden unten.',
      `- Rechte: ${me.app_role === 'mitarbeiterin' ? 'Du siehst Termine nur für das eigene Studio und nur den eigenen Dienstplan im Detail.' : me.app_role === 'filialleitung' ? `Du siehst Phorest für das eigene Studio (${studio}).` : 'Du siehst Phorest für alle Studios.'} ${contactPolicy(me.app_role)}`,
      '- Bei Fragen zur Bedienung von Phorest suche zuerst im Wissen nach Phorest und dem Thema und lies den passenden Artikel. Offizielle öffentliche Phorest-Hilfe und interne Studio-Regeln sind unterschiedliche Quellen: nenne die passende Quelle mit Link. Die Phorest Academy DACH ist ein geschützter Kursbereich; ohne bereitgestellte Kursinhalte behauptest du keinen Zugriff und erfindest keine Kursanleitungen. Änderungen in Phorest führst du nicht aus; TeamHub-Zugriffsrechte bleiben auch bei Hilfefragen verbindlich.',
      '- Lernmodus (Onboarding, „lass uns lernen“, „Nächste Lektion“): onboarding_status, ersten offenen Schritt nehmen, Artikel mit read_article lesen. Dann so:',
      '  1. Erklär den Schritt in Lernkarten: cards mit 1 bis 3 Karten, je {"title": kurzer Titel, "body": 2 bis 4 Sätze oder eine kurze Liste mit „- “}. Eine Karte, ein Gedanke, nur aus dem Artikel. Der text ist dann nur die Überleitung („Bereit für eine Kontrollfrage?“) mit choices ["Ja, frag mich", "Erst weiterlernen"].',
      '  2. „Erst weiterlernen“: weitere Karten zum selben Schritt (vertiefen, Beispiele aus dem Artikel), danach wieder dieselbe Überleitung.',
      `  3. „Ja, frag mich“ oder „Nochmal versuchen“: Kontrollfragen, genau ${qN} je Schritt, jede in einer eigenen Antwort mit quiz {"question": string, "options": 3 kurze Antworten, davon eine richtig; oder [] für eine freie Antwort}. text nur „Frage k von ${qN}“ (bei Antworten auf eine Frage davor die kurze Rückmeldung). Jede Frage prüft etwas anderes aus den Karten. Die Lernkarten sind dabei verdeckt, also nichts verraten.`,
      `  4. Nach jeder Antwort sagst du kurz, ob sie stimmt und warum (ein bis zwei Sätze), und setzt graded auf true (richtig) oder false (falsch). Nach der ${qN}. Antwort: reveal true. Bestanden ist der Schritt ab ${qMin} richtigen von ${qN}: dann mark_step_done mit letzte_richtig für die eben bewertete Antwort und choices ["Nächste Lektion", "Pause"]. Nicht bestanden (oder mark_step_done meldet nicht_bestanden): sag freundlich, wie viele richtig waren und was fehlte, erklär die Lücke in einer Karte (cards) und biete choices ["Nochmal versuchen", "Erst weiterlernen"]. Dann nicht abhaken.`,
      '  5. Sind alle Schritte erledigt, gratulier kurz.',
      '- choices sonst nur, wenn es wenige klare Antwortmöglichkeiten gibt (z. B. welche von zwei Kundinnen), höchstens 3, je höchstens 4 Wörter.',
      '- Kannst du ein Anliegen nicht lösen (etwas ist kaputt, Personal- oder Betriebsanliegen), schlag eine Meldung vor. Verbesserungsvorschläge sind eine Idee.',
      `- Studios: ${studios.map((b: any) => `${b.name} (id ${b.id})`).join(', ')}.`,
      '\n## Antwortstil',
      'Wie eine erfahrene, herzliche Kollegin: kurz, konkret, per du (das Du klein geschrieben, sonst normale Gross- und Kleinschreibung), Schweizer Hochdeutsch (ss statt ß), in der Sprache der Frage (Deutsch, Englisch oder Französisch). Erst die Antwort, dann höchstens ein hilfreicher nächster Schritt. Mehrere Punkte als Liste mit „- “, wichtige Wörter sparsam **fett**. Keine Floskeln, keine Überschriften.',
      ...(web ? ['- Websuche ist eingeschaltet: Für aktuelle oder allgemeine Fragen ausserhalb von Phorest und Wiki darfst du im Web suchen und nennst kurz die Quelle. Interne Abläufe und Regeln weiterhin nur aus dem Wissen.'] : []),
      ...(files.length ? [`- Die Person hat Dateien angehängt (${files.map((f) => f.name).join(', ')}). Lies sie und beziehe dich konkret darauf.`] : []),
      `\n## App-Leitfaden\n${APP_GUIDE}`,
      '\n## Ausgabe',
      'Gib am Ende ausschliesslich JSON zurück: {"text": string, "source_ids": string[], "ticket": null | {"kind": "Meldung"|"Idee", "title": string}, "client_card": null | string, "cards": [{"title": string, "body": string}], "quiz": null | {"question": string, "options": string[]}, "choices": string[], "reveal": boolean, "graded": null | boolean}. graded nur, wenn du gerade eine Antwort auf eine Kontrollfrage bewertest. source_ids sind die IDs der Wissensartikel, auf die sich die Antwort stützt. Nicht genutzte Felder: null, [] oder false.',
      `\n## Passende Wissensartikel (Vorauswahl)\n${context || '(keine passenden Artikel)'}`,
    ].join('\n')

    const okDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= zDay(-60) && d <= zDay(60)
    const phIds = studios.filter((b: any) => b.phorest_branch_id && (me.app_role === 'buero' || b.id === me.branch_id)).map((b: any) => `${b.name} = ${b.phorest_branch_id}`).join(', ')
    const defs: [string, string, Record<string, unknown>, string[]][] = [
      ['my_day', 'Eigene Schicht und Kundentermine aus Phorest für einen Tag (Uhrzeit, Kundin, Behandlung, client_id).', { date: { type: 'string', description: 'YYYY-MM-DD' } }, ['date']],
      ['my_week', 'Eigene Arbeitszeiten der nächsten sieben Tage aus Phorest.', {}, []],
      ['studio_day', 'Ein Tag im Studio aus Phorest: wer arbeitet (Schicht), freie Zeiten je Person und alle Termine (Person, Uhrzeit, Kundin, Behandlung, client_id).' + (me.app_role === 'buero' ? '' : ' Nur das eigene Studio.'), { date: { type: 'string', description: 'YYYY-MM-DD' }, branch: { type: 'string', description: 'Studio-id, Standard: eigenes Studio' } }, ['date']],
      ['client_history', 'Kundin in Phorest: Besuche und Termin-Notizen der letzten 12 Monate, kommende Termine, Kundin seit, bevorzugte Mitarbeiterin. Bei mehreren Treffern kommt eine Auswahlliste.', { query: { type: 'string', description: lead ? 'Name, E-Mail oder Telefon' : 'Name der Kundin' }, client_id: { type: 'string', description: 'falls bekannt (aus my_day, studio_day oder einer Auswahlliste)' } }, []],
      ['services', 'Behandlungskatalog aus Phorest: Name, Dauer in Minuten, Preis in CHF, Kategorie, online buchbar.', { q: { type: 'string', description: 'Suchwörter, z. B. „Microblading“ oder „Pediküre“' }, branch: { type: 'string', description: 'Studio-id, Standard: eigenes Studio' } }, []],
      ...(lead ? [['phorest_read', phorestGuide(phIds), { path: { type: 'string', description: 'z. B. branch/{id}/product?size=300' } }, ['path']] as [string, string, Record<string, unknown>, string[]]] : []),
      ['search_knowledge', 'Sucht im internen Wissen (Wiki) und liefert die passendsten Artikel mit Anfang.', { q: { type: 'string' } }, ['q']],
      ['read_article', 'Liest einen Wissensartikel ganz (nur freigegebene, die diese Person sehen darf).', { id: { type: 'string' } }, ['id']],
      ['news', 'Liest eine News ganz (mit id) oder listet die aktuellen News (ohne id).', { id: { type: 'string' } }, []],
      ['onboarding_status', 'Onboarding-Schritte dieser Person mit erledigt/offen und Artikel-ID.', {}, []],
      ['mark_step_done', `Markiert einen eigenen Onboarding-Schritt als erledigt, wenn von ${qN} Kontrollfragen mindestens ${qMin} richtig waren. Prüft das selbst anhand der bewerteten Antworten.`, { step_id: { type: 'string' }, letzte_richtig: { type: 'boolean', description: 'War die eben bewertete letzte Antwort richtig?' } }, ['step_id', 'letzte_richtig']],
      ['add_todo', 'Legt ein eigenes To-do für diese Person an (erscheint unter Aufgaben → Für mich). Nur auf ausdrücklichen Wunsch („erinnere mich“, „schreib mir auf“).', { title: { type: 'string' }, due: { type: 'string', description: 'Frist als YYYY-MM-DD oder YYYY-MM-DDTHH:MM (Schweizer Zeit), leer = ohne Frist' }, note: { type: 'string' } }, ['title']],
    ]
    const params = (p: Record<string, unknown>, r: string[]) => ({ type: 'object', properties: p, required: r })

    const readIds = new Set<string>()
    const clientCards = new Map<string, Record<string, unknown>>()
    const runTool = async (name: string, args: any): Promise<unknown> => {
      if (name === 'my_day') {
        if (!okDate(args.date)) return { error: 'datum_ungueltig', erlaubt: `${zDay(-60)} bis ${zDay(60)}` }
        emit({ step: 'calendar', detail: args.date })
        const d = await phorestCall({ action: 'my_day', date: args.date })
        if (!d.ok) return { error: 'phorest_nicht_erreichbar' }
        if (!d.mapped) return { error: 'keiner_phorest_spalte_zugeordnet' }
        return { datum: d.date, schicht: d.shifts, termine: (d.appointments ?? []).map((a: any) => ({ von: a.start, bis: a.end, kundin: a.client, behandlung: a.service, client_id: a.client_id })) }
      }
      if (name === 'my_week') {
        emit({ step: 'week' })
        const w = await phorestCall({ action: 'staff_week' })
        return w.ok ? (w.mapped ? { arbeitstage: w.days } : { error: 'keiner_phorest_spalte_zugeordnet' }) : { error: 'phorest_nicht_erreichbar' }
      }
      if (name === 'studio_day') {
        if (!okDate(args.date)) return { error: 'datum_ungueltig' }
        const branch = me.app_role === 'buero' ? String(args.branch ?? (me.branch_id === 'buero' ? 'basel-1' : me.branch_id)) : me.branch_id
        emit({ step: 'studio', detail: args.date })
        const d = await phorestCall({ action: 'branch_day', branch, date: args.date })
        if (!d.ok) return { error: d.error ?? 'phorest_nicht_erreichbar' }
        const who = new Map((d.columns ?? []).map((c: any) => [c.staff_id, c.name]))
        return { datum: d.date, studio: branches.find((b) => b.id === branch)?.name ?? branch,
          team: (d.columns ?? []).map((c: any) => ({ name: c.name, schicht: c.shift ? `${c.shift.start}–${c.shift.end}` : 'frei', frei: c.free ?? [] })),
          termine: (d.appointments ?? []).map((a: any) => ({ bei: who.get(a.staff_id) ?? '', von: a.start, bis: a.end, kundin: a.client, behandlung: a.service, client_id: a.client_id ?? null })) }
      }
      if (name === 'client_history') {
        emit({ step: 'client', detail: args.client_id ? '' : String(args.query ?? '') })
        const hist = async (id: string) => {
          const h = await phorestCall({ action: 'client_history', client_id: id, months: 12 })
          if (!h.ok) return { error: 'phorest_nicht_erreichbar' }
          const visits = (h.visits ?? []) as any[], done = visits.filter((v) => !v.cancelled)
          // Kundenkarte für die App (zeigt Marc nur, wenn er client_card setzt)
          clientCards.set(id, {
            client_id: id, name: h.client?.name ?? '', since: h.client?.since ?? '', last_visit: h.client?.last_visit ?? '', preferred: h.client?.preferred ?? '',
            email: h.client?.email ?? '', phone: h.client?.phone ?? '', contact_hidden: !!h.client?.contact_hidden, visits: done.length, cancelled: visits.length - done.length,
            recent: done.slice(0, 3).map((v) => ({ date: v.date, time: v.time, service: v.service, staff: v.staff, branch: v.branch })),
            upcoming: (h.upcoming ?? []).slice(0, 2).map((v: any) => ({ date: v.date, time: v.time, service: v.service, staff: v.staff, branch: v.branch })),
            notes: [...(h.client?.notes ? [{ date: '', text: String(h.client.notes).slice(0, 300) }] : []), ...visits.filter((v) => v.notes).slice(0, 3).map((v) => ({ date: v.date, text: String(v.notes).slice(0, 240) }))],
          })
          return { client_id: id, kundin: h.client, besuche: visits.slice(0, 60), kommende_termine: h.upcoming ?? [] }
        }
        if (args.client_id) return await hist(String(args.client_id))
        const s = await phorestCall({ action: 'client_search', q: String(args.query ?? '') })
        if (!s.ok) return { error: s.error === 'too_short' ? 'suchbegriff_zu_kurz' : 'phorest_nicht_erreichbar' }
        if (s.clients.length === 0) return { error: 'keine_kundin_gefunden' }
        if (s.clients.length === 1) return await hist(s.clients[0].client_id)
        return { auswahl: s.clients.map((c: any) => ({ client_id: c.client_id, name: c.name, seit: c.since, tel_endet_auf: c.phone_tail })) }
      }
      if (name === 'services') {
        emit({ step: 'services', detail: String(args.q ?? '') })
        const r = await phorestCall({ action: 'services', q: args.q ?? '', branch: me.app_role === 'buero' ? args.branch : undefined })
        return r.ok ? { studio: r.branch, anzahl: r.total, behandlungen: r.services } : { error: 'phorest_nicht_erreichbar' }
      }
      if (name === 'phorest_read') {
        if (!lead) return { error: 'nicht_erlaubt' }
        emit({ step: 'phorest' })
        const r = await phorestCall({ action: 'read', path: String(args.path ?? '') })
        return r.ok ? { gekuerzt: r.truncated, daten: r.body } : { error: r.error ?? 'phorest_nicht_erreichbar', erlaubt: r.allowed }
      }
      if (name === 'search_knowledge') {
        emit({ step: 'search', detail: String(args.q ?? '') })
        return rank(String(args.q ?? ''), articles).slice(0, 5).map((r) => ({ id: r.a.id, titel: r.a.title, kategorie: r.a.category, anfang: r.a.body.slice(0, 600) }))
      }
      if (name === 'read_article') {
        const id = String(args.id ?? '')
        emit({ step: 'article', detail: byId.get(id) ?? '' })
        const { data } = byId.has(id) ? await db.from('wiki_articles').select('id, title, category, body').eq('id', id).eq('published', true).maybeSingle() : { data: null }
        if (data) readIds.add(data.id)
        return data ? { id: data.id, titel: data.title, kategorie: data.category, text: String(data.body ?? '').slice(0, 7000) } : { error: 'nicht_gefunden' }
      }
      if (name === 'news') {
        emit({ step: 'news' })
        if (args.id) {
          const { data } = await db.from('news').select('id, title, teaser, body, tag, must_read, publish_at, author_name').eq('id', String(args.id)).maybeSingle()
          return data ? { ...data, bestaetigt: confirmed.has(data.id) } : { error: 'nicht_gefunden' }
        }
        return news.map((n: any) => ({ id: n.id, titel: n.title, kurz: n.teaser, pflicht: n.must_read, datum: n.publish_at.slice(0, 10), bestaetigt: confirmed.has(n.id) }))
      }
      if (name === 'onboarding_status') {
        emit({ step: 'onboarding' })
        const { data: all } = await db.from('onboarding_steps').select('id, title, minutes, article_id, sort, proposed, is_sample').order('sort')
        // Schritte ohne hinterlegten Artikel bekommen den am besten passenden Wissensartikel (nach Titel)
        return (all ?? []).filter((x: any) => !x.proposed && keep(x)).map((x: any) => {
          const guess = x.article_id ? null : rank(x.title, articles)[0]?.a
          return { step_id: x.id, titel: x.title, minuten: x.minutes, artikel_id: x.article_id ?? guess?.id ?? null, artikel_geschaetzt: !x.article_id && !!guess, erledigt: obDone.has(x.id) }
        })
      }
      if (name === 'add_todo') {
        emit({ step: 'todo' })
        const due = String(args.due ?? '').trim()
        let due_at: string | null = null
        if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(due)) {
          // Schweizer Ortszeit → UTC (Sommer-/Winterzeit über den Offset zu diesem Zeitpunkt)
          const local = due.length === 10 ? `${due}T23:59` : due
          const guess = new Date(local + ':00Z')
          const off = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Zurich' })).getTime() - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
          due_at = new Date(guess.getTime() - off).toISOString()
        }
        const { error } = await db.from('todos').insert({ title: String(args.title ?? '').slice(0, 200), note: String(args.note ?? '').slice(0, 1000), due_at, assignee_id: me.id, created_by: me.id, created_by_name: `${me.first_name} ${String(me.last_name ?? '').slice(0, 1)}.` })
        return error ? { error: 'nicht_gespeichert' } : { ok: true, frist: due_at }
      }
      if (name === 'mark_step_done') {
        // Bestanden? Richtige Antworten seit dem letzten Aufdecken in diesem Chat zählen, plus die eben bewertete
        if (chat) {
          const { data: rows } = await db.from('benni_messages').select('role, data').eq('chat_id', chat.id).order('created_at')
          let ok = 0
          for (const r of (rows ?? []) as any[]) if (r.role === 'assistant') { if (r.data?.reveal) ok = 0; else if (r.data?.graded === true) ok++ }
          if (args.letzte_richtig === true) ok++
          if (ok < qMin) return { error: 'nicht_bestanden', richtig: ok, noetig: qMin, fragen: qN }
        }
        emit({ step: 'step_done' })
        const { error } = await db.from('onboarding_progress').insert({ step_id: String(args.step_id ?? ''), employee_id: me.id })
        return error && !/duplicate/.test(error.message) ? { error: 'nicht_gespeichert' } : { ok: true }
      }
      return { error: 'unbekanntes_werkzeug' }
    }

    const links = new Map<string, string>()
    const finish = async (raw: string) => {
      emit({ step: 'write' })
      // Mit Websuche gibt es keinen strengen JSON-Modus: das Objekt aus dem Text lösen
      let o: any = { text: raw }
      try { o = JSON.parse(raw || '{}') } catch {
        const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
        if (a >= 0 && b > a) try { o = JSON.parse(raw.slice(a, b + 1)) } catch { /* bleibt Text */ }
      }
      const str = (x: unknown, n: number) => String(x ?? '').trim().slice(0, n)
      const cards = (Array.isArray(o.cards) ? o.cards : []).slice(0, 4).map((c: any) => ({ title: str(c?.title, 120), body: str(c?.body, 1200) })).filter((c: any) => c.body)
      // Antwortmöglichkeiten mischen: Modelle setzen die richtige gern an den Anfang
      const quiz = o.quiz?.question ? { question: str(o.quiz.question, 400), options: (Array.isArray(o.quiz.options) ? o.quiz.options : []).slice(0, 4).map((x: unknown) => str(x, 160)).filter(Boolean).sort(() => Math.random() - 0.5) } : null
      // Karte gewünscht, aber Historie nicht geholt: jetzt holen
      if (typeof o.client_card === 'string' && o.client_card && !clientCards.has(o.client_card)) await runTool('client_history', { client_id: o.client_card }).catch(() => null)
      const card = typeof o.client_card === 'string' ? clientCards.get(o.client_card) ?? (clientCards.size === 1 ? [...clientCards.values()][0] : null) : null
      const answer = {
        text: String(o.text ?? '').trim(),
        sources: [...new Set([...(o.source_ids ?? []), ...readIds])].filter((id: string) => byId.has(id)).map((id: string) => ({ id, title: byId.get(id)! })),
        ...(o.ticket?.title ? { ticket: { kind: o.ticket.kind === 'Idee' ? 'Idee' : 'Meldung', title: String(o.ticket.title).slice(0, 200) } } : {}),
        ...(card ? { card } : {}),
        ...(cards.length ? { cards } : {}),
        ...(quiz ? { quiz } : {}),
        ...(Array.isArray(o.choices) && o.choices.length && !quiz?.options.length ? { choices: o.choices.slice(0, 3).map((x: unknown) => str(x, 40)).filter(Boolean) } : {}),
        ...(o.reveal === true ? { reveal: true } : {}),
        ...(typeof o.graded === 'boolean' ? { graded: o.graded } : {}),
        ...(links.size ? { links: [...links].slice(0, 5).map(([url, title]) => ({ url, title })) } : {}),
      }
      return { ok: true, mode: 'ki', ...answer, model: model }
    }
    const past = history.slice(-12).map((h: any) => ({ role: h.me ? 'user' : 'assistant', content: String(h.t ?? '').slice(0, 2000) }))
    const { id: model, effort } = MODELS[tier]
    const ai = async (path: string, payload: Record<string, unknown>) => {
      const r = await fetch(`https://api.openai.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(privateRequest(payload)), signal: AbortSignal.timeout(150000) })
      if (!r.ok) throw new Error(`openai_${r.status}: ${(await r.text()).slice(0, 300)}`)
      return await r.json()
    }
    const run = async (calls: { id: string; name: string; args: string }[]) => Promise.all(calls.map(async (c) => {
      let args: any = {}; try { args = JSON.parse(c.args || '{}') } catch { /* leer */ }
      return { id: c.id, output: JSON.stringify(await runTool(c.name, args)).slice(0, 14000) }
    }))
    // Frage samt Anhängen: Bilder direkt, PDF und Office-Dateien als Datei, ausgelesener Text als Text
    const userParts = [{ type: 'input_text', text: q }, ...files.map((f) => f.text != null
      ? { type: 'input_text', text: `Datei „${f.name}“:\n${f.text}` }
      : f.mime.startsWith('image/') ? { type: 'input_image', image_url: `data:${f.mime};base64,${f.data}`, detail: 'auto' }
      : { type: 'input_file', filename: f.name, file_data: `data:${f.mime};base64,${f.data}` })]

    // Responses-API: Werkzeuge mit Nachdenken (macht Marc deutlich klüger)
    const viaResponses = async () => {
      let webTool = 'web_search'
      const tools = () => [...defs.map(([name, description, p, r]) => ({ type: 'function', name, description, parameters: params(p, r) })), ...(web ? [{ type: webTool }] : [])]
      const scope = `${me.id}|${me.app_role}|${me.branch_id}`
      let previous: Context | null = null
      if (contextRef) {
        const { data } = await db.storage.from(CONTEXT_BUCKET).download(contextRef)
        if (data) try { previous = readContext(JSON.parse(await data.text()), model, scope) } catch { /* text history remains */ }
      }
      const turn: Item[] = [...(previous ? [] : past), { role: 'user', content: userParts }]
      let input: Item[] = [{ role: 'developer', content: 'Antworte am Ende als JSON-Objekt wie in den Anweisungen beschrieben.' }, ...(previous?.turns.flat() ?? []), ...turn]
      for (let round = 0; round < 10; round++) {
        let res: any
        try {
          res = await ai('responses', { model, instructions: sys, input, tools: tools(), reasoning: { effort }, ...(web ? {} : { text: { format: { type: 'json_object' } } }) })
        } catch (e) {
          const m = String(e)
          if (web && webTool === 'web_search' && /web_search/.test(m)) { webTool = 'web_search_preview'; round--; continue }
          throw e
        }
        for (const w of (res.output ?? []).filter((o: any) => o.type === 'web_search_call')) emit({ step: 'web', detail: String(w.action?.query ?? '') })
        const calls = (res.output ?? []).filter((o: any) => o.type === 'function_call')
        if (calls.length) {
          const results = (await run(calls.map((c: any) => ({ id: c.call_id, name: c.name, args: c.arguments })))).map((x) => ({ type: 'function_call_output', call_id: x.id, output: x.output }))
          input = appendToolRound(input, res.output ?? [], results)
          turn.push(...(res.output ?? []), ...results)
          continue
        }
        const parts = (res.output ?? []).filter((o: any) => o.type === 'message').flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text')
        for (const a of parts.flatMap((c: any) => c.annotations ?? [])) if (a.type === 'url_citation' && a.url && !links.has(a.url)) links.set(a.url, String(a.title ?? new URL(a.url).hostname).slice(0, 120))
        turn.push(...(res.output ?? []))
        if (chat) try { newContext = saveContext(previous, model, scope, turn) } catch { contextSaved = false }
        return finish(parts.map((c: any) => c.text).join(''))
      }
      throw new Error('too_many_rounds')
    }
    // Rückfall: chat/completions (Werkzeuge nur ohne Nachdenken, Anhänge nur Bilder und Text)
    const viaChat = async () => {
      const tools = defs.map(([name, description, p, r]) => ({ type: 'function', function: { name, description, parameters: params(p, r) } }))
      const content = userParts.map((p: any) => p.type === 'input_image' ? { type: 'image_url', image_url: { url: p.image_url } } : p.type === 'input_file' ? { type: 'text', text: `(Datei „${p.filename}“ konnte hier nicht gelesen werden)` } : { type: 'text', text: p.text })
      const msgs: any[] = [{ role: 'system', content: sys + (web ? '\n\nDie Websuche ist gerade nicht verfügbar. Sag ehrlich, dass du im Web nicht nachsehen konntest, und rate nichts.' : '') }, ...past, { role: 'user', content }]
      for (let round = 0; round < 8; round++) {
        const m = (await ai('chat/completions', { model, messages: msgs, tools, reasoning_effort: 'none', response_format: { type: 'json_object' } })).choices?.[0]?.message
        if (m?.tool_calls?.length) {
          msgs.push(m)
          for (const x of await run(m.tool_calls.map((c: any) => ({ id: c.id, name: c.function?.name, args: c.function?.arguments })))) msgs.push({ role: 'tool', tool_call_id: x.id, content: x.output })
          continue
        }
        return finish(m?.content ?? '')
      }
      throw new Error('too_many_rounds')
    }
    try { return await viaResponses() } catch (e1) {
      try { return { ...(await viaChat()), reason: `responses: ${String(e1).slice(0, 200)}` } } catch (e2) {
        // Grund mitgeben (zeigt die App nicht an), damit Fehler nachvollziehbar sind
        return { ok: true, mode: 'wissen', reason: `${String(e1).slice(0, 200)} | ${String(e2).slice(0, 200)}`, ...fallback(q, ranked.map((r) => r.a), await today(), me) }
      }
    }
  }

  // Titel für neue Chats: kleines, schnelles Modell, läuft parallel zur Antwort
  const titleJob = chat && !chat.title ? (async () => {
    const plain = q.replace(/\s+/g, ' ').split(' ').slice(0, 6).join(' ').slice(0, 60)
    let title = plain
    const key = Deno.env.get('OPENAI_API_KEY')
    if (key) try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ store: false, model: Deno.env.get('TITLE_MODEL') ?? 'gpt-5.4-nano', reasoning_effort: 'none', messages: [
          { role: 'system', content: 'Gib diesem Gespräch einen kurzen Titel: 2 bis 5 Wörter, in der Sprache der Nachricht und mit deren normaler Rechtschreibung (auf Deutsch also nur Nomen gross, z. B. „Onboarding weiterlernen“), ohne Anführungszeichen und ohne Punkt am Ende. Antworte nur mit dem Titel.' },
          { role: 'user', content: q.slice(0, 800) + (files.length ? ` [Anhang: ${files.map((f) => f.name).join(', ')}]` : '') },
        ] }),
      })
      const t = String((await r.json())?.choices?.[0]?.message?.content ?? '').replace(/^["„“'»«]+|["„“'»«.]+$/g, '').trim()
      if (r.ok && t) title = t.slice(0, 60)
    } catch { /* Rückfall: Anfang der Frage */ }
    await db.from('benni_chats').update({ title }).eq('id', chat!.id)
    emit({ title })
    return title
  })() : Promise.resolve(null)

  // Antwort im Chat speichern; liefert die Nachrichten-ID für die App
  const save = async (r: Record<string, any>) => {
    if (!chat) return {}
    let text = r.ok && r.text ? String(r.text) : 'Ich bin gerade nicht erreichbar. Bitte versuche es gleich noch einmal.'
    const data: Record<string, unknown> = {}
    for (const k of ['sources', 'ticket', 'card', 'cards', 'quiz', 'choices', 'reveal', 'graded', 'links', 'model']) if (r[k] != null && !(Array.isArray(r[k]) && !r[k].length)) data[k] = r[k]
    let contextPath: string | null = null
    if (newContext) {
      const path = `${me.id}/${chat.id}/${crypto.randomUUID()}.json`
      const { error } = await db.storage.from(CONTEXT_BUCKET).upload(path, new Blob([newContext], { type: 'application/json' }), { contentType: 'application/json', upsert: false })
      if (!error) { contextPath = path; data.context_path = path }
      else contextSaved = false
    }
    if (!contextSaved) {
      const note = me.lang === 'EN' ? 'I could not save the file context. Please attach the file again for follow-up questions.'
        : me.lang === 'FR' ? 'Je n’ai pas pu enregistrer le contexte du fichier. Merci de le joindre à nouveau pour les questions suivantes.'
        : 'Ich konnte den Dateikontext nicht speichern. Bitte hänge die Datei bei Rückfragen erneut an.'
      text += `\n\n${note}`
      r.text = text
    }
    const { data: row, error } = await db.from('benni_messages').insert({ chat_id: chat.id, role: 'assistant', text, data }).select('id, created_at').single()
    if (error && contextPath) await db.storage.from(CONTEXT_BUCKET).remove([contextPath])
    if (!error && contextPath && contextRef) await db.storage.from(CONTEXT_BUCKET).remove([contextRef])
    if (!contextSaved) r.context_saved = false
    await db.from('benni_chats').update({ updated_at: new Date().toISOString() }).eq('id', chat.id)
    return { message_id: row?.id ?? null, chat_id: chat.id }
  }
  const finishAll = async () => {
    let r: Record<string, any>
    try { r = await work() } catch (e) { r = { ok: false, error: String(e).slice(0, 200) } }
    const extra = await save(r).catch(() => ({}))
    const title = await titleJob.catch(() => null)
    return { ...r, ...extra, ...(title ? { title } : {}) }
  }

  if (stream) {
    return new Response(new ReadableStream<Uint8Array>({
      start(c) {
        out = c
        finishAll().then((r) => emit({ done: true, ...r })).finally(() => { try { c.close() } catch { /* zu */ } })
      },
    }), { headers: { ...cors, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' } })
  }
  return json(await finishAll())
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
