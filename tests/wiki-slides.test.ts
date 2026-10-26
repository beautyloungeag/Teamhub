import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSlides, lead, type SlideItem } from '../src/lib/wiki-slides.ts'

const b = (t: 'h' | 'p' | 'img' | 'ul', x: string): SlideItem => ({ k: 'block', b: t === 'img' ? { t, src: x } : t === 'ul' ? { t, items: x.split(',') } : { t, text: x } })

test('Überschrift beginnt eine Folie, erstes Bild wird Folienfoto, kurzer Satz geht in den Balken', () => {
  const s = buildSlides([b('p', 'Einleitung.'), b('h', 'Vorbereitung'), b('img', 'a.webp'), b('p', 'Pad dicht ansetzen.'), b('p', 'Mehr Text.'), b('img', 'b.webp')], { title: 'Lash Lifting' }, 0)
  assert.deepEqual(s.map(x => x.kind), ['cover', 'section', 'photo'])
  assert.equal(s[0].body.length, 1)
  assert.equal(s[1].photo, 'a.webp')
  assert.equal(s[1].sub, 'Pad dicht ansetzen.')
  // kurzer Satz direkt vor dem zweiten Bild wird dessen Bildunterschrift
  assert.deepEqual(s[1].body, [])
  assert.equal(s[2].title, 'Mehr Text.')
  assert.deepEqual(s[2].kicker, { k: 'photo', no: 2, total: 2 })
})

test('leere Überschrift wird Oberzeile der nächsten Folie', () => {
  const s = buildSlides([b('h', 'Rabatte'), b('h', 'Ganze Behandlung'), b('img', 'x.webp')], { title: 'T' }, 0)
  assert.deepEqual(s.map(x => x.title), ['T', 'Ganze Behandlung'])
  assert.deepEqual(s[1].kicker, { k: 'text', text: 'Rabatte' })
})

test('Schritte werden einzelne Folien mit Zähler und Abhak-Schlüssel', () => {
  const items: SlideItem[] = [{ k: 'step', no: 1, step: { key: 'o0-0', title: 'Nagelhaut', text: null, parts: ['Farbkarte geben', 'Fräser desinfizieren'] } },
    { k: 'step', no: 2, step: { key: 'o0-1', title: null, text: 'Nägel kürzen. Immer vom kürzesten Nagel ausgehen und dann alle anderen anpassen, damit es gleichmässig wirkt.' } }]
  const s = buildSlides(items, { title: 'Pedicure' }, 2)
  assert.equal(s[1].sub, 'Farbkarte geben')
  assert.deepEqual(s[1].body, [{ k: 'parts', parts: ['Fräser desinfizieren'] }])
  assert.equal(s[2].title, 'Nägel kürzen.')
  assert.deepEqual(s[2].kicker, { k: 'step', no: 2, total: 2 })
  assert.equal(s[2].stepKey, 'o0-1')
})

test('lead schneidet am ersten Satz und hält Fettschrift ausgeglichen', () => {
  const l = lead('**Alle Instrumente** werden vor jedem Einsatz desinfiziert. Danach kommt ein sehr langer zweiter Satz, der eindeutig nicht mehr in den grauen Balken passt, weil er so lang ist und immer weiter geht.')
  assert.equal(l.sub, 'Alle Instrumente werden vor jedem Einsatz desinfiziert.')
  assert.match(l.rest, /^Danach/)
})

test('Materialliste mit Überschrift bekommt eine eigene Folie', () => {
  const s = buildSlides([{ k: 'check', key: 1, title: 'Arbeitsmaterialien', items: ['Fräser', 'Buffer'] }, b('h', 'Kundenempfang'), b('p', 'Freundlich begrüssen.')], { title: 'Pedicure' }, 0)
  assert.deepEqual(s.map(x => x.title), ['Pedicure', 'Arbeitsmaterialien', 'Kundenempfang'])
  assert.deepEqual(s[1].body, [{ k: 'check', key: 1, items: ['Fräser', 'Buffer'] }])
})
