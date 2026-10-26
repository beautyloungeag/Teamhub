import { useEffect, useLayoutEffect, useState } from 'react'
import { AppProvider, useApp } from './store'
import { AuthProvider, useAuth } from './lib/auth'
import Mobile, { WikiPreviewFrame } from './Mobile'
import Backoffice from './Backoffice'
import { startParams } from './lib/start'
import Login from './Login'
import { tr } from './lib/i18n'
import { Toaster } from './Toast'
import { DESKTOP_MEDIA } from './lib/mobile-viewport'

export default function App() {
  return (
    <AuthProvider>
      <AccountBoundary />
    </AuthProvider>
  )
}

function AccountBoundary() {
  const { scopeKey } = useAuth()
  return <AppProvider key={scopeKey ?? 'signed-out'}><Gate /><Toaster /></AppProvider>
}

// Desktop requires enough width and a primary mouse/trackpad. Rotating a phone
// must not switch the employee app into Backoffice or bypass keyboard sizing.
function useDesktop() {
  const [d, setD] = useState(() => window.matchMedia(DESKTOP_MEDIA).matches)
  useEffect(() => {
    const m = window.matchMedia(DESKTOP_MEDIA); const on = () => setD(m.matches)
    m.addEventListener('change', on); return () => m.removeEventListener('change', on)
  }, [])
  return d
}

// Anmeldung: am Handy randlos, am Desktop als Karte mit Studio-Bild links.
function LoginFrame({ children }: { children: React.ReactNode }) {
  // iOS must be allowed to scroll/pan the document to the focused login field.
  // Keep the authenticated app's fixed canvas separate from this form.
  useLayoutEffect(() => {
    document.documentElement.classList.add('teamhub-login-mode')
    return () => document.documentElement.classList.remove('teamhub-login-mode')
  }, [])
  return <div className="teamhub-login-frame min-h-[100dvh] flex items-center justify-center md:p-6">
    <div className="teamhub-login-panel w-full md:h-[680px] md:max-w-[1000px] md:grid md:grid-cols-2 md:grid-rows-[100%] bg-paper md:rounded-[16px] md:shadow-[0_24px_60px_-30px_rgba(29,34,28,.35)] md:overflow-hidden">
      <img src="/login-studio.webp" alt="" className="hidden md:block w-full h-full min-h-0 object-cover" />
      <div className="relative md:h-full flex flex-col">{children}</div>
    </div>
  </div>
}

function Gate() {
  const { ready, employee, orphan, offline, retry } = useAuth()
  const data = useApp()
  const desktop = useDesktop()
  // Direktlink: ?open=… zeigt die App, ?bo=… das Backoffice
  const [mode, setMode] = useState<'app' | 'office' | null>(() => startParams.has('open') ? 'app' : startParams.has('bo') ? 'office' : null)
  useEffect(() => { const open = () => setMode('app'); window.addEventListener('th-open-app', open); return () => window.removeEventListener('th-open-app', open) }, [])
  if (!ready) return <div className="min-h-full flex items-center justify-center text-mute">…</div>
  if (!employee && offline) return (
    <div className="min-h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-[15px]">{tr('Keine Verbindung zum TeamHub.')}</p>
      <button onClick={retry} className="h-11 px-5 rounded-[10px] bg-olive-700 text-white font-medium">{tr('Erneut versuchen')}</button>
    </div>
  )
  if (!employee) {
    // Angemeldet, aber nicht (mehr) freigeschaltet: sofort wieder abmelden.
    return <LoginFrame><Login notice={orphan ? 'Dein Zugang ist nicht mehr aktiv. Bitte melde dich im Büro.' : undefined} /></LoginFrame>
  }
  if (data?.loading) return <div className="min-h-full flex items-center justify-center text-mute">{tr('Lädt …')}</div>
  if (data?.loadError) return <div className="min-h-full flex flex-col items-center justify-center gap-3 p-6 text-center"><p>{tr('Keine Verbindung zum TeamHub.')}</p><button onClick={() => void data.reload()} className="h-11 px-5 rounded-[10px] bg-olive-700 text-white">{tr('Erneut versuchen')}</button></div>
  // Vorschau eines Wissensartikels aus dem Backoffice (Rahmen mit Handybreite)
  if (startParams.has('vorschau')) return <WikiPreviewFrame />
  // Backoffice nur für Filialleitung und Büro am Desktop (Rechte prüft zusätzlich die Datenbank per RLS).
  // Am Desktop starten sie im Backoffice, am Handy immer in der App.
  const office = employee.app_role !== 'mitarbeiterin' && desktop
  const view = office ? mode ?? 'office' : 'app'
  return (
    <>
      {/* Beide bleiben gemountet, damit der gemeinsame Zustand beim Umschalten erhalten bleibt */}
      <div className={view === 'app' ? 'teamhub-app-shell relative w-full h-[100dvh] bg-paper flex flex-col overflow-hidden' : 'hidden'}>
        <Mobile onSwitch={office ? () => setMode('office') : undefined} />
      </div>
      {office && <div className={view === 'office' ? 'w-full h-[100dvh]' : 'hidden'}><Backoffice onSwitch={() => setMode('app')} /></div>}
    </>
  )
}
