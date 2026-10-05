// Listet Texte in t('…') / tr('…'), für die EN oder FR fehlt. Aufruf: node scripts/check_i18n.mjs
import { readFileSync, readdirSync } from 'node:fs'
const dir = new URL('../src/lib/i18n/', import.meta.url)
const keys = new Set()
for (const f of readdirSync(dir).filter(f => f.endsWith('.ts') && f !== 'index.ts')) {
  const src = readFileSync(new URL(f, dir), 'utf8')
  for (const m of src.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm)) keys.add((m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
  for (const m of src.matchAll(/[,{]\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:\s*\[/g)) keys.add((m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
}
const files = ['Mobile.tsx', 'Calendar.tsx', 'Login.tsx', 'store.tsx', 'App.tsx'].map(f => new URL('../src/' + f, import.meta.url))
let missing = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\btr?\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    const k = (m[1] ?? m[2]).replace(/\\(.)/g, '$1')
    if (!keys.has(k)) { missing++; console.log(`${f.pathname.split('/').pop()}: ${k}`) }
  }
}
console.log(missing ? `\n${missing} ohne Übersetzung` : 'Alles übersetzt')
process.exit(missing ? 1 : 0)
