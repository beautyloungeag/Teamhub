import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'

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

// Visual viewport follows the iPhone keyboard; only the mobile shell uses this value.
const updateViewport = () => document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height ?? window.innerHeight}px`)
updateViewport()
window.visualViewport?.addEventListener('resize', updateViewport)
window.addEventListener('orientationchange', updateViewport)
