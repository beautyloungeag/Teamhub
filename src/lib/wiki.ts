// Wissen: Emoji je Thema. Standard steht hier, das Büro kann es je Thema ändern (Tabelle wiki_categories).
export const CAT_EMOJI: Record<string, string> = {
  ablauf: '📋', allgemein: '📌', 'how-to': '💡', behandlung: '💆‍♀️', filialen: '📍', füsse: '🦶', arbeitsplatz: '🪑', gerät: '🔌',
  mitarbeiter: '👥', gutschein: '🎁', ausbildung: '🎓', arbeitszeit: '⏰', lehre: '📚', frei: '🌴', face: '✨', marketing: '📣',
  reglement: '📜', kunden: '🤝', büro: '🗂️', hr: '🪪', kasse: '💳', bestellung: '📦', lohn: '💰', verkauf: '🛍️', nägel: '💅',
  wichtig: '⭐', praktikum: '🧑‍🎓', massage: '🤲', body: '🧴', leitfaden: '🧭', versicherung: '🛡️', hygiene: '🧼', news: '📰',
}
export const catKey = (name: string) => name.trim().toLowerCase()
export const emojiOf = (name: string, custom: Record<string, string>) => custom[catKey(name)] ?? CAT_EMOJI[catKey(name)] ?? '📄'
// Auswahl im Backoffice: ruhige, eindeutige Zeichen für Studio-Themen
export const EMOJI_CHOICES = ['📋', '📌', '💡', '💆‍♀️', '📍', '🦶', '🪑', '🔌', '👥', '🎁', '🎓', '⏰', '📚', '🌴', '✨', '📣', '📜', '🤝', '🗂️', '🪪', '💳', '📦', '💰', '🛍️', '💅', '⭐', '🧑‍🎓', '🤲', '🧴', '🧭', '🛡️', '🧼', '📰', '💄', '🧖‍♀️', '🌿', '🧽', '🧾', '📞', '🔑', '🚪', '🧹', '🩺', '⚠️', '📅', '🏷️', '🖥️', '📷', '🎥', '❤️']

