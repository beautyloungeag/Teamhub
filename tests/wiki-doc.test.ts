import test from 'node:test'
import assert from 'node:assert/strict'
import { docToBlocks, textToHtml, hasListLines, blocksToHtml } from '../src/lib/wiki-doc.ts'

test('Klartext mit Aufzählungszeichen wird zu Listen', () => {
  const t = 'Vorbereitung\n\n• Licht\n• Kasse\n\n1. Termine\n2. Kabinen'
  assert.ok(hasListLines(t))
  assert.equal(textToHtml(t), '<p>Vorbereitung</p><ul><li><p>Licht</p></li><li><p>Kasse</p></li></ul><ol><li><p>Termine</p></li><li><p>Kabinen</p></li></ol>')
  assert.equal(textToHtml('·\tHandtücher\n·\tBoden'), '<ul><li><p>Handtücher</p></li><li><p>Boden</p></li></ul>')
  assert.ok(!hasListLines('*kursiv* am Anfang\nnormaler Satz'))
})

test('Editor-Inhalt wird zu Bausteinen, Formatierung bleibt', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Umbau' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Das ist ' }, { type: 'text', text: 'wichtig', marks: [{ type: 'bold' }] }, { type: 'text', text: ' und ' }, { type: 'text', text: 'hier', marks: [{ type: 'link', attrs: { href: 'https://x.ch' } }] }] },
    { type: 'paragraph' },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nie ohne Handschuhe' }] }] },
    { type: 'image', attrs: { src: 'https://signed', path: 'wiki/alle/a.jpg' } },
    { type: 'media', attrs: { kind: 'yt', url: 'https://youtu.be/abc' } },
  ] }
  assert.deepEqual(docToBlocks(doc), [
    { t: 'h', text: 'Umbau', level: 2 },
    { t: 'p', text: 'Das ist **wichtig** und [hier](https://x.ch)' },
    { t: 'quote', text: 'Nie ohne Handschuhe' },
    { t: 'img', src: 'wiki/alle/a.jpg' },
    { t: 'video', url: 'https://youtu.be/abc' },
  ])
})

test('Bild in einem Listenpunkt geht nicht verloren, die Liste wird geteilt', () => {
  const li = (x: string, extra: object[] = []) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: x }] }, ...extra] })
  const doc = { type: 'doc', content: [{ type: 'bulletList', content: [li('A'), li('B', [{ type: 'image', attrs: { path: 'wiki/alle/b.jpg' } }]), li('C')] }] }
  assert.deepEqual(docToBlocks(doc), [{ t: 'ul', items: ['A', 'B'] }, { t: 'img', src: 'wiki/alle/b.jpg' }, { t: 'ul', items: ['C'] }])
})

test('Bausteine → HTML für den Editor', () => {
  const html = blocksToHtml([{ t: 'p', text: '**fett** <b>' }, { t: 'img', src: 'wiki/alle/a.jpg' }, { t: 'file', src: 'wiki/alle/x.pdf', name: 'Plan.pdf' }], { 'wiki/alle/a.jpg': 'https://s' })
  assert.equal(html, '<p><strong>fett</strong> &lt;b&gt;</p><img src="https://s" data-path="wiki/alle/a.jpg"><div data-media="file" data-src="wiki/alle/x.pdf" data-name="Plan.pdf"></div>')
})
