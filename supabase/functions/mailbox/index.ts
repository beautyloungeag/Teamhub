// Persönlicher Posteingang (Vertrag § 1.3, Wunsch der Inhaberin 21.10.): das eigene Firmenpostfach bei Cyon per IMAP/SMTP.
//   status     {}                                  verbunden? Adresse, letzter Fehler
//   connect    {password}                          Anmeldung testen, Passwort verschlüsselt speichern (AES-GCM, Secret MAILBOX_KEY)
//   disconnect {}                                  gespeichertes Passwort löschen
//   list       {before?: uid, limit?}              neueste Mails im Posteingang (Absender, Betreff, Datum, Vorschau, gelesen)
//   message    {uid}                               ganze Mail (Text, HTML, Anhänge als Liste), markiert sie als gelesen
//   send       {to, cc?, subject, text, replyTo?}  senden über SMTP (Port 465) und Kopie in „Gesendet“ ablegen
// Benutzername ist die Firmen-Mail. Passwort und Inhalte verlassen die Function nie an Dritte, Inhalte werden nicht gespeichert.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import PostalMime from 'npm:postal-mime@2.4.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const IMAP_HOST = Deno.env.get('MAIL_IMAP_HOST') ?? 's065.cyon.net'
const SMTP_HOST = Deno.env.get('MAIL_SMTP_HOST') ?? IMAP_HOST

/* ---------- Verschlüsselung des Postfach-Passworts ---------- */
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
async function key() {
  const raw = Deno.env.get('MAILBOX_KEY'); if (!raw) throw new Error('not_configured')
  return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function seal(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(text)))
  return b64(iv) + '.' + b64(ct)
}
async function open(sealed: string) {
  const [iv, ct] = sealed.split('.')
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(ct)))
}

/* ---------- Schlanker IMAP-Client (Bytes als latin1-Zeichen, damit Literal-Längen stimmen) ---------- */
const latin1 = new TextDecoder('latin1')
const toBytes = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 255)
type Untagged = { text: string; literals: string[] }
class Imap {
  private conn!: Deno.TlsConn
  private buf = ''
  private n = 0
  async connect() {
    this.conn = await Deno.connectTls({ hostname: IMAP_HOST, port: 993 })
    const greet = await this.line()
    if (!greet.startsWith('* OK')) throw new Error('imap_greeting')
  }
  private async fill() {
    const chunk = new Uint8Array(65536)
    const n = await Promise.race([this.conn.read(chunk), new Promise<null>((_, rej) => setTimeout(() => rej(new Error('imap_timeout')), 20000))])
    if (n === null) throw new Error('imap_closed')
    this.buf += latin1.decode(chunk.subarray(0, n))
  }
  private async line() {
    while (!this.buf.includes('\r\n')) await this.fill()
    const i = this.buf.indexOf('\r\n'); const l = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2); return l
  }
  private async bytes(n: number) {
    while (this.buf.length < n) await this.fill()
    const b = this.buf.slice(0, n); this.buf = this.buf.slice(n); return b
  }
  async cmd(command: string): Promise<{ ok: boolean; status: string; items: Untagged[] }> {
    const tag = 'A' + (++this.n)
    await this.conn.write(toBytes(`${tag} ${command}\r\n`))
    const items: Untagged[] = []
    let cur: Untagged | null = null
    for (;;) {
      let l = await this.line()
      if (l.startsWith(tag + ' ')) { const status = l.slice(tag.length + 1); return { ok: status.startsWith('OK'), status, items } }
      if (l.startsWith('* ') || !cur) { cur = { text: '', literals: [] }; items.push(cur) }
      // Zeile mit Literal: {N} am Ende, danach genau N Bytes, dann geht die Antwort in der nächsten Zeile weiter
      for (;;) {
        const m = l.match(/\{(\d+)\+?\}$/)
        cur.text += m ? l.slice(0, m.index) + ` \u0000${cur.literals.length}\u0000 ` : l
        if (!m) break
        cur.literals.push(await this.bytes(Number(m[1])))
        l = await this.line()
      }
    }
  }
  async close() { try { await this.cmd('LOGOUT') } catch { /* egal */ } try { this.conn.close() } catch { /* egal */ } }
}
const q = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'

async function withImap<T>(user: string, pass: string, fn: (c: Imap) => Promise<T>): Promise<T> {
  const c = new Imap()
  await c.connect()
  try {
    const login = await c.cmd(`LOGIN ${q(user)} ${q(pass)}`)
    if (!login.ok) throw new Error('login_failed')
    return await fn(c)
  } finally { await c.close() }
}
const flagsOf = (t: string) => t.match(/FLAGS \(([^)]*)\)/)?.[1] ?? ''
const uidOf = (t: string) => Number(t.match(/UID (\d+)/)?.[1] ?? 0)

