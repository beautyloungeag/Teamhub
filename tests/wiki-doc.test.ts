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

test('Bild in einem Listenpunkt geht nicht verloren: das erste gehört zum Punkt, ein zweites teilt die Liste', () => {
  const li = (x: string, extra: object[] = []) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: x }] }, ...extra] })
  const img = (x: string) => ({ type: 'image', attrs: { path: `wiki/alle/${x}` } })
  const doc = { type: 'doc', content: [{ type: 'bulletList', content: [li('A'), li('B', [img('b.jpg'), img('c.jpg')]), li('C')] }] }
  assert.deepEqual(docToBlocks(doc), [{ t: 'ul', items: ['A', 'B'], media: [null, { t: 'img', src: 'wiki/alle/b.jpg' }] }, { t: 'img', src: 'wiki/alle/c.jpg' }, { t: 'ul', items: ['C'] }])
})

test('Bausteine → HTML für den Editor', () => {
  const html = blocksToHtml([{ t: 'p', text: '**fett** <b>' }, { t: 'img', src: 'wiki/alle/a.jpg' }, { t: 'file', src: 'wiki/alle/x.pdf', name: 'Plan.pdf' }], { 'wiki/alle/a.jpg': 'https://s' })
  assert.equal(html, '<p><strong>fett</strong> &lt;b&gt;</p><img src="https://s" data-path="wiki/alle/a.jpg"><div data-media="file" data-src="wiki/alle/x.pdf" data-name="Plan.pdf"></div>')
})

test('Bild oder Video am Aufzählungspunkt bleibt beim Punkt (26.10.)', () => {
  const p = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
  const doc = { type: 'doc', content: [{ type: 'bulletList', content: [
    { type: 'listItem', attrs: { m: 'img', src: 'wiki/alle/w.jpg', show: 'https://signed/w' }, content: [p('Werkzeuge')] },
    { type: 'listItem', content: [p('Strom')] },
    { type: 'listItem', attrs: { m: 'yt', url: 'https://youtu.be/abcdefghijk' }, content: [p('Leitungen')] },
    // Bild direkt im Punkt (eingefügt oder hineingezogen) gehört ebenfalls zum Punkt
    { type: 'listItem', content: [p('Schiene'), { type: 'image', attrs: { src: 'https://s', path: 'wiki/alle/s.jpg' } }] },
    // Hinweis im Punkt teilt die Liste
    { type: 'listItem', content: [p('Testen'), { type: 'blockquote', content: [p('Nie ohne Strom')] }] },
  ] }] }
  const bs = docToBlocks(doc as never)
  assert.deepEqual(bs, [
    { t: 'ul', items: ['Werkzeuge', 'Strom', 'Leitungen', 'Schiene', 'Testen'], media: [{ t: 'img', src: 'wiki/alle/w.jpg' }, null, { t: 'video', url: 'https://youtu.be/abcdefghijk' }, { t: 'img', src: 'wiki/alle/s.jpg' }, null] },
    { t: 'quote', text: 'Nie ohne Strom' },
  ])
  const html = blocksToHtml(bs, { 'wiki/alle/w.jpg': 'https://signed/w' })
  assert.match(html, /<li data-m="img" data-src="wiki\/alle\/w.jpg" data-show="https:\/\/signed\/w"><p>Werkzeuge<\/p><\/li><li><p>Strom<\/p><\/li><li data-m="yt" data-url="https:\/\/youtu.be\/abcdefghijk">/)
})
