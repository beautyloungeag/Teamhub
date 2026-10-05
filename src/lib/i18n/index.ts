// Oberflächentexte DE/EN/FR. Schlüssel ist immer der deutsche Text; fehlt eine
// Übersetzung, erscheint Deutsch. Platzhalter: tr('{n} Termine', { n: 3 }).
// Prüfen, ob alles übersetzt ist: node scripts/check_i18n.mjs
import common from './common'
import mobile from './mobile'
import calendar from './calendar'
import login from './login'

export type Lang = 'DE' | 'EN' | 'FR'
export const DICT: Record<string, [string, string]> = { ...common, ...mobile, ...calendar, ...login }

let current: Lang = 'DE'
export const setCurrentLang = (l: Lang) => { current = l; try { localStorage.setItem('th-lang', l); document.documentElement.lang = l.toLowerCase() } catch { /* privat */ } }
export const getLang = () => current
// Vor der Anmeldung: zuletzt gewählte Sprache, sonst Gerätesprache
export const savedLang = (): Lang => {
  try { const v = localStorage.getItem('th-lang'); if (v === 'DE' || v === 'EN' || v === 'FR') return v } catch { /* privat */ }
  const n = (navigator.language || 'de').slice(0, 2)
  return n === 'fr' ? 'FR' : n === 'en' ? 'EN' : 'DE'
}
export const locale = (l: Lang = current) => l === 'EN' ? 'en-GB' : l === 'FR' ? 'fr-CH' : 'de-CH'

export function tr(s: string, vars?: Record<string, string | number>, l: Lang = current) {
  let r = l === 'DE' ? s.split('|')[0] : (DICT[s]?.[l === 'EN' ? 0 : 1] ?? s.split('|')[0])
  if (vars) for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v))
  return r
}
