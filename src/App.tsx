import { useState } from 'react'
import { Smartphone, Monitor } from 'lucide-react'
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

const Phone = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full md:w-[400px] h-[100dvh] md:h-[820px] bg-paper md:rounded-[46px] md:border-[10px] md:border-ink overflow-hidden flex flex-col">{children}</div>
)

function Gate() {
  const { ready, employee, orphan, signOut } = useAuth()
  const [mode, setMode] = useState<'app' | 'office'>('app')
  if (!ready) return <div className="min-h-full flex items-center justify-center text-mute">…</div>
  if (!employee) {
    // Angemeldet, aber nicht (mehr) freigeschaltet: sofort wieder abmelden.
    if (orphan) signOut()
    return (
      <div className="min-h-full flex flex-col items-center md:py-6 md:px-6">
        <Phone><Login notice={orphan ? 'Dein Zugang ist nicht mehr aktiv. Bitte melde dich im Büro.' : undefined} /></Phone>
      </div>
    )
  }
  // Backoffice nur für Filialleitung und Büro (Rechte prüft zusätzlich die Datenbank per RLS).
  const office = employee.app_role !== 'mitarbeiterin'
  const view = office ? mode : 'app'
  return (
    <div className="min-h-full flex flex-col items-center md:py-6 md:px-6">
      {office && <div className="hidden md:flex mb-5 p-1 rounded-2xl bg-white gap-1">
        {([['app', 'Mitarbeiterin-App', Smartphone], ['office', 'Büro-Backoffice', Monitor]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => setMode(k)} className={`h-9 px-4 rounded-xl text-[14px] flex items-center gap-2 ${view === k ? 'bg-ink text-white' : 'text-sage-800'}`}><I size={16} />{l}</button>
        ))}
      </div>}
      {/* Beide bleiben gemountet, damit der gemeinsame Zustand beim Umschalten erhalten bleibt */}
      <div className={view === 'app' ? 'contents' : 'hidden'}><Phone><Mobile /></Phone></div>
      {office && <div className={view === 'office' ? 'w-full max-w-[1280px] h-[820px]' : 'hidden'}><Backoffice /></div>}
    </div>
  )
}
