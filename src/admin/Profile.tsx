import { useRef, useState } from 'react'
import { Camera, LogOut } from 'lucide-react'
import { useApp } from '../store'
import { useAuth } from '../lib/auth'
import { Avatar } from '../People'
import type { Lang } from '../lib/i18n'
import { Section, DataRow, Seg, btn2 } from './kit'
import { ROLE } from './Team'

// Mein Profil im Backoffice: Profilbild (erscheint in Kommentaren, Team und Seitenleiste), Kontakt, Sprache.
export function ProfileAdmin({ onSettings }: { onSettings: () => void }) {
  const { me, photo, setPhotoFile, lang, setLang, branches } = useApp()
  const { signOut } = useAuth()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="max-w-[720px]">
      <div className="flex items-center gap-6">
        <button onClick={() => file.current?.click()} title="Profilbild ändern" className={`relative group shrink-0 ${busy ? 'opacity-50' : ''}`}>
          <Avatar s={me} photo={photo} size="w-24 h-24 text-[28px]" />
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-olive-700 group-hover:bg-olive-800 text-white flex items-center justify-center border-2 border-white"><Camera size={14} /></span>
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { setBusy(true); await setPhotoFile(f); setBusy(false) } }} />
        <div className="min-w-0">
          <h1 className="text-[30px] leading-tight">{me.first} {me.last}</h1>
          <p className="text-[14px] text-mute mt-1">{me.role} · {ROLE[me.app_role] ?? me.app_role}</p>
          <button onClick={() => file.current?.click()} className="mt-2 text-[13px] text-olive-700 hover:underline">{photo ? 'Profilbild ändern' : 'Profilbild hochladen'}</button>
        </div>
      </div>
      <Section className="mt-10" title="Kontakt">
        <DataRow label="E-Mail" value={me.email} copy={me.email} />
        <DataRow label="Telefon" value={me.phone || 'keine Nummer hinterlegt'} muted={!me.phone} copy={me.phone} />
        <DataRow label="Studio" value={[me.branch, ...(me.extra ?? []).map(b => branches.find(x => x.id === b)?.name)].filter(Boolean).join(', ')} />
        <p className="mt-2 text-[12.5px] text-mute">Name, E-Mail, Studio und Rolle ändert das Büro unter Team.</p>
      </Section>
      <Section className="mt-10" title="Sprache">
        <Seg value={lang} onChange={(l: Lang) => setLang(l)} items={[['DE', 'Deutsch'], ['EN', 'English'], ['FR', 'Français']]} />
      </Section>
      <Section className="mt-10" title="Mitteilungen">
        <p className="text-[14px] text-ink/80">Welche Mitteilungen du bekommst, stellst du unter <button onClick={onSettings} className="text-olive-700 hover:underline">Einstellungen</button> ein.</p>
      </Section>
      <button onClick={signOut} className={`${btn2} mt-10 flex items-center gap-2 hover:text-alert`}><LogOut size={15} />Abmelden</button>
    </div>
  )
}
