// Benni, der Assistent im TeamHub (BLTH-25). Kennt die Person, die fragt (Rolle, Studio, Lage im
// TeamHub), holt sich Termine, Kundinnen, Kolleginnen, Behandlungen und mehr selbst aus Phorest,
// beantwortet Fachfragen nur aus dem freigegebenen Wissen und schlägt bei nicht lösbaren Anliegen
// eine Meldung vor. Schreibt selbst nur den eigenen Onboarding-Fortschritt.
// Mit {stream: true} kommen Arbeitsschritte als NDJSON ({step, detail}), am Ende {done: true, …}.
// Secrets: OPENAI_API_KEY (optional; ohne ihn antwortet Benni nur aus dem Wissen),
//          ASSISTANT_MODEL, ASSISTANT_REASONING (optional).
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
const zDay = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(Date.now() + n * 864e5))
const isoDow = (day: string) => ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1
const ROLE = { mitarbeiterin: 'Mitarbeiterin', filialleitung: 'Filialleitung', buero: 'Büro' } as Record<string, string>

// Wo was in der App liegt, damit Benni Wege erklären kann
const APP_GUIDE = `Handy-App (alle Rollen), unten fünf Reiter: Heute, Aufgaben, Benni, Wissen, Menü.
- Heute: Schicht und Anzahl Termine aus Phorest, Karte „Bitte lesen und bestätigen“ für Pflicht-News, Tagesaufgaben mit Fortschritt, „Mein Tag“ (eigene Kundentermine), News. Filialleitung zusätzlich „Heute im Studio“. Oben rechts die Glocke mit allem, was neu oder offen ist.
- Aufgaben: Tagesaufgaben des eigenen Studios, gruppiert nach Listen (Vorlagen vom Büro, z. B. Öffnung, Mittag, Schliessung, Wochenputz). Abhaken mit „Erledigt“, bei manchen mit Foto als Nachweis. Name und Uhrzeit werden gespeichert.
- Wissen: Suche, Onboarding für Neue („Mit Benni lernen“), alle Artikel des bisherigen Wikis. Unter manchen Artikeln und Pflicht-News ein Quiz (bestanden ab 80 %).
- Menü: eigenes Profil (Arbeitszeiten der Woche, Aushilfe-Tage eintragen, Sprache DE/EN/FR, Mitteilungen einschalten), Kundentermine (eigenes Studio live aus Phorest, Büro alle), Kundenhistorie (Besuche und Notizen einer Kundin), News, Kalender (Schulungen und Events, „Ich komme“ / „Ich komme nicht“), Team (Kolleginnen, Skills, anrufen), Melden & Ideen (Meldung mit Foto oder Video, Ideen unterstützen, kommentieren), Posteingang (Webmail), Zeit & Ferien (Timebutler), Verbindungen.
- Pflicht-News gelten erst nach dem Öffnen als bestätigt, mit Quiz erst nach bestandenem Quiz.
- Ferien beantragen und Zeiterfassung laufen in Timebutler (Menü → Zeit & Ferien), nicht im TeamHub.
Backoffice am Desktop (Filialleitung für das eigene Studio, Büro für alle): Übersicht, Kundentermine, News (nur Büro, mit Benni-Entwurf), Aufgaben (Vorlagen anlegen nur Büro), Meldungen & Ideen, Schulungen & Events, Aushilfe (wer kann an einem Tag einspringen), Lernen (Quiz und Nachweise), Team & Skills, Studios und Wissen (beide nur Büro). Am Handy gibt es kein Backoffice.`

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
- client?firstName=…&lastName=… | client?email=… | client?phone=41… → Kundensuche · client/{id} → Profil (clientSince, lastVisit, preferredStaffId; ein Notizfeld gibt es nicht)
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
  const { message = '', history = [], stream = false } = body
  const q = String(message).slice(0, 2000)
  if (!q.trim()) return json({ ok: false, error: 'empty' }, 400)

  // Arbeitsschritte an die App (nur bei stream)
  const enc = new TextEncoder()
  let out: ReadableStreamDefaultController<Uint8Array> | null = null
  const emit = (o: Record<string, unknown>) => { try { out?.enqueue(enc.encode(JSON.stringify(o) + '\n')) } catch { /* Verbindung zu */ } }

  const phorestCall = (b: unknown) => fetch(`${url}/functions/v1/phorest`, { method: 'POST', headers: { Authorization: authz, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ ok: false }))

  const work = async (): Promise<Record<string, unknown>> => {
    // Nur freigegebene Artikel, die diese Person per RLS sehen darf.
    const { data: arts } = await db.from('wiki_articles').select('id, category, title, body, tags').eq('published', true)
    const articles = (arts ?? []) as (Article & { tags?: string[] })[]
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
    const [flagsR, branchR, newsR, readsR, evR, regR, tkR, obR, obDoneR, sbR, tplR, itemR, compR] = await Promise.all([
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
    ])
    const demo = (flagsR.data as any)?.demo_data !== false
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
      (t.repeat === 'daily' || (t.repeat === 'weekly' && t.weekday === isoDow(day0)) || (t.repeat === 'monthly' && t.monthday === Number(day0.slice(8, 10)))))
    const items = (itemR.data ?? []).filter((i: any) => tpls.some((t: any) => t.id === i.template_id))
    const doneItems = new Map((compR.data ?? []).filter((c: any) => c.branch_id === myBranch).map((c: any) => [c.item_id, c]))
    const openItems = items.filter((i: any) => !doneItems.has(i.id)).sort((a: any, b: any) => String(a.due_time ?? '99').localeCompare(String(b.due_time ?? '99')))
    const steps = (obR.data ?? []).filter((s: any) => !s.proposed && keep(s))
    const obDone = new Set((obDoneR.data ?? []).map((x: any) => x.step_id))

    const lage = [
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
      'Du bist Benni, der Assistent im TeamHub der Beautylounge AG, einer Gruppe von Kosmetikstudios in der Region Basel. Du hilfst dem Team im Alltag: Termine, Kundinnen, Kolleginnen und Behandlungen aus Phorest (dem Kassen- und Buchungssystem), Wissen aus dem internen Wiki, Aufgaben, News, Schulungen und Meldungen.',
      `\n## Wer mit dir spricht\n${me.first_name} ${me.last_name}, ${me.job_title}, Rolle ${ROLE[me.app_role] ?? me.app_role}, Studio ${studio}.${(me.skills ?? []).length ? ` Skills: ${me.skills.join(', ')}.` : ''}`,
      `Heute ist ${dateLine} (${day0}), es ist ${timeLine} Uhr in der Schweiz.`,
      `\n## Lage im TeamHub (jetzt)\n${lage}`,
      '\n## So arbeitest du',
      '- Denk mit: Überleg, was die Person eigentlich wissen will, und hol es dir selbst mit den Werkzeugen, bevor du antwortest. Rückfragen nur, wenn es wirklich mehrdeutig ist (z. B. mehrere Kundinnen gleichen Namens).',
      '- Sag nie, dass du etwas nicht einsehen kannst, bevor du das passende Werkzeug versucht hast. Klappt ein Werkzeug nicht, sag ehrlich, was fehlt.',
      '- Phorest ist die Quelle für Termine, Schichten, Kundinnen, freie Zeiten, Behandlungen, Preise und Dauer. Eigener Tag: my_day. Eigene Woche: my_week. Wer arbeitet, wer hat wann frei, alle Termine eines Studios: studio_day. Kundin (Historie, letzte Besuche, nächster Termin, worauf achten): client_history. Behandlungen, Preis, Dauer, online buchbar: services.' + (lead ? ' Alles andere aus Phorest (Produkte und Lager, Bewertungen, Gutscheine, Pakete, Räume, Geräte, wer welche Behandlung macht): phorest_read.' : ''),
      '- Zeitangaben wie heute, morgen, übermorgen, Freitag, nächste Woche oder „um 14 Uhr“ rechnest du selbst in ein Datum um. Bei einer Uhrzeit nennst du den Termin, der dann beginnt oder läuft.',
      '- „Worauf muss ich bei ihr achten“ oder „Was hatte sie zuletzt“ zu einer Kundin aus einem Plan: client_history mit der client_id aus my_day oder studio_day. Fehlt sie bei einer Anschlussfrage, hol den Tag erneut. Frag dafür nicht nach Name, E-Mail oder Telefon.',
      '- Fachfragen (Behandlungen, Hygiene, Abläufe, Geräte, Regeln) beantwortest du nur aus dem Wissen: zuerst die Vorauswahl unten, sonst search_knowledge und read_article. Steht es nicht drin, sag das ehrlich und erfinde nichts.',
      '- Fragen zu News: news. Wege in der App erklärst du mit dem App-Leitfaden unten.',
      `- Rechte: ${me.app_role === 'mitarbeiterin' ? 'Du siehst Termine nur für das eigene Studio und nur den eigenen Dienstplan im Detail.' : me.app_role === 'filialleitung' ? `Du siehst Phorest für das eigene Studio (${studio}).` : 'Du siehst Phorest für alle Studios.'} Telefonnummern, E-Mail-Adressen und Adressen von Kundinnen gibst du nie weiter.`,
      '- Lernen: Will jemand lernen oder mit dem Onboarding weitermachen, nutze onboarding_status, nimm den ersten offenen Schritt, lies den Artikel mit read_article und erkläre ihn in einem kurzen Häppchen (höchstens 6 Sätze). Stelle danach eine einfache Kontrollfrage. Ist die Antwort im Kern richtig, lobe kurz, markiere den Schritt mit mark_step_done und biete den nächsten an.',
      '- Kannst du ein Anliegen nicht lösen (etwas ist kaputt, Personal- oder Betriebsanliegen), schlag eine Meldung vor. Verbesserungsvorschläge sind eine Idee.',
      `- Studios: ${studios.map((b: any) => `${b.name} (id ${b.id})`).join(', ')}.`,
      '\n## Antwortstil',
      'Wie eine erfahrene, herzliche Kollegin: kurz, konkret, per du (klein geschrieben), Schweizer Hochdeutsch (ss statt ß), in der Sprache der Frage (Deutsch, Englisch oder Französisch). Erst die Antwort, dann höchstens ein hilfreicher nächster Schritt. Mehrere Punkte als Liste mit „- “, wichtige Wörter sparsam **fett**. Keine Floskeln, keine Überschriften.',
      `\n## App-Leitfaden\n${APP_GUIDE}`,
      '\n## Ausgabe',
      'Gib am Ende ausschliesslich JSON zurück: {"text": string, "source_ids": string[], "ticket": null | {"kind": "Meldung"|"Idee", "title": string}}. source_ids sind die IDs der Wissensartikel, auf die sich die Antwort stützt.',
      `\n## Passende Wissensartikel (Vorauswahl)\n${context || '(keine passenden Artikel)'}`,
    ].join('\n')

    const okDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= zDay(-60) && d <= zDay(60)
    const phIds = studios.filter((b: any) => b.phorest_branch_id && (me.app_role === 'buero' || b.id === me.branch_id)).map((b: any) => `${b.name} = ${b.phorest_branch_id}`).join(', ')
    const defs: [string, string, Record<string, unknown>, string[]][] = [
      ['my_day', 'Eigene Schicht und Kundentermine aus Phorest für einen Tag (Uhrzeit, Kundin, Behandlung, client_id).', { date: { type: 'string', description: 'YYYY-MM-DD' } }, ['date']],
      ['my_week', 'Eigene Arbeitszeiten der nächsten sieben Tage aus Phorest.', {}, []],
      ['studio_day', 'Ein Tag im Studio aus Phorest: wer arbeitet (Schicht), freie Zeiten je Person und alle Termine (Person, Uhrzeit, Kundin, Behandlung, client_id).' + (me.app_role === 'buero' ? '' : ' Nur das eigene Studio.'), { date: { type: 'string', description: 'YYYY-MM-DD' }, branch: { type: 'string', description: 'Studio-id, Standard: eigenes Studio' } }, ['date']],
      ['client_history', 'Kundin in Phorest: Besuche und Termin-Notizen der letzten 12 Monate, kommende Termine, Kundin seit, bevorzugte Mitarbeiterin. Bei mehreren Treffern kommt eine Auswahlliste.', { query: { type: 'string', description: 'Name, E-Mail oder Telefon' }, client_id: { type: 'string', description: 'falls bekannt (aus my_day, studio_day oder einer Auswahlliste)' } }, []],
      ['services', 'Behandlungskatalog aus Phorest: Name, Dauer in Minuten, Preis in CHF, Kategorie, online buchbar.', { q: { type: 'string', description: 'Suchwörter, z. B. „Microblading“ oder „Pediküre“' }, branch: { type: 'string', description: 'Studio-id, Standard: eigenes Studio' } }, []],
      ...(lead ? [['phorest_read', phorestGuide(phIds), { path: { type: 'string', description: 'z. B. branch/{id}/product?size=300' } }, ['path']] as [string, string, Record<string, unknown>, string[]]] : []),
      ['search_knowledge', 'Sucht im internen Wissen (Wiki) und liefert die passendsten Artikel mit Anfang.', { q: { type: 'string' } }, ['q']],
      ['read_article', 'Liest einen Wissensartikel ganz (nur freigegebene, die diese Person sehen darf).', { id: { type: 'string' } }, ['id']],
      ['news', 'Liest eine News ganz (mit id) oder listet die aktuellen News (ohne id).', { id: { type: 'string' } }, []],
      ['onboarding_status', 'Onboarding-Schritte dieser Person mit erledigt/offen und Artikel-ID.', {}, []],
      ['mark_step_done', 'Markiert einen eigenen Onboarding-Schritt als erledigt, nachdem die Kontrollfrage richtig beantwortet wurde.', { step_id: { type: 'string' } }, ['step_id']],
    ]
    const params = (p: Record<string, unknown>, r: string[]) => ({ type: 'object', properties: p, required: r })

    const readIds = new Set<string>()
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
          return { kundin: h.client, besuche: (h.visits ?? []).slice(0, 60), kommende_termine: h.upcoming ?? [] }
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
        const { data } = await db.from('wiki_articles').select('id, title, category, body').eq('id', id).eq('published', true).maybeSingle()
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
      if (name === 'mark_step_done') {
        const { error } = await db.from('onboarding_progress').insert({ step_id: String(args.step_id ?? ''), employee_id: me.id })
        return error && !/duplicate/.test(error.message) ? { error: 'nicht_gespeichert' } : { ok: true }
      }
      return { error: 'unbekanntes_werkzeug' }
    }

    const finish = (raw: string) => {
      emit({ step: 'write' })
      let o: any = {}
      try { o = JSON.parse(raw || '{}') } catch { o = { text: raw } }
      const answer: Answer = {
        text: String(o.text ?? '').trim(),
        sources: [...new Set([...(o.source_ids ?? []), ...readIds])].filter((id: string) => byId.has(id)).map((id: string) => ({ id, title: byId.get(id)! })),
        ...(o.ticket?.title ? { ticket: { kind: o.ticket.kind === 'Idee' ? 'Idee' : 'Meldung', title: String(o.ticket.title).slice(0, 200) } } : {}),
      }
      return { ok: true, mode: 'ki', ...answer }
    }
    const past = Array.isArray(history) ? history.slice(-12).map((h: any) => ({ role: h.me ? 'user' : 'assistant', content: String(h.t ?? '').slice(0, 2000) })) : []
    const model = Deno.env.get('ASSISTANT_MODEL') ?? 'gpt-5.6-sol'
    const ai = async (path: string, payload: unknown) => {
      const r = await fetch(`https://api.openai.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(90000) })
      if (!r.ok) throw new Error(`openai_${r.status}: ${(await r.text()).slice(0, 300)}`)
      return await r.json()
    }
    const run = async (calls: { id: string; name: string; args: string }[]) => Promise.all(calls.map(async (c) => {
      let args: any = {}; try { args = JSON.parse(c.args || '{}') } catch { /* leer */ }
      return { id: c.id, output: JSON.stringify(await runTool(c.name, args)).slice(0, 14000) }
    }))

    // Responses-API: Werkzeuge mit Nachdenken (macht Benni deutlich klüger)
    const viaResponses = async () => {
      const tools = defs.map(([name, description, p, r]) => ({ type: 'function', name, description, parameters: params(p, r) }))
      let input: any[] = [{ role: 'developer', content: 'Antworte am Ende als JSON-Objekt wie in den Anweisungen beschrieben.' }, ...past, { role: 'user', content: q }], prev: string | undefined
      for (let round = 0; round < 8; round++) {
        const res = await ai('responses', { model, instructions: sys, input, tools, reasoning: { effort: Deno.env.get('ASSISTANT_REASONING') ?? 'low' }, text: { format: { type: 'json_object' } }, ...(prev ? { previous_response_id: prev } : {}) })
        prev = res.id
        const calls = (res.output ?? []).filter((o: any) => o.type === 'function_call')
        if (calls.length) {
          input = (await run(calls.map((c: any) => ({ id: c.call_id, name: c.name, args: c.arguments })))).map((x) => ({ type: 'function_call_output', call_id: x.id, output: x.output }))
          continue
        }
        return finish((res.output ?? []).filter((o: any) => o.type === 'message').flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join(''))
      }
      throw new Error('too_many_rounds')
    }
    // Rückfall: chat/completions (Werkzeuge nur ohne Nachdenken)
    const viaChat = async () => {
      const tools = defs.map(([name, description, p, r]) => ({ type: 'function', function: { name, description, parameters: params(p, r) } }))
      const msgs: any[] = [{ role: 'system', content: sys }, ...past, { role: 'user', content: q }]
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

  if (stream) {
    return new Response(new ReadableStream<Uint8Array>({
      start(c) {
        out = c
        work().then((r) => emit({ done: true, ...r })).catch((e) => emit({ done: true, ok: false, error: String(e).slice(0, 200) })).finally(() => { try { c.close() } catch { /* zu */ } })
      },
    }), { headers: { ...cors, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' } })
  }
  return json(await work())
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
