import { Component, type ReactNode } from 'react'
import { reportError } from './lib/errors'
import { tr } from './lib/i18n'

// Stürzt eine Ansicht ab, steht statt einer weissen Seite ein Hinweis mit „Neu laden“; der Fehler geht ins Protokoll.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: Error, info: { componentStack?: string | null }) { reportError(e.message, `${e.stack ?? ''}\n${info.componentStack ?? ''}`) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="min-h-dvh bg-paper flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-[20px] font-medium">{tr('Etwas ist schiefgelaufen')}</p>
          <p className="mt-2 text-[14px] text-mute">{tr('Der Fehler ist gemeldet. Lade die Seite neu, dann geht es weiter.')}</p>
          <button onClick={() => location.reload()} className="mt-5 h-11 px-5 rounded-[10px] bg-olive-700 text-white text-[15px]">{tr('Neu laden')}</button>
        </div>
      </div>
    )
  }
}