async function parse(raw: string) { return await PostalMime.parse(toBytes(raw)) }
const addr = (a?: { name?: string; address?: string } | null) => a ? { name: a.name || a.address || '', address: a.address || '' } : null
const snippetOf = (p: { text?: string; html?: string }) => {
  const t = p.text || (p.html ?? '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  return t.replace(/^>.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 160)
}

async function sentFolder(c: Imap) {
  const r = await c.cmd('LIST "" "*"')
  const boxes = r.items.map(i => ({ attrs: i.text.match(/\(([^)]*)\)/)?.[1] ?? '', name: (i.text.match(/"([^"]+)"\s*$/)?.[1] ?? i.text.split(' ').pop() ?? '').replace(/^"|"$/g, '') }))
  return boxes.find(b => /\\Sent/i.test(b.attrs))?.name ?? boxes.find(b => /(^|\.|\/)(sent|gesendet)/i.test(b.name))?.name ?? null
}

/* ---------- SMTP über Port 465 (587 ist in Supabase gesperrt) ---------- */
const enc = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=`
const addrList = (x: unknown) => String(x ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
function buildMail(from: string, fromName: string, to: string[], cc: string[], subject: string, text: string, inReplyTo?: string, references?: string) {
  const id = `<${crypto.randomUUID()}@teamhub.beautylounge.ch>`
  const body = b64(new TextEncoder().encode(text)).replace(/.{76}/g, '$&\r\n')
  const h = [
    `From: ${enc(fromName)} <${from}>`, `To: ${to.join(', ')}`, ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${enc(subject)}`, `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, `Message-ID: ${id}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${[references, inReplyTo].filter(Boolean).join(' ')}`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', 'X-Mailer: TeamHub',
  ]
  return h.join('\r\n') + '\r\n\r\n' + body + '\r\n'
}
async function smtpSend(user: string, pass: string, rcpts: string[], data: string) {
  const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: 465 })
  let buf = ''
  const read = async () => {
    for (;;) {
      const lines = buf.split('\r\n'); const done = lines.findIndex(l => /^\d{3} /.test(l))
      if (done >= 0) { const reply = lines.slice(0, done + 1).join('\n'); buf = lines.slice(done + 1).join('\r\n'); return reply }
      const chunk = new Uint8Array(16384); const n = await conn.read(chunk); if (n === null) throw new Error('smtp_closed'); buf += latin1.decode(chunk.subarray(0, n))
    }
  }
  const expect = async (code: string) => { const r = await read(); if (!r.split('\n').pop()!.startsWith(code)) throw new Error('smtp_' + r.slice(0, 60)); return r }
  const say = (s: string) => conn.write(toBytes(s + '\r\n'))
  try {
    await expect('220'); await say('EHLO teamhub.beautylounge.ch'); await expect('250')
    await say('AUTH PLAIN ' + b64(new TextEncoder().encode(`\u0000${user}\u0000${pass}`))); await expect('235')
    await say(`MAIL FROM:<${user}>`); await expect('250')
    for (const r of rcpts) { await say(`RCPT TO:<${r}>`); await expect('25') }
    await say('DATA'); await expect('354')
    await conn.write(toBytes(data.replace(/\r\n\./g, '\r\n..') + '\r\n.\r\n')); await expect('250')
    await say('QUIT')
  } finally { try { conn.close() } catch { /* egal */ } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userDb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: me } = await userDb.rpc('current_employee')
  if (!me?.id) return json({ ok: false, error: 'not_signed_in' }, 401)
  const admin = createClient(url, service)
  const body = await req.json().catch(() => ({}))
  if (!Deno.env.get('MAILBOX_KEY')) return json({ ok: true, configured: false })
  const address: string = me.email
  const { data: acc } = await admin.from('mail_accounts').select('secret, verified_at, last_error').eq('employee_id', me.id).maybeSingle()
  const fail = async (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'login_failed') await admin.from('mail_accounts').update({ last_error: 'login_failed' }).eq('employee_id', me.id)
    return json({ ok: false, error: msg === 'login_failed' ? 'login_failed' : 'mail_unreachable', detail: msg.slice(0, 120) })
  }
  try {
    if (body.action === 'status') return json({ ok: true, configured: true, connected: !!acc?.secret, address, lastError: acc?.last_error ?? null })
    if (body.action === 'connect') {
      const pass = String(body.password ?? '')
      if (!pass) return json({ ok: false, error: 'password_missing' }, 400)
      await withImap(address, pass, async () => true)
      await admin.from('mail_accounts').upsert({ employee_id: me.id, address, secret: await seal(pass), verified_at: new Date().toISOString(), last_error: null })
      return json({ ok: true, connected: true, address })
    }
    if (body.action === 'disconnect') { await admin.from('mail_accounts').delete().eq('employee_id', me.id); return json({ ok: true, connected: false }) }
    if (!acc?.secret) return json({ ok: true, connected: false, address })
    const pass = await open(acc.secret)

    if (body.action === 'list') {
      const limit = Math.min(Math.max(Number(body.limit) || 25, 5), 40)
      return await withImap(address, pass, async (c) => {
        const sel = await c.cmd('SELECT INBOX')
        const total = Number(sel.items.find(i => / EXISTS$/.test(i.text))?.text.match(/\* (\d+) EXISTS/)?.[1] ?? 0)
        const unseen = (await c.cmd('UID SEARCH UNSEEN')).items.find(i => i.text.startsWith('* SEARCH'))?.text.slice(9).trim().split(/\s+/).filter(Boolean).length ?? 0
        const s = await c.cmd(body.before ? `UID SEARCH UID 1:${Number(body.before) - 1}` : 'UID SEARCH ALL')
        const uids = (s.items.find(i => i.text.startsWith('* SEARCH'))?.text.slice(9).trim().split(/\s+/).filter(Boolean).map(Number) ?? []).sort((a, b) => b - a).slice(0, limit)
        if (!uids.length) return json({ ok: true, connected: true, address, total, unseen, items: [] })
        const f = await c.cmd(`UID FETCH ${uids.join(',')} (UID FLAGS INTERNALDATE BODY.PEEK[]<0.16000>)`)
        const items = []
        for (const it of f.items.filter(i => / FETCH /.test(i.text))) {
          const p = await parse(it.literals[0] ?? '').catch(() => null)
          const flags = flagsOf(it.text)
          items.push({
            uid: uidOf(it.text), seen: /\\Seen/.test(flags), flagged: /\\Flagged/.test(flags), answered: /\\Answered/.test(flags),
            date: p?.date ?? it.text.match(/INTERNALDATE "([^"]+)"/)?.[1] ?? null, from: addr(p?.from), subject: p?.subject ?? '',
            snippet: p ? snippetOf(p) : '', attachments: (p?.attachments ?? []).filter(a => a.disposition !== 'inline').length,
          })
        }
        items.sort((a, b) => b.uid - a.uid)
        return json({ ok: true, connected: true, address, total, unseen, items })
      })
    }
    if (body.action === 'message') {
      const uid = Number(body.uid); if (!uid) return json({ ok: false, error: 'uid_missing' }, 400)
      return await withImap(address, pass, async (c) => {
        await c.cmd('SELECT INBOX')
        const f = await c.cmd(`UID FETCH ${uid} (UID FLAGS BODY.PEEK[])`)
        const it = f.items.find(i => / FETCH /.test(i.text)); if (!it) return json({ ok: false, error: 'not_found' }, 404)
        const p = await parse(it.literals[0] ?? '')
        await c.cmd(`UID STORE ${uid} +FLAGS (\\Seen)`)
        return json({
          ok: true, uid, subject: p.subject ?? '', date: p.date ?? null, from: addr(p.from), to: (p.to ?? []).map(addr), cc: (p.cc ?? []).map(addr),
          messageId: p.messageId ?? null, references: p.references ?? null, text: p.text ?? '', html: (p.html ?? '').slice(0, 400000),
          attachments: (p.attachments ?? []).filter(a => a.disposition !== 'inline').map(a => ({ name: a.filename ?? 'Anhang', type: a.mimeType, size: (a.content as ArrayBuffer)?.byteLength ?? 0 })),
        })
      })
    }
    if (body.action === 'send') {
      const to = addrList(body.to), cc = addrList(body.cc)
      if (!to.length || to.some(x => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x)) || cc.some(x => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x))) return json({ ok: false, error: 'bad_recipient' }, 400)
      const subject = String(body.subject ?? '').slice(0, 300), text = String(body.text ?? '').slice(0, 50000)
      if (!text.trim()) return json({ ok: false, error: 'empty' }, 400)
      const name = [me.first_name, me.last_name].filter(Boolean).join(' ') + ' · Beautylounge'
      const data = buildMail(address, name, to, cc, subject, text, body.inReplyTo || undefined, body.references || undefined)
      await smtpSend(address, pass, [...to, ...cc], data)
      // Kopie in „Gesendet“ und die beantwortete Mail markieren; scheitert das, ist die Mail trotzdem raus
      await withImap(address, pass, async (c) => {
        const box = await sentFolder(c)
        if (box) { const lit = toBytes(data).length; await c.cmd(`APPEND ${q(box)} (\\Seen) {${lit}+}\r\n${data}`) }
        if (body.replyUid) { await c.cmd('SELECT INBOX'); await c.cmd(`UID STORE ${Number(body.replyUid)} +FLAGS (\\Answered)`) }
      }).catch(() => {})
      return json({ ok: true })
    }
    return json({ ok: false, error: 'unknown_action' }, 400)
  } catch (e) { return fail(e) }
})
