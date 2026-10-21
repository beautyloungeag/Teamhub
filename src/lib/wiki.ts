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

// Fünf Hauptbereiche statt 30 Themen (Wunsch der Inhaberin 21.10.). Behandlungen und Hygiene werden zusätzlich am Titel
// erkannt, weil das importierte Thema „Ablauf“ Behandlungen und Organisatorisches mischt.
export type Area = { key: string; name: string; desc: string; cats: string[] }
export const AREAS: Area[] = [
  { key: 'behandlung', name: 'Behandlungen & Protokolle', desc: 'Schritt-für-Schritt-Anleitungen und Standards', cats: ['behandlung', 'füsse', 'face', 'nägel', 'massage', 'body', 'how-to'] },
  { key: 'hygiene', name: 'Hygiene & Arbeitsplatz', desc: 'Desinfektion, Geräte, Reinigung und Sicherheit', cats: ['arbeitsplatz', 'gerät', 'hygiene'] },
  { key: 'studio', name: 'Studio & Abläufe', desc: 'Empfang, Kasse, Gutscheine, Bestellungen, Phorest', cats: ['ablauf', 'filialen', 'kasse', 'bestellung', 'gutschein', 'kunden', 'verkauf', 'marketing', 'allgemein', 'wichtig', 'büro'] },
  { key: 'team', name: 'Team & Personal', desc: 'Arbeitszeit, Ferien, Lohn, Regeln im Team', cats: ['mitarbeiter', 'arbeitszeit', 'frei', 'lohn', 'hr', 'reglement', 'versicherung'] },
  { key: 'lernen', name: 'Lernen & Ausbildung', desc: 'Lehre, Praktikum, Kurse und Leitfäden', cats: ['ausbildung', 'lehre', 'praktikum', 'leitfaden'] },
]
const TREATMENT = /manicure|pedicure|massage|lash|brow|glow|treatment|gesichtsbehandlung|bleaching|gel |shellack|wimpern|haarentfernung|kryolipolyse|tinting|waxing|wachs|peeling|microneedling|maniküre|pediküre/i
const HYGIENE = /hygiene|reinig|desinfek|putz|ämtli|entkalk|arbeitsschutz/i
export const areaOf = (cat: string, title: string): string =>
  HYGIENE.test(title) ? 'hygiene' : TREATMENT.test(title) ? 'behandlung' : AREAS.find(a => a.cats.includes(catKey(cat)))?.key ?? 'studio'
