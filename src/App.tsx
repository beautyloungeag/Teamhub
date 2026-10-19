import { useEffect, useState } from 'react'
import { AppProvider } from './store'
import { AuthProvider, useAuth } from './lib/auth'
import Mobile from './Mobile'
import Backoffice from './Backoffice'
import Login from './Login'

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <Gate />
      </AppProvider>
    </AuthProvider>
  )
}

// Ab 768 px Breite gilt die Desktop-Ansicht (Seitenleiste statt Leiste unten, Backoffice als Startseite).
const DESKTOP = '(min-width: 768px)'
function useDesktop() {
  const [d, setD] = useState(() => window.matchMedia(DESKTOP).matches)
  useEffect(() => {
    const m = window.matchMedia(DESKTOP); const on = () => setD(m.matches)
    m.addEventListener('change', on); return () => m.removeEventListener('change', on)
  }, [])
  return d
}

// Anmeldung: am Handy randlos, am Desktop als Karte mit Studio-Bild links.
const LoginFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[100dvh] flex items-center justify-center md:p-6">
    <div className="w-full h-[100dvh] md:h-[640px] md:max-w-[960px] md:grid md:grid-cols-2 bg-paper md:rounded-[16px] md:shadow-[0_24px_60px_-30px_rgba(29,34,28,.35)] overflow-hidden">
      {/* Studio-Bild: Glasleuchten aus der Lounge (Standbild aus dem Video auf beautylounge.ch) */}
      <img src="/login-studio.webp" alt="" className="hidden md:block w-full h-full object-cover" />
      <div className="relative h-full flex flex-col">{children}</div>
    </div>
  </div>
)

function Gate() {
  const { ready, employee, orphan, signOut } = useAuth()
  const desktop = useDesktop()
  const [mode, setMode] = useState<'app' | 'office' | null>(null)
  if (!ready) return <div className="min-h-full flex items-center justify-center text-mute">…</div>
  if (!employee) {
    // Angemeldet, aber nicht (mehr) freigeschaltet: sofort wieder abmelden.
    if (orphan) signOut()
    return <LoginFrame><Login notice={orphan ? 'Dein Zugang ist nicht mehr aktiv. Bitte melde dich im Büro.' : undefined} /></LoginFrame>
  }
  // Backoffice nur für Filialleitung und Büro am Desktop (Rechte prüft zusätzlich die Datenbank per RLS).
  // Am Desktop starten sie im Backoffice, am Handy immer in der App.
  const office = employee.app_role !== 'mitarbeiterin' && desktop
  const view = office ? mode ?? 'office' : 'app'
  return (
    <>
      {/* Beide bleiben gemountet, damit der gemeinsame Zustand beim Umschalten erhalten bleibt */}
      <div className={view === 'app' ? 'relative w-full h-[100dvh] bg-paper flex flex-col overflow-hidden' : 'hidden'}>
        <Mobile onSwitch={office ? () => setMode('office') : undefined} />
      </div>
      {office && <div className={view === 'office' ? 'w-full h-[100dvh]' : 'hidden'}><Backoffice onSwitch={() => setMode('app')} /></div>}
    </>
  )
}
