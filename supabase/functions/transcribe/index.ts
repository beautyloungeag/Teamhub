// Diktat für Marc: Aufnahme → Text (OpenAI, Standard gpt-4o-transcribe). Die App zeigt beim Sprechen
// schon eine Live-Vorschau (Spracherkennung des Browsers); dieser Text ersetzt sie am Ende, weil er genauer ist.
// Während der Aufnahme schickt die App alle paar Sekunden den Stand mit fast=1 (kleineres, schnelleres Modell)
// für die Live-Anzeige, am Ende einmal alles für den endgültigen Text.
// Secrets: OPENAI_API_KEY, optional TRANSCRIBE_MODEL, TRANSCRIBE_FAST_MODEL.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
// Wörter aus dem Alltag der Studios, damit sie richtig geschrieben werden
const HINT = 'Beautylounge, TeamHub, Marc, Phorest, Timebutler, Shellac, Shellack, Microblading, Lashlifting, Lashextensions, Brow-Styling, Waxing, Intimwaxing, Pediküre, Maniküre, Gel Nails, Microneedling, Basel, Riehen, Oberwil, Pratteln, Reinach, Filialleitung, Kundin, Aushilfe.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const db = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await db.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return json({ ok: false, error: 'no_key' }, 503)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size < 500) return json({ ok: false, error: 'no_audio' }, 400)
  if (file.size > 24e6) return json({ ok: false, error: 'too_long' }, 400)
  const lang = ['de', 'en', 'fr'].includes(String(form?.get('lang'))) ? String(form?.get('lang')) : 'de'
  const fd = new FormData()
  fd.append('file', file, file.name || 'diktat.webm')
  const fast = form?.get('fast') === '1'
  fd.append('model', fast ? Deno.env.get('TRANSCRIBE_FAST_MODEL') ?? 'gpt-4o-mini-transcribe' : Deno.env.get('TRANSCRIBE_MODEL') ?? 'gpt-4o-transcribe')
  fd.append('language', lang)
  fd.append('prompt', HINT)
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(60000) })
  const j = await r.json().catch(() => ({}))
  return r.ok ? json({ ok: true, text: String(j.text ?? '').trim() }) : json({ ok: false, error: j.error?.message ?? `openai_${r.status}` }, 502)
})
