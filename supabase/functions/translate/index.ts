// Automatische Übersetzung der TeamHub-Inhalte DE → EN, FR (Projektplan: „Übersetzung automatisch“).
//   sync     Cron alle 10 Min. (x-notify-secret) oder Büro nach dem Speichern: übersetzt neue/geänderte
//            kurze Felder (News, Aufgaben, Onboarding, Schulungen, Quiz, Titel/Kurzfassung im Wissen).
//   article  {id, lang}  Volltext eines Wissensartikels, beim ersten Öffnen auf EN/FR; danach aus dem Cache.
// Ergebnis liegt je Zeile in i18n = { h, EN: {...}, FR: {...} }; h = Hash der deutschen Felder.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { aiJson } from '../_shared/openai.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const LANGS = ['EN', 'FR'] as const

async function hash(v: unknown) {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(JSON.stringify(v)))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}
const RULES = [
  'Du übersetzt interne Inhalte der Beautylounge AG (Kosmetikstudios in der Region Basel) aus dem Deutschen ins Englische (EN) und Französische (FR).',
  'Natürlich und freundlich, wie ein Mensch im Team schreibt. Formatierung, Zeilenumbrüche, Aufzählungszeichen, Zahlen, Uhrzeiten und Daten bleiben erhalten.',
  'Anrede wie im Original: Das Team wird geduzt (FR: tu). Was eine Mitarbeiterin zu einer Kundin sagt (Telefonskripte, Begrüssungen, Sätze an die Kundin), ist im Original per Sie und bleibt höflich (FR: vous). Schweizer Grussformeln wie „Grüezi“ werden zur üblichen Begrüssung (EN: Hello, FR: Bonjour).',
  'Nicht übersetzen: Eigennamen, Studio- und Ortsnamen (Basel 1, Riehen, Bäumleingasse …), Produkt- und Markennamen (OPI, Shellac, Phorest, Timebutler, Orderbird …) und eingeführte Behandlungsnamen (Microblading, Lashlifting, Brow-Styling, Waxing …).',
  'Gibt es kein deutsches Wort zu übersetzen (leer), bleibt das Feld leer.',
].join('\n')

const RULES_V = 2 // hochzählen, wenn sich RULES ändert: Volltexte im Cache werden dann neu übersetzt

// Tabellen und Felder für den Abgleich
type Cfg = { table: string; fields: string[]; select?: string }
const CFG: Cfg[] = [
  { table: 'news', fields: ['title', 'teaser', 'body'] },
  { table: 'task_templates', fields: ['name'] },
  { table: 'task_items', fields: ['title'] },
  { table: 'onboarding_steps', fields: ['title'] },
  { table: 'events', fields: ['title', 'description', 'place'] },
  { table: 'quizzes', fields: ['title'] },
  { table: 'quiz_questions', fields: ['prompt', 'options'] },
  { table: 'wiki_articles', fields: ['title', 'category', 'intro'] },
]

async function translateRows(rows: { id: string; src: Record<string, unknown> }[]) {
  const out = await aiJson<{ items: { id: string; EN: Record<string, unknown>; FR: Record<string, unknown> }[] }>(
    RULES + '\nListen (z. B. options) bleiben Listen gleicher Länge und Reihenfolge.\nGib nur JSON zurück: {"items":[{"id":string,"EN":{feld:wert},"FR":{feld:wert}}]} mit genau denselben Feldnamen wie in der Eingabe.',
    JSON.stringify(rows.map((r) => ({ id: r.id, ...r.src }))),
    { timeoutMs: 120000 },
  )
  return out.items ?? []
}

async function sync(admin: any, budgetMs = 110000) {
  const t0 = Date.now(), done: Record<string, number> = {}
  for (const c of CFG) {
    const { data } = await admin.from(c.table).select(['id', 'i18n', ...c.fields].join(', '))
    const todo: { id: string; src: Record<string, unknown>; h: string; i18n: any }[] = []
    for (const r of data ?? []) {
      const src = Object.fromEntries(c.fields.map((f) => [f, r[f] ?? '']))
      if (Object.values(src).every((v) => (Array.isArray(v) ? v.length === 0 : !String(v).trim()))) continue
      const h = await hash(src)
      if (r.i18n?.h !== h) todo.push({ id: r.id, src, h, i18n: r.i18n ?? {} })
    }
    // Lange Texte (News) in kleinen Paketen, kurze Felder in grösseren
    const size = c.table === 'news' || c.table === 'events' ? 4 : 25
    for (let i = 0; i < todo.length; i += size) {
      if (Date.now() - t0 > budgetMs) return { done, more: true }
      const chunk = todo.slice(i, i + size)
      const items = await translateRows(chunk)
      for (const r of chunk) {
        const it = items.find((x) => x.id === r.id); if (!it?.EN || !it?.FR) continue
        // Volltext-Übersetzungen eines Artikels bleiben erhalten, bis sich der Text selbst ändert
        const keep = Object.fromEntries(Object.entries(r.i18n).filter(([k]) => k.startsWith('full_')))
        await admin.from(c.table).update({ i18n: { ...keep, h: r.h, EN: it.EN, FR: it.FR } }).eq('id', r.id)
        done[c.table] = (done[c.table] ?? 0) + 1
      }
    }
  }
  return { done, more: false }
}

