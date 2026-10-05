import { useState } from 'react'
import { supabase } from './lib/supabase'
import { tr, savedLang, setCurrentLang, type Lang } from './lib/i18n'

// Passwortlos: Code per E-Mail. Solange Supabase noch ohne eigenen Mailversand läuft,
// enthält die Mail einen Anmeldelink statt eines Codes — der Link meldet ebenfalls an.
export default function Login({ notice }: { notice?: string }) {
  // Sprache vor der Anmeldung: zuletzt gewählt oder Gerätesprache; nach der Anmeldung gilt das Profil
  const [lang, setLangState] = useState<Lang>(savedLang)
  const setLang = (l: Lang) => { setCurrentLang(l); setLangState(l) }
  const t = (s: string) => tr(s, undefined, lang)
  const [sentA, sentB] = t('Wir haben dir eine E-Mail an {email} geschickt. Tippe auf den Link darin oder gib den Code ein.').split('{email}')
  // E-Mail merken: auf dem Handy wechselt man zur Mail-App, die Seite lädt dabei oft neu.
  const saved = (() => { try { return localStorage.getItem('th-login-email') ?? '' } catch { return '' } })()
  const [step, setStep] = useState<'mail' | 'code'>('mail')
  const [email, setEmail] = useState(saved)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(notice ?? '')

  const send = async () => {
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) { setErr('Bitte gib deine E-Mail-Adresse ein.'); return }
    if (!supabase) { setErr('Die Verbindung zum Server ist nicht eingerichtet.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) {
      if (/signups? not allowed|not found|user/i.test(error.message)) setErr('Diese E-Mail ist für TeamHub nicht freigeschaltet. Bitte melde dich im Büro.')
      else if (/rate|too many|seconds/i.test(error.message)) setErr('Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.')
      else setErr('Das hat nicht geklappt. Bitte versuche es gleich noch einmal.')
      return
    }
    try { localStorage.setItem('th-login-email', e) } catch { /* privater Modus */ }
    setEmail(e); setErr(''); setStep('code')
  }

  const verify = async () => {
    if (!supabase) return
    const token = code.replace(/\D/g, '')
    if (token.length < 6) { setErr('Bitte gib den Code aus der E-Mail ein.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    setBusy(false)
    if (error) setErr('Der Code stimmt nicht oder ist abgelaufen.')
  }

  return (
    <div className="flex-1 flex flex-col px-7 pt-14 pb-10">
      <div className="flex justify-end gap-1 text-xs">
        {(['DE', 'EN', 'FR'] as Lang[]).map(l => <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 rounded-full ${lang === l ? 'bg-ink text-white' : 'text-mute'}`}>{l}</button>)}
      </div>
      <div className="mt-20">
        <div className="w-14 h-14 rounded-2xl bg-sage-400 flex items-center justify-center text-white text-xl font-semibold">bl</div>
        <h1 className="mt-6 text-[34px] leading-tight font-semibold tracking-tight">TeamHub</h1>
        <p className="mt-1 text-mute">Beautylounge · {t('intern')}</p>
      </div>
      <div className="mt-auto space-y-4">
        {step === 'mail' ? <>
          <label className="block"><span className="block text-sm text-mute mb-2">{t('E-Mail')}</span>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={t('vorname@beautylounge.ch')} className="w-full h-12 rounded-2xl bg-white px-4 text-[15px] outline-none placeholder:text-mute" /></label>
          <button disabled={busy} onClick={send} className="w-full h-12 rounded-2xl font-medium bg-ink text-white disabled:opacity-60">{busy ? '…' : t('Anmeldecode senden')}</button>
          <p className="text-xs text-mute text-center">{t('Kein Passwort. Du bekommst eine E-Mail zum Anmelden.')}</p>
          <button onClick={() => { const e = email.trim().toLowerCase(); if (!e) { setErr('Bitte gib zuerst deine E-Mail-Adresse ein.'); return } setEmail(e); setErr(''); setStep('code') }} className="w-full text-sm text-mute">{t('Ich habe schon einen Code')}</button>
        </> : <>
          <p className="text-[15px]">{sentA}<span className="font-medium">{email}</span>{sentB}</p>
          <label className="block"><span className="block text-sm text-mute mb-2">{t('Code')}</span>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && verify()}
              className="w-full h-12 rounded-2xl bg-white px-4 text-lg tracking-[0.4em] outline-none" /></label>
          <button disabled={busy} onClick={verify} className="w-full h-12 rounded-2xl font-medium bg-ink text-white disabled:opacity-60">{busy ? '…' : t('Anmelden')}</button>
          <button onClick={() => { setStep('mail'); setCode(''); setErr('') }} className="w-full text-sm text-mute">{t('Andere E-Mail verwenden')}</button>
        </>}
        {err && <p role="alert" className="text-sm text-center text-[#B5483B]">{t(err)}</p>}
      </div>
    </div>
  )
}