// Hauptbereiche statt 30 Themen (Wunsch der Inhaberin 21.10.). Seit 28.10. (Matteo) pflegt das Büro die Bereiche selbst
// (Tabelle wiki_areas) und kann jedes Thema einem Bereich zuordnen (wiki_categories.area_key). Ohne Zuordnung gilt die
// alte Regel: Behandlungen und Hygiene am Titel erkannt, sonst über die Liste der Standard-Themen.
export type Area = { key: string; name: string; desc: string; cats: string[]; icon: string; tone: string; access: 'alle' | 'filialleitung' | 'buero'; sort: number }
const DEFAULT_CATS: Record<string, string[]> = {
  behandlung: ['behandlung', 'füsse', 'face', 'nägel', 'massage', 'body', 'how-to'],
  hygiene: ['arbeitsplatz', 'gerät', 'hygiene'],
  studio: ['ablauf', 'filialen', 'kasse', 'bestellung', 'gutschein', 'kunden', 'verkauf', 'marketing', 'allgemein', 'wichtig', 'büro'],
  team: ['mitarbeiter', 'arbeitszeit', 'frei', 'lohn', 'hr', 'reglement', 'versicherung'],
  lernen: ['ausbildung', 'lehre', 'praktikum', 'leitfaden'],
}
export const AREAS: Area[] = [
  { key: 'behandlung', name: 'Behandlungen & Protokolle', desc: 'Schritt-für-Schritt-Anleitungen und Standards', cats: DEFAULT_CATS.behandlung, icon: 'sparkles', tone: 'learn', access: 'alle', sort: 10 },
  { key: 'hygiene', name: 'Hygiene & Arbeitsplatz', desc: 'Desinfektion, Geräte, Reinigung und Sicherheit', cats: DEFAULT_CATS.hygiene, icon: 'shield', tone: 'duty', access: 'alle', sort: 20 },
  { key: 'studio', name: 'Studio & Abläufe', desc: 'Empfang, Kasse, Gutscheine, Bestellungen, Phorest', cats: DEFAULT_CATS.studio, icon: 'layout', tone: 'note', access: 'alle', sort: 30 },
  { key: 'team', name: 'Team & Personal', desc: 'Arbeitszeit, Ferien, Lohn, Regeln im Team', cats: DEFAULT_CATS.team, icon: 'users', tone: 'plum', access: 'alle', sort: 40 },
  { key: 'lernen', name: 'Lernen & Ausbildung', desc: 'Lehre, Praktikum, Kurse und Leitfäden', cats: DEFAULT_CATS.lernen, icon: 'graduation', tone: 'done', access: 'alle', sort: 50 },
]
// Thema → Bereich, vom Büro gesetzt
const catArea = new Map<string, string>()
export type AreaRow = { key: string; name: string; description: string; icon: string; tone: string; access_level: Area['access']; sort: number }
/** Bereiche und Zuordnungen aus der Datenbank übernehmen (die Liste bleibt dasselbe Objekt, damit alle Importe mitziehen) */
export function setWikiStructure(rows: AreaRow[], cats: { key: string; area_key: string | null }[]) {
  if (rows.length) AREAS.splice(0, AREAS.length, ...[...rows].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map(r => ({ key: r.key, name: r.name, desc: r.description, cats: DEFAULT_CATS[r.key] ?? [], icon: r.icon, tone: r.tone, access: r.access_level, sort: r.sort })))
  catArea.clear()
  for (const c of cats) if (c.area_key && AREAS.some(a => a.key === c.area_key)) catArea.set(c.key, c.area_key)
}
export const assignedArea = (cat: string) => catArea.get(catKey(cat)) ?? null
const fallbackArea = () => AREAS.find(a => a.key === 'studio')?.key ?? AREAS[0]?.key ?? 'studio'
const TREATMENT = /manicure|pedicure|massage|lash|brow|glow|treatment|gesichtsbehandlung|bleaching|gel |shellack|wimpern|haarentfernung|kryolipolyse|tinting|waxing|wachs|peeling|microneedling|maniküre|pediküre/i
const HYGIENE = /hygiene|reinig|desinfek|putz|ämtli|entkalk|arbeitsschutz/i
const has = (k: string) => AREAS.some(a => a.key === k)
export const areaOf = (cat: string, title: string): string => catArea.get(catKey(cat))
  ?? (HYGIENE.test(title) && has('hygiene') ? 'hygiene' : TREATMENT.test(title) && has('behandlung') ? 'behandlung' : AREAS.find(a => a.cats.includes(catKey(cat)))?.key ?? fallbackArea())

// Suche, die auch andere Schreibweisen findet (28.10., Matteo: „Pediküre“ findet „Pedicure“ nicht).
// Beide Seiten werden auf eine Grundform gebracht: Umlaute und Akzente weg, c/k, ph/f, sch/sh/s, y/i, Doppelbuchstaben, einfache Endungen (-e, -en, -n, -s).
export function fold(x: string) {
  return x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/ß/g, 'ss')
    .replace(/sch|sh/g, 's').replace(/ph/g, 'f').replace(/th/g, 't').replace(/ck/g, 'k').replace(/qu/g, 'kw').replace(/c/g, 'k').replace(/z/g, 's').replace(/y/g, 'i').replace(/v/g, 'f').replace(/w/g, 'v')
    .replace(/[^a-z0-9]+/g, ' ').replace(/([a-z])\1+/g, '$1').split(' ').map(w => w.length > 5 ? w.replace(/(en|er|es|e|n|s)$/, '') : w.length > 4 ? w.replace(/e$/, '') : w).join(' ').trim()
}
const dist = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) return 2
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
/** Kommt jedes Suchwort im Text vor, auch in anderer Schreibweise oder mit einem Tippfehler (ab 5 Buchstaben)? */
export function fuzzyIncludes(text: string, query: string) {
  const q = fold(query).split(' ').filter(Boolean)
  if (!q.length) return true
  const hay = fold(text), words = hay.split(' ')
  return q.every(w => hay.includes(w) || (w.length >= 5 && words.some(x => x.length >= 4 && (dist(x.slice(0, w.length), w) <= 1 || dist(x, w) <= 1))))
}