// Volltext eines Artikels: Blöcke (aus dem Wiki-Import) bzw. Absätze, in Paketen von ~6000 Zeichen
async function article(admin: any, id: string, lang: 'EN' | 'FR') {
  const { data: a } = await admin.from('wiki_articles').select('id, body, blocks, i18n').eq('id', id).single()
  if (!a) return null
  const h = await hash({ v: RULES_V, body: a.body, blocks: a.blocks })
  const cached = a.i18n?.[`full_${lang}`]
  if (cached?.h === h) return cached
  // Alle Texte einsammeln, mit Pfad, damit sie wieder an die richtige Stelle kommen
  const texts: { k: string; t: string }[] = []
  const blocks = Array.isArray(a.blocks) ? structuredClone(a.blocks) : null
  if (blocks) blocks.forEach((b: any, i: number) => {
    if (b.text) texts.push({ k: `${i}.t`, t: b.text })
    ;(b.items ?? []).forEach((x: string, j: number) => texts.push({ k: `${i}.${j}`, t: x }))
    if (b.name && b.t === 'file') texts.push({ k: `${i}.n`, t: b.name })
  })
  const paras = String(a.body ?? '').split(/\n\n+/)
  if (!blocks) paras.forEach((p, i) => p.trim() && texts.push({ k: `p${i}`, t: p }))
  const map = new Map<string, string>()
  let pack: typeof texts = [], len = 0
  const flush = async () => {
    if (!pack.length) return
    const out = await aiJson<{ items: { k: string; t: string }[] }>(
      RULES + `\nÜbersetze nur nach ${lang === 'EN' ? 'Englisch' : 'Französisch'}. Gib nur JSON zurück: {"items":[{"k":string,"t":string}]} mit denselben k.`,
      JSON.stringify(pack), { timeoutMs: 120000 })
    for (const x of out.items ?? []) map.set(x.k, x.t)
    pack = []; len = 0
  }
  for (const x of texts) { if (len + x.t.length > 6000) await flush(); pack.push(x); len += x.t.length }
  await flush()
  let body = a.body
  if (blocks) blocks.forEach((b: any, i: number) => {
    if (b.text) b.text = map.get(`${i}.t`) ?? b.text
    if (b.items) b.items = b.items.map((x: string, j: number) => map.get(`${i}.${j}`) ?? x)
    if (b.name && b.t === 'file') b.name = map.get(`${i}.n`) ?? b.name
  })
  else body = paras.map((p, i) => map.get(`p${i}`) ?? p).join('\n\n')
  const full = { h, body, blocks }
  await admin.from('wiki_articles').update({ i18n: { ...(a.i18n ?? {}), [`full_${lang}`]: full } }).eq('id', id)
  return full
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))
  const cron = req.headers.get('x-notify-secret') === Deno.env.get('NOTIFY_SECRET')
  const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const me = cron ? null : (await user.rpc('current_employee')).data
  if (!cron && !me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)

  try {
    if (body.action === 'sync') {
      if (!cron && me.app_role !== 'buero') return json({ ok: false, error: 'forbidden' }, 403)
      return json({ ok: true, ...(await sync(admin)) })
    }
    if (body.action === 'article') {
      const lang = body.lang === 'FR' ? 'FR' : body.lang === 'EN' ? 'EN' : null
      if (!lang) return json({ ok: false, error: 'lang' }, 400)
      // Nur Artikel, die diese Person lesen darf (RLS über den eigenen Zugang)
      const { data: can } = await user.from('wiki_articles').select('id').eq('id', String(body.id ?? '')).maybeSingle()
      if (!can) return json({ ok: false, error: 'not_visible' }, 403)
      const full = await article(admin, can.id, lang)
      return json({ ok: true, body: full?.body ?? '', blocks: full?.blocks ?? null })
    }
    return json({ ok: false, error: 'unknown_action' }, 400)
  } catch (e) {
    return json({ ok: false, error: 'ai_unavailable', detail: String(e).slice(0, 300) }, 503)
  }
})
