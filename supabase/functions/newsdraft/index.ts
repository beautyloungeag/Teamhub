// Benni entwirft News fürs Büro (Update-Meeting 25.09.): Text aus einer Stichwortangabe und auf Wunsch ein Bild.
// Nur Rolle Büro. Veröffentlicht wird nichts – das Büro prüft und schickt selbst ab.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { aiJson } from '../_shared/openai.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const user = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await user.rpc('current_employee')
  if (me?.app_role !== 'buero' && me?.app_role !== 'filialleitung') return json({ ok: false, error: 'forbidden' }, 403)
  const body = await req.json().catch(() => ({}))

  if (body.action === 'text') {
    const brief = String(body.brief ?? '').slice(0, 3000)
    if (brief.trim().length < 3) return json({ ok: false, error: 'empty' }, 400)
    try {
      const out = await aiJson<{ title: string; teaser: string; body: string; image_prompt: string }>([
        'Du schreibst interne News für das Team der Beautylounge AG, sechs Kosmetikstudios in der Region Basel (rund 50 Mitarbeiterinnen).',
        'Stil: freundlich, klar und kurz, Schweizer Hochdeutsch (ss statt ß), das Team wird mit „ihr“ angesprochen. Keine Emojis, keine Floskeln, keine Ausrufezeichen-Ketten.',
        'Höchstens 120 Wörter im Text, Absätze mit einer Leerzeile getrennt. Erfinde keine Daten, Preise oder Namen, die nicht in der Vorgabe stehen.',
        'Titel höchstens 60 Zeichen, Kurzfassung höchstens 140 Zeichen.',
        'image_prompt: kurze englische Bildbeschreibung für ein ruhiges, hochwertiges Foto passend zur News (warmes Licht, Kosmetikstudio, keine Schrift im Bild, keine erkennbaren Gesichter).',
        'Gib nur JSON zurück: {"title":string,"teaser":string,"body":string,"image_prompt":string}',
      ].join('\n'), `Vorgabe vom Büro:\n${brief}`)
      return json({ ok: true, title: String(out.title ?? ''), teaser: String(out.teaser ?? ''), body: String(out.body ?? ''), image_prompt: String(out.image_prompt ?? '') })
    } catch { return json({ ok: false, error: 'ai_unavailable' }, 503) }
  }

  if (body.action === 'image') {
    const prompt = String(body.prompt ?? '').slice(0, 1500)
    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key || !prompt.trim()) return json({ ok: false, error: 'empty' }, 400)
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: Deno.env.get('IMAGE_MODEL') ?? 'gpt-image-2.5-sunburst', prompt: `${prompt}. Calm premium photography, natural light, muted olive and stone tones, no text, no logos, no recognizable faces.`, size: '1536x1024', n: 1 }),
        signal: AbortSignal.timeout(120000),
      })
      if (!r.ok) throw new Error(`openai_${r.status}`)
      const b64 = (await r.json()).data?.[0]?.b64_json
      if (!b64) throw new Error('no_image')
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const path = `news/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.png`
      const { error } = await admin.storage.from('media').upload(path, bytes, { contentType: 'image/png' })
      if (error) throw error
      return json({ ok: true, path })
    } catch (e) { return json({ ok: false, error: 'ai_unavailable', detail: String(e) }, 503) }
  }
  return json({ ok: false, error: 'unknown_action' }, 400)
})
