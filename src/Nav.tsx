import { useSyncExternalStore, type ReactNode } from 'react'
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react'
import { useApp } from './store'
import { Logo, LogoMark } from './Logo'
import { Avatar } from './People'

// Grüne Seitenleiste am Desktop (App und Backoffice): aufgeklappt mit Text, zugeklappt nur Symbole.
// Der Zustand gilt für alle Seiten und bleibt im Browser gespeichert.
let mini = (() => { try { return localStorage.getItem('th-nav-mini') === '1' } catch { return false } })()
const subs = new Set<() => void>()
function setMini(v: boolean) { mini = v; try { localStorage.setItem('th-nav-mini', v ? '1' : '0') } catch { /* privat */ } subs.forEach(f => f()) }
export const useNavMini = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => mini)

export type NavEntry = { key: string; label: string; icon: ReactNode; active?: boolean; dot?: boolean; onClick: () => void }

function Item({ e, small }: { e: NavEntry; small: boolean }) {
  return (
    <button onClick={e.onClick} title={small ? e.label : undefined} aria-label={e.label} aria-current={e.active ? 'page' : undefined}
      className={`relative w-full h-10 rounded-[10px] flex items-center text-[14px] transition ${small ? 'justify-center' : 'px-3 gap-3'} ${e.active ? 'bg-white/10 text-white' : 'text-sage-200 hover:bg-white/5 hover:text-white'}`}>
      <span className="shrink-0 flex items-center justify-center w-[18px]">{e.icon}</span>
      {!small && <span className="truncate">{e.label}</span>}
      {e.dot && <span className={small ? 'absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-brass' : 'ml-auto w-2 h-2 rounded-full bg-brass shrink-0'} />}
    </button>
  )
}

export function SideNav({ items, extra = [], onProfile, profileActive, onLogout }: { items: NavEntry[]; extra?: NavEntry[]; onProfile?: () => void; profileActive?: boolean; onLogout: () => void }) {
  const { me, photo, t } = useApp()
  const small = useNavMini()
  const who = <span className="min-w-0 text-left"><span className="block text-[14px] text-white truncate">{me.first} {me.last}</span><span className="block text-[12px] text-sage-200/80 truncate">{me.role} · {me.branch}</span></span>
  const avatar = <Avatar s={me} photo={photo} size="w-9 h-9 text-[13px]" />
  const profileCls = `rounded-[12px] flex items-center transition ${profileActive ? 'bg-white/10' : onProfile ? 'hover:bg-white/5' : ''}`
  return (
    <aside className={`${small ? 'w-[68px] px-2.5' : 'w-60 px-4'} shrink-0 bg-olive-800 pt-5 pb-4 flex flex-col transition-[width] duration-200`}>
      <div className={`h-10 flex items-center ${small ? 'justify-center' : 'px-2'}`}>{small ? <LogoMark className="h-9 text-white" /> : <Logo className="w-32 text-white" />}</div>
      <nav className="mt-6 space-y-0.5">{items.map(e => <Item key={e.key} e={e} small={small} />)}</nav>
      <div className="mt-auto space-y-0.5">
        {extra.map(e => <Item key={e.key} e={e} small={small} />)}
        <Item small={small} e={{ key: 'mini', label: small ? t('Seitenleiste ausklappen') : t('Einklappen'), icon: small ? <ChevronsRight size={18} strokeWidth={1.6} /> : <ChevronsLeft size={18} strokeWidth={1.6} />, onClick: () => setMini(!small) }} />
        <div className="pt-2 mt-2 border-t border-white/10">
          {small ? <div className="flex flex-col items-center gap-1.5">
            {onProfile ? <button onClick={onProfile} title={t('Mein Profil')} aria-label={t('Mein Profil')} className={`p-1 ${profileCls}`}>{avatar}</button> : <span className="p-1">{avatar}</span>}
            <button onClick={onLogout} title={t('Abmelden')} aria-label={t('Abmelden')} className="w-10 h-10 rounded-[10px] text-sage-200 hover:text-white hover:bg-white/5 flex items-center justify-center"><LogOut size={17} strokeWidth={1.6} /></button>
          </div> : <div className="flex items-center gap-1">
            {onProfile ? <button onClick={onProfile} className={`flex-1 min-w-0 px-2 py-2 gap-3 ${profileCls}`}>{avatar}{who}</button> : <div className="flex-1 min-w-0 px-2 py-2 flex items-center gap-3">{avatar}{who}</div>}
            <button onClick={onLogout} title={t('Abmelden')} aria-label={t('Abmelden')} className="w-9 h-9 rounded-[10px] text-sage-200 hover:text-white hover:bg-white/5 flex items-center justify-center shrink-0"><LogOut size={17} strokeWidth={1.6} /></button>
          </div>}
        </div>
      </div>
    </aside>
  )
}
