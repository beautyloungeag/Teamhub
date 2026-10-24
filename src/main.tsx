import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'
import { installMobileViewport } from './lib/mobile-viewport'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)

// Service Worker immer registrieren: installierbar + Push (auch lokal testbar)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
import './lib/push'
import './lib/errors'

const stopViewport = installMobileViewport()
if (import.meta.hot) import.meta.hot.dispose(stopViewport)
