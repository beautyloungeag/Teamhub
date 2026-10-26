import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSlides, expandList, lead, planArticle, type SlideItem } from '../src/lib/wiki-slides.ts'

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

test('Fotos zwischen Schritten: Schrittfolge bleibt, jedes Foto gehört zu seinem Schritt', () => {
  const blocks = [{ t: 'p' as const, text: '**Vorbereitung** Kundin auf den Stuhl setzen' }, { t: 'img' as const, src: 'a.webp' },
    { t: 'p' as const, text: '**Nagelhaut entfernen** Fräser desinfizieren' }, { t: 'img' as const, src: 'b.webp' },
    { t: 'p' as const, text: '**Lackieren** Zügig arbeiten' }]
  const plan = planArticle(blocks)
  assert.equal(plan.mode, 'steps')
  assert.equal(plan.steps.length, 3)
  const items: SlideItem[] = plan.flow.flatMap((f): SlideItem[] => f.t === 'steps' && 'from' in f ? plan.steps.slice(f.from, f.to).map((step, j) => ({ k: 'step', step, no: f.from + j + 1 })) : f.t === 'check' ? [] : [{ k: 'block', b: f }])
  const s = buildSlides(items, { title: 'Pedicure' }, plan.steps.length)
  assert.deepEqual(s.map(x => [x.title, x.photo ?? null]), [['Pedicure', null], ['Vorbereitung', 'a.webp'], ['Nagelhaut entfernen', 'b.webp'], ['Lackieren', null]])
  assert.deepEqual(s.map(x => x.kicker?.k === 'step' ? x.kicker.no : 0), [0, 1, 2, 3])
})

test('Punkt mit Bild wird eigene Folie, Video kommt in den Banner, Hinweis bleibt auf seiner Folie (26.10.)', () => {
  const list = { t: 'ul' as const, items: ['Werkzeuge holen', 'Strom', 'Leitungen prüfen'], media: [{ t: 'img' as const, src: 'w.jpg' }, null, { t: 'video' as const, url: 'https://youtu.be/abcdefghijk' }] }
  const items: SlideItem[] = [b('h', 'Elektriker'), ...expandList(list, 'x'), { k: 'block', b: { t: 'quote', text: 'Nie ohne Handschuhe!' } },
    b('h', 'Video'), { k: 'block', b: { t: 'video', src: 'v.mp4' } }]
  const s = buildSlides(items, { title: 'Umbau' })
  // Überschrift ohne eigenen Inhalt wird Oberzeile der ersten Punkt-Folie
  // Jeder Punkt der Liste wird eine Folie, auch der ohne Bild; die leere Überschrift wird Oberzeile
  assert.deepEqual(s.map(x => [x.kind, x.title]), [['cover', 'Umbau'], ['photo', 'Werkzeuge holen'], ['photo', 'Strom'], ['photo', 'Leitungen prüfen'], ['section', 'Video']])
  assert.deepEqual(s[1].kicker, { k: 'text', text: 'Elektriker' })
  assert.equal(s[1].photo, 'w.jpg')
  assert.equal(s[2].photo, undefined)
  assert.deepEqual(s[3].video, { t: 'video', url: 'https://youtu.be/abcdefghijk' })
  assert.deepEqual(s[3].kicker, { k: 'video' })
  // Der Hinweis steht oben auf seiner Folie
  assert.deepEqual(s[3].body.map(x => x.k === 'block' ? x.b.t : x.k), ['quote'])
  assert.deepEqual(s[4].video, { t: 'video', src: 'v.mp4' })
  // Video nach einem Punkt bekommt das Thema, nicht den Punkt als Titel
  const t = buildSlides([b('h', 'Elektriker'), ...expandList(list, 'x'), { k: 'block', b: { t: 'video', url: 'https://youtu.be/zzzzzzzzzzz' } }], { title: 'Umbau' })
  assert.equal(t[t.length - 1].title, 'Elektriker')
})

test('langer erster Satz: Anfang im Balken, ganzer Text darunter', () => {
  const long = 'Wir montieren die Schienen gemeinsam mit dem Elektriker an der Decke und prüfen danach jede einzelne Lampe sorgfältig auf ihre Funktion, bevor wir den Strom wieder einschalten.'
  const l = lead(long)
  assert.ok(l.sub && l.sub.endsWith('…') && l.sub.length <= 125)
  assert.equal(l.rest, long)
})
