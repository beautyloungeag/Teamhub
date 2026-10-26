import test from 'node:test'
import assert from 'node:assert/strict'
import { mdToBlocks, imagesOf } from '../supabase/functions/assistant/wiki-md.ts'

test('Marcs Markdown wird zu Bausteinen, Bilder an Punkten und vorhandene Bilder bleiben (26.10.)', () => {
  const old = [{ t: 'img', src: 'wiki/alle/a.jpg' }, { t: 'ul', items: ['x'], media: [{ t: 'img' as const, src: 'wiki/alle/b.jpg' }] }]
  assert.deepEqual(imagesOf(old), ['wiki/alle/a.jpg', 'wiki/alle/b.jpg'])
  const md = 'Kurze Einleitung.\n\n## Vorbereitung\n[[bild 1]]\n- Werkzeuge holen [[foto 1]]\n- Strom abschalten\n> Nie ohne Handschuhe.\n\n### Ablauf\n1. Schiene holen [[bild 2]]\n2. Testen\n[[video https://youtu.be/abcdefghijk]]'
  const { blocks, bad } = mdToBlocks(md, imagesOf(old))
  assert.deepEqual(bad, [])
  assert.deepEqual(blocks, [
    { t: 'p', text: 'Kurze Einleitung.' },
    { t: 'h', text: 'Vorbereitung', level: 2 },
    { t: 'img', src: 'wiki/alle/a.jpg' },
    { t: 'ul', items: ['Werkzeuge holen', 'Strom abschalten'], media: [{ t: 'img', src: 'staged:0' }, null] },
    { t: 'quote', text: 'Nie ohne Handschuhe.' },
    { t: 'h', text: 'Ablauf', level: 3 },
    { t: 'ol', items: ['Schiene holen', 'Testen'], media: [{ t: 'img', src: 'wiki/alle/b.jpg' }, null] },
    { t: 'video', url: 'https://youtu.be/abcdefghijk' },
  ])
  assert.deepEqual(mdToBlocks('[[bild 9]]').bad, ['[[bild 9]]'])
})
