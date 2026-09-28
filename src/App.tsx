import { useState } from 'react'
import { Smartphone, Monitor } from 'lucide-react'
import { AppProvider } from './store'
import Mobile from './Mobile'
import Backoffice from './Backoffice'

export default function App() {
  const [mode, setMode] = useState<'app' | 'office'>('app')
  return (
    <AppProvider>
      <div className="min-h-full flex flex-col items-center md:py-6 md:px-6">
        <div className="hidden md:flex mb-5 p-1 rounded-2xl bg-white gap-1">
          {([['app', 'Mitarbeiterin-App', Smartphone], ['office', 'Büro-Backoffice', Monitor]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setMode(k)} className={`h-9 px-4 rounded-xl text-[14px] flex items-center gap-2 ${mode === k ? 'bg-ink text-white' : 'text-sage-800'}`}><I size={16} />{l}</button>
          ))}
        </div>
        {/* Beide bleiben gemountet, damit der gemeinsame Zustand beim Umschalten erhalten bleibt */}
        <div className={mode === 'app' ? 'contents' : 'hidden'}>
          <div className="relative w-full md:w-[400px] h-[100dvh] md:h-[820px] bg-paper md:rounded-[46px] md:border-[10px] md:border-ink overflow-hidden flex flex-col">
            <Mobile />
          </div>
        </div>
        <div className={mode === 'office' ? 'w-full max-w-[1280px] h-[820px]' : 'hidden'}>
          <Backoffice />
        </div>
      </div>
    </AppProvider>
  )
}
